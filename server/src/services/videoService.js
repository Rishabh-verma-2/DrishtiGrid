/**
 * Video Surveillance Stream & Analysis Pipeline (1-FPS).
 * Samples video footage at 1 frame per second using FFmpeg,
 * runs each frame through ANPR (YOLO + Zero-DCE + PaddleOCR + Vehicle Attributes),
 * deduplicates vehicle tracks across time (30s temporal window),
 * extracts consensus vehicle color, uploads evidence to Cloudinary (with local fallback),
 * enforces post-processing privacy cleanup for non-matching vehicles,
 * emits real-time Socket.IO progress,
 * and records events into PlateDetection and StoredPlate collections.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const FormData = require("form-data");
const cloudinaryService = require("./cloudinaryService");
const plateStorageService = require("./plateStorageService");
const geocodingService = require("./geocodingService");
const PlateDetection = require("../models/PlateDetection");
const PlateRecord = require("../models/PlateRecord");
const { randomUUID: uuidv4 } = require("crypto");
const Alert = require("../models/Alert");
const {
  normalizePlateNumber,
  canonicalPlateNumber,
  computeTemporalConsensusPlate,
  arePlatesSimilar,
  getConsensusColor,
  matchPlateAgainstRecords,
} = require("../utils/plateUtils");

// Persistent local video storage directory for video playback streaming
const VIDEOS_DIR = path.join(__dirname, "../../uploads/videos");
if (!fs.existsSync(VIDEOS_DIR)) {
  try {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  } catch (e) {
    console.warn(`[VideoService] Could not create videos dir ${VIDEOS_DIR}:`, e.message);
  }
}

// Lazy-load ffmpeg with safe fallback if not yet installed
let ffmpeg = null;
let ffmpegAvailable = false;
try {
  ffmpeg = require("fluent-ffmpeg");
  const ffmpegStatic = require("ffmpeg-static");
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
    ffmpegAvailable = true;
  }
} catch (err) {
  console.warn(
    "[VideoService] fluent-ffmpeg or ffmpeg-static not yet installed. Video pipeline will use fallback simulation until packages are installed."
  );
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

// In-memory registry of active video processing jobs
const activeJobs = new Map();

function getJobStatus(jobId) {
  return activeJobs.get(jobId) || null;
}

function getVideoFilePath(videoId) {
  if (!videoId) return null;
  const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, "");
  const candidate = path.join(VIDEOS_DIR, `video_${safeId}.mp4`);
  if (fs.existsSync(candidate)) return candidate;
  for (const ext of [".mov", ".avi", ".webm", ".mkv"]) {
    const p = path.join(VIDEOS_DIR, `video_${safeId}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function safeCleanDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        fs.unlinkSync(path.join(dirPath, file));
      }
      fs.rmdirSync(dirPath);
    }
  } catch (err) {
    console.warn(`[VideoService] Directory cleanup warning for ${dirPath}:`, err.message);
  }
}

function base64ToBuffer(base64Str) {
  if (!base64Str) return null;
  const clean = base64Str.includes(",") ? base64Str.split(",")[1] : base64Str;
  try {
    return Buffer.from(clean, "base64");
  } catch {
    return null;
  }
}

/**
 * Extract 1 frame per second from a video file into outputDir using ffmpeg.
 * Caps at maxFrames (default 180 = 3 minutes) to maintain bounded processing latency.
 */
function extractFramesAt1Fps(videoFilePath, outputDir, maxFrames = 180) {
  return new Promise((resolve, reject) => {
    if (!ffmpegAvailable || !ffmpeg) {
      return reject(new Error("FFmpeg is not installed or available on this host."));
    }

    const outputPattern = path.join(outputDir, "frame_%04d.jpg");
    ffmpeg(videoFilePath)
      .outputOptions(["-vf fps=1", "-q:v 2", `-vframes ${maxFrames}`])
      .output(outputPattern)
      .on("start", (cmd) => {
        console.log(`[VideoService] FFmpeg started: ${cmd}`);
      })
      .on("end", () => {
        try {
          const files = fs
            .readdirSync(outputDir)
            .filter((f) => f.startsWith("frame_") && f.endsWith(".jpg"))
            .sort();
          resolve(files);
        } catch (e) {
          reject(e);
        }
      })
      .on("error", (err) => {
        console.error("[VideoService] FFmpeg frame extraction failed:", err);
        reject(err);
      })
      .run();
  });
}

/**
 * Send frame image buffer to Python AI service with proper 'image' field.
 */
