import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { getPrismaClient } from '../config/database.js';

import Image from '../models/imageModel.js';
import logger from '../utils/logger.js';
import * as emailService from '../services/emailService.js';
import { createImmediateBackup } from '../services/cronService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const uploadImage = async (req, res) => {
  try {    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imagePath = req.file.path;
    const pythonScriptPath = join(__dirname, '../../python-scripts/extract_pose.py');

    // Check if Python script exists
    if (!fs.existsSync(pythonScriptPath)) {
      logger.error(`Python script not found: ${pythonScriptPath}`);
      
      // Clean up uploaded file
      fs.unlinkSync(imagePath);
      
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'The required Python script for pose extraction is missing'
      });
    }

    // Start tracking processing time
    const startTime = Date.now();

    // Extract pose data using Python script
    const poseData = await extractPoseData(pythonScriptPath, imagePath);
    
    if (!poseData || !poseData.keypoints) {
      // Clean up uploaded file
      fs.unlinkSync(imagePath);
      
      // Log the processing failure
      const db = getPrismaClient();
      await db.processingLog.create({
        data: {
          imageId: req.file.filename,
          status: 'FAILED',
          error: 'No pose detected in the image',
          processingTime: Date.now() - startTime
        }
      });
      
      return res.status(400).json({ error: 'No pose detected in the image' });
    }

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    // Safely get the prisma client
    const db = getPrismaClient();

    // Prepare keypoints data and extract visibility if available
    const keypointsData = poseData.keypoints;
    const visibilityArray = keypointsData.map(kp => kp.visibility || 0);
    const landmarksData = keypointsData.map(kp => ({
      id: kp.id,
      name: kp.name,
      x: kp.x,
      y: kp.y,
      z: kp.z
    }));

    // Save pose data to PostgreSQL using the new schema
    const savedPose = await db.keypoint.create({
      data: {
        imageId: req.file.filename,
        keypoints: keypointsData,
        landmarks: landmarksData,
        visibility: visibilityArray
      }
    });

    // Log successful processing
    await db.processingLog.create({
      data: {
        imageId: req.file.filename,
        status: 'SUCCESS',
        processingTime: processingTime
      }    });

    // Save image metadata to MongoDB
    const savedImage = await Image.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      poseDataId: savedPose.id
    });    // Send email notification for MongoDB storage and trigger backup
    try {
      // Send storage notification
      await emailService.sendMongoDBStorageEmail({
        filename: savedImage.filename,
        originalName: savedImage.originalName,
        size: savedImage.size,
        poseDataId: savedImage.poseDataId
      });
      
      // Trigger immediate database backup with ZIP file attachment
      logger.info('Triggering immediate database backup due to new MongoDB data');
      const backupResult = await createImmediateBackup();
      if (backupResult.success) {
        logger.info(`Immediate backup created successfully: ${backupResult.filename}`);
      } else {
        logger.error('Failed to create immediate backup:', backupResult.error);
      }
    } catch (emailError) {
      logger.error('Error sending MongoDB storage email notification or creating backup:', emailError);
      // Don't stop the process if email or backup fails
    }    logger.info(`Pose data extracted and saved for image: ${req.file.originalname}`);

    res.status(201).json({
      message: 'Image uploaded and pose data extracted successfully',
      poseData: savedPose,
      image: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      }
    });
  } catch (error) {
    logger.error('Error in uploadImage:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    // Log error in processing
    try {
      const db = getPrismaClient();
      await db.processingLog.create({
        data: {
          imageId: req.file ? req.file.filename : 'unknown',
          status: 'ERROR',
          error: error.message,
          processingTime: null
        }
      });
    } catch (logError) {
      logger.error('Failed to log processing error:', logError);
    }
    
    // Format a more user-friendly error message
    let userMessage = 'Failed to process image';
    let statusCode = 500;
    
    if (error.message.includes('No module named')) {
      userMessage = 'Python dependencies missing. Please install required packages: opencv-python, mediapipe, numpy.';
      statusCode = 503; // Service Unavailable
    } else if (error.message.includes('No pose detected')) {
      userMessage = 'No human pose could be detected in the uploaded image. Please try a different image.';
      statusCode = 400; // Bad Request
    } else if (error.message.includes('Could not read image file')) {
      userMessage = 'The uploaded file could not be processed as an image. Please try a different file.';
      statusCode = 400; // Bad Request
    }
    
    res.status(statusCode).json({ 
      error: userMessage,
      details: error.message 
    });
  }
};

