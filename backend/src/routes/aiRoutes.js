/**
 * AI analysis routes for single and multi-image ANPR processing,
 * with real-time plate normalization, record matching, and alert generation.
 */

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const { uploadSingle, uploadMulti, uploadVideo } = require("../middleware/upload");
const storage = require("../services/storage");
const plateStorageService = require("../services/plateStorageService");
const videoService = require("../services/videoService");
const { matchPlateAgainstRecords, normalizePlateNumber } = require("../utils/plateUtils");

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const TIMEOUT_MS = 180_000; // 3 minutes for ML processing

/**
 * Helper to process a single image buffer via the Python AI Service.
 */
async function processImageWithAIService(buffer, filename, mimetype) {
  const form = new FormData();
  form.append("image", buffer, {
    filename: filename || "upload.jpg",
    contentType: mimetype || "image/jpeg",
  });

  const response = await axios.post(`${AI_SERVICE_URL}/process`, form, {
    headers: {
      ...form.getHeaders(),
    },
    timeout: TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    responseType: "json",
    decompress: true,
  });

  return response.data;
}

/**
 * Match detected plates against database records and generate alerts for exact matches.
 */
async function matchAndAlertPlates(plates, sourceImageName, originalImageB64, allRecords) {
  const enrichedPlates = [];
  let matchCount = 0;
  let alertCount = 0;
  let uncertainCount = 0;

  for (const plate of plates) {
    const rawOcr = plate.raw_ocr || "";
    const detectedText = plate.normalized_plate || rawOcr;
    const ocrConf = plate.ocr_confidence || 0.0;
    const detConf = plate.detection_confidence || 0.0;
    const overallConf = plate.overall_confidence || 0.0;

    const matchResult = matchPlateAgainstRecords(detectedText, ocrConf, allRecords);
    let alertDoc = null;

    const isMatch =
      (matchResult.matchStatus === "MATCH_FOUND" || matchResult.matchStatus === "POSSIBLE_MATCH") &&
      matchResult.matchedRecord;

    if (isMatch) {
      matchCount++;

      // Create new PlateAlert record with visual evidence
      try {
        alertDoc = await storage.createPlateAlert({
          plate_record_id: matchResult.matchedRecord.id || matchResult.matchedRecord._id,
          plate_record_ref: matchResult.matchedRecord.recordId,
          category: matchResult.matchedRecord.category,
          detected_plate_number: normalizePlateNumber(detectedText),
          raw_ocr: rawOcr,
          ocr_confidence: ocrConf,
          detection_confidence: detConf,
          overall_confidence: overallConf,
          source_image_name: sourceImageName,
          original_image: originalImageB64 ? `data:image/jpeg;base64,${originalImageB64}` : "",
          original_crop: plate.original_crop ? `data:image/jpeg;base64,${plate.original_crop}` : "",
          enhanced_crop: plate.enhanced_crop ? `data:image/jpeg;base64,${plate.enhanced_crop}` : "",
          detected_at: new Date().toISOString(),
          priority: matchResult.matchedRecord.priority || "HIGH",
          status: "NEW",
          notes: matchResult.confidenceNote || "",
        });
        alertCount++;
      } catch (err) {
        console.error("Error creating plate alert:", err);
      }
    } else if (matchResult.matchStatus === "OCR_UNCERTAIN") {
      uncertainCount++;
    }

    // Persist plate detection record into MongoDB platedetections collection
    let detectionDoc = null;
    try {
      detectionDoc = await storage.createPlateDetection({
        video_id: null,
        source_type: "IMAGE",
        source_name: sourceImageName,
        plate_number: normalizePlateNumber(detectedText),
        raw_ocr: rawOcr,
        timestamp: new Date().toISOString(),
        cropped_image_url: plate.enhanced_crop
          ? `data:image/jpeg;base64,${plate.enhanced_crop}`
          : plate.original_crop
          ? `data:image/jpeg;base64,${plate.original_crop}`
          : null,
        car_color: plate.car_color || null,
        car_model: plate.car_model || null,
        detection_confidence: detConf,
        ocr_confidence: ocrConf,
        overall_confidence: overallConf,
        match_status: matchResult.matchStatus,
        matched_record: matchResult.matchedRecord
          ? {
              id: matchResult.matchedRecord.id || matchResult.matchedRecord._id,
              recordId: matchResult.matchedRecord.recordId,
              plate_number: matchResult.matchedRecord.plate_number,
              category: matchResult.matchedRecord.category,
              priority: matchResult.matchedRecord.priority,
              status: matchResult.matchedRecord.status,
              description: matchResult.matchedRecord.description,
            }
          : null,
        image_deleted: false,
      });
    } catch (detErr) {
      console.warn("Could not save image plate detection:", detErr.message);
    }

    // Also persist into the dedicated storedplates registry
    const normalizedNum = normalizePlateNumber(detectedText);
    if (normalizedNum && normalizedNum.length >= 3) {
      try {
        await plateStorageService.storePlate({
          plate_number: normalizedNum,
          raw_ocr: rawOcr,
          car_color: plate.car_color || null,
          car_model: plate.car_model || null,
          source_type: "IMAGE",
          source_name: sourceImageName,
          video_id: null,
          frame_second: 0,
          first_seen_second: 0,
          last_seen_second: 0,
          occurrence_count: 1,
          seen_seconds: [],
          overall_confidence: overallConf,
          detection_confidence: detConf,
          ocr_confidence: ocrConf,
          match_status: matchResult.matchStatus,
          timestamp: new Date().toISOString(),
        });
      } catch (storeErr) {
        console.warn("[aiRoutes] plateStorageService.storePlate failed for image plate:", storeErr.message);
      }
    }

    enrichedPlates.push({
      ...plate,
      match_status: matchResult.matchStatus,
      match_type: matchResult.matchType,
      confidence_note: matchResult.confidenceNote,
      matched_record: matchResult.matchedRecord
        ? {
            id: matchResult.matchedRecord.id || matchResult.matchedRecord._id,
            recordId: matchResult.matchedRecord.recordId,
            plate_number: matchResult.matchedRecord.plate_number,
            category: matchResult.matchedRecord.category,
            priority: matchResult.matchedRecord.priority,
            status: matchResult.matchedRecord.status,
            description: matchResult.matchedRecord.description,
          }
        : null,
      alert_id: alertDoc ? alertDoc.alertId : null,
      alert_db_id: alertDoc ? (alertDoc.id || alertDoc._id) : null,
      detection_id: detectionDoc ? (detectionDoc.id || detectionDoc.detectionId) : null,
    });
  }

  return {
    enrichedPlates,
    matchCount,
    alertCount,
    uncertainCount,
  };
}

