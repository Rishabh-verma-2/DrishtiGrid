import gujaratDistrictsData from '../data/gujarat_districts.json';

/**
 * Geospatial utility functions for calculating official map administrative boundaries,
 * Google Maps style highlighting, inverted mask holes, point-in-polygon checks,
 * and camera clustering.
 */

// World boundary coordinates for the Leaflet inverted mask
export const WORLD_BOUNDS = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];

// Aliases mapping common search terms to official district names
export const DISTRICT_ALIASES = {
  'chhota udepur': 'Chhota Udaipur',
  'chhotaudepur': 'Chhota Udaipur',
  'devbhoomi dwarka': 'Devbhumi Dwarka',
  'devbhumidwarka': 'Devbhumi Dwarka',
  'dwarka': 'Devbhumi Dwarka',
  'kutch': 'Kutch',
  'kachchh': 'Kutch',
  'dangs': 'Dang',
  'the dangs': 'Dang',
  'gir': 'Gir Somnath',
  'somnath': 'Gir Somnath',
  'panchmahal': 'Panchmahal',
  'panchmahal district': 'Panchmahal',
  'panchmahals': 'Panchmahal',
};

// All 34 official district names in Gujarat
export const OFFICIAL_DISTRICTS = gujaratDistrictsData.features
  .map((f) => f.properties.district)
  .sort();

/**
 * Normalizes an area search query by stripping common suffixes
 */
export function normalizeAreaName(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+(district|city|rural|urban|state|taluka|corporation|municipality)$/i, '')
    .trim();
}

/**
 * Finds the official GeoJSON administrative feature for a given area name
 * Supports single districts, cities, talukas, or "Gujarat" state.
 */
export function getOfficialAreaFeature(areaName) {
  if (!areaName) return null;
  const q = normalizeAreaName(areaName);

  if (q === 'gujarat' || q === 'gujarat state' || q === 'all' || q === 'entire gujarat') {
    return {
      isState: true,
      name: 'Gujarat State',
      features: gujaratDistrictsData.features,
    };
  }

  const target = DISTRICT_ALIASES[q] ? DISTRICT_ALIASES[q].toLowerCase() : q;

  const found = gujaratDistrictsData.features.find((f) => {
    const d = (f.properties.district || '').toLowerCase();
    return d === target || d === q || d.includes(target) || target.includes(d);
  });

  return found || null;
}

/**
 * Extracts Leaflet-compatible polygon positions ([lat, lng]) for the official boundary line
 */
export function getOfficialBorderPositions(feature) {
  if (!feature) return null;

  if (feature.isState) {
    // Collect all rings for all 34 districts
    return feature.features.map((f) => {
      if (f.geometry.type === 'Polygon') {
        return f.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
      }
      return f.geometry.coordinates.map((p) => p[0].map(([lng, lat]) => [lat, lng]));
    });
  }

  if (feature.geometry.type === 'Polygon') {
    // Array of rings: outer ring + inner holes
    return feature.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
  }

  if (feature.geometry.type === 'MultiPolygon') {
    // Multi-polygon: array of polygons, each having rings
    return feature.geometry.coordinates.map((poly) =>
      poly.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
    );
  }

  return null;
}

/**
 * Generates an inverted mask polygon for Leaflet
 * The outer ring covers the entire world, and the inner rings are the holes of the official region
 */
export function getOfficialInvertedMask(feature) {
  if (!feature) return null;

  const holes = [];

  const addFeatureHoles = (f) => {
    if (f.geometry.type === 'Polygon') {
      holes.push(f.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]));
    } else if (f.geometry.type === 'MultiPolygon') {
      f.geometry.coordinates.forEach((poly) => {
        holes.push(poly[0].map(([lng, lat]) => [lat, lng]));
      });
    }
  };

  if (feature.isState) {
    feature.features.forEach(addFeatureHoles);
  } else {
    addFeatureHoles(feature);
  }

  if (holes.length === 0) return null;

  return [WORLD_BOUNDS, ...holes];
}

/**
 * Computes exact Leaflet [[minLat, minLng], [maxLat, maxLng]] bounds from official GeoJSON
 */
export function getOfficialAreaBounds(feature) {
  if (!feature) return null;

  const feats = feature.isState ? feature.features : [feature];
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;

  feats.forEach((f) => {
    const rings =
      f.geometry.type === 'Polygon'
        ? f.geometry.coordinates
        : f.geometry.coordinates.flat(1);

    rings.forEach((ring) => {
      ring.forEach(([lng, lat]) => {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      });
    });
  });

  if (minLat === Infinity) return null;

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

/**
 * Ray-casting algorithm to test if a [lat, lng] point is inside a polygon ring
 */
export function isPointInRing(point, ring) {
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const intersect =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if a camera is located inside an official administrative area
 */
export function isCameraInOfficialArea(camera, feature) {
  if (!camera || !feature) return false;

  if (feature.isState) return true;

  const camDist = normalizeAreaName(camera.district);
  const featDist = normalizeAreaName(feature.properties.district);

  // 1. Direct district match
  if (
    camDist &&
    featDist &&
    (camDist === featDist ||
      DISTRICT_ALIASES[camDist]?.toLowerCase() === featDist.toLowerCase() ||
      DISTRICT_ALIASES[featDist]?.toLowerCase() === camDist.toLowerCase())
  ) {
    return true;
  }

  // 2. Point-in-polygon verification for coordinates
  const lat = camera.latitude || camera.location?.coordinates?.[1];
  const lng = camera.longitude || camera.location?.coordinates?.[0];
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return false;
  }

  const pt = [lat, lng];

  if (feature.geometry.type === 'Polygon') {
    const ring = feature.geometry.coordinates[0].map(([gLng, gLat]) => [gLat, gLng]);
    return isPointInRing(pt, ring);
  }

  if (feature.geometry.type === 'MultiPolygon') {
    return feature.geometry.coordinates.some((poly) => {
      const ring = poly[0].map(([gLng, gLat]) => [gLat, gLng]);
      return isPointInRing(pt, ring);
    });
  }

  return false;
}

/**
 * Resolves cameras belonging to an official area
 */
export function getOfficialAreaCameras(cameras, areaName) {
  if (!areaName || !cameras || cameras.length === 0) return [];
  const feature = getOfficialAreaFeature(areaName);
  if (!feature) return [];

  return cameras.filter((c) => isCameraInOfficialArea(c, feature));
}

// ─── Legacy Geometric Fallbacks ──────────────────────────────────────
function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function computeConvexHull(points) {
  if (!points || points.length === 0) return [];
  if (points.length <= 3) return points;

  const sorted = points.slice().sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const lower = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
      lower.pop();
    }
    lower.push(sorted[i]);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
      upper.pop();
    }
    upper.push(sorted[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function createInvertedMask(innerHolePolygon) {
  if (!innerHolePolygon || innerHolePolygon.length < 3) return null;
  return [WORLD_BOUNDS, innerHolePolygon];
}

export function getBounds(points) {
  if (!points || points.length === 0) return null;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  points.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}