// Get specific pose data
export const getPoseData = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Safely get the prisma client
    const db = getPrismaClient();
    
    // Check if the keypoint model exists
    if (!db.keypoint) {
      logger.error('Keypoint model not found in Prisma client');
      return res.status(500).json({
        error: 'Database schema error',
        message: 'The required database model "keypoint" is not available'
      });
    }
    
    // Debug log
    logger.info(`Attempting to find keypoint with id: ${id}`);
    
    // Check if id is a valid keypoint id (not a route path)
    if (id === 'upload' || id === 'logs' || id === 'image' || id === 'backup') {
      logger.error(`Invalid request: '${id}' is a route path, not a keypoint ID`);
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: `'${id}' is a route path, not a keypoint ID. Please use a valid keypoint ID.`
      });
    }
    
    // First check if the ID is in a valid format
    if (!id || typeof id !== 'string' || id.trim() === '') {
      logger.error(`Invalid keypoint ID format: ${id}`);
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The ID must be a non-empty string'
      });
    }
    
    // Use try/catch to handle potential errors in the query
    let poseData;
    try {
      poseData = await db.keypoint.findUnique({
        where: { id }
      });
    } catch (queryError) {
      logger.error(`Error querying keypoint data: ${queryError.message}`);
      return res.status(500).json({
        error: 'Database query error',
        message: queryError.message
      });
    }

    if (!poseData) {
      logger.warn(`No keypoint found with ID: ${id}`);
      
      // Get a count of available keypoints to help with debugging
      try {
        const count = await db.keypoint.count();
        const recentKeypoints = count > 0 ? 
          await db.keypoint.findMany({ 
            take: 3, 
            orderBy: { createdAt: 'desc' },
            select: { id: true, createdAt: true }
          }) : [];
          
        return res.status(404).json({ 
          error: 'Pose data not found', 
          message: `No keypoint with ID '${id}' exists in the database`,
          debug: {
            totalKeypoints: count,
            recentKeypoints: recentKeypoints.map(k => ({ 
              id: k.id, 
              createdAt: k.createdAt 
            }))
          }
        });
      } catch (countError) {
        logger.error('Error getting keypoint count:', countError);
        return res.status(404).json({ error: 'Pose data not found' });
      }
    }

    // Get associated image data
    const imageData = await Image.findOne({ poseDataId: id });

    res.status(200).json({
      poseData,
      image: imageData
    });

  } catch (error) {
    logger.error('Error in getPoseData:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve pose data',
      message: error.message 
    });
  }
};

// Get all pose data with pagination
export const getAllPoseData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Safely get the prisma client
    const db = getPrismaClient();

    const [poseDataList, totalCount] = await Promise.all([
      db.keypoint.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      db.keypoint.count()
    ]);

    // Get associated image data for each pose
    const poseDataWithImages = await Promise.all(
      poseDataList.map(async (pose) => {
        const imageData = await Image.findOne({ poseDataId: pose.id });
        return {
          ...pose,
          image: imageData
        };
      })
    );

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      data: poseDataWithImages,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    logger.error('Error in getAllPoseData:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve pose data',
      message: error.message 
    });
  }
};

