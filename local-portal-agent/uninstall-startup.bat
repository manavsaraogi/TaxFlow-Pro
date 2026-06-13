@echo off
title Remove TaxFlow Portal Agent Auto Start
schtasks /delete /tn "TaxFlowPortalAgent" /f >nul 2>&1
echo TaxFlow Portal Agent removed from startup.
timeout /t 3
