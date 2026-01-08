# Database Setup Guide

This guide covers the complete setup of the PostgreSQL database for Route Tracker in different environments.

## Quick Start

### Windows Development (Recommended)

```powershell
# Run the automated setup script
.\setup-dev-windows.ps1

# Or with a custom password
.\setup-dev-windows.ps1 -Password "my-password"
```

### Linux Development

```bash
# Run the automated setup script
chmod +x setup-dev-linux.sh
./setup-dev-linux.sh

# Or with a custom password
./setup-dev-linux.sh --password "my-password"
```

### Linux Production

```bash
# Run with sudo for full setup including systemd service
cd backend/scripts
chmod +x setup-prod-linux.sh
sudo ./setup-prod-linux.sh --create-service
```

## Prerequisites

### Windows

1. **PostgreSQL 14+** - [Download](https://www.postgresql.org/download/windows/)
   - During installation, note the password you set for the `postgres` user
   - Add PostgreSQL bin to PATH (usually `C:\Program Files\PostgreSQL\16\bin`)

2. **.NET SDK 8.0+** - [Download](https://dotnet.microsoft.com/download)

3. **EF Core Tools** (installed automatically by setup script):
   ```powershell
   dotnet tool install --global dotnet-ef
   ```

### Linux

1. **PostgreSQL 14+**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql postgresql-client

   # Fedora
   sudo dnf install postgresql-server postgresql

   # Arch Linux
   sudo pacman -S postgresql

   # Start PostgreSQL
   sudo systemctl start postgresql
   sudo systemctl enable postgresql
   ```

2. **.NET SDK 8.0+**
   ```bash
   # Ubuntu/Debian
   sudo apt install dotnet-sdk-8.0

   # Or using Microsoft's repository (for latest version)
   # See: https://docs.microsoft.com/dotnet/core/install/linux
   ```

3. **EF Core Tools**
   ```bash
   dotnet tool install --global dotnet-ef
   ```

## Detailed Setup

### Windows Development Setup

#### Automated Setup (Recommended)

The `setup-dev-windows.ps1` script handles everything:

```powershell
# Navigate to project root
cd Route_tracking

# Run setup with default password
.\setup-dev-windows.ps1

# Or generate a random password
.\setup-dev-windows.ps1 -GeneratePassword

# Or specify a custom password
.\setup-dev-windows.ps1 -Password "my-secure-password"

# If PostgreSQL requires a password for the postgres user
.\setup-dev-windows.ps1 -PostgresPassword "postgres-admin-password"
```

The script will:
1. Check prerequisites (dotnet, psql)
2. Create the `route_tracker` user and databases
3. Set the `ROUTE_TRACKER_DB_PASSWORD` environment variable
4. Apply EF Core migrations

#### Manual Setup

If you prefer manual setup:

1. **Create the database:**
   ```powershell
   cd backend\scripts
   .\create-database.ps1 -RouteTrackerPassword "your-password"
   ```

2. **Set environment variable (PowerShell session):**
   ```powershell
   $env:ROUTE_TRACKER_DB_PASSWORD = "your-password"
   ```

   Or permanently (User level):
   ```powershell
   [System.Environment]::SetEnvironmentVariable('ROUTE_TRACKER_DB_PASSWORD', 'your-password', 'User')
   ```

3. **Apply migrations:**
   ```powershell
   cd backend\RouteTracker
   dotnet ef database update
   ```

4. **Run the application:**
   ```powershell
   dotnet run
   ```

### Linux Development Setup

#### Automated Setup (Recommended)

```bash
# Navigate to project root
cd Route_tracking

# Make script executable
chmod +x setup-dev-linux.sh

# Run setup with default password
./setup-dev-linux.sh

# Or generate a random password
./setup-dev-linux.sh --generate-password

# Or specify a custom password
./setup-dev-linux.sh --password "my-secure-password"
```

If PostgreSQL uses password authentication:
```bash
export POSTGRES_PASSWORD="postgres-admin-password"
./setup-dev-linux.sh
```

If using peer authentication (default on many Linux distros):
```bash
sudo -u postgres ./setup-dev-linux.sh
```

#### Manual Setup

1. **Create the database:**
   ```bash
   cd backend/scripts
   export ROUTE_TRACKER_DB_PASSWORD="your-password"
   chmod +x create-database.sh
   ./create-database.sh
   ```

2. **Apply migrations:**
   ```bash
   cd ../RouteTracker
   dotnet ef database update
   ```

3. **Add to shell profile (optional):**
   ```bash
   echo 'export ROUTE_TRACKER_DB_PASSWORD="your-password"' >> ~/.bashrc
   source ~/.bashrc
   ```

4. **Run the application:**
   ```bash
   dotnet run
   ```

### Linux Production Setup

#### Automated Setup with Systemd Service

```bash
cd backend/scripts
chmod +x setup-prod-linux.sh

# Full setup with systemd service
sudo ./setup-prod-linux.sh --create-service

# Custom installation directory
sudo ./setup-prod-linux.sh --create-service --install-dir /srv/routetracker

# With a specific password (must be 16+ characters)
sudo ./setup-prod-linux.sh --password "your-very-secure-password-here"
```

The script will:
1. Generate a secure 32-character random password
2. Create only the production database (no dev database)
3. Apply migrations
4. Create `.env.production` file with credentials
5. Build and publish the application
6. Create a systemd service

#### Managing the Service

```bash
# Start the service
sudo systemctl start routetracker

# Stop the service
sudo systemctl stop routetracker

# Enable on boot
sudo systemctl enable routetracker

# Check status
sudo systemctl status routetracker

# View logs
sudo journalctl -u routetracker -f
```

#### Manual Production Setup

1. **Generate a secure password:**
   ```bash
   export ROUTE_TRACKER_DB_PASSWORD=$(openssl rand -base64 32)
   echo "Password: $ROUTE_TRACKER_DB_PASSWORD"
   # Save this password securely!
   ```

2. **Create the database:**
   ```bash
   cd backend/scripts
   chmod +x create-database.sh
   ./create-database.sh
   ```

3. **Apply migrations:**
   ```bash
   cd ../RouteTracker
   ASPNETCORE_ENVIRONMENT=Production dotnet ef database update
   ```

4. **Build for production:**
   ```bash
   dotnet publish -c Release -o /opt/routetracker
   ```

5. **Create environment file:**
   ```bash
   cat > /opt/routetracker/.env << EOF
   ROUTE_TRACKER_DB_PASSWORD=your-password
   ASPNETCORE_ENVIRONMENT=Production
   ASPNETCORE_URLS=http://localhost:5000
   EOF
   chmod 600 /opt/routetracker/.env
   ```

6. **Create systemd service manually:**
   ```bash
   sudo cat > /etc/systemd/system/routetracker.service << EOF
   [Unit]
   Description=Route Tracker API
   After=network.target postgresql.service

   [Service]
   Type=notify
   User=www-data
   WorkingDirectory=/opt/routetracker
   ExecStart=/usr/bin/dotnet /opt/routetracker/RouteTracker.dll
   EnvironmentFile=/opt/routetracker/.env
   Restart=always

   [Install]
   WantedBy=multi-user.target
   EOF

   sudo systemctl daemon-reload
   sudo systemctl enable routetracker
   sudo systemctl start routetracker
   ```

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `ROUTE_TRACKER_DB_PASSWORD` | Yes | Password for the `route_tracker` database user | - |
| `POSTGRES_PASSWORD` | No | Password for PostgreSQL superuser (if using password auth) | - |
| `POSTGRES_HOST` | No | PostgreSQL server host | `localhost` |
| `POSTGRES_PORT` | No | PostgreSQL server port | `5432` |
| `POSTGRES_USER` | No | PostgreSQL superuser name | `postgres` |

## Database Structure

The setup creates:

| Database | Purpose |
|----------|---------|
| `route_tracker` | Production database |
| `route_tracker_dev` | Development database |

Both databases are owned by the `route_tracker` user with full privileges.

## Connection Strings

**Development** (uses `route_tracker_dev`):
```
Host=localhost;Port=5432;Database=route_tracker_dev;Username=route_tracker;Password=<your-password>
```

**Production** (uses `route_tracker`):
```
Host=localhost;Port=5432;Database=route_tracker;Username=route_tracker;Password=<your-password>
```

## Security Best Practices

### Development

- Use a simple password like `dev-password-123` for convenience
- The development database (`route_tracker_dev`) is separate from production

### Production

1. **Strong passwords**: Use at least 16 characters, randomly generated
   ```bash
   openssl rand -base64 32
   ```

2. **Environment variables**: Never commit passwords to version control
   - Use `.env` files (add to `.gitignore`)
   - Or use secrets management (AWS Secrets Manager, Azure Key Vault, etc.)

3. **Network security**:
   - Configure PostgreSQL `pg_hba.conf` to restrict access
   - Use firewall rules to limit database access
   - Consider using SSL for database connections

4. **Reverse proxy**: Always use HTTPS in production
   ```bash
   # Example nginx configuration
   server {
       listen 443 ssl;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection keep-alive;
           proxy_set_header Host $host;
       }
   }
   ```

## Troubleshooting

### "psql is not recognized" (Windows)

Add PostgreSQL to your PATH:
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```

Or add permanently via System Properties > Environment Variables.

### "Execution policy" error (Windows)

Allow script execution:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "password authentication failed"

- Check that `POSTGRES_PASSWORD` is set correctly
- Verify the postgres user password in PostgreSQL
- On Windows, try using the password you set during PostgreSQL installation

### "Peer authentication failed" (Linux)

Use sudo to run as the postgres user:
```bash
sudo -u postgres ./create-database.sh
```

Or configure password authentication in `/etc/postgresql/*/main/pg_hba.conf`:
```
# Change from:
local   all   all   peer
# To:
local   all   all   md5
```
Then restart PostgreSQL: `sudo systemctl restart postgresql`

### "permission denied for schema public"

This can happen on PostgreSQL 15+. The setup scripts handle this, but if needed:
```sql
\c route_tracker
GRANT ALL ON SCHEMA public TO route_tracker;
```

### "relation does not exist"

Run EF Core migrations:
```bash
cd backend/RouteTracker
dotnet ef database update
```

### Connection refused

1. Check if PostgreSQL is running:
   ```bash
   # Linux
   sudo systemctl status postgresql
   
   # Windows (PowerShell as Admin)
   Get-Service postgresql*
   ```

2. Check if PostgreSQL is listening on the expected port:
   ```bash
   # Linux
   sudo netstat -tlnp | grep 5432
   
   # Windows
   netstat -an | findstr 5432
   ```

## Files Reference

| File | Description |
|------|-------------|
| `setup-dev-windows.ps1` | Complete Windows development setup |
| `setup-dev-linux.sh` | Complete Linux development setup |
| `backend/scripts/setup-prod-linux.sh` | Production deployment script |
| `backend/scripts/create-database.ps1` | Database creation (Windows) |
| `backend/scripts/create-database.sh` | Database creation (Linux) |
| `backend/scripts/create-database.sql` | SQL commands for database setup |
