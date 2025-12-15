require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { Pool } = require('pg');
const NodeClam = require('clamscan');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;

/* ---------------- TEMP UPLOAD DIR ---------------- */
const TEMP_DIR = path.join(__dirname, 'uploads_temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/* ---------------- DATABASE ---------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY,
      original_name TEXT,
      file_url TEXT,
      file_public_id TEXT,
      mime_type TEXT,
      size BIGINT,
      upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      title TEXT,
      description TEXT,
      doc_type TEXT
    );
  `);
})();

/* ---------------- CLOUDINARY ---------------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ---------------- CLAMAV ---------------- */
const ENABLE_CLAMAV = process.env.ENABLE_CLAMAV === 'true';

let ClamScan = null;

if (ENABLE_CLAMAV) {
  const NodeClam = require('clamscan');
  ClamScan = new NodeClam().init({
    clamdscan: {
      host: process.env.CLAMAV_HOST || 'clamav',
      port: process.env.CLAMAV_PORT || 3310,
      active: true,
      bypass_test: true,
    },
  });
}


/* ---------------- APP SETUP ---------------- */
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: TEMP_DIR });

/* ---------------- ALLOWED FILE TYPES (FIXED) ---------------- */
const allowedTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

/* ---------------- UPLOAD ---------------- */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (!allowedTypes.includes(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid file type' });
  }

  try {
        if (ENABLE_CLAMAV && ClamScan) {
            const clam = await ClamScan;
            const scan = await clam.isInfected(req.file.path);
            if (scan.isInfected) throw new Error('Virus detected');
        }

    const cloud = await cloudinary.uploader.upload(req.file.path, {
      folder: 'samkitec_reports',
      resource_type: 'raw',
    });

    fs.unlinkSync(req.file.path);

    const id = uuidv4();
    await pool.query(
      `INSERT INTO documents
       (id, original_name, file_url, file_public_id, mime_type, size, title, description, doc_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'',$8)`,
      [
        id,
        req.file.originalname,
        cloud.secure_url,
        cloud.public_id,
        req.file.mimetype,
        req.file.size,
        req.body.title || req.file.originalname,
        req.body.doc_type || 'process',
      ]
    );

    res.json({ id, file_url: cloud.secure_url });

  } catch (e) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- LIST ---------------- */
app.get('/api/documents', async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM documents ORDER BY upload_date DESC'
  );
  res.json(r.rows);
});

/* ---------------- RENAME ---------------- */
app.put('/api/documents/:id', async (req, res) => {
  const r = await pool.query(
    'UPDATE documents SET title=$1 WHERE id=$2 RETURNING *',
    [req.body.title, req.params.id]
  );

  if (!r.rowCount) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(r.rows[0]);
});

/* ---------------- DELETE ---------------- */
app.delete('/api/documents/:id', async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM documents WHERE id=$1',
    [req.params.id]
  );

  if (!r.rowCount) {
    return res.status(404).json({ error: 'Not found' });
  }

  await cloudinary.uploader.destroy(
    r.rows[0].file_public_id,
    { resource_type: 'raw' }
  );

  await pool.query(
    'DELETE FROM documents WHERE id=$1',
    [req.params.id]
  );

  res.json({ success: true });
});

/* ---------------- START ---------------- */
app.listen(PORT, () => {
  console.log('Backend running on port ' + PORT);
});