import React, { useEffect, useState, useRef } from 'react'
import logo from './assets/logo.jpeg';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function App() {
  const [files, setFiles] = useState([])
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [docTypeFilter, setDocTypeFilter] = useState('all');
  const [selectedFile, setSelectedFile] = useState(null)
  const [docType, setDocType] = useState('process')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef()

  useEffect(() => {
    fetchList()
  }, [])

  useEffect(() => {
    const delay = setTimeout(() => fetchList(), 300)
    return () => clearTimeout(delay)
  }, [search, from, to, docTypeFilter])

  async function fetchList() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (docTypeFilter) params.set('type', docTypeFilter); // pass doc_type

    const res = await fetch(`${API_BASE}/api/documents?` + params.toString());
    const data = await res.json();
    setFiles(data); 
  }


  async function handleUpload() {
    if (!selectedFile) return alert('Choose PDF or DOCX')
    setUploading(true)
    const form = new FormData()
    form.append('file', selectedFile)
    form.append('title', selectedFile.name)
    form.append('doc_type', docType)
    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      setSelectedFile(null)
      fileInputRef.current.value = ''
      await fetchList()
      alert('Uploaded!')
    } catch (err) {
      alert('Upload error: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(id) {
    window.open(`${API_BASE}/api/documents/${id}/download`, '_blank')
  }

  async function handleDelete(id) {
    if (!confirm('Delete this file?')) return
    await fetch(`${API_BASE}/api/documents/${id}`, { method: 'DELETE' })
    await fetchList()
  }

  async function handleRename(id, oldTitle) {
    const newTitle = prompt('New title', oldTitle)
    if (!newTitle) return
    await fetch(`${API_BASE}/api/documents/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) })
    await fetchList()
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
        <div className="card" style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
          <div style={{ flex:1 }}>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={e=>setSelectedFile(e.target.files[0])} />
            <select value={docType} onChange={e=>setDocType(e.target.value)} style={{ marginLeft: 8, padding:6 }}>
              <option value="process">Process Report</option>
              <option value="work">Work Report</option>
            </select>
            <button className="btn btn-primary" onClick={handleUpload} disabled={uploading} style={{ marginLeft: 8 }}>{uploading ? 'Uploading...' : 'Upload'}</button>
          </div>
          <div style={{ minWidth:360 }}>
            <div className="search-row">
              <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{ flex:1, padding:8, borderRadius:8 }} />
              <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ padding:8, borderRadius:8 }} />
              <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{ padding:8, borderRadius:8 }} />
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            style={{ padding:8, borderRadius:8, background:'#1f1f2b', color:'#e0e0e0', border:'1px solid #5a5a70' }}
          >
            <option value="all">All Types</option>
            <option value="process">Process Report</option>
            <option value="work">Work Report</option>
          </select>
        </div>

        <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(250px,1fr))', gap:12 }}>
          {files.map(f => (
            <div key={f.id} className="file-card card" style={{ padding:12 }}>
              <div>
                <div style={{ fontWeight:700 }}>{f.title} ({f.doc_type})</div>
                <div className="small">Type: {f.doc_type === 'process' ? 'Process' : 'Work'}</div>
                <div className="small">Uploaded: {new Date(f.upload_date).toLocaleString()}</div>
              </div>
              <div style={{ display:'flex', gap:6, marginTop:8 }}>
                <button onClick={()=>handleDownload(f.id)}>Download</button>
                <button onClick={()=>handleRename(f.id, f.title)}>Rename</button>
                <button onClick={()=>handleDelete(f.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
