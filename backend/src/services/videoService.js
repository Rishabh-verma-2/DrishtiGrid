/**
 * Video Processing Service for DrishtiGrid ANPR.
 * Orchestrates:
 * 1. 1-fps frame extraction via ffmpeg
 * 2. Per-frame ANPR pipeline execution via Python AI service
 * 3. Cloudinary plate crop uploads
 * 4. Watchlist matching and alert generation
 * 5. Persistent storage in plate_detections store
 * 6. Post-processing cleanup of NO_MATCH images from Cloudinary
 * 7. Audit logging
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const axios = require("axios");
const FormData = require("form-data");

const cloudinaryService = require("./cloudinaryService");
const geocodingService = require("./geocodingService");
const storage = require("./storage");
const plateStorageService = require("./plateStorageService");
const {
  matchPlateAgainstRecords,
  normalizePlateNumber,
  canonicalPlateNumber,
  levenshteinDistance,
  arePlatesSimilar,
} = require("../utils/plateUtils");

/**
 * Find if a detected plate matches an existing active vehicle track in the video.
 * Uses arePlatesSimilar which handles:
 *  - Exact / canonical match (O/0, I/1, B/8, Z/2, S/5)
 *  - Substring containment (partial / half-view plates)
 *  - Levenshtein fuzzy matching
 *  - LCS overlap
 * Additionally enforces a 30-second temporal window so a vehicle that left the
 * scene long ago does not wrongly merge with a new arrival.
 */
function findMatchingTrack(normPlate, frameSecond, vehicleTracks) {
  if (!normPlate || normPlate.length < 3) return null;

  for (const track of vehicleTracks) {
    // Temporal guard: only merge within a 30-second window
    const timeDelta = frameSecond - track.last_seen_second;
    if (timeDelta > 30) continue;

    if (arePlatesSimilar(normPlate, track.plate_number)) return track;
  }
  return null;
}

/**
 * Determine consensus vehicle color via majority vote across frames.
 */
function getConsensusColor(colorVotes) {
  if (!colorVotes || colorVotes.length === 0) return null;
  const counts = {};
  for (const c of colorVotes) {
    if (!c) continue;
    counts[c] = (counts[c] || 0) + 1;
  }
  let bestColor = null;
  let maxCount = 0;
  for (const [color, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      bestColor = color;
    }
  }
  return bestColor;
}

/**
 * Safely convert a base64 string (with or without data URI prefix) into a Buffer.
 */
function base64ToBuffer(b64String) {
  if (!b64String) return null;
  const clean = b64String.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(clean, "base64");
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_TIMEOUT_MS = 60_000;

// In-memory active jobs registry + flat-file persistence
const activeJobs = new Map();
const JOBS_FILE = path.join(__dirname, "../../data/video_jobs.json");

function loadPersistedJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const raw = fs.readFileSync(JOBS_FILE, "utf8");
      const list = JSON.parse(raw || "[]");
      for (const j of list) {
        if (j && j.jobId) {
          activeJobs.set(j.jobId, j);
        }
      }
    }
  } catch (e) {
    console.warn("[VideoService] Could not load persisted video jobs:", e.message);
  }
}

