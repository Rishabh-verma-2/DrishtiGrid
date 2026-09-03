const express = require("express");
const router = express.Router();
const storage = require("../services/storage");

/**
 * GET /api/plate-alerts
 */
router.get("/", async (req, res) => {
  try {
    const alerts = await storage.getPlateAlerts(req.query);
    res.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({ success: false, error: "Failed to fetch alerts." });
  }
});

/**
 * GET /api/plate-alerts/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const alert = await storage.getPlateAlertById(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, error: "Alert not found." });
    }
    res.json({ success: true, alert });
  } catch (error) {
    console.error("Error fetching alert detail:", error);
    res.status(500).json({ success: false, error: "Failed to fetch alert detail." });
  }
});

/**
 * PATCH /api/plate-alerts/:id/status
 */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!["NEW", "ACKNOWLEDGED", "RESOLVED"].includes(status?.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: "Status must be one of: NEW, ACKNOWLEDGED, RESOLVED.",
      });
    }

    const alert = await storage.updateAlertStatus(req.params.id, status, notes);
    if (!alert) {
      return res.status(404).json({ success: false, error: "Alert not found." });
    }

    res.json({
      success: true,
      message: `Alert status updated to ${status.toUpperCase()}.`,
      alert,
    });
  } catch (error) {
    console.error("Error updating alert status:", error);
    res.status(500).json({ success: false, error: "Failed to update alert status." });
  }
});

module.exports = router;
