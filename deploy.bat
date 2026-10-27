@echo off
cd /d "%~dp0"
echo [Choir] Deploying... > deploy.log
call npm run build:index >> deploy.log 2>&1
if errorlevel 1 goto done
call npx gh-pages -d public -u "leeyohan-sys <leeyohwan1@gmail.com>" >> deploy.log 2>&1
:done
echo EXIT_CODE=%errorlevel% >> deploy.log
type deploy.log
pause
