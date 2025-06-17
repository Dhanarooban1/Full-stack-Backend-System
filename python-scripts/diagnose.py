import json
import sys

# Check for required dependencies
dependencies = {
    "cv2": False,
    "mediapipe": False,
    "numpy": False
}

try:
    import cv2
    dependencies["cv2"] = True
except ImportError:
    pass

try:
    import mediapipe
    dependencies["mediapipe"] = True
except ImportError:
    pass

try:
    import numpy
    dependencies["numpy"] = True
except ImportError:
    pass

# Output diagnostic information
result = {
    "python_version": sys.version,
    "dependencies": dependencies,
    "all_dependencies_available": all(dependencies.values())
}

print(json.dumps(result))
