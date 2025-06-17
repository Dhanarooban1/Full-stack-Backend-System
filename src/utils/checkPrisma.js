import { PrismaClient } from '@prisma/client';
import logger from './logger.js';
import { exec } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';

const execAsync = util.promisify(exec);

/**
 * Check if Prisma client has been properly generated
 * This is useful after schema changes to verify client generation
 */
export async function checkPrismaClient() {
  try {
    const prisma = new PrismaClient();
    
    // Try to connect
    await prisma.$connect();
    
    // Check for required models
    const modelCheck = async (modelName) => {
      if (!prisma[modelName]) {
        logger.warn(`Model ${modelName} not found in Prisma client!`);
        return false;
      }
      
      // Test access to the model with a count operation
      try {
        await prisma[modelName].count();
        logger.info(`Model ${modelName} is available and working`);
        return true;
      } catch (error) {
        logger.warn(`Model ${modelName} exists but query failed: ${error.message}`);
        return false;
      }
    };
    
    // Check all required models
    const keypoint = await modelCheck('keypoint');
    const processingLog = await modelCheck('processingLog');
    
    // Disconnect when done
    await prisma.$disconnect();
    
    // Return status
    return {
      success: keypoint && processingLog,
      models: {
        keypoint,
        processingLog
      }
    };
  } catch (error) {
    logger.error('Error checking Prisma client:', error);
    return { 
      success: false, 
      error: error.message,
      models: {
        keypoint: false,
        processingLog: false
      }
    };
  }
}

/**
 * Regenerate Prisma client if needed
 */
export async function regeneratePrismaClient() {
  try {
    logger.info('Regenerating Prisma client...');
    
    // Run prisma generate
    const { stdout, stderr } = await execAsync('npx prisma generate');
    
    if (stderr) {
      logger.error('Error during Prisma client generation:', stderr);
      return { success: false, message: stderr };
    }
    
    logger.info('Prisma client regenerated successfully:', stdout);
    return { success: true, message: stdout };
  } catch (error) {
    logger.error('Failed to regenerate Prisma client:', error);
    return { success: false, message: error.message };
  }
}

// Execute if run directly as a standalone script
if (typeof import.meta !== 'undefined' && import.meta.url) {
  import('url').then(({ fileURLToPath }) => {
    if (process.argv[1] === fileURLToPath(import.meta.url)) {
      (async () => {
        logger.info('Checking Prisma client status...');
        const status = await checkPrismaClient();
        
        if (!status.success) {
          logger.warn('Prisma client needs regeneration!');
          const result = await regeneratePrismaClient();
          
          if (result.success) {
            logger.info('Prisma client has been regenerated. Please restart the server.');
          } else {
            logger.error('Failed to regenerate Prisma client. Please run `npx prisma generate` manually.');
          }
        } else {
          logger.info('Prisma client is properly generated and working.');
        }
        
        process.exit(0);
      })();
    }
  });
}
