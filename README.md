<<<<<<< HEAD
# SIH-BACKEND
AI-Based Fake Identity and Document Screening System
=======
# AI Image Forensics & Deepfake Detection Platform

A full-stack forensic application that detects synthetic imagery, deepfakes, and manipulated photos using a combination of deterministic local heuristics (frequency, noise, PRNU, CFA) and a multimodal LLM analyzer.

---

## 🚀 Localhost Setup Guide

Follow these steps to run the application locally on your machine.

### Prerequisites
- Node.js (v18 or higher recommended)
- A Google Gemini API Key (for the vision model analysis)

### 1. Environment Configuration

Create a `.env` file in the **root** of the project (next to this README) and add your Gemini API key:

```env
GEMINI_API_KEY="your_google_gemini_api_key_here"
PORT=3001
```

### 2. Start the Backend API
The backend orchestrates the multi-model forensics, image ingestion, and communicates with the Gemini Vision API.

```bash
cd backend
npm install
npm run dev
```
> The backend will start on **http://localhost:3001**

### 3. Start the Frontend Application
The frontend is a React application built with Vite and TailwindCSS.

Open a **new terminal tab** and run:

```bash
cd frontend
npm install
npm run dev
```
> The frontend will start on **http://localhost:5173**

### 4. Access the Application
Open your browser and navigate to `http://localhost:5173`. 
All API calls from the frontend to `/api/v1/*` are automatically proxied to the backend at port 3001.

---

## 📁 Repository Structure

```text
project-root/
├── .env                       # (You create this) API keys and ports
├── backend/
│   ├── package.json
│   ├── server.js              # Express API (Port 3001, handles /api/v1/upload & /detect)
│   ├── scripts/               
│   │   └── test_api.js        # CLI utility to test API routes offline
│   └── forensics/             # The Multi-Signal Forensic Ensemble
│       ├── config.js          # Weights and thresholds
│       ├── ensemble.js        # Bayesian combination logic
│       ├── prnu.js            # Sensor pattern noise fingerprinting
│       ├── jpeg_ghost.js      # Compression disparity analysis
│       ├── cfa_demosaic.js    # Bayer pattern interpolation checks
│       ├── frequency.js       # 2D-FFT Spectral analysis
│       ├── noise.js           # Laplacian block noise consistency
│       ├── metadata.js        # EXIF structure analysis
│       ├── synthid.js         # C2PA Cryptographic manifest extraction
│       └── calibrate.js       # CLI tool to optimize forensic thresholds
├── frontend/
│   ├── vite.config.ts         # Proxy config: /api -> http://localhost:3001
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx
│       ├── App.tsx            # Global Routing
│       ├── services/
│       │   └── apiService.ts  # Fetches backend endpoints
│       └── pages/
│           ├── Home.tsx       # Landing page & technology overview
│           └── Analyzer.tsx   # Dashboard, drag-and-drop, interactive forensics view
└── package.json
```

---

## 🧪 Forensic Inspection Capabilities

1. **Gemini Vision Semantics**: Inspects physical plausibility (anatomy, lighting, structural coherence).
2. **PRNU Sensor Consistency**: Validates that a stable hardware sensor noise floor is present across the image.
3. **CFA Demosaicing**: Detects periodic Bayer filter interpolation patterns unique to real cameras.
4. **JPEG Ghosting**: Highlights localized splices/inpainting by scanning for disjointed compression qualities.
5. **Frequency (2D-FFT)**: Identifies generative periodic upsampling grids via Fourier transforms.
6. **Noise Distribution**: Calculates localized variance to flag unnaturally smooth AI-generated regions.
7. **Metadata & C2PA**: Validates cryptographic Content Credentials and examines structural EXIF integrity.
>>>>>>> abhay-code
