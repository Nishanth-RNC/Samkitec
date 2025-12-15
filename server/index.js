require('dotenv').config();
'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];


app.post('/api/upload', upload.single('file'), async (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });


if (!allowedTypes.includes(req.file.mimetype)) {
fs.unlinkSync(req.file.path);
return res.status(400).json({ error: 'Invalid file type' });
}


try {
const clam = await ClamScan;
const scan = await clam.isInfected(req.file.path);
if (scan.isInfected) throw new Error('Virus detected');


const cloud = await cloudinary.uploader.upload(req.file.path, {
folder: 'samkitec_reports',
resource_type: 'raw'
});


fs.unlinkSync(req.file.path);


const id = uuidv4();
await pool.query(
`INSERT INTO documents VALUES ($1,$2,$3,$4,$5,$6,DEFAULT,$7,'',$8)`,
[
id,
req.file.originalname,
cloud.secure_url,
cloud.public_id,
req.file.mimetype,
req.file.size,
req.body.title || req.file.originalname,
req.body.doc_type || 'process'
]
);


res.json({ id, file_url: cloud.secure_url });


} catch (e) {
if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
res.status(500).json({ error: e.message });
}
});


app.get('/api/documents', async (req, res) => {
const r = await pool.query('SELECT * FROM documents ORDER BY upload_date DESC');
res.json(r.rows);
});


app.put('/api/documents/:id', async (req, res) => {
const r = await pool.query(
'UPDATE documents SET title=$1 WHERE id=$2 RETURNING *',
[req.body.title, req.params.id]
);
if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
res.json(r.rows[0]);
});


app.delete('/api/documents/:id', async (req, res) => {
const r = await pool.query('SELECT * FROM documents WHERE id=$1', [req.params.id]);
if (!r.rowCount) return res.status(404).json({ error: 'Not found' });


await cloudinary.uploader.destroy(r.rows[0].file_public_id, { resource_type: 'raw' });
await pool.query('DELETE FROM documents WHERE id=$1', [req.params.id]);


res.json({ success: true });
});


app.listen(PORT, () => console.log('Backend running on ' + PORT));
