$logPath = "D:\Genlayer\SourceCredNews\frontend\dev-server.log"
"Starting SourceCred News dev server at $(Get-Date -Format o)" | Set-Content -LiteralPath $logPath
Set-Location -LiteralPath "D:\Genlayer\SourceCredNews\frontend"
& "C:\Program Files\nodejs\npm.cmd" run dev -- -p 3034 *>&1 | Tee-Object -FilePath $logPath -Append
