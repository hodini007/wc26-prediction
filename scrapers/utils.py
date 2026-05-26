import os
import time
import requests
import pandas as pd

def validate_and_save(df: pd.DataFrame, filepath: str, required_cols: list) -> None:
    """
    Validate that the DataFrame has the required columns, check null rates,
    create parent directories if they don't exist, and save to CSV.
    
    Inputs:
        df: pd.DataFrame - the scraped dataset
        filepath: str - absolute or relative path to save the CSV
        required_cols: list - list of columns that must be present
    Outputs:
        None
    Known Edge Cases:
        Empty DataFrame or missing columns will raise ValueError.
    """
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    # Check if empty
    if df.empty:
        raise ValueError(f"DataFrame is empty for {filepath}")

    # Check for missing columns
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing} in {filepath}")
    
    # Print null rates for required columns
    null_pct = df[required_cols].isnull().mean()
    print(f"\n--- Validation Report for {os.path.basename(filepath)} ---")
    print(f"Total Rows: {len(df)}")
    print(f"Null rates for required columns:\n{null_pct.to_string()}")
    
    # Save to CSV
    df.to_csv(filepath, index=False)
    print(f"Successfully saved to {filepath}\n")

def fetch_url_with_retry(url: str, headers: dict = None, max_retries: int = 5, backoff_factor: float = 2.0) -> requests.Response:
    """
    Fetch a URL with exponential backoff and retry logic.
    
    Inputs:
        url: str - target URL
        headers: dict - request headers
        max_retries: int - maximum number of attempts
        backoff_factor: float - multiplier for backoff delay
    Outputs:
        requests.Response - successful response
    """
    delay = 1.0
    for attempt in range(max_retries):
        try:
            print(f"Fetching: {url} (Attempt {attempt + 1}/{max_retries})")
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code == 200:
                return response
            elif response.status_code == 429:
                print(f"Rate limited (429). Waiting {delay}s...")
            else:
                print(f"Status code {response.status_code}. Retrying in {delay}s...")
        except requests.RequestException as e:
            print(f"Request failed: {e}. Retrying in {delay}s...")
        
        time.sleep(delay)
        delay *= backoff_factor
        
    raise requests.HTTPError(f"Failed to fetch {url} after {max_retries} attempts.")
