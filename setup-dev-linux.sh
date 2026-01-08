#!/bin/bash
# =============================================================================
# Route Tracker - Linux Development Setup Script
# =============================================================================
# This script automates the complete setup for Linux development:
# 1. Checks prerequisites (PostgreSQL, psql, dotnet)
# 2. Creates the database user and databases
# 3. Sets environment variable
# 4. Applies EF Core migrations
#
# Usage:
#   ./setup-dev-linux.sh
#   ./setup-dev-linux.sh --password "custom-password"
#   ./setup-dev-linux.sh --generate-password
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
PASSWORD="dev-password-123"
GENERATE_PASSWORD=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --password)
            PASSWORD="$2"
            shift 2
            ;;
        --generate-password)
            GENERATE_PASSWORD=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --password PASSWORD    Set the database password (default: dev-password-123)"
            echo "  --generate-password    Generate a random secure password"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  POSTGRES_PASSWORD      Password for postgres superuser (if using password auth)"
            echo "  POSTGRES_HOST          PostgreSQL host (default: localhost)"
            echo "  POSTGRES_PORT          PostgreSQL port (default: 5432)"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo ""
echo -e "${CYAN}==================================================${NC}"
echo -e "${CYAN}  Route Tracker - Linux Development Setup${NC}"
echo -e "${CYAN}==================================================${NC}"
echo ""

# =============================================================================
# Step 0: Check prerequisites
# =============================================================================
echo -e "${YELLOW}Step 0: Checking prerequisites...${NC}"

# Check PostgreSQL client
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql is not installed.${NC}"
    echo "Please install PostgreSQL client:"
    echo "  Ubuntu/Debian: sudo apt install postgresql-client"
    echo "  RHEL/CentOS:   sudo yum install postgresql"
    echo "  Arch Linux:    sudo pacman -S postgresql"
    echo "  macOS:         brew install postgresql"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} psql found"

# Check if PostgreSQL server is running
if ! pg_isready -q 2>/dev/null; then
    echo -e "${YELLOW}Warning: PostgreSQL server might not be running.${NC}"
    echo "If you encounter connection errors, start PostgreSQL:"
    echo "  Ubuntu/Debian: sudo systemctl start postgresql"
    echo "  macOS:         brew services start postgresql"
else
    echo -e "  ${GREEN}✓${NC} PostgreSQL server is running"
fi

# Check dotnet
if ! command -v dotnet &> /dev/null; then
    echo -e "${RED}Error: dotnet is not installed.${NC}"
    echo "Please install .NET SDK:"
    echo "  https://dotnet.microsoft.com/download"
    echo "  Ubuntu: sudo apt install dotnet-sdk-8.0"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} dotnet found ($(dotnet --version))"

# Check if EF tools are installed
if ! dotnet ef --version &> /dev/null 2>&1; then
    echo -e "${YELLOW}Installing EF Core tools...${NC}"
    dotnet tool install --global dotnet-ef || {
        echo -e "${YELLOW}Note: EF tools might already be installed locally${NC}"
    }
fi

echo ""

# =============================================================================
# Step 1: Set password
# =============================================================================
echo -e "${YELLOW}Step 1: Setting up password...${NC}"

if [ "$GENERATE_PASSWORD" = true ]; then
    if command -v openssl &> /dev/null; then
        PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
    else
        PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)
    fi
    echo -e "  ${GREEN}✓${NC} Generated random password"
fi

export ROUTE_TRACKER_DB_PASSWORD="$PASSWORD"
echo -e "  ${GREEN}✓${NC} Environment variable set for this session"
echo ""

# =============================================================================
# Step 2: Create database
# =============================================================================
echo -e "${YELLOW}Step 2: Creating database...${NC}"

DB_SCRIPT="$SCRIPT_DIR/backend/scripts/create-database.sh"

if [ ! -f "$DB_SCRIPT" ]; then
    echo -e "${RED}Error: create-database.sh not found at $DB_SCRIPT${NC}"
    exit 1
fi

chmod +x "$DB_SCRIPT"

# Run the database creation script
if ! "$DB_SCRIPT"; then
    echo -e "${RED}Database creation failed!${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Make sure PostgreSQL is running"
    echo "  2. If using password auth, set POSTGRES_PASSWORD"
    echo "  3. Try: sudo -u postgres $DB_SCRIPT"
    exit 1
fi

echo ""

# =============================================================================
# Step 3: Apply EF Core migrations
# =============================================================================
echo -e "${YELLOW}Step 3: Applying EF Core migrations...${NC}"

ROUTE_TRACKER_PATH="$SCRIPT_DIR/backend/RouteTracker"

if [ ! -d "$ROUTE_TRACKER_PATH" ]; then
    echo -e "${RED}Error: RouteTracker project not found at $ROUTE_TRACKER_PATH${NC}"
    exit 1
fi

cd "$ROUTE_TRACKER_PATH"

if dotnet ef database update; then
    echo -e "  ${GREEN}✓${NC} Migrations applied successfully"
else
    echo -e "${RED}Migration failed!${NC}"
    echo "Try running manually: cd backend/RouteTracker && dotnet ef database update"
    cd "$SCRIPT_DIR"
    exit 1
fi

cd "$SCRIPT_DIR"
echo ""

# =============================================================================
# Step 4: Summary
# =============================================================================
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo -e "${CYAN}Environment variable set (this session only):${NC}"
echo "  ROUTE_TRACKER_DB_PASSWORD=$PASSWORD"
echo ""
echo -e "${YELLOW}To make it permanent, add to your shell profile:${NC}"
echo "  echo 'export ROUTE_TRACKER_DB_PASSWORD=\"$PASSWORD\"' >> ~/.bashrc"
echo "  # or for zsh:"
echo "  echo 'export ROUTE_TRACKER_DB_PASSWORD=\"$PASSWORD\"' >> ~/.zshrc"
echo ""
echo -e "${CYAN}To start the application:${NC}"
echo "  cd backend/RouteTracker"
echo "  dotnet run"
echo ""
