# =============================================================================
# Route Tracker Database Setup Script (Windows PowerShell)
# =============================================================================
# This script creates the PostgreSQL user and databases needed for Route Tracker.
#
# Prerequisites:
# - PostgreSQL installed and running
# - psql client available in PATH
# - ROUTE_TRACKER_DB_PASSWORD environment variable set OR passed as parameter
#
# Usage:
#   .\create-database.ps1 -RouteTrackerPassword "your-password"
#   .\create-database.ps1  # Will prompt for password
#
# Optional parameters:
#   -PostgresPassword    Password for postgres superuser (will prompt if not provided)
#   -PostgresHost        PostgreSQL host (default: "localhost")
#   -PostgresPort        PostgreSQL port (default: 5432)
#   -PostgresUser        PostgreSQL superuser (default: "postgres")
# =============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$RouteTrackerPassword,
    
    [string]$PostgresPassword = "",
    [string]$PostgresHost = "localhost",
    [int]$PostgresPort = 5432,
    [string]$PostgresUser = "postgres"
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

Write-ColorOutput Cyan "=================================================="
Write-ColorOutput Cyan "  Route Tracker - Database Setup (Windows)"
Write-ColorOutput Cyan "=================================================="
Write-Host ""

# Check if psql is available
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    # Try common PostgreSQL installation paths
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\18\bin\psql.exe",
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files\PostgreSQL\14\bin\psql.exe",
        "C:\Program Files\PostgreSQL\13\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\18\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\15\bin\psql.exe"
    )
    
    # Try to find PostgreSQL installation via registry
    $regPaths = @(
        "HKLM:\SOFTWARE\PostgreSQL\Installations",
        "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations"
    )
    
    foreach ($regPath in $regPaths) {
        if (Test-Path $regPath) {
            $installations = Get-ChildItem $regPath -ErrorAction SilentlyContinue
            foreach ($inst in $installations) {
                $binPath = Join-Path $inst.GetValue("Base Directory") "bin\psql.exe"
                if ($binPath -and (Test-Path $binPath)) {
                    $commonPaths = @($binPath) + $commonPaths
                }
            }
        }
    }
    
    $foundPath = $null
    foreach ($path in $commonPaths) {
        if ($path -and (Test-Path $path)) {
            $foundPath = $path
            break
        }
    }
    
    if ($foundPath) {
        Write-Host "Found psql at: $foundPath" -ForegroundColor Green
        $psqlPath = @{ Path = $foundPath }
    } else {
        Write-ColorOutput Red "Error: psql is not found in PATH or common locations."
        Write-Host "Please install PostgreSQL and add it to your PATH." -ForegroundColor Yellow
        Write-Host "Or specify the path manually by editing this script." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Common locations checked:"
        foreach ($path in $commonPaths) {
            if ($path) {
                Write-Host "  $path"
            }
        }
        exit 1
    }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SqlScript = Join-Path $ScriptDir "create-database.sql"

if (-not (Test-Path $SqlScript)) {
    Write-ColorOutput Red "Error: SQL script not found at $SqlScript"
    exit 1
}

# Get route_tracker password if not provided
if ([string]::IsNullOrEmpty($RouteTrackerPassword)) {
    $envPassword = [System.Environment]::GetEnvironmentVariable("ROUTE_TRACKER_DB_PASSWORD", "User")
    if ([string]::IsNullOrEmpty($envPassword)) {
        $envPassword = [System.Environment]::GetEnvironmentVariable("ROUTE_TRACKER_DB_PASSWORD", "Process")
    }
    
    if ([string]::IsNullOrEmpty($envPassword)) {
        Write-Host "ROUTE_TRACKER_DB_PASSWORD not found in environment variables." -ForegroundColor Yellow
        $securePassword = Read-Host "Enter password for route_tracker user" -AsSecureString
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $RouteTrackerPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    } else {
        $RouteTrackerPassword = $envPassword
        Write-Host "Using ROUTE_TRACKER_DB_PASSWORD from environment" -ForegroundColor Green
    }
}

