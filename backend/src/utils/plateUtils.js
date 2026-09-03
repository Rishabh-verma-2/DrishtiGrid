/**
 * Utility functions for plate number normalization and comparison.
 */

/**
 * Normalizes a license plate number:
 * - Converts to uppercase
 * - Strips all spaces, dashes, dots, underscores, and special characters
 * - Keeps only alphanumeric characters A-Z and 0-9
 *
 * Example: 'GJ 01 AB 1234' -> 'GJ01AB1234'
 *          'GJ-01-AB-1234' -> 'GJ01AB1234'
 */
function normalizePlateNumber(input) {
  if (!input || typeof input !== "string") return "";
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Intelligent canonical Indian license plate normalization.
 * Handles common OCR confusions between:
 * - O / Q / D and 0
 * - I / L and 1
 * - Z and 2
 * - B and 8
 * - S and 5
 * based on the character positions in standard Indian plates.
 */
function canonicalPlateNumber(input) {
  const norm = normalizePlateNumber(input);
  if (!norm) return "";

  if (norm.length >= 8 && norm.length <= 11) {
    const chars = norm.split("");

    // State code (first 2 characters must be letters)
    for (let i = 0; i < 2; i++) {
      if (chars[i] === "0") chars[i] = "O";
      if (chars[i] === "1") chars[i] = "I";
      if (chars[i] === "8") chars[i] = "B";
    }

    // District code (positions 2 & 3 must be digits)
    for (let i = 2; i < 4; i++) {
      if (chars[i] === "O" || chars[i] === "Q" || chars[i] === "D") chars[i] = "0";
      if (chars[i] === "I" || chars[i] === "L") chars[i] = "1";
      if (chars[i] === "Z") chars[i] = "2";
      if (chars[i] === "B") chars[i] = "8";
      if (chars[i] === "S") chars[i] = "5";
    }

    // Last registration digits (usually last 4 characters)
    const endDigits = Math.min(4, chars.length - 5);
    for (let i = chars.length - endDigits; i < chars.length; i++) {
      if (chars[i] === "O" || chars[i] === "Q" || chars[i] === "D") chars[i] = "0";
      if (chars[i] === "I" || chars[i] === "L") chars[i] = "1";
      if (chars[i] === "Z") chars[i] = "2";
      if (chars[i] === "B") chars[i] = "8";
      if (chars[i] === "S") chars[i] = "5";
    }

    return chars.join("");
  }

  return norm;
}

/**
 * Calculate Levenshtein edit distance between two strings.
 */
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // deletion
          dp[i][j - 1] + 1,      // insertion
          dp[i - 1][j - 1] + 1   // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Match a detected plate string against an active record list.
 */
function matchPlateAgainstRecords(detectedPlate, ocrConfidence, allRecords) {
  const normalizedDetected = normalizePlateNumber(detectedPlate);
  const canonicalDetected = canonicalPlateNumber(detectedPlate);

  if (!normalizedDetected || normalizedDetected.length < 3) {
    return {
      matchStatus: "OCR_UNCERTAIN",
      matchedRecord: null,
      matchType: "NO_MATCH",
      confidenceNote: "Plate detected but text extraction is unreadable or uncertain.",
    };
  }

  // 1. Exact Normalized or Canonical Match
  for (const record of allRecords) {
    const rawRecord = record.normalized_plate_number || record.plate_number;
    const normRecord = normalizePlateNumber(rawRecord);
    const canonRecord = canonicalPlateNumber(rawRecord);

    const isExactMatch = normRecord === normalizedDetected;
    const isCanonMatch = canonRecord === canonicalDetected;

    if (isExactMatch || isCanonMatch) {
      if (record.status === "ACTIVE") {
        return {
          matchStatus: "MATCH_FOUND",
          matchedRecord: record,
          matchType: "EXACT_MATCH",
          confidenceNote: isExactMatch
            ? "Exact normalized match against active monitored record."
            : `Exact canonical match against active monitored record (${canonRecord}).`,
        };
      } else {
        return {
          matchStatus: "NO_MATCH",
          matchedRecord: record,
          matchType: "NO_MATCH",
          isInactiveRecord: true,
          confidenceNote: "Record exists in database but is currently INACTIVE.",
        };
      }
    }
  }

  // 2. Check for Near Match (Levenshtein distance <= 1)
  for (const record of allRecords) {
    if (record.status !== "ACTIVE") continue;
    const rawRecord = record.normalized_plate_number || record.plate_number;
    const canonRecord = canonicalPlateNumber(rawRecord);

    if (Math.abs(canonRecord.length - canonicalDetected.length) <= 1) {
      const dist = levenshteinDistance(canonRecord, canonicalDetected);
      if (dist <= 1 && canonRecord.length >= 5) {
        return {
          matchStatus: "POSSIBLE_MATCH",
          matchedRecord: record,
          matchType: "POSSIBLE_MATCH",
          confidenceNote: `Near match with active record ${canonRecord} (${dist} char difference).`,
        };
      }
    }
  }

  return {
    matchStatus: "NO_MATCH",
    matchedRecord: null,
    matchType: "NO_MATCH",
    confidenceNote: "No active matching plate record found.",
  };
}

module.exports = {
  normalizePlateNumber,
  canonicalPlateNumber,
  levenshteinDistance,
  matchPlateAgainstRecords,
};
