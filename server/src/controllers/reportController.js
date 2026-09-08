const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Camera = require('../models/Camera');
const Department = require('../models/Department');
const ReportDispatchLog = require('../models/ReportDispatchLog');
const { generatePDFReport, generateExcelReport, generateCSVReport } = require('../utils/reportGenerator');
const { calculateCoverageGapMetrics } = require('../utils/coverageGapAnalysis');
const { sendReportEmail } = require('../utils/emailService');
const logger = require('../utils/logger');

// Ensure reports directory exists
const reportsDir = path.join(__dirname, '../../uploads/reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

/**
 * @desc Generate and dispatch compliance / coverage audit report
 * @route POST /api/reports/dispatch
 * @access Private
 */
const dispatchReport = async (req, res) => {
  try {
    const {
      reportType = 'COMBINED_DEPARTMENT_AUDIT',
      departmentCode = 'POLICE',
      district = 'all',
      timeframe = '30d',
      format = 'PDF',
      sendEmail = true,
      overrideRecipient = null,
    } = req.body;

    // 1. Resolve Department
    let department = await Department.findOne({ code: departmentCode.toUpperCase() });
    if (!department) {
      department = {
        code: departmentCode,
        name: departmentCode === 'ALL'
          ? 'Gujarat State Multi-Department Surveillance Command'
          : `${departmentCode} Department Surveillance Command`,
        contactEmail: 'nodal.surveillance@gujarat.gov.in',
        nodalOfficer: {
          name: 'Command Duty Officer',
          designation: 'Officer on Special Duty (Geospatial Grid)',
        },
      };
    }

    const recipient = overrideRecipient || department.contactEmail;

    // 2. Fetch Cameras matching filter
    const camQuery = { isActive: { $ne: false } };
    if (district && district !== 'all' && district.toLowerCase() !== 'gujarat') {
      camQuery.district = new RegExp(`^${district}$`, 'i');
    }
    if (departmentCode && departmentCode !== 'ALL') {
      camQuery.departmentCode = departmentCode.toUpperCase();
    }

    let cameras = await Camera.find(camQuery).limit(500);
    if (cameras.length === 0) {
      // Fallback to all cameras in district if specific department code has 0 assigned
      delete camQuery.departmentCode;
      cameras = await Camera.find(camQuery).limit(500);
    }

    const isAreaAudit = reportType === 'COVERAGE_GAP' || reportType === 'AREA_COMPLIANCE_GAP';
    const reportTitle =
      reportType === 'HEALTH_AUDIT'
        ? 'SURVEILLANCE HEALTH & DOWNTIME AUDIT'
        : isAreaAudit
        ? 'GEOSPATIAL AREA COMPLIANCE & GAP AUDIT'
        : 'COMPREHENSIVE SURVEILLANCE & COMPLIANCE AUDIT';

    const distLabel = !district || district === 'all' || district.toLowerCase() === 'gujarat' ? 'Gujarat Statewide Grid' : `${district} District`;
    const subtitle = `Jurisdiction: ${distLabel} • Timeframe: ${timeframe.toUpperCase()}`;

    // 2.1 Calculate coverage gap analysis if generating COVERAGE_GAP report
    let gapAnalysis = null;
    if (isAreaAudit) {
      gapAnalysis = calculateCoverageGapMetrics(district, cameras);
    }

    // 3. Generate File Buffer
    let fileBuffer;
    let fileExtension = 'pdf';
    let mimeType = 'application/pdf';

    if (format === 'EXCEL') {
      fileBuffer = await generateExcelReport({
        title: reportTitle,
        departmentName: department.name,
        district: district && district !== 'all' ? district : 'All Districts',
        cameras,
        gapAnalysis,
        reportType,
      });
      fileExtension = 'xlsx';
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (format === 'CSV') {
      const csvStr = generateCSVReport({
        cameras,
        gapAnalysis,
        district: district && district !== 'all' ? district : 'All Districts',
        reportType,
      });
      fileBuffer = Buffer.from(csvStr, 'utf-8');
      fileExtension = 'csv';
      mimeType = 'text/csv';
    } else {
      fileBuffer = await generatePDFReport({
        title: reportTitle,
        subtitle,
        departmentName: department.name,
        nodalOfficer: department.nodalOfficer ? `${department.nodalOfficer.name} (${department.nodalOfficer.designation})` : null,
        district: district && district !== 'all' ? district : 'Gujarat Statewide Grid',
        cameras,
        timeframe,
        gapAnalysis,
        reportType,
      });
      fileExtension = 'pdf';
      mimeType = 'application/pdf';
    }

    // 4. Calculate cryptographic integrity hash (Section 65B forensic requirement)
    const hashSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // 5. Save to disk for download access
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `DrishtiGrid-${department.code}-${district || 'Gujarat'}-${timestampStr}.${fileExtension}`;
    const filePath = path.join(reportsDir, fileName);
    fs.writeFileSync(filePath, fileBuffer);

    // 6. Send Email if requested
    let deliveryStatus = 'SIMULATED';
    let smtpMessageId = null;
    let errorMessage = null;

    if (sendEmail) {
      try {
        const mailResult = await sendReportEmail({
          to: recipient,
          subject: `[DrishtiGrid Official Audit] ${reportTitle} - ${new Date().toLocaleDateString()}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
              <div style="background-color: #0f172a; padding: 20px; border-radius: 8px 8px 0 0; color: #38bdf8;">
                <h2 style="margin: 0; font-size: 18px;">DRISHTIGRID GUJARAT SURVEILLANCE</h2>
                <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">Departmental Compliance & Health Dispatch System</p>
              </div>
              <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; background: #ffffff;">
                <h3 style="margin-top: 0; color: #0f172a;">${reportTitle}</h3>
                <p>Respected <strong>${department.nodalOfficer?.name || 'Department Nodal Officer'}</strong>,</p>
                <p>Please find attached the official analytical audit report generated by the DrishtiGrid Command Engine for <strong>${department.name}</strong>.</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 0; color: #64748b;">Jurisdiction:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${district && district !== 'all' ? district : 'Statewide Grid'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 0; color: #64748b;">Evaluation Window:</td>
                    <td style="padding: 8px 0; font-weight: bold;">Past ${timeframe.toUpperCase()}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 0; color: #64748b;">Monitored Cameras:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${cameras.length} units</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Forensic SHA-256:</td>
                    <td style="padding: 8px 0; font-family: monospace; font-size: 11px; word-break: break-all;">${hashSha256}</td>
                  </tr>
                </table>

                <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
                  This is an automated dispatch from the Government of Gujarat CCTV Surveillance Network. In compliance with the Indian Evidence Act Section 65B.
                </p>
              </div>
            </div>
          `,
          attachments: [
            {
              filename: fileName,
              content: fileBuffer,
              contentType: mimeType,
            },
          ],
        });

        deliveryStatus = mailResult.messageId?.includes('simulated') ? 'SIMULATED' : 'SENT';
        smtpMessageId = mailResult.messageId;
      } catch (err) {
        logger.error('Failed to send email:', err);
        deliveryStatus = 'FAILED';
        errorMessage = err.message;
      }
    }

    // 7. Write to Audit Dispatch Log
    const dispatchLog = await ReportDispatchLog.create({
      reportType,
      targetDepartment: department.code,
      recipientEmails: [recipient],
      generatedBy: req.user?._id || null,
      generationTrigger: 'MANUAL_USER',
      format,
      parameters: {
        district,
        timeframe,
      },
      fileMetadata: {
        fileName,
        fileSizeBytes: fileBuffer.length,
        storagePath: `/uploads/reports/${fileName}`,
        hashSha256,
      },
      deliveryStatus,
      smtpMessageId,
      errorMessage,
    });

    const downloadUrl = `/api/reports/download/${fileName}`;

    return res.json({
      success: true,
      message: `Report generated successfully${sendEmail ? ' and dispatched to ' + recipient : ''}`,
      data: {
        dispatchId: dispatchLog._id,
        fileName,
        fileSizeBytes: fileBuffer.length,
        downloadUrl,
        directUrl: `/uploads/reports/${fileName}`,
        recipient,
        deliveryStatus,
        hashSha256,
        dispatchedAt: dispatchLog.createdAt,
      },
    });
  } catch (error) {
    logger.error('Error in dispatchReport:', error);
    return res.status(500).json({ success: false, message: 'Server error generating or dispatching report' });
  }
};

/**
 * @desc Get audit logs of all generated reports
 * @route GET /api/reports/history
 * @access Private
 */
const getDispatchHistory = async (req, res) => {
  try {
    const logs = await ReportDispatchLog.find()
      .populate('generatedBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({ success: true, data: logs });
  } catch (error) {
    logger.error('Error in getDispatchHistory:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving report history' });
  }
};

/**
 * @desc Securely download generated report file with proper Content-Disposition
 * @route GET /api/reports/download/:fileName
 * @access Public
 */
const downloadReportFile = async (req, res) => {
  try {
    const rawFileName = req.params.fileName;
    // Sanitize to prevent path traversal attacks
    const safeFileName = path.basename(rawFileName);
    const filePath = path.resolve(reportsDir, safeFileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Report file not found or expired' });
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(safeFileName).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.xlsx') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext === '.csv') {
      contentType = 'text/csv; charset=utf-8';
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      logger.error('Stream error in downloadReportFile:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error streaming file' });
      }
    });
    return stream.pipe(res);
  } catch (error) {
    logger.error('Error in downloadReportFile:', error);
    return res.status(500).json({ success: false, message: 'Server error downloading report file' });
  }
};

module.exports = {
  dispatchReport,
  getDispatchHistory,
  downloadReportFile,
};
