#!/bin/bash
# =============================================================================
# Route Tracker - Database Setup Script
# =============================================================================
# This script automatically configures PostgreSQL for Route Tracker.
# It is STANDALONE - no source code or .NET required.
#
# Usage:
#   sudo -u postgres ./setup-database.sh                    # Peer auth (recommended)
#   sudo -u postgres ./setup-database.sh --password "xxx"   # With custom password
#   ./setup-database.sh --tcp                               # Force TCP connection
#
# Prerequisites:
#   - PostgreSQL 14+ installed and running
#   - psql available in PATH
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_SCRIPT="$SCRIPT_DIR/setup-database.sql"

# Default values
PASSWORD=""
USE_TCP=false
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

# =============================================================================
# Argument parsing
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --password|-p)
            PASSWORD="$2"
            shift 2
            ;;
        --tcp)
            USE_TCP=true
            shift
            ;;
        --host|-h)
            POSTGRES_HOST="$2"
            USE_TCP=true
            shift 2
            ;;
        --port)
            POSTGRES_PORT="$2"
            shift 2
            ;;
        --user|-U)
            POSTGRES_USER="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --password, -p PASSWORD   Password for route_tracker user"
            echo "  --tcp                     Force TCP connection (requires POSTGRES_PASSWORD)"
            echo "  --host, -h HOST           PostgreSQL host (implies --tcp)"
            echo "  --port PORT               PostgreSQL port (default: 5432)"
            echo "  --user, -U USER           PostgreSQL superuser (default: postgres)"
            echo "  --help                    Show this help"
            echo ""
            echo "Examples:"
            echo "  sudo -u postgres ./setup-database.sh                  # Local with peer auth"
            echo "  sudo -u postgres ./setup-database.sh -p 'mypass'      # Custom password"
            echo "  ./setup-database.sh --tcp                             # TCP with password"
            echo ""
            echo "Environment variables:"
            echo "  POSTGRES_PASSWORD         PostgreSQL superuser password (for TCP)"
            echo "  POSTGRES_HOST             PostgreSQL host"
            echo "  POSTGRES_PORT             PostgreSQL port"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage"
            exit 1
            ;;
    esac
done

# Force TCP if POSTGRES_PASSWORD is set
if [ -n "$POSTGRES_PASSWORD" ]; then
    USE_TCP=true
fi

# =============================================================================
# Header
# =============================================================================

echo ""
echo -e "${CYAN}==================================================${NC}"
echo -e "${CYAN}  Route Tracker - Database Setup${NC}"
echo -e "${CYAN}==================================================${NC}"
echo ""

# =============================================================================
# Prerequisites check
# =============================================================================

echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check psql
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql is not installed.${NC}"
    echo ""
    echo "Install PostgreSQL client:"
    echo "  Ubuntu/Debian: sudo apt install postgresql-client"
    echo "  RHEL/CentOS:   sudo yum install postgresql"
    echo "  macOS:         brew install postgresql"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} psql found"

# Check SQL script
if [ ! -f "$SQL_SCRIPT" ]; then
    echo -e "${RED}Error: SQL script not found: $SQL_SCRIPT${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} SQL script found"

# Check PostgreSQL
if $USE_TCP; then
    if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -q 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} PostgreSQL accessible at $POSTGRES_HOST:$POSTGRES_PORT (TCP)"
    else
        echo -e "  ${YELLOW}⚠${NC} PostgreSQL may not be accessible at $POSTGRES_HOST:$POSTGRES_PORT"
    fi
else
    if pg_isready -q 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} PostgreSQL accessible (Unix socket)"
    else
        echo -e "  ${YELLOW}⚠${NC} PostgreSQL may not be accessible"
        echo "    Make sure PostgreSQL is running:"
        echo "    sudo systemctl start postgresql"
    fi
fi

echo ""

# =============================================================================
# Password generation or validation
# =============================================================================

if [ -z "$PASSWORD" ]; then
    echo -e "${YELLOW}Generating secure password...${NC}"
    if command -v openssl &> /dev/null; then
        PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
    else
        PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)
    fi
    echo -e "  ${GREEN}✓${NC} Password generated (24 characters)"
else
    if [ ${#PASSWORD} -lt 8 ]; then
        echo -e "${YELLOW}Warning: Password is less than 8 characters.${NC}"
    fi
    echo -e "  ${GREEN}✓${NC} Using provided password"
fi

echo ""

# =============================================================================
# Prepare SQL script with password
# =============================================================================

echo -e "${YELLOW}Preparing SQL script...${NC}"

TEMP_SQL=$(mktemp)
trap "rm -f $TEMP_SQL" EXIT

# Escape special characters for sed
ESCAPED_PASSWORD=$(printf '%s\n' "$PASSWORD" | sed -e 's/[\/&]/\\&/g')
sed "s/{PASSWORD}/$ESCAPED_PASSWORD/g" "$SQL_SCRIPT" > "$TEMP_SQL"

echo -e "  ${GREEN}✓${NC} Script prepared"
echo ""

# =============================================================================
# Execute SQL script
# =============================================================================

echo -e "${YELLOW}Executing SQL script...${NC}"

# Build psql command based on connection type
if $USE_TCP; then
    echo "  Connecting to PostgreSQL at $POSTGRES_HOST:$POSTGRES_PORT (TCP)..."
    if [ -n "$POSTGRES_PASSWORD" ]; then
        export PGPASSWORD="$POSTGRES_PASSWORD"
    fi
    PSQL_CMD="psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER"
else
    echo "  Connecting to PostgreSQL via Unix socket..."
    PSQL_CMD="psql -U $POSTGRES_USER"
fi

echo ""

if $PSQL_CMD -d postgres -f "$TEMP_SQL"; then
    echo ""
    echo -e "${GREEN}==================================================${NC}"
    echo -e "${GREEN}  Setup completed successfully!${NC}"
    echo -e "${GREEN}==================================================${NC}"
    echo ""
    echo -e "${BOLD}Connection info:${NC}"
    echo "  Database: route_tracker"
    echo "  Username: route_tracker"
    echo -e "  Password: ${CYAN}$PASSWORD${NC}"
    echo ""
    echo -e "${BOLD}${RED}IMPORTANT: Save this password!${NC}"
    echo ""
    echo -e "${BOLD}Connection string:${NC}"
    echo "  Host=localhost;Port=5432;Database=route_tracker;Username=route_tracker;Password=$PASSWORD"
    echo ""
    echo -e "${CYAN}To configure the backend, create a .env file:${NC}"
    echo "  ROUTE_TRACKER_DB_PASSWORD=$PASSWORD"
    echo ""
else
    EXIT_CODE=$?
    echo ""
    echo -e "${RED}==================================================${NC}"
    echo -e "${RED}  Setup failed!${NC}"
    echo -e "${RED}==================================================${NC}"
    echo ""
    echo "Troubleshooting:"
    echo ""
    echo "  1. Make sure PostgreSQL is running:"
    echo "     sudo systemctl start postgresql"
    echo ""
    echo "  2. For peer authentication (recommended on Linux):"
    echo "     sudo -u postgres ./setup-database.sh"
    echo ""
    echo "  3. For TCP with password authentication:"
    echo "     export POSTGRES_PASSWORD='your-postgres-password'"
    echo "     ./setup-database.sh --tcp"
    echo ""
    exit $EXIT_CODE
fi
