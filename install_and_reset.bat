@echo off
echo ===================================================
echo Digital Learning Platform - Safe Setup Utility
echo ===================================================
echo.

echo [1/4] Installing root dependencies...
call npm install
if %errorlevel% neq 0 exit /b %errorlevel%

echo [2/4] Installing server dependencies...
cd server
call npm install
if %errorlevel% neq 0 exit /b %errorlevel%

echo [3/4] Running non-destructive database migrations & starter seed...
call npm run migrate
if %errorlevel% neq 0 exit /b %errorlevel%
call npm run seed
cd ..

echo [4/4] Installing client dependencies...
cd client
call npm install
if %errorlevel% neq 0 exit /b %errorlevel%
cd ..

echo.
echo ===================================================
echo Setup Completed Successfully (Existing Data Preserved)
echo Run start.bat or "npm run dev" to launch the platform.
echo ===================================================
pause
