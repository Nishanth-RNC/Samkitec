import React, { useEffect, useState, useRef } from 'react';
import logo from './assets/logo.jpeg';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function App() {
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef();

  useEffect(() => {
    fetchList();
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchList();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search, from, to]);

  async function fetchList() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`${API_BASE}/api/documents?` + params.toString());
    const data = await res.json();
    setFiles(data);
  }

  async function handleUpload(e) {
    const f = (e.target && e.target.files && e.target.files[0]) || selectedFile;
    if (!f) return alert('Choose PDF or DOCX');
    setUploading(true);
    setProgress(0);
    const form = new FormData();
    form.append('file', f);
    form.append('title', f.name);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      setSelectedFile(null);
      fileInputRef.current.value = '';
      await fetchList();
      alert('Uploaded!');
    } catch (err) {
      alert('Upload error: ' + err.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function handleDownload(id) {
    window.open(`${API_BASE}/api/documents/${id}/download`, '_blank');
  }

  async function handleDelete(id) {
    if (!confirm('Delete this file?')) return;
    await fetch(`${API_BASE}/api/documents/${id}`, { method: 'DELETE' });
    await fetchList();
  }

  async function handleRename(id, oldTitle) {
    const newTitle = prompt('New title', oldTitle);
    if (!newTitle) return;
    await fetch(`${API_BASE}/api/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });
    await fetchList();
  }

  return (
    <div>
      <header className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <img src={logo} alt="Samkitec Logo" style={{ height: 60, width: 60, objectFit: 'contain' }} />
        <div>
          <h1>Samkitec</h1>
          <h2>green technologies</h2>
        </div>
      </header>

      <main className="container">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading}
                style={{ marginLeft: 8 }}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              {uploading && <div className="spinner"></div>}
            </div>

            <div style={{ minWidth: 360 }}>
              <div className="search-row">
                <input
                  placeholder="Search by name or title"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #5a5a70', background: '#1f1f2b', color: '#e0e0e0' }}
                />
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{ padding: 8, borderRadius: 8, background: '#1f1f2b', color: '#e0e0e0', border: '1px solid #5a5a70' }}
                />
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  style={{ padding: 8, borderRadius: 8, background: '#1f1f2b', color: '#e0e0e0', border: '1px solid #5a5a70' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }} className="grid">
          {files.map(f => (
            <div key={f.id} className="file-card card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{f.title}</div>
                  <div className="small">{f.original_name}</div>
                  <div className="small">Uploaded: {new Date(f.upload_date).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={() => handleDownload(f.id)}>Download</button>
                  <button onClick={() => handleRename(f.id, f.title)}>Rename</button>
                  <button onClick={() => handleDelete(f.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
