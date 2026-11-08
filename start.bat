@echo off
chcp 65001 >nul
title SIM Desk
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (set PY=py -3) else (set PY=python)

if not exist ".venv\Scripts\python.exe" (
  echo Premiere installation... / التثبيت الأول...
  %PY% -m venv .venv || (echo Installez Python 3.10+ depuis python.org ^(cochez "Add to PATH"^) & pause & exit /b)
)
if not exist ".venv\installed.flag" (
  ".venv\Scripts\python.exe" -m pip install --upgrade pip -q
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt -q || (echo Echec de l'installation - verifiez Internet & pause & exit /b)
  echo ok> ".venv\installed.flag"
)

echo.
echo  SIM Desk demarre sur http://localhost:8765
echo  Ne fermez pas cette fenetre / لا تغلق هذه النافذة
echo.
".venv\Scripts\python.exe" run.py
pause
