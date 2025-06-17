import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// PostgreSQL connection via Prisma with retry logic
let prisma;

try {
  // Initialize the PrismaClient with additional configuration
  prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'pretty',
  });

  // Test connection at import time to catch early failures
  prisma
    .$connect()
    .then(() => {
      logger.info('Prisma client initialized');
      // Check available models for debugging
      const availableModels = Object.keys(prisma).filter(
        (key) =>
          !key.startsWith('_') &&
          typeof prisma[key] === 'object' &&
          prisma[key] !== null
      );
      logger.info(`Available Prisma models: ${availableModels.join(', ')}`);
    })
    .catch((err) => logger.error('Failed to initialize Prisma client:', err));
} catch (error) {
  logger.error('Failed to create Prisma client:', error);
  prisma = null;
}

// MongoDB connection
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
};

// PostgreSQL connection with retry
const connectPostgreSQL = async (retries = 5, interval = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!prisma) {
        prisma = new PrismaClient({
          log: ['error'],
          errorFormat: 'pretty',
        });
      }

      await prisma.$connect();

      // Verify the model existence
      try {
        // Simple query to check if the model exists
        await prisma.keypoint.count();
        await prisma.processingLog.count();
        logger.info('Prisma models verified successfully');
      } catch (modelError) {
        logger.error('Prisma models verification failed:', modelError);
        throw new Error(`Model verification failed: ${modelError.message}`);
      }

      logger.info('Connected to PostgreSQL');
      return true;
    } catch (error) {
      logger.error(
        `PostgreSQL connection attempt ${attempt}/${retries} failed:`,
        error
      );

      if (attempt === retries) {
        logger.error('All PostgreSQL connection attempts failed');
        throw error;
      }

      logger.info(`Retrying in ${interval / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
};

// Graceful shutdown
const disconnectDatabases = async () => {
  try {
    if (prisma) await prisma.$disconnect();
    await mongoose.disconnect();
    logger.info('Disconnected from databases');
  } catch (error) {
    logger.error('Error disconnecting from databases:', error);
  }
};

// Function to get prisma client safely
const getPrismaClient = () => {
  if (!prisma) {
    logger.error('Prisma client is not initialized');
    throw new Error('Database connection failed. Please try again later.');
  }

  // Check if keypoint model is available
  if (!prisma.keypoint) {
    logger.error('Prisma keypoint model is not available');
    throw new Error(
      'Required database models are not available. Please check your Prisma schema and client generation.'
    );
  }

  return prisma;
};

export {
  prisma,
  connectPostgreSQL,
  connectMongoDB,
  disconnectDatabases,
  getPrismaClient,
};