/**
 * DrishtiGrid GIS Spatial Service
 * High-performance spatial analysis, spherical calculations,
 * corridor camera discovery, and multi-factor coverage gap metrics.
 */

// Earth radius in meters
const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates Haversine distance between two [lat, lng] or [lng, lat] coordinate pairs in meters
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculates compass bearing from point 1 to point 2 in degrees (0 - 360)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Returns compass direction label (N, NE, E, SE, S, SW, W, NW)
 */
function bearingToDirection(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

/**
 * Minimum distance from point P to line segment AB in meters
 */
function distanceToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
  const l2 = (bLat - aLat) ** 2 + (bLng - aLng) ** 2;
  if (l2 === 0) return haversineDistanceMeters(pLat, pLng, aLat, aLng);

  // Projection parameter t
  let t = ((pLat - aLat) * (bLat - aLat) + (pLng - aLng) * (bLng - aLng)) / l2;
  t = Math.max(0, Math.min(1, t));

  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);

  return {
    distanceMeters: haversineDistanceMeters(pLat, pLng, projLat, projLng),
    projectionPoint: [projLat, projLng],
    fraction: t,
  };
}

/**
 * Tests if a [lng, lat] point is inside a GeoJSON Polygon ring using Ray-Casting
 */
function isPointInPolygonRing(point, ring) {
  const [lng, lat] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Verifies if [lng, lat] point is inside a GeoJSON geometry (Polygon or MultiPolygon)
 */
function isPointInGeometry(point, geometry) {
  if (!geometry || !geometry.coordinates) return false;

  if (geometry.type === 'Polygon') {
    // ring 0 is outer boundary
    const outerRing = geometry.coordinates[0];
    if (!isPointInPolygonRing(point, outerRing)) return false;

    // Must not be in any inner hole rings
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (isPointInPolygonRing(point, geometry.coordinates[i])) return false;
    }
    return true;
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polyCoords) => {
      const outerRing = polyCoords[0];
      if (!isPointInPolygonRing(point, outerRing)) return false;
      for (let i = 1; i < polyCoords.length; i++) {
        if (isPointInPolygonRing(point, polyCoords[i])) return false;
      }
      return true;
    });
  }

  return false;
}

/**
 * Finds cameras along a route polyline within a specified corridor width (meters)
 * @param {Array<[number, number]>} routeCoordinates - List of [lng, lat] coordinates defining the polyline
 * @param {Array<Object>} allCameras - Available cameras
 * @param {number} corridorWidthMeters - Maximum perpendicular distance from route (default 150m)
 */
