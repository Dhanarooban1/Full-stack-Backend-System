# Intern Task: Full-stack Backend System for Keypoint & Image Capture using MediaPipe

A complete backend system that extracts keypoints from images using MediaPipe, stores data in SQL and NoSQL databases, and provides a comprehensive REST API for data management.


## Live Demo

The API is deployed and available at: [https://full-stack-backend-system.onrender.com](https://full-stack-backend-system.onrender.com)

## Features

- Image upload and processing with MediaPipe Pose
- Body keypoint extraction (33 keypoints)
- SQL database for keypoints storage (PostgreSQL via Prisma)
- NoSQL database for image storage (MongoDB)
- Daily backup via Cron job (runs at 11:59 PM)
- Email notifications with backup status

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- Python 3.7+ with pip
- PostgreSQL database
- MongoDB database
- SendGrid account (or SMTP credentials for email notifications)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Backend
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

### Python Dependencies

The system requires Python with MediaPipe and OpenCV for pose detection. Install the dependencies:

```bash
# Using the provided script (Windows)
install-python-deps.bat

# Manual installation
cd python-scripts
pip install -r requirements.txt
```

If you encounter network issues when installing packages, you can try these alternatives:

1. **Download wheel files directly**:
   - Visit https://www.lfd.uci.edu/~gohlke/pythonlibs/
   - Download appropriate wheel files for your Python version:
     - opencv_python
     - numpy
   - Install them with: `pip install path\to\wheelfile.whl`

2. **Use Anaconda/Miniconda** (if installed):
   ```bash
   conda install -c conda-forge opencv mediapipe numpy pillow
   ```

3. **Verify installation**:
   ```bash
   python -c "import cv2; import mediapipe; import numpy; print('Success!')"
   ```

4. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   
   # Database Configuration
   DATABASE_URL=postgresql://username:password@localhost:5432/database_name
   MONGODB_URI=mongodb://localhost:27017/database_name
   
   # Email Configuration (SendGrid or SMTP)
   EMAIL_USER=your_email@example.com
   EMAIL_PASS=your_email_password
   EMAIL_HOST=smtp.example.com
   EMAIL_PORT=587
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_TO=recipient@example.com
   
   # Backup Configuration
   BACKUP_DIR=./backups
   ```

5. Initialize the database:
   ```bash
   npx prisma db push
   ```

6. Start the server:
   ```bash
   npm start
   ```

## API Usage

### Upload Image and Extract Pose
- **Endpoint**: `POST /api/pose/upload`
- **Content-Type**: `multipart/form-data`
- **Body**: form-data with key 'image' and file as value
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "imageId": "5f8a7b6c5d4e3f2a1b0c9d8e",
      "keypoints": [
        {"x": 0.42, "y": 0.38, "z": 0.05, "visibility": 0.98, "name": "nose"},
        // ... other keypoints
      ],
      "createdAt": "2025-06-17T15:30:45.123Z"
    }
  }
  ```

### Get Pose Data
- **Endpoint**: `GET /api/pose/:id`
- **Parameters**: `id` - UUID of the pose data
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "imageId": "5f8a7b6c5d4e3f2a1b0c9d8e",
      "keypoints": [
        {"x": 0.42, "y": 0.38, "z": 0.05, "visibility": 0.98, "name": "nose"},
        // ... other keypoints
      ],
      "createdAt": "2025-06-17T15:30:45.123Z"
    }
  }
  ```

### Get All Pose Data
- **Endpoint**: `GET /api/pose`
- **Query Parameters**: 
  - `page` (default: 1) - Page number
  - `limit` (default: 10) - Items per page
- **Response**: 
  ```json
  {
    "success": true,
    "data": [
      // Array of pose data objects
    ],
    "pagination": {
      "total": 42,
      "page": 1,
      "limit": 10,
      "pages": 5
    }
  }
  ```
- **Response**: JSON array of pose data with pagination

### Update Pose Data
- **Endpoint**: `PUT /api/pose/:id`
- **Parameters**: `id` - UUID of the pose data
- **Content-Type**: `application/json`
- **Body**:
  ```json
  {
    "keypoints": [
      {"x": 0.42, "y": 0.38, "z": 0.05, "visibility": 0.98, "name": "nose"},
      // ... other keypoints
    ]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "imageId": "5f8a7b6c5d4e3f2a1b0c9d8e",
      "keypoints": [
        // Updated keypoints
      ],
      "updatedAt": "2025-06-17T16:45:22.456Z"
    }
  }
  ```

### Delete Pose Data
- **Endpoint**: `DELETE /api/pose/:id`
- **Parameters**: `id` - UUID of the pose data
- **Response**:
  ```json
  {
    "success": true,
    "message": "Pose data deleted successfully"
  }
  ```

### Get Image
- **Endpoint**: `GET /api/pose/image/:id`
- **Parameters**: `id` - MongoDB ID of the image
- **Response**: Image file (binary data)

### Get Processing Logs
- **Endpoint**: `GET /api/pose/logs`
- **Query Parameters**:
  - `page` (default: 1) - Page number
  - `limit` (default: 20) - Items per page
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "timestamp": "2025-06-17T14:30:22.123Z",
        "action": "EXTRACT_POSE",
        "status": "SUCCESS",
        "message": "Successfully extracted pose from image",
        "imageId": "5f8a7b6c5d4e3f2a1b0c9d8e"
      }
      // ... other log entries
    ],
    "pagination": {
      "total": 156,
      "page": 1,
      "limit": 20,
      "pages": 8
    }
  }
  ```

