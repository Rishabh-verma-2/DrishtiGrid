"""
Comprehensive 20-Scenario Verification Suite for DrishtiGrid Crowd Engine
========================================================================

Covers the 20 mandatory validation scenarios specified in Requirement 24:
1. Empty scene (0 people)
2. 1 person
3. 5 people
4. 20 people
5. 50+ people
6. 100+ people
7. Dense overlapping crowd
8. Small/distant people (tiled pass)
9. Partial occlusion (torso visible)
10. Severe occlusion (head-only visible)
11. People touching/overlapping (source-aware deduplication)
12. Image boundary people (edge truncation)
13. Low-light scene (contrast robustness)
14. High-resolution image (1920x1080)
15. Low-resolution image (480x320)
16. ROI spatial filtering
17. Still-image mode (deterministic, no history bleed)
18. Video mode (temporal stabilization & hysteresis)
19. Missing density model fallback
20. Missing head model fallback
"""

import os
import sys
import unittest
import numpy as np

# Ensure app is on path
current_dir = os.path.dirname(os.path.abspath(__file__))
ai_service_dir = os.path.abspath(os.path.join(current_dir, ".."))
if ai_service_dir not in sys.path:
    sys.path.insert(0, ai_service_dir)

from app.detection.crowd_postprocess import (
    filter_person_class,
    validate_candidate_profile,
    validate_bbox_geometry,
    deduplicate_detections,
    associate_heads_to_bodies,
    apply_roi_filter,
    fuse_crowd_estimates,
    assign_zones,
    compute_crowd_level,
    compute_density_score,
    CrowdTemporalTracker,
)
from app.detection.crowd_density import (
    CrowdDensityEstimator,
    TextureHeadDensityEstimator,
    get_density_estimator,
)
from app.detection.crowd_tiling import (
    generate_sliding_window_tiles,
    analyze_frame_regions,
    generate_dense_region_tiles,
)
from app.detection.crowd_detector import detect_crowd


