// server/add_fileurl_column.js
const sqlite3 = require('sqlite3');
const path = require('path');

const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'samkitec.sqlite');
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run('ALTER TABLE documents ADD COLUMN file_url TEXT', function (err) {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✅ file_url column already exists');
      } else {
        console.error('❌ Error adding file_url column:', err.message);
      }
    } else {
      console.log('✅ file_url column added successfully');
    }
    db.close();
  });
});