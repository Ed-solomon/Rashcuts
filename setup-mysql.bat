@echo off
setlocal
cd /d "%~dp0"

echo === Rashcuts local setup ===
where node >nul 2>&1 || (echo Node.js 20+ is required.& exit /b 1)
where npm >nul 2>&1 || (echo npm is required.& exit /b 1)

if not exist .env (
  copy /Y .env.example .env >nul
  echo Created .env from .env.example. Update DB_PASSWORD if your MySQL root account has a password.
)

echo Installing Node dependencies...
npm install || exit /b 1

echo Initialising MySQL database...
npm run db:init || exit /b 1

echo.
set /p ADMIN_EMAIL=Enter the admin email: 
if "%ADMIN_EMAIL%"=="" (echo Admin email is required.& exit /b 1)
call npm run admin:create -- --email "%ADMIN_EMAIL%" || exit /b 1

echo.
echo Setup complete. Start the site with start-rashcuts.bat or npm start.
pause
