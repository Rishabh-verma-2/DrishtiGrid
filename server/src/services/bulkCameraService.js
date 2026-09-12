const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const Camera = require('../models/Camera');
const ImportSession = require('../models/ImportSession');
const SystemAuditLog = require('../models/SystemAuditLog');
const logger = require('../utils/logger');
const { emitGlobal } = require('../socket/socketHandler');

// ─── CANONICAL SCHEMA & ENUM DEFINITIONS ──────────────────────────────────────

const GUJARAT_DISTRICTS = [
  'Ahmedabad', 'Amreli', 'Anand', 'Aravalli', 'Banaskantha', 'Bharuch',
  'Bhavnagar', 'Botad', 'Chhota Udaipur', 'Dang', 'Devbhumi Dwarka',
  'Gandhinagar', 'Gir Somnath', 'Jamnagar', 'Junagadh', 'Kheda', 'Kutch',
  'Mahisagar', 'Mehsana', 'Morbi', 'Narmada', 'Navsari', 'Panchmahal',
  'Patan', 'Porbandar', 'Rajkot', 'Sabarkantha', 'Surat', 'Surendranagar',
  'Tapi', 'Vadodara', 'Valsad',
];

const VALID_TYPES = ['PTZ', 'Fixed', 'Dome', 'Bullet', 'Fisheye', 'Thermal'];
const VALID_ZONES = [
  'Traffic', 'Public Space', 'Market', 'School Zone', 'Hospital',
  'Religious Site', 'Border', 'Industrial', 'Residential', 'Other',
];
const VALID_STATUSES = ['online', 'offline', 'maintenance', 'fault'];
const VALID_RESOLUTIONS = ['720p', '1080p', '2K', '4K', '8K'];
const VALID_DEPARTMENTS = [
  'POLICE', 'TRAFFIC', 'HOME_DEPT', 'SMART_CITY', 'MUNICIPAL',
  'TRANSPORT', 'HIGHWAY_PATROL', 'OTHER',
];

// Gujarat Bounding Box [south, west, north, east]
const GUJARAT_BOUNDS = {
  minLat: 20.0,
  maxLat: 24.8,
  minLng: 68.0,
  maxLng: 74.5,
};

// Column Alias Mappings (Normalized Key -> List of Accepted Header Names)
const COLUMN_ALIASES = {
  cameraId: ['cameraid', 'camera_id', 'camera id', 'id', 'cam_id', 'camid'],
  cameraName: ['cameraname', 'camera_name', 'camera name', 'name', 'title'],
  latitude: ['latitude', 'lat', 'y', 'lat_coord'],
  longitude: ['longitude', 'long', 'lon', 'lng', 'x', 'lng_coord'],
  district: ['district', 'dist', 'administrative_district'],
  city: ['city', 'town'],
  taluka: ['taluka', 'tehsil', 'subdistrict', 'block'],
  locationName: ['locationname', 'location_name', 'location name', 'area', 'locality', 'location'],
  landmark: ['landmark', 'near_landmark'],
  roadName: ['roadname', 'road_name', 'road name', 'street', 'highway', 'corridor'],
  pincode: ['pincode', 'pin_code', 'pin', 'postal_code', 'zipcode'],
  policeStation: ['policestation', 'police_station', 'police station', 'ps', 'police_post'],
  department: ['department', 'departmentname', 'department_name', 'department name', 'dept', 'agency'],
  cameraType: ['cameratype', 'camera_type', 'camera type', 'type'],
  status: ['status', 'operating_status', 'state'],
  zone: ['zone', 'classification', 'area_type', 'zone_type'],
  resolution: ['resolution', 'res', 'video_quality'],
  brand: ['brand', 'make', 'oem', 'manufacturer'],
  model: ['model', 'camera_model', 'camera model'],
  streamId: ['streamid', 'stream_id', 'stream id', 'stream_code'],
  streamType: ['streamtype', 'stream_type', 'stream type', 'protocol'],
  streamUrl: ['streamurl', 'stream_url', 'stream url', 'rtspurl', 'rtsp_url', 'rtsp'],
  ipAddress: ['ipaddress', 'ip_address', 'ip address', 'ip'],
  installationDate: ['installationdate', 'installation_date', 'installation date', 'commission_date'],
  coverageRadius: ['coverageradius', 'coverage_radius', 'coverage radius', 'radius'],
  coverageAngle: ['coverageangle', 'coverage_angle', 'coverage angle', 'fov', 'field_of_view'],
};

const REQUIRED_CANONICAL_FIELDS = ['cameraId', 'cameraName', 'latitude', 'longitude', 'district'];

// ─── HELPER UTILITIES ─────────────────────────────────────────────────────────

function sanitizeHeader(header) {
  if (!header) return '';
  return String(header).trim().toLowerCase().replace(/[^a-z0-9_ ]/g, '');
}

function resolveCanonicalField(rawHeader) {
  const clean = sanitizeHeader(rawHeader);
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (canonical.toLowerCase() === clean || aliases.includes(clean)) {
      return canonical;
    }
  }
  return null;
}

function generateImportId() {
  const d = new Date();
  const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(10000 + Math.random() * 90000);
  return `IMP-${yyyymmdd}-${random}`;
}

// ─── 1. EXCEL TEMPLATE GENERATOR ──────────────────────────────────────────────

