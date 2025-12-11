# Route Tracker Build & Package Script
# =====================================

param(
    [switch]$Release,
    [switch]$Package,
    [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Route Tracker - Build Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Determine build profile
if ($Release) {
    $profile = "release"
    $cargoArgs = "--release"
    Write-Host "[*] Building in RELEASE mode..." -ForegroundColor Green
} else {
    $profile = "debug"
    $cargoArgs = ""
    Write-Host "[*] Building in DEBUG mode..." -ForegroundColor Yellow
}

# Build the project
Write-Host "[*] Running cargo build $cargoArgs" -ForegroundColor White
cargo build $cargoArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[+] Build successful!" -ForegroundColor Green
Write-Host ""

# Copy config file and CSV to target directory
$targetDir = "target\$profile"

Write-Host "[*] Copying required files to $targetDir..." -ForegroundColor White

$configSrc = "route_tracker_config.toml"
$configDst = "$targetDir\route_tracker_config.toml"
Copy-Item $configSrc $configDst -Force
Write-Host "  [+] Config file copied!" -ForegroundColor Gray

$csvSrc = "src\WorldMapLegacyConvParam.csv"
$csvDst = "$targetDir\WorldMapLegacyConvParam.csv"
Copy-Item $csvSrc $csvDst -Force
Write-Host "  [+] Coordinate CSV copied!" -ForegroundColor Gray

# Package if requested
if ($Package) {
    Write-Host ""
    Write-Host "[*] Creating distribution package..." -ForegroundColor White
    
    # Create output directory
    if (Test-Path $OutputDir) {
        Remove-Item $OutputDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    
    # Copy files
    $files = @(
        "$targetDir\route_tracking.dll",
        "$targetDir\route-tracker-injector.exe",
        "$targetDir\route_tracker_config.toml",
        "$targetDir\WorldMapLegacyConvParam.csv",
        "README.md",
        "LICENSE"
    )
    
    foreach ($file in $files) {
        if (Test-Path $file) {
            Copy-Item $file $OutputDir
            Write-Host "  [+] Copied: $(Split-Path $file -Leaf)" -ForegroundColor Gray
        } else {
            Write-Host "  [!] Not found: $file" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "[+] Package created in '$OutputDir' directory!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Contents:" -ForegroundColor Cyan
    Get-ChildItem $OutputDir | ForEach-Object { Write-Host "  - $($_.Name)" }
}

Write-Host ""
Write-Host "[+] Done!" -ForegroundColor Green

