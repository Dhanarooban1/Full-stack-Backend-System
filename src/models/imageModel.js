import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  poseDataId: {
    type: String,  // Changed from Number to String to match Prisma cuid()
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

const Image = mongoose.model('Image', imageSchema);

export default Image;