/**
 * DrishtiGrid Authoritative GIS Gap Analysis Engine
 * Real spatial grid decomposition, Haversine distance computations,
 * multi-factor coverage scoring, and departmental routing logic.
 */

const Camera = require('../models/Camera');
const Department = require('../models/Department');
const InfrastructureAsset = require('../models/InfrastructureAsset');
const Incident = require('../models/Incident');
const { EARTH_RADIUS_METERS, haversineDistanceMeters } = require('./gisService');
const logger = require('../utils/logger');

// Configurable thresholds
const GAP_CONFIG = {
  gridResolution: {
    sub500m: 100,    // 100m grid cell for <= 500m radius
    sub1km: 150,     // 150m grid cell for <= 1km radius
    sub2km: 250,     // 250m grid cell for <= 2km radius
    sub5km: 400,     // 400m grid cell for <= 5km radius
    large: 750,      // 750m grid cell for > 5km radius
  },
  classification: {
    goodNearestMaxMeters: 120,
    goodMinActiveCameras: 2,
    moderateNearestMaxMeters: 300,
    moderateMinActiveCameras: 1,
    lowNearestMaxMeters: 600,
  },
  scoring: {
    opticalGridWeight: 40,
    densityWeight: 25,
    infraProtectionWeight: 20,
    operationalHealthWeight: 15,
  },
};

/**
 * Returns grid step size in meters according to analysis radius
 */
function getAdaptiveGridStepMeters(radiusMeters) {
  if (radiusMeters <= 500) return GAP_CONFIG.gridResolution.sub500m;
  if (radiusMeters <= 1000) return GAP_CONFIG.gridResolution.sub1km;
  if (radiusMeters <= 2000) return GAP_CONFIG.gridResolution.sub2km;
  if (radiusMeters <= 5000) return GAP_CONFIG.gridResolution.sub5km;
  return GAP_CONFIG.gridResolution.large;
}

/**
 * Generates an adaptive spatial grid centered around [centerLat, centerLng]
 */
function generateSpatialGrid(centerLat, centerLng, radiusMeters) {
  const stepMeters = getAdaptiveGridStepMeters(radiusMeters);

  // Approximate degrees per meter
  const degLatPerMeter = 1 / 111139;
  const degLngPerMeter = 1 / (111139 * Math.cos((centerLat * Math.PI) / 180));

  const dLatStep = stepMeters * degLatPerMeter;
  const dLngStep = stepMeters * degLngPerMeter;

  const latSteps = Math.ceil(radiusMeters / stepMeters);
  const lngSteps = Math.ceil(radiusMeters / stepMeters);

  const cells = [];
  let cellIndex = 1;

  for (let i = -latSteps; i <= latSteps; i++) {
    for (let j = -lngSteps; j <= lngSteps; j++) {
      const cellLat = centerLat + i * dLatStep;
      const cellLng = centerLng + j * dLngStep;

      const distFromCenter = haversineDistanceMeters(centerLat, centerLng, cellLat, cellLng);
      // Keep cells whose center point lies within the analysis circle (plus half step tolerance)
      if (distFromCenter <= radiusMeters + stepMeters * 0.4) {
        const halfLat = dLatStep / 2;
        const halfLng = dLngStep / 2;

        cells.push({
          cellId: `CELL-${String(cellIndex++).padStart(3, '0')}`,
          center: [parseFloat(cellLat.toFixed(6)), parseFloat(cellLng.toFixed(6))],
          bounds: [
            [parseFloat((cellLat - halfLat).toFixed(6)), parseFloat((cellLng - halfLng).toFixed(6))],
            [parseFloat((cellLat + halfLat).toFixed(6)), parseFloat((cellLng + halfLng).toFixed(6))],
          ],
          stepMeters,
          distFromCenter: Math.round(distFromCenter),
        });
      }
    }
  }

  return { cells, stepMeters };
}

/**
 * Queries cameras in database within radius and optional filters
 */