async function generateExcelTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Garud - Government of Gujarat';
  workbook.created = new Date();

  // Sheet 1: CAMERA_REGISTRY_TEMPLATE
  const wsTemplate = workbook.addWorksheet('CAMERA_REGISTRY_TEMPLATE', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const headers = [
    { header: 'cameraId*', key: 'cameraId', width: 18 },
    { header: 'cameraName*', key: 'cameraName', width: 30 },
    { header: 'latitude*', key: 'latitude', width: 14 },
    { header: 'longitude*', key: 'longitude', width: 14 },
    { header: 'district*', key: 'district', width: 18 },
    { header: 'locationName', key: 'locationName', width: 25 },
    { header: 'landmark', key: 'landmark', width: 25 },
    { header: 'roadName', key: 'roadName', width: 25 },
    { header: 'city', key: 'city', width: 18 },
    { header: 'taluka', key: 'taluka', width: 18 },
    { header: 'pincode', key: 'pincode', width: 12 },
    { header: 'policeStation', key: 'policeStation', width: 24 },
    { header: 'department', key: 'department', width: 18 },
    { header: 'cameraType', key: 'cameraType', width: 14 },
    { header: 'status', key: 'status', width: 14 },
    { header: 'zone', key: 'zone', width: 16 },
    { header: 'resolution', key: 'resolution', width: 12 },
    { header: 'brand', key: 'brand', width: 16 },
    { header: 'model', key: 'model', width: 22 },
    { header: 'streamUrl', key: 'streamUrl', width: 32 },
    { header: 'ipAddress', key: 'ipAddress', width: 16 },
    { header: 'installationDate', key: 'installationDate', width: 18 },
    { header: 'coverageRadius', key: 'coverageRadius', width: 16 },
  ];

  wsTemplate.columns = headers;

  // Header Row Style
  const headerRow = wsTemplate.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }, // Deep Government Navy Blue
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
    };
  });

  // Add 5 realistic sample demonstration rows
  const sampleData = [
    {
      cameraId: 'GJ-AMD-0091',
      cameraName: 'SG Highway Iscon Cross Road Junction',
      latitude: 23.0298,
      longitude: 72.5074,
      district: 'Ahmedabad',
      locationName: 'Iscon Cross Road',
      landmark: 'Near Iscon Mall',
      roadName: 'Sarkhej - Gandhinagar Highway',
      city: 'Ahmedabad',
      taluka: 'Ghatlodia',
      pincode: '380015',
      policeStation: 'Satellite Police Station',
      department: 'TRAFFIC',
      cameraType: 'PTZ',
      status: 'ONLINE',
      zone: 'Traffic',
      resolution: '1080p',
      brand: 'Hikvision',
      model: 'DS-2DE7A432IW-AE',
      streamUrl: 'rtsp://10.24.110.42:554/live/ch1',
      ipAddress: '10.24.110.42',
      installationDate: '2025-01-15',
      coverageRadius: 150,
    },
    {
      cameraId: 'GJ-SUR-0045',
      cameraName: 'Surat Ring Road Textile Market Flyover',
      latitude: 21.1925,
      longitude: 72.8482,
      district: 'Surat',
      locationName: 'Textile Market',
      landmark: 'Sahara Darwaja Junction',
      roadName: 'Ring Road',
      city: 'Surat',
      taluka: 'Chorasi',
      pincode: '395002',
      policeStation: 'Salabatpura Police Station',
      department: 'POLICE',
      cameraType: 'Fixed',
      status: 'ONLINE',
      zone: 'Market',
      resolution: '4K',
      brand: 'Dahua',
      model: 'IPC-HFW5842E-Z4E',
      streamUrl: 'rtsp://10.28.21.14:554/live/ch1',
      ipAddress: '10.28.21.14',
      installationDate: '2024-11-20',
      coverageRadius: 60,
    },
    {
      cameraId: 'GJ-GNR-0018',
      cameraName: 'Gandhinagar Sector 11 Swarnim Park Point',
      latitude: 23.2234,
      longitude: 72.6508,
      district: 'Gandhinagar',
      locationName: 'Swarnim Park',
      landmark: 'Opposite Vidhan Sabha',
      roadName: 'CH-Road',
      city: 'Gandhinagar',
      taluka: 'Gandhinagar',
      pincode: '382010',
      policeStation: 'Sector 7 Police Station',
      department: 'POLICE',
      cameraType: 'Dome',
      status: 'ONLINE',
      zone: 'Public Space',
      resolution: '1080p',
      brand: 'Bosch',
      model: 'FLEXIDOME 5100i',
      streamUrl: 'rtsp://10.31.50.88:554/live/ch1',
      ipAddress: '10.31.50.88',
      installationDate: '2025-02-01',
      coverageRadius: 50,
    },
    {
      cameraId: 'GJ-BDQ-0033',
      cameraName: 'Vadodara Sayajiganj Railway Station Entry',
      latitude: 22.3105,
      longitude: 73.1812,
      district: 'Vadodara',
      locationName: 'Railway Station Circle',
      landmark: 'Sayajiganj Tower',
      roadName: 'Station Road',
      city: 'Vadodara',
      taluka: 'Vadodara',
      pincode: '390005',
      policeStation: 'Sayajiganj Police Station',
      department: 'POLICE',
      cameraType: 'Bullet',
      status: 'OFFLINE',
      zone: 'Public Space',
      resolution: '1080p',
      brand: 'Hikvision',
      model: 'DS-2CD2047G2-LU',
      streamUrl: '',
      ipAddress: '10.35.12.7',
      installationDate: '2024-08-10',
      coverageRadius: 50,
    },
    {
      cameraId: 'GJ-RAJ-0027',
      cameraName: 'Rajkot Kalawad Road KKV Hall Circle',
      latitude: 22.2854,
      longitude: 70.7681,
      district: 'Rajkot',
      locationName: 'KKV Circle',
      landmark: 'Near KKV Hall Overbridge',
      roadName: 'Kalawad Road',
      city: 'Rajkot',
      taluka: 'Rajkot',
      pincode: '360005',
      policeStation: 'Malviyanagar Police Station',
      department: 'TRAFFIC',
      cameraType: 'PTZ',
      status: 'MAINTENANCE',
      zone: 'Traffic',
      resolution: '2K',
      brand: 'Axis',
      model: 'Q6075-E PTZ',
      streamUrl: 'rtsp://10.42.8.22:554/live/ch1',
      ipAddress: '10.42.8.22',
      installationDate: '2024-05-19',
      coverageRadius: 120,
    },
  ];

  sampleData.forEach((row) => {
    const addedRow = wsTemplate.addRow(row);
    addedRow.height = 20;
    addedRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Sheet 2: README_INSTRUCTIONS
  const wsReadme = workbook.addWorksheet('README_INSTRUCTIONS');
  wsReadme.columns = [
    { header: 'Field Name', key: 'field', width: 20 },
    { header: 'Required?', key: 'required', width: 14 },
    { header: 'Data Type', key: 'type', width: 14 },
    { header: 'Valid Values / Enums', key: 'validValues', width: 35 },
    { header: 'Example', key: 'example', width: 30 },
    { header: 'Field Description & Verification Rules', key: 'description', width: 50 },
  ];

  const readmeHeader = wsReadme.getRow(1);
  readmeHeader.height = 26;
  readmeHeader.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } }; // Forest Green
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const instructions = [
    {
      field: 'cameraId',
      required: 'YES (Mandatory)',
      type: 'Text',
      validValues: 'Unique alphanumeric (e.g., GJ-AMD-0001)',
      example: 'GJ-AMD-0042',
      description: 'Primary identifier. Must be unique across both the file and MongoDB camera registry.',
    },
    {
      field: 'cameraName',
      required: 'YES (Mandatory)',
      type: 'Text',
      validValues: 'Any descriptive title (Min 3 chars)',
      example: 'SG Highway Junction PTZ-1',
      description: 'Descriptive human-readable camera designation for operational dispatch.',
    },
    {
      field: 'latitude',
      required: 'YES (Mandatory)',
      type: 'Decimal',
      validValues: '-90.0 to 90.0 (Gujarat: ~20.0 to 24.8)',
      example: '23.0338',
      description: 'WGS84 decimal latitude. Points outside Gujarat will be flagged with a geographic warning.',
    },
    {
      field: 'longitude',
      required: 'YES (Mandatory)',
      type: 'Decimal',
      validValues: '-180.0 to 180.0 (Gujarat: ~68.0 to 74.5)',
      example: '72.5074',
      description: 'WGS84 decimal longitude. Must match physical ground installation.',
    },
    {
      field: 'district',
      required: 'YES (Mandatory)',
      type: 'Text / Enum',
      validValues: 'One of the 33 Gujarat Districts',
      example: 'Ahmedabad',
      description: 'Jurisdiction district. Refer to REFERENCE_ENUMS sheet for exact district spellings.',
    },
    {
      field: 'department',
      required: 'Optional (Default: POLICE)',
      type: 'Enum',
      validValues: VALID_DEPARTMENTS.join(', '),
      example: 'TRAFFIC',
      description: 'Department controlling or maintaining the camera.',
    },
    {
      field: 'cameraType',
      required: 'Optional (Default: Fixed)',
      type: 'Enum',
      validValues: VALID_TYPES.join(', '),
      example: 'PTZ',
      description: 'Hardware configuration. PTZ cameras provide automatic 150m coverage radius.',
    },
    {
      field: 'status',
      required: 'Optional (Default: ONLINE)',
      type: 'Enum',
      validValues: 'ONLINE, OFFLINE, MAINTENANCE, FAULT',
      example: 'ONLINE',
      description: 'Initial operational status upon registration into Garud.',
    },
    {
      field: 'zone',
      required: 'Optional (Default: Traffic)',
      type: 'Enum',
      validValues: VALID_ZONES.join(', '),
      example: 'Traffic',
      description: 'Environmental classification used in multi-factor coverage gap scoring.',
    },
    {
      field: 'resolution',
      required: 'Optional (Default: 1080p)',
      type: 'Enum',
      validValues: VALID_RESOLUTIONS.join(', '),
      example: '1080p',
      description: 'Video sensor capture resolution.',
    },
    {
      field: 'coverageRadius',
      required: 'Optional (Default: 50)',
      type: 'Number',
      validValues: '10 to 500 (meters)',
      example: '150',
      description: 'Visual range in meters used for GIS buffer polygons and evidence search.',
    },
  ];

  instructions.forEach((ins) => {
    const row = wsReadme.addRow(ins);
    row.height = 22;
    row.eachCell((c) => {
      c.font = { name: 'Arial', size: 9 };
      c.alignment = { vertical: 'middle', wrapText: true };
    });
  });

  // Sheet 3: REFERENCE_ENUMS
  const wsEnums = workbook.addWorksheet('REFERENCE_ENUMS');
  wsEnums.columns = [
    { header: 'Gujarat Districts (33)', key: 'districts', width: 26 },
    { header: 'Departments', key: 'depts', width: 22 },
    { header: 'Camera Types', key: 'types', width: 18 },
    { header: 'Operational Statuses', key: 'statuses', width: 22 },
    { header: 'Zones', key: 'zones', width: 20 },
  ];

  const enumsHeader = wsEnums.getRow(1);
  enumsHeader.height = 26;
  enumsHeader.eachCell((c) => {
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Indigo
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const maxRows = Math.max(
    GUJARAT_DISTRICTS.length,
    VALID_DEPARTMENTS.length,
    VALID_TYPES.length,
    VALID_STATUSES.length,
    VALID_ZONES.length
  );

  for (let i = 0; i < maxRows; i++) {
    wsEnums.addRow({
      districts: GUJARAT_DISTRICTS[i] || '',
      depts: VALID_DEPARTMENTS[i] || '',
      types: VALID_TYPES[i] || '',
      statuses: VALID_STATUSES[i]?.toUpperCase() || '',
      zones: VALID_ZONES[i] || '',
    });
  }

  return await workbook.xlsx.writeBuffer();
}

// ─── 2. EXCEL PARSER & ROW-LEVEL VALIDATION ENGINE ────────────────────────────

async function parseAndValidateExcel(buffer, originalFilename, user) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw new Error(`Failed to read Excel workbook: ${err.message}. Please upload a valid .xlsx or .xls file.`);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    throw new Error('The uploaded Excel file is empty or does not contain any data rows below the header.');
  }

  // 1. Header Row Extraction & Canonical Mapping
  const headerRow = worksheet.getRow(1);
  const headerMap = new Map(); // colIndex -> canonicalField
  const rawHeaders = [];
  const unrecognizedHeaders = [];

  headerRow.eachCell((cell, colNumber) => {
    const rawVal = cell.value ? String(cell.value).trim() : '';
    if (!rawVal) return;
    rawHeaders.push(rawVal);
    const canonical = resolveCanonicalField(rawVal);
    if (canonical) {
      headerMap.set(colNumber, canonical);
    } else {
      unrecognizedHeaders.push(rawVal);
    }
  });

  const mappedCanonicalFields = Array.from(headerMap.values());
  const missingRequired = REQUIRED_CANONICAL_FIELDS.filter((f) => !mappedCanonicalFields.includes(f));

  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required columns: [${missingRequired.join(', ')}]. Please use the official template.`
    );
  }

  // 2. Parse Every Row Independently
  const parsedRows = [];
  const inMemoryIds = new Map(); // cameraId -> firstRowNumber

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    // Check if entire row is empty
    let hasAnyValue = false;
    row.eachCell(() => { hasAnyValue = true; });
    if (!hasAnyValue) continue;

    const rowData = {};
    headerMap.forEach((canonicalField, colNumber) => {
      let val = row.getCell(colNumber).value;
      // Handle Excel rich text or formulas
      if (val && typeof val === 'object') {
        if (val.result !== undefined) val = val.result;
        else if (val.text !== undefined) val = val.text;
        else if (val instanceof Date) val = val.toISOString().slice(0, 10);
      }
      if (typeof val === 'string') val = val.trim();
      rowData[canonicalField] = val;
    });

    const rowAnalysis = {
      rowNumber: r,
      status: 'VALID',
      data: rowData,
      normalized: {},
      errors: [],
      warnings: [],
      isDuplicate: false,
      duplicateReason: '',
    };

    // ── Field Validation & Normalization ──────────────────────

    // A. Camera ID
    const rawId = rowData.cameraId;
    if (!rawId || String(rawId).trim() === '') {
      rowAnalysis.errors.push({
        field: 'cameraId',
        value: rawId ?? 'EMPTY',
        problem: 'Camera ID is required and cannot be empty.',
        expected: 'Alphanumeric ID (e.g., GJ-AMD-0042)',
        suggestion: 'Provide a unique identifier.',
      });
    } else {
      const cleanId = String(rawId).trim().toUpperCase();
      rowAnalysis.normalized.cameraId = cleanId;

      // Duplicate check within uploaded file
      if (inMemoryIds.has(cleanId)) {
        rowAnalysis.isDuplicate = true;
        rowAnalysis.duplicateReason = `Duplicate cameraId "${cleanId}" within uploaded file (first seen on Row ${inMemoryIds.get(cleanId)}).`;
        rowAnalysis.errors.push({
          field: 'cameraId',
          value: cleanId,
          problem: rowAnalysis.duplicateReason,
          expected: 'Unique Camera ID per row',
          suggestion: 'Ensure each camera has an individual unique ID.',
        });
      } else {
        inMemoryIds.set(cleanId, r);
      }
    }

    // B. Camera Name
    const rawName = rowData.cameraName;
    if (!rawName || String(rawName).trim() === '') {
      rowAnalysis.errors.push({
        field: 'cameraName',
        value: rawName ?? 'EMPTY',
        problem: 'Camera Name is required.',
        expected: 'Descriptive string (e.g., Sola Junction Cam 1)',
        suggestion: 'Specify the physical location or name of the camera.',
      });
    } else {
      rowAnalysis.normalized.cameraName = String(rawName).trim();
      rowAnalysis.normalized.name = String(rawName).trim();
    }

    // C. Coordinates (Latitude & Longitude)
    const rawLat = rowData.latitude;
    const rawLng = rowData.longitude;
    const parsedLat = parseFloat(rawLat);
    const parsedLng = parseFloat(rawLng);

    if (rawLat === undefined || rawLat === null || String(rawLat).trim() === '' || isNaN(parsedLat)) {
      rowAnalysis.errors.push({
        field: 'latitude',
        value: rawLat ?? 'EMPTY',
        problem: 'Latitude is missing or not a valid number.',
        expected: 'Decimal coordinate between -90 and 90',
        suggestion: 'Provide valid WGS84 latitude.',
      });
    } else if (parsedLat < -90 || parsedLat > 90) {
      rowAnalysis.errors.push({
        field: 'latitude',
        value: parsedLat,
        problem: `Latitude ${parsedLat} is out of global range [-90, 90].`,
        expected: 'Decimal between -90 and 90',
        suggestion: 'Verify the latitude coordinate.',
      });
    } else {
      rowAnalysis.normalized.latitude = parsedLat;
    }

    if (rawLng === undefined || rawLng === null || String(rawLng).trim() === '' || isNaN(parsedLng)) {
      rowAnalysis.errors.push({
        field: 'longitude',
        value: rawLng ?? 'EMPTY',
        problem: 'Longitude is missing or not a valid number.',
        expected: 'Decimal coordinate between -180 and 180',
        suggestion: 'Provide valid WGS84 longitude.',
      });
    } else if (parsedLng < -180 || parsedLng > 180) {
      rowAnalysis.errors.push({
        field: 'longitude',
        value: parsedLng,
        problem: `Longitude ${parsedLng} is out of global range [-180, 180].`,
        expected: 'Decimal between -180 and 180',
        suggestion: 'Verify the longitude coordinate.',
      });
    } else {
      rowAnalysis.normalized.longitude = parsedLng;
    }

    // Geographic warning for Gujarat region
    if (
      !isNaN(parsedLat) && !isNaN(parsedLng) &&
      (parsedLat < GUJARAT_BOUNDS.minLat || parsedLat > GUJARAT_BOUNDS.maxLat ||
       parsedLng < GUJARAT_BOUNDS.minLng || parsedLng > GUJARAT_BOUNDS.maxLng)
    ) {
      rowAnalysis.warnings.push({
        field: 'coordinates',
        value: `${parsedLat}, ${parsedLng}`,
        problem: 'Coordinates are valid globally, but fall outside the configured Gujarat State boundary.',
      });
    }

    // D. District
    const rawDistrict = rowData.district;
    if (!rawDistrict || String(rawDistrict).trim() === '') {
      rowAnalysis.errors.push({
        field: 'district',
        value: rawDistrict ?? 'EMPTY',
        problem: 'District is required for jurisdictional mapping.',
        expected: 'Gujarat District name (e.g., Ahmedabad, Surat)',
        suggestion: 'Select or input a recognized Gujarat district.',
      });
    } else {
      const matchDistrict = GUJARAT_DISTRICTS.find(
        (d) => d.toLowerCase() === String(rawDistrict).trim().toLowerCase()
      );
      if (matchDistrict) {
        rowAnalysis.normalized.district = matchDistrict;
      } else {
        rowAnalysis.normalized.district = String(rawDistrict).trim();
        rowAnalysis.warnings.push({
          field: 'district',
          value: rawDistrict,
          problem: `District "${rawDistrict}" is not in the standard list of 33 Gujarat districts.`,
        });
      }
    }

    // E. Department
    const rawDept = rowData.department;
    if (rawDept) {
      const cleanDept = String(rawDept).trim().toUpperCase();
      const matchDept = VALID_DEPARTMENTS.find((d) => d === cleanDept);
      if (matchDept) {
        rowAnalysis.normalized.departmentCode = matchDept;
        rowAnalysis.normalized.departmentName =
          matchDept === 'TRAFFIC' ? 'Gujarat Traffic Police' :
          matchDept === 'POLICE' ? 'Gujarat Police Department' :
          matchDept === 'HOME_DEPT' ? 'Gujarat Home Department' :
          matchDept === 'MUNICIPAL' ? `${rowAnalysis.normalized.district || 'City'} Municipal Corporation` :
          matchDept === 'SMART_CITY' ? 'Smart City Mission Command' :
          'Gujarat Police Department';
      } else {
        rowAnalysis.normalized.departmentCode = 'POLICE';
        rowAnalysis.normalized.departmentName = String(rawDept).trim();
        rowAnalysis.warnings.push({
          field: 'department',
          value: rawDept,
          problem: `Unrecognized department code "${rawDept}". Mapped to POLICE jurisdiction.`,
        });
      }
    } else {
      rowAnalysis.normalized.departmentCode = 'POLICE';
      rowAnalysis.normalized.departmentName = 'Gujarat Police Department';
    }

    // F. Camera Type
    const rawType = rowData.cameraType;
    if (rawType) {
      const matchType = VALID_TYPES.find((t) => t.toLowerCase() === String(rawType).trim().toLowerCase());
      if (matchType) {
        rowAnalysis.normalized.type = matchType;
      } else {
        rowAnalysis.normalized.type = 'Fixed';
        rowAnalysis.warnings.push({
          field: 'cameraType',
          value: rawType,
          problem: `Invalid camera type "${rawType}". Defaulted to "Fixed".`,
        });
      }
    } else {
      rowAnalysis.normalized.type = 'Fixed';
    }

    // G. Status
    const rawStatus = rowData.status;
    if (rawStatus) {
      const matchStatus = VALID_STATUSES.find((s) => s.toLowerCase() === String(rawStatus).trim().toLowerCase());
      if (matchStatus) {
        rowAnalysis.normalized.status = matchStatus;
      } else {
        rowAnalysis.normalized.status = 'offline';
        rowAnalysis.warnings.push({
          field: 'status',
          value: rawStatus,
          problem: `Invalid status "${rawStatus}". Defaulted to "offline".`,
        });
      }
    } else {
      rowAnalysis.normalized.status = 'online';
    }

    // H. Zone
    const rawZone = rowData.zone;
    if (rawZone) {
      const matchZone = VALID_ZONES.find((z) => z.toLowerCase() === String(rawZone).trim().toLowerCase());
      rowAnalysis.normalized.zone = matchZone || 'Traffic';
      if (!matchZone) {
        rowAnalysis.warnings.push({
          field: 'zone',
          value: rawZone,
          problem: `Unrecognized zone "${rawZone}". Defaulted to "Traffic".`,
        });
      }
    } else {
      rowAnalysis.normalized.zone = 'Traffic';
    }

    // I. Resolution
    const rawRes = rowData.resolution;
    if (rawRes) {
      const matchRes = VALID_RESOLUTIONS.find((r) => r.toLowerCase() === String(rawRes).trim().toLowerCase());
      rowAnalysis.normalized.resolution = matchRes || '1080p';
    } else {
      rowAnalysis.normalized.resolution = '1080p';
    }

    // J. Coverage Radius
    const rawRadius = parseFloat(rowData.coverageRadius);
    rowAnalysis.normalized.coverageRadius = !isNaN(rawRadius) && rawRadius >= 10 && rawRadius <= 1000
      ? rawRadius
      : (rowAnalysis.normalized.type === 'PTZ' ? 150 : 50);

    // K. Coverage Angle
    const rawAngle = parseFloat(rowData.coverageAngle);
    rowAnalysis.normalized.coverageAngle = !isNaN(rawAngle) && rawAngle > 0 && rawAngle <= 360 ? rawAngle : 90;

    // L. Auxiliary Metadata
    rowAnalysis.normalized.city = rowData.city || rowAnalysis.normalized.district || '';
    rowAnalysis.normalized.taluka = rowData.taluka || '';
    rowAnalysis.normalized.locationName = rowData.locationName || rowData.area || '';
    rowAnalysis.normalized.landmark = rowData.landmark || '';
    rowAnalysis.normalized.roadName = rowData.roadName || '';
    rowAnalysis.normalized.pincode = rowData.pincode || '';
    rowAnalysis.normalized.policeStation = rowData.policeStation || '';
    rowAnalysis.normalized.brand = rowData.brand || 'Hikvision';
    rowAnalysis.normalized.model = rowData.model || 'HD Surveillance';
    rowAnalysis.normalized.camera_model = rowAnalysis.normalized.model;
    rowAnalysis.normalized.streamId = rowData.streamId || `cam${Math.floor(Math.random() * 30 + 1).toString().padStart(2, '0')}`;
    rowAnalysis.normalized.streamType = rowData.streamType || 'HLS';
    rowAnalysis.normalized.streamUrl = rowData.streamUrl || '';
    rowAnalysis.normalized.ipAddress = rowData.ipAddress || '';
    rowAnalysis.normalized.installationDate = rowData.installationDate ? new Date(rowData.installationDate) : new Date();

    // Determine row final status
    if (rowAnalysis.errors.length > 0) {
      rowAnalysis.status = rowAnalysis.isDuplicate ? 'DUPLICATE' : 'ERROR';
    } else if (rowAnalysis.warnings.length > 0) {
      rowAnalysis.status = 'WARNING';
    } else {
      rowAnalysis.status = 'VALID';
    }

    parsedRows.push(rowAnalysis);
  }

  // 3. Duplicate Checking Against MongoDB
  const candidateIds = parsedRows
    .map((r) => r.normalized.cameraId)
    .filter(Boolean);

  const existingInDb = await Camera.find({
    cameraId: { $in: candidateIds },
    isActive: true,
  }).select('cameraId name district locationName').lean();

  const dbIdMap = new Map(existingInDb.map((c) => [c.cameraId, c]));

  parsedRows.forEach((r) => {
    const id = r.normalized.cameraId;
    if (id && dbIdMap.has(id)) {
      const existing = dbIdMap.get(id);
      r.isDuplicate = true;
      r.status = 'DUPLICATE';
      r.duplicateReason = `Camera ID already registered in database (${existing.district} / "${existing.name}").`;
      r.errors.push({
        field: 'cameraId',
        value: id,
        problem: r.duplicateReason,
        expected: 'Unregistered Camera ID',
        suggestion: 'Exclude or modify ID to onboard as a new asset.',
      });
    }
  });

  // 4. Calculate Summary Metrics
  const summary = {
    total: parsedRows.length,
    valid: parsedRows.filter((r) => r.status === 'VALID').length,
    errors: parsedRows.filter((r) => r.status === 'ERROR').length,
    warnings: parsedRows.filter((r) => r.status === 'WARNING').length,
    duplicates: parsedRows.filter((r) => r.status === 'DUPLICATE').length,
    imported: 0,
    skipped: 0,
  };

  // 5. Persist ImportSession (Staged in DB, NOT in Camera collection yet)
  const importId = generateImportId();
  const session = await ImportSession.create({
    importId,
    uploadedBy: user._id,
    uploaderName: user.name,
    uploaderRole: user.role,
    filename: originalFilename,
    fileSizeBytes: buffer.length,
    status: 'VALIDATED',
    summary,
    rows: parsedRows,
    headersFound: rawHeaders,
    headersMissing: missingRequired,
    headersUnknown: unrecognizedHeaders,
  });

  logger.info(
    `Bulk import validated [${importId}]: ${summary.total} rows (${summary.valid} valid, ${summary.errors} errors, ${summary.warnings} warnings, ${summary.duplicates} dupes)`
  );

  return session;
}

// ─── 3. COMMIT BULK IMPORT TO DATABASE ────────────────────────────────────────

async function commitBulkImport(importId, user, req) {
  const session = await ImportSession.findOne({ importId });
  if (!session) {
    throw new Error(`Import session "${importId}" not found or expired.`);
  }

  if (session.status === 'COMPLETED') {
    throw new Error(`Import session "${importId}" has already been processed and saved.`);
  }

  if (session.status === 'CANCELLED') {
    throw new Error(`Import session "${importId}" was cancelled by an administrator.`);
  }

  // Filter rows eligible for persistence (VALID or WARNING, never ERROR or DUPLICATE)
  const eligibleRows = session.rows.filter(
    (r) => (r.status === 'VALID' || r.status === 'WARNING') && !r.isDuplicate
  );

  if (eligibleRows.length === 0) {
    throw new Error('No valid records found to import in this session.');
  }

  session.status = 'IMPORTING';
  await session.save();

  const camerasToInsert = eligibleRows.map((r) => {
    const norm = r.normalized;
    const lat = norm.latitude;
    const lng = norm.longitude;

    return {
      cameraId: norm.cameraId,
      name: norm.cameraName || norm.name,
      cameraName: norm.cameraName || norm.name,
      description: `Surveillance Camera registered via Bulk Excel Import (${session.filename})`,
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      latitude: lat,
      longitude: lng,
      address: {
        full: `${norm.locationName || 'Main Corridor'}, ${norm.district}, Gujarat`,
        street: norm.roadName || '',
        area: norm.locationName || '',
        city: norm.city || norm.district,
        district: norm.district,
        taluka: norm.taluka || '',
        state: 'Gujarat',
        pincode: norm.pincode || '',
      },
      city: norm.city || norm.district,
      district: norm.district,
      taluka: norm.taluka || '',
      pincode: norm.pincode || '',
      landmark: norm.landmark || '',
      roadName: norm.roadName || '',
      locationName: norm.locationName || '',
      policeStation: norm.policeStation || '',
      departmentName: norm.departmentName || 'Gujarat Police Department',
      departmentCode: norm.departmentCode || 'POLICE',
      type: norm.type || 'Fixed',
      brand: norm.brand || 'Hikvision',
      model: norm.model || 'HD Surveillance',
      camera_model: norm.model || 'HD Surveillance',
      resolution: norm.resolution || '1080p',
      status: (norm.status || 'online').toLowerCase(),
      zone: norm.zone || 'Traffic',
      coverageRadius: norm.coverageRadius || 50,
      coverageAngle: norm.coverageAngle || 90,
      streamId: norm.streamId,
      streamType: norm.streamType || 'HLS',
      streamStatus: 'ACTIVE',
      dataSource: 'BULK_EXCEL_IMPORT',
      verified: true,
      fps: 25,
      recording_history_days: 30,
      alertsEnabled: {
        motionDetection: true,
        crowdDetection: ['Market', 'Public Space'].includes(norm.zone),
        nightVision: ['PTZ', 'Bullet'].includes(norm.type),
        anprEnabled: ['Traffic', 'Highway'].includes(norm.zone),
        faceRecognition: false,
      },
      isActive: true,
      installationDate: norm.installationDate || new Date(),
    };
  });

  // Execute bulk operations
  const bulkOperations = camerasToInsert.map((camDoc) => ({
    updateOne: {
      filter: { cameraId: camDoc.cameraId },
      update: { $setOnInsert: camDoc },
      upsert: true,
    },
  }));

  const bulkResult = await Camera.bulkWrite(bulkOperations, { ordered: false });
  const actuallyInserted = bulkResult.upsertedCount || 0;
  const skippedCount = session.rows.length - actuallyInserted;

  // Update session state
  session.status = 'COMPLETED';
  session.committedAt = new Date();
  session.summary.imported = actuallyInserted;
  session.summary.skipped = skippedCount;

  // Mark rows as IMPORTED or SKIPPED
  session.rows.forEach((r) => {
    if ((r.status === 'VALID' || r.status === 'WARNING') && !r.isDuplicate) {
      r.status = 'IMPORTED';
    } else {
      r.status = 'SKIPPED';
    }
  });

  await session.save();

  // Audit Logging
  await SystemAuditLog.record({
    req,
    user,
    action: 'BULK_CAMERA_IMPORT',
    resource: 'Camera',
    resourceId: session.importId,
    description: `Administrator ${user.name} successfully imported ${actuallyInserted} cameras into registry from file "${session.filename}" (${skippedCount} skipped).`,
  });

  // Socket notification for instant GIS/Registry update
  emitGlobal('camera:bulk_imported', {
    importId: session.importId,
    importedCount: actuallyInserted,
    filename: session.filename,
  });

  logger.info(`Bulk import [${importId}] completed: ${actuallyInserted} new cameras persisted.`);

  return {
    success: true,
    importId: session.importId,
    importedCount: actuallyInserted,
    skippedCount,
    totalRows: session.rows.length,
    summary: session.summary,
  };
}

// ─── 4. GENERATE IMPORT AUDIT REPORT ──────────────────────────────────────────

async function generateImportReport(importId) {
  const session = await ImportSession.findOne({ importId });
  if (!session) {
    throw new Error(`Import session "${importId}" not found.`);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Garud Audit System';
  workbook.created = new Date();

  // Sheet 1: AUDIT_SUMMARY
  const wsSummary = workbook.addWorksheet('IMPORT_AUDIT_SUMMARY');
  wsSummary.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 45 },
  ];

  const headerRow = wsSummary.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  });

  const summaryData = [
    { metric: 'Import Reference ID', value: session.importId },
    { metric: 'Source File Name', value: session.filename },
    { metric: 'File Size', value: `${(session.fileSizeBytes / 1024).toFixed(1)} KB` },
    { metric: 'Uploaded By (Administrator)', value: `${session.uploaderName} (${session.uploaderRole})` },
    { metric: 'Upload Timestamp', value: session.createdAt?.toISOString() },
    { metric: 'Commit Timestamp', value: session.committedAt?.toISOString() || 'Not committed' },
    { metric: 'Final Session Status', value: session.status },
    { metric: 'Total Rows Processed', value: session.summary.total },
    { metric: 'Successfully Imported', value: session.summary.imported },
    { metric: 'Skipped / Excluded Rows', value: session.summary.skipped },
    { metric: 'Validation Errors Detected', value: session.summary.errors },
    { metric: 'Geographic / Enum Warnings', value: session.summary.warnings },
    { metric: 'Duplicate Collisions Detected', value: session.summary.duplicates },
  ];

  summaryData.forEach((d) => wsSummary.addRow(d));

  // Sheet 2: ROW_LEVEL_DETAILS
  const wsRows = workbook.addWorksheet('ROW_LEVEL_DETAILS');
  wsRows.columns = [
    { header: 'Row #', key: 'rowNumber', width: 10 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Camera ID', key: 'cameraId', width: 18 },
    { header: 'Camera Name', key: 'cameraName', width: 28 },
    { header: 'District', key: 'district', width: 18 },
    { header: 'Latitude', key: 'latitude', width: 14 },
    { header: 'Longitude', key: 'longitude', width: 14 },
    { header: 'Validation Errors', key: 'errors', width: 40 },
    { header: 'Warnings', key: 'warnings', width: 40 },
    { header: 'Duplicate Reason', key: 'duplicateReason', width: 35 },
  ];

  const rowHeader = wsRows.getRow(1);
  rowHeader.height = 24;
  rowHeader.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  });

  session.rows.forEach((r) => {
    const errorText = r.errors.map((e) => `[${e.field}]: ${e.problem}`).join('; ');
    const warningText = r.warnings.map((w) => `[${w.field}]: ${w.problem}`).join('; ');

    const added = wsRows.addRow({
      rowNumber: r.rowNumber,
      status: r.status,
      cameraId: r.normalized?.cameraId || r.data?.cameraId || 'N/A',
      cameraName: r.normalized?.cameraName || r.data?.cameraName || 'N/A',
      district: r.normalized?.district || r.data?.district || 'N/A',
      latitude: r.normalized?.latitude ?? r.data?.latitude ?? '',
      longitude: r.normalized?.longitude ?? r.data?.longitude ?? '',
      errors: errorText,
      warnings: warningText,
      duplicateReason: r.duplicateReason || '',
    });

    if (r.status === 'ERROR' || r.status === 'DUPLICATE') {
      added.getCell(2).font = { color: { argb: 'FFDC2626' }, bold: true };
    } else if (r.status === 'WARNING') {
      added.getCell(2).font = { color: { argb: 'FFD97706' }, bold: true };
    } else if (r.status === 'IMPORTED' || r.status === 'VALID') {
      added.getCell(2).font = { color: { argb: 'FF059669' }, bold: true };
    }
  });

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateExcelTemplate,
  parseAndValidateExcel,
  commitBulkImport,
  generateImportReport,
  GUJARAT_DISTRICTS,
  VALID_TYPES,
  VALID_ZONES,
  VALID_STATUSES,
  VALID_DEPARTMENTS,
  VALID_RESOLUTIONS,
};
