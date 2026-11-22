@echo off
rem One-command local demo: serves dist\ on http://localhost:8080 and opens the browser.
cd /d "%~dp0"
set DIR=dist
if not exist "%DIR%\index.html" set DIR=.
start "" http://localhost:8080/
where python >nul 2>nul && (python -m http.server 8080 -d "%DIR%" & goto :eof)
where py >nul 2>nul && (py -3 -m http.server 8080 -d "%DIR%" & goto :eof)
where npx >nul 2>nul && (npx --yes serve -l 8080 "%DIR%" & goto :eof)
echo Install Python 3 or Node.js to run the demo.
pause
