# MandiConnect 🌾🛒

**MandiConnect** is an enterprise-grade B2B Wholesale Marketplace connecting Farmers/Mandi Vendors with Commercial Buyers (Hotels, Restaurants, Caterers, and Retailers).

Built with **Node.js, Express, MySQL 8, React 19, Vite, Tailwind CSS**, featuring real-time inventory management, tiered wholesale pricing, district-based shipping logistics, Razorpay integration, automated invoice generation, and full Docker containerization.

---

## 🚀 Quick Start (Production Docker Deployment)

Launch the full-stack system (MySQL 8 + Express API + Nginx Frontend) in one command:

```bash
docker compose up -d --build
```

Access the applications:
- **Frontend App**: `http://localhost:80`
- **Backend API**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/health`

For complete production deployment instructions (Ubuntu/VPS, Nginx, SSL, PM2), see [DEPLOYMENT.md](file:///c:/Users/ROHIT%20SAIN/OneDrive/Desktop/rohit/MandiConnect/DEPLOYMENT.md).

---

## 🛠️ Local Development Setup

### 1. Backend (Express + MySQL)

```bash
cd server
npm install
npm run migrate      # Apply database migrations
npm run seed         # (Optional) Seed admin user & initial categories
npm run dev          # Start Express server with Nodemon (http://localhost:5000)
```

**Running Tests & Linting**:
```bash
npm test             # Run 100% passing Jest test suite (172 tests, 6 suites)
npm run lint         # Run ESLint backend checks
```

### 2. Frontend (React 19 + Vite + Tailwind CSS)

```bash
cd client
npm install
npm run dev          # Start Vite dev server (http://localhost:5173)
```

**Building & Linting**:
```bash
npm run build        # Build optimized production bundle with code-splitting
npm run lint         # Run ESLint frontend checks
```

---

## ✨ Features & Architecture

- 🛡️ **JWT Authentication & Security**: Secure httpOnly cookies, password hashing with bcrypt, helmet security headers, rate limiting, and environment variable validation.
- 📦 **Inventory Safety & Concurrency**: Row-level locking (`SELECT ... FOR UPDATE`), transaction safety, atomic stock reservation, and background reservation-expiry sweep.
- 🚚 **Logistics & Zone Shipping**: District -> Delivery Zone -> Serviceable Pincode validation system with per-zone shipping fees and global threshold free-shipping logic.
- 💳 **Payments & Refunds**: Full Razorpay payment verification, webhook signature security, automated refunds, and idempotent processing.
- 📄 **Automated GST Invoicing**: Year-scoped sequential invoice numbering (`MC-INV-YYYY-NNNNNN`), PDF generation, and credit note issuance.
- 🎨 **Modern React UI**: React 19 SPA with route-level lazy loading (`React.lazy` + `Suspense`), custom global `ErrorBoundary`, and vendor bundle splitting (<40KB main entry).
- 🐳 **Production Containerization**: Multi-stage Dockerfiles for backend & frontend, Nginx static server with gzip & security headers, and `docker-compose.yml` orchestration.

---

## 📖 API Documentation & Routes

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile`
- `GET /api/products`, `GET /api/products/:id`, `POST/PUT/DELETE /api/products` (Seller/Admin)
- `GET/POST/PUT/DELETE /api/cart` (Buyer)
- `GET/POST/PUT/DELETE /api/addresses` (Logged-in User)
- `POST /api/orders`, `GET /api/orders/mine`, `GET /api/orders/seller`
- `POST /api/payments/verify`, `POST /api/payments/webhook`
- `GET /api/invoices/:orderId`, `GET /api/invoices/:id/pdf`
- `GET /health` (Database connectivity verification)
