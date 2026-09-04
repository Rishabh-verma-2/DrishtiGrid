import React from "react";
import {
  UploadCloudIcon,
  SearchIcon,
  ZapIcon,
  EyeIcon,
  CheckCircleIcon,
  SlidersIcon,
  CpuIcon,
} from "./Icons";

const STEPS = [
  {
    id: "uploading",
    label: "Uploading Image",
    sublabel: "Sending to backend for processing",
    icon: (props) => <UploadCloudIcon {...props} />,
  },
  {
    id: "detecting",
    label: "Detecting License Plates",
    sublabel: "YOLOv8 scanning for all visible plates",
    icon: (props) => <SearchIcon {...props} />,
  },
  {
    id: "enhancing",
    label: "Enhancing Plate Crops",
    sublabel: "Zero-DCE · CLAHE · Real-ESRGAN upscaling",
    icon: (props) => <ZapIcon {...props} />,
  },
  {
    id: "ocr",
    label: "Running OCR",
    sublabel: "PaddleOCR extracting plate text",
    icon: (props) => <EyeIcon {...props} />,
  },
  {
    id: "results",
    label: "Preparing Results",
    sublabel: "Validating & formatting output",
    icon: (props) => <SlidersIcon {...props} />,
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
      <div className="processing-title flex items-center gap-2 font-bold text-slate-800">
        <CpuIcon className="w-4 h-4 text-blue-600" />
        <span>AI Pipeline Processing</span>
      </div>
      <div className="processing-steps">
        {STEPS.map((step, i) => {
          const state = getStepState(i, currentIndex, isDone);
          const isActive = state === "step-active";
          const isDoneStep = state === "step-done";
          const IconComp = step.icon;

          return (
            <div key={step.id} className={`processing-step ${state}`}>
              <div className="step-icon flex items-center justify-center">
                {isDoneStep ? (
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                ) : isActive ? (
                  <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <IconComp className="w-4 h-4 text-slate-400" />
                )}
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
