@echo off
title Owl-L (dev)
cd /d "%~dp0"

where pnpm >nul 2>nul
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

rem One dev build at a time: two of them fight over target\debug\owll.pdb ("LNK1201 error writing to program database"),
rem over port 1420 and over the keyboard hook.
tasklist /fi "imagename eq owll.exe" 2>nul | find /i "owll.exe" >nul
if not errorlevel 1 (
    echo Owl-L is already running. Close it first, then start this again.
    pause
    exit /b 1
)
netstat -ano | findstr /r /c:":1420 .*LISTENING" >nul
if not errorlevel 1 (
    echo Port 1420 is in use: another dev build or a stray node process is running. Close it first.
    pause
    exit /b 1
)

rem No incremental compilation: stale incremental data crashed rustc on this project before.
set CARGO_INCREMENTAL=0
rem The compiler is built with opt-level 3 dependencies and needs a lot of memory. When the system runs low on memory
rem (commit limit), rustc dies with 0xc0000409 and cargo reports "can't find crate for tauri_utils". Two jobs at a time
rem keep it safe; raise it with CARGO_BUILD_JOBS if you have memory to spare.
if not defined CARGO_BUILD_JOBS set CARGO_BUILD_JOBS=2

echo Starting Owl-L in dev mode...
pnpm tauri dev

echo.
echo Owl-L stopped.
pause