function savePersistedJobs() {
  try {
    const list = Array.from(activeJobs.values()).slice(-50);
    fs.writeFileSync(JOBS_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    console.warn("[VideoService] Could not save persisted video jobs:", e.message);
  }
}

// Initial load
loadPersistedJobs();

/**
 * Get the current status of a background video processing job.
 */
function getJobStatus(jobId) {
  let job = activeJobs.get(jobId);
  if (!job) {
    loadPersistedJobs();
    job = activeJobs.get(jobId);
  }
  return job || null;
}

/**
 * Extract frames from a video at 1 frame per second (fps=1) into an output directory.
 * @param {string} videoFilePath
 * @param {string} outputDir
 * @returns {Promise<Array<{ frameSecond: number, framePath: string }>>}
 */
function extractFramesWithFfmpeg(videoFilePath, outputDir) {
  return new Promise((resolve, reject) => {
    const outputPattern = path.join(outputDir, "frame_%05d.jpg");
    // ffmpeg -i <video> -vf "fps=1" -vsync vfr <outputPattern>
    const args = [
      "-y",
      "-i",
      videoFilePath,
      "-vf",
      "fps=1",
      "-vsync",
      "vfr",
      "-q:v",
      "2",
      outputPattern,
    ];

    console.log(`[VideoService] Running ffmpeg extraction: ${ffmpegPath} ${args.join(" ")}`);
    const proc = spawn(ffmpegPath, args);

    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      console.error("[VideoService] ffmpeg process error:", err);
      reject(err);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`[VideoService] ffmpeg exited with code ${code}. Stderr: ${stderr.slice(-500)}`);
        return reject(new Error(`ffmpeg frame extraction failed with code ${code}`));
      }

      // Collect all extracted frames sorted by sequence number
      try {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.startsWith("frame_") && f.endsWith(".jpg"))
          .sort();

        const frames = files.map((f, idx) => ({
          frameSecond: idx, // 0-indexed second offset
          framePath: path.join(outputDir, f),
        }));

        console.log(`[VideoService] Successfully extracted ${frames.length} frame(s) at 1 fps.`);
        resolve(frames);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Send a single frame buffer to the Python AI service.
 */
async function processFrameWithAIService(frameBuffer, frameFileName) {
  const form = new FormData();
  form.append("image", frameBuffer, {
    filename: frameFileName || "frame.jpg",
    contentType: "image/jpeg",
  });

  const response = await axios.post(`${AI_SERVICE_URL}/process?skip_full_images=true`, form, {
    headers: {
      ...form.getHeaders(),
    },
    timeout: AI_TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    responseType: "json",
  });

  return response.data;
}

/**
 * Clean up a directory and its contents recursively.
 */
function safeCleanDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[VideoService] Could not remove temp dir ${dirPath}:`, err.message);
  }
}

/**
 * Main background worker to process video frames and perform post-processing cleanup.
 */
async function runVideoProcessingJob({
  jobId,
  videoId,
  videoFilePath,
  videoUrl,
  recordedAt,
  latitude,
  longitude,
}) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  job.status = "PROCESSING";
  job.updatedAt = new Date().toISOString();

  // Create temporary directory for extracted frames
  const tempDir = path.join(os.tmpdir(), `drishtigrid_video_${jobId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const detectionDocs = [];
  let deletedImagesCount = 0;
  let retainedImagesCount = 0;

  try {
    // 1. Resolve reverse-geocoded address once for the whole video if coordinates provided
    let locationAddress = null;
    if (latitude != null && longitude != null) {
      try {
        locationAddress = await geocodingService.reverseGeocode(latitude, longitude);
        console.log(`[VideoService] Geocoded address: ${locationAddress}`);
      } catch (geoErr) {
        console.warn("[VideoService] Geocoding skipped/failed:", geoErr.message);
      }
    }

    // 2. Extract 1 frame per second using ffmpeg
    const frames = await extractFramesWithFfmpeg(videoFilePath, tempDir);
    job.totalFrames = frames.length;
    job.updatedAt = new Date().toISOString();

    // Determine baseline timestamp
    const baseDate = recordedAt && !isNaN(new Date(recordedAt).getTime())
      ? new Date(recordedAt)
      : new Date();

    const allRecords = await storage.getPlateRecords();
    const vehicleTracks = [];

    // 3. Process each extracted frame and track vehicles across time
    for (const { frameSecond, framePath } of frames) {
      job.currentFrame = frameSecond + 1;
      job.processedFrames = frameSecond + 1;

      // Compute wall clock timestamp: baseDate + frameSecond seconds
      const wallClockTimestamp = new Date(baseDate.getTime() + frameSecond * 1000).toISOString();

      try {
        const frameBuffer = fs.readFileSync(framePath);
        const aiData = await processFrameWithAIService(frameBuffer, `frame_${frameSecond}.jpg`);

        const detectedPlates = aiData.plates || [];

        for (let pIdx = 0; pIdx < detectedPlates.length; pIdx++) {
          const plate = detectedPlates[pIdx];
          const rawOcr = plate.raw_ocr || "";
          const detectedText = plate.normalized_plate || rawOcr;
          const normPlate = normalizePlateNumber(detectedText);
          if (!normPlate || normPlate.length < 3) continue;

          const ocrConf = plate.ocr_confidence || 0.0;
          const detConf = plate.detection_confidence || 0.0;
          const overallConf = plate.overall_confidence || 0.0;

          // Cross-reference against watchlist records
          const matchResult = matchPlateAgainstRecords(normPlate, ocrConf, allRecords);
          const matchStatus = matchResult.matchStatus;
          const isMatch =
            (matchStatus === "MATCH_FOUND" || matchStatus === "POSSIBLE_MATCH") &&
            matchResult.matchedRecord;

          // Check if matches an existing vehicle track in this video
          const existingTrack = findMatchingTrack(normPlate, frameSecond, vehicleTracks);

          const cropB64 = plate.enhanced_crop || plate.original_crop || "";

          if (existingTrack) {
            // Update existing vehicle track
            existingTrack.occurrence_count += 1;
            existingTrack.last_seen_second = frameSecond;
            if (!existingTrack.seen_seconds.includes(frameSecond)) {
              existingTrack.seen_seconds.push(frameSecond);
            }
            if (plate.car_color) {
              existingTrack.color_votes.push(plate.car_color);
            }
            if (plate.car_model && !existingTrack.car_model) {
              existingTrack.car_model = plate.car_model;
            }

            // Upgrade track data if this frame has higher overall confidence
            if (overallConf > existingTrack.overall_confidence) {
              existingTrack.overall_confidence = overallConf;
              existingTrack.detection_confidence = detConf;
              existingTrack.ocr_confidence = ocrConf;
              // If new OCR is cleaner or has standard length, refine plate number
              if (normPlate.length >= existingTrack.plate_number.length && !normPlate.startsWith("M30E")) {
                existingTrack.plate_number = normPlate;
                existingTrack.raw_ocr = rawOcr;
              }
              if (cropB64) {
                existingTrack.bestCropB64 = cropB64;
                existingTrack.bestCropPIdx = pIdx + 1;
                existingTrack.bestCropSec = frameSecond;
              }
            }

            // Watchlist match takes precedence
            if (isMatch && existingTrack.match_status !== "MATCH_FOUND") {
              existingTrack.match_status = matchStatus;
              existingTrack.matched_record = matchResult.matchedRecord;
              existingTrack.matchResult = matchResult;
            }
          } else {
            // Initialize new vehicle track
            const newTrack = {
              plate_number: normPlate,
              raw_ocr: rawOcr,
              first_seen_second: frameSecond,
              last_seen_second: frameSecond,
              occurrence_count: 1,
              seen_seconds: [frameSecond],
              color_votes: plate.car_color ? [plate.car_color] : [],
              car_color: plate.car_color || null,
              car_model: plate.car_model || null,
              detection_confidence: detConf,
              ocr_confidence: ocrConf,
              overall_confidence: overallConf,
              match_status: matchStatus,
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
              matchResult,
              timestamp: wallClockTimestamp,
              bestCropB64: cropB64,
              bestCropPIdx: pIdx + 1,
              bestCropSec: frameSecond,
            };
            vehicleTracks.push(newTrack);
          }

          // Live count of unique plates detected
          job.platesDetected = vehicleTracks.length;
        }
      } catch (frameErr) {
        console.warn(`[VideoService] Failed to process frame ${frameSecond}:`, frameErr.message);
      }

      job.updatedAt = new Date().toISOString();
    }

    // 4. Finalize unique tracks, determine consensus color, upload crops, and persist to MongoDB
    console.log(`[VideoService] Finalizing ${vehicleTracks.length} unique vehicle track(s) for video ${videoId}...`);

    for (const track of vehicleTracks) {
      // 4a. Compute majority vote consensus vehicle color
      const consensusColor = getConsensusColor(track.color_votes) || track.car_color;
      track.car_color = consensusColor;

      // 4b. Upload best crop to Cloudinary if available
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
          console.warn(`[VideoService] Cloudinary crop upload failed for plate ${track.plate_number}:`, upErr.message);
        }
      }

      // Fallback to direct base64 data URI if Cloudinary is unavailable or disabled
      if (!cropUrl && track.bestCropB64) {
        cropUrl = `data:image/jpeg;base64,${track.bestCropB64}`;
      }

      // 4c. Generate single alert for matched vehicle
      const isMatch =
        (track.match_status === "MATCH_FOUND" || track.match_status === "POSSIBLE_MATCH") &&
        track.matched_record;

      if (isMatch) {
        job.matchedCount = (job.matchedCount || 0) + 1;
        try {
          await storage.createPlateAlert({
            plate_record_id: track.matched_record.id || track.matched_record._id,
            plate_record_ref: track.matched_record.recordId,
            category: track.matched_record.category,
            detected_plate_number: track.plate_number,
            raw_ocr: track.raw_ocr,
            ocr_confidence: track.ocr_confidence,
            detection_confidence: track.detection_confidence,
            overall_confidence: track.overall_confidence,
            source_image_name: `video_${videoId}_sec_${track.first_seen_second}.jpg`,
            original_image: cropUrl || (track.bestCropB64 ? `data:image/jpeg;base64,${track.bestCropB64}` : ""),
            detected_at: track.timestamp,
            priority: track.matched_record.priority || "HIGH",
            status: "NEW",
            notes: `Vehicle seen in ${track.occurrence_count} frame(s) (sec ${track.first_seen_second}s - ${track.last_seen_second}s) in video ${videoId}. ${track.matchResult?.confidenceNote || ""}`,
          });
        } catch (alertErr) {
          console.error("[VideoService] Failed to create plate alert:", alertErr);
        }
      }

      // 4d. Post-processing privacy cleanup for NO_MATCH
      let imageDeleted = false;
      if (track.match_status === "NO_MATCH") {
        if (cropPublicId) {
          try {
            await cloudinaryService.deleteAsset(cropPublicId, "image");
            deletedImagesCount++;
          } catch (delErr) {
            console.warn(`[VideoService] Could not delete Cloudinary asset ${cropPublicId}:`, delErr.message);
          }
        }
        cropUrl = null;
        imageDeleted = true;
      } else {
        retainedImagesCount++;
      }

      // 4e. Persist the single, deduplicated vehicle detection document
      const detectionDoc = await storage.createPlateDetection({
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
        source_video_url: videoUrl,
        car_color: consensusColor,
        car_model: track.car_model || null,
        detection_confidence: track.detection_confidence,
        ocr_confidence: track.ocr_confidence,
        overall_confidence: track.overall_confidence,
        match_status: track.match_status,
        matched_record: track.matched_record,
        image_deleted: imageDeleted,
      });

      detectionDocs.push(detectionDoc);

      // 4f. Persist into dedicated storedplates collection / flat-file registries
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
        console.warn(`[VideoService] plateStorageService.storePlate failed for ${track.plate_number}:`, storeErr.message);
      }
    }

    // 5. Log cleanup in audit_logs
    await storage.logAudit("VIDEO_DETECTION_CLEANUP", "VIDEO", videoId, {
      video_id: videoId,
      total_detections: detectionDocs.length,
      deleted_images: deletedImagesCount,
      retained_images: retainedImagesCount,
    });

    job.status = "COMPLETED";
    job.platesDetected = detectionDocs.length;
    job.cleanedUpCount = deletedImagesCount;
    job.retainedCount = retainedImagesCount;
    job.updatedAt = new Date().toISOString();
    savePersistedJobs();
    console.log(
      `[VideoService] Video job ${jobId} finished successfully. Unique Plates: ${detectionDocs.length}, Deleted: ${deletedImagesCount}, Retained: ${retainedImagesCount}`
    );
  } catch (err) {
    console.error(`[VideoService] Fatal error processing video job ${jobId}:`, err);
    job.status = "FAILED";
    job.error = err.message || "Unknown video processing error";
    job.updatedAt = new Date().toISOString();
    savePersistedJobs();
  } finally {
    // Clean up temporary extracted frames directory and input video file
    safeCleanDir(tempDir);
    if (videoFilePath && fs.existsSync(videoFilePath)) {
      try {
        fs.unlinkSync(videoFilePath);
      } catch (e) {
        console.warn("[VideoService] Could not remove temp video file:", e.message);
      }
    }
  }
}

