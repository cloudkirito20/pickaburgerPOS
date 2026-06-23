@echo off
cd /d "%~dp0"
start "Picka POS Server" /min python server.py
exit
