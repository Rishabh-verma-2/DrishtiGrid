function ConfidenceBar({ label, value, className }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="conf-row">
      <div className="conf-header">
        <span className="conf-label">{label}</span>
        <span className="conf-value">{pct}%</span>
      </div>
      <div className="conf-bar">
        <div
          className={`conf-fill ${className}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ValidationBadge({ status }) {
  const map = {
    VALID_FORMAT:    { cls: "valid-format",    icon: "✅", label: "Valid Format" },
    POSSIBLE_FORMAT: { cls: "possible-format", icon: "⚠️", label: "Possible Format" },
    INVALID_FORMAT:  { cls: "invalid-format",  icon: "❌", label: "Invalid Format" },
    UNCERTAIN:       { cls: "uncertain",       icon: "❓", label: "Uncertain" },
  };
  const { cls, icon, label } = map[status] || map["UNCERTAIN"];
  return (
    <div className={`validation-badge ${cls}`}>
      {icon} {label}
    </div>
  );
}

function ProcessingStatusBadge({ status }) {
  if (status === "SUCCESS") {
    return <span className="plate-status-badge status-success">✓ SUCCESS</span>;
  }
  if (status === "OCR_FAILED") {
    return <span className="plate-status-badge status-failed">⚠ OCR FAILED</span>;
  }
  if (status === "OCR_NO_TEXT") {
    return <span className="plate-status-badge status-partial">~ NO TEXT</span>;
  }
  return <span className="plate-status-badge status-failed">✗ FAILED</span>;
}

export default function PlateCard({ plate, index }) {
  const {
    plate_id,
    original_crop,
    enhanced_crop,
    normalized_plate,
    raw_ocr,
    detection_confidence,
    ocr_confidence,
    overall_confidence,
    validation_status,
    validation_note,
    processing_status,
    processing_error,
    stages_applied = [],
    timings = {},
  } = plate;

  const hasText = normalized_plate && normalized_plate.trim().length > 0;
  const ocrFailed =
    processing_status === "OCR_FAILED" || processing_status === "OCR_NO_TEXT";

  return (
    <div
      id={`plate-card-${plate_id}`}
      className="plate-card"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {/* Header */}
      <div className="plate-card-header">
        <span className="plate-id-badge">Plate #{plate_id}</span>
        <ProcessingStatusBadge status={processing_status} />
      </div>

      {/* Crop comparison */}
      <div className="crop-comparison">
        <div className="crop-panel">
          <div className="crop-label">Original Crop</div>
          {original_crop ? (
            <img className="crop-img" src={original_crop} alt={`Plate ${plate_id} original`} />
          ) : (
            <div className="crop-img" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.75rem" }}>
              No image
            </div>
          )}
        </div>
        <div className="crop-panel">
          <div className="crop-label">Enhanced Crop</div>
          {enhanced_crop ? (
            <img className="crop-img" src={enhanced_crop} alt={`Plate ${plate_id} enhanced`} />
          ) : (
            <div className="crop-img" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.75rem" }}>
              No image
            </div>
          )}
        </div>
      </div>

      {/* Plate number */}
      <div className="plate-number-section">
        <div className="plate-number-label">Detected Number</div>
        {ocrFailed || !hasText ? (
          <div className="plate-number-empty">
            {processing_error
              ? "OCR could not confidently determine the plate number."
              : "No text detected."}
          </div>
        ) : (
          <>
            <div className="plate-number-text mono">{normalized_plate}</div>
            {raw_ocr && raw_ocr !== normalized_plate && (
              <div className="plate-number-raw">Raw OCR: {raw_ocr}</div>
            )}
          </>
        )}
        {hasText && <ValidationBadge status={validation_status} />}
        {validation_note && (
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
            {validation_note}
          </div>
        )}
      </div>

      {/* Confidence bars */}
      <div className="confidence-section">
        <ConfidenceBar
          label="Detection Confidence"
          value={detection_confidence}
          className="conf-fill-detection"
        />
        <ConfidenceBar
          label="OCR Confidence"
          value={ocr_confidence}
          className="conf-fill-ocr"
        />
        <ConfidenceBar
          label="Overall Confidence"
          value={overall_confidence}
          className="conf-fill-overall"
        />
      </div>

      {/* Stages applied tags */}
      {stages_applied.length > 0 && (
        <div className="plate-meta">
          {stages_applied.map((s) => (
            <span key={s} className="stage-tag">{s.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}
    </div>
  );
}
