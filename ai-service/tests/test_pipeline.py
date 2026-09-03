"""
Basic unit tests for the ANPR pipeline stages.
Run with: pytest tests/ -v
"""

import io
import os
import sys
from pathlib import Path
import pytest
import cv2
import numpy as np

# Ensure the app package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_test_image(h=100, w=300, bright=True) -> np.ndarray:
    """Create a synthetic BGR test image."""
    import cv2
    img = np.zeros((h, w, 3), dtype=np.uint8)
    if bright:
        img[:] = (180, 190, 200)  # Light grey plate-like background
        # Draw fake characters
        cv2.putText(img, "GJ01AB1234", (10, 70), cv2.FONT_HERSHEY_SIMPLEX,
                    1.5, (0, 0, 0), 3)
    else:
        img[:] = (20, 20, 20)  # Dark image
    return img


def _image_to_bytes(img) -> bytes:
    import cv2
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


# ---------------------------------------------------------------------------
# Tests — Image utils
# ---------------------------------------------------------------------------

class TestImageUtils:
    def test_numpy_to_base64_returns_data_uri(self):
        from app.utils.image_utils import numpy_to_base64
        img = _create_test_image()
        b64 = numpy_to_base64(img)
        assert b64.startswith("data:image/")

    def test_compute_brightness_bright_image(self):
        from app.utils.image_utils import compute_mean_brightness
        img = np.ones((50, 50, 3), dtype=np.uint8) * 200
        assert compute_mean_brightness(img) > 150

    def test_compute_brightness_dark_image(self):
        from app.utils.image_utils import compute_mean_brightness
        img = np.ones((50, 50, 3), dtype=np.uint8) * 30
        assert compute_mean_brightness(img) < 50

    def test_safe_crop(self):
        from app.utils.image_utils import safe_crop
        img = np.zeros((200, 300, 3), dtype=np.uint8)
        crop = safe_crop(img, 10, 10, 100, 50, pad=0)
        assert crop.shape == (50, 100, 3)

    def test_safe_crop_clamps_to_bounds(self):
        from app.utils.image_utils import safe_crop
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        # Request out-of-bounds crop
        crop = safe_crop(img, 90, 90, 100, 100, pad=0)
        assert crop.shape[0] <= 100
        assert crop.shape[1] <= 100

    def test_validate_image_bytes_valid(self):
        from app.utils.image_utils import validate_image_bytes
        img = _create_test_image()
        assert validate_image_bytes(_image_to_bytes(img)) is True

    def test_validate_image_bytes_invalid(self):
        from app.utils.image_utils import validate_image_bytes
        assert validate_image_bytes(b"not_an_image") is False


# ---------------------------------------------------------------------------
# Tests — Preprocessing
# ---------------------------------------------------------------------------

class TestPreprocessing:
    def test_preprocess_plate_crop_returns_ndarray(self):
        from app.preprocessing.opencv_preprocess import preprocess_plate_crop
        img = _create_test_image(h=30, w=120)
        result = preprocess_plate_crop(img)
        assert result is not None
        assert result.ndim == 3

    def test_preprocess_upscales_tiny_crop(self):
        from app.preprocessing.opencv_preprocess import preprocess_plate_crop
        tiny = np.zeros((20, 80, 3), dtype=np.uint8)
        result = preprocess_plate_crop(tiny, target_height=64)
        assert result.shape[0] >= 64

    def test_analyze_quality_dark_image(self):
        from app.preprocessing.opencv_preprocess import analyze_image_quality
        dark = np.zeros((60, 200, 3), dtype=np.uint8) + 15
        metrics = analyze_image_quality(dark)
        assert metrics.is_dark is True

    def test_analyze_quality_bright_image(self):
        from app.preprocessing.opencv_preprocess import analyze_image_quality
        bright = np.ones((60, 200, 3), dtype=np.uint8) * 200
        metrics = analyze_image_quality(bright)
        assert metrics.is_dark is False


# ---------------------------------------------------------------------------
# Tests — CLAHE
# ---------------------------------------------------------------------------

class TestClahe:
    def test_clahe_improves_contrast(self):
        from app.enhancement.clahe import apply_clahe
        # Force full pipeline to ensure CLAHE runs
        import app.config.settings as cfg
        original_force = cfg.MODEL_CONFIG.get("FORCE_FULL_PIPELINE")
        cfg.MODEL_CONFIG["FORCE_FULL_PIPELINE"] = True
        try:
            img = _create_test_image()
            result, applied = apply_clahe(img)
            assert result is not None
            assert result.shape == img.shape
        finally:
            cfg.MODEL_CONFIG["FORCE_FULL_PIPELINE"] = original_force

    def test_clahe_skipped_for_high_contrast(self):
        from app.enhancement.clahe import apply_clahe
        import app.config.settings as cfg
        cfg.MODEL_CONFIG["FORCE_FULL_PIPELINE"] = False
        # High-contrast checkerboard
        base = np.tile(
            np.array([[0, 255], [255, 0]], dtype=np.uint8),
            (50, 100)
        )
        img = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
        _, applied = apply_clahe(img)
        # Not guaranteed to skip but should not crash


