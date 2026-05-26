import os
import json
import joblib
import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.metrics import (accuracy_score, precision_recall_fscore_support,
                             log_loss, brier_score_loss, confusion_matrix,
                             mean_absolute_error)
import matplotlib.pyplot as plt
import seaborn as sns
import statsmodels.api as sm

def rps_single(probs, actual):
    """
    Manually calculates the Ranked Probability Score (RPS) for ordered multi-class outcomes.
    
    Inputs:
        probs: list/np.array - [p_loss, p_draw, p_win] (sorted by outcome ordinal: 0=loss, 1=draw, 2=win)
        actual: int - actual outcome index (0, 1, or 2)
    Outputs:
        float - RPS score
    """
    cum_pred = np.cumsum(probs)
    cum_actual = np.cumsum([1 if actual == i else 0 for i in range(3)])
    return float(np.mean((cum_pred - cum_actual) ** 2))

def scoreline_probabilities(lambda_a, lambda_b, max_goals=6):
    """
    Compute probability of every scoreline from 0-0 to max_goals-max_goals.
    """
    probs = {}
    for i in range(max_goals):
        for j in range(max_goals):
            probs[(i, j)] = float(poisson.pmf(i, lambda_a) * poisson.pmf(j, lambda_b))

    # Normalise
    total = sum(probs.values())
    probs = {k: v / total for k, v in probs.items()}
    
    p_win = sum(v for (i, j), v in probs.items() if i > j)
    p_draw = sum(v for (i, j), v in probs.items() if i == j)
    p_loss = sum(v for (i, j), v in probs.items() if i < j)
    
    return probs, p_win, p_draw, p_loss

