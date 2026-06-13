Set WShell = CreateObject("WScript.Shell")
WShell.CurrentDirectory = "C:\Client\Tools\ITR filing Software\TaxFlow Pro\local-portal-agent"
WShell.Run "cmd /c node index.js >> """ & WShell.CurrentDirectory & "\agent.log"" 2>&1", 0, False