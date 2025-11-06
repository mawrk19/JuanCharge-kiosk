import axios from 'axios';
import db from '../db/localDB.js';

const apiUrl = 'https://your-laravel-backend.com/api/sync-transactions';

export async function syncTransactions() {
  const unsynced = db.prepare('SELECT * FROM transactions WHERE synced = 0').all();

  if (unsynced.length === 0) return;

  try {
    const response = await axios.post(apiUrl, { transactions: unsynced });
    if (response.data.status === 'success') {
      const ids = response.data.synced_ids;
      const stmt = db.prepare('UPDATE transactions SET synced = 1 WHERE id = ?');
      ids.forEach(id => stmt.run(id));
    }
  } catch (err) {
    console.error('Sync failed:', err.message);
  }
}
