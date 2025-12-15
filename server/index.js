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

// --- Database Setup (PostgreSQL) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize DB Tables
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY,
        original_name TEXT,
        file_url TEXT,
        mime_type TEXT,
        size BIGINT,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        title TEXT,
        description TEXT,
        doc_type TEXT
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        document_id UUID,
        action TEXT, -- 'UPLOAD', 'DELETE', 'RENAME'
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      );
    `);
    console.log("✅ Database tables initialized (PostgreSQL)");
  } catch (err) {
    console.error("❌ Database initialization error:", err);
  }
};
// Retry connection logic for Docker startup timing
const connectWithRetry = () => {
  pool.connect()
    .then(() => initDb())
    .catch((err) => {
      console.error('Failed to connect to DB, retrying in 5 seconds...', err.message);
      setTimeout(connectWithRetry, 5000);
    });
};
connectWithRetry();

// --- Cloudinary Config ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- ClamAV Setup ---
// We initialize this wrapper to talk to the clamav service
const ClamScan = new NodeClam().init({
  remove_infected: true, // If true, removes infected files
  quarantine_infected: false, 
  debug_mode: false,
  file_list: null, 
  scan_log: null,
  clamdscan: {
    host: process.env.CLAMAV_HOST || 'clamav',
    port: process.env.CLAMAV_PORT || 3310,
    timeout: 60000,
    local_fallback: false,
    path: null, 
    multiscan: true, 
    reload_db: false, 
    active: true, 
    bypass_test: true, 
  },
  preference: 'clamdscan' 
});

const app = express();
app.use(cors());
app.use(express.json());

// --- File Storage Strategy ---
// 1. Upload to local temp disk
// 2. Scan with ClamAV
// 3. If Clean -> Upload to Cloudinary -> Delete temp
// 4. If Infected -> Delete temp -> Reject

const upload = multer({ dest: 'uploads_temp/' }); // Temporary local storage

// --- Helper: Audit Logger ---
const logAction = async (docId, action, details) => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (document_id, action, details) VALUES ($1, $2, $3)',
      [docId, action, details]
    );
  } catch (err) {
    console.error("Audit Log Error:", err.message);
  }
};

// --- Routes ---

// 1. Upload Document
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const tempPath = req.file.path;

  try {
    // A. Security Scan
    const clam = await ClamScan;
    const { isInfected, viruses } = await clam.isInfected(tempPath);

    if (isInfected) {
      fs.unlinkSync(tempPath); // Delete immediately
      console.warn(`VIRUS DETECTED: ${viruses.join(', ')} in file ${req.file.originalname}`);
      return res.status(400).json({ error: 'Security Alert: File rejected due to virus detection.' });
    }

    // B. Upload to Cloudinary
    const cloudRes = await cloudinary.uploader.upload(tempPath, {
      folder: 'samkitec_reports',
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
    });

    // Clean up local temp file
    fs.unlinkSync(tempPath);

    // C. Save Metadata to Postgres
    const id = uuidv4();
    const meta = {
      id,
      original_name: req.file.originalname,
      file_url: cloudRes.secure_url,
      mime_type: req.file.mimetype,
      size: req.file.size,
      title: req.body.title || req.file.originalname,
      description: req.body.description || '',
      doc_type: req.body.doc_type || 'process',
    };

    await pool.query(
      `INSERT INTO documents (id, original_name, file_url, mime_type, size, title, description, doc_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [meta.id, meta.original_name, meta.file_url, meta.mime_type, meta.size, meta.title, meta.description, meta.doc_type]
    );

    // D. Audit Log
    await logAction(id, 'UPLOAD', `Uploaded file: ${meta.original_name}`);

    res.json(meta);

  } catch (err) {
    // Cleanup if something broke
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. List Documents
app.get('/api/documents', async (req, res) => {
  const { search = '', from, to, type, limit = 100, offset = 0 } = req.query;
  
  let query = 'SELECT * FROM documents WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (search) {
    query += ` AND (original_name ILIKE $${paramCount} OR title ILIKE $${paramCount})`;
    params.push(`%${search}%`);
    paramCount++;
  }
  if (from) {
    query += ` AND upload_date >= $${paramCount}`;
    params.push(from);
    paramCount++;
  }
  if (to) {
    query += ` AND upload_date <= $${paramCount}`;
    params.push(to);
    paramCount++;
  }
  if (type && type !== 'all') {
    query += ` AND doc_type = $${paramCount}`;
    params.push(type);
    paramCount++;
  }

  query += ` ORDER BY upload_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Rename Document (Fixes the Bug)
app.put('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const result = await pool.query(
      'UPDATE documents SET title = $1 WHERE id = $2 RETURNING *',
      [title, id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });

    await logAction(id, 'RENAME', `Renamed to: ${title}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete Document
app.delete('/api/documents/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const docResult = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (docResult.rowCount === 0) return res.status(404).json({ error: 'Not found' });

    const doc = docResult.rows[0];

    // Remove from Cloudinary
    try {
      const publicId = doc.file_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`samkitec_reports/${publicId}`);
    } catch (e) {
      console.warn('Cloudinary delete warning:', e.message);
    }

    // Remove from DB
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);
    
    await logAction(id, 'DELETE', `Deleted file: ${doc.original_name}`);
    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('Samkitec Secure Backend Running (Postgres + ClamAV)'));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
