import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  // Use absolute path for preload script
  const preloadPath = path.resolve(__dirname, 'preload.js');
  console.log('=== Creating Window ===');
  console.log('__dirname:', __dirname);
  console.log('Preload script path:', preloadPath);
  console.log('Preload script exists:', fs.existsSync(preloadPath));
  
  if (!fs.existsSync(preloadPath)) {
    console.error('❌ ERROR: Preload script not found at:', preloadPath);
    // Try alternative path
    const altPath = path.join(process.cwd(), 'electron', 'preload.js');
    console.log('Trying alternative path:', altPath);
    console.log('Alternative exists:', fs.existsSync(altPath));
  }
  
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow loading from localhost
      enableRemoteModule: false
    },
    fullscreen: false,
    autoHideMenuBar: true
  });

  // Open DevTools for debugging
  win.webContents.openDevTools();

  // Log preload script errors
  win.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('❌ Preload script error:', preloadPath, error);
    console.error('Error details:', error.message, error.stack);
  });
  
  // Log when preload script finishes loading
  win.webContents.on('did-attach-webview', () => {
    console.log('Webview attached');
  });

  // Load Vue (Vite dev or build)
  win.loadURL('http://localhost:5173');
  
  // Log when page is loaded
  win.webContents.on('did-finish-load', () => {
    console.log('✅ Page finished loading');
    // Wait a bit for preload to finish, then check multiple times
    const checkAPI = (attempt = 1) => {
      setTimeout(() => {
        // Try to execute script to check if electronAPI is available
        win.webContents.executeJavaScript(`
          (function() {
            console.log('=== Checking electronAPI from main process (attempt ${attempt}) ===');
            console.log('window.electronAPI:', window.electronAPI);
            console.log('typeof window.electronAPI:', typeof window.electronAPI);
            if (window.electronAPI) {
              console.log('✅ electronAPI found!');
              console.log('electronAPI.invoke:', typeof window.electronAPI.invoke);
              return 'API available';
            } else {
              console.log('❌ electronAPI NOT found');
              console.log('Available window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('electron')));
              return 'API NOT available';
            }
          })();
        `).then(result => {
          console.log(`Attempt ${attempt} - Result from page:`, result);
          if (result === 'API NOT available' && attempt < 5) {
            checkAPI(attempt + 1);
          }
        }).catch(err => {
          console.error(`Attempt ${attempt} - Error executing script:`, err);
          if (attempt < 5) {
            checkAPI(attempt + 1);
          }
        });
      }, 500 * attempt);
    };
    checkAPI(1);
  });
  
  // Also check on DOM ready
  win.webContents.on('dom-ready', () => {
    console.log('✅ DOM ready');
  });
  
  // Check console messages from renderer
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (message.includes('Preload') || message.includes('electronAPI')) {
      console.log(`[Renderer ${level}]:`, message);
    }
  });
}

