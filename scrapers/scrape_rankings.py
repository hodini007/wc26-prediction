import os
import pandas as pd
from utils import validate_and_save, fetch_url_with_retry

def main():
    """
    Downloads monthly FIFA world rankings from the stable Dato-Futbol repository.
    Computes numerical ranks chronologically based on total points.
    Saves as raw_data/fifa_rankings.csv.
    
    Inputs:
        None
    Outputs:
        None
    """
    print("=== Downloading FIFA World Rankings ===")
    
    # Stable men's historical rankings URL
    url = "https://raw.githubusercontent.com/Dato-Futbol/fifa-ranking/refs/heads/master/ranking_fifa_historical.csv"
    
    try:
        response = fetch_url_with_retry(url)
        from io import StringIO
        df = pd.read_csv(StringIO(response.text))
        
        # Sort and dynamically calculate ranks within each date grouping
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values(by=['date', 'total_points'], ascending=[True, False]).reset_index(drop=True)
        
        # Calculate rank dynamically: cumcount() + 1 inside each date
        df['rank'] = df.groupby('date').cumcount() + 1
        
        # Rename columns to match the required master dataset schema
        df = df.rename(columns={
            'date': 'rank_date',
            'team': 'country_full'
        })
        
        required_cols = ["rank_date", "country_full", "rank", "total_points"]
        validate_and_save(df[required_cols], "raw_data/fifa_rankings.csv", required_cols)
        
    except Exception as e:
        print(f"Error downloading FIFA rankings: {e}")
        raise e

if __name__ == "__main__":
    main()