/**
 * Enqueue a new video processing job.
 */
async function enqueueVideoProcessing({
  videoId,
  videoBuffer,
  originalFilename,
  recordedAt,
  latitude,
  longitude,
}) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Save video buffer to temp file for ffmpeg processing
  const tempVideoPath = path.join(os.tmpdir(), `upload_${videoId}_${Date.now()}${path.extname(originalFilename || ".mp4")}`);
  fs.writeFileSync(tempVideoPath, videoBuffer);

  // Upload raw video to Cloudinary immediately
  console.log(`[VideoService] Uploading raw video ${videoId} to Cloudinary...`);
  const cloudinaryVideo = await cloudinaryService.uploadVideo(videoBuffer, videoId);
  console.log(`[VideoService] Raw video uploaded to Cloudinary: ${cloudinaryVideo.url}`);

  const job = {
    jobId,
    videoId,
    sourceVideoUrl: cloudinaryVideo.url,
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
  savePersistedJobs();

  // Trigger background execution without awaiting
  setImmediate(() => {
    runVideoProcessingJob({
      jobId,
      videoId,
      videoFilePath: tempVideoPath,
      videoUrl: cloudinaryVideo.url,
      recordedAt,
      latitude,
      longitude,
    });
  });

  return {
    jobId,
    videoId,
    source_video_url: cloudinaryVideo.url,
    status: "QUEUED",
  };
}

module.exports = {
  getJobStatus,
  enqueueVideoProcessing,
};
