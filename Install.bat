@echo off
TITLE Install Fraud Dashboard Dependencies
COLOR 0E

echo ================================================
echo    Installing Dependencies
echo ================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed!
    echo Please install Python 3.8 or higher from https://python.org
    pause
    exit /b 1
)

echo Python version:
python --version
echo.

echo Installing required packages...
echo This may take a few minutes...
echo.

pip install --upgrade pip
pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo [ERROR] Installation failed!
    echo Please try running as Administrator
    pause
    exit /b 1
)

echo.
echo ================================================
echo    Installation Complete!
echo ================================================
echo.
echo You can now run the dashboard using run.bat
echo.
pause