/**
 * POST /api/ai/analyze-image
 * Single image analysis endpoint.
 */
router.post("/analyze-image", uploadSingle.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "No image file provided. Send a file in the 'image' field.",
    });
  }

  const startTime = Date.now();
  const { buffer, originalname, mimetype } = req.file;

  try {
    const aiData = await processImageWithAIService(buffer, originalname, mimetype);
    const allRecords = await storage.getPlateRecords();

    const { enrichedPlates, matchCount, alertCount, uncertainCount } =
      await matchAndAlertPlates(
        aiData.plates || [],
        originalname || "upload.jpg",
        aiData.original_image,
        allRecords
      );

    const totalDuration = Date.now() - startTime;

    return res.json({
      ...aiData,
      plates: enrichedPlates,
      matched_plates_count: matchCount,
      alerts_generated_count: alertCount,
      ocr_uncertain_count: uncertainCount,
      processing_time_ms: totalDuration,
    });
  } catch (err) {
    console.error("Single image analysis error:", err);
    return handleAIError(err, res);
  }
});

/**
 * POST /api/ai/analyze-images
 * Multi-image batch analysis endpoint.
 * Accepts multipart/form-data with multiple files under 'images'.
 */
router.post("/analyze-images", uploadMulti.array("images", 20), async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No image files provided. Send 1 or more images in the 'images' field.",
    });
  }

  const batchStartTime = Date.now();
  const batchId = `BATCH-${Date.now()}`;
  const totalImages = files.length;
  const allRecords = await storage.getPlateRecords();

  const imageResults = [];
  let totalPlatesDetected = 0;
  let totalMatchedPlates = 0;
  let totalAlertsGenerated = 0;
  let imagesWithNoPlates = 0;
  let totalOcrUncertain = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const imageStartTime = Date.now();

    try {
      const aiData = await processImageWithAIService(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      const plates = aiData.plates || [];
      const { enrichedPlates, matchCount, alertCount, uncertainCount } =
        await matchAndAlertPlates(
          plates,
          file.originalname,
          aiData.original_image,
          allRecords
        );

      const platesDetected = plates.length;
      totalPlatesDetected += platesDetected;
      totalMatchedPlates += matchCount;
      totalAlertsGenerated += alertCount;
      totalOcrUncertain += uncertainCount;

      if (platesDetected === 0) {
        imagesWithNoPlates++;
      }

      const imageDuration = Date.now() - imageStartTime;

      imageResults.push({
        image_index: i + 1,
        image_id: `IMG-${i + 1}-${Date.now()}`,
        image_name: file.originalname,
        file_size_kb: Math.round(file.size / 1024),
        status: "SUCCESS",
        plates_detected: platesDetected,
        matched_plates: matchCount,
        alerts_generated: alertCount,
        original_image: aiData.original_image
          ? `data:image/jpeg;base64,${aiData.original_image}`
          : "",
        processed_image: aiData.processed_image
          ? `data:image/jpeg;base64,${aiData.processed_image}`
          : "",
        plates: enrichedPlates,
        timings: {
          ...aiData.timings,
          total_image_ms: imageDuration,
        },
      });
    } catch (err) {
      console.error(`Error processing batch image ${file.originalname}:`, err.message);
      imageResults.push({
        image_index: i + 1,
        image_id: `IMG-${i + 1}-${Date.now()}`,
        image_name: file.originalname,
        file_size_kb: Math.round(file.size / 1024),
        status: "FAILED",
        error: err.response?.data?.detail || err.message || "Processing failed.",
        plates_detected: 0,
        matched_plates: 0,
        alerts_generated: 0,
        plates: [],
        timings: { total_image_ms: Date.now() - imageStartTime },
      });
      imagesWithNoPlates++;
    }
  }

  const batchDuration = Date.now() - batchStartTime;

  // Log batch audit
  await storage.logAudit("BATCH_ANALYZED", "BATCH", batchId, {
    total_images: totalImages,
    total_plates_detected: totalPlatesDetected,
    matched_plates: totalMatchedPlates,
    alerts_generated: totalAlertsGenerated,
    duration_ms: batchDuration,
  });

  return res.json({
    success: true,
    batch_id: batchId,
    summary: {
      images_submitted: totalImages,
      images_processed: imageResults.filter((r) => r.status === "SUCCESS").length,
      images_failed: imageResults.filter((r) => r.status === "FAILED").length,
      total_plates_detected: totalPlatesDetected,
      matching_plates: totalMatchedPlates,
      alerts_generated: totalAlertsGenerated,
      images_with_no_plates: imagesWithNoPlates,
      ocr_uncertain: totalOcrUncertain,
      total_duration_ms: batchDuration,
      average_time_per_image_ms: Math.round(batchDuration / (totalImages || 1)),
    },
    results: imageResults,
  });
});

