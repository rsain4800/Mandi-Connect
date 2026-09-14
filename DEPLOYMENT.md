# MandiConnect Production Deployment Guide

This guide provides step-by-step instructions for deploying **MandiConnect** (Wholesale Fruits & Vegetables B2B Marketplace) in a production environment using Docker Compose or traditional VPS (Ubuntu/Nginx/PM2) hosting.

---

## 1. Prerequisites

- **Server**: Linux Server (Ubuntu 22.04 LTS recommended) with at least 2GB RAM and 2 vCPUs.
- **Tools Installed**:
  - Docker & Docker Compose (`docker compose` v2.20+)
  - Git
  - Domain Name configured with A records pointing to your server's public IP.

---

## 2. Fast Deployment via Docker Compose (Recommended)

### Step 1: Clone Repository & Configure Environment

```bash
git clone https://github.com/your-username/MandiConnect.git
cd MandiConnect

# Copy environment template for backend
cp server/.env.example server/.env
```

Edit `server/.env` with your production values:
- Set `JWT_SECRET` using a strong 64-character random string (`openssl rand -hex 64`).
- Set real Razorpay credentials (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`).
- Set `FRONTEND_URL` to your production domain (e.g. `https://mandiconnect.com`).

### Step 2: Build & Launch Containers

```bash
docker compose up -d --build
```

Verify that all three containers (`mandiconnect_db`, `mandiconnect_backend`, `mandiconnect_frontend`) are healthy:

```bash
docker compose ps
```

### Step 3: Run Database Migrations & Seed Initial Data

```bash
# Run database migrations inside backend container
docker compose exec backend npm run migrate

# (Optional) Seed initial admin user, categories, and test data
docker compose exec backend npm run seed
```

---

## 3. Manual VPS Deployment (PM2 + Nginx + MySQL)

If you prefer deploying without Docker:

### Step 1: Backend Setup (Express + Node.js)

```bash
cd server
npm ci --only=production
npm run migrate

# Start backend via PM2 process manager
npm install -g pm2
pm2 start server.js --name "mandiconnect-api"
pm2 save
pm2 startup
```

### Step 2: Frontend Build (Vite React)

```bash
cd client
cp .env.example .env.production
# Edit VITE_API_URL=https://your-domain.com/api in .env.production
npm ci
npm run build
```

The output will be generated inside `client/dist`.

### Step 3: Configure Nginx & SSL (Certbot)

Create `/etc/nginx/sites-available/mandiconnect`:

```nginx
server {
    listen 80;
    server_name mandiconnect.com www.mandiconnect.com;

    root /var/www/MandiConnect/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site and configure SSL via Certbot:

```bash
sudo ln -s /etc/nginx/sites-available/mandiconnect /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Install free SSL certificate
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mandiconnect.com -d www.mandiconnect.com
```

---

## 4. Health Check & Maintenance

### Health Check Endpoint
The backend exposes an automated health check endpoint at `/health` which tests live MySQL database connectivity:

```bash
curl http://localhost:5000/health
```

Expected Response:
```json
{
  "success": true,
  "status": "healthy",
  "checks": { "database": "up" },
  "timestamp": "2026-09-02T08:00:00.000Z"
}
```

### Automated Inventory Sweep
The application features a background reservation-expiry sweep running every 5 minutes (`RESERVATION_SWEEP_INTERVAL_MS`) to release unfulfilled online order inventory locks.

### Database Backup Command
To take an automated daily MySQL backup:

```bash
docker compose exec db mysqldump -u mandi_user -pmandi_password_change_me mandi_connect > backup_$(date +%Y%m%d).sql
```
