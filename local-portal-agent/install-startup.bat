@echo off
title Install TaxFlow Portal Agent - Auto Start
echo Installing TaxFlow Portal Agent to run at Windows startup...
echo.

cd /d "%~dp0"

:: Kill any existing task with same name
schtasks /delete /tn "TaxFlowPortalAgent" /f >nul 2>&1

:: Create scheduled task — runs at login, hidden window, auto-restart on failure
schtasks /create /tn "TaxFlowPortalAgent" ^
  /tr "cmd /c \"cd /d \"%~dp0\" && node index.js >> \"%~dp0agent.log\" 2>&1\"" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /f

if errorlevel 1 (
    echo ERROR: Failed to create scheduled task.
    pause
    exit /b 1
)

echo.
echo SUCCESS! TaxFlow Portal Agent will now start automatically when Windows starts.
echo.
echo Starting it now for this session...
start "TaxFlow Portal Agent" /min cmd /c "cd /d "%~dp0" && node index.js"
echo.
echo Agent started in background. You can close this window.
timeout /t 4