async function queryCamerasInRadius(centerLat, centerLng, radiusMeters, filters = {}) {
  const degLatBuffer = (radiusMeters + 500) / 111139;
  const degLngBuffer = (radiusMeters + 500) / (111139 * Math.cos((centerLat * Math.PI) / 180));

  const minLat = centerLat - degLatBuffer;
  const maxLat = centerLat + degLatBuffer;
  const minLng = centerLng - degLngBuffer;
  const maxLng = centerLng + degLngBuffer;

  const mongoQuery = {
    isActive: true,
    $or: [
      {
        latitude: { $gte: minLat, $lte: maxLat },
        longitude: { $gte: minLng, $lte: maxLng },
      },
      {
        'location.coordinates.1': { $gte: minLat, $lte: maxLat },
        'location.coordinates.0': { $gte: minLng, $lte: maxLng },
      },
    ],
  };

  if (filters.cameraType && filters.cameraType !== 'all') {
    mongoQuery.type = new RegExp(`^${filters.cameraType}$`, 'i');
  }

  if (filters.cameraStatus && filters.cameraStatus !== 'all') {
    const st = filters.cameraStatus.toLowerCase();
    if (st === 'active' || st === 'online') {
      mongoQuery.status = 'online';
    } else if (st === 'inactive' || st === 'offline') {
      mongoQuery.status = 'offline';
    } else if (st === 'maintenance') {
      mongoQuery.status = 'maintenance';
    }
  }

  if (filters.departmentCode && filters.departmentCode !== 'all') {
    mongoQuery.departmentCode = filters.departmentCode.toUpperCase();
  }

  const rawCameras = await Camera.find(mongoQuery).select(
    'cameraId name cameraName type status departmentCode departmentName district taluka roadName landmark location latitude longitude coverageRadius'
  );

  // Exact Haversine distance filter
  const matchedCameras = [];
  rawCameras.forEach((cam) => {
    const lat = cam.latitude || cam.location?.coordinates?.[1];
    const lng = cam.longitude || cam.location?.coordinates?.[0];

    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      const dist = haversineDistanceMeters(centerLat, centerLng, lat, lng);
      if (dist <= radiusMeters) {
        matchedCameras.push({
          ...cam.toObject(),
          lat,
          lng,
          distanceFromCenterMeters: Math.round(dist),
        });
      }
    }
  });

  return matchedCameras;
}

/**
 * Queries infrastructure assets within radius
 */
async function queryInfrastructureInRadius(centerLat, centerLng, radiusMeters) {
  const degLatBuffer = (radiusMeters + 500) / 111139;
  const degLngBuffer = (radiusMeters + 500) / (111139 * Math.cos((centerLat * Math.PI) / 180));

  const rawAssets = await InfrastructureAsset.find({
    $or: [
      {
        'location.coordinates.1': { $gte: centerLat - degLatBuffer, $lte: centerLat + degLatBuffer },
        'location.coordinates.0': { $gte: centerLng - degLngBuffer, $lte: centerLng + degLngBuffer },
      },
      {
        latitude: { $gte: centerLat - degLatBuffer, $lte: centerLat + degLatBuffer },
        longitude: { $gte: centerLng - degLngBuffer, $lte: centerLng + degLngBuffer },
      },
    ],
  }).select('assetId name type location latitude longitude district');

  return rawAssets.filter((asset) => {
    const aLat = asset.latitude || asset.location?.coordinates?.[1];
    const aLng = asset.longitude || asset.location?.coordinates?.[0];
    if (typeof aLat !== 'number' || typeof aLng !== 'number') return false;
    return haversineDistanceMeters(centerLat, centerLng, aLat, aLng) <= radiusMeters;
  });
}

/**
 * Evaluates spatial clustering across quadrants
 */
function analyzeSpatialClustering(centerLat, centerLng, cameras) {
  const quadrants = {
    northEast: 0,
    northWest: 0,
    southEast: 0,
    southWest: 0,
  };

  cameras.forEach((cam) => {
    if (cam.lat >= centerLat && cam.lng >= centerLng) quadrants.northEast++;
    else if (cam.lat >= centerLat && cam.lng < centerLng) quadrants.northWest++;
    else if (cam.lat < centerLat && cam.lng >= centerLng) quadrants.southEast++;
    else quadrants.southWest++;
  });

  const total = cameras.length;
  if (total < 4) {
    return {
      quadrants,
      description: 'Camera count is too low to detect significant clustering patterns.',
    };
  }

  const percentages = {
    northEast: Math.round((quadrants.northEast / total) * 100),
    northWest: Math.round((quadrants.northWest / total) * 100),
    southEast: Math.round((quadrants.southEast / total) * 100),
    southWest: Math.round((quadrants.southWest / total) * 100),
  };

  const highestQuad = Object.entries(percentages).sort((a, b) => b[1] - a[1])[0];
  const lowestQuad = Object.entries(percentages).sort((a, b) => a[1] - b[1])[0];

  let description = 'Camera distribution is relatively balanced across all sectors.';
  if (highestQuad[1] >= 50 && lowestQuad[1] <= 10) {
    description = `Pronounced camera clustering detected: ${highestQuad[0]} sector holds ${highestQuad[1]}% of units, while ${lowestQuad[0]} sector has only ${lowestQuad[1]}% coverage.`;
  }

  return { quadrants, percentages, description };
}

