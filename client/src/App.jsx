import React, { useEffect, useState, useRef } from "react";
import logo from "./assets/logo.jpeg";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function App() {
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("all");

  const [selectedFile, setSelectedFile] = useState(null);
  const [docType, setDocType] = useState("process");
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef(null);

  /* ---------------- FETCH DOCUMENT LIST ---------------- */

  useEffect(() => {
    fetchList();
  }, []);

  useEffect(() => {
    const delay = setTimeout(fetchList, 300);
    return () => clearTimeout(delay);
  }, [search, from, to, docTypeFilter]);

  async function fetchList() {
    try {
      const params = new URLSearchParams();

      if (search) params.set("search", search);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (docTypeFilter !== "all") params.set("type", docTypeFilter);

      const base =
        API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;

      const res = await fetch(
        `${base}/api/documents?${params.toString()}`
      );

      if (!res.ok) throw new Error("Failed to fetch");

      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setFiles([]);
    }
  }

  /* ---------------- UPLOAD ---------------- */

  async function handleUpload() {
    if (!selectedFile) {
      alert("Please choose a PDF or DOCX file");
      return;
    }

    setUploading(true);

    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("title", selectedFile.name);
      form.append("doc_type", docType);

      const base =
        API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;

      const res = await fetch(`${base}/api/upload`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      await fetchList();
      alert("Uploaded successfully");
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  /* ---------------- DELETE ---------------- */

  async function handleDelete(id) {
    if (!confirm("Delete this document?")) return;

    try {
      const base =
        API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;

      const res = await fetch(`${base}/api/documents/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Delete failed");

      await fetchList();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------------- RENAME ---------------- */

  async function handleRename(id, oldTitle) {
    const newTitle = prompt("New title", oldTitle);
    if (!newTitle || newTitle === oldTitle) return;

    try {
      const base =
        API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;

      const res = await fetch(`${base}/api/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      if (res.status === 404) {
        alert("Document mismatch. Refreshing list…");
        await fetchList();
        return;
      }

      if (!res.ok) throw new Error("Rename failed");

      await fetchList();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------------- PREVIEW & DOWNLOAD ---------------- */

 const handlePreview = (url) => {
  if (!url) return;

  // PDFs can preview directly
  if (url.toLowerCase().endsWith('.pdf')) {
    window.open(url, '_blank');
  } else {
    // DOCX needs Google Docs viewer
    window.open(
      `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`,
      '_blank'
    );
  }
};

const handleDownload = (url, originalName) => {
  if (!url) return;

  const encodedName = encodeURIComponent(originalName);

  const downloadUrl = url.replace(
    '/upload/',
    `/upload/fl_attachment:${encodedName}/`
  );

  window.open(downloadUrl, '_blank');
};
  /* ---------------- UI ---------------- */

  return (
    <div>
      <header
        className="header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <img
          src={logo}
          alt="Samkitec"
          style={{ height: 60, width: 60 }}
        />
        <div>
          <h1>Samkitec</h1>
          <h2>green technologies</h2>
        </div>
      </header>

      <main className="container">
        {/* Upload */}
        <div className="card" style={{ marginBottom: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            onChange={(e) => setSelectedFile(e.target.files[0])}
          />

          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="process">Process Report</option>
            <option value="work">Work Report</option>
          </select>

          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            style={{ marginLeft: 8 }}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 12 }}>
          <input
            placeholder="Search logs…"
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

          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="process">Process</option>
            <option value="work">Work</option>
          </select>
        </div>

        {/* File List */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(280px,1fr))",
            gap: 12,
          }}
        >
          {files.length ? (
            files.map((f) => (
              <div key={f.id} className="card">
                <div style={{ fontWeight: "bold" }}>{f.title}</div>
                <div className="small">{f.original_name}</div>
                <div className="small">
                  Uploaded:{" "}
                  {new Date(f.upload_date).toLocaleString()}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <button
                    onClick={() => handlePreview(f.file_url)}
                  >
                    Preview
                  </button>
                  <button onClick={() => handleDownload(f.file_url, f.original_name)}>
                    Download
                  </button>
                  <button
                    onClick={() => handleRename(f.id, f.title)}
                  >
                    Rename
                  </button>
                  <button
                    style={{ background: "#f44336" }}
                    onClick={() => handleDelete(f.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "#888" }}>No files found.</div>
          )}
        </div>
      </main>
    </div>
  );
}
