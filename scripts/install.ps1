<#
School Scheduler — installer for Windows 10/11 (PowerShell, run as a normal user).

What it does (idempotent — run it again to update):
  1. Node.js 20 LTS and PostgreSQL 16 via winget if they are missing
  2. a PostgreSQL role + database (defaults: scheduler / scheduler)
  3. .env with DATABASE_URL (kept if it already exists)
  4. npm install, prisma db push + generate, production build

Usage (from the project folder):
  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
  powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -DbPassword secret
  powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -DbUser sms_user -PostgresPassword <postgres superuser pw>

Then:  npm start   →  http://localhost:3000       (or: npm run dev for development)
#>
param(
  [string]$DbUser = "scheduler",
  [string]$DbName = "scheduler",
  [string]$DbHost = "localhost",
  [int]$DbPort = 5432,
  [string]$DbPassword = "",
  # Password of the 'postgres' superuser (set during the PostgreSQL install); asked if needed.
  [string]$PostgresPassword = ""
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$AppDir = (Get-Location).Path

function Say($msg)  { Write-Host "`n==> $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "!!  $msg" -ForegroundColor Yellow }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

# ── 1. Node.js 20+ ────────────────────────────────────────────────────────────
$needNode = $true
if (Get-Command node -ErrorAction SilentlyContinue) {
  $major = [int]((node -v) -replace "^v(\d+).*", '$1')
  if ($major -ge 20) { $needNode = $false }
}
if ($needNode) {
  Say "Installing Node.js 20 LTS"
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
} else { Say "Node.js $(node -v) found" }

# ── 2. PostgreSQL ─────────────────────────────────────────────────────────────
$pgBin = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $pgBin -and -not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Say "Installing PostgreSQL 16 (the installer asks for a password for the 'postgres' superuser — remember it)"
  winget install --id PostgreSQL.PostgreSQL.16 -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
  $pgBin = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" | Sort-Object FullName -Descending | Select-Object -First 1
}
if ($pgBin) { $env:Path = "$($pgBin.DirectoryName);$env:Path" }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw "psql not found — add C:\Program Files\PostgreSQL\<ver>\bin to PATH and rerun" }
Get-Service postgresql* -ErrorAction SilentlyContinue | Where-Object Status -ne "Running" | Start-Service
Say "PostgreSQL $((psql --version) -replace '^psql \(PostgreSQL\) ','') running"

# ── 3. Role + database ────────────────────────────────────────────────────────
$envFile = Join-Path $AppDir ".env"
if ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^DATABASE_URL=' -Quiet)) {
  Say ".env exists — keeping its DATABASE_URL"
  $url = (Select-String -Path $envFile -Pattern '^DATABASE_URL="?([^"]*)"?' | Select-Object -First 1).Matches[0].Groups[1].Value
  if ($url -match '^[a-z]+://([^:]+):([^@]*)@[^/]+/([^/?]+)') { $DbUser = $Matches[1]; $DbPassword = $Matches[2]; $DbName = $Matches[3] }
} else {
  if (-not $DbPassword) {
    $sec = Read-Host -AsSecureString "Password for PostgreSQL role '$DbUser' (new or existing)"
    $DbPassword = [System.Net.NetworkCredential]::new("", $sec).Password
    if (-not $DbPassword) { throw "a password is required" }
  }
  Set-Content -Path $envFile -Value "DATABASE_URL=`"postgresql://$DbUser`:$DbPassword@$DbHost`:$DbPort/$DbName`"" -Encoding ascii
  Say "Wrote .env"
}

if (-not $PostgresPassword) {
  $sec = Read-Host -AsSecureString "Password of the 'postgres' superuser (to create the role/database)"
  $PostgresPassword = [System.Net.NetworkCredential]::new("", $sec).Password
}
$env:PGPASSWORD = $PostgresPassword
Say "Ensuring role '$DbUser' and database '$DbName'"
$roleSql = @"
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'u', :'p') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'u') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'u', :'p') \gexec
"@
$roleSql | psql -h $DbHost -p $DbPort -U postgres -d postgres -v ON_ERROR_STOP=1 -v u="$DbUser" -v p="$DbPassword"
if ($LASTEXITCODE -ne 0) { throw "could not create/update the role" }
$dbSql = @"
SELECT format('CREATE DATABASE %I OWNER %I', :'d', :'u') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'d') \gexec
"@
$dbSql | psql -h $DbHost -p $DbPort -U postgres -d postgres -v ON_ERROR_STOP=1 -v d="$DbName" -v u="$DbUser"
if ($LASTEXITCODE -ne 0) { throw "could not create the database" }
Remove-Item Env:PGPASSWORD

# ── 4. App ────────────────────────────────────────────────────────────────────
Say "Installing dependencies"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Say "Applying database schema"
npx prisma db push
if ($LASTEXITCODE -ne 0) { throw "prisma db push failed" }
npx prisma generate
if (Test-Path .next) { Remove-Item -Recurse -Force .next }

Say "Building"
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

# ── 5. Solver (Python + OR-Tools) ────────────────────────────────────────────
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Say "Installing Python 3.12"
  winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
}
Say "Installing the solver (Python venv)"
python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw "python -m venv failed" }
.\.venv\Scripts\pip install -q -r solver\requirements.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

Write-Host @"

Done. Start the app with:

    cd "$AppDir"; npm start        # production, http://localhost:3000
    cd "$AppDir"; npm run dev      # development with hot reload

Load the school's Orologio data:
    npm run orologio:json -- "26-27 (1)" data\orologio-26-27.json "Όνομα σχολείου"
    npm run import:json -- data\orologio-26-27.json --replace
Generate a timetable:
    .\.venv\Scripts\python -m solver solve data\orologio-26-27.json --time 600
"@
