$env:TIKTOKEN_CACHE_DIR = 'C:\Users\93630\Documents\ChatGPT\ONEapi 2\tiktoken_cache'
Get-Content 'C:\Users\93630\Documents\ChatGPT\ONEapi 2\.env' | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
  Set-Item -Path "Env:$name" -Value $value
}
$p = Start-Process -FilePath 'C:\Users\93630\Documents\ChatGPT\ONEapi 2\one-api.exe' -WindowStyle Hidden -PassThru
Write-Host "started pid=$($p.Id)"
