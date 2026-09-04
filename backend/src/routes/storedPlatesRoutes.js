/**
 * Stored Plates API Routes
 *
 * Exposes the dedicated 'storedplates' MongoDB collection — the registry of every
 * unique license plate ever detected by DrishtiGrid, regardless of source (video / image).
 *
 * GET  /api/stored-plates          — Query / filter stored plates
 * GET  /api/stored-plates/strings  — Return a plain array of unique plate number strings
 * GET  /api/stored-plates/files    — Return the local file paths for inspection
 */

const express = require("express");
const plateStorageService = require("../services/plateStorageService");

const router = express.Router();

/**
 * GET /api/stored-plates
 * Query the stored plates registry with optional filters.
 *
 * Query params:
 *   search       — partial plate number text search
 *   match_status — MATCH_FOUND | POSSIBLE_MATCH | NO_MATCH | OCR_UNCERTAIN | ALL
 *   car_color    — filter by vehicle color
 *   video_id     — filter by source video ID
 *   limit        — max records to return (default: 500)
 */
router.get("/", async (req, res) => {
  try {
    const { search, match_status, car_color, video_id, limit } = req.query;

    const plates = await plateStorageService.getStoredPlates({
      search: search?.trim() || undefined,
      match_status: match_status || undefined,
      car_color: car_color || undefined,
      video_id: video_id || undefined,
      limit: limit ? parseInt(limit, 10) : 500,
    });

    return res.json({
      success: true,
      total: plates.length,
      plates,
    });
  } catch (err) {
    console.error("[StoredPlatesRoute] GET / error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to retrieve stored plates.",
    });
  }
});

/**
 * GET /api/stored-plates/strings
 * Returns a flat array of unique plate number strings — useful for frontend dropdowns,
 * export, or cross-referencing with other systems.
 */
router.get("/strings", async (req, res) => {
  try {
    const strings = await plateStorageService.getAllPlateStrings();
    return res.json({
      success: true,
      total: strings.length,
      plates: strings,
    });
  } catch (err) {
    console.error("[StoredPlatesRoute] GET /strings error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to retrieve plate strings.",
    });
  }
});

/**
 * GET /api/stored-plates/files
 * Returns local filesystem paths for the JSON and TXT registry files.
 */
router.get("/files", (req, res) => {
  try {
    const paths = plateStorageService.getStorageFilePaths();
    return res.json({
      success: true,
      ...paths,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to retrieve file paths.",
    });
  }
});

module.exports = router;
