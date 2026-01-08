#!/bin/bash
# =============================================================================
# Route Tracker Database Setup Script
# =============================================================================
# This script creates the PostgreSQL user and databases needed for Route Tracker.
#
# Prerequisites:
# - PostgreSQL installed and running
# - psql client available
# - ROUTE_TRACKER_DB_PASSWORD environment variable set
#
# Usage:
#   export ROUTE_TRACKER_DB_PASSWORD="your-secure-password"
#   ./create-database.sh
#
# Optional environment variables:
#   POSTGRES_PASSWORD - Password for postgres superuser (default: uses peer auth)
#   POSTGRES_HOST - PostgreSQL host (default: localhost)
#   POSTGRES_PORT - PostgreSQL port (default: 5432)
#   POSTGRES_USER - PostgreSQL superuser (default: postgres)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration with defaults
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_SCRIPT="$SCRIPT_DIR/create-database.sql"

echo -e "${CYAN}==================================================${NC}"
echo -e "${CYAN}  Route Tracker - Database Setup${NC}"
echo -e "${CYAN}==================================================${NC}"
echo ""

# =============================================================================
# Check prerequisites
# =============================================================================

# Check that psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql is not installed.${NC}"
    echo ""
    echo "Please install PostgreSQL client:"
    echo ""
    
    # Detect OS and provide specific instructions
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            ubuntu|debian)
                echo "  sudo apt update && sudo apt install postgresql-client"
                ;;
            fedora)
                echo "  sudo dnf install postgresql"
                ;;
            centos|rhel|rocky|almalinux)
                echo "  sudo yum install postgresql"
                ;;
            arch|manjaro)
                echo "  sudo pacman -S postgresql"
                ;;
            opensuse*)
                echo "  sudo zypper install postgresql"
                ;;
            *)
                echo "  Check your distribution's package manager"
                ;;
        esac
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  brew install postgresql"
    else
        echo "  Ubuntu/Debian: sudo apt install postgresql-client"
        echo "  RHEL/CentOS:   sudo yum install postgresql"
        echo "  macOS:         brew install postgresql"
    fi
    exit 1
fi
echo -e "  ${GREEN}✓${NC} psql found ($(psql --version | head -n1))"

# Check if PostgreSQL server is running/accessible
echo -n "  Checking PostgreSQL server... "
if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -q 2>/dev/null; then
    echo -e "${GREEN}✓${NC} accessible"
else
    echo -e "${YELLOW}warning${NC}"
    echo -e "  ${YELLOW}PostgreSQL server at $POSTGRES_HOST:$POSTGRES_PORT might not be running.${NC}"
    echo "  If you encounter connection errors:"
    
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            ubuntu|debian)
                echo "    sudo systemctl start postgresql"
                ;;
            fedora|centos|rhel|rocky|almalinux)
                echo "    sudo systemctl start postgresql"
                ;;
            arch|manjaro)
                echo "    sudo systemctl start postgresql"
                ;;
            *)
                echo "    Start your PostgreSQL service"
                ;;
        esac
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "    brew services start postgresql"
    fi
    echo ""
fi

# Check that SQL script exists
if [ ! -f "$SQL_SCRIPT" ]; then
    echo -e "${RED}Error: SQL script not found at $SQL_SCRIPT${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} SQL script found"

# =============================================================================
# Check for required ROUTE_TRACKER_DB_PASSWORD
# =============================================================================

if [ -z "$ROUTE_TRACKER_DB_PASSWORD" ]; then
    echo ""
    echo -e "${RED}Error: ROUTE_TRACKER_DB_PASSWORD environment variable is required.${NC}"
    echo ""
    echo "Set it with:"
    echo "  export ROUTE_TRACKER_DB_PASSWORD='your-secure-password'"
    echo ""
    echo "Or generate a random password:"
    if command -v openssl &> /dev/null; then
        echo "  export ROUTE_TRACKER_DB_PASSWORD=\$(openssl rand -base64 24)"
    else
        echo "  export ROUTE_TRACKER_DB_PASSWORD=\$(head -c 24 /dev/urandom | base64)"
    fi
    exit 1
fi

# Validate password (basic check)
if [ ${#ROUTE_TRACKER_DB_PASSWORD} -lt 8 ]; then
    echo -e "${YELLOW}Warning: Password is shorter than 8 characters.${NC}"
    echo "Consider using a stronger password for production."
fi

echo ""

# =============================================================================
# Set up PostgreSQL authentication
# =============================================================================

if [ -n "$POSTGRES_PASSWORD" ]; then
    export PGPASSWORD="$POSTGRES_PASSWORD"
    echo "Using password authentication for PostgreSQL"
else
    echo "Using peer/trust authentication for PostgreSQL"
    echo -e "${YELLOW}(Set POSTGRES_PASSWORD if password is required)${NC}"
fi

# =============================================================================
# Create temporary SQL file with password substituted
# =============================================================================

TEMP_SQL=$(mktemp)
trap "rm -f $TEMP_SQL" EXIT

# Escape special characters in password for sed
ESCAPED_PASSWORD=$(printf '%s\n' "$ROUTE_TRACKER_DB_PASSWORD" | sed -e 's/[\/&]/\\&/g')
sed "s/CHANGE_ME_IN_PRODUCTION/$ESCAPED_PASSWORD/g" "$SQL_SCRIPT" > "$TEMP_SQL"

echo ""
echo "Connecting to PostgreSQL at $POSTGRES_HOST:$POSTGRES_PORT..."
echo ""

# =============================================================================
# Execute the SQL script
# =============================================================================

if psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -f "$TEMP_SQL"; then
    echo ""
    echo -e "${GREEN}==================================================${NC}"
    echo -e "${GREEN}  Database setup completed successfully!${NC}"
    echo -e "${GREEN}==================================================${NC}"
    echo ""
    echo "Created:"
    echo "  - User: route_tracker"
    echo "  - Database (prod): route_tracker"
    echo "  - Database (dev):  route_tracker_dev"
    echo ""
    echo "Connection string for ASP.NET Core:"
    echo "  Host=$POSTGRES_HOST;Port=$POSTGRES_PORT;Database=route_tracker;Username=route_tracker;Password=<your-password>"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Run: cd ../RouteTracker"
    echo "  2. Run: dotnet ef database update"
    echo "  3. Run: dotnet run"
else
    EXIT_CODE=$?
    echo ""
    echo -e "${RED}==================================================${NC}"
    echo -e "${RED}  Database setup failed!${NC}"
    echo -e "${RED}==================================================${NC}"
    echo ""
    echo "Troubleshooting:"
    echo ""
    echo "  1. Make sure PostgreSQL is running:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "     brew services start postgresql"
    else
        echo "     sudo systemctl start postgresql"
    fi
    echo ""
    echo "  2. If using password auth, set POSTGRES_PASSWORD:"
    echo "     export POSTGRES_PASSWORD='your-postgres-password'"
    echo ""
    echo "  3. If using peer auth on Linux, try:"
    echo "     sudo -u postgres $0"
    echo ""
    echo "  4. Check PostgreSQL logs for more details:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "     tail -f /usr/local/var/log/postgresql*.log"
    else
        echo "     sudo journalctl -u postgresql -f"
        echo "     # or"
        echo "     sudo tail -f /var/log/postgresql/*.log"
    fi
    exit $EXIT_CODE
fi
