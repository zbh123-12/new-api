$logDir = 'C:\Users\93630\Documents\ChatGPT\new-api\one-api-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location 'C:\Users\93630\Documents\ChatGPT\ONEapi 2'
$env:TIKTOKEN_CACHE_DIR = 'C:\Users\93630\Documents\ChatGPT\ONEapi 2\tiktoken_cache'
Get-Content .env | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
  Set-Item -Path "Env:$name" -Value $value
}
$p = Start-Process -FilePath '.\one-api.exe' -ArgumentList "--log-dir `"$logDir`"" -WindowStyle Hidden -PassThru
Write-Host "started pid=$($p.Id)"
