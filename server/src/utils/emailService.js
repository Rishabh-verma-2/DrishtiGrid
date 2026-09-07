const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10) || 587,
      secure: parseInt(SMTP_PORT, 10) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
    logger.info('Nodemailer SMTP transporter initialized');
  } else {
    logger.info('SMTP credentials not configured in environment. Email service operating in Simulated Mode.');
    transporter = {
      sendMail: async (options) => {
        logger.info(`[SIMULATED EMAIL DISPATCH] To: ${options.to} | Subject: ${options.subject} | Attachment: ${options.attachments?.[0]?.filename || 'None'}`);
        return {
          messageId: `<simulated-${Date.now()}@drishtigrid.gujarat.gov.in>`,
          response: '250 Simulated Message Accepted for Delivery',
          accepted: Array.isArray(options.to) ? options.to : [options.to],
        };
      },
    };
  }

  return transporter;
};

const sendReportEmail = async ({ to, subject, html, attachments = [] }) => {
  const mailer = getTransporter();
  const from = process.env.SMTP_FROM || '"DrishtiGrid State Surveillance" <surveillance.dispatch@gujarat.gov.in>';

  return await mailer.sendMail({
    from,
    to,
    subject,
    html,
    attachments,
  });
};

module.exports = {
  sendReportEmail,
};
