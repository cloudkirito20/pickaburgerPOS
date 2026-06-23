@echo off
title Pick'a Burger POS Server - Copy iPhone URL from this CMD
cd /d "%~dp0"
cls
echo ============================================================
echo  Pick'a Burger POS Server
echo ============================================================
echo.
echo The server will start below.
echo.
echo The laptop browser will open automatically.
echo For iPhone/iPad: copy the IPHONE / IPAD URL shown below
echo into Safari or Chrome on the phone.
echo.
echo Note: the iPhone/iPad must be on the same Wi-Fi as this laptop.
echo.
echo ============================================================
echo.
python server.py
echo.
echo Server stopped.
pause
