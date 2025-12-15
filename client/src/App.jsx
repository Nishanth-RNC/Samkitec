import React, { useEffect, useState, useRef } from 'react'
import logo from './assets/logo.jpeg'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function App() {
  const [files, setFiles] = useState([])
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [docTypeFilter, setDocTypeFilter] = useState('all')
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
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (docTypeFilter && docTypeFilter !== 'all') params.set('type', docTypeFilter)

      const res = await fetch(`${API_BASE}/api/documents?` + params.toString())

      if (!res.ok) {
        console.error(`Failed to fetch documents: ${res.status}`)
        setFiles([])
        return
      }

      const data = await res.json()
      setFiles(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Error fetching documents:', err)
      setFiles([])
    }
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(err.error || res.statusText)
      }
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

  async function handleDelete(id) {
    if (!confirm('Delete this file?')) return
    await fetch(`${API_BASE}/api/documents/${id}`, { method: 'DELETE' })
    await fetchList()
  }

  async function handleRename(id, oldTitle) {
    const newTitle = prompt('New title', oldTitle)
    if (!newTitle) return
    try {
      const res = await fetch(`${API_BASE}/api/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      })
      if (!res.ok) {
        if (res.status === 404) throw new Error('Document not found in database (try re-uploading)')
        throw new Error(`Rename failed: ${res.status}`)
      }
      await fetchList()
    } catch (err) {
      alert(err.message)
    }
  }

  const handlePreview = (fileUrl) => {
    // Only use Google Docs Viewer for Office documents
    // Removed PDF to fix the "No preview available" / "We can't open this file" errors
    if (fileUrl.match(/\.(docx?|pptx?|xlsx?)$/i)) {
      window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`, '_blank');
    } else {
      // Open PDFs and Images directly
      window.open(fileUrl, '_blank');
    }
  }

  return (
    <div>
      <header
        className="header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}
      >
        <img src={logo} alt="Samkitec Logo" style={{ height: 60, width: 60, objectFit: 'contain' }} />
        <div>
          <h1>Samkitec</h1>
          <h2>green technologies</h2>
        </div>
      </header>

      <main className="container">
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setSelectedFile(e.target.files[0])}
            />
            <select value={docType} onChange={(e) => setDocType(e.target.value)} style={{ marginLeft: 8, padding: 6 }}>
              <option value="process">Process Report</option>
              <option value="work">Work Report</option>
            </select>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={uploading}
              style={{ marginLeft: 8 }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>

          <div style={{ minWidth: 300, flex: 1 }}>
            <div className="search-row">
              <input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, padding: 8, borderRadius: 8 }}
              />
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: 8, borderRadius: 8 }} />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: 8, borderRadius: 8 }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            style={{ padding: 8, borderRadius: 8, background: '#1f1f2b', color: '#e0e0e0', border: '1px solid #5a5a70' }}
          >
            <option value="all">All Types</option>
            <option value="process">Process Report</option>
            <option value="work">Work Report</option>
          </select>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px,1fr))', gap: 12 }}>
          {Array.isArray(files) && files.length > 0 ? (
            files.map((f) => (
              <div key={f.id} className="file-card card" style={{ padding: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{f.title} ({f.doc_type})</div>
                  <div className="small">Type: {f.doc_type === 'process' ? 'Process' : 'Work'}</div>
                  <div className="small">Uploaded: {new Date(f.upload_date).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {/* If using Cloudinary, open file_url directly */}
                  {f.file_url && (
                    <button onClick={() => handlePreview(f.file_url)}>
                      Preview
                    </button>
                  )}
                  <button onClick={() => handleRename(f.id, f.title)}>Rename</button>
                  <button onClick={() => handleDelete(f.id)}>Delete</button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: '#888', marginTop: 20 }}>No files found.</div>
          )}
        </div>
      </main>
    </div>
  )
}
