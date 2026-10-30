@echo off
TITLE Digital Learning Platform - Auto Setup & Run
CLS

echo ===================================================
echo   DIGITAL LEARNING PLATFORM - ONE CLICK SETUP
echo ===================================================
echo.
echo [1/4] Installing dependencies (Server & Client)...
echo       This may take a few minutes. Please wait.
echo       Before first use, configure server\.env from server\env.template.
call npm run install-all > setup_log.txt 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Installation failed. Check setup_log.txt for details.
    pause
    exit /b
)
echo [OK] Dependencies installed.

echo.
echo [2/4] Initializing Database (SQLite)...
cd server
call npm run migrate > ../db_log.txt 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Database migration failed. Check db_log.txt.
    cd ..
    pause
    exit /b
)
echo [OK] Database created.

echo.
echo [3/4] Seeding Sample Data...
echo WARNING: this removes all existing users, courses, lessons and progress.
echo Configure SEED_ADMIN_PASSWORD, SEED_TEACHER_PASSWORD and SEED_STUDENT_PASSWORD
echo (each at least 12 characters) in server\.env before continuing.
set /p CONFIRM_RESET=Type YES to permanently reset and seed the database: 
IF /I NOT "%CONFIRM_RESET%"=="YES" (
    echo Reset cancelled. Existing database was not seeded.
    cd ..
    pause
    exit /b 1
)
set CONFIRM_RESET=YES
call npm run seed >> ../db_log.txt 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Seeding failed. Check db_log.txt and server\.env.
    cd ..
    pause
    exit /b 1
)
echo [OK] Sample data populated.
cd ..

echo.
echo [4/4] Starting Application...
echo       - Frontend: http://localhost:3000
echo       - Backend:  http://localhost:5000
echo.
echo Press Ctrl+C to stop the servers.
echo.

npm run dev
pause
