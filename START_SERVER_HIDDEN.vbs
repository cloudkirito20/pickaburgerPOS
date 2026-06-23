Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
WshShell.CurrentDirectory = FSO.GetParentFolderName(WScript.ScriptFullName)

' Starts the server hidden. server.py will also open the laptop browser automatically.
WshShell.Run "pythonw.exe server.py", 0, False

WScript.Sleep 2500
WshShell.Run "http://localhost:8080", 1, False

MsgBox "Pick'a Burger POS is running." & vbCrLf & vbCrLf & _
       "Laptop browser opened automatically:" & vbCrLf & _
       "http://localhost:8080" & vbCrLf & vbCrLf & _
       "For iPhone/iPad, run START_SERVER.bat instead so the CMD window can show the copyable local network URL.", _
       vbInformation, "Server Started"