// Update pose data
export const updatePoseData = async (req, res) => {
  try {
    const { id } = req.params;
    const { keypoints, landmarks, visibility } = req.body;

    // Safely get the prisma client
    const db = getPrismaClient();

    const existingPose = await db.keypoint.findUnique({
      where: { id }
    });

    if (!existingPose) {
      return res.status(404).json({ error: 'Pose data not found' });
    }

    const updatedPose = await db.keypoint.update({
      where: { id },
      data: {
        keypoints: keypoints || existingPose.keypoints,
        landmarks: landmarks || existingPose.landmarks,
        visibility: visibility || existingPose.visibility
        // updatedAt will be automatically set by @updatedAt
      }
    });

    logger.info(`Pose data updated for ID: ${id}`);

    res.status(200).json({
      message: 'Pose data updated successfully',
      poseData: updatedPose
    });

  } catch (error) {
    logger.error('Error in updatePoseData:', error);
    res.status(500).json({ 
      error: 'Failed to update pose data',
      message: error.message 
    });
  }
};

// Delete pose data
export const deletePoseData = async (req, res) => {
  try {
    const { id } = req.params;

    // Safely get the prisma client
    const db = getPrismaClient();

    const existingPose = await db.keypoint.findUnique({
      where: { id }
    });

    if (!existingPose) {
      return res.status(404).json({ error: 'Pose data not found' });
    }

    // Find and delete associated image
    const imageData = await Image.findOne({ poseDataId: id });
    if (imageData) {
      // Delete physical file
      if (fs.existsSync(imageData.path)) {
        fs.unlinkSync(imageData.path);
      }
      // Delete from MongoDB
      await Image.deleteOne({ poseDataId: id });
    }

    // Delete from PostgreSQL
    await db.keypoint.delete({
      where: { id }
    });

    // Add log entry
    await db.processingLog.create({
      data: {
        imageId: existingPose.imageId,
        status: 'DELETED',
        processingTime: null
      }
    });

    logger.info(`Pose data and associated image deleted for ID: ${id}`);

    res.status(200).json({
      message: 'Pose data and associated image deleted successfully'
    });

  } catch (error) {
    logger.error('Error in deletePoseData:', error);
    res.status(500).json({ 
      error: 'Failed to delete pose data',
      message: error.message 
    });
  }
};

// Get image file
export const getImage = async (req, res) => {
  try {
    const { id } = req.params;

    // First get the keypoint data to get the imageId
    const db = getPrismaClient();
    const keypointData = await db.keypoint.findUnique({
      where: { id }
    });

    if (!keypointData) {
      return res.status(404).json({ error: 'Keypoint data not found' });
    }

    // Get the image from MongoDB using poseDataId
    const imageData = await Image.findOne({ poseDataId: id });
    if (!imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (!fs.existsSync(imageData.path)) {
      return res.status(404).json({ error: 'Image file not found on disk' });
    }

    res.sendFile(join(process.cwd(), imageData.path));

  } catch (error) {
    logger.error('Error in getImage:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve image',
      message: error.message 
    });
  }
};

// Get processing logs
export const getProcessingLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Safely get the prisma client
    const db = getPrismaClient();
    
    const [logs, totalCount] = await Promise.all([
      db.processingLog.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      db.processingLog.count()
    ]);
    
    const totalPages = Math.ceil(totalCount / limit);
    
    res.status(200).json({
      data: logs,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    logger.error('Error in getProcessingLogs:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve processing logs',
      message: error.message 
    });
  }
};

// Download backup file
export const downloadBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    const backupPath = join(__dirname, '../../backups', filename);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.download(backupPath, filename);

  } catch (error) {
    logger.error('Error in downloadBackup:', error);
    res.status(500).json({ 
      error: 'Failed to download backup',
      message: error.message 
    });
  }
};

