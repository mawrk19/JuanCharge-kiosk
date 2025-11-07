const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ Preload script loaded and executing');

// Verify electron modules are available
if (!contextBridge) {
  console.error('❌ contextBridge is not available');
}
if (!ipcRenderer) {
  console.error('❌ ipcRenderer is not available');
}

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
      console.log('electronAPI.send called:', channel, data);
      return ipcRenderer.send(channel, data);
    },
    on: (channel, func) => {
      console.log('electronAPI.on called:', channel);
      return ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    invoke: (channel, data) => {
      console.log('electronAPI.invoke called:', channel, data);
      return ipcRenderer.invoke(channel, data);
    }
  });
  console.log('✅ electronAPI exposed to window successfully');
  console.log('window.electronAPI should now be available');
} catch (error) {
  console.error('❌ Error exposing electronAPI:', error);
  console.error('Error message:', error.message);
  console.error('Error stack:', error.stack);
}
