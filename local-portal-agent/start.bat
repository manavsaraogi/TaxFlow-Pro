@echo off
title TaxFlow Portal Agent
echo ========================================
echo  TaxFlow Pro - Portal Agent
echo ========================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto no_node

node --version
echo.

if exist node_modules goto check_playwright
echo Installing dependencies, please wait...
call npm install
if errorlevel 1 goto npm_error

:check_playwright
if exist node_modules\playwright goto run_agent
echo Installing Playwright browsers...
call npx playwright install chromium
echo.

:run_agent
echo ========================================
echo  Starting agent... (auto-restarts on crash)
echo  Press Ctrl+C to stop permanently.
echo ========================================
echo.

:restart_loop
:: Kill any process using port 3001 before each start
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

node index.js
echo.
echo [%time%] Agent stopped. Restarting in 3 seconds... (Ctrl+C to exit)
timeout /t 3 /nobreak >nul
goto restart_loop

:no_node
echo ERROR: Node.js not found. Install from https://nodejs.org
pause
exit /b 1

:npm_error
echo ERROR: npm install failed. Check your internet connection.
pause
exit /b 1
