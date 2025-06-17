import { getPrismaClient } from '../config/database.js';
import logger from './logger.js';

/**
 * Debug utility to check database contents
 */
export async function checkDatabase() {
  try {
    const db = getPrismaClient();
    
    // Check keypoints
    logger.info('Checking keypoints in database...');
    
    const keypointCount = await db.keypoint.count();
    logger.info(`Found ${keypointCount} keypoints in database`);
    
    // Get first few keypoints as samples
    if (keypointCount > 0) {
      const samples = await db.keypoint.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
      });
      
      logger.info(`Most recent keypoint IDs: ${samples.map(s => s.id).join(', ')}`);
      
      // Log the structure of the first keypoint
      if (samples.length > 0) {
        logger.info('First keypoint structure:', {
          id: samples[0].id,
          imageId: samples[0].imageId,
          hasKeypoints: Array.isArray(samples[0].keypoints) && samples[0].keypoints.length > 0,
          keypointCount: Array.isArray(samples[0].keypoints) ? samples[0].keypoints.length : 'N/A',
          hasLandmarks: samples[0].landmarks !== null,
          hasVisibility: samples[0].visibility !== null,
          createdAt: samples[0].createdAt
        });
      }
    }
    
    // Check processing logs
    const logCount = await db.processingLog.count();
    logger.info(`Found ${logCount} processing logs in database`);
    
    if (logCount > 0) {
      const logs = await db.processingLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
      });
      
      logger.info(`Processing log statuses: ${logs.map(l => l.status).join(', ')}`);
    }
    
    return {
      keypointCount,
      logCount,
      success: true
    };
  } catch (error) {
    logger.error('Error checking database:', error);
    return {
      error: error.message,
      success: false
    };
  }
}

/**
 * Lookup a specific keypoint by ID
 */
export async function lookupKeypoint(id) {
  try {
    const db = getPrismaClient();
    
    // Try to find the keypoint
    const keypoint = await db.keypoint.findUnique({
      where: { id }
    });
    
    if (!keypoint) {
      logger.info(`No keypoint found with ID: ${id}`);
      
      // Look for similar IDs (prefix match)
      if (id.length > 5) {
        const similarKeypoints = await db.keypoint.findMany({
          where: {
            id: {
              startsWith: id.substring(0, 5)
            }
          },
          take: 5
        });
        
        if (similarKeypoints.length > 0) {
          logger.info(`Found ${similarKeypoints.length} keypoints with similar IDs:`);
          similarKeypoints.forEach(k => logger.info(`- ${k.id} (created: ${k.createdAt})`));
        }
      }
      
      return { exists: false };
    }
    
    logger.info(`Found keypoint with ID: ${id}`);
    return {
      exists: true,
      keypoint
    };
  } catch (error) {
    logger.error(`Error looking up keypoint ${id}:`, error);
    return {
      exists: false,
      error: error.message
    };
  }
}

// Run this file directly to check the database
if (process.argv[1] === new URL(import.meta.url).pathname) {
  (async () => {
    console.log('Checking database...');
    const result = await checkDatabase();
    
    if (result.success) {
      console.log(`Found ${result.keypointCount} keypoints and ${result.logCount} logs`);
      
      if (process.argv[2]) {
        console.log(`Looking up keypoint with ID: ${process.argv[2]}`);
        const lookup = await lookupKeypoint(process.argv[2]);
        
        if (lookup.exists) {
          console.log('Keypoint found!');
        } else {
          console.log('Keypoint not found.');
          if (lookup.error) {
            console.error('Error:', lookup.error);
          }
        }
      }
    } else {
      console.error('Error checking database:', result.error);
    }
    
    process.exit(0);
  })();
}