// IPC handler to get latest points from Tracked_json folder
ipcMain.handle('get-latest-points', async () => {
  try {
    // Use path relative to the project root (where package.json is)
    const projectRoot = path.resolve(__dirname, '..');
    const trackedJsonPath = path.join(projectRoot, 'Tracked_json');
    console.log('IPC handler called: get-latest-points');
    console.log('Project root:', projectRoot);
    console.log('Reading from path:', trackedJsonPath);
    
    // Check if directory exists, create it if it doesn't
    if (!fs.existsSync(trackedJsonPath)) {
      console.log(`Directory not found, creating: ${trackedJsonPath}`);
      try {
        fs.mkdirSync(trackedJsonPath, { recursive: true });
        console.log('Directory created successfully');
      } catch (mkdirError) {
        console.error(`Failed to create directory: ${mkdirError.message}`);
        return { error: `Directory not found and could not be created: ${trackedJsonPath}`, points: 0 };
      }
    }
    
    // Read all JSON files matching the pattern tracked_items_YYYY-MM-DD.json
    const files = fs.readdirSync(trackedJsonPath)
      .filter(file => {
        // Match files like tracked_items_2025-11-07.json
        return file.startsWith('tracked_items_') && file.endsWith('.json');
      })
      .map(file => {
        const filePath = path.join(trackedJsonPath, file);
        const stats = fs.statSync(filePath);
        // Extract date from filename (tracked_items_YYYY-MM-DD.json)
        const dateMatch = file.match(/tracked_items_(\d{4}-\d{2}-\d{2})\.json/);
        const fileDate = dateMatch ? dateMatch[1] : null;
        
        return {
          name: file,
          path: filePath,
          mtime: stats.mtime,
          fileDate: fileDate
        };
      });
    
    if (files.length === 0) {
      return { error: `No tracked_items_*.json files found in ${trackedJsonPath}`, points: 0 };
    }
    
    // Sort by modification time (most recent first), then by filename date as fallback
    files.sort((a, b) => {
      // First sort by modification time
      if (b.mtime.getTime() !== a.mtime.getTime()) {
        return b.mtime - a.mtime;
      }
      // If modification times are equal, sort by date in filename (most recent first)
      if (a.fileDate && b.fileDate) {
        return b.fileDate.localeCompare(a.fileDate);
      }
      return 0;
    });
    const latestFile = files[0];
    console.log(`Found latest file: ${latestFile.name} (modified: ${latestFile.mtime})`);
    
    // Read and parse the latest JSON file
    const fileContent = fs.readFileSync(latestFile.path, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    console.log(`Parsed JSON file with ${jsonData.length} items`);
    
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return { error: 'Invalid JSON format or empty array', points: 0 };
    }
    
    // Get current transaction - points come from transaction, not JSON calculation
    const transactionData = loadTransactions();
    const currentTransaction = transactionData.currentTransactionId 
      ? transactionData.transactions.find(t => t.id === transactionData.currentTransactionId)
      : null;
    
    // If no transaction exists, create one automatically
    if (!currentTransaction) {
      console.log('No transaction exists, creating initial transaction...');
      const newTransactionId = Date.now().toString();
      const newTransaction = {
        id: newTransactionId,
        action: 'initial',
        port: null,
        startTime: new Date().toISOString(),
        endTime: null,
        usedItems: [],
        totalPoints: 0
      };
      transactionData.transactions.push(newTransaction);
      transactionData.currentTransactionId = newTransactionId;
      saveTransactions(transactionData);
      console.log('Initial transaction created:', newTransactionId);
    }
    
    // Get the current transaction (or the one we just created)
    const activeTransaction = transactionData.transactions.find(
      t => t.id === transactionData.currentTransactionId
    );
    
    // Create a set of used item identifiers (fileName:index)
    const usedItems = new Set();
    if (activeTransaction && activeTransaction.usedItems) {
      activeTransaction.usedItems.forEach(item => {
        usedItems.add(`${item.fileName}:${item.index}`);
      });
    }
    
    // Check for new unused items in the JSON file and add their points to transaction
    let newItemsFound = 0;
    let newPointsAdded = 0;
    const newUsedItems = [];
    
    jsonData.forEach((item, index) => {
      const itemKey = `${latestFile.name}:${index}`;
      
      // If this item hasn't been used yet, add it to the transaction
      if (!usedItems.has(itemKey)) {
        const itemPoints = item.points || 0;
        newPointsAdded += itemPoints;
        newItemsFound++;
        
        // Mark this item as used
        newUsedItems.push({
          fileName: latestFile.name,
          index: index,
          date: item.date,
          itemType: item.item_type,
          points: itemPoints
        });
      }
    });
    
    // Update transaction with new items and points
    if (newItemsFound > 0) {
      activeTransaction.usedItems.push(...newUsedItems);
      activeTransaction.totalPoints += newPointsAdded;
      saveTransactions(transactionData);
      console.log(`Added ${newItemsFound} new items, ${newPointsAdded} points to transaction ${activeTransaction.id}`);
    }
    
    // Return points from transaction, not from JSON calculation
    const pointsFromTransaction = activeTransaction ? activeTransaction.totalPoints : 0;
    
    console.log(`Transaction points: ${pointsFromTransaction} (from transaction ${activeTransaction.id})`);
    
    const result = {
      points: pointsFromTransaction,
      date: latestFile.name, // Just for reference
      itemType: 'Transaction',
      fileName: latestFile.name,
      itemCount: jsonData.length,
      unusedItemCount: jsonData.length - usedItems.size,
      fileModifiedTime: latestFile.mtime.getTime(),
      hasActiveTransaction: !!activeTransaction,
      transactionId: activeTransaction ? activeTransaction.id : null
    };
    
    console.log('Returning result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error reading points:', error);
    console.error('Error stack:', error.stack);
    return { error: error.message, points: 0 };
  }
});

