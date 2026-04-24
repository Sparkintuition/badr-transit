# BADR TRANSIT — Système de gestion

## Development (two processes)

```bash
# Install dependencies
npm run install:all

# Terminal 1 — Backend API (http://localhost:3000)
npm run dev:backend

# Terminal 2 — Frontend dev server (http://localhost:5173)
npm run dev:frontend
```

In dev mode, Vite proxies `/api` requests to the backend automatically.

## Default admin account
- Username: `admin`
- Password: `admin123`

> **Change this password immediately after the first login.**

---

## Production Deployment (single process, LAN access)

The app runs as one process: the backend serves both the API and the optimized React build.  
All devices on the same local network access the app via one URL: `http://<server-ip>:3000`

### First-time setup on the server machine

1. **Install Node.js 20+ LTS** from [nodejs.org](https://nodejs.org)

2. **Copy the entire `Badr Transit` folder** to the server machine (USB, shared drive, etc.)

3. **Open Command Prompt** in the project root folder

4. **Install dependencies:**
   ```
   npm run install:all
   ```

5. **Build the optimized frontend:**
   ```
   npm run build
   ```

6. **Create `backend/.env`** (copy from `backend/.env.example`) and fill in:
   ```
   PORT=3000
   NODE_ENV=production
   SERVE_FRONTEND=true
   SESSION_SECRET=<generate below>
   BACKUP_DIR=C:\Backups\BadrTransit
   BACKUP_RETENTION_DAYS=30
   ```
   Generate a strong SESSION_SECRET by running:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

7. **Install PM2** (process manager that keeps the app running and restarts it on boot):
   ```
   npm install -g pm2 pm2-windows-startup
   ```

8. **Start the app with PM2:**
   ```
   cd backend
   pm2 start ecosystem.config.js
   ```

9. **Save PM2 state** (so it remembers to restart the app after reboot):
   ```
   pm2 save
   ```

10. **Enable auto-start on boot:**
    ```
    pm2-startup install
    ```

11. **Windows Firewall:** The first time Node.js listens on port 3000, Windows Defender Firewall will show a popup. Click **"Allow access"** for both Private and Public networks so other office machines can connect.

---

### Finding the server's IP address

On the server machine, open Command Prompt and run:
```
ipconfig
```
Look for **IPv4 Address** under your network adapter (e.g., `192.168.1.50`).  
This is the address other devices will use: `http://192.168.1.50:3000`

---

### Fixing the IP (strongly recommended)

Without a fixed IP, the server's address can change when it reboots, breaking all bookmarks.

In your router's admin panel (usually `http://192.168.1.1`):
1. Find the DHCP reservation or static IP section
2. Find the server's MAC address (shown in `ipconfig /all` as **Physical Address**)
3. Reserve the IP for that MAC address

Once set, the IP never changes and bookmarks work forever.

---

### Access from other devices

From any computer, tablet, or phone on the same Wi-Fi or office network:
1. Open Chrome, Edge, or Firefox
2. Go to `http://192.168.1.50:3000` (replace with your server's actual IP)
3. Bookmark it

**Create a desktop shortcut that looks like a native app (Windows + Chrome):**
1. Open Chrome and navigate to `http://192.168.1.50:3000`
2. Click the menu **⋮** → **More tools** → **Create shortcut...**
3. Check **"Open as window"** → **Create**
4. A desktop icon appears — clicking it opens the app in its own window with no browser chrome
5. Repeat on each user's machine

---

### Updating the app

When new code is available:

```bash
# 1. Stop the running app
pm2 stop badr-transit

# 2. Copy updated source files to the server
#    (overwrite the old folder, or git pull if using git)

# 3. Install any new dependencies (only if package.json changed)
npm run install:all

# 4. Rebuild the frontend
npm run build

# 5. Restart
pm2 restart badr-transit
```

---

### Useful PM2 commands

```bash
pm2 list                    # Show running apps and status
pm2 logs badr-transit       # Tail live logs
pm2 logs badr-transit --lines 100   # Last 100 log lines
pm2 restart badr-transit    # Restart after code update
pm2 stop badr-transit       # Stop the app
pm2 start badr-transit      # Start again
```

Logs are saved to `backend/logs/out.log` (stdout) and `backend/logs/error.log` (stderr).

---

### Backup

Run a manual backup at any time from the Settings page (`/app/parametres`) or via:
```
cd backend && npm run backup
```

To schedule automatic daily backups, use **Windows Task Scheduler**:
1. Open Task Scheduler → Create Basic Task
2. Trigger: Daily at a quiet time (e.g., 02:00)
3. Action: Start a program
   - Program: `node`
   - Arguments: `C:\path\to\Badr Transit\backend\src\scripts\backup.js`
   - Start in: `C:\path\to\Badr Transit\backend`
4. Finish — the task will run daily and keep the last 30 backups (configurable via `BACKUP_RETENTION_DAYS`)

---

### QR codes in Fiche dossier PDFs

Each job's "Fiche dossier" PDF contains a QR code that links to the job's detail page in the app.
The base URL for these links is stored in the database under the setting key **`app_url_base`** (default: `http://localhost:3000`).

**After changing the server's IP address** (e.g., when moving to a new office network), update this setting so QR codes point to the correct URL:
1. Log in as admin
2. Go to **Paramètres** (`/app/parametres`)
3. Update **URL de base de l'application** to `http://<new-server-ip>:3000`
4. Save — all newly generated PDFs will use the new URL

Previously generated PDFs will still contain the old QR code; regenerate any you need updated.

---

### Verification checklist

- [ ] `http://localhost:3000` on the server → login page loads, logo shows
- [ ] Can log in and use the full app
- [ ] DevTools Network tab: API calls go to `/api/...` (relative URLs, not `localhost:5173`)
- [ ] `http://<server-ip>:3000` from another device → same login page
- [ ] Two users logged in simultaneously → data changes by one are visible to the other on refresh
- [ ] `pm2 list` → shows `badr-transit` as **online**
- [ ] `pm2 logs badr-transit` → no errors
- [ ] Kill the Node.js process manually → PM2 restarts it within seconds
- [ ] Reboot the server machine → app is running again without any manual action
