// server/index.js (Updated to use Cloudinary)
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const PORT = process.env.PORT || 4000;
const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'samkitec.sqlite');
const db = new sqlite3.Database(DB_FILE);

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Ensure table exists
const createTable = () => {
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    original_name TEXT,
    file_url TEXT,
    mime_type TEXT,
    size INTEGER,
    upload_date TEXT,
    title TEXT,
    description TEXT,
    doc_type TEXT
  )`);
};
createTable();

const app = express();
app.use(cors());
app.use(express.json());

// Multer Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'samkitec_reports',
    resource_type: 'auto',
  },
});
const upload = multer({ storage });

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const id = uuidv4();
    const meta = {
      id,
      original_name: req.file.originalname,
      file_url: req.file.path,
      mime_type: req.file.mimetype,
      size: req.file.size || 0,
      upload_date: new Date().toISOString(),
      title: req.body.title || req.file.originalname,
      description: req.body.description || '',
      doc_type: req.body.doc_type || 'process',
    };

    db.run(
      `INSERT INTO documents (id, original_name, file_url, mime_type, size, upload_date, title, description, doc_type)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [meta.id, meta.original_name, meta.file_url, meta.mime_type, meta.size, meta.upload_date, meta.title, meta.description, meta.doc_type],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json(meta);
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List/Search endpoint
app.get('/api/documents', (req, res) => {
  const { search = '', from, to, type, limit = 100, offset = 0 } = req.query;
  let where = [];
  const params = [];

  if (search) {
    where.push('(original_name LIKE ? OR title LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (from) {
    where.push('date(upload_date) >= date(?)');
    params.push(from);
  }
  if (to) {
    where.push('date(upload_date) <= date(?)');
    params.push(to);
  }
  if (type === 'process' || type === 'work') {
    where.push('doc_type = ?');
    params.push(type);
  }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT id, original_name, file_url, title, description, mime_type, size, upload_date, doc_type
               FROM documents ${whereSQL} ORDER BY upload_date DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Delete document
app.delete('/api/documents/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM documents WHERE id = ?', [id], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });

    try {
      // Extract public_id from Cloudinary URL
      const publicId = row.file_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`samkitec_reports/${publicId}`, { resource_type: 'auto' });
    } catch (e) {
      console.error('Cloudinary delete error:', e.message);
    }

    db.run('DELETE FROM documents WHERE id = ?', [id], function (dbErr) {
      if (dbErr) return res.status(500).json({ error: dbErr.message });
      res.json({ success: true });
    });
  });
});

app.get('/', (req, res) => res.send('Samkitec backend running with Cloudinary uploads'));
app.listen(PORT, () => console.log(`Samkitec Cloudinary server listening on ${PORT}`));
