import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const trackedJsonPath = path.join(__dirname, 'Tracked_json');

if (!fs.existsSync(trackedJsonPath)) {
    fs.mkdirSync(trackedJsonPath, { recursive: true });
}

const timestamp = Date.now();
const filename = `tracked_items_fake_${timestamp}.json`;
const filePath = path.join(trackedJsonPath, filename);

const fakeData = [
    {
        item_type: 'plastic_bottle',
        points: 10,
        date: new Date().toISOString()
    },
    {
        item_type: 'can',
        points: 15,
        date: new Date().toISOString()
    },
    {
        item_type: 'glass_bottle',
        points: 20,
        date: new Date().toISOString()
    }
];

fs.writeFileSync(filePath, JSON.stringify(fakeData, null, 2));

console.log(`Generated fake points file: ${filename}`);
console.log(`Containing ${fakeData.length} items with total ${fakeData.reduce((acc, item) => acc + item.points, 0)} points.`);