/**
 * Central error responder for AI service errors.
 */
function handleAIError(err, res) {
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    return res.status(503).json({
      success: false,
      error: "AI processing service is unavailable. Please ensure the Python service is running on port 8000.",
    });
  }

  if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
    return res.status(504).json({
      success: false,
      error: "AI service timed out. The image may be too complex or the server is busy.",
    });
  }

  if (err.response) {
    const detail =
      err.response.data?.detail ||
      err.response.data?.error ||
      "AI service returned an error.";
    return res.status(err.response.status).json({
      success: false,
      error: detail,
    });
  }

  return res.status(500).json({
    success: false,
    error: err.message || "An unexpected error occurred during processing.",
  });
}

/**
 * POST /api/ai/analyze-video
 * FEATURE 1 & 4: Video upload and asynchronous background analysis endpoint.
 * Immediately uploads raw video to Cloudinary and kicks off 1-fps background processing.
 */
router.post("/analyze-video", uploadVideo.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "No video file provided. Send a file in the 'video' field.",
    });
  }

  const { buffer, originalname } = req.file;
  const { recorded_at, latitude, longitude } = req.body;

  const videoId = `vid_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  try {
    const jobInfo = await videoService.enqueueVideoProcessing({
      videoId,
      videoBuffer: buffer,
      originalFilename: originalname,
      recordedAt: recorded_at || null,
      latitude: latitude != null && latitude !== "" ? parseFloat(latitude) : null,
      longitude: longitude != null && longitude !== "" ? parseFloat(longitude) : null,
    });

    return res.status(202).json({
      success: true,
      message: "Video uploaded successfully. Processing enqueued in background.",
      job_id: jobInfo.jobId,
      video_id: jobInfo.videoId,
      source_video_url: jobInfo.source_video_url,
      status: jobInfo.status,
    });
  } catch (err) {
    console.error("Error enqueuing video processing:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to initiate video analysis.",
    });
  }
});

/**
 * GET /api/ai/video-job/:jobId
 * Poll the live progress and status of a video processing job.
 */
router.get("/video-job/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = videoService.getJobStatus(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: `Video job '${jobId}' not found.`,
    });
  }

  return res.json({
    success: true,
    job,
  });
});

/**
 * GET /api/ai/detections
 * Retrieve all persistent plate detection occurrences across images and videos.
 */
router.get("/detections", async (req, res) => {
  try {
    const { video_id, match_status, source_type, search, car_color, limit } = req.query;
    const detections = await storage.getPlateDetections({
      video_id,
      match_status,
      source_type,
      search,
      car_color,
      limit: limit ? parseInt(limit, 10) : 200,
    });

    return res.json({
      success: true,
      total_detections: detections.length,
      detections,
    });
  } catch (err) {
    console.error("Error retrieving plate detections:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to retrieve plate detections.",
    });
  }
});

/**
 * GET /api/ai/video-detections/:videoId
 * Retrieve all persistent plate detection occurrences recorded for a video.
 */
router.get("/video-detections/:videoId", async (req, res) => {
  const { videoId } = req.params;

  try {
    const detections = await storage.getPlateDetections({ video_id: videoId });
    return res.json({
      success: true,
      video_id: videoId,
      total_detections: detections.length,
      detections,
    });
  } catch (err) {
    console.error("Error retrieving video detections:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to retrieve video detections.",
    });
  }
});

/**
 * Multer error handler
 */
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxMb = process.env.MAX_FILE_SIZE_MB || "20";
      return res.status(413).json({
        success: false,
        error: `File is too large. Maximum allowed size is ${maxMb} MB per image.`,
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(415).json({
        success: false,
        error: err.message || "Invalid file type. Only JPG, JPEG, PNG are supported.",
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }
  next(err);
});

module.exports = router;
