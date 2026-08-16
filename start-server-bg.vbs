Set WshShell = CreateObject("WScript.Shell")
' Jalankan start-server.bat dengan argumen "dev" agar selalu otomatis update/refresh (HMR) 
WshShell.Run """E:\sikanda\start-server.bat"" dev", 0, False
