import React, { useEffect, useState, useRef } from 'react';
import logo from './assets/logo.jpg';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function App() {
  // --- State Hooks ---
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('all');
  const [selectedFile, setSelectedFile] = useState(null);
  const [docType, setDocType] = useState('process');
  const [uploading, setUploading] = useState(false);
  
  // --- Refs ---
  const fileInputRef = useRef(null);

  // --- Side Effects (Fetching) ---
  useEffect(() => {
    fetchList();
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchList, 300);
    return () => clearTimeout(t);
  }, [search, from, to, docTypeFilter]);

  async function fetchList() {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (from && from.trim() !== '') params.set("from", from);
      if (to && to.trim() !== '') params.set("to", to);
      if (docTypeFilter !== 'all') params.set('type', docTypeFilter);

      const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
      const res = await fetch(`${base}/api/documents?${params.toString()}`);
      
      if (!res.ok) throw new Error('Fetch failed');
      
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setFiles([]);
    }
  }

  // --- Handlers ---
  async function handleUpload() {
    if (!selectedFile) return alert('Choose a file');
    setUploading(true);
    
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('title', selectedFile.name);
      form.append('doc_type', docType);

      const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
      const res = await fetch(`${base}/api/upload`, { 
        method: 'POST', 
        body: form 
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      await fetchList();
      alert('Uploaded successfully');
    } catch (e) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRename(id, oldTitle) {
    const newTitle = prompt('New title', oldTitle);
    if (!newTitle || newTitle === oldTitle) return;

    const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
    const res = await fetch(`${base}/api/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });

    if (res.status === 404) return fetchList();
    if (!res.ok) return alert('Rename failed');
    
    fetchList();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this document?')) return;
    try {
      const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
      const res = await fetch(`${base}/api/documents/${id}`, { 
        method: 'DELETE' 
      });

      if (!res.ok) throw new Error('Delete failed');

      setFiles(prev => prev.filter(f => f.id !== id));
      fetchList();
    } catch (err) {
      alert(err.message);
    }
  }

  const handlePreview = (url) => {
    if (!url) return;
    if (url.toLowerCase().endsWith('.pdf')) {
      window.open(url, '_blank');
    } else {
      window.open(`https://docs.google.com{encodeURIComponent(url)}&embedded=true`, '_blank');
    }
  };

  const handleDownload = async (url, originalName) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const a = document.createElement('a');
      const objectUrl = window.URL.createObjectURL(blob);
      
      a.href = objectUrl;
      a.download = originalName; 
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      alert('Download failed');
      console.error(err);
    }
  };

  // --- Render ---
  return (
    <div>
      <header className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <img src={logo} alt="Samkitec Logo" style={{ height: 60 }} />
        <div>
          <h1>PYROGREEN</h1>
          <h2>ENERGY PRIVATE LIMITED</h2>
        </div>
      </header>

      <main className="container">
        {/* Upload Section */}
        <div className="doc-grid">
          <input 
            ref={fileInputRef} 
            type="file" 
            accept=".pdf,.docx" 
            onChange={(e) => setSelectedFile(e.target.files[0])} 
          />
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="process">Process</option>
            <option value="work">Work</option>
          </select>
          <button onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>

        {/* Filter Section */}
        <div className="card" style={{ marginTop: 10 }}>
          <input 
            placeholder="Search" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
          <input 
            type="date" 
            value={from} 
            onChange={(e) => setFrom(e.target.value)} 
          />
          <input 
            type="date" 
            value={to} 
            onChange={(e) => setTo(e.target.value)} 
          />
          <select value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="process">Process</option>
            <option value="work">Work</option>
          </select>
        </div>

        {/* Results Grid */}
        <div style={{ 
          marginTop: 12, 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', 
          gap: 12 
        }}>
          {files.length ? (
            files.map(f => (
              <div key={f.id} className="card">
                <b>{f.title}</b>
                <div className="small">{f.original_name}</div>
                <div className="small" style={{ marginTop: 4 }}>
                  Type: 
                  <span style={{ 
                    textTransform: 'uppercase', 
                    fontSize: '0.8em', 
                    background: '#444', 
                    padding: '2px 4px', 
                    borderRadius: 4,
                    marginLeft: 4
                  }}>
                    {f.doc_type}
                  </span>
                </div>
                <div className="small">{new Date(f.upload_date).toLocaleString()}</div>
                
                <div className="button-row">
                  <button onClick={() => handlePreview(f.file_url)}>Preview</button>
                  <button onClick={() => handleDownload(f.file_url, f.original_name)}>Download</button>
                  <button onClick={() => handleRename(f.id, f.title)}>Rename</button>
                  <button className="danger" onClick={() => handleDelete(f.id)}>Delete</button>
                </div>
              </div>
            ))
          ) : (
            <div>No files found.</div>
          )}
        </div>
      </main>
    </div>
  );
}