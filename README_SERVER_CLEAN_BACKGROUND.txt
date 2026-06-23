Picka POS Clean/Background Server

Files:
1. START_SERVER.bat
   - Starts the server normally, but hides API GET/POST logs.
   - Best for testing because errors are visible.

2. START_SERVER_BACKGROUND.bat
   - Starts the server minimized in the background.

3. START_SERVER_HIDDEN.vbs
   - Starts the server fully hidden using pythonw.exe.
   - Use only after testing START_SERVER.bat.

4. STOP_SERVER.bat
   - Stops the server running on port 8080.

Open on laptop:
http://localhost:8080

Phone/tablet:
Use the local network URL shown by START_SERVER.bat, usually like:
http://192.168.x.x:8080

Default logins:
Admin: admin / admin123
Cashier: cashier / cashier123


LOADER UPDATE:
The payment/loading modal now uses the Pick'a Burger logo animation instead of the spinning circle. Run START_SERVER.bat and open http://localhost:8080. Do not run this project with Vite/npm because this POS app uses the included Python SQLite server.
