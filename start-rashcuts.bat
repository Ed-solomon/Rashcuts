@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Dependencies are not installed yet. Run setup-mysql.bat first.
  exit /b 1
)
if not exist .env (
  copy /Y .env.example .env >nul
  echo Created .env. Update it with your MySQL password, then run this file again.
  exit /b 1
)
call npm start
