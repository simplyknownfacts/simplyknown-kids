@echo off
REM promote-kids.bat - the ONE door to production for Kids.
REM Scott's rule: dev (kids1) is free, prod requires this button + typing the version number.
title Promote KIDS to PRODUCTION
cd /d "%~dp0"
echo.
echo   PROMOTE KIDS TO PRODUCTION
echo   You will be shown what is about to ship and asked to type the version.
echo   Anything else - including just pressing Enter - cancels safely.
echo.
call npm run promote
echo.
echo   (Window stays open so you can read the result.)
pause
