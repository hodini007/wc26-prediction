#!/bin/bash
set -e
echo "=== FIFA WC 2026 Prediction Pipeline ==="

echo "[1/8] Scraping data..."
python scrapers/scrape_matches.py
python scrapers/scrape_rankings.py
python scrapers/scrape_transfermarkt.py
python scrapers/scrape_wc_history.py
python scrapers/scrape_qualifying.py

echo "[2/8] Building master dataset..."
python preprocessing/build_dataset.py

echo "[3/8] Preprocessing..."
python preprocessing/preprocess.py

echo "[4/8] Feature engineering..."
python features/engineer.py

echo "[5/8] Feature selection..."
python features/select.py

echo "[6/8] Training models..."
python models/train.py

echo "[7/8] Evaluating models..."
python models/evaluate.py

echo "[8/8] Running Monte Carlo simulation (100k iterations)..."
python simulation/monte_carlo.py

echo "=== Pipeline Completed! ==="
echo "Launch API: uvicorn api.main:app --port 8000"
echo "Launch Web: cd web && npm run dev"
