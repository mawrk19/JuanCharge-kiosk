
export async function syncTransactions() {
  if (!window.electronAPI) {
    console.warn('Sync service: Electron API not available');
    return;
  }

  try {
    console.log('Initiating transaction sync...');
    const result = await window.electronAPI.invoke('sync-transactions');
    
    if (result.success) {
      console.log(`Sync completed successfully. Synced ${result.count || 0} transactions.`);
      return result;
    } else {
      console.error('Sync failed:', result.error, result.details);
      // throw new Error(result.error); // Optional: rethrow if caller handles it
    }
  } catch (err) {
    console.error('Sync service error:', err);
  }
}

