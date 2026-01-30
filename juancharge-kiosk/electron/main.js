import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import * as relayController from './relay_controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global reference to main window for event emission
let mainWindow = null;

// Initialize Database
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'juancharge.db');
console.log('Database path:', dbPath);

// Ensure DB directory exists
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

let db;
try {
  db = new Database(dbPath);
  console.log('Database connected successfully');
} catch (err) {
  console.error('Failed to connect to database:', err);
}

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    action TEXT,
    port INTEGER,
    start_time TEXT,
    end_time TEXT,
    total_points INTEGER DEFAULT 0,
    synced INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT,
    file_name TEXT,
    file_index INTEGER,
    item_type TEXT,
    points INTEGER,
    date TEXT,
    processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(file_name, file_index)
  );
  
  CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY, 
    transaction_id TEXT,
    points INTEGER,
    payload TEXT, 
    signature TEXT,
    status TEXT DEFAULT 'generated', 
    created_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS charging_sessions (
    id TEXT PRIMARY KEY,
    port INTEGER NOT NULL,
    points INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Register relay status change callback
relayController.setStatusChangeCallback((statuses) => {
  emitToRenderer('charging-status-changed', { statuses });
});

function createWindow() {
  const preloadPath = path.resolve(__dirname, 'preload.js');
  
  const win = new BrowserWindow({
    width: 800,
    height: 480,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      enableRemoteModule: false
    },
    fullscreen: false,
    autoHideMenuBar: true
  });

  // Store window reference for event emission
  mainWindow = win;

  // win.webContents.openDevTools();
  win.loadURL('http://localhost:5173');
}

// Helper to get current active transaction
function getActiveTransaction() {
  return db.prepare('SELECT * FROM transactions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1').get();
}

function createTransaction(action = 'initial', port = null) {
  const id = Date.now().toString();
  const startTime = new Date().toISOString();
  db.prepare('INSERT INTO transactions (id, action, port, start_time, total_points) VALUES (?, ?, ?, ?, 0)')
    .run(id, action, port, startTime);
  return id;
}

// IPC handler to get latest points
ipcMain.handle('get-latest-points', async () => {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const trackedJsonPath = path.join(projectRoot, 'Tracked_json');
    
    if (!fs.existsSync(trackedJsonPath)) {
      fs.mkdirSync(trackedJsonPath, { recursive: true });
    }
    
    // Get active transaction or create one
    let txn = getActiveTransaction();
    if (!txn) {
      const id = createTransaction();
      txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    }
    
    // Read JSON files
    const files = fs.readdirSync(trackedJsonPath)
      .filter(file => file.startsWith('tracked_items_') && file.endsWith('.json'));

    let newPointsAdded = 0;
    
    // Check global processed items
    // If file_name + file_index is in transaction_items, it's processed.
    
    for (const file of files) {
      const filePath = path.join(trackedJsonPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const items = JSON.parse(content);
        
        items.forEach((item, index) => {
           // efficient existence check using UNIQUE constraint or SELECT
           const exists = db.prepare('SELECT 1 FROM transaction_items WHERE file_name = ? AND file_index = ?').get(file, index);
           
           if (!exists) {
             const points = item.points || 0;
             newPointsAdded += points;
             
             db.prepare('INSERT INTO transaction_items (transaction_id, file_name, file_index, item_type, points, date) VALUES (?, ?, ?, ?, ?, ?)')
               .run(txn.id, file, index, item.item_type || 'unknown', points, item.date || new Date().toISOString());
           }
        });
      } catch (err) {
        console.error(`Error reading ${file}:`, err);
      }
    }
    
    if (newPointsAdded > 0) {
      db.prepare('UPDATE transactions SET total_points = total_points + ? WHERE id = ?')
        .run(newPointsAdded, txn.id);
      txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id);
    }
    
    return {
      points: txn.total_points,
      transactionId: txn.id,
      itemCount: 0, 
      unusedItemCount: 0
    };

  } catch (error) {
    console.error('Error reading points:', error);
    return { error: error.message, points: 0 };
  }
});

