/**
 * Client API for video ANPR analysis and background job tracking.
 */

const API_TIMEOUT_MS = 10 * 60 * 1000;

async function fetchWithTimeout(url, options, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out while communicating with the server.");
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
}

async function safeParseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned an invalid response (HTTP ${res.status}). ${text.slice(0, 200)}`
    );
  }
}

/**
 * Upload a video file and initiate background 1-fps analysis.
 * @param {File} videoFile
 * @param {Object} metadata - { recordedAt, latitude, longitude }
 */
export async function uploadAndAnalyzeVideo(videoFile, metadata = {}) {
  const formData = new FormData();
  formData.append("video", videoFile);

  if (metadata.recordedAt) {
    formData.append("recorded_at", metadata.recordedAt);
  }
  if (metadata.latitude != null && metadata.latitude !== "") {
    formData.append("latitude", metadata.latitude);
  }
  if (metadata.longitude != null && metadata.longitude !== "") {
    formData.append("longitude", metadata.longitude);
  }

  const res = await fetchWithTimeout("/api/ai/analyze-video", {
    method: "POST",
    body: formData,
  });

  const data = await safeParseJson(res);
  if (!res.ok) {
    throw new Error(data.error || `Upload failed with HTTP status ${res.status}`);
  }
  return data;
}

/**
 * Get the real-time status of an ongoing video processing job.
 * @param {string} jobId
 */
export async function getVideoJobStatus(jobId) {
  const res = await fetchWithTimeout(`/api/ai/video-job/${encodeURIComponent(jobId)}`, {
    method: "GET",
  }, 15000);

  const data = await safeParseJson(res);
  if (!res.ok) {
    throw new Error(data.error || `Failed to fetch video job status (${res.status})`);
  }
  return data.job;
}

/**
 * Retrieve all persistent plate detection occurrences for a completed video.
 * @param {string} videoId
 */
export async function getVideoDetections(videoId) {
  const res = await fetchWithTimeout(`/api/ai/video-detections/${encodeURIComponent(videoId)}`, {
    method: "GET",
  }, 30000);

  const data = await safeParseJson(res);
  if (!res.ok) {
    throw new Error(data.error || `Failed to fetch video detections (${res.status})`);
  }
  return data.detections || [];
}