class TestCrowdEngineExtendedSuite(unittest.TestCase):
    def setUp(self):
        self.img_w = 1280
        self.img_h = 720

    # -----------------------------------------------------------------------
    # Scenario 1: Empty scene (0 people)
    # -----------------------------------------------------------------------
    def test_01_empty_scene(self):
        empty_img = np.zeros((480, 640, 3), dtype=np.uint8)
        res = detect_crowd(empty_img, camera_id="empty_cam", is_video=False)
        self.assertTrue(res["success"])
        self.assertEqual(res["total_count"], 0)
        self.assertEqual(res["crowd_level"], "ZERO")
        self.assertEqual(res["density_score"], 0.0)
        self.assertEqual(len(res["person_detections"]), 0)

    # -----------------------------------------------------------------------
    # Scenario 2: Single person
    # -----------------------------------------------------------------------
    def test_02_single_person(self):
        cands = [{
            "box": [200.0, 150.0, 280.0, 380.0],
            "confidence": 0.85,
            "class_id": 0,
            "source": "full_frame",
            "type": "body",
        }]
        valid, profile, _ = validate_candidate_profile(cands[0], self.img_w, self.img_h)
        self.assertTrue(valid)
        self.assertEqual(profile, "NORMAL_PERSON")
        deduped = deduplicate_detections(cands)
        self.assertEqual(len(deduped), 1)

    # -----------------------------------------------------------------------
    # Scenario 3: 5 people sparse scene
    # -----------------------------------------------------------------------
    def test_03_five_people_sparse(self):
        cands = [
            {"box": [float(i * 120 + 50), 200.0, float(i * 120 + 110), 380.0], "confidence": 0.82, "class_id": 0, "type": "body"}
            for i in range(5)
        ]
        fusion = fuse_crowd_estimates(
            detector_body_count=5,
            unmatched_head_count=0,
            density_estimated_count=5.2,
            density_confidence=0.75,
            overlap_ratio=0.0,
            suspicious_dense_regions_count=0,
        )
        self.assertEqual(fusion["final_count"], 5)
        self.assertEqual(fusion["estimation_method"], "detector_sparse")
        self.assertEqual(fusion["quality"], "VERY_HIGH")

    # -----------------------------------------------------------------------
    # Scenario 4: 20 people moderate crowd
    # -----------------------------------------------------------------------
    def test_04_twenty_people_moderate(self):
        fusion = fuse_crowd_estimates(
            detector_body_count=18,
            unmatched_head_count=2,
            density_estimated_count=21.0,
            density_confidence=0.82,
            overlap_ratio=0.10,
            suspicious_dense_regions_count=0,
        )
        self.assertEqual(fusion["final_count"], 20)
        self.assertEqual(fusion["estimation_method"], "detector_head_hybrid")
        self.assertIn(fusion["quality"], ["VERY_HIGH", "HIGH"])

    # -----------------------------------------------------------------------
    # Scenario 5: 50+ people dense crowd
    # -----------------------------------------------------------------------
    def test_05_fifty_plus_dense_crowd(self):
        fusion = fuse_crowd_estimates(
            detector_body_count=42,
            unmatched_head_count=9,
            density_estimated_count=58.0,
            density_confidence=0.85,
            overlap_ratio=0.38,
            suspicious_dense_regions_count=2,
        )
        self.assertGreaterEqual(fusion["final_count"], 51)
        self.assertEqual(fusion["estimation_method"], "hybrid_dense_crowd")
        self.assertGreater(fusion["uncertainty"], 0)

    # -----------------------------------------------------------------------
    # Scenario 6: 100+ people extreme gathering
    # -----------------------------------------------------------------------
    def test_06_hundred_plus_extreme(self):
        fusion = fuse_crowd_estimates(
            detector_body_count=75,
            unmatched_head_count=25,
            density_estimated_count=130.0,
            density_confidence=0.88,
            overlap_ratio=0.55,
            suspicious_dense_regions_count=4,
        )
        self.assertGreaterEqual(fusion["final_count"], 105)
        self.assertIn(fusion["estimation_method"], ["hybrid_dense_crowd"])
        self.assertEqual(compute_crowd_level(fusion["final_count"]), "CRITICAL")

    # -----------------------------------------------------------------------
    # Scenario 7: Dense overlapping crowd
    # -----------------------------------------------------------------------
    def test_07_dense_overlapping_crowd_reasoning(self):
        # 8 bodies close together in one patch
        bodies = [
            {"box": [100.0 + i * 15, 100.0, 160.0 + i * 15, 260.0], "confidence": 0.70, "type": "body"}
            for i in range(8)
        ]
        regions = analyze_frame_regions(bodies, [], img_w=640, img_h=480, grid_rows=2, grid_cols=2)
        suspicious = [r for r in regions if r.get("is_suspicious", False)]
        self.assertGreater(len(suspicious), 0, "Dense overlapping gathering must be flagged as suspicious region")

    # -----------------------------------------------------------------------
    # Scenario 8: Small / distant people (tiled pass)
    # -----------------------------------------------------------------------
    def test_08_small_distant_people_retained(self):
        small_person = {
            "box": [800.0, 100.0, 812.0, 136.0],  # 12px wide, 36px high (AR = 3.0)
            "confidence": 0.30,
            "class_id": 0,
            "source": "tile_r0_c2",
            "type": "body",
        }
        valid, profile, reason = validate_candidate_profile(small_person, self.img_w, self.img_h)
        self.assertTrue(valid, f"Small person should be validated, got {reason}")
        self.assertEqual(profile, "SMALL_PERSON")

    # -----------------------------------------------------------------------
    # Scenario 9: Partial occlusion (torso visible)
    # -----------------------------------------------------------------------
    def test_09_partial_occlusion_profile(self):
        # Occluded person behind a counter/barrier: wider than usual (w=40, h=35, AR=0.875)
        occluded = {
            "box": [300.0, 200.0, 340.0, 235.0],
            "confidence": 0.45,
            "class_id": 0,
            "is_occluded": True,
            "type": "body",
        }
        valid, profile, _ = validate_candidate_profile(occluded, self.img_w, self.img_h)
        self.assertTrue(valid)
        self.assertEqual(profile, "OCCLUDED_PERSON")

    # -----------------------------------------------------------------------
    # Scenario 10: Severe occlusion (head-only visible)
    # -----------------------------------------------------------------------
    def test_10_severe_occlusion_head_only(self):
        head = {
            "box": [450.0, 200.0, 480.0, 238.0],  # w=30, h=38
            "confidence": 0.65,
            "class_id": 0,
            "source": "head_model",
            "type": "head_visible",
        }
        valid, profile, _ = validate_candidate_profile(head, self.img_w, self.img_h)
        self.assertTrue(valid)
        self.assertEqual(profile, "HEAD_ONLY_PERSON")

    # -----------------------------------------------------------------------
    # Scenario 11: People touching/overlapping (source-aware deduplication)
    # -----------------------------------------------------------------------
    def test_11_people_touching_not_falsely_merged(self):
        # Two people standing shoulder to shoulder (horizontal overlap but distinct centers)
        person1 = {"box": [100.0, 200.0, 160.0, 380.0], "confidence": 0.80, "source": "tile_0", "type": "body"}
        person2 = {"box": [135.0, 205.0, 195.0, 385.0], "confidence": 0.78, "source": "tile_0", "type": "body"}
        deduped = deduplicate_detections([person1, person2], local_density_awareness=True)
        self.assertEqual(len(deduped), 2, "Touching distinct people must not be merged")

    # -----------------------------------------------------------------------
    # Scenario 12: Image boundary people (edge truncation)
    # -----------------------------------------------------------------------
    def test_12_image_boundary_edge_truncation(self):
        # Person entering right side of frame, partially truncated: x in [1260, 1280] (w=20, h=90, AR=4.5)
        edge_cand = {
            "box": [1260.0, 200.0, 1280.0, 290.0],
            "confidence": 0.50,
            "class_id": 0,
            "type": "body",
        }
        valid, profile, _ = validate_candidate_profile(edge_cand, self.img_w, self.img_h)
        self.assertTrue(valid)
        self.assertEqual(profile, "EDGE_TRUNCATED_PERSON")

    # -----------------------------------------------------------------------
    # Scenario 13: Low-light scene (contrast robustness)
    # -----------------------------------------------------------------------
    def test_13_low_light_density_estimator(self):
        dark_img = np.full((300, 400, 3), 25, dtype=np.uint8)  # very dark frame
        estimator = TextureHeadDensityEstimator()
        dmap, count, conf = estimator.estimate(dark_img)
        self.assertEqual(count, 0.0)
        self.assertGreaterEqual(conf, 0.5)

    # -----------------------------------------------------------------------
    # Scenario 14: High-resolution image (1920x1080)
    # -----------------------------------------------------------------------
    def test_14_high_res_tiling_coverage(self):
        tiles = generate_sliding_window_tiles(img_w=1920, img_h=1080, overlap=0.25)
        self.assertGreater(len(tiles), 2)
        # Verify complete boundary coverage
        min_x = min(t.x for t in tiles)
        max_x = max(t.x + t.w for t in tiles)
        min_y = min(t.y for t in tiles)
        max_y = max(t.y + t.h for t in tiles)
        self.assertEqual(min_x, 0)
        self.assertEqual(max_x, 1920)
        self.assertEqual(min_y, 0)
        self.assertEqual(max_y, 1080)

    # -----------------------------------------------------------------------
    # Scenario 15: Low-resolution image (480x320)
    # -----------------------------------------------------------------------
    def test_15_low_res_handling(self):
        tiles = generate_sliding_window_tiles(img_w=480, img_h=320, min_tile_dim=400)
        # Below tile dimension -> no superfluous tiles created
        self.assertLessEqual(len(tiles), 1)

    # -----------------------------------------------------------------------
    # Scenario 16: ROI spatial filtering
    # -----------------------------------------------------------------------
    def test_16_roi_polygon_filtering(self):
        poly = [[100.0, 100.0], [500.0, 100.0], [500.0, 500.0], [100.0, 500.0]]
        in_det = {"box": [200.0, 200.0, 250.0, 350.0], "confidence": 0.8, "type": "body"}
        out_det = {"box": [600.0, 200.0, 650.0, 350.0], "confidence": 0.8, "type": "body"}
        filtered = apply_roi_filter([in_det, out_det], roi=poly, img_w=self.img_w, img_h=self.img_h)
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["box"], in_det["box"])

    # -----------------------------------------------------------------------
    # Scenario 17: Still-image mode (deterministic, no history bleed)
    # -----------------------------------------------------------------------
    def test_17_still_image_mode_independent(self):
        tracker = CrowdTemporalTracker(camera_id="cam_history_bleed")
        # Build 10-person history
        base_dets = [{"box": [10.0, 10.0, 50.0, 100.0], "confidence": 0.8, "type": "body"}] * 10
        tracker.update(base_dets, raw_count=10)

        # Still image mode should NOT use this tracker
        # A test image with 2 detections must return total_count=2 without being influenced
        dummy = np.zeros((320, 320, 3), dtype=np.uint8)
        res = detect_crowd(dummy, camera_id="cam_history_bleed", is_video=False)
        self.assertEqual(res["total_count"], 0)

    # -----------------------------------------------------------------------
    # Scenario 18: Video mode (temporal stabilization & hysteresis)
    # -----------------------------------------------------------------------
    def test_18_video_mode_temporal_stabilization(self):
        tracker = CrowdTemporalTracker(camera_id="video_stab_cam")
        dets_15 = [{"box": [float(i * 30), 100.0, float(i * 30 + 20), 200.0], "confidence": 0.75, "type": "body"} for i in range(15)]
        for _ in range(5):
            _, stab_cnt, _ = tracker.update(dets_15, raw_count=15)
            self.assertEqual(stab_cnt, 15)

        # 1-frame glitch to 28
        dets_28 = [{"box": [float(i * 15), 100.0, float(i * 15 + 20), 200.0], "confidence": 0.60, "type": "body"} for i in range(28)]
        _, glitch_cnt, _ = tracker.update(dets_28, raw_count=28)
        self.assertLess(glitch_cnt, 25, "Transient 1-frame glitch must be suppressed")

    # -----------------------------------------------------------------------
    # Scenario 19: Missing density model fallback
    # -----------------------------------------------------------------------
    def test_19_missing_density_model_fallback(self):
        # Force fallback to TextureHeadDensityEstimator
        estimator = get_density_estimator(force_fallback=True)
        self.assertTrue(estimator.is_available())
        dummy = np.zeros((200, 200, 3), dtype=np.uint8)
        dmap, cnt, conf = estimator.estimate(dummy)
        self.assertIsInstance(cnt, float)
        self.assertIsInstance(conf, float)

    # -----------------------------------------------------------------------
    # Scenario 20: Missing head model fallback
    # -----------------------------------------------------------------------
    def test_20_missing_head_model_fallback(self):
        # Associate with empty heads
        bodies = [{"box": [100.0, 100.0, 160.0, 280.0], "confidence": 0.85, "type": "body"}]
        matched_bodies, unmatched_heads = associate_heads_to_bodies(bodies, [])
        self.assertEqual(len(matched_bodies), 1)
    # -----------------------------------------------------------------------
    # Scenario 21: Non-square grid partitioning & exact cell_h calculation
    # -----------------------------------------------------------------------
    def test_21_non_square_grids_and_cell_height_fix(self):
        from app.detection.crowd_tiling import analyze_frame_regions
        from app.detection.crowd_postprocess import assign_zones

        img_w, img_h = 1000, 600
        # Create test detections scattered across the frame
        test_dets = [
            {"box": [50.0, 50.0, 90.0, 150.0], "confidence": 0.85, "type": "body"},
            {"box": [300.0, 200.0, 340.0, 300.0], "confidence": 0.80, "type": "body"},
            {"box": [800.0, 450.0, 840.0, 550.0], "confidence": 0.75, "type": "body"},
            {"box": [450.0, 50.0, 480.0, 120.0], "confidence": 0.90, "type": "body"},
            {"box": [700.0, 100.0, 730.0, 180.0], "confidence": 0.88, "type": "body"},
        ]

        grid_configs = [(2, 4), (3, 5), (4, 7), (6, 3)]
        for r_cnt, c_cnt in grid_configs:
            # 1. Test analyze_frame_regions
            regions = analyze_frame_regions(
                body_detections=test_dets,
                head_detections=[],
                img_w=img_w,
                img_h=img_h,
                grid_rows=r_cnt,
                grid_cols=c_cnt,
            )
            self.assertEqual(len(regions), r_cnt * c_cnt)
            # Check cell height math: height must be img_h / r_cnt
            expected_cell_h = img_h / float(r_cnt)
            expected_cell_w = img_w / float(c_cnt)
            for reg in regions:
                rx1, ry1, rx2, ry2 = reg["bbox"]
                self.assertAlmostEqual(ry2 - ry1, expected_cell_h, delta=0.5)
                self.assertAlmostEqual(rx2 - rx1, expected_cell_w, delta=0.5)

            # 2. Test assign_zones
            zones = assign_zones(
                detections=test_dets,
                img_h=img_h,
                img_w=img_w,
                grid_rows=r_cnt,
                grid_cols=c_cnt,
            )
            self.assertEqual(len(zones), r_cnt * c_cnt)
            total_zone_count = sum(z["count"] for z in zones)
            self.assertEqual(
                total_zone_count,
                len(test_dets),
                f"Zone counts must strictly sum to total detections for grid ({r_cnt}, {c_cnt})",
            )

    # -----------------------------------------------------------------------
    # Scenario 22: Spatial residual map & Level 3 refinement tile generation
    # -----------------------------------------------------------------------
    def test_22_spatial_residual_map_and_level3_refinement(self):
        from app.detection.crowd_tiling import (
            compute_spatial_residual_map,
            generate_residual_refinement_tiles,
        )

        img_w, img_h = 1000, 800
        # Create a density map with strong energy in top-right quadrant
        density_map = np.zeros((100, 100), dtype=np.float32)
        density_map[10:40, 60:90] = 5.0  # Dense crowd pocket

        # But detector only detected one body in the bottom-left
        body_dets = [{"box": [100.0, 600.0, 150.0, 750.0], "confidence": 0.85, "type": "body"}]

        res_map, res_regions = compute_spatial_residual_map(
            density_map=density_map,
            body_detections=body_dets,
            head_detections=[],
            img_w=img_w,
            img_h=img_h,
            residual_threshold=0.20,
        )

        self.assertGreater(len(res_regions), 0, "High-residual pocket must be detected")
        # Top-right region center
        pocket = res_regions[0]
        prx1, pry1, prx2, pry2 = pocket["bbox"]
        pcx = (prx1 + prx2) / 2.0
        pcy = (pry1 + pry2) / 2.0
        self.assertGreater(pcx, 500.0, "Pocket must be located in right half")
        self.assertLess(pcy, 400.0, "Pocket must be located in upper half")

        # Generate Level 3 refinement crops
        crops = generate_residual_refinement_tiles(
            residual_regions=res_regions,
            img_w=img_w,
            img_h=img_h,
            crop_size=400,
            max_crops=3,
        )
        self.assertGreater(len(crops), 0)
        self.assertEqual(crops[0].level, 3)

    # -----------------------------------------------------------------------
    # Scenario 23: Extended JSON schema & per-stage timing integrity
    # -----------------------------------------------------------------------
    def test_23_extended_json_and_stage_timing_integrity(self):
        dummy = np.zeros((480, 640, 3), dtype=np.uint8)
        res = detect_crowd(dummy, enable_tiles=False, use_density=True)

        self.assertTrue(res["success"])
        # Check required extended fields
        self.assertIn("quality", res)
        self.assertIn("count_breakdown", res)
        self.assertIn("dense_regions", res)
        self.assertIn("residual_regions", res)
        self.assertIn("timing", res)

        # Check breakdown
        cb = res["count_breakdown"]
        self.assertIn("bodies", cb)
        self.assertIn("heads_occluded", cb)
        self.assertIn("density_estimate", cb)
        self.assertIn("residual_unlocalized", cb)

        # Check timing keys
        tm = res["timing"]
        required_timing_keys = [
            "full_frame_ms",
            "tile_inference_ms",
            "head_inference_ms",
            "dense_region_ms",
            "density_inference_ms",
            "residual_refine_ms",
            "fusion_ms",
            "total_ms",
        ]
        for k in required_timing_keys:
            self.assertIn(k, tm, f"Missing timing key {k}")
            self.assertIsInstance(tm[k], (int, float))


if __name__ == "__main__":
    unittest.main()