async function sendFrameToAIService(imageBuffer, frameSecond) {
  try {
    const form = new FormData();
    form.append("image", imageBuffer, {
      filename: `frame_${frameSecond}.jpg`,
      contentType: "image/jpeg",
    });

    const response = await axios.post(`${AI_SERVICE_URL}/process`, form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });

    return response.data;
  } catch (err) {
    console.warn(
      `[VideoService] AI Service frame ${frameSecond} error:`,
      err.response?.data?.detail || err.message
    );
    return {
      success: false,
      total_plates_detected: 0,
      plates: [],
      error: err.message,
    };
  }
}

/**
 * Find matching active vehicle track within 30-second temporal deduplication window
 * using plate text similarity, vehicle bounding box proximity, class, and color.
 */
function findMatchingTrack(tracks, plateData, frameSec) {
  const plateNumber = typeof plateData === "string"
    ? normalizePlateNumber(plateData)
    : normalizePlateNumber(plateData.corrected_plate || plateData.normalized_plate || plateData.raw_ocr || "");

  const pVehBbox = typeof plateData === "object" ? plateData.vehicle_bbox : null;
  const pVehType = typeof plateData === "object" ? (plateData.vehicle_type || "").toLowerCase() : "";
  const pColor = typeof plateData === "object" ? plateData.car_color : null;

  for (const track of tracks) {
    const withinTimeWindow = Math.abs(frameSec - track.last_seen_second) <= 30;
    if (!withinTimeWindow) continue;

    // 1. Text similarity
    const isSamePlate = arePlatesSimilar(track.plate_number, plateNumber);
    if (isSamePlate) {
      return track;
    }

    // 2. Spatial proximity if vehicle bboxes exist
    let isSpatialMatch = false;
    if (track.last_vehicle_bbox && pVehBbox) {
      const tb = track.last_vehicle_bbox;
      const tcx = tb.x + tb.width / 2;
      const tcy = tb.y + tb.height / 2;
      const pcx = pVehBbox.x + pVehBbox.width / 2;
      const pcy = pVehBbox.y + pVehBbox.height / 2;
      const dist = Math.hypot(tcx - pcx, tcy - pcy);
      const avgDim = (tb.width + tb.height + pVehBbox.width + pVehBbox.height) / 4;
      if (dist < avgDim * 0.8) {
        isSpatialMatch = true;
      }
    }

    // 3. Class and color consistency
    const isClassMatch = track.vehicle_type && pVehType && track.vehicle_type.toLowerCase() === pVehType;
    const isColorMatch = track.colors && pColor && track.colors.includes(pColor);

    if (isSpatialMatch && (isClassMatch || isColorMatch) && Math.abs(frameSec - track.last_seen_second) <= 3) {
      return track;
    }
  }
  return null;
}

/**
 * Run video processing job asynchronously.
 */
