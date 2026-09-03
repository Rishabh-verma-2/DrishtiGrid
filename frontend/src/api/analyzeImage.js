/**
 * Client API for single and batch AI image analysis.
 * Batch mode calls the single-image endpoint per file to avoid massive JSON payloads.
 */

const BACKEND_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per image

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. The image may be too complex.");
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
 * Analyze a single image file.
 */
export async function analyzeImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetchWithTimeout("/api/ai/analyze-image", { method: "POST", body: formData }, BACKEND_TIMEOUT_MS);
  const data = await safeParseJson(res);
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

/**
 * Analyze multiple images.
 * Calls analyze-image one-by-one and aggregates client-side.
 *
 * @param {File[]} files - Array of File objects
 * @param {(progress: { done: number, total: number, imageName: string, result?: object, error?: string }) => void} onProgress
 * @returns {Promise<BatchResult>}
 */
export async function analyzeImages(files, onProgress) {
  const batchId = `BATCH-${Date.now()}`;
  const batchStart = Date.now();
  const results = [];

  let totalPlatesDetected = 0;
  let totalMatchedPlates = 0;
  let totalAlertsGenerated = 0;
  let imagesWithNoPlates = 0;
  let totalOcrUncertain = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const imageStart = Date.now();

    // Notify caller that we are starting this image
    onProgress?.({ done: i, total: files.length, imageName: file.name });

    let result;
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetchWithTimeout(
        "/api/ai/analyze-image",
        { method: "POST", body: formData },
        BACKEND_TIMEOUT_MS
      );
      const data = await safeParseJson(res);
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);

      const platesDetected = (data.plates || []).length;
      const matchCount = data.matched_plates_count || 0;
      const alertCount = data.alerts_generated_count || 0;
      const uncertainCount = data.ocr_uncertain_count || 0;

      totalPlatesDetected += platesDetected;
      totalMatchedPlates += matchCount;
      totalAlertsGenerated += alertCount;
      totalOcrUncertain += uncertainCount;

      if (platesDetected === 0) imagesWithNoPlates++;

      result = {
        image_index: i + 1,
        image_id: `IMG-${i + 1}-${Date.now()}`,
        image_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
        status: "SUCCESS",
        plates_detected: platesDetected,
        matched_plates: matchCount,
        alerts_generated: alertCount,
        original_image: data.original_image
          ? `data:image/jpeg;base64,${data.original_image}`
          : "",
        processed_image: data.processed_image
          ? `data:image/jpeg;base64,${data.processed_image}`
          : "",
        plates: data.plates || [],
        timings: {
          ...(data.timings || {}),
          total_image_ms: Date.now() - imageStart,
        },
      };
    } catch (err) {
      imagesWithNoPlates++;
      result = {
        image_index: i + 1,
        image_id: `IMG-${i + 1}-${Date.now()}`,
        image_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
        status: "FAILED",
        error: err.message || "Processing failed.",
        plates_detected: 0,
        matched_plates: 0,
        alerts_generated: 0,
        plates: [],
        timings: { total_image_ms: Date.now() - imageStart },
      };
    }

    results.push(result);

    // Notify progress after completing this image
    onProgress?.({ done: i + 1, total: files.length, imageName: file.name, result });
  }

  const batchDuration = Date.now() - batchStart;

  return {
    success: true,
    batch_id: batchId,
    summary: {
      images_submitted: files.length,
      images_processed: results.filter((r) => r.status === "SUCCESS").length,
      images_failed: results.filter((r) => r.status === "FAILED").length,
      total_plates_detected: totalPlatesDetected,
      matching_plates: totalMatchedPlates,
      alerts_generated: totalAlertsGenerated,
      images_with_no_plates: imagesWithNoPlates,
      ocr_uncertain: totalOcrUncertain,
      total_duration_ms: batchDuration,
      average_time_per_image_ms: Math.round(batchDuration / (files.length || 1)),
    },
    results,
  };
}
