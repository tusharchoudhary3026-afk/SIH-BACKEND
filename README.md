# 🛡️ AI Image Forensics & Fraud Identity Screening Platform

> A multimodal forensic application and multi-identity fraud graph detection platform that flags deepfakes, manipulated identity documents, synthetic face-swaps, and organized fraud syndicates.

---

## 📋 Table of Contents
- [✨ Key Features](#-key-features)
- [🏗️ System Architecture](#️-system-architecture)
- [🚀 Getting Started: Fork & Local Setup](#-getting-started-fork--local-setup)
  - [1. Fork & Clone](#1-fork--clone)
  - [2. Prerequisites](#2-prerequisites)
  - [3. Environment Configuration](#3-environment-configuration)
  - [4. Install Dependencies](#4-install-dependencies)
  - [5. Run the Application](#5-run-the-application)
- [🧭 Application Routing & Ports](#-application-routing--ports)
- [📁 Repository Structure](#-repository-structure)
- [🧪 Forensic Detection Pipeline](#-forensic-detection-pipeline)
- [🕸️ Fraud Syndicate Relationship Graph](#️-fraud-syndicate-relationship-graph)
- [❓ Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## ✨ Key Features

- **Multi-Signal Deterministic Forensics**: Local ensemble heuristics including 2D-FFT spectral frequencies, PRNU camera sensor fingerprinting, CFA demosaicing, and localized Laplacian block noise.
- **Multimodal AI Semantic Verification**: Visual reasoning using Google Gemini Vision to inspect physical plausibility, lighting consistency, anatomical realism, and forensic artifacts.
- **Syndicate & Collision Graph Visualizer**: Interactive network graph (Cytoscape.js) detecting multi-identity collisions (Same Face, Shared Document Number, Synthetic Address Farm).
- **Interactive UI**: Real-time forensic dashboard built with React, Vite, Framer Motion, and TailwindCSS.

---

## 🏗️ System Architecture

The platform operates as a 3-tier micro-stack:
1. **Frontend (Port 5173)**: React 18 SPA + Vite + TailwindCSS + Cytoscape graph canvas.
2. **Node.js Express Backend (Port 3001)**: Orchestrates forensic ingestion, local ensemble algorithms, image storage, and Gemini Vision API integration.
3. **Python AI / ML Layer (Port 8000)**: FastAPI + PyTorch/Torchvision + OpenCV service for deep learning models and computer vision pipelines.

---

## 🚀 Getting Started: Fork & Local Setup

### 1. Fork & Clone

1. Click the **Fork** button at the top right of this repository on GitHub.
2. Clone your personal fork to your local machine:
```bash
git clone https://github.com/<your-username>/SIH-BACKEND.git
cd SIH-BACKEND
```

---

### 2. Prerequisites

Ensure you have the following installed on your system:
- **Node.js**: `v18.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **npm**: `v9.0.0` or higher
- **Python**: `3.10` or higher ([Download Python](https://www.python.org/))
- **Google Gemini API Key**: Free key from [Google AI Studio](https://aistudio.google.com/)

---

### 3. Environment Configuration

Create a `.env` file in the **root directory** of the repository:

```bash
touch .env
```

Add the following environment variables:

```env
# Google Gemini Vision API Key
GEMINI_API_KEY="your_actual_gemini_api_key_here"

# Server Ports (Optional defaults shown)
PORT=3001
PYTHON_LAYER_URL="http://localhost:8000"
```

---

### 4. Install Dependencies

You can install all dependencies across the monorepo:

#### A. Root & Frontend / Backend Node Packages
```bash
# 1. Install root dependencies (concurrent dev runner)
npm install

# 2. Install backend dependencies
cd backend
npm install
cd ..

# 3. Install frontend dependencies
cd frontend
npm install
cd ..
```

#### B. Python Layer Virtual Environment
```bash
cd backend/python_layer

# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
# On macOS / Linux:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate

# Install Python requirements
pip install -r requirements.txt

# Return to root directory
cd ../..
```

---

### 5. Run the Application

#### Option A: One-Command Quick Start (Recommended)
From the root directory, simply run:

```bash
npm run dev
```

This uses `concurrently` to launch all 3 services concurrently:
- 🟢 **Frontend**: [http://localhost:5173](http://localhost:5173)
- 🔵 **Backend API**: [http://localhost:3001](http://localhost:3001)
- 🟡 **Python Layer**: [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

#### Option B: Separate Terminal Tabs (For Debugging)

If you prefer running services independently:

**Terminal 1 — Backend API:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Python Layer:**
```bash
cd backend/python_layer
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 3 — Frontend Web App:**
```bash
cd frontend
npm run dev
```

---

## 🧭 Application Routing & Ports

| Component | URL | Description |
| :--- | :--- | :--- |
| **Landing Page** | [http://localhost:5173/](http://localhost:5173/) | Overview, technology capabilities & entry points |
| **Deepfake Scanner** | [http://localhost:5173/analyze](http://localhost:5173/analyze) | Image upload, heuristic breakdown & Gemini analysis |
| **Syndicate Graph** | [http://localhost:5173/graph](http://localhost:5173/graph) | Interactive Cytoscape fraud ring network |
| **Backend Health** | [http://localhost:3001/health](http://localhost:3001/health) | API & Gemini connection status |
| **Python Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | FastAPI interactive Swagger documentation |

> **Note:** All frontend requests to `/api/*` and `/media/*` are automatically reverse-proxied by Vite to `http://localhost:3001`.

---

## 📁 Repository Structure

```text
SIH-BACKEND/
├── .env                              # Environment secrets (Gemini API key)
├── package.json                      # Monorepo runner & scripts
│
├── backend/
│   ├── server.js                     # Express REST API (Port 3001)
│   ├── package.json
│   ├── forensics/                    # Local Forensic Heuristics Ensemble
│   │   ├── ensemble.js               # Bayesian signal aggregation
│   │   ├── prnu.js                   # Sensor pattern noise fingerprinting
│   │   ├── jpeg_ghost.js             # Compression disparity analysis
│   │   ├── cfa_demosaic.js           # Bayer pattern demosaicing
│   │   ├── frequency.js              # 2D-FFT spectral analysis
│   │   ├── noise.js                  # Laplacian localized noise consistency
│   │   ├── metadata.js               # Structural EXIF extraction
│   │   └── synthid.js                # C2PA cryptographic credentials
│   └── python_layer/
│       ├── main.py                   # FastAPI application (Port 8000)
│       ├── requirements.txt          # PyTorch, OpenCV, Transformers
│       └── .venv/                    # Python virtual environment
│
├── frontend/
│   ├── vite.config.ts                # Vite dev server & proxy settings
│   ├── tailwind.config.js
│   ├── package.json
│   └── src/
│       ├── App.tsx                   # Routes: /, /analyze, /graph
│       ├── services/
│       │   └── apiService.ts         # Axios/Fetch API client
│       └── pages/
│           ├── Home.tsx              # Platform landing page
│           ├── Analyzer.tsx          # Real-time scan & forensic inspection
│           └── FraudGraph.tsx        # Cytoscape fraud relationship network
└── README.md
```

---

## 🧪 Forensic Detection Pipeline

When an image is submitted to `/api/v1/detect`, it undergoes multi-stage verification:

1. **Cryptographic & Metadata Checks**: Extracts C2PA Content Authenticity manifests and checks EXIF headers for AI generator signatures.
2. **Frequency (2D-FFT) Domain**: Detects periodic grid anomalies typical of generative AI upsampling.
3. **PRNU Sensor Verification**: Identifies the presence of real hardware CMOS sensor noise.
4. **CFA Demosaicing Interpolation**: Scans for periodic Bayer filter interpolation patterns.
5. **JPEG Ghosting & Error Level Analysis (ELA)**: Exposes localized splicing and inpainting via compression variance.
6. **Gemini Vision Semantic Reasoning**: Evaluates lighting consistency, specular reflections, anatomical coherence, and perspective anomalies.

---

## 🕸️ Fraud Syndicate Relationship Graph

Access the interactive graph at `/graph` to investigate organized fraud operations:
- **Shared Face Ring (Cluster 1)**: Identical biometric face utilized across distinct identities and legal names.
- **Document Reuse Ring (Cluster 2)**: Exact government document ID (PAN / Aadhaar / Voter ID) claimed by multiple individuals.
- **Synthetic Address Farm (Cluster 3)**: Disproportionately high identity registrations mapped to a single physical address.

**Interactive Controls**:
- Click any **Ring Chip** to automatically focus, isolate, and inspect syndicate clusters.
- Toggle **`Labels: ON / OFF`** to view or hide edge connection tags without clutter.
- Hover or tap any edge to view the exact entity collision pair in the top notification banner.
- Select any citizen node to view associated documents and cross-verification findings.

---

## ❓ Troubleshooting & FAQs

### Q: Backend says `GEMINI_API_KEY is not set`
Create `.env` in the root folder (same level as `package.json`) and verify:
```env
GEMINI_API_KEY="your_api_key_here"
```
Restart the backend or run `npm run dev`.

### Q: Port conflicts (Port 3001, 8000, or 5173 already in use)
- You can inspect active ports on macOS/Linux using:
  ```bash
  lsof -i :3001 -i :8000 -i :5173
  ```
- To change the backend port, specify `PORT=3002` in `.env`. Vite will automatically route `/api` to the specified port.

### Q: Python Virtual Environment issues
If Python packages fail to install:
```bash
cd backend/python_layer
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 📄 License
This project is developed for the Smart India Hackathon (SIH) prototype screening and identity security platform.
