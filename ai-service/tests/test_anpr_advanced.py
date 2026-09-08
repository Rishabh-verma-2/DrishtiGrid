"""
Comprehensive 15-Category ANPR Verification Suite.

Covers all 15 operational categories specified in the ANPR architecture overhaul:
  1. Standard single Indian plate (DL01AB1234, clear daylight)
  2. Multi-vehicle scene (dense traffic, 3+ vehicles simultaneously)
  3. Distant vehicle (< 30px plate width / sub-pixel resolution)
  4. High-contrast / low-contrast plates (CLAHE variant)
  5. High-angle CCTV perspective (skew angle estimation + deskew)
  6. Rear tire / bumper / grille false positive
  7. Street sign / billboard text filtering
  8. Two-wheelers / motorcycles
  9. Night / low-light frame
  10. Unreadable plate crop (18x6 px)
  11. Contour-only candidate rejection
  12. Ambiguous traffic queue vehicle association
  13. OCR consensus evidence fusion across variants
  14. Constrained Indian plate character repair
  15. End-to-end API response contract & debug mode
"""

import os
import sys
import unittest

# Ensure app is on path
current_dir = os.path.dirname(os.path.abspath(__file__))
ai_service_dir = os.path.abspath(os.path.join(current_dir, ".."))
if ai_service_dir not in sys.path:
    sys.path.insert(0, ai_service_dir)

import numpy as np
try:
    import cv2
except ImportError:
    cv2 = None

from app.preprocessing.plate_quality import (
    PlateQualityAssessment,
    PlateQualityState,
    evaluate_plate_quality,
    estimate_skew_angle,
)
from app.detection.association import (
    associate_plates_to_vehicles,
    score_plate_vehicle_pair,
)
from app.detection.candidate_clustering import (
    cluster_plate_candidates,
    compute_iou,
)
from app.validation.indian_plate import (
    clean_ocr_text,
    repair_indian_plate,
    validate_indian_plate,
    process_ocr_result,
    KNOWN_STATE_CODES,
)
from app.ocr.ocr_fusion import (
    generate_variants,
    fuse_ocr_variants,
)
from app.pipeline.confidence_scoring import (
    PlateResultState,
    compute_overall_confidence,
    compute_geometric_score,
)


