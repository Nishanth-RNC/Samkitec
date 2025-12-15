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

// --- 1. Ensure Temp Directory Exists ---
const TEMP_DIR = path.join(__dirname, 'uploads_temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// --- Database Setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for many hosted Postgres instances (like Render)
});

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
        action TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      );
    `);
    console.log("✅ Database tables initialized");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
};
initDb();

// --- Cloudinary Config ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- ClamAV Setup ---
const ClamScan = new NodeClam().init({
  remove_infected: true,
  quarantine_infected: false, 
  debug_mode: false,
  clamdscan: {
    host: process.env.CLAMAV_HOST || 'clamav',
    port: process.env.CLAMAV_PORT || 3310,
    active: true, 
    bypass_test: true, // Bypass local binary check
  },
  preference: 'clamdscan' 
});

const app = express();
app.use(cors());
app.use(express.json());

// --- 2. Global Request Logger (Debug 404s) ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const upload = multer({ dest: TEMP_DIR });

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

// Upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const tempPath = req.file.path;

  try {
    // Check for empty files (Corruption check)
    const stats = fs.statSync(tempPath);
    if (stats.size === 0) {
      throw new Error("File is empty (0 bytes). Upload failed.");
    }

    // Security Scan
    let isInfected = false;
    try {
        const clam = await ClamScan;
        const scanResult = await clam.isInfected(tempPath);
        isInfected = scanResult.isInfected;
    } catch (clamErr) {
        console.warn("ClamAV warning:", clamErr.message);
    }

    if (isInfected) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return res.status(400).json({ error: 'Security Alert: Virus detected.' });
    }

    // Upload to Cloudinary
    const cloudRes = await cloudinary.uploader.upload(tempPath, {
      folder: 'samkitec_reports',
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
    });

    // Cleanup
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    // Save Metadata
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

    await logAction(id, 'UPLOAD', `Uploaded file: ${meta.original_name}`);
    res.json(meta);

  } catch (err) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.error("Upload Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// List
app.get('/api/documents', async (req, res) => {
  try {
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

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("List Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Rename (This is the critical missing route)
app.put('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;

  console.log(`Processing RENAME for ${id} to "${title}"`); // Debug log

  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const result = await pool.query(
      'UPDATE documents SET title = $1 WHERE id = $2 RETURNING *',
      [title, id]
    );

    if (result.rowCount === 0) {
      console.log(`RENAME: Document ${id} not found.`);
      return res.status(404).json({ error: 'Not found' });
    }

    await logAction(id, 'RENAME', `Renamed to: ${title}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Rename Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete
app.delete('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const docResult = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (docResult.rowCount === 0) return res.status(404).json({ error: 'Not found' });

    const doc = docResult.rows[0];

    // Cloudinary delete
    if (doc.file_url) {
      try {
        const publicId = doc.file_url.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`samkitec_reports/${publicId}`);
      } catch (e) {
        console.warn('Cloudinary delete warning:', e.message);
      }
    }

    await pool.query('DELETE FROM documents WHERE id = $1', [id]);
    await logAction(id, 'DELETE', `Deleted file: ${doc.original_name}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('Samkitec Secure Backend Online'));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
