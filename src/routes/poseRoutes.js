import express from 'express';
import {
  uploadImage,
  getPoseData,
  getAllPoseData,
  updatePoseData,
  deletePoseData,
  getImage,
  downloadBackup,
  getProcessingLogs
} from '../controllers/poseController.js';
import upload from '../config/multer.js';

const router = express.Router();

// Upload image and extract pose data
router.post('/upload', upload.single('image'), uploadImage);

// Get all pose data with pagination
router.get('/', getAllPoseData);

// Get processing logs
router.get('/logs', getProcessingLogs);

// Get image file
router.get('/image/:id', getImage);

// Download backup
router.get('/backup/:filename', downloadBackup);

// Get specific pose data - make sure this route is defined after all other routes with specific paths
// to prevent route conflicts
router.get('/:id', getPoseData);

// Update pose data
router.put('/:id', updatePoseData);

// Delete pose data
router.delete('/:id', deletePoseData);

export default router;