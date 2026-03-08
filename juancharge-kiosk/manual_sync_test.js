
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import axios from 'axios';
import crypto from 'crypto';
import 'dotenv/config';

// 1. Setup local DB connection
const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'juancharge-kiosk');
const dbPath = path.join(userDataPath, 'juancharge.db');
const db = new Database(dbPath);

const KIOSK_CODE = process.env.KIOSK_CODE || 'UCC-Kiosk-0001';
const KIOSK_SECRET_KEY = process.env.KIOSK_SECRET_KEY || 'default_secret_key';
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api';

function generateSignature(dataString) {
  return crypto.createHmac('sha256', KIOSK_SECRET_KEY).update(dataString).digest('hex');
}

async function testSync() {
    console.log('--- SYNC TEST START ---');
    console.log('Using DB:', dbPath);
    
    // Check for unsynced transactions
    const unsynced = db.prepare('SELECT * FROM transactions WHERE synced = 0 AND end_time IS NOT NULL').all();
    console.log(`Found ${unsynced.length} unsynced, finished transactions.`);

    if (unsynced.length === 0) {
        // Manually finish the current transaction for testing
        const current = db.prepare('SELECT * FROM transactions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1').get();
        if (current) {
            console.log(`Finishing current transaction ${current.id} for testing...`);
            db.prepare('UPDATE transactions SET end_time = ? WHERE id = ?').run(new Date().toISOString(), current.id);
            unsynced.push(db.prepare('SELECT * FROM transactions WHERE id = ?').get(current.id));
        } else {
            console.log('No transactions found. Please run the Kiosk and scan something first.');
            return;
        }
    }

    const payload = {
        transactions: unsynced.map(txn => ({
            transaction_id: txn.id,
            kiosk_code: KIOSK_CODE,
            scanned_at: txn.start_time,
            points: txn.total_points || 0
        }))
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateSignature(payloadString);

    const url = `${API_BASE_URL}/kiosk/recycling-logs/sync`;
    console.log(`Sending to: ${url}`);
    
    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Kiosk-Signature': signature,
                'Accept': 'application/json'
            }
        });

        console.log('--- SERVER RESPONSE ---');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));

        if (response.status === 200 || response.status === 201) {
            console.log('SUCCESS: Data pushed to MySQL.');
        }
    } catch (error) {
        console.error('--- SYNC TEST FAILED ---');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Body:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testSync().then(() => db.close());
