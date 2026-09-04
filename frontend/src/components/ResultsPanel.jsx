import PlateCard from "./PlateCard";
import { ImageIcon, EyeIcon, CarIcon, ClockIcon } from "./Icons";

export default function ResultsPanel({ result }) {
  const {
    total_plates_detected,
    original_image,
    processed_image,
    plates = [],
    timings = {},
  } = result;

  return (
    <div className="results-section fade-in">
      {/* Section divider */}
      <div className="section-divider">
        <div className="section-divider-line" />
        <div className="section-label">Analysis Results</div>
        <div className="section-divider-line" />
      </div>

      {/* Original vs Processed images */}
      <div className="image-grid">
        <div className="image-card">
          <div className="image-card-header">
            <span className="image-card-title flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" />
              <span>Original Image</span>
            </span>
            <span className="image-card-badge badge-original">ORIGINAL</span>
          </div>
          {original_image ? (
            <img src={original_image} alt="Original uploaded image" />
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              Image unavailable
            </div>
          )}
        </div>

        <div className="image-card">
          <div className="image-card-header">
            <span className="image-card-title flex items-center gap-1.5">
              <EyeIcon className="w-4 h-4" />
              <span>Processed Image</span>
            </span>
            <span className="image-card-badge badge-processed">ANNOTATED</span>
          </div>
          {processed_image ? (
            <img src={processed_image} alt="Processed image with plate bounding boxes" />
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              Image unavailable
            </div>
          )}
        </div>
      </div>

      {/* Plates count banner */}
      {total_plates_detected === 0 ? (
        <div className="no-plates-banner">
          <div className="no-plates-icon flex justify-center mb-2">
            <CarIcon className="w-10 h-10 text-slate-400" />
          </div>
          <div className="no-plates-title">No License Plates Detected</div>
          <div className="no-plates-desc">
            The AI could not find any license plates in this image. Try a clearer
            image with visible number plates.
          </div>
        </div>
      ) : (
        <div className="plates-count-banner">
          <div className="plates-count-number">{total_plates_detected}</div>
          <div>
            <div className="plates-count-label">
              {total_plates_detected === 1
                ? "Number Plate Detected"
                : "Number Plates Detected"}
            </div>
            <div className="plates-count-sublabel">
              Each plate has been independently processed and analyzed
            </div>
          </div>
        </div>
      )}

      {/* Plate cards */}
      {plates.length > 0 && (
        <>
          <div className="section-divider">
            <div className="section-divider-line" />
            <div className="section-label">Individual Plate Results</div>
            <div className="section-divider-line" />
          </div>
          <div className="plates-grid">
            {plates.map((plate, i) => (
              <PlateCard key={plate.plate_id} plate={plate} index={i} />
            ))}
          </div>
        </>
      )}

      {/* Processing timings */}
      {Object.keys(timings).length > 0 && (
        <div className="timings-panel mt-xl">
          <div className="timings-title flex items-center gap-1.5">
            <ClockIcon className="w-4 h-4 text-slate-500" />
            <span>Processing Timings</span>
          </div>
          <div className="timings-grid">
            {timings.detection != null && (
              <div className="timing-item">
                <div className="timing-value">{timings.detection}s</div>
                <div className="timing-label">Detection</div>
              </div>
            )}
            {timings.plate_processing != null && (
              <div className="timing-item">
                <div className="timing-value">{timings.plate_processing}s</div>
                <div className="timing-label">Enhancement</div>
              </div>
            )}
            {timings.total != null && (
              <div className="timing-item">
                <div className="timing-value">{timings.total}s</div>
                <div className="timing-label">Total</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
