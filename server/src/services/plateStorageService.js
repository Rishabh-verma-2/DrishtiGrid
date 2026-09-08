/**
 * Plate Storage Service for DrishtiGrid.
 * Manages the persistent registry of all unique license plates detected across
 * video surveillance streams and image scans.
 * Saves to MongoDB 'storedplates' collection and maintains local file backups.
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const StoredPlate = require("../models/StoredPlate");

const DATA_DIR = path.resolve(__dirname, "../../../storage_data");
const STORED_PLATES_JSON = path.join(DATA_DIR, "stored_number_plates.json");
const STORED_PLATES_TXT = path.join(DATA_DIR, "stored_number_plates.txt");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    // Non-fatal
  }
}

function readLocalPlates() {
  ensureDataDir();
  try {
    if (!fs.existsSync(STORED_PLATES_JSON)) {
      fs.writeFileSync(STORED_PLATES_JSON, JSON.stringify([], null, 2), "utf8");
      return [];
    }
    const raw = fs.readFileSync(STORED_PLATES_JSON, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("[PlateStorageService] Error reading stored_number_plates.json:", err);
    return [];
  }
}

function writeLocalPlates(plates) {
  ensureDataDir();
  try {
    fs.writeFileSync(STORED_PLATES_JSON, JSON.stringify(plates, null, 2), "utf8");
  } catch (err) {
    console.error("[PlateStorageService] Error writing stored_number_plates.json:", err);
  }
}

function updatePlainTextFile(plates) {
  ensureDataDir();
  try {
    const header = [
      "# ===========================================================================",
      "# DRISHTIGRID ANPR - REGISTERED VEHICLE NUMBER PLATES",
      `# Last Synchronized: ${new Date().toISOString()}`,
      `# Total Unique Plates: ${plates.length}`,
      "# ===========================================================================",
      "",
      "# --- CLEAN STRING PLATE LIST ---",
    ];

    const stringList = plates.map((p) => p.plate_number).filter(Boolean);
    const uniqueStrings = [...new Set(stringList)];

    const detailedList = [
      "",
      "# --- DETAILED REGISTRY ENTRIES ---",
      ...plates.map((p, i) => {
        const time = p.timestamp ? new Date(p.timestamp).toISOString() : "N/A";
        const color = p.car_color || "Unknown Color";
        const model = p.car_model || "Unknown Model";
        const conf = Math.round((p.overall_confidence || 0) * 100);
        const source = p.source_name || p.video_id || p.source_type || "Direct Ingestion";
        const loc = p.location_address || (p.latitude && p.longitude ? `${p.latitude}, ${p.longitude}` : "Unknown Location");
        return `[#${i + 1}] ${p.plate_number} | ${color} | ${model} | Conf: ${conf}% | Status: ${p.match_status || "NO_MATCH"} | Time: ${time} | Source: ${source} | Loc: ${loc}`;
      }),
    ];

    const content = [...header, ...uniqueStrings, ...detailedList, ""].join("\n");
    fs.writeFileSync(STORED_PLATES_TXT, content, "utf8");
  } catch (err) {
    console.error("[PlateStorageService] Error writing stored_number_plates.txt:", err);
  }
}

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

/**
 * Save or update a detected plate in both MongoDB and the dedicated local files.
 */
