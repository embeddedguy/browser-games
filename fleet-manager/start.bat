@echo off
cd /d "%~dp0"
echo ============================================
echo   Fleet Asset Manager
echo ============================================

if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  npm install
  if errorlevel 1 (
    echo ERROR: npm install failed. Is Node.js installed?
    echo Download Node.js 20 LTS from https://nodejs.org
    pause
    exit /b 1
  )
)

echo.
echo Server starting...
echo.
echo   Local:   http://localhost:3000
echo   Network: Check your IP with ipconfig ^(share with tablets^)
echo.
echo Press Ctrl+C to stop the server.
echo ============================================
node server.js
pause
