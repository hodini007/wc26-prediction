import os
import pandas as pd
from utils import validate_and_save, fetch_url_with_retry

def main():
    """
    Downloads international football match results and shootout history from GitHub.
    Saves them as raw CSV files.
    
    Inputs:
        None
    Outputs:
        None
    """
    print("=== Downloading International Match Results ===")
    
    # 1. Download results.csv
    results_url = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv"
    try:
        response = fetch_url_with_retry(results_url)
        # Load directly to pandas DataFrame
        from io import StringIO
        df_results = pd.read_csv(StringIO(response.text))
        
        required_cols = ["date", "home_team", "away_team", "home_score", "away_score", "tournament", "neutral"]
        validate_and_save(df_results, "raw_data/match_results.csv", required_cols)
        
    except Exception as e:
        print(f"Error downloading match results: {e}")
        raise e
        
    # 2. Download shootouts.csv
    shootouts_url = "https://raw.githubusercontent.com/martj42/international_results/master/shootouts.csv"
    try:
        response = fetch_url_with_retry(shootouts_url)
        from io import StringIO
        df_shootouts = pd.read_csv(StringIO(response.text))
        
        required_cols_shoot = ["date", "home_team", "away_team", "winner"]
        validate_and_save(df_shootouts, "raw_data/shootouts.csv", required_cols_shoot)
        
    except Exception as e:
        print(f"Error downloading shootout results: {e}")
        raise e

if __name__ == "__main__":
    main()
