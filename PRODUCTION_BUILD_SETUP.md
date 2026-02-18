# Production Build Setup Guide

## Prerequisites

### 1. System Dependencies

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install -y nodejs npm build-essential python3
```

**RHEL/CentOS:**

```bash
sudo yum install -y nodejs npm gcc-c++ make python3
```

**Verify installations:**

```bash
node --version  # Should be v20.x or higher
npm --version   # Should be v10.x or higher
```

### 2. Install Project Dependencies

**IMPORTANT: Do NOT use `--production` flag!**

The build process requires devDependencies:

- TypeScript compiler (`tsc`) for both frontend and backend
- Vite for frontend build
- Other build tools

**Install dependencies:**

```bash
# Option 1: Install all at once (using root package.json script)
npm run install:all

# Option 2: Install manually
npm install                    # Root (optional, only if using root build script)
cd backend && npm install      # Backend - REQUIRED
cd ../frontend && npm install  # Frontend - REQUIRED
```

### 3. Configure Frontend Environment Variables

The frontend needs to know where to connect to the backend API in production.

**Create `.env.production` file in the `frontend/` directory:**

```bash
cd frontend
cp .env.production.example .env.production
```

**Edit `frontend/.env.production` with your production URLs:**

```env
# Backend API URL (HTTPS)
VITE_API_URL=https://api.yourdomain.com

# WebSocket URL (WSS - secure WebSocket over HTTPS)
VITE_WS_URL=wss://api.yourdomain.com
```

**Important Notes:**

- Use `https://` for API URL (secure HTTP)
- Use `wss://` for WebSocket URL (secure WebSocket)
- Both should point to your backend domain
- These values are **compiled into the frontend build** at build time
- If you change these values, you must rebuild the frontend

### 4. Build the Application

```bash
# Option 1: Build both from root
npm run build

# Option 2: Build separately
cd backend && npm run build    # Compiles TypeScript to dist/
cd ../frontend && npm run build # Compiles TypeScript and builds with Vite to dist/
```

### 5. Initialize Database (First Time Only)

After building the application, you need to initialize the database schema and create an admin user.

**Important: This process is interactive**

The database setup involves two steps:

1. **Apply database schema** (`npm run db:push`)
   - If this is a fresh database, answer "Yes" to apply changes
   - If renaming columns from an old schema, carefully choose "rename" vs "create" options to preserve data

2. **Seed with admin user** (`npm run db:seed`)
   - You'll be prompted to enter an admin email address
   - A secure random password will be generated and displayed
   - **Save the password immediately** - it won't be shown again

**Run the setup:**

```bash
cd backend

# Apply database schema (interactive - may ask about column renames)
npm run db:push

# Seed database with admin user (interactive - asks for email)
npm run db:seed
```

**For automated/non-interactive deployment:**

```bash
# Skip the prompts by providing values via environment variables
ADMIN_EMAIL=admin@yourdomain.com ADMIN_PASSWORD=your-secure-password npm run db:seed
```

**Expected output:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: admin@yourdomain.com
Password: [randomly-generated-secure-password]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Please save this password securely!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## After Building

### For Production Runtime

After building, you can optionally clean up devDependencies if you want to save disk space, but this is **NOT required** for running the application:

```bash
# Backend - remove devDependencies (optional)
cd backend
npm prune --production

# Frontend - you typically don't need node_modules in production
# since you serve the built static files
```

### Running Production Build

```bash
# Backend
cd backend
npm start  # Runs node dist/index.js

# Frontend - serve the built files from frontend/dist/
# Use your web server (Apache/nginx) to serve static files
```

## Native Module Dependencies

The backend uses native modules that require compilation:

- `better-sqlite3` - SQLite database driver
- `sharp` - Image processing library

These are automatically compiled during `npm install` if you have the build tools installed (build-essential/python3 on Ubuntu, gcc-c++/make/python3 on RHEL).

### Troubleshooting: better-sqlite3 Build Failures

If you see an error like:

```
npm error code 1
npm error path .../node_modules/better-sqlite3
npm error command failed
```

**Solution:**