// Transaction file path
function getTransactionsPath() {
  const projectRoot = path.resolve(__dirname, '..');
  return path.join(projectRoot, 'transactions.json');
}

// Load transactions from file
function loadTransactions() {
  const transactionsPath = getTransactionsPath();
  if (fs.existsSync(transactionsPath)) {
    try {
      const content = fs.readFileSync(transactionsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Error loading transactions:', error);
      return { transactions: [], currentTransactionId: null };
    }
  }
  return { transactions: [], currentTransactionId: null };
}

// Save transactions to file
function saveTransactions(data) {
  const transactionsPath = getTransactionsPath();
  try {
    fs.writeFileSync(transactionsPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving transactions:', error);
  }
}

// Get current active transaction
function getCurrentTransaction() {
  const data = loadTransactions();
  if (data.currentTransactionId) {
    return data.transactions.find(t => t.id === data.currentTransactionId);
  }
  return null;
}

// IPC handler to reset points (create new transaction)
ipcMain.handle('reset-points', async (event, action = 'store', port = null) => {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const trackedJsonPath = path.join(projectRoot, 'Tracked_json');
    
    // Load current transactions
    const transactionData = loadTransactions();
    
    // End current transaction if exists
    if (transactionData.currentTransactionId) {
      const currentTransaction = transactionData.transactions.find(
        t => t.id === transactionData.currentTransactionId
      );
      if (currentTransaction) {
        currentTransaction.endTime = new Date().toISOString();
        console.log('Ended transaction:', currentTransaction.id);
      }
    }
    
    // Get all files and mark all current items as used
    const files = fs.readdirSync(trackedJsonPath)
      .filter(file => file.startsWith('tracked_items_') && file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(trackedJsonPath, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          mtime: stats.mtime
        };
      });
    
    const usedItems = [];
    
    if (files.length > 0) {
      files.sort((a, b) => b.mtime - a.mtime);
      
      // Mark all items in all files as used
      files.forEach(file => {
        try {
          const fileContent = fs.readFileSync(file.path, 'utf-8');
          const jsonData = JSON.parse(fileContent);
          
          jsonData.forEach((item, index) => {
            usedItems.push({
              fileName: file.name,
              index: index,
              date: item.date,
              itemType: item.item_type,
              points: item.points || 0
            });
          });
        } catch (error) {
          console.error(`Error reading file ${file.name}:`, error);
        }
      });
    }
    
    // Create new transaction starting at 0 points
    const newTransactionId = Date.now().toString();
    const newTransaction = {
      id: newTransactionId,
      action: action, // 'store' or 'use'
      port: port,
      startTime: new Date().toISOString(),
      endTime: null,
      usedItems: usedItems, // All current items are marked as used
      totalPoints: 0 // New transaction starts at 0, will accumulate from new items only
    };
    
    transactionData.transactions.push(newTransaction);
    transactionData.currentTransactionId = newTransactionId;
    
    // Save transactions
    saveTransactions(transactionData);
    
    console.log(`New transaction created: ${newTransactionId}, Action: ${action}, Port: ${port}`);
    console.log(`Marked ${usedItems.length} items as used, transaction starts at 0 points`);
    
    return { 
      success: true, 
      transactionId: newTransactionId,
      usedItemsCount: usedItems.length,
      points: 0 // New transaction always starts at 0
    };
  } catch (error) {
    console.error('Error resetting points:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