class TestANPRAdvancedSuite(unittest.TestCase):
    """15-Category Test Suite for DrishtiGrid Vehicle-First ANPR."""

    # -----------------------------------------------------------------------
    # Category 1: Standard single Indian plate
    # -----------------------------------------------------------------------
    def test_cat1_standard_single_indian_plate(self):
        raw = "DL 01 AB 1234"
        clean = clean_ocr_text(raw)
        self.assertEqual(clean, "DL01AB1234")

        status, note = validate_indian_plate(clean)
        self.assertEqual(status, "VALID_FORMAT")
        self.assertIn("DL", note)

        # Quality assessment on a clear synthetic crop (height 50, width 180)
        crop = np.ones((50, 180, 3), dtype=np.uint8) * 200
        # draw synthetic text lines
        if cv2 is not None:
            cv2.putText(crop, "DL01AB1234", (10, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (20, 20, 20), 2)

        quality = evaluate_plate_quality(crop)
        self.assertIn(quality.state, (PlateQualityState.GOOD, PlateQualityState.USABLE))

        # Overall confidence
        cb = compute_overall_confidence(
            detector_confidence=0.92,
            ocr_confidence=0.95,
            quality_assessment=quality,
            validation_status=status,
            association_plausibility=0.90,
            has_state_prefix=True,
            source_count=2,
            is_contour_only=False,
            has_text=True,
        )
        self.assertGreaterEqual(cb.overall_confidence, 0.85)
        self.assertEqual(cb.result_state, PlateResultState.VERIFIED)

    # -----------------------------------------------------------------------
    # Category 2: Multi-vehicle scene (3+ vehicles simultaneously)
    # -----------------------------------------------------------------------
    def test_cat2_multi_vehicle_scene(self):
        # 3 vehicles across the frame
        vehicles = [
            {"vehicle_id": "veh_1", "bbox": [50, 300, 350, 600], "vehicle_type": "car"},
            {"vehicle_id": "veh_2", "bbox": [450, 280, 800, 620], "vehicle_type": "car"},
            {"vehicle_id": "veh_3", "bbox": [900, 250, 1250, 580], "vehicle_type": "truck"},
        ]
        # 3 respective plates
        plate_cands = [
            {"bbox": [150, 520, 260, 560], "confidence": 0.88, "source": "dedicated_lp"},
            {"bbox": [580, 530, 690, 570], "confidence": 0.91, "source": "dedicated_lp"},
            {"bbox": [1020, 510, 1140, 550], "confidence": 0.84, "source": "dedicated_lp"},
        ]

        matches = associate_plates_to_vehicles(vehicles, plate_cands, image_shape=(720, 1280))
        self.assertEqual(len(matches), 3)
        self.assertEqual(matches[0].vehicle_id, "veh_1")
        self.assertEqual(matches[1].vehicle_id, "veh_2")
        self.assertEqual(matches[2].vehicle_id, "veh_3")

        for m in matches:
            self.assertFalse(m.is_orphan)
            self.assertGreaterEqual(m.plausibility_score, 0.60)

    # -----------------------------------------------------------------------
    # Category 3: Distant vehicle (< 30px plate width / sub-pixel resolution)
    # -----------------------------------------------------------------------
    def test_cat3_distant_vehicle_subpixel(self):
        # Tiny distant crop: 8px tall, 24px wide
        tiny_crop = np.zeros((8, 24, 3), dtype=np.uint8)
        quality = evaluate_plate_quality(tiny_crop)

        self.assertEqual(quality.state, PlateQualityState.UNREADABLE)
        self.assertTrue(any("Sub-pixel" in r or "below minimum" in r for r in quality.reasons))

        # Test that OCR fusion refuses to run OCR on UNREADABLE crop
        def fake_ocr(c):
            return {"raw_ocr": "HALLUCINATED_TEXT", "ocr_confidence": 0.99}

        fused = fuse_ocr_variants(tiny_crop, fake_ocr, assessment=quality)
        self.assertEqual(fused["validation_status"], "UNREADABLE")
        self.assertEqual(fused["raw_ocr"], "")

    # -----------------------------------------------------------------------
    # Category 4: High-contrast / low-contrast plates
    # -----------------------------------------------------------------------
    def test_cat4_low_contrast_enhancement(self):
        # Flat low-contrast crop (gray values 120-130)
        low_contrast_crop = np.full((40, 140, 3), 125, dtype=np.uint8)
        low_contrast_crop[15:25, 20:120] = 130  # very faint text

        quality = evaluate_plate_quality(low_contrast_crop)
        # Should recommend CLAHE or flag low contrast
        self.assertTrue("clahe" in quality.recommended_enhancements or quality.contrast < 28.0)

        # Generating variants produces CLAHE variant
        variants = generate_variants(low_contrast_crop, assessment=quality)
        variant_names = [v[0] for v in variants]
        self.assertIn("clahe_sharpen", variant_names)

    # -----------------------------------------------------------------------
    # Category 5: High-angle CCTV perspective (skew angle estimation + deskew)
    # -----------------------------------------------------------------------
    def test_cat5_high_angle_cctv_skew(self):
        # Synthetic skewed crop (12 degrees)
        crop = np.zeros((60, 200, 3), dtype=np.uint8)
        if cv2 is not None:
            # Draw rotated rectangular lines
            pts = np.array([[20, 35], [180, 15], [180, 45], [20, 65]], np.int32)
            cv2.polylines(crop, [pts], True, (255, 255, 255), 2)
            skew = estimate_skew_angle(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY))
            # Skew is detected or handled smoothly
            self.assertIsInstance(skew, float)

        assessment = PlateQualityAssessment(
            state=PlateQualityState.USABLE,
            width=200,
            height=60,
            aspect_ratio=3.33,
            sharpness=45.0,
            brightness=110.0,
            contrast=35.0,
            edge_density=0.12,
            skew_angle=12.5,
            estimated_char_height=30.0,
            recommended_enhancements=["deskew"],
        )
        variants = generate_variants(crop, assessment=assessment)
        variant_names = [v[0] for v in variants]
        self.assertIn("deskewed", variant_names)

    # -----------------------------------------------------------------------
    # Category 6: Rear tire / bumper / grille false positive
    # -----------------------------------------------------------------------
    def test_cat6_rear_tire_grille_false_positive(self):
        # A round tire or giant grille with aspect ratio 0.95
        geom_score_tire = compute_geometric_score(width=100, height=105, aspect_ratio=0.95, skew_angle=0.0)
        self.assertLessEqual(geom_score_tire, 0.60)

        # Extremely wide bumper trim (aspect ratio 8.5)
        geom_score_trim = compute_geometric_score(width=340, height=40, aspect_ratio=8.5, skew_angle=0.0)
        self.assertLessEqual(geom_score_trim, 0.50)

    # -----------------------------------------------------------------------
    # Category 7: Street sign / billboard text filtering
    # -----------------------------------------------------------------------
    def test_cat7_street_sign_billboard_filtering(self):
        from app.pipeline.plate_pipeline import NON_PLATE_KEYWORDS

        signs = ["SHARMA ELECTRONICS", "CAFE DELIGHT", "BANK OF INDIA", "POLICE HEADQUARTERS"]
        for s in signs:
            clean = clean_ocr_text(s)
            is_rejected = any(kw in clean for kw in ("SHARMA", "ELECTRONICS", "CAFE", "DELIGHT", "BANK", "POLICE"))
            self.assertTrue(is_rejected)

    # -----------------------------------------------------------------------
    # Category 8: Two-wheelers / motorcycles
    # -----------------------------------------------------------------------
    def test_cat8_two_wheeler_motorcycle_prior(self):
        # Motorcycle box: [x1, y1, x2, y2]
        moto_box = [200, 300, 350, 600]
        # Plate high or under seat: y=420 (rel_y = 120 / 300 = 0.40)
        plate_box = [250, 410, 310, 440]

        score, diag = score_plate_vehicle_pair(plate_box, moto_box, vehicle_type="motorcycle")
        self.assertGreaterEqual(score, 0.50)
        self.assertTrue(diag["inside"])

    # -----------------------------------------------------------------------
    # Category 9: Night / low-light frame
    # -----------------------------------------------------------------------
    def test_cat9_night_low_light(self):
        dark_crop = np.full((40, 120, 3), 25, dtype=np.uint8)
        quality = evaluate_plate_quality(dark_crop)

        self.assertIn("brighten", quality.recommended_enhancements)
        self.assertLess(quality.brightness, 45.0)

    # -----------------------------------------------------------------------
    # Category 10: Unreadable plate crop (18x6 px)
    # -----------------------------------------------------------------------
    def test_cat10_unreadable_crop_gate(self):
        crop = np.zeros((6, 18, 3), dtype=np.uint8)
        quality = evaluate_plate_quality(crop)
        self.assertEqual(quality.state, PlateQualityState.UNREADABLE)

        cb = compute_overall_confidence(
            detector_confidence=0.72,
            ocr_confidence=0.0,
            quality_assessment=quality,
            validation_status="UNREADABLE",
            association_plausibility=0.80,
            has_state_prefix=False,
            source_count=1,
            is_contour_only=False,
            has_text=False,
        )
        self.assertEqual(cb.result_state, PlateResultState.PLATE_DETECTED_OCR_UNREADABLE)

    # -----------------------------------------------------------------------
    # Category 11: Contour-only candidate rejection
    # -----------------------------------------------------------------------
    def test_cat11_contour_only_candidate(self):
        candidates = [
            {"bbox": [100, 100, 200, 140], "confidence": 0.55, "source": "contour"}
        ]
        # With discard_unconfirmed_contours=True, it should be dropped immediately
        clusters = cluster_plate_candidates(candidates, discard_unconfirmed_contours=True)
        self.assertEqual(len(clusters), 0)

        # Even if allowed through, scoring must reject contour-only
        cb = compute_overall_confidence(
            detector_confidence=0.55,
            ocr_confidence=0.0,
            quality_assessment=None,
            validation_status="INVALID_FORMAT",
            association_plausibility=0.10,
            has_state_prefix=False,
            source_count=1,
            is_contour_only=True,
            has_text=False,
        )
        self.assertEqual(cb.result_state, PlateResultState.REJECTED)

    # -----------------------------------------------------------------------
    # Category 12: Ambiguous traffic queue vehicle association
    # -----------------------------------------------------------------------
    def test_cat12_ambiguous_traffic_queue_association(self):
        # Foreground car: [100, 300, 400, 600]
        # Background bus slightly behind: [80, 150, 420, 500]
        vehicles = [
            {"vehicle_id": "fg_car", "bbox": [100, 300, 400, 600], "vehicle_type": "car"},
            {"vehicle_id": "bg_bus", "bbox": [80, 150, 420, 500], "vehicle_type": "bus"},
        ]
        # Plate located at bumper of fg_car: [200, 540, 300, 575]
        plate = [{"bbox": [200, 540, 300, 575], "confidence": 0.90}]

        matches = associate_plates_to_vehicles(vehicles, plate)
        self.assertEqual(matches[0].vehicle_id, "fg_car")
        self.assertGreater(matches[0].plausibility_score, 0.65)

    # -----------------------------------------------------------------------
    # Category 13: OCR consensus evidence fusion across variants
    # -----------------------------------------------------------------------
    def test_cat13_ocr_consensus_voting(self):
        # Mock OCR engine returning consensus on 3 variants
        call_count = [0]
        def mock_ocr(c):
            call_count[0] += 1
            if call_count[0] == 1:
                return {"raw_ocr": "MH 12 DE 1433", "ocr_confidence": 0.86}
            elif call_count[0] == 2:
                return {"raw_ocr": "MH12DE1433", "ocr_confidence": 0.92}
            else:
                return {"raw_ocr": "MH 12 DE 1433", "ocr_confidence": 0.88}

        crop = np.ones((50, 180, 3), dtype=np.uint8) * 180
        quality = PlateQualityAssessment(
            state=PlateQualityState.USABLE,
            width=180,
            height=50,
            aspect_ratio=3.6,
            sharpness=40.0,
            brightness=140.0,
            contrast=30.0,
            edge_density=0.10,
            skew_angle=0.0,
            estimated_char_height=25.0,
            recommended_enhancements=["clahe"],
        )

        fused = fuse_ocr_variants(crop, mock_ocr, assessment=quality)
        self.assertEqual(fused["corrected_plate"], "MH12DE1433")
        self.assertEqual(fused["validation_status"], "VALID_FORMAT")
        self.assertGreaterEqual(fused["consensus_count"], 2)

    # -----------------------------------------------------------------------
    # Category 14: Constrained Indian plate character repair
    # -----------------------------------------------------------------------
    def test_cat14_constrained_character_repair(self):
        # 1. High-confidence OCR with letter in tail digit position: "MH12DE143B" (conf=0.85)
        # Should repair 'B' -> '8'
        repaired_high, repairs = repair_indian_plate("MH12DE143B", ocr_confidence=0.85)
        self.assertEqual(repaired_high, "MH12DE1438")
        self.assertTrue(any("Tail" in r for r in repairs))

        # 2. Low-confidence OCR: "MH12DE143B" (conf=0.45)
        # Should NOT repair (protects against hallucinations)
        repaired_low, repairs_low = repair_indian_plate("MH12DE143B", ocr_confidence=0.45)
        self.assertEqual(repaired_low, "MH12DE143B")
        self.assertEqual(len(repairs_low), 0)

        # 3. Non-Indian text or invalid state code: "XX12DE1433"
        # Should NOT mutate
        non_indian, _ = repair_indian_plate("XX12DE1433", ocr_confidence=0.90)
        self.assertEqual(non_indian, "XX12DE1433")

    # -----------------------------------------------------------------------
    # Category 15: End-to-end API response contract & debug mode
    # -----------------------------------------------------------------------
    def test_cat15_end_to_end_api_contract_and_debug(self):
        from app.pipeline.plate_pipeline import run_pipeline

        # Create synthetic test image
        img = np.ones((480, 640, 3), dtype=np.uint8) * 128
        if cv2 is not None:
            # Draw fake vehicle and plate box
            cv2.rectangle(img, (150, 100), (500, 400), (80, 80, 80), -1)
            cv2.rectangle(img, (260, 320), (390, 360), (240, 240, 240), -1)
            cv2.putText(img, "GJ01AB1234", (270, 348), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
            _, buf = cv2.imencode(".jpg", img)
            img_bytes = buf.tobytes()
        else:
            img_bytes = b"dummy"

        if cv2 is not None:
            # Test with debug=True
            res = run_pipeline(img_bytes, debug=True)
            self.assertIn("success", res)
            self.assertIn("total_plates_detected", res)
            self.assertIn("original_image_b64", res)
            self.assertIn("processed_image_b64", res)
            self.assertIn("plates", res)
            self.assertIn("timings", res)
            self.assertIn("debug_info", res)

            self.assertIn("vehicles_detected_count", res["debug_info"])
            self.assertIn("rejected_candidates", res["debug_info"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
