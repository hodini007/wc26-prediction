# FIFA World Cup 2026 Prediction System

An end-to-end Machine Learning prediction engine and high-fidelity Monte Carlo tournament simulator for the **FIFA World Cup 2026** (based on the confirmed 48-team, 12 groups of 4 format).

---

## 🏗️ System Architecture

```
DATA LAYER (Scrapers & CSV caches)
  ├── scrapers/           - Modular web crawlers (Matches, Rankings, Transfermarkt, Wikipedia)
  ├── raw_data/           - Unprocessed Kaggle and scraped CSV files
  └── processed_data/     - Clean master datasets and train/val/test splits

ML LAYER (XGBoost, Poisson & ELO Engine)
  ├── preprocessing/      - Chronological ELO calculation and rolling form replayer
  ├── features/           - Multi-tier features (squad values, overlaps) and correlation selectors
  ├── models/             - Serialised tuned classifiers and expected goal poisson regressions
  └── simulation/         - Vectorised Monte Carlo tournament simulator (100k iterations)

API LAYER (FastAPI Server)
  └── api/                - REST API serving team metadata, group standings, paths, and overrides

FRONTEND LAYER (Next.js Dashboard)
  └── web/                - Next.js 14 + Tailwind interactive dashboard with ELO simulation sliders
```

---

## ⚡ Quick Start

### 1. Prerequisites
Ensure you have **Python 3.10+** and **Node.js 18+** installed.

### 2. Install Dependencies
Install Python and Node.js dependencies:
```bash
pip install -r requirements.txt
cd web && npm install
cd ..
```

### 3. Run Pipeline
To download data, train the models, run the 100k Monte Carlo simulations, and save predictions:
* **Windows (PowerShell):**
  ```powershell
  ./run_pipeline.ps1
  ```
* **macOS/Linux:**
  ```bash
  chmod +x run_pipeline.sh
  ./run_pipeline.sh
  ```

---

## 🚀 Running the Web Application

### 1. Start FastAPI Backend
```bash
uvicorn api.main:app --port 8000
```
The API documentation is available at `http://127.0.0.1:8000/docs`.

### 2. Start Next.js Frontend
In a new terminal:
```bash
cd web
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 📊 Model Evaluation Results (WC 2022)

Our blended Ensemble model (60% XGBoost Classifier + 40% Poisson Scoreline Regression) achieved competitive results when evaluated on the held-out WC 2022 tournament matches:

* **Ranked Probability Score (RPS):** **`0.1445`** (Beats ELO baseline of `0.1465` and naive prior rate of `0.1558`)
* **Expected Goal Mean Absolute Error (MAE):**
  * Home expected goals MAE: `1.09` goals
  * Away expected goals MAE: `0.88` goals
* **Win/Draw/Loss Accuracy:** **`51.56%`**
* **XGBoost Outcome Log-Loss:** **`0.8738`** (Optimised using Optuna across 100 hyperparameter trials)

*Charts and diagnostic plots (Confusion Matrix, Reliability calibration curves, feature importances) are saved under `evaluation/plots/`.*
