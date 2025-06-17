@echo off
echo ======================================
echo Installing Python dependencies for SmartanFittech
echo ======================================

:: Check if Python is installed
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH.
    echo Please install Python 3.8 or higher from https://www.python.org/downloads/
    echo and make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

:: Create virtual environment if it doesn't exist
if not exist "python-scripts\venv" (
    echo Creating Python virtual environment...
    python -m venv python-scripts\venv
    if %errorlevel% neq 0 (
        echo Failed to create virtual environment.
        echo Please make sure you have the venv module installed.
        pause
        exit /b 1
    )
)

:: Activate virtual environment and install dependencies
echo Activating virtual environment and installing dependencies...
call python-scripts\venv\Scripts\activate.bat
pip install -r python-scripts\requirements.txt

if %errorlevel% neq 0 (
    echo Failed to install dependencies.
    echo Please check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo Dependencies installed successfully!
echo You can now use the application.
echo.

pause