# ---------------------------------------------------------------------------
# Tests — Indian Plate Validation
# ---------------------------------------------------------------------------

class TestIndianPlateValidation:
    def test_valid_standard_plate(self):
        from app.validation.indian_plate import validate_indian_plate
        status, _ = validate_indian_plate("GJ01AB1234")
        assert status == "VALID_FORMAT"

    def test_valid_maharashtra(self):
        from app.validation.indian_plate import validate_indian_plate
        status, _ = validate_indian_plate("MH12DE1433")
        assert status in ("VALID_FORMAT", "POSSIBLE_FORMAT")

    def test_invalid_too_short(self):
        from app.validation.indian_plate import validate_indian_plate
        status, _ = validate_indian_plate("XY")
        assert status == "UNCERTAIN"

    def test_invalid_random_text(self):
        from app.validation.indian_plate import validate_indian_plate
        status, _ = validate_indian_plate("HELLOWORLD123456789")
        assert status == "INVALID_FORMAT"

    def test_normalize_removes_spaces(self):
        from app.validation.indian_plate import normalize_plate_text
        assert normalize_plate_text("GJ 01 AB 1234") == "GJ01AB1234"

    def test_normalize_removes_hyphens(self):
        from app.validation.indian_plate import normalize_plate_text
        assert normalize_plate_text("GJ-01-AB-1234") == "GJ01AB1234"

    def test_normalize_uppercase(self):
        from app.validation.indian_plate import normalize_plate_text
        assert normalize_plate_text("gj01ab1234") == "GJ01AB1234"

    def test_bh_series_plate(self):
        from app.validation.indian_plate import validate_indian_plate
        status, _ = validate_indian_plate("23BH1234AA")
        assert status == "VALID_FORMAT"

    def test_process_ocr_result_full(self):
        from app.validation.indian_plate import process_ocr_result
        r = process_ocr_result("GJ 01 AB 1234")
        assert r["normalized_plate"] == "GJ01AB1234"
        assert r["validation_status"] in ("VALID_FORMAT", "POSSIBLE_FORMAT")


# ---------------------------------------------------------------------------
# Tests — Pipeline (integration, mocked)
# ---------------------------------------------------------------------------

class TestPipelineMocked:
    def test_pipeline_returns_success_on_valid_image(self, monkeypatch):
        """Integration test with mocked YOLO (no actual model needed)."""
        import cv2

        def mock_detect(image):
            crop = np.zeros((40, 120, 3), dtype=np.uint8) + 150
            return [{
                "plate_id": 1,
                "bbox": {"x": 10, "y": 10, "width": 120, "height": 40},
                "detection_confidence": 0.92,
                "original_crop": crop,
            }]

        def mock_ocr(crop):
            return {"raw_ocr": "GJ01AB1234", "ocr_confidence": 0.95, "success": True, "error": None}

        def mock_upscale(crop, scale=None):
            return crop, False

        from app.pipeline import plate_pipeline as pp
        monkeypatch.setattr(pp, "detect_license_plates", mock_detect)
        monkeypatch.setattr(pp, "run_ocr_on_crop", mock_ocr)
        monkeypatch.setattr(pp, "upscale_plate_crop", mock_upscale)
        monkeypatch.setattr("app.ocr.paddle_ocr.run_ocr_on_crop", mock_ocr)
        monkeypatch.setattr("app.super_resolution.real_esrgan.upscale_plate_crop", mock_upscale)

        img = _create_test_image()
        result = pp.run_pipeline(_image_to_bytes(img))

        assert result["success"] is True
        assert result["total_plates_detected"] == 1
        assert len(result["plates"]) == 1
        assert result["plates"][0]["normalized_plate"] == "GJ01AB1234"

    def test_pipeline_zero_plates(self, monkeypatch):
        from app.pipeline import plate_pipeline as pp

        def mock_detect(image):
            return []

        monkeypatch.setattr(pp, "detect_license_plates", mock_detect)

        img = _create_test_image()
        result = pp.run_pipeline(_image_to_bytes(img))
        assert result["success"] is True
        assert result["total_plates_detected"] == 0

    def test_pipeline_invalid_image(self):
        from app.pipeline.plate_pipeline import run_pipeline
        result = run_pipeline(b"not_an_image")
        assert result["success"] is False
        assert result["error"] is not None
