/**
 * Plate processing, Indian standard format normalization, and OCR error-repair utilities.
 */

/**
 * Normalizes a plate number string:
 * - Upper-cases
 * - Removes spaces, hyphens, dots, underscores, special characters
 * Example: 'GJ 01 AB 1234' -> 'GJ01AB1234'
 */
function normalizePlateNumber(input) {
  if (!input || typeof input !== 'string') return '';
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Intelligent Indian license plate canonical normalization.
 * Indian format structure:
 *   [State Code 2L] [District Code 2D] [Series 1-3L] [Number 1-4D]
 * Disambiguates common OCR confusion:
 * - Letters vs Digits based on character position:
 *   - State (0, 1): 0->O, 1->I, 8->B
 *   - District (2, 3): O/Q/D->0, I/L->1, Z->2, B->8, S->5
 *   - Registration Number (last 4 chars): O/Q/D->0, I/L->1, Z->2, B->8, S->5
 */
function canonicalPlateNumber(input) {
  const norm = normalizePlateNumber(input);
  if (!norm) return '';

  if (norm.length >= 8 && norm.length <= 11) {
    const chars = norm.split('');

    // State code (positions 0 & 1 must be letters)
    for (let i = 0; i < 2; i++) {
      if (chars[i] === '0') chars[i] = 'O';
      if (chars[i] === '1') chars[i] = 'I';
      if (chars[i] === '8') chars[i] = 'B';
    }

    // District code (positions 2 & 3 must be digits)
    for (let i = 2; i < 4; i++) {
      if (chars[i] === 'O' || chars[i] === 'Q' || chars[i] === 'D') chars[i] = '0';
      if (chars[i] === 'I' || chars[i] === 'L') chars[i] = '1';
      if (chars[i] === 'Z') chars[i] = '2';
      if (chars[i] === 'B') chars[i] = '8';
      if (chars[i] === 'S') chars[i] = '5';
    }

    // Last registration digits (usually last 4 characters)
    const endDigits = Math.min(4, chars.length - 5);
    for (let i = chars.length - endDigits; i < chars.length; i++) {
      if (chars[i] === 'O' || chars[i] === 'Q' || chars[i] === 'D') chars[i] = '0';
      if (chars[i] === 'I' || chars[i] === 'L') chars[i] = '1';
      if (chars[i] === 'Z') chars[i] = '2';
      if (chars[i] === 'B') chars[i] = '8';
      if (chars[i] === 'S') chars[i] = '5';
    }

    return chars.join('');
  }

  return norm;
}

/**
 * Calculate Levenshtein edit distance between two strings
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
 * Match a detected plate against active watchlist records.
 */
function matchPlateAgainstRecords(detectedPlate, allRecords) {
  const normalizedDetected = normalizePlateNumber(detectedPlate);
  const canonicalDetected = canonicalPlateNumber(detectedPlate);

  if (!normalizedDetected || normalizedDetected.length < 3) {
    return {
      matchStatus: 'OCR_UNCERTAIN',
      matchedRecord: null,
      matchType: 'NO_MATCH',
      confidenceNote: 'Plate detected but character sequence is ambiguous or incomplete.',
    };
  }

  // 1. Exact or Canonical Match
  for (const record of allRecords) {
    const rawRecord = record.normalized_plate_number || record.plate_number;
    const normRecord = normalizePlateNumber(rawRecord);
    const canonRecord = canonicalPlateNumber(rawRecord);

    const isExactMatch = normRecord === normalizedDetected;
    const isCanonMatch = canonRecord === canonicalDetected;

    if (isExactMatch || isCanonMatch) {
      if (record.status === 'ACTIVE') {
        return {
          matchStatus: 'MATCH_FOUND',
          matchedRecord: record,
          matchType: 'EXACT_MATCH',
          confidenceNote: isExactMatch
            ? 'Exact match with active monitored watchlist record.'
            : `Exact canonical syntax match with active record (${canonRecord}).`,
        };
      } else {
        return {
          matchStatus: 'NO_MATCH',
          matchedRecord: record,
          matchType: 'NO_MATCH',
          isInactiveRecord: true,
          confidenceNote: 'Record exists in database but is currently INACTIVE.',
        };
      }
    }
  }

  // 2. Fuzzy / Near Match (Levenshtein distance <= 1)
  for (const record of allRecords) {
    if (record.status !== 'ACTIVE') continue;
    const rawRecord = record.normalized_plate_number || record.plate_number;
    const canonRecord = canonicalPlateNumber(rawRecord);

    if (Math.abs(canonRecord.length - canonicalDetected.length) <= 1) {
      const dist = levenshteinDistance(canonRecord, canonicalDetected);
      if (dist <= 1 && canonRecord.length >= 5) {
        return {
          matchStatus: 'POSSIBLE_MATCH',
          matchedRecord: record,
          matchType: 'POSSIBLE_MATCH',
          confidenceNote: `Near match with active record ${canonRecord} (${dist} char difference).`,
        };
      }
    }
  }

  return {
    matchStatus: 'NO_MATCH',
    matchedRecord: null,
    matchType: 'NO_MATCH',
    confidenceNote: 'No matching watchlist record found.',
  };
}

module.exports = {
  normalizePlateNumber,
  canonicalPlateNumber,
  levenshteinDistance,
  matchPlateAgainstRecords,
};
