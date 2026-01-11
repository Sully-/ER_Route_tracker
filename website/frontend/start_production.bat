@echo off
cd /d "%~dp0"
echo Building production version...
call npm run build
echo.
echo Copying tiles to dist folder...
xcopy /E /I /Y public\tiles dist\tiles
echo.
echo Starting preview server...
echo Server will be available at: http://localhost:4173/
echo Press Ctrl+C to stop.
echo.
npm run preview
pause

