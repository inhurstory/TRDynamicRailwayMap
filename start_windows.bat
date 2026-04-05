@echo off
setlocal

set PORT=8000
set URL=http://localhost:%PORT%/

cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    py -m http.server %PORT%
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    python -m http.server %PORT%
    goto :eof
)

echo Python not found. Install Python first, then run this file again.
pause
