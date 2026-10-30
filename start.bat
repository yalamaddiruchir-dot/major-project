@echo off
TITLE Digital Learning Platform - START
CLS

echo ===================================================
echo   DIGITAL LEARNING PLATFORM - STARTING SERVER...
echo ===================================================
echo.
echo NOTE: This script does NOT reset your database. 
echo       Your data is safe.
echo.
echo If you need to reinstall or reset the project, 
echo please use 'install_and_reset.bat' instead.
echo.
echo Starting application...
echo       - Frontend: http://localhost:3000
echo       - Backend:  http://localhost:5000
echo.
echo Press Ctrl+C to stop the servers.
echo.

npm run dev
pause