### Download Backup
- **Endpoint**: `GET /api/pose/backup/:filename`
- **Parameters**: `filename` - Name of the backup file (e.g., `2025-06-17-backup.zip`)
- **Response**: ZIP file download (binary data)

## Cron Configuration

The system uses node-cron to schedule daily backups at 11:59 PM. The configuration is defined in `src/services/cronService.js`.

### Backup Process

The cron job performs the following steps:
1. Exports the PostgreSQL database with keypoints data
2. Exports the MongoDB database with image data
3. Creates a ZIP file in the `/backups` directory with format: `yyyy-mm-dd-backup.zip`
4. Sends an email notification with backup status

### Cron Schedule Format

```javascript
// Format: '* * * * *' (minute hour day-of-month month day-of-week)
// Current schedule: 11:59 PM daily
cron.schedule('59 23 * * *', backupFunction);
```

### Manual Backup

You can trigger a manual backup by calling the API endpoint:

```
POST /api/pose/backup/manual
```

Response:
```json
{
  "success": true,
  "message": "Manual backup initiated",
  "backupFile": "2025-06-17-manual-backup.zip"
}
```

### Email Notification

After each backup, an email is sent to the configured recipient with:
- Subject: "Daily DB Backup - 2025-06-17"
- Body: Success/failure message
- Attachment: Backup ZIP file (or download link if file is large)

## Troubleshooting

### "Python script failed" Error

If you encounter an error like "Error in uploadImage: Python script failed", follow these steps:

1. Make sure you have installed the required Python dependencies:
   ```bash
   # On Windows
   install-python-deps.bat
   
   # Manual installation
   pip install opencv-python==4.8.1.78 mediapipe==0.10.7 numpy==1.24.3 Pillow==10.0.1
   ```

2. Verify the installation by running:
   ```bash
   python -c "import cv2; import mediapipe; import numpy; from PIL import Image; print('All dependencies successfully installed!')"
   ```

3. If you encounter network issues during installation, try these alternatives:
   - Download wheel files from: https://www.lfd.uci.edu/~gohlke/pythonlibs/
   - If using Anaconda/Miniconda: `conda install -c conda-forge opencv mediapipe numpy pillow`

4. If the problem persists, check the logs for specific error messages:
   ```bash
   cat logs/error.log
   ```

### Common Python Dependency Issues

- **ModuleNotFoundError: No module named 'cv2'** - OpenCV is not installed or not in your Python path
- **ModuleNotFoundError: No module named 'mediapipe'** - MediaPipe is not installed
- **ImportError: DLL load failed** - Missing Visual C++ Redistributable on Windows
  (Download from: https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)

## Screenshots of Postman Results

### 1. Upload Image and Extract Pose

*Description: POST request to `/api/pose/upload` with image file uploaded through form-data*

![image](https://github.com/user-attachments/assets/dd7c0af3-7d55-452e-b566-8ba8fde86822)

### 2. Get Pose Data by ID

*Description: GET request to `/api/pose/:id` showing the extracted keypoints*

![alt text](image.png)

### 3. Get All Pose Data with Pagination

*Description: GET request to `/api/pose?page=1&limit=10` showing paginated results*

![alt text](image-1.png)

### 4. Download Backup File

*Description: GET request to `/api/pose/backup/:filename` initiating a backup file download*
[text](<../../../../../Downloads/backup-2025-06-17 (1).zip>)
### 5. Successful Backup Email Notification

*Description: Screenshot of the email received after a successful backup*
![alt text](<Screenshot 2025-06-17 190355.png>)
![alt text](<Screenshot 2025-06-17 190148.png>)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- MediaPipe team for their excellent pose detection model
- Node.js and Express.js communities
- PostgreSQL and MongoDB teams
