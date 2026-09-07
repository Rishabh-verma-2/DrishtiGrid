const Department = require('../models/Department');
const Camera = require('../models/Camera');
const logger = require('./logger');

const CANONICAL_DEPARTMENTS = [
  {
    code: 'POLICE',
    name: 'Gujarat Police Department',
    shortName: 'Gujarat Police',
    category: 'Law Enforcement',
    contactEmail: 'controlroom.police@gujarat.gov.in',
    nodalOfficer: {
      name: 'Shri R. K. Patel, IPS',
      designation: 'Superintendent of Police (Command & Control)',
      phone: '+91 79 2325 4321',
    },
    jurisdictionDistricts: ['Ahmedabad', 'Gandhinagar', 'Surat', 'Vadodara', 'Rajkot'],
  },
  {
    code: 'TRAFFIC',
    name: 'Gujarat Traffic Police',
    shortName: 'Gujarat Traffic Police',
    category: 'Traffic Management',
    contactEmail: 'traffic.dispatch@gujarat.gov.in',
    nodalOfficer: {
      name: 'Ms. Meera Joshi, GPS',
      designation: 'Deputy Commissioner of Police (Traffic)',
      phone: '+91 79 2325 7890',
    },
    jurisdictionDistricts: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'],
  },
  {
    code: 'HOME_DEPT',
    name: 'Gujarat Home Department',
    shortName: 'Gujarat Home Department',
    category: 'Emergency Services',
    contactEmail: 'homedept.dispatch@gujarat.gov.in',
    nodalOfficer: {
      name: 'Shri Harsh Sanghavi Office',
      designation: 'Home Department Command Secretary',
      phone: '+91 79 2325 0101',
    },
    jurisdictionDistricts: ['Ahmedabad', 'Gandhinagar', 'Surat', 'Vadodara', 'Rajkot', 'Statewide'],
  },
  {
    code: 'SMART_CITY',
    name: 'Smart City Mission',
    shortName: 'Smart City Mission',
    category: 'Urban Surveillance',
    contactEmail: 'smartcity.director@gujarat.gov.in',
    nodalOfficer: {
      name: 'Dr. Vivek Sharma, IAS',
      designation: 'Chief Executive Officer (Smart City Mission)',
      phone: '+91 79 2325 1122',
    },
    jurisdictionDistricts: ['Ahmedabad', 'Surat', 'Vadodara', 'Gandhinagar', 'Rajkot'],
  },
  {
    code: 'MUNICIPAL',
    name: 'Municipal Corporation',
    shortName: 'Municipal Corporation',
    category: 'Municipal Corporation',
    contactEmail: 'municipal.cctv@gujarat.gov.in',
    nodalOfficer: {
      name: 'Municipal Commissioners Directorate',
      designation: 'Joint Municipal Coordinator (AMC / SMC / VMC / RMC)',
      phone: '+91 79 2325 5500',
    },
    jurisdictionDistricts: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
  },
];

/**
 * Resolves camera's metadata into one of the 5 canonical department codes
 */
function getCanonicalDepartmentCode(cam) {
  const name = (cam.departmentName || cam.department || cam.departmentCode || '').toLowerCase();
  if (name.includes('traffic')) return 'TRAFFIC';
  if (name.includes('police')) return 'POLICE';
  if (name.includes('home')) return 'HOME_DEPT';
  if (name.includes('smart city') || name.includes('smartcity')) return 'SMART_CITY';
  if (
    name.includes('municipal') ||
    name.includes('corporation') ||
    name.includes('amc') ||
    name.includes('smc') ||
    name.includes('vmc') ||
    name.includes('rmc')
  ) {
    return 'MUNICIPAL';
  }
  return 'POLICE';
}

/**
 * Syncs Department collection and backfills departmentCode on all cameras
 */
async function syncDepartmentsAndCameras() {
  try {
    // 1. Ensure canonical departments exist and are active
    for (const d of CANONICAL_DEPARTMENTS) {
      await Department.findOneAndUpdate(
        { code: d.code },
        {
          $set: {
            name: d.name,
            category: d.category,
            contactEmail: d.contactEmail,
            nodalOfficer: d.nodalOfficer,
            jurisdictionDistricts: d.jurisdictionDistricts,
            isActive: true,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
    }

    // Deactivate non-canonical departments (like TRANSPORT if empty)
    await Department.updateMany(
      { code: { $nin: CANONICAL_DEPARTMENTS.map((d) => d.code) } },
      { $set: { isActive: false } }
    );

    // 2. Backfill departmentCode on all cameras using raw collection queries
    const db = Camera.collection;

    // Traffic Police
    await db.updateMany(
      { departmentName: { $regex: 'traffic', $options: 'i' } },
      { $set: { departmentCode: 'TRAFFIC' } }
    );

    // General Police / District Police
    await db.updateMany(
      {
        $or: [
          { departmentName: { $regex: 'district police', $options: 'i' } },
          { departmentName: { $regex: 'police department', $options: 'i' } },
          { departmentName: { $regex: 'police control', $options: 'i' } },
        ],
      },
      { $set: { departmentCode: 'POLICE' } }
    );

    // Home Department
    await db.updateMany(
      { departmentName: { $regex: 'home department', $options: 'i' } },
      { $set: { departmentCode: 'HOME_DEPT' } }
    );

    // Smart City Mission
    await db.updateMany(
      { departmentName: { $regex: 'smart\\s*city', $options: 'i' } },
      { $set: { departmentCode: 'SMART_CITY' } }
    );

    // Municipal Corporations (Ahmedabad, Surat, Vadodara, Rajkot, etc.)
    await db.updateMany(
      {
        $or: [
          { departmentName: { $regex: 'municipal', $options: 'i' } },
          { departmentName: { $regex: 'corporation', $options: 'i' } },
        ],
      },
      { $set: { departmentCode: 'MUNICIPAL' } }
    );

    // Fallback for any remaining without departmentCode
    await db.updateMany(
      { departmentCode: { $in: [null, '', 'OTHER'] } },
      { $set: { departmentCode: 'POLICE' } }
    );

    logger.info('Successfully synchronized canonical departments and camera departmentCode mappings');
  } catch (err) {
    logger.error('Error syncing departments and cameras:', err);
  }
}

module.exports = {
  CANONICAL_DEPARTMENTS,
  getCanonicalDepartmentCode,
  syncDepartmentsAndCameras,
};
