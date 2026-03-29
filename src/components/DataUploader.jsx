import { useState, useRef } from 'react'
import { RiUploadCloud2Line, RiFileTextLine } from 'react-icons/ri'
import { useApp } from '../context/AppContext'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * DataUploader
 *
 * Submits text or plain-text file content to the `orgData` Firestore collection.
 * Admins review pending submissions in the Admin Dashboard → Knowledge Base tab.
 * On approval, AdminDashboard.handleApproveDoc() calls ingestDocument() from lib/rag.js,
 * which chunks the text, embeds it via Gemini text-embedding-004, and upserts to Pinecone.
 *
 * Supported content types:
 *  - Text import (paste): raw text, any length — chunked at ingestion time (1000 tokens / 200 overlap)
 *  - File upload (.txt): file content is read client-side via FileReader before submission
 *
 * Note: Binary formats (.pdf, .docx) require server-side parsing and are not supported
 * in this client-only build. Use the text import mode for those documents.
 */
export default function DataUploader({ title, description, orgId, ownerEmail, onSuccess, isAdmin }) {
  const { addToast } = useApp()
  const [textMode, setTextMode]       = useState(false)
  const [textContent, setTextContent] = useState('')
  const [fileName, setFileName]       = useState('')
  const [fileContent, setFileContent] = useState('')
  const [uploading, setUploading]     = useState(false)
  const fileInputRef = useRef()

  /** Read a .txt file as text using FileReader */
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (evt) => setFileContent(evt.target.result ?? '')
    reader.onerror = () => addToast('Could not read file.', 'error')
    reader.readAsText(file)
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    const content = textMode ? textContent.trim() : fileContent.trim()
    if (!content) return

    setUploading(true)
    try {
      const docTitle = textMode
        ? content.slice(0, 60) + (content.length > 60 ? '…' : '')
        : fileName

      // Write to Firestore orgData collection.
      // status: 'pending' — admin must approve before lib/rag.js ingests to Pinecone.
      // status: 'approved' (admin fast-track) — AdminDashboard will detect and trigger ingestion.
      await addDoc(collection(db, 'orgData'), {
        orgId,
        title:       docTitle,
        content,                          // Full text — used by ingestDocument() at approval
        department:  'General',
        uploadedBy:  ownerEmail,
        fileType:    textMode ? 'TEXT' : 'TXT',
        status:      isAdmin ? 'approved' : 'pending',
        createdAt:   serverTimestamp(),
      })

      if (isAdmin) {
        addToast('Document submitted. Approve in the Knowledge Base tab to ingest to Pinecone.', 'success')
        if (onSuccess) onSuccess(textMode ? 'text' : 'file', docTitle)
      } else {
        addToast('Document submitted for admin review.', 'info')
      }

      // Reset form
      setTextContent('')
      setFileName('')
      setFileContent('')
      if (fileInputRef.current) fileInputRef.current.value = ''

    } catch (err) {
      console.error('[Borg] DataUploader error:', err)
      addToast('Upload failed. Please try again.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const isReady = textMode ? textContent.trim().length > 0 : fileContent.trim().length > 0

  return (
    <div className="card bot-data-uploader">
      <h3 className="card-section-title">{title}</h3>
      <p className="card-section-desc">{description}</p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn btn-sm ${!textMode ? 'btn-primary' : ''}`}
          onClick={() => setTextMode(false)}
        >
          <RiUploadCloud2Line style={{ marginRight: '0.25rem' }} /> File Upload (.txt)
        </button>
        <button
          type="button"
          className={`btn btn-sm ${textMode ? 'btn-primary' : ''}`}
          onClick={() => setTextMode(true)}
        >
          <RiFileTextLine style={{ marginRight: '0.25rem' }} /> Text Import
        </button>
      </div>

      <form onSubmit={handleUpload}>
        {textMode ? (
          <div className="form-group">
            <textarea
              className="form-textarea"
              rows={5}
              placeholder="Paste document content here. It will be chunked (1000 tokens / 200 overlap) and embedded via Gemini text-embedding-004 upon admin approval."
              value={textContent}
              onChange={e => setTextContent(e.target.value)}
            />
          </div>
        ) : (
          <div className="form-group">
            <input
              type="file"
              className="form-input"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".txt"
            />
            {fileName && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                {fileName} — {fileContent.length.toLocaleString()} characters read
              </p>
            )}
          </div>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={uploading || !isReady}
        >
          {uploading ? 'Submitting…' : (isAdmin ? 'Submit for Knowledge Base' : 'Submit for Admin Approval')}
        </button>
      </form>
    </div>
  )
}
