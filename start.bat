@echo off
title KisanQueue - Smart Farmer Procurement System
cd /d "%~dp0"
echo ========================================================
echo  ?? KisanQueue | Smart Farmer Procurement System
echo ========================================================
echo.
echo Starting backend server on http://127.0.0.1:8000 ...
echo.
python run.py
pause
