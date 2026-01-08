#!/bin/bash
# =============================================================================
# Route Tracker - Linux Production Setup Script
# =============================================================================
# This script automates the production deployment setup:
# 1. Validates production environment
# 2. Generates a secure random password
# 3. Creates only production database (no dev database)
# 4. Applies EF Core migrations
# 5. Creates environment configuration files
# 6. Optionally creates systemd service
#
# Usage:
#   sudo ./setup-prod-linux.sh
#   sudo ./setup-prod-linux.sh --password "your-secure-password"
#   sudo ./setup-prod-linux.sh --create-service
#
# IMPORTANT: This script should be run with appropriate privileges.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
PASSWORD=""
CREATE_SERVICE=false
SKIP_CONFIRMATION=false
APP_USER="routetracker"
INSTALL_DIR="/opt/routetracker"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --password)
            PASSWORD="$2"
            shift 2
            ;;
        --create-service)
            CREATE_SERVICE=true
            shift
            ;;
        --yes|-y)
            SKIP_CONFIRMATION=true
            shift
            ;;
        --app-user)
            APP_USER="$2"
            shift 2
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --password PASSWORD    Set the database password (default: auto-generate)"
            echo "  --create-service       Create systemd service for the application"
            echo "  --app-user USER        Application user (default: routetracker)"
            echo "  --install-dir DIR      Installation directory (default: /opt/routetracker)"
            echo "  --yes, -y              Skip confirmation prompts"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  POSTGRES_PASSWORD      Password for postgres superuser"
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
echo -e "${BOLD}${RED}==================================================${NC}"
echo -e "${BOLD}${RED}  Route Tracker - PRODUCTION Setup${NC}"
echo -e "${BOLD}${RED}==================================================${NC}"
echo ""
echo -e "${YELLOW}WARNING: This script is intended for PRODUCTION deployment.${NC}"
echo -e "${YELLOW}It will create a production database and configure the system.${NC}"
echo ""

# =============================================================================
# Confirmation
# =============================================================================
if [ "$SKIP_CONFIRMATION" = false ]; then
    read -p "Are you sure you want to proceed? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
fi

# =============================================================================
# Step 0: Check prerequisites
# =============================================================================
echo -e "${YELLOW}Step 0: Checking prerequisites...${NC}"

# Check if running as root or with sudo (for service creation)
if [ "$CREATE_SERVICE" = true ] && [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Creating systemd service requires root privileges.${NC}"
    echo "Run with: sudo $0 --create-service"
    exit 1
fi

# Check PostgreSQL client
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql is not installed.${NC}"
    echo "Please install PostgreSQL client:"
    echo "  Ubuntu/Debian: sudo apt install postgresql-client"
    echo "  RHEL/CentOS:   sudo yum install postgresql"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} psql found"

# Check if PostgreSQL server is accessible
if ! pg_isready -q 2>/dev/null; then
    echo -e "${YELLOW}Warning: PostgreSQL server might not be accessible.${NC}"
    echo "Make sure PostgreSQL is running and accessible."
else
    echo -e "  ${GREEN}✓${NC} PostgreSQL server is accessible"
fi

# Check dotnet
if ! command -v dotnet &> /dev/null; then
    echo -e "${RED}Error: dotnet is not installed.${NC}"
    echo "Please install .NET Runtime:"
    echo "  https://dotnet.microsoft.com/download"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} dotnet found ($(dotnet --version))"

echo ""

# =============================================================================
# Step 1: Generate secure password
# =============================================================================
echo -e "${YELLOW}Step 1: Setting up secure password...${NC}"

if [ -z "$PASSWORD" ]; then
    # Generate a secure random password (32 characters)
    if command -v openssl &> /dev/null; then
        PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    else
        PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
    fi
    echo -e "  ${GREEN}✓${NC} Generated secure random password (32 characters)"
else
    # Validate provided password
    if [ ${#PASSWORD} -lt 16 ]; then
        echo -e "${RED}Error: Password must be at least 16 characters for production.${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} Using provided password"
fi

export ROUTE_TRACKER_DB_PASSWORD="$PASSWORD"
echo ""

# =============================================================================
# Step 2: Create production database only
# =============================================================================
echo -e "${YELLOW}Step 2: Creating production database...${NC}"

SQL_SCRIPT="$SCRIPT_DIR/create-database.sql"

if [ ! -f "$SQL_SCRIPT" ]; then
    echo -e "${RED}Error: SQL script not found at $SQL_SCRIPT${NC}"
    exit 1
fi

# Create temporary SQL file for production only (no dev database)
TEMP_SQL=$(mktemp)
trap "rm -f $TEMP_SQL" EXIT

# Modify SQL to only create production database
cat > "$TEMP_SQL" << 'EOSQL'
-- Production-only database setup
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'route_tracker') THEN
        CREATE ROLE route_tracker WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
        RAISE NOTICE 'User route_tracker created successfully';
    ELSE
        ALTER ROLE route_tracker WITH PASSWORD 'CHANGE_ME_IN_PRODUCTION';
        RAISE NOTICE 'User route_tracker already exists, password updated';
    END IF;
END
$$;

-- Create production database only
SELECT 'CREATE DATABASE route_tracker OWNER route_tracker'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'route_tracker')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE route_tracker TO route_tracker;

-- Grant schema permissions
\c route_tracker
GRANT ALL ON SCHEMA public TO route_tracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO route_tracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO route_tracker;

\c postgres
SELECT '✅ Production database setup completed!' AS status;
EOSQL

# Replace password placeholder
sed -i "s/CHANGE_ME_IN_PRODUCTION/$PASSWORD/g" "$TEMP_SQL"

# Set PGPASSWORD if provided
if [ -n "$POSTGRES_PASSWORD" ]; then
    export PGPASSWORD="$POSTGRES_PASSWORD"
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

if psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -f "$TEMP_SQL"; then
    echo -e "  ${GREEN}✓${NC} Production database created"
else
    echo -e "${RED}Database creation failed!${NC}"
    exit 1
fi

echo ""

# =============================================================================
# Step 3: Apply EF Core migrations
# =============================================================================
echo -e "${YELLOW}Step 3: Applying EF Core migrations...${NC}"

ROUTE_TRACKER_PATH="$PROJECT_ROOT/backend/RouteTracker"

if [ ! -d "$ROUTE_TRACKER_PATH" ]; then
    echo -e "${RED}Error: RouteTracker project not found at $ROUTE_TRACKER_PATH${NC}"
    exit 1
fi

cd "$ROUTE_TRACKER_PATH"

# Set environment to Production for migrations
export ASPNETCORE_ENVIRONMENT=Production

if dotnet ef database update; then
    echo -e "  ${GREEN}✓${NC} Migrations applied successfully"
else
    echo -e "${RED}Migration failed!${NC}"
    cd "$PROJECT_ROOT"
    exit 1
fi

cd "$PROJECT_ROOT"
echo ""

# =============================================================================
# Step 4: Create environment file
# =============================================================================
echo -e "${YELLOW}Step 4: Creating environment configuration...${NC}"

ENV_FILE="$PROJECT_ROOT/backend/RouteTracker/.env.production"

cat > "$ENV_FILE" << EOF
# Route Tracker Production Environment
# Generated on $(date)
# IMPORTANT: Keep this file secure and never commit to version control!

ROUTE_TRACKER_DB_PASSWORD=$PASSWORD
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://localhost:5000
EOF

chmod 600 "$ENV_FILE"
echo -e "  ${GREEN}✓${NC} Created $ENV_FILE"

# Create .env.example for documentation
ENV_EXAMPLE="$PROJECT_ROOT/backend/RouteTracker/.env.example"
cat > "$ENV_EXAMPLE" << 'EOF'
# Route Tracker Environment Variables
# Copy this file to .env.production and fill in the values

# Database password for route_tracker user (required)
ROUTE_TRACKER_DB_PASSWORD=your-secure-password-here

# ASP.NET Core environment (Production, Development, Staging)
ASPNETCORE_ENVIRONMENT=Production

# Application URLs
ASPNETCORE_URLS=http://localhost:5000

# Optional: PostgreSQL connection settings (if not using defaults)
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432
EOF

echo -e "  ${GREEN}✓${NC} Created $ENV_EXAMPLE"
echo ""

# =============================================================================
# Step 5: Create systemd service (optional)
# =============================================================================
if [ "$CREATE_SERVICE" = true ]; then
    echo -e "${YELLOW}Step 5: Creating systemd service...${NC}"
    
    # Create application user if it doesn't exist
    if ! id "$APP_USER" &>/dev/null; then
        useradd -r -s /bin/false "$APP_USER"
        echo -e "  ${GREEN}✓${NC} Created user $APP_USER"
    fi
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    
    # Build and publish the application
    echo "  Building application..."
    cd "$ROUTE_TRACKER_PATH"
    dotnet publish -c Release -o "$INSTALL_DIR"
    
    # Copy environment file
    cp "$ENV_FILE" "$INSTALL_DIR/.env"
    
    # Set ownership
    chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
    chmod 600 "$INSTALL_DIR/.env"
    
    # Create systemd service file
    SERVICE_FILE="/etc/systemd/system/routetracker.service"
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Route Tracker API
After=network.target postgresql.service

[Service]
Type=notify
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/dotnet $INSTALL_DIR/RouteTracker.dll
EnvironmentFile=$INSTALL_DIR/.env
Restart=always
RestartSec=10
KillSignal=SIGINT
SyslogIdentifier=routetracker

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    echo -e "  ${GREEN}✓${NC} Created systemd service"
    echo ""
    echo -e "${CYAN}To manage the service:${NC}"
    echo "  sudo systemctl start routetracker    # Start the service"
    echo "  sudo systemctl stop routetracker     # Stop the service"
    echo "  sudo systemctl enable routetracker   # Enable on boot"
    echo "  sudo systemctl status routetracker   # Check status"
    echo "  sudo journalctl -u routetracker -f   # View logs"
    
    cd "$PROJECT_ROOT"
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}  Production Setup Complete!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo -e "${BOLD}Database credentials:${NC}"
echo "  Database: route_tracker"
echo "  Username: route_tracker"
echo "  Password: $PASSWORD"
echo ""
echo -e "${BOLD}${RED}IMPORTANT: Save this password securely!${NC}"
echo "  It is stored in: $ENV_FILE"
echo ""
echo -e "${CYAN}Connection string:${NC}"
echo "  Host=$POSTGRES_HOST;Port=$POSTGRES_PORT;Database=route_tracker;Username=route_tracker;Password=<see .env.production>"
echo ""

if [ "$CREATE_SERVICE" = false ]; then
    echo -e "${CYAN}To start the application manually:${NC}"
    echo "  cd backend/RouteTracker"
    echo "  export ROUTE_TRACKER_DB_PASSWORD=\"$PASSWORD\""
    echo "  dotnet run --environment Production"
    echo ""
    echo -e "${YELLOW}For systemd service, run again with --create-service${NC}"
fi

echo ""
echo -e "${YELLOW}Security checklist:${NC}"
echo "  [ ] Backup the password from .env.production"
echo "  [ ] Configure firewall (ufw, iptables)"
echo "  [ ] Set up HTTPS with reverse proxy (nginx, caddy)"
echo "  [ ] Configure PostgreSQL pg_hba.conf for security"
echo "  [ ] Set up log rotation"
echo "  [ ] Configure backups"
echo ""