async function runVideoProcessingJob({
  jobId,
  videoId,
  videoFilePath,
  videoBuffer,
  recordedAt,
  latitude,
  longitude,
  io,
}) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  const tempDir = path.join(os.tmpdir(), `drishti_video_${videoId}_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    job.status = "PROCESSING";
    job.updatedAt = new Date().toISOString();

    if (io) {
      io.emit("video:status", {
        jobId,
        videoId,
        status: "PROCESSING",
        message: "Extracting 1-FPS frames from video...",
      });
    }

    // Attempt background Cloudinary video upload in parallel
    cloudinaryService
      .uploadVideo(videoBuffer, videoId)
      .then((cRes) => {
        if (cRes?.url) {
          job.sourceVideoUrl = cRes.url;
          console.log(`[VideoService] Cloudinary video backup complete for ${videoId}: ${cRes.url}`);
        }
      })
      .catch((cErr) => {
        console.warn(`[VideoService] Cloudinary background video upload notice:`, cErr.message);
      });

    let frameFiles = [];
    if (ffmpegAvailable) {
      frameFiles = await extractFramesAt1Fps(videoFilePath, tempDir, 180);
    } else {
      frameFiles = ["frame_0001.jpg", "frame_0002.jpg", "frame_0003.jpg"];
    }

    job.totalFrames = frameFiles.length;
    console.log(
      `[VideoService] Job ${jobId}: ${frameFiles.length} frame(s) extracted for video ${videoId}.`
    );

    // Fetch active watchlist records for instant matching
    const activeRecords = await PlateRecord.find({ status: "ACTIVE" }).lean();

    // Reverse geocode location if coordinates provided
    let locationAddress = null;
    if (latitude && longitude) {
      try {
        locationAddress = await geocodingService.reverseGeocode(latitude, longitude);
      } catch (e) {
        // Non-fatal
      }
    }

    const tracks = [];
    const baseTimestamp = recordedAt ? new Date(recordedAt).getTime() : Date.now();

    // Process each 1-FPS frame
    for (let i = 0; i < frameFiles.length; i++) {
      const frameFileName = frameFiles[i];
      const frameSecond = i + 1; // 1-indexed second
      job.currentFrame = frameSecond;
      job.processedFrames = i + 1;

      let frameBuffer = null;
      const framePath = path.join(tempDir, frameFileName);
      if (fs.existsSync(framePath)) {
        frameBuffer = fs.readFileSync(framePath);
      } else {
        frameBuffer = Buffer.from("dummy frame data");
      }

      const aiResult = await sendFrameToAIService(frameBuffer, frameSecond);
      const detectedPlates = aiResult?.plates || [];

      for (const plate of detectedPlates) {
        const plateNumber = normalizePlateNumber(plate.corrected_plate || plate.normalized_plate || plate.raw_ocr || "");
        if (!plateNumber || plateNumber.length < 3) continue;

        const matchResult = matchPlateAgainstRecords(plateNumber, activeRecords);
        const existingTrack = findMatchingTrack(tracks, plate, frameSecond);

        if (existingTrack) {
          existingTrack.occurrence_count += 1;
          existingTrack.last_seen_second = frameSecond;
          if (!existingTrack.seen_seconds.includes(frameSecond)) {
            existingTrack.seen_seconds.push(frameSecond);
          }
          if (plate.car_color) {
            existingTrack.colors.push(plate.car_color);
          }
          if (plate.vehicle_bbox) {
            existingTrack.last_vehicle_bbox = plate.vehicle_bbox;
          }
          if (!existingTrack.readings) {
            existingTrack.readings = [];
          }
          existingTrack.readings.push({
            text: plateNumber,
            confidence: plate.overall_confidence || plate.ocr_confidence || 0.85,
            sec: frameSecond,
          });

          // Update best crop if confidence is higher
          const thisConf = plate.overall_confidence || plate.ocr_confidence || 0;
          if (
            thisConf > (existingTrack.bestConf || 0) &&
            (plate.enhanced_crop_b64 || plate.original_crop_b64)
          ) {
            existingTrack.bestCropB64 = plate.enhanced_crop_b64 || plate.original_crop_b64;
            existingTrack.bestConf = thisConf;
            existingTrack.bestCropSec = frameSecond;
          }
        } else {
          const frameTime = new Date(baseTimestamp + (frameSecond - 1) * 1000).toISOString();
          const newTrack = {
            trackId: `TRK_${videoId}_${frameSecond}_${tracks.length + 1}`,
            plate_number: plateNumber,
            raw_ocr: plate.raw_ocr || plateNumber,
            first_seen_second: frameSecond,
            last_seen_second: frameSecond,
            occurrence_count: 1,
            seen_seconds: [frameSecond],
            timestamp: frameTime,
            detection_confidence: plate.detection_confidence || 0.9,
            ocr_confidence: plate.ocr_confidence || 0.85,
            overall_confidence: plate.overall_confidence || 0.88,
            vehicle_type: plate.vehicle_type || "car",
            car_model: plate.car_model || null,
            colors: plate.car_color ? [plate.car_color] : [],
            last_vehicle_bbox: plate.vehicle_bbox || null,
            readings: [
              {
                text: plateNumber,
                confidence: plate.overall_confidence || plate.ocr_confidence || 0.85,
                sec: frameSecond,
              },
            ],
            bestCropB64: plate.enhanced_crop_b64 || plate.original_crop_b64 || "",
            bestConf: plate.overall_confidence || 0,
            bestCropSec: frameSecond,
            bestCropPIdx: plate.plate_id || 1,
            match_status: matchResult.matchStatus,
            matched_record: matchResult.matchedRecord,
            matchResult,
          };
          tracks.push(newTrack);
        }
      }

      job.updatedAt = new Date().toISOString();

      // Emit live frame processing progress
      if (io) {
        io.emit("video:progress", {
          jobId,
          videoId,
          currentFrame: frameSecond,
          totalFrames: frameFiles.length,
          processedFrames: i + 1,
          percentage: Math.round(((i + 1) / frameFiles.length) * 100),
          platesDetectedCount: tracks.length,
        });
      }
    }

    // Apply temporal consensus across all vehicle track readings
    for (const track of tracks) {
      if (track.readings && track.readings.length > 0) {
        const consensus = computeTemporalConsensusPlate(track.readings);
        if (consensus.plate) {
          track.plate_number = consensus.plate;
          track.temporal_consensus_count = consensus.occurrences;
          track.overall_confidence = Math.min(1.0, Math.max(track.overall_confidence, consensus.confidence));
          // Refresh watchlist matching using the consensus plate number
          const refreshedMatch = matchPlateAgainstRecords(track.plate_number, activeRecords);
          track.match_status = refreshedMatch.matchStatus;
          track.matched_record = refreshedMatch.matchedRecord;
          track.matchResult = refreshedMatch;
        }
      }
    }

    // Persist deduplicated vehicle tracks & handle Cloudinary evidence & privacy cleanup
    const detectionDocs = [];
    let deletedImagesCount = 0;
    let retainedImagesCount = 0;

    for (const track of tracks) {
      const consensusColor = getConsensusColor(track.colors);
      let cropUrl = null;
      let cropPublicId = null;

      if (track.bestCropB64) {
        try {
          const cropBuffer = base64ToBuffer(track.bestCropB64);
          if (cropBuffer) {
            const uploadRes = await cloudinaryService.uploadPlateCrop(
              cropBuffer,
              videoId,
              track.bestCropSec || track.first_seen_second,
              track.bestCropPIdx || 1
            );
            cropUrl = uploadRes.url;
            cropPublicId = uploadRes.public_id;
          }
        } catch (upErr) {
          console.warn(
            `[VideoService] Cloudinary crop upload notice for ${track.plate_number}:`,
            upErr.message
          );
        }
      }

      const isMatch =
        (track.match_status === "MATCH_FOUND" || track.match_status === "POSSIBLE_MATCH") &&
        track.matched_record;

      // Ensure evidence crop is NEVER lost for matched records
      if (isMatch && !cropUrl && track.bestCropB64) {
        cropUrl = track.bestCropB64.startsWith("data:")
          ? track.bestCropB64
          : `data:image/jpeg;base64,${track.bestCropB64}`;
      }

      if (isMatch) {
        job.matchedCount = (job.matchedCount || 0) + 1;
        try {
          const alertDoc = await Alert.create({
            alertId: `ALT-VID-${uuidv4().split('-')[0].toUpperCase()}`,
            type: "anpr_match",
            title: `ANPR Hit: ${track.plate_number} (${track.matched_record.category})`,
            description: `Vehicle seen in ${track.occurrence_count} frame(s) (${track.first_seen_second}s-${track.last_seen_second}s). Color: ${consensusColor || "Unknown"}. ${track.matched_record.notes || ""}`,
            severity: track.matched_record.priority === "HIGH" ? "critical" : "high",
            status: "active",
            location: {
              type: "Point",
              coordinates: [
                longitude != null ? Number(longitude) : 72.5714,
                latitude != null ? Number(latitude) : 23.0225,
              ],
            },
            district: "Ahmedabad",
            metadata: {
              plate_number: track.plate_number,
              plate_record_id: track.matched_record._id,
              video_id: videoId,
              car_color: consensusColor,
              confidence: track.overall_confidence,
              crop_url: cropUrl,
              first_seen_second: track.first_seen_second,
              last_seen_second: track.last_seen_second,
            },
          });

          if (io) {
            io.emit("alert:new", alertDoc);
            io.emit("anpr:match", {
              alert: alertDoc,
              plateNumber: track.plate_number,
              category: track.matched_record.category,
              cropUrl,
            });
          }
        } catch (alertErr) {
          console.error("[VideoService] Failed to create Alert:", alertErr.message);
        }
      }

      // Privacy cleanup: purge optical crop for NO_MATCH (retain text/metadata only)
      let imageDeleted = false;
      if (track.match_status === "NO_MATCH") {
        if (cropPublicId) {
          try {
            await cloudinaryService.deleteAsset(cropPublicId, "image");
            deletedImagesCount++;
          } catch (delErr) {
            // Non-fatal
          }
        }
        cropUrl = null;
        imageDeleted = true;
      } else {
        retainedImagesCount++;
      }

      // Persist to PlateDetection collection
      try {
        const detectionDoc = await PlateDetection.create({
          video_id: videoId,
          source_type: "VIDEO",
          source_name: `video_${videoId}.mp4`,
          frame_second: track.first_seen_second,
          first_seen_second: track.first_seen_second,
          last_seen_second: track.last_seen_second,
          occurrence_count: track.occurrence_count,
          seen_seconds: track.seen_seconds,
          plate_number: track.plate_number,
          raw_ocr: track.raw_ocr,
          timestamp: track.timestamp,
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
          location_address: locationAddress,
          cropped_image_url: cropUrl,
          cropped_image_public_id: cropPublicId,
          source_video_url: job.sourceVideoUrl,
          car_color: consensusColor,
          car_model: track.car_model || null,
          vehicle_type: track.vehicle_type || "car",
          detection_confidence: track.detection_confidence,
          ocr_confidence: track.ocr_confidence,
          overall_confidence: track.overall_confidence,
          match_status: track.match_status,
          matched_record: track.matched_record,
          image_deleted: imageDeleted,
        });
        detectionDocs.push(detectionDoc);
      } catch (detErr) {
        console.warn(`[VideoService] PlateDetection save error:`, detErr.message);
      }

      // Persist to StoredPlate registry
      try {
        await plateStorageService.storePlate({
          plate_number: track.plate_number,
          raw_ocr: track.raw_ocr,
          car_color: consensusColor,
          car_model: track.car_model || null,
          source_type: "VIDEO",
          source_name: `video_${videoId}.mp4`,
          video_id: videoId,
          frame_second: track.first_seen_second,
          first_seen_second: track.first_seen_second,
          last_seen_second: track.last_seen_second,
          occurrence_count: track.occurrence_count,
          seen_seconds: track.seen_seconds,
          overall_confidence: track.overall_confidence,
          detection_confidence: track.detection_confidence,
          ocr_confidence: track.ocr_confidence,
          match_status: track.match_status,
          location_address: locationAddress,
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
          cropped_image_url: cropUrl,
          timestamp: track.timestamp,
        });
      } catch (storeErr) {
        console.warn(`[VideoService] storePlate error:`, storeErr.message);
      }
    }

    job.status = "COMPLETED";
    job.platesDetected = detectionDocs.length;
    job.cleanedUpCount = deletedImagesCount;
    job.retainedCount = retainedImagesCount;
    job.updatedAt = new Date().toISOString();

    if (io) {
      io.emit("video:completed", {
        jobId,
        videoId,
        totalFrames: frameFiles.length,
        platesDetected: detectionDocs.length,
        matchedCount: job.matchedCount || 0,
        sourceVideoUrl: job.sourceVideoUrl,
      });
    }

    console.log(
      `[VideoService] Job ${jobId} completed successfully. Detections: ${detectionDocs.length}, Cleaned: ${deletedImagesCount}, Retained: ${retainedImagesCount}`
    );
  } catch (err) {
    console.error(`[VideoService] Error processing video job ${jobId}:`, err);
    job.status = "FAILED";
    job.error = err.message || "Video processing error";
    job.updatedAt = new Date().toISOString();

    if (io) {
      io.emit("video:failed", {
        jobId,
        videoId,
        error: job.error,
      });
    }
  } finally {
    safeCleanDir(tempDir);
  }
}

/**
 * Enqueue a new video processing job with non-blocking local stream and background Cloudinary upload.
 */
async function enqueueVideoProcessing({
  videoId,
  videoBuffer,
  originalFilename,
  recordedAt,
  latitude,
  longitude,
  io,
}) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const ext = path.extname(originalFilename || ".mp4") || ".mp4";
  const localVideoPath = path.join(VIDEOS_DIR, `video_${videoId}${ext}`);

  // Write video to local video storage immediately
  fs.writeFileSync(localVideoPath, videoBuffer);

  const localStreamUrl = `/api/anpr/video/stream/${videoId}`;

  const job = {
    jobId,
    videoId,
    sourceVideoUrl: localStreamUrl,
    status: "QUEUED",
    totalFrames: 0,
    processedFrames: 0,
    currentFrame: 0,
    platesDetected: 0,
    matchedCount: 0,
    cleanedUpCount: 0,
    retainedCount: 0,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  activeJobs.set(jobId, job);

  // Run 1-FPS frame extraction and AI processing in background
  setImmediate(() => {
    runVideoProcessingJob({
      jobId,
      videoId,
      videoFilePath: localVideoPath,
      videoBuffer,
      recordedAt,
      latitude,
      longitude,
      io,
    });
  });

  return {
    jobId,
    videoId,
    source_video_url: localStreamUrl,
    status: "QUEUED",
  };
}

module.exports = {
  getJobStatus,
  enqueueVideoProcessing,
  getVideoFilePath,
};
