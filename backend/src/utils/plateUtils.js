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
  let clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.startsWith("IND") && clean.length >= 11) {
    clean = clean.slice(3);
  }
  return clean;
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

/**
 * Find the longest common substring between two strings.
 */
function findLongestCommonSubstring(s1, s2) {
  if (!s1 || !s2) return "";
  let longest = "";
  for (let i = 0; i < s1.length; i++) {
    for (let j = i + 1; j <= s1.length; j++) {
      const sub = s1.slice(i, j);
      if (s2.includes(sub) && sub.length > longest.length) {
        longest = sub;
      }
    }
  }
  return longest;
}

/**
 * Determine whether two plate detections represent the same vehicle / number plate,
 * handling partial crops, single-row vs two-row OCR, character substitutions, and prefix/suffix noise.
 */
function arePlatesSimilar(p1, p2) {
  if (!p1 || !p2) return false;
  const n1 = normalizePlateNumber(p1);
  const n2 = normalizePlateNumber(p2);
  if (!n1 || !n2) return false;

  // 1. Exact match
  if (n1 === n2) return true;

  // 2. Canonical match (O/0, I/1, B/8, Z/2, S/5)
  const c1 = canonicalPlateNumber(n1);
  const c2 = canonicalPlateNumber(n2);
  if (c1 === c2) return true;

  // 3. Substring containment (one plate is a partial/half view of the other)
  if (n1.length >= 4 && n2.includes(n1)) return true;
  if (n2.length >= 4 && n1.includes(n2)) return true;
  if (c1.length >= 4 && c2.includes(c1)) return true;
  if (c2.length >= 4 && c1.includes(c2)) return true;

  // 4. Same registration number suffix (last 4 digits match and edit distance <= 3)
  if (n1.length >= 5 && n2.length >= 5) {
    const end1 = n1.slice(-4);
    const end2 = n2.slice(-4);
    if (end1 === end2 && /^\d{3,4}$/.test(end1)) {
      if (levenshteinDistance(c1, c2) <= 3) return true;
    }
  }

  // 5. Longest Common Substring
  const lcs = findLongestCommonSubstring(c1, c2);
  if (lcs.length >= 5) return true;
  if (lcs.length >= 4 && Math.min(n1.length, n2.length) <= 6) return true;

  // 6. Levenshtein edit distance <= 2 for strings with length >= 6
  if (Math.abs(n1.length - n2.length) <= 2 && Math.min(n1.length, n2.length) >= 6) {
    if (levenshteinDistance(c1, c2) <= 2) return true;
  }

  return false;
}

module.exports = {
  normalizePlateNumber,
  canonicalPlateNumber,
  levenshteinDistance,
  matchPlateAgainstRecords,
  findLongestCommonSubstring,
  arePlatesSimilar,
};