# Validate password length
if ($RouteTrackerPassword.Length -lt 8) {
    Write-ColorOutput Yellow "Warning: Password is shorter than 8 characters."
    Write-Host "Consider using a stronger password for production." -ForegroundColor Yellow
}

# Get postgres password if not provided
if ([string]::IsNullOrEmpty($PostgresPassword)) {
    $envPgPassword = [System.Environment]::GetEnvironmentVariable("POSTGRES_PASSWORD", "User")
    if ([string]::IsNullOrEmpty($envPgPassword)) {
        $envPgPassword = [System.Environment]::GetEnvironmentVariable("POSTGRES_PASSWORD", "Process")
    }
    
    if ([string]::IsNullOrEmpty($envPgPassword)) {
        Write-Host ""
        Write-Host "PostgreSQL superuser password not found." -ForegroundColor Yellow
        Write-Host "Enter password for postgres user (leave empty for trust auth):" -ForegroundColor Cyan
        $securePgPassword = Read-Host -AsSecureString
        if ($securePgPassword.Length -gt 0) {
            $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePgPassword)
            $PostgresPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        }
    } else {
        $PostgresPassword = $envPgPassword
        Write-Host "Using POSTGRES_PASSWORD from environment" -ForegroundColor Green
    }
}

# Create temporary SQL file with password substituted
$TempSql = [System.IO.Path]::GetTempFileName()
try {
    (Get-Content $SqlScript -Raw) -replace 'CHANGE_ME_IN_PRODUCTION', $RouteTrackerPassword | Set-Content $TempSql -NoNewline

    Write-Host ""
    Write-Host "Connecting to PostgreSQL at ${PostgresHost}:${PostgresPort}..." -ForegroundColor Green
    Write-Host ""

    # Set PGPASSWORD environment variable if password is provided
    if (-not [string]::IsNullOrEmpty($PostgresPassword)) {
        $env:PGPASSWORD = $PostgresPassword
    }

    # Execute SQL script
    $psqlExe = $psqlPath.Path
    & $psqlExe -h $PostgresHost -p $PostgresPort -U $PostgresUser -d postgres -f $TempSql

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-ColorOutput Green "=================================================="
        Write-ColorOutput Green "  Database setup completed successfully!"
        Write-ColorOutput Green "=================================================="
        Write-Host ""
        Write-Host "Created:" -ForegroundColor Cyan
        Write-Host "  - User: route_tracker"
        Write-Host "  - Database (prod): route_tracker"
        Write-Host "  - Database (dev):  route_tracker_dev"
        Write-Host ""
        Write-Host "Connection string for ASP.NET Core:" -ForegroundColor Yellow
        Write-Host "  Host=$PostgresHost;Port=$PostgresPort;Database=route_tracker_dev;Username=route_tracker;Password=<your-password>"
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Set environment variable: `$env:ROUTE_TRACKER_DB_PASSWORD='$RouteTrackerPassword'"
        Write-Host "  2. Run: cd ..\RouteTracker"
        Write-Host "  3. Run: dotnet ef database update"
        Write-Host "  4. Run: dotnet run"
    } else {
        Write-Host ""
        Write-ColorOutput Red "=================================================="
        Write-ColorOutput Red "  Database setup failed!"
        Write-ColorOutput Red "=================================================="
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  1. Make sure PostgreSQL is running"
        Write-Host "  2. Check that user '$PostgresUser' can connect"
        Write-Host "  3. Provide the correct PostgreSQL password with -PostgresPassword"
        Write-Host "  4. Check PostgreSQL logs for more details"
        exit 1
    }
}
catch {
    Write-Host ""
    Write-ColorOutput Red "Error: Database setup failed!"
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    # Cleanup
    if (Test-Path $TempSql) {
        Remove-Item $TempSql -ErrorAction SilentlyContinue
    }
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
