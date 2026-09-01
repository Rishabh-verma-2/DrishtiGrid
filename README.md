# DrishtiGrid (દ્રષ્ટિગ્રીડ) 🛡️
### Gujarat State CCTV Surveillance & Real-Time GIS Command Platform

An industry-grade, intelligent CCTV surveillance and geospatial monitoring platform designed for the **Government of Gujarat Home Department** and Smart City Command Centers.

---

## 🌟 Key Features

- **🏛️ Admin Command & Control:**
  - Secure JWT authentication with role-based authorization (Superadmin/Admin).
  - Rate limiting, brute-force lockout protection, and bcrypt password hashing.
  - Live system health telemetry and real-time operator counter.

- **🎥 30 Live CCTV Feeds (Zero-DB Storage Architecture):**
  - High-performance **WebRTC (WHEP)** low-latency video streaming (`<500ms`).
  - **HLS CDN** stream fallback.
  - Multi-view grid arrangements: **Grid (All 30 Feeds)**, **Quad View (2x2)**, **Matrix (3x3)**, and **Cinema Spotlight**.
  - **On-Demand Streaming:** Feeds connect strictly when initiated by the operator to conserve network bandwidth and avoid browser overload.
  - Directional PTZ inspection controls, resolution toggles, and CCTV watermark snapshot capture.
  - One-click copyable **RTSP (`rtsp://103.250.160.189:8554/stream/camXX`)**, **WebRTC**, and **Python OpenCV** commands for AI inference.

- **🗺️ Gujarat GIS Map Interface:**
  - Interactive Leaflet & OpenStreetMap geospatial tracking across all Gujarat districts (Ahmedabad, Gandhinagar, Surat, Vadodara, Rajkot, Bhavnagar, Jamnagar, Junagadh, Anand, Bharuch, Mehsana, etc.).
  - Real-time status indicators (Online / Offline / Maintenance).
  - Click-to-inspect camera popup with geo-coordinates and zone categorization.

- **📊 Comprehensive Command Dashboard:**
  - Live camera status breakdown (Pie & Bar charts).
  - District-wise camera distribution metrics.
  - Real-time activity and security event feed.
  - Interactive mini GIS camera network map.

---

## 🛠️ Technology Stack

- **Frontend:**
  - **React 19** + **Vite**
  - **Tailwind CSS v4** (Modern government dark command theme)
  - **Leaflet** & **React-Leaflet** (GIS mapping)
  - **Socket.IO Client** (Real-time live telemetry)
  - **Hls.js** & Native **WebRTC (WHEP)**
  - **Recharts** (Real-time analytics charts)
  - **Lucide Icons**

- **Backend:**
  - **Node.js** & **Express**
  - **MongoDB** & **Mongoose** (GIS 2dsphere indexing)
  - **Socket.IO** (Real-time bi-directional events)
  - **JWT (JSON Web Tokens)** (Access & Refresh tokens)
  - **Winston** (Structured logging)
  - **Helmet**, **CORS**, and **Express-Rate-Limit** (Production security)

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18 or v20+)
- MongoDB Atlas or local MongoDB instance

### 2. Installation

Clone the repository:
```bash
git clone https://github.com/Rishabh-verma-2/DrishtiGrid.git
cd DrishtiGrid
```

Install backend dependencies:
```bash
cd server
npm install
```

Install frontend dependencies:
```bash
cd ../client
npm install
```

### 3. Environment Setup

Configure `server/.env` (see `server/.env.example`):
```env
PORT=5001
NODE_ENV=development
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_super_secret_jwt_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
CLIENT_URL=http://localhost:5173
```

Configure `client/.env`:
```env
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
```

### 4. Seed Database (Admin & Gujarat Camera Metadata)
```bash
cd server
npm run seed
```
> **Default Admin Account:**
> - **Email:** `adminuser@gov.in`
> - **Password:** `adminpass@123`

### 5. Run Development Servers

**Terminal 1 (Backend):**
```bash
cd server
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd client
npm run dev
```

Visit **`http://localhost:5173`** (or `http://localhost:5174`) in your browser to access the command center.

---

## 📋 Security & Compliance
- Compliant with Gujarat State Surveillance standards and IT Act 2000.
- Zero local video footage storage preserves data privacy and avoids storage overhead.
