# Database Setup

Guide to configure PostgreSQL before the first launch of Route Tracker.

**This guide is standalone** - you don't need the source code or .NET, only the provided SQL scripts.

---

## Prerequisites

- **PostgreSQL 14+** installed and running
- PostgreSQL superuser access (`postgres` user)

### Installing PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-client -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**RHEL/CentOS/Rocky:**
```bash
sudo dnf install postgresql-server postgresql -y
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

---

## Quick Setup

### Option 1: Automatic script (recommended)

```bash
# Download the scripts (or copy from the repo)
# Required files:
#   - setup-database.sql
#   - setup-database.sh

# Make the script executable
chmod +x setup-database.sh

# Run (generates a random password)
sudo -u postgres ./setup-database.sh
```

The script will display the generated password. **Save it!**

### Option 2: With a custom password

```bash
sudo -u postgres ./setup-database.sh --password "your-secure-password"
```

### Option 3: Manual SQL execution

```bash
# 1. Edit the SQL script and replace {PASSWORD} with your password
nano setup-database.sql

# 2. Execute the script
sudo -u postgres psql -f setup-database.sql
```

---

## Verification

### Test the connection

```bash
psql -U route_tracker -d route_tracker -h localhost
# Enter the password when prompted
```

### Check the tables

```sql
-- In psql:
\dt

-- You should see:
--  KeyPairs
--  RoutePoints
--  __EFMigrationsHistory
```

### Connection string for the application

```
Host=localhost;Port=5432;Database=route_tracker;Username=route_tracker;Password=<your_password>
```

---

## Backend Configuration

Create a `.env` file in the backend folder with:

```bash
ROUTE_TRACKER_DB_PASSWORD=your_password
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://localhost:5000
```

Secure the file:
```bash
chmod 600 .env
```

---

## Troubleshooting

### "psql: command not found"

PostgreSQL client is not installed:
```bash
# Ubuntu/Debian
sudo apt install postgresql-client

# macOS
brew install postgresql
```

### "Peer authentication failed"

On Linux, PostgreSQL uses "peer" authentication by default. Solutions:

**Option A:** Run as postgres user
```bash
sudo -u postgres ./setup-database.sh
```

**Option B:** Modify pg_hba.conf to use md5
```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf

# Change "peer" to "md5" for local connections:
# local   all   all   md5

sudo systemctl restart postgresql
```

### "Password authentication failed"

Check that:
1. The password is correct
2. The user exists: `sudo -u postgres psql -c "\du"`
3. The database exists: `sudo -u postgres psql -c "\l"`

### "Connection refused"

PostgreSQL is not running:
```bash
sudo systemctl start postgresql
sudo systemctl status postgresql
```

---

## Provided Files

| File | Description |
|------|-------------|
| `setup-database.sql` | Complete SQL script (database + user + tables) |
| `setup-database.sh` | Bash script for automatic execution |

These files are located in `scripts/website/backend/database/`.

---

## Production Security

1. **Strong password**: Use at least 16 random characters
2. **.env file**: Never commit to git
3. **Firewall**: Restrict access to port 5432
4. **pg_hba.conf**: Restrict allowed connections
5. **Backups**: Configure regular backups

```bash
# Generate a secure password
openssl rand -base64 24

# Backup the database
pg_dump -U route_tracker -d route_tracker > backup_$(date +%Y%m%d).sql
```
