@echo off
echo Stopping Pick'a Burger POS Server on port 8080...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do taskkill /PID %%a /F
echo Done.
pause