// Helper function to extract pose data using Python script
const extractPoseData = (scriptPath, imagePath) => {
  return new Promise((resolve, reject) => {
    // Determine Python path - try to use a virtual environment if available, otherwise use system Python
    let pythonPath;
    const venvPythonPath = join(dirname(dirname(scriptPath)), 'python-scripts', 'venv', 'Scripts', 'python.exe');
    
    if (fs.existsSync(venvPythonPath)) {
      pythonPath = venvPythonPath;
    } else {
      // Try system Python
      pythonPath = 'python';
    }
    
    logger.info(`Using Python path: ${pythonPath}`);
    
    // First check if Python dependencies are installed
    const diagnosePath = join(dirname(scriptPath), 'diagnose.py');
    
    // Check if diagnose.py exists
    if (!fs.existsSync(diagnosePath)) {
      logger.error(`Diagnose script not found: ${diagnosePath}`);
      reject(new Error('Missing dependency check script. Please contact system administrator.'));
      return;
    }
    
    const checkDependencies = spawn(pythonPath, [diagnosePath]);
    
    let checkData = '';
    let checkErrorData = '';
    
    checkDependencies.stdout.on('data', (data) => {
      checkData += data.toString();
    });
    
    checkDependencies.stderr.on('data', (data) => {
      checkErrorData += data.toString();
      logger.warn(`Python dependency check stderr: ${data.toString().trim()}`);
    });
    
    checkDependencies.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Python dependency check failed with code ${code}: ${checkErrorData}`);
        reject(new Error('Failed to check Python dependencies. Please ensure Python is installed.'));
        return;
      }
      
      try {
        // Log the raw output for debugging
        logger.info(`Python check: ${checkData.trim()}`);
        
        const dependencyInfo = JSON.parse(checkData.trim());
        const missingDependencies = [];
        
        // Check which dependencies are missing
        if (!dependencyInfo.dependencies.cv2) missingDependencies.push('opencv-python');
        if (!dependencyInfo.dependencies.mediapipe) missingDependencies.push('mediapipe');
        if (!dependencyInfo.dependencies.numpy) missingDependencies.push('numpy');
        
        if (missingDependencies.length > 0) {
          const missingPackages = missingDependencies.join(', ');
          const installCommand = `pip install ${missingPackages}`;
          logger.error(`Python dependencies missing: ${missingPackages}`);
          reject(new Error(`Python dependencies missing: ${missingPackages}. Please install required packages with: ${installCommand}`));
          return;
        }
        
        // If dependencies are okay, proceed with pose extraction
        logger.info(`Running Python script: ${scriptPath} with image: ${imagePath}`);
        const pythonProcess = spawn(pythonPath, [scriptPath, imagePath]);
        
        let dataString = '';
        let errorString = '';

        pythonProcess.stdout.on('data', (data) => {
          dataString += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          errorString += data.toString();
          // Log but don't error on stderr - some MediaPipe download messages go to stderr
          logger.info(`Python stderr output: ${data.toString().trim()}`);
        });
        
        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            const errorMsg = errorString.includes('No module named') 
              ? `Python dependency missing: ${errorString}. Please install required packages with: pip install opencv-python mediapipe numpy`
              : `Python script failed: ${errorString}`;
            
            logger.error(`Python script exited with code ${code}: ${errorMsg}`);
            reject(new Error(errorMsg));
            return;
          }

          try {
            // Try to find the last line that contains a valid JSON
            const lines = dataString.trim().split('\n');
            let lastLine = '';
            
            for (let i = lines.length - 1; i >= 0; i--) {
              try {
                const trimmedLine = lines[i].trim();
                if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
                  JSON.parse(trimmedLine);
                  lastLine = trimmedLine;
                  break;
                }
              } catch (e) {
                // Skip this line
              }
            }
            
            if (!lastLine) {
              throw new Error('No valid JSON found in Python script output');
            }
            
            const result = JSON.parse(lastLine);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse Python script output: ${parseError.message}`));
          }
        });
      } catch (parseError) {
        reject(new Error(`Failed to parse dependency check output: ${parseError.message}`));
      }
    });
  });
};