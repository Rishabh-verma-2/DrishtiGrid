import { useRef, useState, useCallback } from "react";

const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

function validateFile(file) {
  if (!file) return "No file selected.";
  if (!ALLOWED_TYPES.has(file.type.toLowerCase())) {
    return `Unsupported format: "${file.type}". Only JPG and PNG are accepted.`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File too large (${(file.size / 1e6).toFixed(1)} MB). Max ${MAX_SIZE_MB} MB.`;
  }
  return null;
}

export default function UploadZone({ onFileSelected, disabled }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = useCallback(
    (file) => {
      const err = validateFile(file);
      setError(err);
      if (err) return;

      setFileName(file.name);
      const url = URL.createObjectURL(file);
      setPreview(url);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleInput = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  return (
    <div
      id="upload-zone"
      className={`upload-zone ${dragOver ? "drag-over" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      aria-label="Upload image for plate analysis"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        id="image-file-input"
        type="file"
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        onChange={handleInput}
        disabled={disabled}
        style={{ display: "none" }}
      />

      {!preview ? (
        <>
          <div className="upload-icon">📷</div>
          <div className="upload-title">
            {dragOver ? "Release to upload" : "Drag & drop your image"}
          </div>
          <div className="upload-hint">
            or click to browse your files
          </div>
          <div className="upload-formats">
            <span className="format-tag">JPG</span>
            <span className="format-tag">JPEG</span>
            <span className="format-tag">PNG</span>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
            Max {MAX_SIZE_MB} MB · Indian license plates optimized
          </div>
        </>
      ) : (
        <>
          <div className="upload-preview" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="Preview" />
            {!disabled && (
              <div
                className="upload-preview-overlay"
                onClick={() => inputRef.current?.click()}
              >
                <span className="upload-preview-change">🔄 Change image</span>
              </div>
            )}
          </div>
          {fileName && (
            <div className="upload-filename mt-sm">{fileName}</div>
          )}
        </>
      )}

      {error && (
        <div className="upload-error mt-sm">
          <span>⚠️</span> {error}
        </div>
      )}
    </div>
  );
}
