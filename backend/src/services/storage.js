/**
 * Hybrid persistent storage adapter.
 * Connects to MongoDB Atlas via Mongoose if accessible;
 * seamlessly provides file-backed JSON persistence in `backend/data/`
 * as a local fallback whenever MongoDB Atlas connection is unreachable
 * (e.g. Atlas IP whitelist restriction).
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { normalizePlateNumber, matchPlateAgainstRecords } = require("../utils/plateUtils");

const DATA_DIR = path.join(__dirname, "../../data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const RECORDS_FILE = path.join(DATA_DIR, "plate_records.json");
const ALERTS_FILE = path.join(DATA_DIR, "plate_alerts.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit_logs.json");

// Helper to safely read JSON file
function readJson(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

// Helper to safely write JSON file
function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

// Check if Mongoose is connected to MongoDB
function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

// ---------------------------------------------------------------------------
// Plate Records Operations
// ---------------------------------------------------------------------------

async function getPlateRecords(query = {}) {
  const { search, status, category, priority } = query;

  if (isMongoConnected()) {
    try {
      const PlateRecord = require("../models/PlateRecord");
      const PlateAlert = require("../models/PlateAlert");

      const filter = {};
      if (status && status.toUpperCase() !== "ALL") filter.status = status.toUpperCase();
      if (category && category.toUpperCase() !== "ALL") filter.category = category;
      if (priority && priority.toUpperCase() !== "ALL") filter.priority = priority.toUpperCase();

      if (search && search.trim()) {
        const clean = search.trim();
        const norm = normalizePlateNumber(clean);
        filter.$or = [
          { plate_number: { $regex: clean, $options: "i" } },
          { normalized_plate_number: { $regex: norm || clean, $options: "i" } },
          { recordId: { $regex: clean, $options: "i" } },
          { reference_id: { $regex: clean, $options: "i" } },
          { description: { $regex: clean, $options: "i" } },
        ];
      }

      const records = await PlateRecord.find(filter).sort({ createdAt: -1 }).lean();
      const recordIds = records.map((r) => r._id);
      const alertAgg = await PlateAlert.aggregate([
        { $match: { plate_record_id: { $in: recordIds } } },
        { $group: { _id: "$plate_record_id", totalAlerts: { $sum: 1 }, lastDetected: { $max: "$detected_at" } } },
      ]);

      const alertMap = {};
      alertAgg.forEach((a) => {
        alertMap[a._id.toString()] = a;
      });

      return records.map((rec) => {
        const stats = alertMap[rec._id.toString()] || { totalAlerts: 0, lastDetected: null };
        return {
          ...rec,
          id: rec._id.toString(),
          created_at: rec.createdAt,
          updated_at: rec.updatedAt,
          alert_count: stats.totalAlerts,
          total_alerts: stats.totalAlerts,
          total_detections: stats.totalAlerts,
          last_detected: stats.lastDetected,
        };
      });
    } catch (err) {
      console.warn("MongoDB query failed, falling back to local store:", err.message);
    }
  }

  // Local file fallback
  let records = readJson(RECORDS_FILE, []);
  const alerts = readJson(ALERTS_FILE, []);

  if (status && status.toUpperCase() !== "ALL") {
    records = records.filter((r) => (r.status || "").toUpperCase() === status.toUpperCase());
  }
  if (category && category.toUpperCase() !== "ALL") {
    records = records.filter((r) => r.category === category);
  }
  if (priority && priority.toUpperCase() !== "ALL") {
    records = records.filter((r) => (r.priority || "").toUpperCase() === priority.toUpperCase());
  }
  if (search && search.trim()) {
    const clean = search.trim().toLowerCase();
    const norm = normalizePlateNumber(clean).toLowerCase();
    records = records.filter((r) =>
      (r.plate_number || "").toLowerCase().includes(clean) ||
      (r.normalized_plate_number || "").toLowerCase().includes(norm || clean) ||
      (r.recordId || "").toLowerCase().includes(clean) ||
      (r.reference_id || "").toLowerCase().includes(clean) ||
      (r.description || "").toLowerCase().includes(clean)
    );
  }

  return records.map((rec) => {
    const recAlerts = alerts.filter(
      (a) => a.plate_record_id === rec.id || a.plate_record_ref === rec.recordId || a.detected_plate_number === rec.normalized_plate_number
    );
    const last = recAlerts.length > 0 ? recAlerts[0].detected_at : null;
    return {
      ...rec,
      created_at: rec.createdAt || rec.created_at,
      updated_at: rec.updatedAt || rec.updated_at,
      alert_count: recAlerts.length,
      total_alerts: recAlerts.length,
      total_detections: recAlerts.length,
      last_detected: last,
    };
  });
}

async function createPlateRecord(data) {
  const raw = (data.plate_number || "").trim();
  const normalized = normalizePlateNumber(raw);

  if (!raw || !normalized || normalized.length < 3) {
    throw new Error("Invalid plate number. Must contain at least 3 alphanumeric characters.");
  }

  if (isMongoConnected()) {
    try {
      const PlateRecord = require("../models/PlateRecord");
      const existing = await PlateRecord.findOne({ normalized_plate_number: normalized });
      if (existing) {
        throw new Error(`A record with plate number '${normalized}' already exists (${existing.recordId}).`);
      }

      const rec = new PlateRecord({
        plate_number: raw,
        normalized_plate_number: normalized,
        category: data.category || "OTHER",
        priority: (data.priority || "HIGH").toUpperCase(),
        status: (data.status || "ACTIVE").toUpperCase(),
        description: (data.description || "").trim(),
        reference_id: (data.reference_id || "").trim(),
      });
      await rec.save();
      await logAudit("RECORD_CREATED", "RECORD", rec.recordId, {
        plate_number: raw,
        normalized_plate_number: normalized,
        category: rec.category,
        priority: rec.priority,
        status: rec.status,
      });
      return rec.toJSON();
    } catch (err) {
      if (err.message.includes("already exists")) throw err;
      console.warn("MongoDB create failed, falling back to local store:", err.message);
    }
  }

  // Local storage
  const records = readJson(RECORDS_FILE, []);
  const existing = records.find((r) => r.normalized_plate_number === normalized);
  if (existing) {
    throw new Error(`A record with plate number '${normalized}' already exists (${existing.recordId}).`);
  }

  const recordNum = records.length + 1;
  const newRecord = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    recordId: `PR-${String(recordNum).padStart(4, "0")}`,
    plate_number: raw,
    normalized_plate_number: normalized,
    category: data.category || "OTHER",
    priority: (data.priority || "HIGH").toUpperCase(),
    status: (data.status || "ACTIVE").toUpperCase(),
    description: (data.description || "").trim(),
    reference_id: (data.reference_id || "").trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  records.unshift(newRecord);
  writeJson(RECORDS_FILE, records);

  await logAudit("RECORD_CREATED", "RECORD", newRecord.recordId, {
    plate_number: raw,
    normalized_plate_number: normalized,
    category: newRecord.category,
    priority: newRecord.priority,
    status: newRecord.status,
  });

  return newRecord;
}

async function getPlateRecordById(id) {
  if (isMongoConnected()) {
    try {
      const PlateRecord = require("../models/PlateRecord");
      const PlateAlert = require("../models/PlateAlert");
      const query = id.startsWith("PR-") ? { recordId: id } : { _id: id };
      const record = await PlateRecord.findOne(query).lean();
      if (record) {
        const alerts = await PlateAlert.find({
          $or: [{ plate_record_id: record._id }, { detected_plate_number: record.normalized_plate_number }],
        })
          .sort({ detected_at: -1 })
          .limit(50)
          .lean();

        return {
          ...record,
          id: record._id.toString(),
          total_detections: alerts.length,
          total_alerts: alerts.length,
          last_detected: alerts[0]?.detected_at || null,
          alerts,
        };
      }
    } catch (err) {
      console.warn("MongoDB get record failed, falling back to local store:", err.message);
    }
  }

  const records = readJson(RECORDS_FILE, []);
  const record = records.find((r) => r.id === id || r.recordId === id);
  if (!record) return null;

  const alerts = readJson(ALERTS_FILE, []);
  const recAlerts = alerts
    .filter((a) => a.plate_record_id === record.id || a.plate_record_ref === record.recordId || a.detected_plate_number === record.normalized_plate_number)
    .sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));

  return {
    ...record,
    total_detections: recAlerts.length,
    total_alerts: recAlerts.length,
    last_detected: recAlerts[0]?.detected_at || null,
    alerts: recAlerts,
  };
}

async function updatePlateRecord(id, updates) {
  if (isMongoConnected()) {
    try {
      const PlateRecord = require("../models/PlateRecord");
      const query = id.startsWith("PR-") ? { recordId: id } : { _id: id };
      const record = await PlateRecord.findOne(query);
      if (record) {
        const prevStatus = record.status;
        if (updates.plate_number) {
          record.plate_number = updates.plate_number.trim();
          record.normalized_plate_number = normalizePlateNumber(updates.plate_number.trim());
        }
        if (updates.category) record.category = updates.category;
        if (updates.priority) record.priority = updates.priority.toUpperCase();
        if (updates.status) record.status = updates.status.toUpperCase();
        if (updates.description !== undefined) record.description = updates.description.trim();
        if (updates.reference_id !== undefined) record.reference_id = updates.reference_id.trim();

        await record.save();
        await logAudit(prevStatus !== record.status ? `RECORD_STATUS_${record.status}` : "RECORD_UPDATED", "RECORD", record.recordId, updates);
        return record.toJSON();
      }
    } catch (err) {
      console.warn("MongoDB update record failed, falling back to local store:", err.message);
    }
  }

  const records = readJson(RECORDS_FILE, []);
  const index = records.findIndex((r) => r.id === id || r.recordId === id);
  if (index === -1) return null;

  const record = records[index];
  const prevStatus = record.status;

  if (updates.plate_number) {
    record.plate_number = updates.plate_number.trim();
    record.normalized_plate_number = normalizePlateNumber(updates.plate_number.trim());
  }
  if (updates.category) record.category = updates.category;
  if (updates.priority) record.priority = updates.priority.toUpperCase();
  if (updates.status) record.status = updates.status.toUpperCase();
  if (updates.description !== undefined) record.description = updates.description.trim();
  if (updates.reference_id !== undefined) record.reference_id = updates.reference_id.trim();
  record.updatedAt = new Date().toISOString();

  records[index] = record;
  writeJson(RECORDS_FILE, records);

  await logAudit(prevStatus !== record.status ? `RECORD_STATUS_${record.status}` : "RECORD_UPDATED", "RECORD", record.recordId, updates);
  return record;
}

async function deactivateOrDeletePlateRecord(id, hard = false) {
  if (hard) {
    if (isMongoConnected()) {
      try {
        const PlateRecord = require("../models/PlateRecord");
        const query = id.startsWith("PR-") ? { recordId: id } : { _id: id };
        await PlateRecord.deleteOne(query);
      } catch (err) {
        console.warn("MongoDB delete record failed:", err.message);
      }
    }
    let records = readJson(RECORDS_FILE, []);
    records = records.filter((r) => r.id !== id && r.recordId !== id);
    writeJson(RECORDS_FILE, records);
    await logAudit("RECORD_DELETED", "RECORD", id, {});
    return true;
  }

  return updatePlateRecord(id, { status: "INACTIVE" });
}

// ---------------------------------------------------------------------------
// Plate Alerts Operations
// ---------------------------------------------------------------------------

async function getPlateAlerts(query = {}) {
  const { search, status, priority, from, to } = query;

  if (isMongoConnected()) {
    try {
      const PlateAlert = require("../models/PlateAlert");
      const filter = {};
      if (status && status.toUpperCase() !== "ALL") filter.status = status.toUpperCase();
      if (priority && priority.toUpperCase() !== "ALL") filter.priority = priority.toUpperCase();
      if (from || to) {
        filter.detected_at = {};
        if (from) filter.detected_at.$gte = new Date(from);
        if (to) {
          const toDate = new Date(to);
          toDate.setHours(23, 59, 59, 999);
          filter.detected_at.$lte = toDate;
        }
      }
      if (search && search.trim()) {
        const clean = search.trim();
        filter.$or = [
          { detected_plate_number: { $regex: clean, $options: "i" } },
          { alertId: { $regex: clean, $options: "i" } },
          { source_image_name: { $regex: clean, $options: "i" } },
          { plate_record_ref: { $regex: clean, $options: "i" } },
        ];
      }

      const alerts = await PlateAlert.find(filter).sort({ detected_at: -1 }).lean();
      return alerts.map((a) => ({ ...a, id: a._id.toString() }));
    } catch (err) {
      console.warn("MongoDB get alerts failed, falling back to local store:", err.message);
    }
  }

  let alerts = readJson(ALERTS_FILE, []);
  if (status && status.toUpperCase() !== "ALL") {
    alerts = alerts.filter((a) => (a.status || "").toUpperCase() === status.toUpperCase());
  }
  if (priority && priority.toUpperCase() !== "ALL") {
    alerts = alerts.filter((a) => (a.priority || "").toUpperCase() === priority.toUpperCase());
  }
  if (from) {
    const fromDate = new Date(from);
    alerts = alerts.filter((a) => new Date(a.detected_at) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    alerts = alerts.filter((a) => new Date(a.detected_at) <= toDate);
  }
  if (search && search.trim()) {
    const clean = search.trim().toLowerCase();
    alerts = alerts.filter(
      (a) =>
        (a.detected_plate_number || "").toLowerCase().includes(clean) ||
        (a.alertId || "").toLowerCase().includes(clean) ||
        (a.source_image_name || "").toLowerCase().includes(clean) ||
        (a.plate_record_ref || "").toLowerCase().includes(clean)
    );
  }

  return alerts.sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
}

async function getPlateAlertById(id) {
  if (isMongoConnected()) {
    try {
      const PlateAlert = require("../models/PlateAlert");
      const query = id.startsWith("ALT-") ? { alertId: id } : { _id: id };
      const alert = await PlateAlert.findOne(query).lean();
      if (alert) return { ...alert, id: alert._id.toString() };
    } catch (err) {
      console.warn("MongoDB get alert by id failed, falling back to local store:", err.message);
    }
  }

  const alerts = readJson(ALERTS_FILE, []);
  return alerts.find((a) => a.id === id || a.alertId === id) || null;
}

async function createPlateAlert(data) {
  if (isMongoConnected()) {
    try {
      const PlateAlert = require("../models/PlateAlert");
      const alert = new PlateAlert(data);
      await alert.save();
      await logAudit("ALERT_GENERATED", "ALERT", alert.alertId, {
        plate_number: alert.detected_plate_number,
        priority: alert.priority,
        source_image_name: alert.source_image_name,
      });
      return alert.toJSON();
    } catch (err) {
      console.warn("MongoDB create alert failed, falling back to local store:", err.message);
    }
  }

  const alerts = readJson(ALERTS_FILE, []);
  const alertNum = alerts.length + 1;
  const newAlert = {
    id: `alt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    alertId: `ALT-${String(alertNum).padStart(4, "0")}`,
    plate_record_id: data.plate_record_id || null,
    plate_record_ref: data.plate_record_ref || "",
    category: data.category || "Watchlist",
    detected_plate_number: data.detected_plate_number,
    raw_ocr: data.raw_ocr || "",
    ocr_confidence: data.ocr_confidence || 0.0,
    detection_confidence: data.detection_confidence || 0.0,
    overall_confidence: data.overall_confidence || 0.0,
    source_image_name: data.source_image_name || "source_image.jpg",
    original_image: data.original_image || "",
    original_crop: data.original_crop || "",
    enhanced_crop: data.enhanced_crop || "",
    detected_at: data.detected_at || new Date().toISOString(),
    priority: data.priority || "HIGH",
    status: data.status || "NEW",
    acknowledged_at: null,
    resolved_at: null,
    notes: data.notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  alerts.unshift(newAlert);
  writeJson(ALERTS_FILE, alerts);

  await logAudit("ALERT_GENERATED", "ALERT", newAlert.alertId, {
    plate_number: newAlert.detected_plate_number,
    priority: newAlert.priority,
    source_image_name: newAlert.source_image_name,
  });

  return newAlert;
}

async function updateAlertStatus(id, newStatus, notes) {
  const statusUpper = (newStatus || "").toUpperCase();

  if (isMongoConnected()) {
    try {
      const PlateAlert = require("../models/PlateAlert");
      const query = id.startsWith("ALT-") ? { alertId: id } : { _id: id };
      const alert = await PlateAlert.findOne(query);
      if (alert) {
        alert.status = statusUpper;
        if (notes !== undefined) alert.notes = notes;
        if (statusUpper === "ACKNOWLEDGED") alert.acknowledged_at = new Date();
        if (statusUpper === "RESOLVED") {
          if (!alert.acknowledged_at) alert.acknowledged_at = new Date();
          alert.resolved_at = new Date();
        }
        await alert.save();
        await logAudit(`ALERT_${statusUpper}`, "ALERT", alert.alertId, { status: statusUpper, notes });
        return alert.toJSON();
      }
    } catch (err) {
      console.warn("MongoDB update alert failed, falling back to local store:", err.message);
    }
  }

  const alerts = readJson(ALERTS_FILE, []);
  const index = alerts.findIndex((a) => a.id === id || a.alertId === id);
  if (index === -1) return null;

  const alert = alerts[index];
  alert.status = statusUpper;
  if (notes !== undefined) alert.notes = notes;
  if (statusUpper === "ACKNOWLEDGED") alert.acknowledged_at = new Date().toISOString();
  if (statusUpper === "RESOLVED") {
    if (!alert.acknowledged_at) alert.acknowledged_at = new Date().toISOString();
    alert.resolved_at = new Date().toISOString();
  }
  alert.updatedAt = new Date().toISOString();

  alerts[index] = alert;
  writeJson(ALERTS_FILE, alerts);

  await logAudit(`ALERT_${statusUpper}`, "ALERT", alert.alertId, { status: statusUpper, notes });
  return alert;
}

// ---------------------------------------------------------------------------
// Dashboard and Audit Operations
// ---------------------------------------------------------------------------

async function logAudit(action, entity_type, entity_id, details) {
  const entry = {
    id: `aud_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    action,
    entity_type,
    entity_id: entity_id || "",
    details: details || {},
    timestamp: new Date().toISOString(),
  };

  if (isMongoConnected()) {
    try {
      const AuditLog = require("../models/AuditLog");
      await AuditLog.create(entry);
      return entry;
    } catch (err) {
      // fallback
    }
  }

  const logs = readJson(AUDIT_FILE, []);
  logs.unshift(entry);
  if (logs.length > 200) logs.length = 200; // retain latest 200
  writeJson(AUDIT_FILE, logs);
  return entry;
}

async function getDashboardStats() {
  const records = await getPlateRecords();
  const alerts = await getPlateAlerts();
  const auditLogs = await getAuditLogs();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeRecords = records.filter((r) => r.status === "ACTIVE").length;
  const newAlerts = alerts.filter((a) => a.status === "NEW").length;
  const alertsToday = alerts.filter((a) => new Date(a.detected_at) >= today).length;

  return {
    activeRecords,
    totalRecords: records.length,
    totalAlerts: alerts.length,
    newAlerts,
    alertsToday,
    recentAlerts: alerts.slice(0, 5),
    recentAuditLogs: auditLogs.slice(0, 10),
  };
}

async function getAuditLogs(limit = 100) {
  if (isMongoConnected()) {
    try {
      const AuditLog = require("../models/AuditLog");
      const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit).lean();
      return logs;
    } catch (err) {
      // fallback
    }
  }

  const logs = readJson(AUDIT_FILE, []);
  return logs.slice(0, limit);
}

module.exports = {
  getPlateRecords,
  createPlateRecord,
  getPlateRecordById,
  updatePlateRecord,
  deactivateOrDeletePlateRecord,
  getPlateAlerts,
  getPlateAlertById,
  createPlateAlert,
  updateAlertStatus,
  logAudit,
  getDashboardStats,
  getAuditLogs,
};
