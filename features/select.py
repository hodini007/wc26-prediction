import os
import json
import numpy as np
import pandas as pd
from sklearn.feature_selection import mutual_info_classif, RFE
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

def main():
    """
    Executes the 3-method feature selection pipeline: XGBoost importance, Mutual Info,
    and RFE with Logistic Regression. Applies correlation filtering and force-includes Tier 1 features.
    Saves to features/selected_features.json.
    
    Inputs:
        None
    Outputs:
        None
    """
    print("=== Selecting Features ===")
    
    # Load engineered train dataset
    train = pd.read_csv("processed_data/train_engineered.csv")
    
    # Target variable
    y_train = train['result']
    
    # Candidate features
    feature_names = [
        'elo_diff', 'rank_diff', 'squad_value_ratio', 'form10_ppg_diff', 'attack_vs_defence', 'defence_vs_attack',
        'top5_pct_diff', 'age_diff', 'coach_wc_experience_diff', 'qualifying_ppg_diff',
        'stage', 'tournament_weight', 'neutral_venue', 'confederation_tier_diff',
        'wc_deepest_last3_diff_wtd', 'wc_knockout_wr_diff_wtd', 'wc_penalty_wr_diff_wtd', 'wc_titles_diff_wtd', 'wc_finals_diff_wtd',
        'confederation_tier_a', 'confederation_tier_b', 'is_wc_debut_a', 'is_wc_debut_b',
        'form_x_elo', 'attack_dominance', 'pressure_experience', 'debut_penalty'
    ]
    
    # Verify columns exist
    feature_names = [f for f in feature_names if f in train.columns]
    X_train = train[feature_names]
    
    # Standardise features for RFE and scaling
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train.fillna(0.0))

    # --- Method 1: XGBoost Feature Importance ---
    print("Running Method 1: XGBoost Importance...")
    xgb_quick = XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        objective='multi:softprob',
        num_class=3,
        random_state=42
    )
    xgb_quick.fit(X_train.fillna(0.0), y_train)
    imp = pd.Series(xgb_quick.feature_importances_, index=feature_names)
    top_xgb = set(imp.nlargest(min(30, len(feature_names))).index)

    # --- Method 2: Mutual Information ---
    print("Running Method 2: Mutual Information...")
    mi_scores = mutual_info_classif(X_train.fillna(0.0), y_train, random_state=42)
    mi = pd.Series(mi_scores, index=feature_names)
    top_mi = set(mi.nlargest(min(30, len(feature_names))).index)

    # --- Method 3: Recursive Feature Elimination (RFE) ---
    print("Running Method 3: RFE with Logistic Regression...")
    rfe = RFE(LogisticRegression(max_iter=1000, multi_class='multinomial', solver='lbfgs', random_state=42), 
              n_features_to_select=min(20, len(feature_names)))
    rfe.fit(X_train_scaled, y_train)
    top_rfe = set(np.array(feature_names)[rfe.support_])

    # --- Union of features in at least 2 methods ---
    print("Combining results...")
    final_features = (top_xgb & top_mi) | (top_xgb & top_rfe) | (top_mi & top_rfe)
    
    # Convert set to list for indexing
    final_features = list(final_features)
    if len(final_features) == 0:
        # Fallback to top XGBoost features if empty union
        final_features = list(top_xgb)[:20]

    # --- Correlation filter: remove one from any pair with |r| > 0.92 ---
    print("Filtering highly correlated features...")
    corr = X_train[final_features].corr().abs()
    to_drop = set()
    for i, col_i in enumerate(corr.columns):
        for col_j in corr.columns[i+1:]:
            if corr.loc[col_i, col_j] > 0.92:
                # drop the one with lower XGBoost importance
                drop = col_i if imp[col_i] < imp[col_j] else col_j
                to_drop.add(drop)
                print(f"Dropped highly correlated feature: {drop} (|r| = {corr.loc[col_i, col_j]:.4f})")
                
    final_features = set(final_features) - to_drop

    # --- Always force-include Tier 1 Features ---
    tier1 = ['elo_diff', 'attack_vs_defence', 'defence_vs_attack', 'form10_ppg_diff', 'squad_value_ratio', 'rank_diff']
    final_features |= set(tier1)

    # Save to json file
    os.makedirs("features", exist_ok=True)
    with open('features/selected_features.json', 'w') as f:
        json.dump(sorted(list(final_features)), f, indent=2)
        
    print(f"Feature selection completed. Final Feature Count: {len(final_features)}")
    print(f"Selected features saved to features/selected_features.json: {sorted(list(final_features))}")

if __name__ == "__main__":
    main()