def main():
    """
    Runs the comprehensive model evaluation against baseline models on the held-out WC 2022 matches.
    Saves JSON reports and matplotlib diagnostic plots.
    
    Inputs:
        None
    Outputs:
        None
    """
    print("=== Evaluating Models on Held-Out WC 2022 Matches ===")
    
    # 1. Load models, scaler, features, and test set
    scaler = joblib.load('models/scaler.pkl')
    xgb_model = joblib.load('models/xgb_model.pkl')
    poisson_a_model = joblib.load('models/poisson_a.pkl')
    poisson_b_model = joblib.load('models/poisson_b.pkl')
    
    with open("features/selected_features.json") as f:
        selected_features = json.load(f)
        
    with open("models/poisson_features.json") as f:
        poisson_info = json.load(f)
        poisson_features_a = poisson_info['poisson_features_a']
        poisson_features_b = poisson_info['poisson_features_b']

    test = pd.read_csv("processed_data/test_engineered.csv")
    
    # Filter test set specifically for World Cup 2022 matches (since Nov 20, 2022)
    # The tournament name in raw_data is 'FIFA World Cup'
    wc_test = test[
        (test['tournament'] == 'FIFA World Cup') & 
        (test['date'] >= '2022-11-20')
    ].copy().reset_index(drop=True)
    
    if len(wc_test) == 0:
        print("Warning: No matches found matching 'FIFA World Cup' in test set. Evaluating on all test matches.")
        wc_test = test.copy()

    X_test = wc_test[selected_features].fillna(0.0)
    y_true = wc_test['result'].astype(int).values # 2=A_win, 1=draw, 0=B_win
    
    X_test_scaled = scaler.transform(X_test)

    # 2. Generate model predictions
    print(f"Generating predictions for {len(wc_test)} World Cup matches...")
    
    # XGBoost Classifier probabilities: [p_loss, p_draw, p_win]
    xgb_probs = xgb_model.predict_proba(X_test_scaled)
    
    # Poisson GLM goals predictions
    X_poisson_a = sm.add_constant(wc_test[poisson_features_a].fillna(0.0), has_constant='add')
    X_poisson_b = sm.add_constant(wc_test[poisson_features_b].fillna(0.0), has_constant='add')
    
    # Ensure correct columns mapping
    lambda_a = poisson_a_model.predict(X_poisson_a).values
    lambda_b = poisson_b_model.predict(X_poisson_b).values
    
    # Derive ensemble probabilities
    ensemble_probs = []
    pred_classes = []
    
    for idx in range(len(wc_test)):
        # Compute Poisson W/D/L
        _, p_win_p, p_draw_p, p_loss_p = scoreline_probabilities(lambda_a[idx], lambda_b[idx])
        
        # Blend: 60% XGBoost + 40% Poisson
        p_win = 0.60 * xgb_probs[idx][2] + 0.40 * p_win_p
        p_draw = 0.60 * xgb_probs[idx][1] + 0.40 * p_draw_p
        p_loss = 0.60 * xgb_probs[idx][0] + 0.40 * p_loss_p
        
        # Renormalise
        total = p_win + p_draw + p_loss
        probs = np.array([p_loss / total, p_draw / total, p_win / total])
        ensemble_probs.append(probs)
        
        # Predict class (0 = loss, 1 = draw, 2 = win)
        pred_classes.append(np.argmax(probs))
        
    ensemble_probs = np.array(ensemble_probs)
    pred_classes = np.array(pred_classes)

    # 3. Compute Metrics
    results = {}
    
    results['accuracy'] = float(accuracy_score(y_true, pred_classes))
    results['log_loss'] = float(log_loss(y_true, ensemble_probs))
    
    prec, rec, f1, _ = precision_recall_fscore_support(y_true, pred_classes, average='macro')
    results['precision_macro'] = float(prec)
    results['recall_macro'] = float(rec)
    results['f1_macro'] = float(f1)
    
    results['confusion_matrix'] = confusion_matrix(y_true, pred_classes).tolist()
    
    # Brier score per class (loss=0, draw=1, win=2)
    for i, label in enumerate(['loss', 'draw', 'win']):
        binary_true = (y_true == i).astype(int)
        results[f'brier_{label}'] = float(brier_score_loss(binary_true, ensemble_probs[:, i]))
        
    # RPS (Ranked Probability Score)
    results['mean_rps'] = float(np.mean([rps_single(ensemble_probs[i], y_true[i]) for i in range(len(y_true))]))
    
    # Goal MAE
    home_score_true = wc_test['home_score'].values
    away_score_true = wc_test['away_score'].values
    results['goals_home_mae'] = float(mean_absolute_error(home_score_true, lambda_a))
    results['goals_away_mae'] = float(mean_absolute_error(away_score_true, lambda_b))

    # 4. Baseline comparisons
    print("Computing baseline comparisons...")
    
    # Baseline 1: Higher ELO wins (Naive Win Probability based on ELO gap)
    base_elo_probs = []
    base_elo_preds = []
    
    # Baseline 2: Proportional to FIFA ranking
    base_rank_probs = []
    base_rank_preds = []
    
    # Baseline 3: Naive prior (always base rates)
    # Win=45%, Draw=25%, Loss=30%
    base_prior_probs = np.tile([0.30, 0.25, 0.45], (len(y_true), 1))
    base_prior_preds = np.tile(2, len(y_true)) # always predict win
    
    for idx, row in wc_test.iterrows():
        # ELO gap win chance
        elo_diff = row['elo_diff']
        expected_a = 1 / (1 + 10 ** (-elo_diff / 400))
        p_win_e = expected_a * 0.85
        p_loss_e = (1 - expected_a) * 0.85
        p_draw_e = 0.15
        base_elo_probs.append([p_loss_e, p_draw_e, p_win_e])
        base_elo_preds.append(2 if elo_diff > 0 else (0 if elo_diff < 0 else 1))
        
        # Rank diff
        rank_diff = row['rank_diff'] # team_a_rank - team_b_rank (lower is better!)
        p_win_r = 0.65 if rank_diff < 0 else (0.15 if rank_diff > 0 else 0.45)
        p_loss_r = 0.65 if rank_diff > 0 else (0.15 if rank_diff < 0 else 0.45)
        p_draw_r = 0.20
        total_r = p_win_r + p_loss_r + p_draw_r
        base_rank_probs.append([p_loss_r / total_r, p_draw_r / total_r, p_win_r / total_r])
        base_rank_preds.append(2 if rank_diff < 0 else 0)
        
    base_elo_probs = np.array(base_elo_probs)
    base_rank_probs = np.array(base_rank_probs)
    
    results['baseline_elo'] = {
        'accuracy': float(accuracy_score(y_true, base_elo_preds)),
        'log_loss': float(log_loss(y_true, base_elo_probs)),
        'mean_rps': float(np.mean([rps_single(base_elo_probs[i], y_true[i]) for i in range(len(y_true))]))
    }
    
    results['baseline_fifa_rank'] = {
        'accuracy': float(accuracy_score(y_true, base_rank_preds)),
        'log_loss': float(log_loss(y_true, base_rank_probs)),
        'mean_rps': float(np.mean([rps_single(base_rank_probs[i], y_true[i]) for i in range(len(y_true))]))
    }
    
    results['baseline_prior'] = {
        'accuracy': float(accuracy_score(y_true, base_prior_preds)),
        'log_loss': float(log_loss(y_true, base_prior_probs)),
        'mean_rps': float(np.mean([rps_single(base_prior_probs[i], y_true[i]) for i in range(len(y_true))]))
    }

    # 5. Output Report
    os.makedirs("evaluation", exist_ok=True)
    with open('evaluation/report.json', 'w') as f:
        json.dump(results, f, indent=2)
        
    print(f"Evaluation report successfully saved to evaluation/report.json!")

    # 6. Generate plots
    print("Generating evaluation plots...")
    os.makedirs("evaluation/plots", exist_ok=True)
    
    # Plot 1: 3x3 Confusion Matrix Heatmap
    plt.figure(figsize=(6, 5))
    sns.heatmap(
        confusion_matrix(y_true, pred_classes),
        annot=True, fmt='d', cmap='Blues',
        xticklabels=['Away Win', 'Draw', 'Home Win'],
        yticklabels=['Away Win', 'Draw', 'Home Win']
    )
    plt.title('Ensemble Outcome Confusion Matrix')
    plt.xlabel('Predicted Outcome')
    plt.ylabel('Actual Outcome')
    plt.tight_layout()
    plt.savefig('evaluation/plots/confusion_matrix.png', dpi=300)
    plt.close()
    
    # Plot 2: XGBoost Feature Importance (Top 20)
    plt.figure(figsize=(10, 6))
    feature_importances = xgb_model.feature_importances_
    sorted_idx = np.argsort(feature_importances)[-20:]
    plt.barh(np.array(selected_features)[sorted_idx], feature_importances[sorted_idx], color='teal')
    plt.title('Top 20 Selected Features by XGBoost Importance')
    plt.xlabel('Importance Score')
    plt.tight_layout()
    plt.savefig('evaluation/plots/feature_importance_top20.png', dpi=300)
    plt.close()
    
    # Plot 3: Calibration Curve (Reliability Diagram) for Home Wins
    # Bin predicted home win probabilities into 5 buckets
    plt.figure(figsize=(6, 6))
    pred_win_probs = ensemble_probs[:, 2]
    bins = np.linspace(0, 1, 6)
    bin_centers = (bins[:-1] + bins[1:]) / 2
    
    actual_rates = []
    for i in range(len(bins)-1):
        idx_bin = (pred_win_probs >= bins[i]) & (pred_win_probs < bins[i+1])
        if np.sum(idx_bin) > 0:
            actual_rates.append(np.mean(y_true[idx_bin] == 2))
        else:
            actual_rates.append(np.nan)
            
    plt.plot([0, 1], [0, 1], 'k--', label='Perfectly Calibrated')
    plt.plot(bin_centers, actual_rates, 'o-', color='green', label='Ensemble Predictor')
    plt.xlabel('Predicted Home Win Probability')
    plt.ylabel('Actual Win Rate')
    plt.title('Home Win Calibration Curve')
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig('evaluation/plots/calibration_curve.png', dpi=300)
    plt.close()
    
    print("Evaluation diagnostic plots successfully saved to evaluation/plots/!")

if __name__ == "__main__":
    main()
