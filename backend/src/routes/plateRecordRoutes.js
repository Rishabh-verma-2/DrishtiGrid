const express = require("express");
const router = express.Router();
const storage = require("../services/storage");

/**
 * GET /api/plate-records
 */
router.get("/", async (req, res) => {
  try {
    const records = await storage.getPlateRecords(req.query);
    res.json({
      success: true,
      count: records.length,
      records,
    });
  } catch (error) {
    console.error("Error fetching plate records:", error);
    res.status(500).json({ success: false, error: "Failed to fetch plate records." });
  }
});

/**
 * POST /api/plate-records
 */
router.post("/", async (req, res) => {
  try {
    const record = await storage.createPlateRecord(req.body);
    res.status(201).json({
      success: true,
      message: "Plate record created successfully.",
      record,
    });
  } catch (error) {
    console.error("Error creating plate record:", error.message);
    const status = error.message.includes("already exists") ? 409 : 400;
    res.status(status).json({ success: false, error: error.message || "Failed to create plate record." });
  }
});

/**
 * GET /api/plate-records/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const record = await storage.getPlateRecordById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: "Plate record not found." });
    }
    res.json({ success: true, record });
  } catch (error) {
    console.error("Error fetching record detail:", error);
    res.status(500).json({ success: false, error: "Failed to fetch record detail." });
  }
});

/**
 * PATCH /api/plate-records/:id
 */
router.patch("/:id", async (req, res) => {
  try {
    const record = await storage.updatePlateRecord(req.params.id, req.body);
    if (!record) {
      return res.status(404).json({ success: false, error: "Plate record not found." });
    }
    res.json({
      success: true,
      message: "Plate record updated successfully.",
      record,
    });
  } catch (error) {
    console.error("Error updating record:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to update record." });
  }
});

/**
 * DELETE /api/plate-records/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const hard = req.query.hard === "true";
    const result = await storage.deactivateOrDeletePlateRecord(req.params.id, hard);
    if (!result) {
      return res.status(404).json({ success: false, error: "Plate record not found." });
    }
    res.json({
      success: true,
      message: hard ? "Plate record permanently deleted." : "Plate record deactivated successfully.",
    });
  } catch (error) {
    console.error("Error deactivating/deleting record:", error);
    res.status(500).json({ success: false, error: "Failed to delete record." });
  }
});

module.exports = router;