/**
 * Determines responsible departments for the given area
 */
async function identifyResponsibleDepartment(locationDistrict, cameras) {
  const allDepts = await Department.find({ isActive: true });

  // 1. Check camera distribution by department inside the area
  const deptCameraCounts = {};
  cameras.forEach((c) => {
    const code = (c.departmentCode || 'POLICE').toUpperCase();
    deptCameraCounts[code] = (deptCameraCounts[code] || 0) + 1;
  });

  // 2. Candidate departments matching jurisdiction or camera presence
  const candidates = [];
  allDepts.forEach((dept) => {
    const hasJurisdiction =
      !locationDistrict ||
      (dept.jurisdictionDistricts || []).some(
        (jd) => jd.toLowerCase() === locationDistrict.toLowerCase() || jd === 'Statewide'
      );
    const cameraCount = deptCameraCounts[dept.code] || 0;

    if (hasJurisdiction || cameraCount > 0) {
      candidates.push({
        code: dept.code,
        name: dept.name,
        contactEmail: dept.contactEmail,
        nodalOfficer: dept.nodalOfficer,
        departmentId: dept._id,
        cameraCount,
        hasJurisdiction,
        reason:
          cameraCount > 0
            ? `Operates ${cameraCount} surveillance camera(s) in this sector`
            : `Statutory administrative jurisdiction for ${locationDistrict || 'Gujarat'}`,
      });
    }
  });

  // Sort candidates: highest camera count first, then jurisdiction
  candidates.sort((a, b) => b.cameraCount - a.cameraCount);

  // Primary department fallback
  let primary = candidates[0];
  if (!primary) {
    const policeDept = allDepts.find((d) => d.code === 'POLICE') || {
      code: 'POLICE',
      name: 'Gujarat Police Department',
      contactEmail: 'controlroom.police@gujarat.gov.in',
      nodalOfficer: {
        name: 'Superintendent of Police',
        designation: 'Nodal Command Coordinator',
        phone: '+91 79 2325 4321',
      },
    };
    primary = {
      code: policeDept.code,
      name: policeDept.name,
      contactEmail: policeDept.contactEmail,
      nodalOfficer: policeDept.nodalOfficer,
      departmentId: policeDept._id,
      reason: 'Default state law enforcement command',
    };
  }

  return {
    responsibleDepartment: {
      code: primary.code,
      name: primary.name,
      contactEmail: primary.contactEmail,
      nodalOfficer: primary.nodalOfficer,
      departmentId: primary.departmentId,
    },
    candidateDepartments: candidates.map((c) => ({
      code: c.code,
      name: c.name,
      contactEmail: c.contactEmail,
      reason: c.reason,
    })),
  };
}

/**
 * Main Authoritative Spatial Gap Analysis Function
 */
