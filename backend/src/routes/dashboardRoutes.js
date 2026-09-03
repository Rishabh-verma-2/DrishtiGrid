const express = require("express");
const router = express.Router();
const storage = require("../services/storage");

/**
 * GET /api/dashboard/stats
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await storage.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ success: false, error: "Failed to fetch dashboard statistics." });
  }
});

/**
 * GET /api/dashboard/audit-logs
 */
router.get("/audit-logs", async (req, res) => {
  try {
    const logs = await storage.getAuditLogs(100);
    res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ success: false, error: "Failed to fetch audit logs." });
  }
});

module.exports = router;
