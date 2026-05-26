# FIFA World Cup 2026 Prediction System Pipeline Runner (PowerShell version for Windows)
$ErrorActionPreference = "Stop"

Write-Host "=== FIFA WC 2026 Prediction Pipeline ===" -ForegroundColor Green

Write-Host "`n[1/8] Scraping matches data..." -ForegroundColor Cyan
python scrapers/scrape_matches.py

Write-Host "`n[2/8] Scraping rankings..." -ForegroundColor Cyan
python scrapers/scrape_rankings.py

Write-Host "`n[3/8] Scraping Transfermarkt..." -ForegroundColor Cyan
python scrapers/scrape_transfermarkt.py

Write-Host "`n[4/8] Scraping WC history..." -ForegroundColor Cyan
python scrapers/scrape_wc_history.py

Write-Host "`n[5/8] Scraping 2026 qualifying results..." -ForegroundColor Cyan
python scrapers/scrape_qualifying.py

Write-Host "`n[6/8] Replaying ELO & Building master dataset..." -ForegroundColor Cyan
python preprocessing/build_dataset.py

Write-Host "`n[7/8] Preprocessing and dataset splitting..." -ForegroundColor Cyan
python preprocessing/preprocess.py

Write-Host "`n[8/8] Engineering features & selecting..." -ForegroundColor Cyan
python features/engineer.py
python features/select.py

Write-Host "`nTraining ML models..." -ForegroundColor Cyan
python models/train.py

Write-Host "`nEvaluating models..." -ForegroundColor Cyan
python models/evaluate.py

Write-Host "`nRunning Monte Carlo simulations (100,000 runs)..." -ForegroundColor Cyan
python simulation/monte_carlo.py

Write-Host "`n=== Pipeline successfully completed! ===" -ForegroundColor Green
Write-Host "You can now run: uvicorn api.main:app --reload --port 8000" -ForegroundColor Yellow
Write-Host "And in another terminal: cd web; npm run dev" -ForegroundColor Yellow
