import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { getPrismaClient } from '../config/database.js';
import Image from '../models/imageModel.js';
import { sendBackupEmail } from './emailService.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure backups directory exists
const backupsDir = join(__dirname, '../../backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// Daily backup at 11:59 PM
cron.schedule('59 23 * * *', async () => {
  logger.info('Starting daily scheduled backup...');
  
  try {
    const backupData = await createBackup();
    const backupFilePath = await createBackupZip(backupData);
    
    // Send backup via email
    const backupFilename = backupFilePath.split('/').pop().split('\\').pop(); // Handle both Unix and Windows paths
    await sendBackupEmail(backupFilePath, backupFilename);
    
    // Clean up old backups (keep only last 7 days)
    await cleanupOldBackups();
    
    logger.info('Daily backup completed successfully');
  } catch (error) {
    logger.error('Daily backup failed:', error);
  }
});

// Create backup data
const createBackup = async () => {
  try {
    // Get the Prisma client safely
    const prisma = getPrismaClient();
    
    // Get all pose data from PostgreSQL (using Keypoint model)
    const poseData = await prisma.keypoint.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // Get all image metadata from MongoDB
    const imageData = await Image.find({}).sort({ createdAt: -1 });

    // Get system statistics
    const stats = {
      totalPoseRecords: poseData.length,
      totalImages: imageData.length,
      backupCreatedAt: new Date().toISOString(),
      dbConnectionStatus: {
        postgresql: await checkPostgreSQLConnection(),
        mongodb: await checkMongoDBConnection()
      }
    };

    return {
      poseData,
      imageData,
      stats
    };
  } catch (error) {
    logger.error('Error creating backup data:', error);
    throw error;
  }
};

// Create ZIP backup file
const createBackupZip = (backupData) => {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const backupFilename = `backup-${timestamp}.zip`;
    const backupFilePath = join(backupsDir, backupFilename);
    
    const output = fs.createWriteStream(backupFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      logger.info(`Backup archive created: ${backupFilename} (${archive.pointer()} bytes)`);
      resolve(backupFilePath);
    });

    archive.on('error', (err) => {
      logger.error('Archive error:', err);
      reject(err);
    });

    archive.pipe(output);

    // Add data files to archive
    archive.append(JSON.stringify(backupData.poseData, null, 2), { name: 'pose_data.json' });
    archive.append(JSON.stringify(backupData.imageData, null, 2), { name: 'image_metadata.json' });
    archive.append(JSON.stringify(backupData.stats, null, 2), { name: 'backup_stats.json' });

    // Add actual image files
    const uploadsDir = join(__dirname, '../../uploads');
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'images');
    }

    // Add log files
    const logsDir = join(__dirname, '../../logs');
    if (fs.existsSync(logsDir)) {
      archive.directory(logsDir, 'logs');
    }

    archive.finalize();
  });
};

// Check PostgreSQL connection
const checkPostgreSQLConnection = async () => {
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch (error) {
    return 'disconnected';
  }
};

// Check MongoDB connection
const checkMongoDBConnection = async () => {
  try {
    await Image.findOne().limit(1);
    return 'connected';
  } catch (error) {
    return 'disconnected';
  }
};

// Clean up old backup files
const cleanupOldBackups = async () => {
  try {
    const files = fs.readdirSync(backupsDir);
    const backupFiles = files.filter(file => file.startsWith('backup-') && file.endsWith('.zip'));
    
    if (backupFiles.length > 7) {
      // Sort by creation time and keep only the 7 most recent
      const sortedFiles = backupFiles
        .map(file => ({
          name: file,
          path: join(backupsDir, file),
          time: fs.statSync(join(backupsDir, file)).mtime
        }))
        .sort((a, b) => b.time - a.time);

      // Delete files older than 7 days
      const filesToDelete = sortedFiles.slice(7);
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        logger.info(`Deleted old backup: ${file.name}`);
      }
    }
  } catch (error) {
    logger.error('Error cleaning up old backups:', error);
  }
};

// Manual backup function (can be called via API if needed)
export const createManualBackup = async () => {
  try {
    logger.info('Starting manual backup...');
    
    const backupData = await createBackup();
    const backupFilePath = await createBackupZip(backupData);
    
    const backupFilename = backupFilePath.split('/').pop().split('\\').pop(); // Handle both Unix and Windows paths
    
    logger.info(`Manual backup created: ${backupFilename}`);
    return { success: true, filename: backupFilename, path: backupFilePath };
  } catch (error) {
    logger.error('Manual backup failed:', error);
    return { success: false, error: error.message };
  }
};

// Function to create an immediate backup when new data is saved to MongoDB
export const createImmediateBackup = async () => {
  try {
    logger.info('Starting immediate backup due to new MongoDB data...');
    
    const backupData = await createBackup();
    const backupFilePath = await createBackupZip(backupData);
    
    // Send backup via email
    const backupFilename = backupFilePath.split('/').pop().split('\\').pop(); // Handle both Unix and Windows paths
    await sendBackupEmail(backupFilePath, backupFilename);
    
    logger.info('Immediate backup completed successfully');
    return { success: true, filename: backupFilename, path: backupFilePath };
  } catch (error) {
    logger.error('Immediate backup failed:', error);
    return { success: false, error: error.message };
  }
};

// Health check for cron service
export const getCronStatus = () => {
  return {
    status: 'active',
    nextBackup: '23:59 daily',
    backupDirectory: backupsDir,
    availableBackups: fs.existsSync(backupsDir) 
      ? fs.readdirSync(backupsDir).filter(file => file.endsWith('.zip')).length 
      : 0
  };
};

logger.info('Cron service initialized - Daily backups scheduled at 23:59');