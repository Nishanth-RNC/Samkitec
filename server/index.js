require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

const PORT = process.env.PORT || 4000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'samkitec.sqlite');
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 20_000_000); // 20MB default

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new sqlite3.Database(DB_FILE);

// Ensure table exists (defensive)
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

const app = express();
app.use(cors());
app.use(express.json());

// Multer config — store files with uuid names
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    // Accept pdf and docx only (you can extend this)
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PDF/DOC/DOCX allowed'));
    }
    cb(null, true);
  }
});

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const id = uuidv4();
    const meta = {
      id,
      original_name: req.file.originalname,
      stored_name: req.file.filename,
      mime_type: req.file.mimetype,
      size: req.file.size,
      upload_date: new Date().toISOString(),
      title: req.body.title || req.file.originalname,
      description: req.body.description || ''
    };
    db.run(
      `INSERT INTO documents (id, original_name, stored_name, mime_type, size, upload_date, title, description) VALUES (?,?,?,?,?,?,?,?)`,
      [meta.id, meta.original_name, meta.stored_name, meta.mime_type, meta.size, meta.upload_date, meta.title, meta.description],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json(meta);
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List / search endpoint
// Query params: search (partial name/title), from (YYYY-MM-DD), to (YYYY-MM-DD), limit, offset
app.get('/api/documents', (req, res) => {
  const { search = '', from, to, limit = 100, offset = 0 } = req.query;
  let where = [];
  const params = [];
  if (search) {
    where.push("(original_name LIKE ? OR title LIKE ?)");
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
  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT id, original_name, title, description, mime_type, size, upload_date FROM documents ${whereSQL} ORDER BY upload_date DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Download (stream)
app.get('/api/documents/:id/download', (req, res) => {
  const id = req.params.id;
  db.get('SELECT stored_name, original_name, mime_type FROM documents WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(UPLOAD_DIR, row.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${row.original_name.replace(/\"/g,'') }"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// Delete
app.delete('/api/documents/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT stored_name FROM documents WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(UPLOAD_DIR, row.stored_name);
    fs.unlink(filePath, (unlinkErr) => {
      // remove DB row even if file didn't exist
      db.run('DELETE FROM documents WHERE id = ?', [id], function (dbErr) {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        res.json({ success: true });
      });
    });
  });
});

// Modify metadata or replace file. If `file` in multipart, replace file on disk.
const replaceUpload = upload.single('file');
app.put('/api/documents/:id', (req, res) => {
  // allow JSON body updates for title/description OR multipart to upload replacement file
  replaceUpload(req, res, function (uploadErr) {
    if (uploadErr && uploadErr.message) return res.status(400).json({ error: uploadErr.message });
    const id = req.params.id;
    db.get('SELECT * FROM documents WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });

      const newTitle = (req.body && req.body.title) || row.title;
      const newDesc = (req.body && req.body.description) || row.description;

      if (req.file) {
        // replace file
        const oldPath = path.join(UPLOAD_DIR, row.stored_name);
        const newStored = req.file.filename;
        const newOriginal = req.file.originalname;
        const newSize = req.file.size;
        const newMime = req.file.mimetype;
        fs.unlink(oldPath, (e) => {
          // ignore error
          db.run(
            `UPDATE documents SET stored_name = ?, original_name = ?, mime_type = ?, size = ?, upload_date = ? , title = ?, description = ? WHERE id = ?`,
            [newStored, newOriginal, newMime, newSize, new Date().toISOString(), newTitle, newDesc, id],
            function (dbErr) {
              if (dbErr) return res.status(500).json({ error: dbErr.message });
              res.json({ success: true });
            }
          );
        });
      } else {
        // only metadata update
        db.run(`UPDATE documents SET title = ?, description = ? WHERE id = ?`, [newTitle, newDesc, id], function (dbErr) {
          if (dbErr) return res.status(500).json({ error: dbErr.message });
          res.json({ success: true });
        });
      }
    });
  });
});

// Serve uploaded files publicly (optional: you may disable this and force /download)
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/', (req, res) => res.send('Samkitec backend running'));

app.listen(PORT, () => console.log(`Samkitec server listening on ${PORT}`));