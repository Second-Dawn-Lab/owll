@echo off
title Owl-L (dev)
cd /d "%~dp0"

where pnpm >nul 2>nul
set CARGO_INCREMENTAL=0
if errorlevel 1 (
    echo pnpm not found. Run: npm install -g pnpm
    pause
    exit /b 1
)
where cmake >nul 2>nul
if errorlevel 1 (
    echo CMake not found. Install it: winget install Kitware.CMake
    pause
    exit /b 1
)
echo Starting Owl-L in dev mode...
pnpm tauri dev

echo.
echo Owl-L stopped.
pause