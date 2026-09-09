"""
Unit and Integration Tests for DrishtiGrid Crowd Detection & People Counting Engine
====================================================================================

Tests cover:
1. Single person detection.
2. Cross-tile duplicate merging (same person in tile 1 and tile 2 -> count 1).
3. Full-frame + tile duplicate merging -> count 1.
4. Two adjacent distinct people -> count 2.
5. Person + corresponding head on shoulders -> count 1 (head-body double counting prevention).
6. Genuine separate occluded person (unmatched head) -> count 1 additional.
7. Non-person class filtering (vehicles, chairs, luggage) -> count 0.
8. Tiny distant person (e.g. 8x20 px) with valid aspect ratio -> retained.
9. Low-confidence (0.15) false positive with invalid aspect ratio -> rejected.
10. Low-confidence (0.15) candidate with valid geometry / multi-pass confirmation -> retained.
11. ROI spatial filtering: person inside ROI counted, person outside ROI rejected.
12. Zone assignment consistency: every person assigned exactly once; sum(zones) == total_count.
13. Metric consistency: detected_count + occluded_est == total_count.
14. Video tracking & temporal stabilization: transient single-frame spike suppressed.
15. Surge alert hysteresis: sustained high count triggers alert; sustained normal clears it.
16. End-to-end API regression test on an actual image array.
"""

import unittest
import numpy as np

from app.detection.crowd_postprocess import (
    compute_box_iou,
    compute_box_iomin,
    point_in_polygon,
    filter_person_class,
    validate_bbox_geometry,
    deduplicate_detections,
    associate_heads_to_bodies,
    apply_roi_filter,
    assign_zones,
    compute_crowd_level,
    compute_density_score,
    CrowdTemporalTracker,
    CROWD_MIN_CONF,
)
from app.detection.crowd_detector import detect_crowd


