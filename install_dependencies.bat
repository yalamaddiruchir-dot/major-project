@echo off
TITLE Digital Learning Platform - Install Dependencies Only
CLS

echo ===================================================
echo   INSTALLING DEPENDENCIES (NO DATA LOSS)
echo ===================================================
echo.
echo This script will install the necessary software libraries 
echo for the project to run.
echo.
echo [!] It will NOT delete or reset your database.
echo.

echo [1/2] Installing dependencies...
call npm run install-all > setup_log.txt 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Installation failed. Check setup_log.txt.
    pause
    exit /b
)
echo [OK] Dependencies installed.

echo.
echo [2/2] Setup Complete!
echo You can now use 'start.bat' to run the application.
echo.
pause
