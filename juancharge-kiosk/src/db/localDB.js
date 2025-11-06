import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'juancharge-local.db');

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '');
}

const db = new Database(dbPath);

// Table for offline transactions
db.prepare(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT,
    points INTEGER,
    port INTEGER,
    timestamp TEXT,
    synced INTEGER DEFAULT 0
  )
`).run();

export default db;