async function storePlate(plateData) {
  if (!plateData || !plateData.plate_number) return null;

  const cleanNumber = plateData.plate_number.trim().toUpperCase();
  if (
    cleanNumber === "DISTANT VEHICLE" ||
    cleanNumber === "UNREADABLE" ||
    cleanNumber === "UNREADABLE_OR_DISTANT" ||
    cleanNumber.length < 3
  ) {
    return null;
  }

  // 1. Try to save to MongoDB 'storedplates' collection
  let mongoDoc = null;
  if (isMongoConnected()) {
    try {
      mongoDoc = await StoredPlate.create({
        plate_number: cleanNumber,
        raw_ocr: plateData.raw_ocr || cleanNumber,
        car_color: plateData.car_color || null,
        car_model: plateData.car_model || null,
        source_type: plateData.source_type || "VIDEO",
        source_name: plateData.source_name || "",
        video_id: plateData.video_id || null,
        frame_second: plateData.frame_second || 0,
        first_seen_second: plateData.first_seen_second || plateData.frame_second || 0,
        last_seen_second: plateData.last_seen_second || plateData.frame_second || 0,
        occurrence_count: plateData.occurrence_count || 1,
        seen_seconds: plateData.seen_seconds || [],
        overall_confidence: plateData.overall_confidence || 0.0,
        detection_confidence: plateData.detection_confidence || 0.0,
        ocr_confidence: plateData.ocr_confidence || 0.0,
        match_status: plateData.match_status || "NO_MATCH",
        location_address: plateData.location_address || null,
        latitude: plateData.latitude || null,
        longitude: plateData.longitude || null,
        cropped_image_url: plateData.cropped_image_url || null,
        timestamp: plateData.timestamp ? new Date(plateData.timestamp) : new Date(),
      });
    } catch (mongoErr) {
      console.warn("[PlateStorageService] MongoDB save error (using file fallback):", mongoErr.message);
    }
  }

  // 2. Save into dedicated local JSON file & sync text file
  const localPlates = readLocalPlates();
  const newEntry = {
    id: mongoDoc ? mongoDoc._id.toString() : `sp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    plate_number: cleanNumber,
    raw_ocr: plateData.raw_ocr || cleanNumber,
    car_color: plateData.car_color || null,
    car_model: plateData.car_model || null,
    source_type: plateData.source_type || "VIDEO",
    source_name: plateData.source_name || "",
    video_id: plateData.video_id || null,
    frame_second: plateData.frame_second || 0,
    first_seen_second: plateData.first_seen_second || plateData.frame_second || 0,
    last_seen_second: plateData.last_seen_second || plateData.frame_second || 0,
    occurrence_count: plateData.occurrence_count || 1,
    seen_seconds: plateData.seen_seconds || [],
    overall_confidence: plateData.overall_confidence || 0.0,
    detection_confidence: plateData.detection_confidence || 0.0,
    ocr_confidence: plateData.ocr_confidence || 0.0,
    match_status: plateData.match_status || "NO_MATCH",
    location_address: plateData.location_address || null,
    latitude: plateData.latitude || null,
    longitude: plateData.longitude || null,
    cropped_image_url: plateData.cropped_image_url || null,
    timestamp: plateData.timestamp || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  localPlates.unshift(newEntry);
  writeLocalPlates(localPlates);
  updatePlainTextFile(localPlates);

  return newEntry;
}

/**
 * Retrieve all unique string number plates
 */
async function getAllPlateStrings() {
  if (isMongoConnected()) {
    try {
      const plates = await StoredPlate.distinct("plate_number");
      if (plates && plates.length > 0) return plates;
    } catch (err) {
      console.warn("[PlateStorageService] Failed to query distinct plates from MongoDB:", err.message);
    }
  }

  const localPlates = readLocalPlates();
  const strings = localPlates.map((p) => p.plate_number).filter(Boolean);
  return [...new Set(strings)];
}

/**
 * Retrieve stored plates with optional filtering
 */
async function getStoredPlates(filters = {}) {
  const maxLimit = filters.limit || 500;

  if (isMongoConnected()) {
    try {
      const query = {};
      if (filters.video_id) query.video_id = filters.video_id;
      if (filters.match_status && filters.match_status !== "ALL") query.match_status = filters.match_status;
      if (filters.car_color && filters.car_color !== "ALL") query.car_color = filters.car_color;
      if (filters.search) {
        query.plate_number = { $regex: filters.search.trim(), $options: "i" };
      }
      return await StoredPlate.find(query).sort({ timestamp: -1 }).limit(maxLimit).lean();
    } catch (err) {
      console.warn("[PlateStorageService] Failed to query plates from MongoDB:", err.message);
    }
  }

  let list = readLocalPlates();
  if (filters.video_id) list = list.filter((p) => p.video_id === filters.video_id);
  if (filters.match_status && filters.match_status !== "ALL") list = list.filter((p) => p.match_status === filters.match_status);
  if (filters.car_color && filters.car_color !== "ALL") list = list.filter((p) => p.car_color === filters.car_color);
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    list = list.filter((p) => p.plate_number?.toLowerCase().includes(q));
  }
  return list.slice(0, maxLimit);
}

function getStorageFilePaths() {
  return {
    jsonPath: STORED_PLATES_JSON,
    txtPath: STORED_PLATES_TXT,
  };
}

function clearAllStoredPlates() {
  ensureDataDir();
  try {
    fs.writeFileSync(STORED_PLATES_JSON, JSON.stringify([], null, 2), "utf8");
    const header = [
      "# ===========================================================================",
      "# DRISHTIGRID ANPR - REGISTERED VEHICLE NUMBER PLATES",
      `# Last Synchronized: ${new Date().toISOString()}`,
      "# Total Unique Plates: 0",
      "# ===========================================================================\n",
    ].join("\n");
    fs.writeFileSync(STORED_PLATES_TXT, header, "utf8");
  } catch (err) {
    console.error("[PlateStorageService] Error clearing local files:", err);
  }
}

module.exports = {
  storePlate,
  getAllPlateStrings,
  getStoredPlates,
  getStorageFilePaths,
  updatePlainTextFile,
  clearAllStoredPlates,
};

