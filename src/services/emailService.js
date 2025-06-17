import sgMail from '@sendgrid/mail';
import fs from 'fs';
import logger from '../utils/logger.js';

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  logger.error('SendGrid API key not found. Email functionality will not work.');
}

// New function to send MongoDB data storage notification
export const sendMongoDBStorageEmail = async (imageData) => {
  if (!process.env.SENDGRID_API_KEY) {
    logger.error('SendGrid API key not configured. MongoDB storage email not sent.');
    return false;
  }

  const recipient = process.env.NOTIFICATION_EMAIL_RECIPIENT || process.env.BACKUP_EMAIL_RECIPIENT;
  if (!recipient) {
    logger.warn('No notification email recipient configured. MongoDB storage email not sent.');
    return false;
  }

  const emailConfig = {
    to: recipient,
    from: process.env.FROM_EMAIL,
    subject: `New Data Stored in MongoDB - ${new Date().toLocaleDateString()}`,
    text: `New image data has been stored in MongoDB.\n\nImage Details:\nFilename: ${imageData.filename}\nOriginal Name: ${imageData.originalName}\nSize: ${imageData.size} bytes\nPose Data ID: ${imageData.poseDataId}\nStored at: ${new Date().toISOString()}\n\nThis is an automated test email.`,
    html: `
      <h2>MongoDB Storage Notification</h2>
      <p>New image data has been successfully stored in MongoDB.</p>
      <h3>Image Details:</h3>
      <ul>
        <li><strong>Filename:</strong> ${imageData.filename}</li>
        <li><strong>Original Name:</strong> ${imageData.originalName}</li>
        <li><strong>Size:</strong> ${imageData.size} bytes</li>
        <li><strong>Pose Data ID:</strong> ${imageData.poseDataId}</li>
        <li><strong>Stored at:</strong> ${new Date().toISOString()}</li>
      </ul>
      <p><em>This is an automated test email.</em></p>
    `
  };

  try {
    await sgMail.send(emailConfig);
    logger.info(`MongoDB storage notification email sent via SendGrid to ${recipient}`);
    return true;
  } catch (error) {
    logger.error('Failed to send MongoDB storage notification email:', error);
    return false;
  }
};

// Send email with backup attachment
export const sendBackupEmail = async (backupFilePath, backupFilename) => {
  if (!process.env.SENDGRID_API_KEY) {
    logger.error('SendGrid API key not configured. Backup email not sent.');
    return false;
  }

  if (!process.env.BACKUP_EMAIL_RECIPIENT) {
    logger.warn('No backup email recipient configured. Backup email not sent.');
    return false;
  }

  const currentDate = new Date().toLocaleDateString();
  
  const emailConfig = {
    to: process.env.BACKUP_EMAIL_RECIPIENT,
    from: process.env.FROM_EMAIL,
    subject: `Daily DB Backup - ${currentDate}`,
    text: `Daily database backup has been created successfully.\n\nBackup file: ${backupFilename}\nCreated at: ${new Date().toISOString()}\n\nThis backup contains data from both MongoDB and SQL databases.\n\nThis is an automated email.`,
    html: `
      <h2>Daily Database Backup</h2>
      <p>Your daily database backup has been created successfully.</p>
      <ul>
        <li><strong>Backup file:</strong> ${backupFilename}</li>
        <li><strong>Created at:</strong> ${new Date().toISOString()}</li>
        <li><strong>Content:</strong> Combined MongoDB and SQL database data</li>
      </ul>
      <p>This ZIP file contains exported data from both SQL and MongoDB databases, as well as any uploaded images and log files.</p>
      <p><em>This is an automated email. Please do not reply.</em></p>    `,
    attachments: [
      {
        content: Buffer.from(fs.readFileSync(backupFilePath)).toString('base64'),
        filename: backupFilename,
        type: 'application/zip',
        disposition: 'attachment'
      }
    ]
  };

  try {
    await sgMail.send(emailConfig);
    logger.info(`Backup email sent via SendGrid to ${process.env.BACKUP_EMAIL_RECIPIENT}`);
    return true;

  } catch (error) {
    logger.error('Failed to send backup email:', error);
    return false;
  }
};

// Send notification email
export const sendNotificationEmail = async (subject, message, htmlMessage = null) => {
  if (!process.env.SENDGRID_API_KEY) {
    logger.error('SendGrid API key not configured. Notification email not sent.');
    return false;
  }

  const recipient = process.env.NOTIFICATION_EMAIL_RECIPIENT || process.env.BACKUP_EMAIL_RECIPIENT;
  if (!recipient) {
    logger.warn('No notification email recipient configured. Notification email not sent.');
    return false;
  }

  const emailConfig = {
    to: recipient,
    from: process.env.FROM_EMAIL,
    subject: subject,
    text: message,
    html: htmlMessage || `<p>${message.replace(/\n/g, '<br>')}</p>`
  };

  try {
    await sgMail.send(emailConfig);
    logger.info(`Notification email sent via SendGrid: ${subject}`);
    return true;

  } catch (error) {
    logger.error('Failed to send notification email:', error);
    return false;
  }
};

export default { sendBackupEmail, sendNotificationEmail, sendMongoDBStorageEmail };