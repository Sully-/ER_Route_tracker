# =============================================================================
# Route Tracker - Deployment Packaging Script
# =============================================================================
# This script creates deployment packages for the backend and frontend.
#
# Usage:
#   .\package.ps1 -BackendUrl "http://192.168.1.100:5000"
#   .\package.ps1 -BackendUrl "https://api.example.com" -OutputDir "releases"
#
# Output:
#   - routetracker-backend-YYYYMMDD-HHmmss.zip
#   - routetracker-frontend-YYYYMMDD-HHmmss.zip
# =============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackendUrl,
    
    [string]$OutputDir = "packages",
    
    [switch]$SkipBackend,
    
    [switch]$SkipFrontend,
    
    [switch]$Combined
)

# =============================================================================
# Configuration
# =============================================================================

$ErrorActionPreference = "Stop"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

# Determine project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Find project root
if (Test-Path "website\backend\RouteTracker.csproj") {
    $ProjectRoot = Get-Location
} elseif (Test-Path (Join-Path $ScriptDir "..\..\..\website\backend\RouteTracker.csproj")) {
    $ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..\..") 
} else {
    Write-Host "ERROR: Cannot find project root." -ForegroundColor Red
    Write-Host "Run this script from the project root or scripts/website/deploy folder" -ForegroundColor Yellow
    exit 1
}

$BackendPath = Join-Path $ProjectRoot "website\backend"
$FrontendPath = Join-Path $ProjectRoot "website\frontend"
$OutputPath = Join-Path $ProjectRoot $OutputDir

# =============================================================================
# Header
# =============================================================================

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Route Tracker - Packaging" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Backend URL:  $BackendUrl"
Write-Host "  Project:      $ProjectRoot"
Write-Host "  Output:       $OutputPath"
Write-Host "  Timestamp:    $Timestamp"
Write-Host ""

# Create output folder
if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}

# Temporary build folders
$TempBackend = Join-Path $OutputPath "temp_backend"
$TempFrontend = Join-Path $OutputPath "temp_frontend"

# Clean temporary folders
if (Test-Path $TempBackend) { Remove-Item -Path $TempBackend -Recurse -Force }
if (Test-Path $TempFrontend) { Remove-Item -Path $TempFrontend -Recurse -Force }

# =============================================================================
# Build Backend
# =============================================================================

$BackendArchive = $null

if (-not $SkipBackend) {
    Write-Host "Step 1: Building backend..." -ForegroundColor Green
    
    if (-not (Test-Path $BackendPath)) {
        Write-Host "ERROR: Backend folder not found: $BackendPath" -ForegroundColor Red
        exit 1
    }
    
    Push-Location $BackendPath
    try {
        Write-Host "  Publishing in Release mode..." -ForegroundColor Yellow
        dotnet publish -c Release -o $TempBackend --verbosity quiet
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Backend build failed!" -ForegroundColor Red
            exit 1
        }
        
        # Create archive
        $BackendArchive = Join-Path $OutputPath "routetracker-backend-$Timestamp.zip"
        Write-Host "  Creating archive..." -ForegroundColor Yellow
        Compress-Archive -Path "$TempBackend\*" -DestinationPath $BackendArchive -Force
        
        # Cleanup
        Remove-Item -Path $TempBackend -Recurse -Force
        
        $BackendSize = [math]::Round((Get-Item $BackendArchive).Length / 1MB, 2)
        Write-Host "  OK: $BackendArchive ($BackendSize MB)" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Step 1: Backend skipped (--SkipBackend)" -ForegroundColor Yellow
}

Write-Host ""

# =============================================================================
# Build Frontend
# =============================================================================

$FrontendArchive = $null

