# Initial Ubuntu Setup

Guide to configure a fresh Ubuntu server to host Route Tracker.

**For daily updates**, see [DAILY_DEPLOYMENT.md](DAILY_DEPLOYMENT.md).

**Note:** This guide assumes you have a domain name. For IP-only access, HTTPS setup is optional but still recommended.

---

## Table of Contents

1. [System Prerequisites](#1-system-prerequisites)
2. [PostgreSQL Installation](#2-postgresql-installation)
3. [.NET Runtime Installation](#3-net-runtime-installation)
4. [Nginx Installation](#4-nginx-installation)
5. [Certbot Installation](#5-certbot-installation)
6. [Database Configuration](#6-database-configuration)
7. [Initial Application Deployment](#7-initial-application-deployment)
8. [Systemd Service Configuration](#8-systemd-service-configuration)
9. [Nginx Configuration with HTTPS](#9-nginx-configuration-with-https)
10. [Final Verification](#10-final-verification)

---

## 1. System Prerequisites

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 2. PostgreSQL Installation

```bash
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## 3. .NET Runtime Installation

```bash
# Add Microsoft repository
wget https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb

# Install .NET Runtime 10.0
sudo apt update
sudo apt install -y dotnet-runtime-10.0

# Verify
dotnet --version
```

---

## 4. Nginx Installation

```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## 5. Certbot Installation

Install Certbot for automatic SSL certificates (Let's Encrypt):

```bash
sudo apt install certbot python3-certbot-nginx -y
```

**Note:** You'll configure HTTPS after setting up Nginx and before finalizing the configuration.

---

## 6. Database Configuration

### Option A: Using scripts (recommended)

Copy `setup-database.sql` and `setup-database.sh` to the server, then:

```bash
chmod +x setup-database.sh
sudo -u postgres ./setup-database.sh
```

Save the displayed password.

### Option B: Manually

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE route_tracker WITH LOGIN PASSWORD 'your-password';
CREATE DATABASE route_tracker OWNER route_tracker;
GRANT ALL PRIVILEGES ON DATABASE route_tracker TO route_tracker;
\c route_tracker
GRANT ALL ON SCHEMA public TO route_tracker;
\q
```

See [DATABASE_SETUP.md](DATABASE_SETUP.md) for more details.

---

## 7. Initial Application Deployment

### Create the structure

```bash
sudo mkdir -p /opt/routetracker/backend
sudo mkdir -p /opt/routetracker/frontend
sudo useradd -r -s /bin/false routetracker
sudo chown -R routetracker:routetracker /opt/routetracker
```

### Transfer files

From Windows, create the packages. **Use your domain/subdomain with HTTPS:**

**If using a subdomain:**
```powershell
.\scripts\website\deploy\package.ps1 -BackendUrl "https://route-tracker.yourdomain.com"
```

**If using the main domain:**
```powershell
.\scripts\website\deploy\package.ps1 -BackendUrl "https://your-domain.com"
```

**Important:** This URL is what the browser will use to call the API. It must match your Nginx `server_name` configuration.

Transfer the .zip files and extract:
```bash
sudo unzip routetracker-backend-*.zip -d /opt/routetracker/backend/
sudo unzip routetracker-frontend-*.zip -d /opt/routetracker/frontend/
sudo chown -R routetracker:routetracker /opt/routetracker/backend
sudo chown -R www-data:www-data /opt/routetracker/frontend
```

### Create the .env file

```bash
sudo nano /opt/routetracker/backend/.env
```

Content:
```
ROUTE_TRACKER_DB_PASSWORD=your-db-password
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://localhost:5000
```

```bash
sudo chmod 600 /opt/routetracker/backend/.env
sudo chown routetracker:routetracker /opt/routetracker/backend/.env
```

---

## 8. Systemd Service Configuration

```bash
sudo nano /etc/systemd/system/routetracker.service
```

Content:
```ini
[Unit]
Description=Route Tracker API
After=network.target postgresql.service

[Service]
Type=simple
User=routetracker
Group=routetracker
WorkingDirectory=/opt/routetracker/backend
ExecStart=/usr/bin/dotnet /opt/routetracker/backend/RouteTracker.dll
EnvironmentFile=/opt/routetracker/backend/.env
Restart=always
RestartSec=10
KillSignal=SIGINT
SyslogIdentifier=routetracker

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/routetracker/backend

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable routetracker
sudo systemctl start routetracker
sudo systemctl status routetracker
```

---

## 9. Nginx Configuration with HTTPS

### Domain Setup Options

You have two options for hosting Route Tracker:

1. **Dedicated domain/subdomain** (recommended): Use a separate domain like `routetracker.example.com` or a subdomain like `route-tracker.example.com`
2. **Same domain, different path**: Host on the same domain but different path (not recommended for production)

**If you already have other sites on this server**, use option 1 with a subdomain. Each Nginx `server_name` is independent, so your existing sites won't be affected.

### Step 1: DNS Configuration

**If using a subdomain** (e.g., `route-tracker.yourdomain.com`):
- Add an **A record** in your DNS:
  - **Name:** `route-tracker` (or `route-tracker.yourdomain.com` depending on your DNS provider)
  - **Type:** A
  - **Value:** Your server's IP address (same as your main domain)

Wait for DNS propagation (usually 5-30 minutes, can take up to 48 hours). Verify with:
```bash
dig route-tracker.yourdomain.com
# or
nslookup route-tracker.yourdomain.com
```

### Step 2: Initial HTTP configuration (for Certbot)

Create a new Nginx configuration file. **Use a descriptive name based on your domain/subdomain:**

```bash
sudo nano /etc/nginx/sites-available/route-tracker.yourdomain.com
```

**Or if using the main domain:**

```bash
sudo nano /etc/nginx/sites-available/routetracker
```

Content (replace `YOUR_DOMAIN_OR_SUBDOMAIN` with your actual domain/subdomain):
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_SUBDOMAIN;

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /hubs/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location / {
        root /opt/routetracker/frontend;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        root /opt/routetracker/frontend;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:
```bash
# For subdomain
sudo ln -s /etc/nginx/sites-available/route-tracker.yourdomain.com /etc/nginx/sites-enabled/

# OR for main domain (only if you don't have other sites)
sudo ln -s /etc/nginx/sites-available/routetracker /etc/nginx/sites-enabled/
# sudo rm -f /etc/nginx/sites-enabled/default  # Only if replacing default site

sudo nginx -t
sudo systemctl reload nginx
```

**Note:** If you already have other sites, **don't remove the default site** - just add the new configuration. Nginx will route requests to the correct site based on the `server_name` directive.

### Step 3: Obtain SSL certificate

**Important:** Make sure your domain/subdomain DNS is properly configured and propagated before running Certbot.

```bash
# For subdomain
sudo certbot --nginx -d route-tracker.yourdomain.com

# OR for main domain
sudo certbot --nginx -d yourdomain.com
```

Certbot will:
1. Ask for your email (for renewal notifications)
2. Ask you to agree to terms
3. Ask if you want to redirect HTTP to HTTPS (choose **Yes** - recommended)
4. Automatically configure SSL and update your Nginx configuration

### Step 4: Verify Nginx configuration

After Certbot, your Nginx config will be updated to include HTTPS. Verify:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Common Scenario: Multiple Sites on Same Server

If you already have a site (e.g., `example.com` listening on port 8080), you can safely add Route Tracker as a subdomain:

**Example setup:**
- `example.com` → existing site (port 8080)
- `route-tracker.example.com` → Route Tracker (new)

Each site has its own configuration file and `server_name`, so they won't interfere with each other.

**List existing Nginx sites:**
```bash
ls -la /etc/nginx/sites-enabled/
```

### Manual HTTPS configuration (if Certbot fails)

If Certbot doesn't work or you need manual configuration, here's the full HTTPS config:

```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_SUBDOMAIN;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN_OR_SUBDOMAIN;

    # Update these paths to match your domain/subdomain
    ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN_OR_SUBDOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN_OR_SUBDOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /hubs/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location / {
        root /opt/routetracker/frontend;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        root /opt/routetracker/frontend;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Multiple Domains/Subdomains

If you need to add multiple subdomains or manage multiple sites:

```bash
# List all Nginx configurations
ls /etc/nginx/sites-available/

# Check active sites
ls /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload after changes
sudo systemctl reload nginx
```

Each configuration file is independent - you can have:
- `sites-available/main-site.com`
- `sites-available/route-tracker.example.com`
- `sites-available/another-app.example.com`

All enabled via symlinks in `sites-enabled/`.

### Automatic certificate renewal

Certbot sets up automatic renewal, but verify it's working:

```bash
# Test renewal (dry run)
sudo certbot renew --dry-run

# Check renewal timer
sudo systemctl status certbot.timer
```

---

## 10. Final Verification

```bash
# Services
sudo systemctl status postgresql
sudo systemctl status routetracker
sudo systemctl status nginx

# Test API directly
curl -X POST http://localhost:5000/api/Keys/generate

# Test via Nginx (HTTPS)
curl -X POST https://YOUR_DOMAIN_OR_SUBDOMAIN/api/Keys/generate

# Test HTTP redirect (should redirect to HTTPS)
curl -X POST -I http://YOUR_DOMAIN_OR_SUBDOMAIN/api/Keys/generate
```

Open in a browser: `https://YOUR_DOMAIN_OR_SUBDOMAIN/`

**Example:** If your subdomain is `route-tracker.example.com`, use `https://route-tracker.example.com/`

**Note:** If you see certificate warnings, make sure your domain DNS is properly configured and wait a few minutes for DNS propagation.

---

## Troubleshooting HTTPS

### Certificate not found

Make sure your domain DNS points to this server:
```bash
dig YOUR_DOMAIN
```

### Mixed content errors

Ensure your frontend was built with HTTPS URL matching your Nginx `server_name`:
```bash
# Rebuild frontend with HTTPS (use your actual domain/subdomain)
.\scripts\website\deploy\package.ps1 -BackendUrl "https://route-tracker.yourdomain.com"
```

### Existing site conflicts

If you have issues accessing Route Tracker but other sites work:
- Check that the `server_name` matches your domain/subdomain exactly
- Verify DNS is pointing to the correct server
- List all active sites: `ls /etc/nginx/sites-enabled/`
- Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`

### WebSocket connection fails

Check that `X-Forwarded-Proto` is set correctly in Nginx and backend handles it properly.

---

## Useful Commands

```bash
# Backend logs
sudo journalctl -u routetracker -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# SSL certificate info
sudo certbot certificates

# Restart backend
sudo systemctl restart routetracker

# Restart Nginx
sudo systemctl reload nginx

# Renew certificate manually
sudo certbot renew
```

---

## Related Documentation

- [DATABASE_SETUP.md](DATABASE_SETUP.md) - Detailed PostgreSQL setup
- [DAILY_DEPLOYMENT.md](DAILY_DEPLOYMENT.md) - Daily update guide
