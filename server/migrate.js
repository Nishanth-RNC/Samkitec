const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');
const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'samkitec.sqlite');

// ensure folder
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    original_name TEXT,
    stored_name TEXT,
    mime_type TEXT,
    size INTEGER,
    upload_date TEXT,
    title TEXT,
    description TEXT
  )`);
});

console.log('Migration complete — DB file:', DB_FILE);
 db.close();