// IPC handler to reset points (create new transaction)
ipcMain.handle('reset-points', async (event, action = 'store', port = null) => {
  try {
    let txn = getActiveTransaction();
    let qrPayload = null;
    let pointsToStore = 0;

    if (txn) {
      // End current transaction
      db.prepare('UPDATE transactions SET end_time = ? WHERE id = ?')
        .run(new Date().toISOString(), txn.id);
      
      // Get FRESH total points just in case
      txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id);
      pointsToStore = txn.total_points;
      
      // If action is STORE and we have points, generate voucher
      if (action === 'store' && pointsToStore > 0) {
        const voucherId = crypto.randomUUID();
        const timestamp = Date.now();
        const kioskCode = process.env.KIOSK_CODE || 'KIOSK-001'; 
        const secret = process.env.KIOSK_SECRET_KEY || 'default_secret_key'; 
        
        // Payload matches backend expectations
        // Payload: kiosk_code + txn_id + points + timestamp
        const stringToSign = `${kioskCode}${voucherId}${pointsToStore}${timestamp}`;
        const signature = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');
        
        const payloadData = {
          kiosk_code: kioskCode,
          txn_id: voucherId,
          points: pointsToStore,
          timestamp: timestamp,
          signature: signature
        };

        const payloadJson = JSON.stringify(payloadData);
        
        // Save voucher to DB
        db.prepare('INSERT INTO vouchers (id, transaction_id, points, payload, signature, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(voucherId, txn.id, pointsToStore, payloadJson, signature, new Date().toISOString());
          
        qrPayload = payloadJson;
      }
    }
    
    // Start new transaction
    createTransaction(action, port);
    
    return { 
      success: true, 
      points: 0,
      qrData: qrPayload,
      storedPoints: pointsToStore
    };
  } catch (error) {
    console.error('Error resetting points:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler to activate charging
ipcMain.handle('activate-charging', async (event, { port, points }) => {
  try {
    // Validate input
    if (!port || ![1, 2, 3].includes(port)) {
      return { success: false, error: 'Invalid port number' };
    }
    
    if (!points || points <= 0) {
      return { success: false, error: 'Invalid points amount' };
    }
    
    // Check if port is already in use
    const portStatus = relayController.getRelayStatus(port);
    if (portStatus.active) {
      return { success: false, error: `Port ${port} is already in use` };
    }
    
    // Convert points to seconds (1 point = 60 seconds)
    const durationSeconds = points * 60;
    
    // Activate relay
    const result = await relayController.activateRelay(port, durationSeconds);
    
    if (!result.success) {
      return result;
    }
    
    // Create charging session record
    const sessionId = Date.now().toString();
    db.prepare(`
      INSERT INTO charging_sessions (id, port, points, duration_seconds, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(sessionId, port, points, durationSeconds, new Date().toISOString(), result.endTime);
    
    // Deduct points from active transaction
    const txn = getActiveTransaction();
    if (txn) {
      db.prepare('UPDATE transactions SET total_points = total_points - ? WHERE id = ?')
        .run(points, txn.id);
    }
    
    return {
      success: true,
      sessionId,
      port,
      points,
      durationSeconds,
      endTime: result.endTime
    };
  } catch (error) {
    console.error('Error activating charging:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler to get charging status for all ports
ipcMain.handle('get-charging-status', async () => {
  try {
    const statuses = relayController.getAllRelayStatuses();
    return { success: true, statuses };
  } catch (error) {
    console.error('Error getting charging status:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler for QR-based redemption
ipcMain.handle('redeem-points', async (event, { userId, points, timestamp }) => {
  try {
    // Validate input
    if (!userId || !points || !timestamp) {
      return { success: false, error: 'Invalid redemption data' };
    }
    if (points <= 0) {
      return { success: false, error: 'Points must be greater than 0' };
    }
    
    const redemptionId = Date.now().toString();
    const projectRoot = path.resolve(__dirname, '..');
    const redemptionsFile = path.join(projectRoot, 'redemptions.json');
    
    // Create redemption record for JSON file
    const redemptionRecord = {
      id: redemptionId,
      userId: userId,
      points: points,
      timestamp: new Date(timestamp).toISOString(),
      redeemedAt: new Date().toISOString()
    };
    
    // Read existing redemptions or create new array
    let redemptions = [];
    if (fs.existsSync(redemptionsFile)) {
      try {
        const fileContent = fs.readFileSync(redemptionsFile, 'utf-8');
        redemptions = JSON.parse(fileContent);
      } catch (err) {
        console.error('Error reading redemptions.json:', err);
        redemptions = [];
      }
    }
    
    // Add new redemption
    redemptions.push(redemptionRecord);
    
    // Save to JSON file
    fs.writeFileSync(redemptionsFile, JSON.stringify(redemptions, null, 2));
    console.log('Redemption saved to redemptions.json:', redemptionRecord);
    
    // Add points to active transaction
    let txn = getActiveTransaction();
    if (!txn) {
      const id = createTransaction('redeem');
      txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    }
    
    db.prepare('UPDATE transactions SET total_points = total_points + ? WHERE id = ?')
      .run(points, txn.id);
    
    // Get updated points
    txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id);
    
    return {
      success: true,
      redemptionId,
      newBalance: txn.total_points,
      pointsAdded: points
    };
  } catch (error) {
    console.error('Error redeeming points:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// FILE WATCHER FOR LIVE UPDATES
// ============================================

let fileWatcher = null;
let watcherDebounceTimer = null;

// Helper to emit events to renderer
function emitToRenderer(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
    console.log(`[EVENT] Emitted ${channel}:`, data);
  }
}

// Function to check for new points and emit event
async function checkAndEmitPointsUpdate() {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const trackedJsonPath = path.join(projectRoot, 'Tracked_json');
    
    if (!fs.existsSync(trackedJsonPath)) {
      return;
    }
    
    // Get active transaction or create one
    let txn = getActiveTransaction();
    if (!txn) {
      const id = createTransaction();
      txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    }
    
    const oldPoints = txn.total_points;
    
    // Read JSON files
    const files = fs.readdirSync(trackedJsonPath)
      .filter(file => file.startsWith('tracked_items_') && file.endsWith('.json'));

    let newPointsAdded = 0;
    
    for (const file of files) {
      const filePath = path.join(trackedJsonPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const items = JSON.parse(content);
        
        items.forEach((item, index) => {
          const exists = db.prepare('SELECT 1 FROM transaction_items WHERE file_name = ? AND file_index = ?').get(file, index);
          
          if (!exists) {
            const points = item.points || 0;
            newPointsAdded += points;
            
            db.prepare('INSERT INTO transaction_items (transaction_id, file_name, file_index, item_type, points, date) VALUES (?, ?, ?, ?, ?, ?)')
              .run(txn.id, file, index, item.item_type || 'unknown', points, item.date || new Date().toISOString());
          }
        });
      } catch (err) {
        console.error(`Error reading ${file}:`, err);
      }
    }
    
    if (newPointsAdded > 0) {
      db.prepare('UPDATE transactions SET total_points = total_points + ? WHERE id = ?')
        .run(newPointsAdded, txn.id);
      txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id);
      
      // Emit event to frontend
      emitToRenderer('points-updated', {
        points: txn.total_points,
        pointsAdded: newPointsAdded,
        transactionId: txn.id
      });
      
      console.log(`[POINTS UPDATE] +${newPointsAdded} points added. Total: ${txn.total_points}`);
    }
  } catch (error) {
    console.error('Error checking points update:', error);
  }
}

// Initialize file watcher
function initializeFileWatcher() {
  const projectRoot = path.resolve(__dirname, '..');
  const trackedJsonPath = path.join(projectRoot, 'Tracked_json');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(trackedJsonPath)) {
    fs.mkdirSync(trackedJsonPath, { recursive: true });
  }
  
  try {
    // Watch for changes in Tracked_json folder
    fileWatcher = fs.watch(trackedJsonPath, { recursive: false }, (eventType, filename) => {
      if (filename && filename.startsWith('tracked_items_') && filename.endsWith('.json')) {
        console.log(`[FILE WATCHER] Detected ${eventType} on ${filename}`);
        
        // Debounce to avoid multiple rapid checks
        if (watcherDebounceTimer) {
          clearTimeout(watcherDebounceTimer);
        }
        
        watcherDebounceTimer = setTimeout(() => {
          checkAndEmitPointsUpdate();
        }, 500); // Wait 500ms after last change
      }
    });
    
    console.log('[FILE WATCHER] Initialized for Tracked_json folder');
  } catch (error) {
    console.error('[FILE WATCHER] Failed to initialize:', error);
  }
}

// Sync Job (Run periodically)
setInterval(async () => {
    // Check if we have unsynced vouchers
    const vouchers = db.prepare("SELECT * FROM vouchers WHERE status = 'generated' LIMIT 50").all();
    
    if (vouchers.length > 0) {
        console.log(`Syncing ${vouchers.length} vouchers...`);
        // We need 'axios' or 'fetch' here. Node 18+ has fetch. Electron usually has it.
        try {
            const response = await fetch('http://localhost:8000/api/kiosk/vouchers/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kiosk_code: process.env.KIOSK_CODE || 'KIOSK-001',
                    transactions: vouchers.map(v => {
                        const payload = JSON.parse(v.payload);
                        return {
                            txn_id: payload.txn_id,
                            points: payload.points,
                            timestamp: payload.timestamp,
                            signature: payload.signature
                        };
                    })
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Sync result:', result);
                if (result.success) {
                    // Update status
                    const updateStmt = db.prepare("UPDATE vouchers SET status = 'synced' WHERE id = ?");
                    const transaction = db.transaction((ids) => {
                        for (const id of ids) updateStmt.run(id);
                    });
                     transaction(vouchers.map(v => v.id));
                }
            } else {
                console.error('Sync failed:', response.status, await response.text());
            }
        } catch (err) {
            console.error('Sync error (network?):', err.message);
        }
    }
}, 60000); // Check every minute

app.whenReady().then(() => {
  createWindow();
  // Initialize file watcher after window is created
  initializeFileWatcher();
});

app.on('window-all-closed', () => {
  // Cleanup file watcher
  if (fileWatcher) {
    fileWatcher.close();
    console.log('[FILE WATCHER] Closed');
  }
  
  // Cleanup relays before quitting
  relayController.cleanup();
  if (process.platform !== 'darwin') app.quit();
});
