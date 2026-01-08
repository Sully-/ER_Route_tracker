# Database Setup Scripts

This folder contains scripts to set up the PostgreSQL database for Route Tracker.

> **Note:** For complete setup instructions, see [DATABASE_SETUP.md](../../DATABASE_SETUP.md) in the project root.

## Quick Start

### Windows Development

```powershell
# From project root
.\setup-dev-windows.ps1
```

### Linux Development

```bash
# From project root
chmod +x setup-dev-linux.sh
./setup-dev-linux.sh
```

### Linux Production

```bash
chmod +x setup-prod-linux.sh
sudo ./setup-prod-linux.sh --create-service
```

## Prerequisites

- PostgreSQL 14+ installed and running
- `psql` client available in PATH
- .NET SDK 8.0+ (for migrations)
- Superuser access to PostgreSQL (typically `postgres` user)

## Files

| File | Description |
|------|-------------|
| `create-database.ps1` | Database creation script (Windows PowerShell) |
| `create-database.sh` | Database creation script (Linux/macOS bash) |
| `create-database.sql` | SQL commands for database setup |
| `setup-prod-linux.sh` | Complete production setup with systemd service |

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `ROUTE_TRACKER_DB_PASSWORD` | Yes | Password for the `route_tracker` user | - |
| `POSTGRES_PASSWORD` | No | Password for PostgreSQL superuser | - |
| `POSTGRES_HOST` | No | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | No | PostgreSQL port | `5432` |
| `POSTGRES_USER` | No | PostgreSQL superuser | `postgres` |

## What the Scripts Create

- **User**: `route_tracker` - dedicated database user with limited permissions
- **Database**: `route_tracker` - production database
- **Database**: `route_tracker_dev` - development database (dev scripts only)

## Usage Examples

### Windows - Create Database Only

```powershell
cd backend\scripts
.\create-database.ps1 -RouteTrackerPassword "your-password"
```

### Linux - Create Database Only

```bash
cd backend/scripts
export ROUTE_TRACKER_DB_PASSWORD="your-password"
./create-database.sh
```

### Linux - Production with Systemd

```bash
cd backend/scripts
sudo ./setup-prod-linux.sh --create-service --yes
```

## After Database Creation

After running the setup script, you need to apply EF Core migrations:

```bash
cd ../RouteTracker
dotnet ef database update
```

Then start the application:

```bash
# Development
dotnet run

# Production
dotnet run --environment Production
```

## Security Notes

1. **Never commit passwords** - Use environment variables
2. **Use strong passwords** - At least 16 characters for production
3. **Limit network access** - Configure PostgreSQL `pg_hba.conf` appropriately
4. **Use HTTPS** - Configure a reverse proxy (nginx, caddy) for production

### Generate a Secure Password

**Linux/macOS:**
```bash
openssl rand -base64 32
```

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

## Troubleshooting

See the [Troubleshooting section](../../DATABASE_SETUP.md#troubleshooting) in the main documentation.

### Common Issues

**"psql: FATAL: password authentication failed"**
- Check that `POSTGRES_PASSWORD` is set correctly
- Verify the postgres user password in PostgreSQL

**"psql: FATAL: Peer authentication failed" (Linux)**
```bash
sudo -u postgres ./create-database.sh
```

**"permission denied for schema public"**
```sql
\c route_tracker
GRANT ALL ON SCHEMA public TO route_tracker;
```

**"relation does not exist"**
```bash
cd ../RouteTracker
dotnet ef database update
```