1. **Install/Update build tools (IMPORTANT: Install ALL of these):**

   ```bash
   # Ubuntu/Debian - Install complete build toolchain
   sudo apt update
   sudo apt install -y build-essential python3 python3-dev libsqlite3-dev

   # RHEL/CentOS/Fedora
   sudo yum install -y gcc-c++ make python3 python3-devel sqlite-devel
   # or on newer systems:
   sudo dnf install -y gcc-c++ make python3 python3-devel sqlite-devel
   ```

   **Key packages:**
   - `build-essential` / `gcc-c++ make` - C++ compiler
   - `python3-dev` / `python3-devel` - Python headers (REQUIRED for node-gyp)
   - `libsqlite3-dev` / `sqlite-devel` - SQLite development headers (REQUIRED for better-sqlite3)

2. **Verify Node.js version (v20+ recommended, v24+ may have compatibility issues):**

   ```bash
   node --version
   # If using Node v24+, better-sqlite3 might not have prebuilt binaries
   # Consider using Node.js v20 LTS for better compatibility:
   # Using NodeSource (Ubuntu/Debian):
   # curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   # sudo apt install -y nodejs
   ```

   **Note:** If using Node v24+, compilation is required (no prebuilt binaries). This is normal, just ensure all build tools are installed.

3. **Clean and retry:**

   ```bash
   cd backend
   rm -rf node_modules package-lock.json
   npm cache clean --force
   npm install
   ```

   **If still failing, try installing better-sqlite3 directly to see full error:**

   ```bash
   cd backend
   npm install better-sqlite3 --verbose 2>&1 | tee better-sqlite3-install.log
   # Review better-sqlite3-install.log for detailed error messages
   ```

4. **Check full error details:**

   ```bash
   npm install --verbose 2>&1 | tee install.log
   # Review install.log for detailed error messages
   ```

5. **Alternative: Use prebuilt binaries (if available):**
   ```bash
   npm install better-sqlite3 --build-from-source=false
   ```
   Note: This may not work on all platforms; compilation is usually preferred.

## Production Deployment

### Backend Environment Variables

Configure the following environment variables in `backend/.env`:

```env
# Required for production
NODE_ENV=production
PORT=3001                    # Backend server port (Node.js backend listens on this port)
DATABASE_URL=./data/ovos-sprint.db
JWT_SECRET=your-secure-random-string-here
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com

# Email (SparkPost SMTP Relay)
SMTP_HOST=smtp.sparkpostmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=SMTP_Injection
SMTP_PASSWORD=your-sparkpost-api-key
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=ovos Sprint 🏃‍♂️‍➡️
```

**Important**:

- The `PORT` variable is for the **backend** server only (Node.js listens on port 3001)
- The **frontend** in production is built into static files (`frontend/dist/`) and served by your web server (Apache/nginx) on ports 80/443 (HTTP/HTTPS), not by a Node.js process
- The backend will fail to start in production if `JWT_SECRET`, `FRONTEND_URL`, or `BACKEND_URL` are missing or using default values
- Users access the application via standard ports (80/443), which are proxied by Apache/nginx to the backend on port 3001

### Process Management

Use PM2 or systemd to manage the Node.js process:

```bash
# Install PM2
npm install -g pm2

# Start the application
cd backend
pm2 start dist/index.js --name ovos-sprint

# Save the process list
pm2 save

# Set up startup script
pm2 startup
```

### Reverse Proxy Configuration

#### Apache

See [apache.sprint.ovos.at.conf.txt](apache.sprint.ovos.at.conf.txt) for a complete Apache configuration example.

#### nginx

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend (static files)
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    # Avatars
    location /avatars {
        proxy_pass http://localhost:3001;
    }
}
```

### SQLite Backup Strategy

Use a Bash script to set up regular backups of the SQLite database:

```bash
#!/bin/bash
set -e  # Exit on error

BACKUP_DIR="/backups"
DB_PATH="/ovos-sprint/backend/data/ovos-sprint.db"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ovos-sprint_$DATE.db"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "ovos-sprint_*.db" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
```

Make sure the user owns the bash script and has execute permissions:

```bash
chmod +x /backup.sh
```

Add to crontab for daily backups:

```bash
0 2 * * * /backups/backup-script.sh
```

## Updating Production

Run `./update-ovos-sprint.sh` to pull the latest changes, build the app and service and reload pm2 and prune development dependencies:

```bash
i#/!/bin/sh

. ~/.nvm/nvm.sh

nvm use 20.19.6

cd ovos-sprint

git pull

cd backend/

npm install

npm run build

pm2 restart ovos-sprint

npm prune --production

cd ../frontend/

npm install

npm run build
```