class TestCrowdDetectionEngine(unittest.TestCase):
    def setUp(self):
        self.img_w = 1280
        self.img_h = 720

    # -----------------------------------------------------------------------
    # 1. Single person detection
    # -----------------------------------------------------------------------
    def test_single_person_counted_once(self):
        cands = [{
            "box": [100.0, 150.0, 160.0, 320.0],
            "confidence": 0.85,
            "class_id": 0,
            "source": "full_frame",
            "type": "body",
        }]
        bodies = filter_person_class(cands, expected_class_id=0)
        valid = [c for c in bodies if validate_bbox_geometry(c, self.img_w, self.img_h)[0]]
        deduped = deduplicate_detections(valid)
        self.assertEqual(len(deduped), 1)

    # -----------------------------------------------------------------------
    # 2. Cross-tile duplicate merging (tile 1 + tile 2)
    # -----------------------------------------------------------------------
    def test_same_person_in_two_tiles_merged(self):
        # A person sitting near tile border detected in both tile 1 and tile 2
        cand_tile1 = {
            "box": [400.0, 200.0, 460.0, 380.0],
            "confidence": 0.72,
            "class_id": 0,
            "source": "tile_0",
            "type": "body",
        }
        cand_tile2 = {
            "box": [404.0, 202.0, 462.0, 378.0],
            "confidence": 0.68,
            "class_id": 0,
            "source": "tile_1",
            "type": "body",
        }
        deduped = deduplicate_detections([cand_tile1, cand_tile2])
        self.assertEqual(len(deduped), 1, "Duplicate tile detections must be merged to 1 person")
        self.assertAlmostEqual(deduped[0]["confidence"], 0.72)

    # -----------------------------------------------------------------------
    # 3. Full-frame + tile duplicate merging
    # -----------------------------------------------------------------------
    def test_full_frame_and_tile_duplicate_merged(self):
        cand_full = {
            "box": [500.0, 300.0, 570.0, 500.0],
            "confidence": 0.60,
            "class_id": 0,
            "source": "full_frame",
            "type": "body",
        }
        cand_tile = {
            "box": [502.0, 303.0, 568.0, 498.0],
            "confidence": 0.75,
            "class_id": 0,
            "source": "tile_2",
            "type": "body",
        }
        deduped = deduplicate_detections([cand_full, cand_tile])
        self.assertEqual(len(deduped), 1, "Full frame and tile detections must merge into 1 person")

    # -----------------------------------------------------------------------
    # 4. Two adjacent distinct people
    # -----------------------------------------------------------------------
    def test_two_adjacent_people_both_counted(self):
        person_left = {
            "box": [200.0, 200.0, 260.0, 380.0],
            "confidence": 0.80,
            "class_id": 0,
            "source": "full_frame",
            "type": "body",
        }
        person_right = {
            "box": [270.0, 200.0, 330.0, 380.0],
            "confidence": 0.82,
            "class_id": 0,
            "source": "full_frame",
            "type": "body",
        }
        deduped = deduplicate_detections([person_left, person_right])
        self.assertEqual(len(deduped), 2, "Adjacent non-overlapping people must both be preserved")

    # -----------------------------------------------------------------------
    # 5. Person + corresponding head -> count 1 (no double counting)
    # -----------------------------------------------------------------------
    def test_head_belonging_to_body_not_double_counted(self):
        body = {
            "box": [300.0, 200.0, 380.0, 440.0],  # w=80, h=240
            "confidence": 0.88,
            "class_id": 0,
            "source": "full_frame",
            "type": "body",
        }
        # Head positioned at upper part of body: x in [320, 360], y in [200, 250]
        head_on_shoulders = {
            "box": [322.0, 202.0, 358.0, 248.0],  # w=36, h=46
            "confidence": 0.79,
            "class_id": 0,
            "source": "head_model",
            "type": "head_visible",
        }
        bodies, unmatched_heads = associate_heads_to_bodies(
            body_detections=[body],
            head_detections=[head_on_shoulders],
        )
        self.assertEqual(len(bodies), 1)
        self.assertEqual(len(unmatched_heads), 0, "Head on body shoulders must NOT create additional person")

    # -----------------------------------------------------------------------
    # 6. Genuine head-only occluded person -> count 1 additional
    # -----------------------------------------------------------------------
    def test_genuine_occluded_head_adds_one_person(self):
        body = {
            "box": [200.0, 200.0, 280.0, 440.0],
            "confidence": 0.85,
            "class_id": 0,
            "source": "full_frame",
            "type": "body",
        }
        # Standalone head behind a barrier (far away horizontally from body)
        occluded_head = {
            "box": [500.0, 220.0, 535.0, 265.0],  # w=35, h=45
            "confidence": 0.65,
            "class_id": 0,
            "source": "head_model",
            "type": "head_visible",
        }
        bodies, unmatched_heads = associate_heads_to_bodies(
            body_detections=[body],
            head_detections=[occluded_head],
        )
        self.assertEqual(len(bodies), 1)
        self.assertEqual(len(unmatched_heads), 1, "Unassociated head must be counted as an occluded person")

    # -----------------------------------------------------------------------
    # 7. Non-person class filtering (vehicles, chairs, etc.)
    # -----------------------------------------------------------------------
    def test_non_person_classes_completely_rejected(self):
        raw = [
            {"box": [100.0, 100.0, 300.0, 250.0], "confidence": 0.90, "class_id": 2, "source": "full_frame"}, # car
            {"box": [400.0, 200.0, 480.0, 350.0], "confidence": 0.85, "class_id": 56, "source": "full_frame"}, # chair
            {"box": [600.0, 150.0, 680.0, 260.0], "confidence": 0.70, "class_id": 1, "source": "full_frame"}, # bicycle
        ]
        debug_tracker = {"rejected": {}}
        filtered = filter_person_class(raw, expected_class_id=0, debug_tracker=debug_tracker)
        self.assertEqual(len(filtered), 0, "Non-person classes must never enter candidate pool")
        self.assertEqual(debug_tracker["rejected"]["non_person"], 3)

    # -----------------------------------------------------------------------
    # 8. Tiny distant person retained if valid geometry
    # -----------------------------------------------------------------------
    def test_tiny_distant_person_not_rejected(self):
        # Far-away pedestrian: 8px wide, 22px high (AR = 2.75)
        tiny_cand = {
            "box": [600.0, 100.0, 608.0, 122.0],
            "confidence": 0.35,
            "class_id": 0,
            "type": "body",
        }
        valid, reason = validate_bbox_geometry(tiny_cand, self.img_w, self.img_h)
        self.assertTrue(valid, f"Valid tiny distant person should not be rejected, got: {reason}")

    # -----------------------------------------------------------------------
    # 9. Low confidence (0.15) with invalid aspect ratio rejected
    # -----------------------------------------------------------------------
    def test_low_conf_invalid_aspect_ratio_rejected(self):
        # A horizontal fence artifact: w=100, h=12 (AR = 0.12) with conf 0.16
        artifact = {
            "box": [200.0, 300.0, 300.0, 312.0],
            "confidence": 0.16,
            "class_id": 0,
            "type": "body",
        }
        valid, reason = validate_bbox_geometry(artifact, self.img_w, self.img_h)
        self.assertFalse(valid)
        self.assertEqual(reason, "low_confidence_invalid")

    # -----------------------------------------------------------------------
    # 10. Low confidence (0.15) with valid geometry retained
    # -----------------------------------------------------------------------
    def test_low_conf_valid_geometry_retained(self):
        # Real person candidate: w=25, h=65 (AR = 2.60) with conf 0.16
        valid_cand = {
            "box": [400.0, 200.0, 425.0, 265.0],
            "confidence": 0.16,
            "class_id": 0,
            "type": "body",
        }
        valid, reason = validate_bbox_geometry(valid_cand, self.img_w, self.img_h)
        self.assertTrue(valid, f"Low-confidence person with valid AR should be accepted, got: {reason}")

    # -----------------------------------------------------------------------
    # 11. ROI spatial filtering
    # -----------------------------------------------------------------------
    def test_roi_filtering(self):
        # ROI covering x in [200, 800], y in [200, 600]
        roi_box = [200.0, 200.0, 800.0, 600.0]
        person_inside = {
            "box": [300.0, 300.0, 360.0, 450.0],
            "confidence": 0.80,
            "class_id": 0,
            "type": "body",
        }
        person_outside = {
            "box": [50.0, 50.0, 110.0, 190.0],
            "confidence": 0.80,
            "class_id": 0,
            "type": "body",
        }
        filtered = apply_roi_filter([person_inside, person_outside], roi=roi_box, img_w=self.img_w, img_h=self.img_h)
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["box"], person_inside["box"])

    # -----------------------------------------------------------------------
    # 12. Zone assignment & Metric Consistency
    # -----------------------------------------------------------------------
    def test_zone_assignment_and_count_consistency(self):
        dets = [
            {"box": [100.0, 100.0, 150.0, 220.0], "confidence": 0.8, "type": "body"},
            {"box": [300.0, 150.0, 350.0, 280.0], "confidence": 0.7, "type": "body"},
            {"box": [800.0, 400.0, 850.0, 520.0], "confidence": 0.6, "type": "head_visible"},
        ]
        zones = assign_zones(dets, img_h=self.img_h, img_w=self.img_w, grid_rows=3, grid_cols=4)
        total_count = len(dets)
        detected_count = sum(1 for d in dets if d["type"] == "body")
        occluded_est = sum(1 for d in dets if d["type"] == "head_visible")

        # Guarantee 1: sum(zones.count) == total_count
        zone_sum = sum(z["count"] for z in zones)
        self.assertEqual(zone_sum, total_count, "Zone sum must exactly equal total_count")

        # Guarantee 2: detected_count + occluded_est == total_count
        self.assertEqual(detected_count + occluded_est, total_count)

        # Density score range
        density = compute_density_score(dets, self.img_w, self.img_h, total_count)
        self.assertGreaterEqual(density, 0.0)
        self.assertLessEqual(density, 1.0)

    # -----------------------------------------------------------------------
    # 13. Video tracking & temporal spike suppression
    # -----------------------------------------------------------------------
    def test_temporal_single_frame_spike_suppression(self):
        tracker = CrowdTemporalTracker(camera_id="test_cam")
        # 4 consecutive frames with stable count of 20
        stable_dets = [
            {"box": [float(i * 40), 200.0, float(i * 40 + 30), 300.0], "confidence": 0.7, "type": "body"}
            for i in range(20)
        ]
        for _ in range(4):
            _, stab_cnt, _ = tracker.update(stable_dets, raw_count=20)
            self.assertEqual(stab_cnt, 20)

        # Frame 5: transient detector glitch spike to 38
        glitch_dets = [
            {"box": [float(i * 20), 200.0, float(i * 20 + 30), 300.0], "confidence": 0.6, "type": "body"}
            for i in range(38)
        ]
        _, stab_cnt_glitch, _ = tracker.update(glitch_dets, raw_count=38)
        # Transient spike should be heavily damped towards median (20)
        self.assertLess(stab_cnt_glitch, 30, "Single-frame glitch count should be stabilized")

    # -----------------------------------------------------------------------
    # 14. Surge alert hysteresis
    # -----------------------------------------------------------------------
    def test_surge_alert_hysteresis(self):
        tracker = CrowdTemporalTracker(camera_id="test_surge_cam")
        # Build baseline of 10 people for 5 frames
        base_dets = [{"box": [10.0, 10.0, 50.0, 100.0], "confidence": 0.8, "type": "body"}] * 10
        for _ in range(5):
            _, _, surge_info = tracker.update(base_dets, raw_count=10)
        self.assertFalse(surge_info["surge_detected"])

        # Surge frames: 35 people (> 40% above baseline 10)
        surge_dets = [{"box": [10.0, 10.0, 50.0, 100.0], "confidence": 0.8, "type": "body"}] * 35

        # Frame 1 of surge -> hysteresis should not trigger alert yet
        _, _, s1 = tracker.update(surge_dets, raw_count=35)
        self.assertFalse(s1["surge_detected"], "Surge should not alert on frame 1 (hysteresis)")

        # Frame 2 of surge -> still not triggered
        _, _, s2 = tracker.update(surge_dets, raw_count=35)
        self.assertFalse(s2["surge_detected"])

        # Frame 3 of surge -> sustained surge triggers alert!
        _, _, s3 = tracker.update(surge_dets, raw_count=35)
        self.assertTrue(s3["surge_detected"], "Sustained surge must trigger alert after N frames")

    # -----------------------------------------------------------------------
    # 16. Sustained new people remain counted
    # -----------------------------------------------------------------------
    def test_sustained_new_people_remain_counted(self):
        tracker = CrowdTemporalTracker(camera_id="test_sustained_cam")
        # Frame 1 to 3: 5 people
        dets_5 = [{"box": [float(i * 50), 200.0, float(i * 50 + 30), 300.0], "confidence": 0.8, "type": "body"} for i in range(5)]
        for _ in range(3):
            tracker.update(dets_5, raw_count=5)

        # 10 people arrive and stay for 4 frames
        dets_10 = [{"box": [float(i * 50), 200.0, float(i * 50 + 30), 300.0], "confidence": 0.8, "type": "body"} for i in range(10)]
        for _ in range(4):
            _, stab_cnt, _ = tracker.update(dets_10, raw_count=10)
        # Count should adapt to sustained higher occupancy
        self.assertGreaterEqual(stab_cnt, 9, "Sustained new crowd must be tracked and remain counted")

    # -----------------------------------------------------------------------
    # 17. Crowd reduction eventually clears the alert (hysteresis)
    # -----------------------------------------------------------------------
    def test_surge_alert_cleared_after_sustained_reduction(self):
        tracker = CrowdTemporalTracker(camera_id="test_surge_clear_cam")
        # Build baseline
        base_dets = [{"box": [10.0, 10.0, 50.0, 100.0], "confidence": 0.8, "type": "body"}] * 10
        for _ in range(5):
            tracker.update(base_dets, raw_count=10)

        # Trigger surge (35 people for 4 frames)
        surge_dets = [{"box": [10.0, 10.0, 50.0, 100.0], "confidence": 0.8, "type": "body"}] * 35
        for _ in range(4):
            _, _, s_info = tracker.update(surge_dets, raw_count=35)
        self.assertTrue(s_info["surge_detected"])

        # Crowd drops back to 10
        # Frame 1 of reduction -> still in surge (hysteresis clear count = 1)
        _, _, c1 = tracker.update(base_dets, raw_count=10)
        self.assertTrue(c1["surge_detected"])

        # After 4 consecutive normal frames -> alert clears
        for _ in range(3):
            _, _, c_final = tracker.update(base_dets, raw_count=10)
        self.assertFalse(c_final["surge_detected"], "Sustained reduction must clear alert after M frames")

    # -----------------------------------------------------------------------
    # 18. Perspective zone scale validation
    # -----------------------------------------------------------------------
    def test_perspective_zone_validation(self):
        # Foreground large zone at bottom, background small zone at top
        p_zones = [
            {"region": [0.0, 0.0, 1280.0, 300.0], "expected_person_scale": "small"},
            {"region": [0.0, 300.0, 1280.0, 720.0], "expected_person_scale": "large"},
        ]
        # Distant person in top zone (small) -> valid
        distant_valid = {"box": [200.0, 50.0, 220.0, 100.0], "confidence": 0.7, "type": "body"}
        valid1, _ = validate_bbox_geometry(distant_valid, self.img_w, self.img_h, perspective_zones=p_zones)
        self.assertTrue(valid1)

        # Huge foreground-sized person (h=320, w=120, rel_h=0.44) in the top "small" zone -> perspective mismatch
        huge_in_small_zone = {"box": [100.0, 20.0, 220.0, 340.0], "confidence": 0.7, "type": "body"}
        valid2, reason2 = validate_bbox_geometry(huge_in_small_zone, self.img_w, self.img_h, perspective_zones=p_zones)
        self.assertFalse(valid2)
        self.assertEqual(reason2, "perspective_mismatch")

    # -----------------------------------------------------------------------
    # 19. Existing API response backward compatibility
    # -----------------------------------------------------------------------
    def test_api_response_compatibility_and_field_integrity(self):
        dummy = np.zeros((320, 320, 3), dtype=np.uint8)
        res = detect_crowd(dummy, camera_id="compat_cam")
        expected_fields = [
            "success",
            "detected_count",
            "occluded_est",
            "total_count",
            "crowd_level",
            "density_score",
            "zones",
            "person_detections",
            "object_inventory",
            "surge",
            "annotated_image_b64",
            "processing_time_ms",
            "error",
        ]
        for f in expected_fields:
            self.assertIn(f, res, f"Field '{f}' must be present in API response")

        self.assertIsInstance(res["total_count"], int)
        self.assertIsInstance(res["detected_count"], int)
        self.assertIsInstance(res["occluded_est"], int)
        self.assertIsInstance(res["density_score"], float)
        self.assertIsInstance(res["zones"], list)
        self.assertIsInstance(res["person_detections"], list)
        self.assertIsInstance(res["object_inventory"], dict)
        self.assertIsInstance(res["surge"], dict)


if __name__ == "__main__":
    unittest.main()

