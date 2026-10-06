# Corre una query en BigQuery via API REST desde PowerShell.
# gcloud obtiene el token pero su proceso no termina, asi que se lee de un
# archivo y se mata el proceso. Uso: powershell -File bqq.ps1 archivo.sql
param([string]$SqlFile)
# Camino rapido: refresca el token con las credenciales de usuario que gcloud ya
# guardo (adc.json), sin pasar por el Python empaquetado que se cuelga.
$adc = Get-ChildItem "$env:APPDATA\gcloud\legacy_credentials\*\adc.json" -ErrorAction SilentlyContinue | Select-Object -First 1
$token = $null
if ($adc) {
  $c = Get-Content $adc.FullName -Raw | ConvertFrom-Json
  try {
    $t = Invoke-RestMethod -Method Post -Uri "https://oauth2.googleapis.com/token" -TimeoutSec 30 -Body @{
      client_id = $c.client_id; client_secret = $c.client_secret; refresh_token = $c.refresh_token; grant_type = "refresh_token" }
    $token = $t.access_token
  } catch { Write-Warning "Refresh directo fallo: $($_.Exception.Message)" }
}
if (-not $token) {
$env:CLOUDSDK_PYTHON ="C:\Users\leonardoherrera_tuha\AppData\Local\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"
$env:PYTHONUNBUFFERED = "1"   # sin esto el token no llega al archivo hasta que gcloud sale
$gc ="C:\Users\leonardoherrera_tuha\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
New-Item -ItemType Directory -Force .bqtmp | Out-Null
$tokFile = Join-Path (Resolve-Path .bqtmp) "tok.txt"
Remove-Item $tokFile -ErrorAction SilentlyContinue
$p = Start-Process -FilePath $gc -ArgumentList "auth","print-access-token" -RedirectStandardOutput $tokFile -NoNewWindow -PassThru
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 500
  $raw = $null
  try { $raw = [IO.File]::ReadAllText($tokFile) } catch {}
  if ($raw -match 'ya29') { break }
}
Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
$token = $null
if ($raw) { $token = ($raw -split "`r?`n" | Where-Object { $_ -match '^ya29' } | Select-Object -First 1) }
if ($token) { $token = $token.Trim() }
}
if ($tokFile) { Remove-Item $tokFile -ErrorAction SilentlyContinue }
if (-not $token) { Write-Error "No se obtuvo token"; exit 1 }
$sql = [IO.File]::ReadAllText((Resolve-Path $SqlFile), [Text.Encoding]::UTF8)
$body = @{ query = $sql; useLegacySql = $false; timeoutMs = 180000; maxResults = 2000 } | ConvertTo-Json -Compress
try {
  $r = Invoke-RestMethod -Method Post -Uri "https://bigquery.googleapis.com/bigquery/v2/projects/papyrus-data-mx/queries" `
    -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 200
} catch {
  $msg = $_.ErrorDetails.Message
  if (-not $msg -and $_.Exception.Response) {
    $msg = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd()
  }
  if ($msg) { try { $msg = ($msg | ConvertFrom-Json).error.message } catch {} }
  Write-Output "ERROR: $msg"; exit 1
}
$cols = $r.schema.fields | ForEach-Object { $_.name }
($cols -join "|")
foreach ($row in $r.rows) { (($row.f | ForEach-Object { if ($null -eq $_.v) { "NULL" } else { $_.v } }) -join "|") }
