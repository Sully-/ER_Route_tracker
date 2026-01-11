# Daily Deployment

Guide for deploying Route Tracker updates to the production server.

**Prerequisite:** The server must already be configured (see `UBUNTU_DEPLOYMENT_GUIDE.md` for initial setup).

---

## Quick Summary

```powershell
# 1. On Windows: create packages
.\scripts\website\deploy\package.ps1 -BackendUrl "http://your-server:5000"

# 2. Transfer the .zip files to the server

# 3. On the server: deploy
sudo systemctl stop routetracker
unzip -o routetracker-backend-*.zip -d /opt/routetracker/backend/
unzip -o routetracker-frontend-*.zip -d /opt/routetracker/frontend/
sudo systemctl start routetracker
```

---

## Step 1: Create Packages

### On Windows (development machine)

```powershell
# From the project root
cd Route_tracking

# Create packages
.\scripts\website\deploy\package.ps1 -BackendUrl "http://192.168.1.100:5000"
```

**Available options:**

| Option | Description |
|--------|-------------|
| `-BackendUrl` | Backend URL (required) |
| `-OutputDir` | Output folder (default: `packages`) |
| `-SkipBackend` | Don't build the backend |
| `-SkipFrontend` | Don't build the frontend |
| `-Combined` | Also create a combined package |

**Examples:**

```powershell
# Frontend only
.\scripts\website\deploy\package.ps1 -BackendUrl "https://api.example.com" -SkipBackend

# Combined package in a custom folder
.\scripts\website\deploy\package.ps1 -BackendUrl "http://srv:5000" -OutputDir "releases" -Combined
```

**Output files:**
```
packages/
├── routetracker-backend-20260110-143022.zip
└── routetracker-frontend-20260110-143022.zip
```

---

## Step 2: Transfer to Server

### Option A: WinSCP (GUI)

1. Open WinSCP
2. Connect to the server (SFTP, port 22)
3. Navigate to `/tmp/` on the server
4. Drag and drop the .zip files

### Option B: SCP (command line)

```powershell
# From Windows (with OpenSSH)
scp packages\routetracker-*.zip user@server:/tmp/
```

### Option C: rsync

```bash
rsync -avz packages/ user@server:/tmp/packages/
```

---

## Step 3: Deploy on Server

### Connect to the server

```bash
ssh user@server
```

### Stop the service

```bash
sudo systemctl stop routetracker
```

### Deploy the backend

```bash
cd /tmp

# Backup the old version (optional)
sudo cp -r /opt/routetracker/backend /opt/routetracker/backend.bak

# Extract the new version
sudo unzip -o routetracker-backend-*.zip -d /opt/routetracker/backend/

# Restore permissions
sudo chown -R routetracker:routetracker /opt/routetracker/backend
```

### Deploy the frontend

```bash
# Backup the old version (optional)
sudo cp -r /opt/routetracker/frontend /opt/routetracker/frontend.bak

# Extract the new version
sudo unzip -o routetracker-frontend-*.zip -d /opt/routetracker/frontend/

# Restore permissions
sudo chown -R www-data:www-data /opt/routetracker/frontend
```

### Restart the service

```bash
sudo systemctl start routetracker

# Check status
sudo systemctl status routetracker
```

### Clean up temporary files

```bash
rm /tmp/routetracker-*.zip
```

---

## Step 4: Verification

### Check the service

```bash
sudo systemctl status routetracker
sudo journalctl -u routetracker -n 20
```

### Test the API

```bash
curl http://localhost:5000/api/Keys/generate
```

### Test the frontend

Open in a browser: `http://your-server/`

---

## Automated Deployment Script

Create this script on the server to automate deployment:

```bash
#!/bin/bash
# /opt/routetracker/deploy.sh

set -e

DEPLOY_DIR="/tmp"
INSTALL_DIR="/opt/routetracker"

echo "=== Route Tracker Deployment ==="

# Stop the service
echo "Stopping service..."
sudo systemctl stop routetracker

# Backend
if ls $DEPLOY_DIR/routetracker-backend-*.zip 1> /dev/null 2>&1; then
    echo "Deploying backend..."
    sudo unzip -o $DEPLOY_DIR/routetracker-backend-*.zip -d $INSTALL_DIR/backend/
    sudo chown -R routetracker:routetracker $INSTALL_DIR/backend
fi

# Frontend
if ls $DEPLOY_DIR/routetracker-frontend-*.zip 1> /dev/null 2>&1; then
    echo "Deploying frontend..."
    sudo unzip -o $DEPLOY_DIR/routetracker-frontend-*.zip -d $INSTALL_DIR/frontend/
    sudo chown -R www-data:www-data $INSTALL_DIR/frontend
fi

# Restart
echo "Starting service..."
sudo systemctl start routetracker

# Cleanup
rm -f $DEPLOY_DIR/routetracker-*.zip

echo "=== Deployment complete ==="
sudo systemctl status routetracker --no-pager
```

Usage:
```bash
chmod +x /opt/routetracker/deploy.sh
# After transferring the .zip files to /tmp:
/opt/routetracker/deploy.sh
```

---

## Rollback

If something goes wrong after deployment:

```bash
# Stop the service
sudo systemctl stop routetracker

# Restore backups
sudo rm -rf /opt/routetracker/backend
sudo mv /opt/routetracker/backend.bak /opt/routetracker/backend

sudo rm -rf /opt/routetracker/frontend
sudo mv /opt/routetracker/frontend.bak /opt/routetracker/frontend

# Restart
sudo systemctl start routetracker
```

---

## Deployment Checklist

- [ ] Create packages on Windows
- [ ] Transfer .zip files to the server
- [ ] Stop the service (`systemctl stop routetracker`)
- [ ] Extract the backend
- [ ] Extract the frontend
- [ ] Verify permissions
- [ ] Start the service (`systemctl start routetracker`)
- [ ] Check logs (`journalctl -u routetracker`)
- [ ] Test the API
- [ ] Test the frontend
- [ ] Clean up temporary files

---

## Troubleshooting

### Service won't start

```bash
# View detailed logs
sudo journalctl -u routetracker -n 100

# Check permissions
ls -la /opt/routetracker/backend/

# Test manually
cd /opt/routetracker/backend
sudo -u routetracker dotnet RouteTracker.dll
```

### 502 Bad Gateway error

The backend is not accessible by Nginx:

```bash
# Check that the backend is listening
sudo netstat -tlnp | grep 5000

# Check Nginx
sudo nginx -t
sudo systemctl status nginx
```

### Frontend shows old version

Clear browser cache (Ctrl+F5) or check Nginx cache:

```bash
sudo systemctl reload nginx
```
