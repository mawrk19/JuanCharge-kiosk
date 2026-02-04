import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import * as relayController from './relay_controller.js';
import * as jose from 'jose';
import 'dotenv/config'; // Load env vars

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// KIOSK PRIVATE KEY
const PRIVATE_KEY_PEM = process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.replace(/\\n/g, '\n') : '';

if (!PRIVATE_KEY_PEM) {
  console.error("CRITICAL: PRIVATE_KEY not found in environment variables.");
}

// Global reference to main window for event emission
let mainWindow = null;

// API Configuration
const API_BASE_URL = process.env.API_BASE_URL;
const KIOSK_CODE = process.env.KIOSK_CODE;
const KIOSK_SECRET_KEY = process.env.KIOSK_SECRET_KEY;

// Helper: Generate HMAC SHA256 Signature
function generateSignature(dataString) {
  return crypto.createHmac('sha256', KIOSK_SECRET_KEY).update(dataString).digest('hex');
}

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

// IPC handler to get kiosk config
ipcMain.handle('get-kiosk-config', async () => {
  return {
    kiosk_code: KIOSK_CODE,
    api_base_url: API_BASE_URL
  };
});

// IPC handler to generate signed voucher (JWT)
ipcMain.handle('generate-signed-voucher', async (event, { amount }) => {
  try {
    // 1. Generate JWT Payload using HS256 (HMAC SHA256)
    // This allows us to use the KIOSK_SECRET_KEY directly and creates a much smaller token
    // suitable for low-quality QR scanning.

    const voucherId = crypto.randomUUID();
    const timestamp = Date.now();
    const secretKey = new TextEncoder().encode(KIOSK_SECRET_KEY);

    // We include the "signature" field inside the JWT payload itself to match schema
    // even though the JWT itself is also signed.
    const stringToSign = `${KIOSK_CODE}${voucherId}${amount}${timestamp}`;
    const innerSignature = generateSignature(stringToSign);

    const jwt = await new jose.SignJWT({
      action: 'store_points',
      kiosk_code: KIOSK_CODE,
      txn_id: voucherId,
      points: amount,
      timestamp: timestamp,
      signature: innerSignature, // HMAC signature inside JWT
      nonce: crypto.randomUUID()
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('kiosk-01')
      .setExpirationTime('2h')
      .sign(secretKey);

    console.log('[QR] Generated HS256 JWT Voucher:', amount);

    // 2. Consume points locally (Close transaction & Save Voucher)
    let txn = getActiveTransaction();
    if (txn) {
      // End current transaction
      db.prepare('UPDATE transactions SET end_time = ? WHERE id = ?')
        .run(new Date().toISOString(), txn.id);

      // Save voucher record to DB
      db.prepare('INSERT INTO vouchers (id, transaction_id, points, payload, signature, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(voucherId, txn.id, amount, jwt, innerSignature, new Date().toISOString());
    }

    // 3. Start new transaction (Zero points)
    createTransaction('store_points');

    return { success: true, token: jwt };
  } catch (error) {
    console.error('Error generating signed voucher:', error);
    return { success: false, error: error.message };
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

// IPC handler to deactivate/cancel charging
ipcMain.handle('deactivate-charging', async (event, { port }) => {
  try {
    // Validate input
    if (!port || ![1, 2, 3].includes(port)) {
      return { success: false, error: 'Invalid port number' };
    }

    // Check if port is active
    const portStatus = relayController.getRelayStatus(port);
    if (!portStatus.active) {
      return { success: false, error: `Port ${port} is not active` };
    }

    // Deactivate relay
    const result = relayController.deactivateRelay(port, false); // false = manual deactivation

    if (!result.success) {
      return result;
    }

    // Update charging session status in database
    db.prepare(`
      UPDATE charging_sessions 
      SET status = 'cancelled', end_time = ? 
      WHERE port = ? AND status = 'active'
    `).run(new Date().toISOString(), port);

    return {
      success: true,
      port,
      message: 'Charging session cancelled'
    };
  } catch (error) {
    console.error('Error deactivating charging:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler for QR-based redemption
ipcMain.handle('redeem-points', async (event, { userId, points, timestamp }) => {
  try {
    // Validate input
    if (!userId || !points) {
      return { success: false, error: 'Invalid redemption data' };
    }
    if (points <= 0) {
      return { success: false, error: 'Points must be greater than 0' };
    }

    // 1. Online Validation
    try {
      const ts = timestamp || Date.now();
      const stringToSign = `${KIOSK_CODE}${userId}${points}${ts}`;
      const signature = generateSignature(stringToSign);

      const payload = {
        kiosk_code: KIOSK_CODE,
        user_id: userId,
        points_to_redeem: points,
        timestamp: ts,
        signature: signature
      };

      console.log('[REDEEM] Sending payload:', JSON.stringify(payload));

      const response = await fetch(`${API_BASE_URL}/kiosk/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Online redemption failed:', response.status, errText);
        return { success: false, error: `Redemption Failed: ${response.statusText}` };
      }

      const remoteResult = await response.json();
      if (!remoteResult.success) {
        return { success: false, error: remoteResult.error || 'Server rejected redemption' };
      }

      // Success online! Proceed to record locally for offline usage/logs
      // Note: We might trust the backend's new_balance return, or just add points locally as before.
      // For consistency with current frontend, we add points locally.

    } catch (netErr) {
      console.error('Network error during redemption:', netErr);
      // OPTIONAL: Allow offline fallback if policy permits. 
      // For now, assume STRICT online requirement for redemption security.
      return { success: false, error: 'Network Error: Cannot validate points online.' };
    }

    // 2. Local Processing (Legacy/Offline Log)
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
    try {
      const txnsPayload = vouchers.map(v => {
        // Payload is now a JWT string. We need to decode it to get the payload data.
        // Since we are trusted (server signed it), we can simply decode the payload part.
        const tokenParts = v.payload.split('.');
        const payloadBase64 = tokenParts[1];
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString();
        const payload = JSON.parse(payloadJson);

        return {
          txn_id: payload.txn_id,
          points: payload.points,
          timestamp: payload.timestamp,
          signature: payload.signature // Reuse existing valid signature
        };
      });

      const response = await fetch(`${API_BASE_URL}/kiosk/vouchers/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kiosk_code: KIOSK_CODE,
          transactions: txnsPayload
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

// ============================================
// HEARTBEAT JOB (Every 5 seconds for responsive remote commands)
// ============================================
setInterval(async () => {
  try {
    const statuses = relayController.getAllRelayStatuses();
    const portsPayload = statuses.map((p, index) => ({
      port: index + 1,
      status: p.active ? 'active' : 'idle'
    }));

    const payload = {
      kiosk_code: KIOSK_CODE,
      status: 'online',
      ports: portsPayload
    };

    const response = await fetch(`${API_BASE_URL}/kiosk/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();

      // Handle Remote Activations (Seamless Port Activation)
      if (data && data.pending_activations && Array.isArray(data.pending_activations)) {
        for (const activation of data.pending_activations) {
          const { port, points, duration_seconds } = activation;

          console.log(`[REMOTE ACTIVATION] Received for Port ${port} - ${points} pts`);

          // Only activate if not already active to avoid double activation
          const currentStatus = statuses[port - 1];
          if (currentStatus && !currentStatus.active) {
            const activationResult = await relayController.activateRelay(port, duration_seconds || (points * 60));

            if (activationResult.success) {
              console.log(`[REMOTE ACTIVATION] Successfully started Port ${port}`);

              // Create transaction record for audit
              createTransaction('remote_activation', port);

              // Emit to frontend to show charging state if needed
              emitToRenderer('charging-status-changed', {
                statuses: relayController.getAllRelayStatuses()
              });
            }
          }
        }
      }
    } else {
      console.error(`[HEARTBEAT] Failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('[HEARTBEAT] Error:', error.message);
  }
}, 5000); // 5 seconds

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
