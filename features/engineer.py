import os
import pandas as pd
import numpy as np

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Applies the full 5-tier feature engineering architecture, including ELO decays
    weighted by squad overlap, and advanced interactive variables.
    
    Inputs:
        df: pd.DataFrame - raw master split
    Outputs:
        pd.DataFrame - engineered dataset
    """
    df = df.copy()

    # --- Tier 1 Features (Current Form & Ratings) ---
    # These are already calculated in build_dataset:
    # elo_diff, rank_diff, squad_value_ratio, form10_ppg_diff, attack_vs_defence, defence_vs_attack
    
    # --- Tier 2 Features (Squad Quality & Strengths) ---
    # top5_pct_diff, age_diff are in build_dataset
    df['coach_wc_experience_diff'] = df['team_a_coach_wc_experience'] - df['team_b_coach_wc_experience']
    df['qualifying_ppg_diff'] = df['team_a_qualifying_ppg'] - df['team_b_qualifying_ppg']

    # --- Tier 3 Features (Tournament Context) ---
    # stage, tournament_weight, neutral_venue are in build_dataset/preprocess
    df['confederation_tier_diff'] = df['confederation_tier_a'] - df['confederation_tier_b']

    # --- Tier 4 Features (Historical WC features decayed by squad overlap) ---
    # Decays: weighted = historical_value * squad_overlap
    wc_history_cols = [
        'wc_deepest_last3',
        'wc_knockout_wr',
        'wc_penalty_wr',
        'wc_titles',
        'wc_finals',
    ]
    
    for col in wc_history_cols:
        # Team A
        df[f'team_a_{col}_wtd'] = df[f'team_a_{col}'] * df['team_a_squad_overlap']
        # Team B
        df[f'team_b_{col}_wtd'] = df[f'team_b_{col}'] * df['team_b_squad_overlap']
        # Differential
        df[f'{col}_diff_wtd'] = df[f'team_a_{col}_wtd'] - df[f'team_b_{col}_wtd']

    # --- Tier 5 Features (Structural/Debutants) ---
    # confederation_tier_a, confederation_tier_b, is_wc_debut_a, is_wc_debut_b are in build_dataset/preprocess
    df['is_wc_debut_a'] = df['team_a_is_wc_debut'].astype(int)
    df['is_wc_debut_b'] = df['team_b_is_wc_debut'].astype(int)

    # --- Interaction Features ---
    df['form_x_elo'] = df['form10_ppg_diff'] * df['elo_diff'] / 1000.0
    df['attack_dominance'] = df['attack_vs_defence'] * df['squad_value_ratio']
    df['pressure_experience'] = df['stage'] * (df['team_a_avg_wc_caps_xi'] - df['team_b_avg_wc_caps_xi'])
    df['debut_penalty'] = df['is_wc_debut_a'] * -0.5

    return df

def main():
    """
    Loads preprocessed splits, applies feature engineering, and saves the engineered datasets.
    
    Inputs:
        None
    Outputs:
        None
    """
    print("=== Engineering Features ===")
    
    # Load splits
    train = pd.read_csv("processed_data/train.csv")
    val = pd.read_csv("processed_data/val.csv")
    test = pd.read_csv("processed_data/test.csv")
    
    # Apply engineering
    print("Engineering train split...")
    train_eng = engineer_features(train)
    print("Engineering val split...")
    val_eng = engineer_features(val)
    print("Engineering test split...")
    test_eng = engineer_features(test)
    
    # Save engineered CSVs
    os.makedirs("processed_data", exist_ok=True)
    train_eng.to_csv("processed_data/train_engineered.csv", index=False)
    val_eng.to_csv("processed_data/val_engineered.csv", index=False)
    test_eng.to_csv("processed_data/test_engineered.csv", index=False)
    
    print("Feature engineering successfully completed!")

if __name__ == "__main__":
    main()