function findCamerasAlongRoute(routeCoordinates, allCameras, corridorWidthMeters = 150) {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return [];
  }

  const matchedCameras = [];

  // Bounding box filter for quick candidate pruning
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  routeCoordinates.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });

  // Expand bounding box by approx buffer degrees (1 deg ~ 111km)
  const degBuffer = (corridorWidthMeters + 100) / 111000;
  const bboxMinLng = minLng - degBuffer;
  const bboxMaxLng = maxLng + degBuffer;
  const bboxMinLat = minLat - degBuffer;
  const bboxMaxLat = maxLat + degBuffer;

  const candidateCameras = allCameras.filter((cam) => {
    const lat = cam.latitude || cam.location?.coordinates?.[1];
    const lng = cam.longitude || cam.location?.coordinates?.[0];
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    return lat >= bboxMinLat && lat <= bboxMaxLat && lng >= bboxMinLng && lng <= bboxMaxLng;
  });

  // Calculate cumulative route segment distances for sequential progression ordering
  const segmentLengths = [];
  let totalRouteLength = 0;
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const [aLng, aLat] = routeCoordinates[i];
    const [bLng, bLat] = routeCoordinates[i + 1];
    const dist = haversineDistanceMeters(aLat, aLng, bLat, bLng);
    segmentLengths.push({ startOffset: totalRouteLength, length: dist });
    totalRouteLength += dist;
  }

  candidateCameras.forEach((cam) => {
    const cLat = cam.latitude || cam.location?.coordinates?.[1];
    const cLng = cam.longitude || cam.location?.coordinates?.[0];

    let minDistance = Infinity;
    let closestSegmentIdx = 0;
    let closestFraction = 0;

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const [aLng, aLat] = routeCoordinates[i];
      const [bLng, bLat] = routeCoordinates[i + 1];

      const res = distanceToSegmentMeters(cLat, cLng, aLat, aLng, bLat, bLng);
      if (res.distanceMeters < minDistance) {
        minDistance = res.distanceMeters;
        closestSegmentIdx = i;
        closestFraction = res.fraction;
      }
    }

    if (minDistance <= corridorWidthMeters) {
      const segInfo = segmentLengths[closestSegmentIdx];
      const routeProgressMeters = segInfo.startOffset + segInfo.length * closestFraction;

      const [aLng, aLat] = routeCoordinates[closestSegmentIdx];
      const [bLng, bLat] = routeCoordinates[closestSegmentIdx + 1];
      const segmentBearing = calculateBearing(aLat, aLng, bLat, bLng);

      matchedCameras.push({
        camera: cam,
        cameraId: cam.cameraId,
        name: cam.name || cam.cameraName,
        location: cam.address?.area || cam.locationName || cam.roadName || cam.district,
        department: cam.departmentName || 'Gujarat Police',
        departmentCode: cam.departmentCode || 'POLICE',
        status: cam.status || 'offline',
        type: cam.type || 'Fixed',
        distanceFromRouteMeters: Math.round(minDistance),
        routeProgressMeters: Math.round(routeProgressMeters),
        heading: cam.heading !== undefined ? cam.heading : Math.round(segmentBearing),
        direction: bearingToDirection(cam.heading !== undefined ? cam.heading : segmentBearing),
        hasPhysicalFovCoverage: Boolean(cam.fieldOfView && cam.heading !== undefined),
        coordinates: [cLng, cLat],
      });
    }
  });

  // Sort sequentially along the route from start to end
  matchedCameras.sort((a, b) => a.routeProgressMeters - b.routeProgressMeters);

  return matchedCameras;
}

/**
 * Calculates multi-factor CCTV Coverage Gap score for geographic zones or cells
 * Considers:
 * 1. Camera density and distance
 * 2. Incident frequency
 * 3. Proximity to critical civic assets (Hospitals, Police Stations, Fire Stations, Transit)
 * 4. Road/transit corridor importance
 */
