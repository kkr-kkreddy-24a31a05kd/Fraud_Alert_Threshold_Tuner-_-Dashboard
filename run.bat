@echo off
TITLE Fraud Alert Threshold Tuner Dashboard
COLOR 0A

echo ================================================
echo    Fraud Alert Threshold Tuner Dashboard
echo ================================================
echo.
echo Starting the application...
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.8 or higher from https://python.org
    pause
    exit /b 1
)

echo [OK] Python found!

REM Check if requirements are installed
echo.
echo Checking dependencies...
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Dependencies not found. Installing now...
    echo.
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully!
) else (
    echo [OK] Dependencies already installed!
)

REM Create necessary directories if they don't exist
echo.
echo Setting up directories...
if not exist "templates" mkdir templates
if not exist "static\css" mkdir static\css
if not exist "static\js" mkdir static\js
if not exist "models" mkdir models
echo [OK] Directories ready!

REM Start the Flask application
echo.
echo ================================================
echo    Starting Flask Server...
echo ================================================
echo.
echo The dashboard will be available at:
echo http://localhost:5000
echo.
echo Press CTRL+C to stop the server
echo.

python app.py

pause
