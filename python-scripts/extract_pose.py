import json
import sys
import traceback
import os
from pathlib import Path

# Suppress MediaPipe download messages by redirecting them to stderr
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

try:
    import cv2
    import mediapipe as mp
    import numpy as np
    DEPENDENCIES_AVAILABLE = True
except ImportError as e:
    DEPENDENCIES_AVAILABLE = False
    error_message = {
        "success": False,
        "error": f"Missing Python dependency: {str(e)}. Please install required packages with: pip install opencv-python mediapipe numpy",
        "keypoints": [],
        "confidence": 0.0
    }
    print(json.dumps(error_message))
    sys.exit(1)

class PoseExtractor:
    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=True,
            model_complexity=2,
            enable_segmentation=False,
            min_detection_confidence=0.5
        )
        self.mp_drawing = mp.solutions.drawing_utils
    
    def extract_keypoints(self, image_path):
        """
        Extract pose keypoints from image
        Returns: dict with keypoints, confidence, and metadata
        """
        try:
            # Check if file exists
            if not Path(image_path).is_file():
                return {
                    "success": False,
                    "error": f"Image file not found: {image_path}",
                    "keypoints": [],
                    "confidence": 0.0
                }
                
            # Read image
            image = cv2.imread(image_path)
            if image is None:
                return {
                    "success": False,
                    "error": f"Could not read image file: {image_path}",
                    "keypoints": [],
                    "confidence": 0.0
                }
            
            # Convert BGR to RGB
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Process image
            results = self.pose.process(image_rgb)
            
            if not results.pose_landmarks:
                return {
                    "success": False,
                    "error": "No pose detected in image",
                    "keypoints": [],
                    "confidence": 0.0
                }
            
            # Extract keypoints
            keypoints = []
            total_confidence = 0.0
            
            for idx, landmark in enumerate(results.pose_landmarks.landmark):
                keypoint = {
                    "id": idx,
                    "name": self._get_landmark_name(idx),
                    "x": float(landmark.x),
                    "y": float(landmark.y),
                    "z": float(landmark.z),
                    "visibility": float(landmark.visibility)
                }
                keypoints.append(keypoint)
                total_confidence += landmark.visibility
            
            # Calculate average confidence
            avg_confidence = total_confidence / len(keypoints) if keypoints else 0.0
            
            # Get image dimensions
            height, width = image.shape[:2]
            
            return {
                "success": True,
                "keypoints": keypoints,
                "keypoints_count": len(keypoints),
                "confidence": float(avg_confidence),
                "image_dimensions": {
                    "width": width,
                    "height": height
                },
                "pose_detected": True
            }
            
        except Exception as e:
            error_traceback = traceback.format_exc()
            return {
                "success": False,
                "error": str(e),
                "traceback": error_traceback,
                "keypoints": [],
                "confidence": 0.0
            }
    
    def _get_landmark_name(self, idx):
        """Get landmark name by index"""
        landmark_names = [
            "NOSE", "LEFT_EYE_INNER", "LEFT_EYE", "LEFT_EYE_OUTER",
            "RIGHT_EYE_INNER", "RIGHT_EYE", "RIGHT_EYE_OUTER",
            "LEFT_EAR", "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT",
            "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW",
            "LEFT_WRIST", "RIGHT_WRIST", "LEFT_PINKY", "RIGHT_PINKY",
            "LEFT_INDEX", "RIGHT_INDEX", "LEFT_THUMB", "RIGHT_THUMB",
            "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE",
            "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_HEEL", "RIGHT_HEEL",
            "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX"
        ]
        return landmark_names[idx] if idx < len(landmark_names) else f"LANDMARK_{idx}"

def main():
    try:
        if len(sys.argv) < 2:
            print(json.dumps({
                "success": False,
                "error": "No image path provided. Usage: python extract_pose.py <image_path>",
                "keypoints": [],
                "confidence": 0.0
            }))
            sys.exit(1)
        
        image_path = sys.argv[1]
        extractor = PoseExtractor()
        result = extractor.extract_keypoints(image_path)
        
        # Output JSON result
        print(json.dumps(result))
    except Exception as e:
        # Catch any unexpected errors
        print(json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "traceback": traceback.format_exc(),
            "keypoints": [],
            "confidence": 0.0
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
