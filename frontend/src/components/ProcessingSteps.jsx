const STEPS = [
  {
    id: "uploading",
    label: "Uploading Image",
    sublabel: "Sending to backend for processing",
    icon: "📤",
    doneIcon: "✅",
  },
  {
    id: "detecting",
    label: "Detecting License Plates",
    sublabel: "YOLOv8 scanning for all visible plates",
    icon: "🔍",
    doneIcon: "✅",
  },
  {
    id: "enhancing",
    label: "Enhancing Plate Crops",
    sublabel: "Zero-DCE · CLAHE · Real-ESRGAN upscaling",
    icon: "✨",
    doneIcon: "✅",
  },
  {
    id: "ocr",
    label: "Running OCR",
    sublabel: "PaddleOCR extracting plate text",
    icon: "🔤",
    doneIcon: "✅",
  },
  {
    id: "results",
    label: "Preparing Results",
    sublabel: "Validating & formatting output",
    icon: "📊",
    doneIcon: "✅",
  },
];

function getStepState(stepIndex, currentStepIndex, isDone) {
  if (isDone || stepIndex < currentStepIndex) return "step-done";
  if (stepIndex === currentStepIndex) return "step-active";
  return "step-pending";
}

export default function ProcessingSteps({ currentStep, isDone }) {
  const currentIndex = isDone
    ? STEPS.length
    : STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="processing-panel fade-in">
      <div className="processing-title">
        <span>⚙️</span>
        AI Pipeline Processing
      </div>
      <div className="processing-steps">
        {STEPS.map((step, i) => {
          const state = getStepState(i, currentIndex, isDone);
          const isActive = state === "step-active";
          const isDoneStep = state === "step-done";

          return (
            <div key={step.id} className={`processing-step ${state}`}>
              <div className="step-icon">
                {isDoneStep
                  ? "✅"
                  : isActive
                  ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span>
                  : step.icon}
              </div>
              <div className="step-content">
                <div className="step-label">{step.label}</div>
                {(isActive || isDoneStep) && (
                  <div className="step-sublabel">{step.sublabel}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
