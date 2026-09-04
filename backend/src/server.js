require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { connectDB } = require("./config/db");

const aiRoutes = require("./routes/aiRoutes");
const plateRecordRoutes = require("./routes/plateRecordRoutes");
const alertRoutes = require("./routes/alertRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const storedPlatesRoutes = require("./routes/storedPlatesRoutes");

const PORT = parseInt(process.env.PORT || "5000", 10);
const app = express();

// ---------------------------------------------------------------------------
// Database Connection
// ---------------------------------------------------------------------------
connectDB();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({ origin: "*" }));
app.use(morgan("dev"));
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ANPR Backend" });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/api/ai", aiRoutes);
app.use("/api/plate-records", plateRecordRoutes);
app.use("/api/plate-alerts", alertRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/stored-plates", storedPlatesRoutes);

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found." });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error.",
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🚀 ANPR Backend running on http://localhost:${PORT}`);
  console.log(`   AI Service URL: ${process.env.AI_SERVICE_URL || "http://localhost:8000"}`);
  console.log(`   MongoDB: Configured`);
});

module.exports = app;
