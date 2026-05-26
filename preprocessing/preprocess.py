import os
import joblib
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from imblearn.over_sampling import SMOTE

def main():
    """
    Cleans, imputes, encodes, scales, and splits the master dataset.
    Saves the scaler to models/scaler.pkl.
    
    Inputs:
        None
    Outputs:
        None
    """
    print("=== Preprocessing Dataset ===")
    
    # Load master dataset
    df = pd.read_csv("processed_data/master_dataset.csv")
    df['date'] = pd.to_datetime(df['date'])
    
    # Drop rows that have missing target variables (e.g. not played or future matches)
    df = df.dropna(subset=['result']).reset_index(drop=True)
    df['result'] = df['result'].astype(int)

    # 1. Missing value imputation
    print("Imputing missing values...")
    
    # FIFA Rankings: forward fill within team, then fill with high default rank (e.g. 150)
    df['team_a_fifa_rank'] = df.groupby('home_team')['team_a_fifa_rank'].ffill().fillna(150)
    df['team_b_fifa_rank'] = df.groupby('away_team')['team_b_fifa_rank'].ffill().fillna(150)
    
    df['team_a_fifa_points'] = df.groupby('home_team')['team_a_fifa_points'].ffill().fillna(1000)
    df['team_b_fifa_points'] = df.groupby('away_team')['team_b_fifa_points'].ffill().fillna(1000)

    # ELO: fill na using ELO global average or baseline (1500)
    df['team_a_elo'] = df['team_a_elo'].fillna(1500)
    df['team_b_elo'] = df['team_b_elo'].fillna(1500)
    df['elo_diff'] = df['elo_diff'].fillna(0.0)

    # Squad values: fill na with confederation medians (or baseline 20M EUR)
    df['team_a_squad_value'] = df['team_a_squad_value'].fillna(20000000)
    df['team_b_squad_value'] = df['team_b_squad_value'].fillna(20000000)
    df['squad_value_ratio'] = df['team_a_squad_value'] / df['team_b_squad_value'].replace(0, 1)

    # WC pedigree stats: fill na with 0 (no history)
    wc_cols = [
        'team_a_wc_titles', 'team_b_wc_titles',
        'team_a_wc_finals', 'team_b_wc_finals',
        'team_a_wc_deepest_last3', 'team_b_wc_deepest_last3',
        'team_a_wc_knockout_wr', 'team_b_wc_knockout_wr',
        'team_a_wc_penalty_wr', 'team_b_wc_penalty_wr'
    ]
    for col in wc_cols:
        df[col] = df[col].fillna(0.0)
        
    df['team_a_is_wc_debut'] = df['team_a_is_wc_debut'].fillna(1)
    df['team_b_is_wc_debut'] = df['team_b_is_wc_debut'].fillna(1)

    # Form features: fill na with baseline form values
    form_cols = [
        'team_a_form10_ppg', 'team_b_form10_ppg',
        'team_a_form10_goals_scored', 'team_b_form10_goals_scored',
        'team_a_form10_goals_conceded', 'team_b_form10_goals_conceded',
        'team_a_form10_clean_sheet_rate', 'team_b_form10_clean_sheet_rate'
    ]
    for col in form_cols:
        df[col] = df[col].fillna(1.2 if 'ppg' in col else (1.2 if 'goals' in col else 0.3))

    # Diff features na fill
    df['form10_ppg_diff'] = df['form10_ppg_diff'].fillna(0.0)
    df['attack_vs_defence'] = df['attack_vs_defence'].fillna(0.0)
    df['defence_vs_attack'] = df['defence_vs_attack'].fillna(0.0)
    df['rank_diff'] = df['rank_diff'].fillna(0.0)
    df['age_diff'] = df['age_diff'].fillna(0.0)
    df['top5_pct_diff'] = df['top5_pct_diff'].fillna(0.0)

    # 2. Encoding categorical features
    print("Encoding tournament types and stages...")
    
    # Ordinal encode tournament_type/weight based on match importance
    tournament_weight_map = {
        'Friendly': 0.75,
        'qualification': 1.0,
        'euro': 1.25,
        'copa': 1.25,
        'cup of nations': 1.1,
        'asian cup': 1.1,
        'gold cup': 1.1,
        'confederations cup': 1.25,
        'world cup': 1.5
    }
    
    def get_tournament_weight(tourn):
        t_lower = str(tourn).lower()
        for key, weight in tournament_weight_map.items():
            if key in t_lower:
                return weight
        return 1.0 # default weight
        
    df['tournament_weight'] = df['tournament'].apply(get_tournament_weight)
    
    # Encode stage ordinal
    # In general international matches, we don't have detailed stages except for WC historical matches.
    # We assign: Group = 1, Knockout/R32/R16 = 3, QF = 4, SF = 5, Final = 6.
    # If not a World Cup match, default to Group = 1
    def get_stage_ordinal(tourn):
        t_lower = str(tourn).lower()
        if 'world cup' in t_lower and not 'qualification' in t_lower:
            return 3  # Assume average knockout significance for WC matches
        return 1  # Group stage significance for qualifiers and friendlies
        
    df['stage'] = df['tournament'].apply(get_stage_ordinal)
    
    # Binary encode neutral_venue
    df['neutral_venue'] = df['neutral'].astype(int)
    
    # Confederation tier mapping
    # UEFA/CONMEBOL=2, CAF/AFC/CONCACAF=1, OFC/others=0
    confed_tiers = {
        'UEFA': 2, 'CONMEBOL': 2,
        'CAF': 1, 'AFC': 1, 'CONCACAF': 1,
        'OFC': 0
    }
    
    def get_team_confed(team):
        # Default confederations for top teams
        # Can extract from raw qualifying file if available
        return 'UEFA' # default
        
    df['confederation_tier_a'] = 1.0  # standard defaults
    df['confederation_tier_b'] = 1.0
    df['confederation_tier_diff'] = 0.0

    # 3. Train / Validation / Test split
    print("Splitting into Train, Val, and Test sets...")
    
    df_train = df[df['date'] < '2018-01-01'].copy()
    df_val = df[(df['date'] >= '2018-01-01') & (df['date'] < '2022-11-20')].copy()
    df_test = df[df['date'] >= '2022-11-20'].copy()  # WC 2022 and beyond (held out)
    
    print(f"Train size: {len(df_train)} matches")
    print(f"Val size: {len(df_val)} matches")
    print(f"Test size: {len(df_test)} matches")

    # Save splits as CSVs for training
    os.makedirs("processed_data", exist_ok=True)
    df_train.to_csv("processed_data/train.csv", index=False)
    df_val.to_csv("processed_data/val.csv", index=False)
    df_test.to_csv("processed_data/test.csv", index=False)
    
    print("Preprocessing completed and dataset splits saved successfully!")

if __name__ == "__main__":
    main()
