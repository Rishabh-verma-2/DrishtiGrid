const multer = require('multer');
const {
  generateExcelTemplate,
  parseAndValidateExcel,
  commitBulkImport,
  generateImportReport,
} = require('../services/bulkCameraService');
const ImportSession = require('../models/ImportSession');
const logger = require('../utils/logger');

// Configure Multer for In-Memory Processing (Up to 15MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.xlsx', '.xls'];
    const lowerName = (file.originalname || '').toLowerCase();
    const isAllowedExt = allowedExts.some((ext) => lowerName.endsWith(ext));

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];

    if (isAllowedExt || allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel workbooks (.xlsx or .xls) are supported for bulk camera onboarding.'));
    }
  },
}).single('file');

/**
 * @desc  Stream official blank template with instructions and reference enums
 * @route GET /api/cameras/bulk/template
 */
const getTemplate = async (req, res) => {
  try {
    const buffer = await generateExcelTemplate();
    const filename = `DrishtiGrid_Camera_Registry_Template.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(buffer);
  } catch (error) {
    logger.error(`getTemplate error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to generate camera registry template.' });
  }
};

/**
 * @desc  Upload Excel file, parse, validate, and return pre-save preview without writing to Camera collection
 * @route POST /api/cameras/bulk/validate
 */
const validateBulk = (req, res) => {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ success: false, message: uploadErr.message });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No Excel file was uploaded.' });
    }

    try {
      const session = await parseAndValidateExcel(
        req.file.buffer,
        req.file.originalname,
        req.user
      );

      return res.status(200).json({
        success: true,
        importId: session.importId,
        filename: session.filename,
        summary: session.summary,
        headersFound: session.headersFound,
        headersMissing: session.headersMissing,
        headersUnknown: session.headersUnknown,
        rows: session.rows,
        createdAt: session.createdAt,
      });
    } catch (error) {
      logger.error(`validateBulk error: ${error.message}`);
      return res.status(422).json({
        success: false,
        message: error.message || 'Validation failed for the uploaded camera file.',
      });
    }
  });
};

/**
 * @desc  Explicitly commit and persist valid cameras from a validated session
 * @route POST /api/cameras/bulk/import
 */
const commitImport = async (req, res) => {
  try {
    const { importId } = req.body;
    if (!importId) {
      return res.status(400).json({ success: false, message: 'importId is required to commit import.' });
    }

    const result = await commitBulkImport(importId, req.user, req);
    return res.status(201).json(result);
  } catch (error) {
    logger.error(`commitImport error: ${error.message}`);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc  Get import session details by ID
 * @route GET /api/cameras/bulk/import/:importId
 */
const getImportSession = async (req, res) => {
  try {
    const session = await ImportSession.findOne({ importId: req.params.importId });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Import session not found.' });
    }
    return res.status(200).json({ success: true, data: session });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc  Download audit report for a validated/completed import session
 * @route GET /api/cameras/bulk/import/:importId/report
 */
const downloadReport = async (req, res) => {
  try {
    const { importId } = req.params;
    const buffer = await generateImportReport(importId);
    const filename = `DrishtiGrid_Import_Report_${importId}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    logger.error(`downloadReport error: ${error.message}`);
    return res.status(404).json({ success: false, message: error.message });
  }
};

/**
 * @desc  Cancel an uncommitted import session
 * @route POST /api/cameras/bulk/import/:importId/cancel
 */
const cancelImport = async (req, res) => {
  try {
    const session = await ImportSession.findOneAndUpdate(
      { importId: req.params.importId, status: { $in: ['VALIDATED', 'UPLOADED'] } },
      { $set: { status: 'CANCELLED' } },
      { returnDocument: 'after' }
    );
    if (!session) {
      return res.status(404).json({ success: false, message: 'Active import session not found.' });
    }
    return res.status(200).json({ success: true, message: 'Import session discarded.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getTemplate,
  validateBulk,
  commitImport,
  getImportSession,
  downloadReport,
  cancelImport,
};
