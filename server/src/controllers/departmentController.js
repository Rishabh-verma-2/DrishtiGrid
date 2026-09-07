const Department = require('../models/Department');
const Camera = require('../models/Camera');
const logger = require('../utils/logger');

/**
 * @desc Get all registered departments with live camera counts
 * @route GET /api/departments
 * @access Private
 */
const getDepartments = async (req, res) => {
  try {
    let departments = await Department.find({ isActive: true }).sort({ name: 1 });

    // Seed defaults if empty
    if (!departments || departments.length === 0) {
      const defaultDepts = [
        {
          code: 'POLICE',
          name: 'Gujarat State Police Surveillance Branch',
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
          name: 'Gujarat State Traffic Police & Highway Authority',
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
          code: 'MUNICIPAL',
          name: 'Urban Development & Smart City Command Center',
          category: 'Municipal Corporation',
          contactEmail: 'smartcity.director@gujarat.gov.in',
          nodalOfficer: {
            name: 'Dr. Vivek Sharma, IAS',
            designation: 'Chief Executive Officer (Smart City Mission)',
            phone: '+91 79 2325 1122',
          },
          jurisdictionDistricts: ['Ahmedabad', 'Surat', 'Vadodara', 'Gandhinagar'],
        },
        {
          code: 'TRANSPORT',
          name: 'Gujarat Transport Department (RTO Surveillance)',
          category: 'Transport',
          contactEmail: 'rto.surveillance@gujarat.gov.in',
          nodalOfficer: {
            name: 'Shri A. N. Vaghela',
            designation: 'Regional Transport Enforcement Officer',
            phone: '+91 79 2325 9900',
          },
          jurisdictionDistricts: ['Ahmedabad', 'Surat', 'Vadodara', 'Mehsana'],
        },
      ];

      departments = await Department.insertMany(defaultDepts);
    }

    // Attach current camera distribution
    const counts = await Camera.aggregate([
      {
        $group: {
          _id: '$departmentCode',
          total: { $sum: 1 },
          online: { $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] } },
        },
      },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[c._id || 'POLICE'] = { total: c.total, online: c.online };
    });

    const enriched = departments.map((d) => {
      const stat = countMap[d.code] || { total: 0, online: 0 };
      return {
        ...d.toObject(),
        cameraStats: {
          total: stat.total,
          online: stat.online,
          offline: stat.total - stat.online,
        },
      };
    });

    return res.json({ success: true, data: enriched });
  } catch (error) {
    logger.error('Error in getDepartments:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving departments' });
  }
};

module.exports = {
  getDepartments,
};
