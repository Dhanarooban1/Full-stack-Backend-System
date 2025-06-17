import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import poseRoutes from './src/routes/poseRoutes.js';
import { prisma, connectPostgreSQL, connectMongoDB, disconnectDatabases } from './src/config/database.js';
import { checkPrismaClient, regeneratePrismaClient } from './src/utils/checkPrisma.js';
import logger from './src/utils/logger.js';
import mongoose from 'mongoose';
import './src/services/cronService.js'; // Initialize cron jobs

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check Python dependencies
import { spawn } from 'child_process';
import fs from 'fs';

function checkPythonDependencies() {
  logger.info('Checking Python dependencies...');
  
  // Determine Python path - try to use a virtual environment if available, otherwise use system Python
  let pythonPath;
  const venvPythonPath = join(__dirname, 'python-scripts', 'venv', 'Scripts', 'python.exe');
  
  if (fs.existsSync(venvPythonPath)) {
    pythonPath = venvPythonPath;
    logger.info(`Using virtual environment Python: ${venvPythonPath}`);
  } else {
    pythonPath = 'python';
    logger.info('Using system Python');
  }
  
  const diagnosePath = join(__dirname, 'python-scripts', 'diagnose.py');
  
  // Check if diagnose.py exists
  if (!fs.existsSync(diagnosePath)) {
    logger.error(`Diagnose script not found: ${diagnosePath}`);
    logger.info('Please run "install-python-deps.bat" to set up the environment.');
    return;
  }
  
  const pythonProcess = spawn(pythonPath, [diagnosePath]);
  
  let dataString = '';
  let errorString = '';
  
  pythonProcess.stdout.on('data', (data) => {
    dataString += data.toString();
  });
  
  pythonProcess.stderr.on('data', (data) => {
    errorString += data.toString();
    logger.warn(`Python dependency warning: ${data}`);
  });
  
  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      logger.error(`Python dependencies check failed with code ${code}: ${errorString}`);
      logger.info('Please run "install-python-deps.bat" to install the required dependencies.');
      return;
    }
    
    try {
      logger.info(`Python check: ${dataString.trim()}`);
      
      const dependencyInfo = JSON.parse(dataString.trim());
      const missingDependencies = [];
      
      // Check which dependencies are missing
      if (!dependencyInfo.dependencies.cv2) missingDependencies.push('opencv-python');
      if (!dependencyInfo.dependencies.mediapipe) missingDependencies.push('mediapipe');
      if (!dependencyInfo.dependencies.numpy) missingDependencies.push('numpy');
      
      if (missingDependencies.length > 0) {
        const missingPackages = missingDependencies.join(', ');
        logger.error(`Python dependencies missing: ${missingPackages}`);
        logger.info('Please run "install-python-deps.bat" to install the required dependencies.');
      } else {
        logger.info('Python dependencies check passed successfully.');
      }
    } catch (error) {
      logger.error(`Failed to parse Python dependency check output: ${error.message}`);
      logger.info('Please run "install-python-deps.bat" to install the required dependencies.');
    }
  });
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(limiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Routes
app.use('/api/pose', poseRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  let postgresStatus = 'Unknown';
  let mongoStatus = 'Unknown';
  let prismaModels = {};
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgresStatus = 'Connected';
    
    // Check Prisma models
    const modelStatus = await checkPrismaClient();
    prismaModels = modelStatus.models;
  } catch (error) {
    postgresStatus = 'Disconnected';
    logger.error('PostgreSQL health check failed:', error);
  }
  
  try {
    if (mongoose.connection.readyState === 1) {
      mongoStatus = 'Connected';
    } else {
      mongoStatus = 'Disconnected';
    }
  } catch (error) {
    mongoStatus = 'Disconnected';
    logger.error('MongoDB health check failed:', error);
  }
  
  const status = postgresStatus === 'Connected' && mongoStatus === 'Connected' 
    ? 'OK' 
    : 'Degraded';
  
  res.status(status === 'OK' ? 200 : 207).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    databases: {
      postgres: postgresStatus,
      mongodb: mongoStatus,
      prismaModels
    },
    apiEndpoints: {
      upload: '/api/pose/upload',
      getAllPoseData: '/api/pose/',
      getPoseData: '/api/pose/:id',
      getImage: '/api/pose/image/:id',
      logs: '/api/pose/logs'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Database connections and server startup
async function startServer() {
  try {
    // Check Prisma client first
    const clientStatus = await checkPrismaClient();
    if (!clientStatus.success) {
      logger.warn('Prisma client needs regeneration. Attempting to regenerate...');
      const regenerateResult = await regeneratePrismaClient();
      
      if (regenerateResult.success) {
        logger.info('Prisma client successfully regenerated!');
      } else {
        logger.error('Failed to regenerate Prisma client:', regenerateResult.message);
        console.error('⚠️ Prisma client generation failed. Some features may not work properly.');
      }
    }
    
    // Try to connect to databases with retries
    await connectPostgreSQL(3, 5000); // 3 retries, 5 seconds between retries
    await connectMongoDB();
    
    app.listen(PORT, async () => {
      logger.info(`Server running on port ${PORT}`);
      
      // Check Python dependencies
      checkPythonDependencies();
      
      // Check databases
      try {
        // Check PostgreSQL connection
        await prisma.$queryRaw`SELECT 1`;
        logger.info('PostgreSQL is connected');
      } catch (error) {
        logger.error('PostgreSQL connection failed:', error);
      }
      
      try {
        // Check MongoDB connection
        await mongoose.connection.db.admin().ping();
        logger.info('MongoDB is connected');
      } catch (error) {
        logger.error('MongoDB connection failed:', error);
      }
      
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    console.error('⚠️ Server failed to start due to database connection issues');
    console.error('🔄 You can still use the server in limited mode, but some features may not work');
    
    // Start server anyway in degraded mode
    app.listen(PORT, () => {
      logger.info(`Server running in LIMITED MODE on port ${PORT}`);
      console.log(`🚀 Server running in LIMITED MODE at http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await disconnectDatabases();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await disconnectDatabases();
  process.exit(0);
});

startServer();