async function performGapAnalysis({
  locationName,
  latitude,
  longitude,
  radiusMeters,
  district = 'Ahmedabad',
  city = '',
  filters = {},
}) {
  const centerLat = parseFloat(latitude);
  const centerLng = parseFloat(longitude);

  if (isNaN(centerLat) || isNaN(centerLng)) {
    throw new Error('Valid latitude and longitude are required for GIS gap analysis');
  }

  const radius = Math.max(50, Math.min(50000, parseInt(radiusMeters, 10) || 1000));

  // 1. Fetch relevant cameras and critical infrastructure
  const [cameras, infrastructure] = await Promise.all([
    queryCamerasInRadius(centerLat, centerLng, radius, filters),
    queryInfrastructureInRadius(centerLat, centerLng, radius),
  ]);

  const totalCameras = cameras.length;
  const activeCameras = cameras.filter((c) => (c.status || '').toLowerCase() === 'online').length;
  const inactiveCameras = totalCameras - activeCameras;

  // 2. Generate Adaptive Spatial Grid
  const { cells, stepMeters } = generateSpatialGrid(centerLat, centerLng, radius);
  const cellAreaSqKm = (stepMeters * stepMeters) / 1000000;
  const totalAreaSqKm = parseFloat(((Math.PI * radius * radius) / 1000000).toFixed(2));

  let coveredCount = 0;
  let moderateCount = 0;
  let lowCount = 0;
  let criticalCount = 0;

  // 3. Classify Each Cell
  const classifiedCells = cells.map((cell) => {
    const [cLat, cLng] = cell.center;

    // Cameras physically falling into this cell bounds
    const cellCameras = cameras.filter((cam) => {
      return (
        cam.lat >= cell.bounds[0][0] &&
        cam.lat <= cell.bounds[1][0] &&
        cam.lng >= cell.bounds[0][1] &&
        cam.lng <= cell.bounds[1][1]
      );
    });

    const cellActiveCount = cellCameras.filter((c) => (c.status || '').toLowerCase() === 'online').length;
    const cellInactiveCount = cellCameras.length - cellActiveCount;

    // Compute distance to the nearest camera across the entire analysis area
    let nearestCameraDist = Infinity;
    cameras.forEach((cam) => {
      const d = haversineDistanceMeters(cLat, cLng, cam.lat, cam.lng);
      if (d < nearestCameraDist) nearestCameraDist = d;
    });

    if (cameras.length === 0) nearestCameraDist = radius + 200;

    const roundedNearestDist = Math.round(nearestCameraDist);
    const density = parseFloat((cellCameras.length / Math.max(0.01, cellAreaSqKm)).toFixed(1));

    // Check if cell contains critical infrastructure
    const cellInfra = infrastructure.filter((inf) => {
      const aLat = inf.latitude || inf.location?.coordinates?.[1];
      const aLng = inf.longitude || inf.location?.coordinates?.[0];
      return (
        aLat >= cell.bounds[0][0] &&
        aLat <= cell.bounds[1][0] &&
        aLng >= cell.bounds[0][1] &&
        aLng <= cell.bounds[1][1]
      );
    });

    // Classification logic
    let classification = 'Moderate Coverage';
    if (cellActiveCount >= 2 || roundedNearestDist <= GAP_CONFIG.classification.goodNearestMaxMeters) {
      classification = 'Good Coverage';
      coveredCount++;
    } else if (cellActiveCount >= 1 || roundedNearestDist <= GAP_CONFIG.classification.moderateNearestMaxMeters) {
      classification = 'Moderate Coverage';
      moderateCount++;
    } else if (roundedNearestDist <= GAP_CONFIG.classification.lowNearestMaxMeters) {
      classification = 'Low Coverage';
      lowCount++;
    } else {
      classification = 'Critical Gap';
      criticalCount++;
    }

    // Elevate low coverage with uncovered critical infrastructure to Critical Gap
    if (cellInfra.length > 0 && roundedNearestDist > 250 && classification !== 'Good Coverage') {
      if (classification !== 'Critical Gap') {
        if (classification === 'Low Coverage') lowCount--;
        else moderateCount--;
        criticalCount++;
      }
      classification = 'Critical Gap';
    }

    return {
      cellId: cell.cellId,
      center: cell.center,
      bounds: cell.bounds,
      cameraCount: cellCameras.length,
      activeCameraCount: cellActiveCount,
      inactiveCameraCount: cellInactiveCount,
      nearestCameraDistanceMeters: roundedNearestDist,
      density,
      classification,
    };
  });

  // 4. Synthesize Actionable Gap Hotspots
  const gapCells = classifiedCells
    .filter((c) => c.classification === 'Critical Gap' || c.classification === 'Low Coverage')
    .sort((a, b) => b.nearestCameraDistanceMeters - a.nearestCameraDistanceMeters);

  // Group nearby gap cells into up to 5 priority clusters
  const gaps = [];
  const visitedCoords = [];

  for (let idx = 0; idx < gapCells.length && gaps.length < 5; idx++) {
    const cell = gapCells[idx];
    const [gLat, gLng] = cell.center;

    const tooCloseToExisting = visitedCoords.some(
      (vc) => haversineDistanceMeters(gLat, gLng, vc[0], vc[1]) < stepMeters * 1.8
    );

    if (!tooCloseToExisting) {
      visitedCoords.push([gLat, gLng]);

      const isCritical = cell.classification === 'Critical Gap';
      const severity = isCritical ? 'Critical' : 'High';

      // Recommendation text
      let recommendation = 'Install standard fixed corridor surveillance camera';
      if (cell.nearestCameraDistanceMeters > 700) {
        recommendation = 'Deploy high-resolution PTZ nodal surveillance with optical zoom buffer';
      } else if (cell.nearestCameraDistanceMeters > 450) {
        recommendation = 'Install dual-directional bullet cameras at key road intersection';
      } else if (cell.activeCameraCount === 0 && cell.cameraCount > 0) {
        recommendation = 'Restore offline/inactive cameras to eliminate visual blind spot';
      }

      gaps.push({
        gapId: `GAP-${String(gaps.length + 1).padStart(3, '0')}`,
        coordinates: [gLat, gLng],
        zoneName: `Sector Zone ${String.fromCharCode(65 + gaps.length)}`,
        severity,
        nearbyCamerasCount: cell.cameraCount,
        nearestCameraDistanceMeters: cell.nearestCameraDistanceMeters,
        recommendation,
        coverageClassification: cell.classification,
      });
    }
  }

  // 5. Clustering Analysis
  const clusteringAnalysis = analyzeSpatialClustering(centerLat, centerLng, cameras);

  // 6. Transparent Coverage Score Formula (0 - 100)
  const totalGridCells = classifiedCells.length || 1;
  const coveredRatio = (coveredCount + moderateCount * 0.6) / totalGridCells;
  const opticalScore = Math.round(coveredRatio * GAP_CONFIG.scoring.opticalGridWeight);

  // Density score
  const actualDensity = totalCameras / Math.max(0.1, totalAreaSqKm);
  const targetDensity = 6.0; // 6 cameras per sq km baseline in urban sector
  const densityRatio = Math.min(1.0, actualDensity / targetDensity);
  const densityScore = Math.round(densityRatio * GAP_CONFIG.scoring.densityWeight);

  // Infrastructure protection score
  let infraScore = GAP_CONFIG.scoring.infraProtectionWeight;
  if (infrastructure.length > 0) {
    const protectedAssets = infrastructure.filter((inf) => {
      const aLat = inf.latitude || inf.location?.coordinates?.[1];
      const aLng = inf.longitude || inf.location?.coordinates?.[0];
      return cameras.some((c) => haversineDistanceMeters(aLat, aLng, c.lat, c.lng) <= 300);
    }).length;
    infraScore = Math.round((protectedAssets / infrastructure.length) * GAP_CONFIG.scoring.infraProtectionWeight);
  }

  // Camera health score
  const healthRatio = totalCameras > 0 ? activeCameras / totalCameras : 0;
  const healthScore = Math.round(healthRatio * GAP_CONFIG.scoring.operationalHealthWeight);

  const rawCoverageScore = opticalScore + densityScore + infraScore + healthScore;
  const coverageScore = Math.max(5, Math.min(98, rawCoverageScore));

  // Score contributing factors
  const scoreFactors = [];
  if (totalCameras === 0) {
    scoreFactors.push('Zero active CCTV surveillance cameras detected within the specified geographic perimeter.');
  } else {
    scoreFactors.push(`${activeCameras} operational camera(s) providing active feeds inside analysis radius.`);
    if (inactiveCameras > 0) {
      scoreFactors.push(`${inactiveCameras} camera(s) currently offline or in maintenance status.`);
    }
  }

  if (criticalCount > 0) {
    scoreFactors.push(`${criticalCount} spatial grid sector(s) identified as Critical Coverage Gaps (>600m blind spots).`);
  } else {
    scoreFactors.push('Adequate camera density across major sectors without severe spatial isolation.');
  }

  if (infrastructure.length > 0) {
    scoreFactors.push(`${infrastructure.length} critical civic/emergency asset(s) analyzed for optical perimeter security.`);
  }

  if (clusteringAnalysis.percentages && clusteringAnalysis.percentages.northEast > 55) {
    scoreFactors.push('Substantial camera concentration in eastern sector, leaving western perimeter underserved.');
  }

  // 7. Determine Department Identification
  const { responsibleDepartment, candidateDepartments } = await identifyResponsibleDepartment(
    district,
    cameras
  );

  return {
    location: {
      name: locationName || 'Selected Location',
      address: locationName || `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`,
      district,
      city,
      coordinates: [centerLng, centerLat],
    },
    radiusMeters: radius,
    summary: {
      totalCameras,
      activeCameras,
      inactiveCameras,
      coveredZones: coveredCount,
      lowCoverageZones: lowCount,
      criticalGaps: criticalCount,
      coverageScore,
      totalAreaSqKm,
      densityCamerasPerSqKm: parseFloat(actualDensity.toFixed(2)),
    },
    scoreFactors,
    clusteringAnalysis,
    gridCells: classifiedCells,
    gaps,
    responsibleDepartment,
    candidateDepartments,
    cameras: cameras.map((c) => ({
      cameraId: c.cameraId,
      name: c.name || c.cameraName,
      type: c.type,
      status: c.status,
      lat: c.lat,
      lng: c.lng,
      distanceFromCenterMeters: c.distanceFromCenterMeters,
      departmentCode: c.departmentCode,
      departmentName: c.departmentName,
    })),
  };
}

module.exports = {
  GAP_CONFIG,
  getAdaptiveGridStepMeters,
  generateSpatialGrid,
  queryCamerasInRadius,
  performGapAnalysis,
  identifyResponsibleDepartment,
};
