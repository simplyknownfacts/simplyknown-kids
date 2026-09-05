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
REM Codex 0905-2, HIGH: scripts/promote.mjs honors PROMOTE_WRANGLER_CMD / PROMOTE_CF_API_BASE /
REM PROMOTE_VERSION_CHECK_HOSTS / PROMOTE_VERIFY_POLL_MS as test-only overrides, now gated behind
REM PROMOTE_ALLOW_OVERRIDES=1. This is the real production door (D8: one door to prod) -- clear
REM every PROMOTE_* variable a leftover test shell might have left behind before the script ever
REM runs, so a contaminated environment can never fake a real release.
for /f "delims== tokens=1" %%V in ('set PROMOTE_ 2^>nul') do set "%%V="
call npm run promote
echo.
echo   (Window stays open so you can read the result.)
pause