function calculateMultiFactorCoverageScore({
  areaName,
  cameras = [],
  incidents = [],
  infrastructure = [],
  totalAreaSqKm = 100,
  trafficLevel = 'MEDIUM',
}) {
  const cameraCount = cameras.length;
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved' && i.status !== 'closed').length;
  const assetCount = infrastructure.length;

  // 1. Base Camera Optical Coverage (Max 45 points)
  let totalOpticalSqMeters = 0;
  cameras.forEach((c) => {
    const rad = c.type === 'PTZ' ? 120 : (c.coverageRadius || 50);
    totalOpticalSqMeters += Math.PI * rad * rad;
  });
  const coveredSqKm = totalOpticalSqMeters / 1000000;
  const cameraCoverageRatio = Math.min(1, coveredSqKm / Math.max(1, totalAreaSqKm * 0.15));
  const cameraScore = Math.round(cameraCoverageRatio * 45);

  // 2. Incident Pressure & Risk (Max 25 points, deducted if uncovered incidents)
  let incidentScore = 25;
  if (activeIncidents > 0) {
    const ratio = cameraCount / Math.max(1, activeIncidents * 3);
    incidentScore = Math.round(Math.min(25, ratio * 20));
  }

  // 3. Critical Infrastructure Coverage (Max 20 points)
  let infraScore = 20;
  if (assetCount > 0) {
    const coveredAssets = infrastructure.filter((asset) => {
      const aLat = asset.latitude || asset.location?.coordinates?.[1];
      const aLng = asset.longitude || asset.location?.coordinates?.[0];
      return cameras.some((c) => {
        const cLat = c.latitude || c.location?.coordinates?.[1];
        const cLng = c.longitude || c.location?.coordinates?.[0];
        return haversineDistanceMeters(aLat, aLng, cLat, cLng) <= 300; // 300m protection radius
      });
    }).length;
    infraScore = Math.round((coveredAssets / assetCount) * 20);
  }

  // 4. Traffic & Arterial Weighting (Max 10 points)
  let trafficScore = 8;
  if (trafficLevel === 'HIGH') {
    trafficScore = cameraCount >= 5 ? 10 : 3;
  } else if (trafficLevel === 'CRITICAL') {
    trafficScore = cameraCount >= 10 ? 10 : 1;
  }

  const rawScore = cameraScore + incidentScore + infraScore + trafficScore;
  const totalScore = Math.max(5, Math.min(98, rawScore));

  // Determine Level
  let level = 'GOOD';
  let badgeColor = 'GREEN';
  let risk = 'LOW';
  if (totalScore < 30) {
    level = 'CRITICAL_GAP';
    badgeColor = 'RED';
    risk = 'CRITICAL';
  } else if (totalScore < 55) {
    level = 'POOR';
    badgeColor = 'ORANGE';
    risk = 'HIGH';
  } else if (totalScore < 75) {
    level = 'MODERATE';
    badgeColor = 'YELLOW';
    risk = 'MEDIUM';
  }

  // Generate actionable reasons
  const contributingReasons = [];
  if (cameraCount === 0) contributingReasons.push('Zero CCTV surveillance cameras deployed in this sector');
  else if (cameraCount < 3) contributingReasons.push(`Critically low camera density (${cameraCount} active cameras)`);

  if (activeIncidents >= 3) contributingReasons.push(`High incident activity (${activeIncidents} unresolved incidents)`);
  if (assetCount > 0 && infraScore < 12) contributingReasons.push('Critical civic infrastructure lacks dedicated optical perimeter');
  if (trafficLevel === 'HIGH' || trafficLevel === 'CRITICAL') contributingReasons.push('Major transit corridor with blind spots between signal junctions');

  if (contributingReasons.length === 0) {
    contributingReasons.push('Sufficient overlapping camera buffers across junctions');
  }

  // Recommended additional cameras (clearly marked as estimated recommendation)
  const recommendedAdditionalCameras =
    level === 'CRITICAL_GAP'
      ? Math.max(6, Math.ceil(activeIncidents * 1.5 + assetCount * 0.8))
      : level === 'POOR'
      ? Math.max(3, Math.ceil(activeIncidents * 1.0 + assetCount * 0.5))
      : level === 'MODERATE'
      ? 2
      : 0;

  return {
    areaName,
    coverageScore: totalScore,
    coveragePercentage: totalScore,
    level,
    badgeColor,
    risk,
    trafficLevel,
    contributingReasons,
    recommendedAdditionalCameras,
    // Explicit separation of ground-truth observed vs estimated
    observedData: {
      existingCameras: cameraCount,
      activeIncidents,
      criticalAssets: assetCount,
    },
    estimatedCoverage: {
      model: 'DrishtiGrid-Spatial-Coverage-v2',
      confidence: 'ESTIMATED_MODEL',
      recommendedAdditionalCameras,
      score: totalScore,
    },
  };
}

module.exports = {
  EARTH_RADIUS_METERS,
  haversineDistanceMeters,
  calculateBearing,
  bearingToDirection,
  distanceToSegmentMeters,
  isPointInPolygonRing,
  isPointInGeometry,
  findCamerasAlongRoute,
  calculateMultiFactorCoverageScore,
};
