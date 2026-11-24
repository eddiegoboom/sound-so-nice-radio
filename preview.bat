@echo off
rem Double-click to preview the site locally at http://localhost:8000
cd /d "%~dp0"
echo Refreshing episode list from the archive...
python scripts\fetch_episodes.py
cd public
start "" http://localhost:8000
echo.
echo Serving at http://localhost:8000   (add /?admin to the address for the admin view)
echo Press Ctrl+C in this window to stop.
python -m http.server 8000
