# =============================================================================
# Route Tracker - Windows Development Setup Script
# =============================================================================
# This script automates the complete setup for Windows development:
# 1. Checks prerequisites (PostgreSQL, dotnet)
# 2. Creates the database user and databases
# 3. Sets environment variable
# 4. Applies EF Core migrations
#
# Usage:
#   .\setup-dev-windows.ps1
#   .\setup-dev-windows.ps1 -Password "custom-password"
#   .\setup-dev-windows.ps1 -GeneratePassword
# =============================================================================

param(
    [string]$Password = "dev-password-123",
    [string]$PostgresPassword = "",
    [switch]$GeneratePassword
)

$ErrorActionPreference = "Stop"

function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

Write-Host ""
Write-ColorOutput Cyan "=================================================="
Write-ColorOutput Cyan "  Route Tracker - Windows Development Setup"
Write-ColorOutput Cyan "=================================================="
Write-Host ""

# =============================================================================
# Step 0: Check prerequisites
# =============================================================================
Write-Host "Step 0: Checking prerequisites..." -ForegroundColor Yellow

# Check dotnet
$dotnetVersion = $null
try {
    $dotnetVersion = dotnet --version 2>$null
} catch {}

if (-not $dotnetVersion) {
    Write-ColorOutput Red "Error: dotnet is not installed."
    Write-Host "Please install .NET SDK from: https://dotnet.microsoft.com/download" -ForegroundColor Yellow
    exit 1
}
Write-Host "  ✓ dotnet found ($dotnetVersion)" -ForegroundColor Green

# Check if EF tools are installed
$efVersion = $null
try {
    $efVersion = dotnet ef --version 2>$null
} catch {}

if (-not $efVersion) {
    Write-Host "  Installing EF Core tools..." -ForegroundColor Yellow
    dotnet tool install --global dotnet-ef 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Note: EF tools might already be installed locally" -ForegroundColor Yellow
    }
}

Write-Host ""

# =============================================================================
# Step 1: Set password
# =============================================================================
Write-Host "Step 1: Setting up password..." -ForegroundColor Yellow

if ($GeneratePassword) {
    # Generate a random password
    $Password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
    Write-Host "  ✓ Generated random password" -ForegroundColor Green
}

$env:ROUTE_TRACKER_DB_PASSWORD = $Password
Write-ColorOutput Green "  ✓ Environment variable set for this session"
Write-Host ""

# =============================================================================
# Step 2: Get PostgreSQL password if not provided
# =============================================================================
Write-Host "Step 2: PostgreSQL connection setup..." -ForegroundColor Yellow

if ([string]::IsNullOrEmpty($PostgresPassword)) {
    # Try to get from environment variable
    $PostgresPassword = [System.Environment]::GetEnvironmentVariable("POSTGRES_PASSWORD", "User")
    if ([string]::IsNullOrEmpty($PostgresPassword)) {
        $PostgresPassword = [System.Environment]::GetEnvironmentVariable("POSTGRES_PASSWORD", "Process")
    }
    
    if ([string]::IsNullOrEmpty($PostgresPassword)) {
        Write-Host "  PostgreSQL superuser password not found in environment." -ForegroundColor Yellow
        Write-Host "  Enter password for postgres user (leave empty for trust auth):" -ForegroundColor Cyan
        $securePassword = Read-Host -AsSecureString
        if ($securePassword.Length -gt 0) {
            $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
            $PostgresPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        } else {
            Write-Host "  Using trust authentication (no password)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✓ Using POSTGRES_PASSWORD from environment" -ForegroundColor Green
    }
}

Write-Host ""

# =============================================================================
# Step 3: Create database
# =============================================================================
Write-Host "Step 3: Creating database..." -ForegroundColor Yellow

$scriptPath = Join-Path $PSScriptRoot "backend\scripts\create-database.ps1"
if (Test-Path $scriptPath) {
    $dbParams = @{
        RouteTrackerPassword = $Password
    }
    
    if (-not [string]::IsNullOrEmpty($PostgresPassword)) {
        $dbParams.PostgresPassword = $PostgresPassword
    }
    
    & $scriptPath @dbParams
    
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput Red "Database creation failed!"
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  1. Make sure PostgreSQL is installed and running"
        Write-Host "  2. Check the postgres user password"
        Write-Host "  3. Try running with: -PostgresPassword 'your-postgres-password'"
        exit 1
    }
} else {
    Write-ColorOutput Red "Error: create-database.ps1 not found at $scriptPath"
    exit 1
}
Write-Host ""

# =============================================================================
# Step 4: Apply migrations
# =============================================================================
Write-Host "Step 4: Applying EF Core migrations..." -ForegroundColor Yellow

$routeTrackerPath = Join-Path $PSScriptRoot "backend\RouteTracker"
if (-not (Test-Path $routeTrackerPath)) {
    Write-ColorOutput Red "Error: RouteTracker project not found at $routeTrackerPath"
    exit 1
}

$originalLocation = Get-Location
Set-Location $routeTrackerPath
try {
    dotnet ef database update
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Migrations applied successfully" -ForegroundColor Green
    } else {
        Write-ColorOutput Red "Migration failed!"
        Write-Host "Try running manually: cd backend\RouteTracker && dotnet ef database update" -ForegroundColor Yellow
        Set-Location $originalLocation
        exit 1
    }
}
catch {
    Write-ColorOutput Red "Error during migration: $($_.Exception.Message)"
    Set-Location $originalLocation
    exit 1
}
Set-Location $originalLocation
Write-Host ""

# =============================================================================
# Step 5: Summary
# =============================================================================
Write-ColorOutput Green "=================================================="
Write-ColorOutput Green "  Setup Complete!"
Write-ColorOutput Green "=================================================="
Write-Host ""
Write-Host "Environment variable set (this session only):" -ForegroundColor Cyan
Write-Host "  ROUTE_TRACKER_DB_PASSWORD = $Password"
Write-Host ""
Write-Host "To make it permanent, run:" -ForegroundColor Yellow
Write-Host "  [System.Environment]::SetEnvironmentVariable('ROUTE_TRACKER_DB_PASSWORD', '$Password', 'User')"
Write-Host ""
Write-Host "To start the application:" -ForegroundColor Cyan
Write-Host "  cd backend\RouteTracker"
Write-Host "  dotnet run"
Write-Host ""