if (-not $SkipFrontend) {
    Write-Host "Step 2: Building frontend..." -ForegroundColor Green
    
    if (-not (Test-Path $FrontendPath)) {
        Write-Host "ERROR: Frontend folder not found: $FrontendPath" -ForegroundColor Red
        exit 1
    }
    
    Push-Location $FrontendPath
    try {
        # Install dependencies if needed
        if (-not (Test-Path "node_modules")) {
            Write-Host "  Installing npm dependencies..." -ForegroundColor Yellow
            npm install --silent
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: npm install failed!" -ForegroundColor Red
                exit 1
            }
        }
        
        # Configure backend URL
        Write-Host "  Configuration: VITE_BACKEND_URL=$BackendUrl" -ForegroundColor Yellow
        $env:VITE_BACKEND_URL = $BackendUrl
        
        # Build
        Write-Host "  Building..." -ForegroundColor Yellow
        npm run build --silent
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Frontend build failed!" -ForegroundColor Red
            exit 1
        }
        
        # Check that dist exists
        $DistPath = Join-Path $FrontendPath "dist"
        if (-not (Test-Path $DistPath)) {
            Write-Host "ERROR: dist folder not found after build!" -ForegroundColor Red
            exit 1
        }
        
        # Create archive
        $FrontendArchive = Join-Path $OutputPath "routetracker-frontend-$Timestamp.zip"
        Write-Host "  Creating archive..." -ForegroundColor Yellow
        Compress-Archive -Path "$DistPath\*" -DestinationPath $FrontendArchive -Force
        
        $FrontendSize = [math]::Round((Get-Item $FrontendArchive).Length / 1MB, 2)
        Write-Host "  OK: $FrontendArchive ($FrontendSize MB)" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Step 2: Frontend skipped (--SkipFrontend)" -ForegroundColor Yellow
}

Write-Host ""

# =============================================================================
# Combined package (optional)
# =============================================================================

$CombinedArchive = $null

if ($Combined -and $BackendArchive -and $FrontendArchive) {
    Write-Host "Step 3: Creating combined package..." -ForegroundColor Green
    
    $CombinedDir = Join-Path $OutputPath "temp_combined"
    New-Item -ItemType Directory -Path $CombinedDir -Force | Out-Null
    New-Item -ItemType Directory -Path "$CombinedDir\backend" -Force | Out-Null
    New-Item -ItemType Directory -Path "$CombinedDir\frontend" -Force | Out-Null
    
    # Extract archives into combined folder
    Expand-Archive -Path $BackendArchive -DestinationPath "$CombinedDir\backend" -Force
    Expand-Archive -Path $FrontendArchive -DestinationPath "$CombinedDir\frontend" -Force
    
    # Create README
    $ReadmeContent = @"
# Route Tracker - Deployment Package

Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Configured backend URL: $BackendUrl

## Contents

- backend/  : ASP.NET Core files
- frontend/ : React static files

## Installation

1. Copy backend/* to /opt/routetracker/backend/
2. Copy frontend/* to /opt/routetracker/frontend/
3. Restart the service: sudo systemctl restart routetracker
"@
    Set-Content -Path "$CombinedDir\README.txt" -Value $ReadmeContent -Encoding UTF8
    
    # Create combined archive
    $CombinedArchive = Join-Path $OutputPath "routetracker-$Timestamp.zip"
    Compress-Archive -Path "$CombinedDir\*" -DestinationPath $CombinedArchive -Force
    
    # Cleanup
    Remove-Item -Path $CombinedDir -Recurse -Force
    
    $CombinedSize = [math]::Round((Get-Item $CombinedArchive).Length / 1MB, 2)
    Write-Host "  OK: $CombinedArchive ($CombinedSize MB)" -ForegroundColor Green
    Write-Host ""
}

# =============================================================================
# Summary
# =============================================================================

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Packaging complete!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Files created:" -ForegroundColor Yellow

if ($BackendArchive) {
    Write-Host "  Backend:  $BackendArchive" -ForegroundColor White
}
if ($FrontendArchive) {
    Write-Host "  Frontend: $FrontendArchive" -ForegroundColor White
}
if ($CombinedArchive) {
    Write-Host "  Combined: $CombinedArchive" -ForegroundColor White
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Transfer the archives to the server (WinSCP, scp, etc.)"
Write-Host "  2. Extract the files to /opt/routetracker/"
Write-Host "  3. Restart the service: sudo systemctl restart routetracker"
Write-Host ""
Write-Host "See docs/DAILY_DEPLOYMENT.md for the complete guide." -ForegroundColor Yellow
Write-Host ""
