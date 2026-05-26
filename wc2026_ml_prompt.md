# FIFA World Cup 2026 — Full ML Prediction System

## Role & Objective

You are a senior ML engineer and full-stack developer. Build a complete, end-to-end FIFA World Cup 2026 prediction system — from raw data scraping to a deployed interactive website showing match-by-match predictions, group stage tables, bracket simulations, and final winner probabilities via Monte Carlo simulation.

Deliver working, production-quality code across every layer: scraping, preprocessing, feature engineering, model training, evaluation, simulation, and a Next.js frontend. Every function must be real and runnable. No placeholders, no mock data, no TODO comments.

---

## WC 2026 Tournament Format (confirmed by FIFA)

- 48 teams total
- 12 groups of 4 teams each
- Each team plays 3 group stage matches (round-robin within group)
- 6 matches per group
- Top 2 from each group qualify automatically = 24 teams
- Best 8 third-place teams across all 12 groups = 8 teams
- Total advancing to knockout stage = 32 teams
- Knockout bracket: Round of 32 → Round of 16 → Quarter-finals → Semi-finals → Final
- Draws in knockout rounds: 30 min extra time → penalty shootout if still level
- Points system: Win=3, Draw=1, Loss=0

### Third-place tiebreaker rule (official FIFA order)
When selecting best 8 third-place teams, rank all 12 third-place finishers by:
1. Points
2. Goal difference
3. Goals scored
4. FIFA ranking (last resort)

### Group stage tiebreaker rule (official FIFA order)
When teams in a group are level on points:
1. Goal difference
2. Goals scored
3. Head-to-head points between tied teams
4. Head-to-head goal difference
5. Head-to-head goals scored
6. FIFA ranking (last resort)

---

## System Architecture

```
wc2026-predictor/
├── scrapers/
│   ├── scrape_matches.py          # historical international results
│   ├── scrape_rankings.py         # FIFA world rankings
│   ├── scrape_transfermarkt.py    # squad market values
│   ├── scrape_wc_history.py       # all WC results 1930-2022
│   └── scrape_qualifying.py       # WC 2026 qualifying results
├── raw_data/                      # all scraped CSVs saved here
├── preprocessing/
│   ├── build_dataset.py           # merge sources, build ELO, rolling stats
│   └── preprocess.py              # clean, encode, scale, split
├── features/
│   ├── engineer.py                # feature construction
│   └── select.py                  # feature selection (3 methods)
├── models/
│   ├── train.py                   # XGBoost + Poisson + ensemble
│   ├── evaluate.py                # metrics, calibration, benchmarks
│   └── *.pkl                      # saved model artifacts
├── simulation/
│   ├── monte_carlo.py             # full tournament simulator
│   └── results.json               # simulation output
├── api/
│   └── main.py                    # FastAPI backend
├── web/                           # Next.js frontend
├── requirements.txt
├── run_pipeline.sh
└── README.md
```

---

## STEP 1 — Data Scraping

Build Python scrapers using `requests`, `BeautifulSoup`, and `pandas`. All scrapers save output to `raw_data/` as CSV. Every scraper must include retry logic with exponential backoff, a 1–2 second delay between requests, and exception handling that logs failures and continues rather than crashing.

Write a shared utility:
```python
def validate_and_save(df, filepath, required_cols):
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    null_pct = df[required_cols].isnull().mean()
    print(f"Null rates:\n{null_pct}")
    df.to_csv(filepath, index=False)
    print(f"Saved {len(df)} rows to {filepath}")
```

### Source 1 — International match results
URL: `https://raw.githubusercontent.com/martj42/international-football-results/master/results.csv`
This is a direct CSV download. No scraping needed, just download and save.
Required columns: `date, home_team, away_team, home_score, away_score, tournament, neutral`
Save as: `raw_data/match_results.csv`

### Source 2 — FIFA world rankings
URL: `https://raw.githubusercontent.com/cnoltehj/football-data/master/data/fifa_ranking-2024-04-04.csv`
Direct CSV download. Contains monthly ranking snapshots.
Required columns: `rank_date, country_full, rank, total_points`
Save as: `raw_data/fifa_rankings.csv`

### Source 3 — Squad market values
Scrape: `https://www.transfermarkt.com/wettbewerbe/nationalmannschaften`
For each national team page, collect: team name, total squad market value (EUR), average age, number of players at top-5 European league clubs (Premier League, La Liga, Bundesliga, Serie A, Ligue 1).
Use headers `{'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}`.
Save as: `raw_data/squad_values.csv`

### Source 4 — World Cup historical data
Scrape Wikipedia. For each World Cup from 1930 to 2022, collect every match result:
- Tournament year, stage (Group/R16/QF/SF/Final), home team, away team, home score, away score, extra time flag, penalty shootout flag, shootout winner
Parse from the individual Wikipedia page for each tournament year e.g. `https://en.wikipedia.org/wiki/1930_FIFA_World_Cup`.
Save as: `raw_data/wc_historical.csv`

### Source 5 — WC 2026 qualifying results
Collect all confederation qualifying match results for WC 2026:
- UEFA (Europe): `https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_qualification_(UEFA)`
- CONMEBOL (South America): `https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_qualification_(CONMEBOL)`
- CAF (Africa), AFC (Asia), CONCACAF (North/Central America), OFC (Oceania): same pattern
For each match: date, home team, away team, home score, away score, confederation
Save as: `raw_data/wc2026_qualifying.csv`

Also save the final list of 48 qualified teams as: `raw_data/qualified_teams.csv` with columns: `team, confederation, qualification_date, qualifying_rank`

---

## STEP 2 — Dataset Construction

File: `preprocessing/build_dataset.py`

Merge all raw sources into a single master match-level dataset. Each row = one match. Build features for both teams. The final dataset covers all international matches from 1960 to present.

### ELO rating system

ELO is dynamic — it updates after every match. Build it by replaying all matches chronologically from 1960. The purpose is twofold: (1) produce historically accurate ELO values at every training row, and (2) produce current ELO values for WC 2026 prediction.

Critical implementation rule: always snapshot each team's ELO BEFORE updating it. If you update first and then record, you leak future information into past features — a data leakage bug that inflates training accuracy but breaks real predictions.

```python
def build_elo_history(matches_df, k=32, start_elo=1500):
    """
    Replay all matches chronologically, maintaining a running ELO per team.
    Records pre-match ELO for both teams at each row (no data leakage).
    Returns matches_df with elo_a and elo_b columns added,
    and a final dict of current ELO values per team.
    """
    elo = defaultdict(lambda: start_elo)
    elo_a_list, elo_b_list = [], []

    tournament_weights = {
        'FIFA World Cup': 1.5,
        'Confederations Cup': 1.25,
        'Copa America': 1.25,
        'UEFA Euro': 1.25,
        'AFC Asian Cup': 1.1,
        'Africa Cup of Nations': 1.1,
        'CONCACAF Gold Cup': 1.1,
        'FIFA World Cup qualification': 1.0,
        'Friendly': 0.75
    }

    for _, match in matches_df.sort_values('date').iterrows():
        team_a, team_b = match['home_team'], match['away_team']

        # Step 1: snapshot pre-match ELO (no leakage)
        elo_a_list.append(elo[team_a])
        elo_b_list.append(elo[team_b])

        # Step 2: determine outcome
        if match['home_score'] > match['away_score']:
            score_a, score_b = 1.0, 0.0
        elif match['home_score'] == match['away_score']:
            score_a, score_b = 0.5, 0.5
        else:
            score_a, score_b = 0.0, 1.0

        # Step 3: get K weight
        weight = 1.0
        for keyword, w in tournament_weights.items():
            if keyword.lower() in str(match['tournament']).lower():
                weight = w
                break

        # Step 4: update ELO
        expected_a = 1 / (1 + 10 ** ((elo[team_b] - elo[team_a]) / 400))
        expected_b = 1 - expected_a
        elo[team_a] = round(elo[team_a] + k * weight * (score_a - expected_a), 2)
        elo[team_b] = round(elo[team_b] + k * weight * (score_b - expected_b), 2)

    matches_df['elo_a'] = elo_a_list
    matches_df['elo_b'] = elo_b_list
    current_elo = dict(elo)  # final state = today's ELO for every team
    return matches_df, current_elo
```

### Rolling form features

For each team at each match, compute rolling stats over the last 5 and last 10 competitive matches only (exclude friendlies). Use only matches before the current match date — no leakage.

```python
def compute_rolling_form(matches_df, team, match_date, window=10):
    """
    Compute rolling stats for a team using their last N competitive matches
    before match_date. Excludes friendlies.
    Returns: win_rate, goals_scored_avg, goals_conceded_avg,
             clean_sheet_rate, points_per_game
    """
    competitive = ['FIFA World Cup', 'UEFA Euro', 'Copa America',
                   'Africa Cup', 'AFC Asian Cup', 'CONCACAF',
                   'FIFA World Cup qualification']

    past = matches_df[
        (matches_df['date'] < match_date) &
        (
            (matches_df['home_team'] == team) |
            (matches_df['away_team'] == team)
        ) &
        (matches_df['tournament'].str.contains('|'.join(competitive), case=False, na=False))
    ].sort_values('date', ascending=False).head(window)

    if len(past) == 0:
        return {'win_rate': 0.5, 'goals_scored_avg': 1.2,
                'goals_conceded_avg': 1.2, 'clean_sheet_rate': 0.3,
                'points_per_game': 1.2}

    wins, draws, goals_scored, goals_conceded, clean_sheets = 0, 0, 0, 0, 0
    for _, m in past.iterrows():
        if m['home_team'] == team:
            gf, ga = m['home_score'], m['away_score']
        else:
            gf, ga = m['away_score'], m['home_score']
        if gf > ga: wins += 1
        elif gf == ga: draws += 1
        goals_scored += gf
        goals_conceded += ga
        if ga == 0: clean_sheets += 1

    n = len(past)
    return {
        'win_rate': wins / n,
        'goals_scored_avg': goals_scored / n,
        'goals_conceded_avg': goals_conceded / n,
        'clean_sheet_rate': clean_sheets / n,
        'points_per_game': (wins * 3 + draws) / n
    }
```

### World Cup pedigree features

For each team, compute these at the time of each match using only WC data up to that match date:

```python
def compute_wc_pedigree(team, before_date, wc_df):
    """
    Compute WC historical features for a team using only WC data
    before the given date. Returns 0-defaults for teams with no WC history.
    """
    past_wcs = wc_df[
        (wc_df['date'] < before_date) &
        ((wc_df['home_team'] == team) | (wc_df['away_team'] == team))
    ]

    if len(past_wcs) == 0:
        return {
            'wc_titles': 0,
            'wc_finals_appearances': 0,
            'wc_deepest_last3': 0,
            'wc_knockout_win_rate': 0.5,
            'wc_penalty_win_rate': 0.5,
            'wc_matches_played': 0,
            'is_wc_debut': 1
        }

    # Encode round depth: Group=1, R32=2, R16=3, QF=4, SF=5, Final=6, Winner=7
    round_map = {'Group': 1, 'Round of 32': 2, 'Round of 16': 3,
                 'Quarter-final': 4, 'Semi-final': 5, 'Final': 6}

    # Compute per-tournament deepest round
    tournaments = past_wcs['year'].unique()
    depths = []
    for yr in sorted(tournaments)[-3:]:  # last 3 WC appearances
        yr_matches = past_wcs[past_wcs['year'] == yr]
        max_depth = yr_matches['stage'].map(round_map).max()
        depths.append(max_depth if not pd.isna(max_depth) else 1)

    # Knockout win rate
    ko_matches = past_wcs[past_wcs['stage'] != 'Group']
    ko_wins = 0
    for _, m in ko_matches.iterrows():
        won = (m['home_team'] == team and m['home_score'] > m['away_score']) or \
              (m['away_team'] == team and m['away_score'] > m['home_score'])
        if won: ko_wins += 1

    # Penalty record
    penalty_matches = past_wcs[past_wcs['penalty_shootout'] == True]
    pen_wins = sum(1 for _, m in penalty_matches.iterrows()
                   if m['shootout_winner'] == team)

    return {
        'wc_titles': sum(1 for yr in tournaments
                        if any(past_wcs[
                            (past_wcs['year']==yr) &
                            (past_wcs['stage']=='Final')
                        ].apply(lambda m:
                            (m['home_team']==team and m['home_score']>m['away_score']) or
                            (m['away_team']==team and m['away_score']>m['home_score']),
                            axis=1))),
        'wc_finals_appearances': sum(1 for yr in tournaments
                                    if len(past_wcs[
                                        (past_wcs['year']==yr) &
                                        (past_wcs['stage']=='Final') &
                                        ((past_wcs['home_team']==team)|
                                         (past_wcs['away_team']==team))
                                    ]) > 0),
        'wc_deepest_last3': np.mean(depths) if depths else 0,
        'wc_knockout_win_rate': ko_wins / max(len(ko_matches), 1),
        'wc_penalty_win_rate': pen_wins / max(len(penalty_matches), 1),
        'wc_matches_played': len(past_wcs),
        'is_wc_debut': 0
    }
```

### Squad overlap feature

```python
def compute_squad_overlap(team, current_squad_2026, wc_2022_squads):
    """
    Fraction of current 2026 starting XI who also played in WC 2022.
    If no 2022 squad data available, return 0.3 as a reasonable default.
    """
    if team not in wc_2022_squads or team not in current_squad_2026:
        return 0.3
    past = set(wc_2022_squads[team])
    current = set(current_squad_2026[team])
    if len(current) == 0:
        return 0.3
    return len(past & current) / len(current)
```

### Master dataset schema

Each row is one match. Build all features for team_a and team_b, then compute differential features:

```
match_id, date, tournament, tournament_weight, stage,
neutral_venue, confederation_a, confederation_b,

# Team A raw features
team_a_elo, team_a_fifa_rank, team_a_fifa_points,
team_a_squad_value, team_a_avg_age, team_a_top5_league_pct,
team_a_form5_ppg, team_a_form10_ppg,
team_a_form10_goals_scored, team_a_form10_goals_conceded,
team_a_form10_clean_sheet_rate,
team_a_wc_titles, team_a_wc_finals, team_a_wc_deepest_last3,
team_a_wc_knockout_wr, team_a_wc_penalty_wr,
team_a_squad_overlap, team_a_avg_wc_caps_xi,
team_a_coach_wc_experience, team_a_is_wc_debut,
team_a_qualifying_ppg,

# Team B raw features (mirror of above)
team_b_elo, team_b_fifa_rank, ... (same columns)

# Head-to-head features
h2h_last5_a_wins, h2h_last5_draws, h2h_last5_b_wins,
h2h_wc_a_wins, h2h_wc_draws, h2h_wc_b_wins,

# Differential features (a minus b, or ratio)
elo_diff, rank_diff, squad_value_ratio, form10_ppg_diff,
attack_vs_defence,   # team_a goals_scored_avg - team_b goals_conceded_avg
defence_vs_attack,   # team_b goals_scored_avg - team_a goals_conceded_avg
age_diff, top5_pct_diff,

# Target variables
team_a_goals, team_b_goals,
result   # 2=team_a win, 1=draw, 0=team_b win
```

---

## STEP 3 — Preprocessing

File: `preprocessing/preprocess.py`

### Missing value strategy

Handle each column type differently — never drop rows that have target variables:

```python
fill_strategies = {
    'elo':              'confederation_mean_by_era',
    'fifa_rank':        'forward_fill_per_team',
    'squad_value':      'confederation_median_by_year',
    'wc_pedigree':      0,          # no history = 0
    'form_features':    'global_mean',
    'qualifying_ppg':   'confederation_mean',
    'squad_overlap':    0.3,        # reasonable default
    'coach_wc_exp':     0,
}
```

For ELO specifically: group matches by confederation and era (pre-1980, 1980-2000, 2000-present), compute the mean ELO per group, and fill missing values with that group mean.

### Encoding

```python
# Ordinal
tournament_weight_map = {
    'Friendly': 0.75, 'Qualification': 1.0,
    'Continental': 1.25, 'WC_Group': 1.5, 'WC_Knockout': 1.5
}
stage_map = {
    'Group': 1, 'Round of 32': 2, 'Round of 16': 3,
    'Quarter-final': 4, 'Semi-final': 5, 'Final': 6
}
confederation_tier = {
    'UEFA': 2, 'CONMEBOL': 2,
    'CAF': 1, 'AFC': 1,
    'CONCACAF': 1, 'OFC': 0
}

# Binary
df['neutral_venue'] = df['neutral'].astype(int)
df['is_wc_debut_a'] = df['team_a_is_wc_debut'].astype(int)
```

### Train / validation / test split

```python
train = df[df['date'] < '2018-01-01']
val   = df[(df['date'] >= '2018-01-01') & (df['date'] < '2022-11-20')]
test  = df[df['date'] >= '2022-11-20']  # WC 2022 — held out entirely
```

Fit `StandardScaler` on training data only. Transform val and test with the fitted scaler. Save scaler as `models/scaler.pkl`.

### Class balance

Check W/D/L distribution. If any class is below 25% of training data, apply SMOTE from `imbalanced-learn` on training data only.

---

## STEP 4 — Feature Engineering

File: `features/engineer.py`

Build the final feature set in priority tiers. The tier ordering reflects predictive power — Tier 1 features carry the most signal and should never be dropped.

### Tier 1 — Current form (highest priority, always include)
These are computed fresh before every WC 2026 prediction and reflect the actual current squad:
```python
tier1 = [
    'elo_diff',              # strongest single predictor
    'attack_vs_defence',     # team_a scoring rate vs team_b conceding rate
    'defence_vs_attack',     # symmetric: team_b scoring vs team_a conceding
    'form10_ppg_diff',       # points per game differential over last 10
    'squad_value_ratio',     # talent gap proxy
    'rank_diff',             # FIFA ranking differential
]
```

### Tier 2 — Squad quality
```python
tier2 = [
    'top5_pct_diff',         # fraction of players at elite clubs
    'age_diff',              # peak age ~26; large diff signals imbalance
    'coach_wc_experience_diff',
    'qualifying_ppg_diff',   # form in WC 2026 qualification
]
```

### Tier 3 — Tournament context
```python
tier3 = [
    'stage',                 # group vs knockout changes team behaviour
    'tournament_weight',     # match importance
    'neutral_venue',
    'confederation_tier_diff',
]
```

### Tier 4 — WC historical features (weighted by squad overlap)

Historical WC features represent past squads, not current ones. Their predictive value depends on how many current players actually played in those past tournaments. Multiply each WC historical feature by the squad overlap factor before including it. If overlap is 0, the feature contributes nothing. If overlap is 0.8, it contributes 80%.

```python
wc_history_cols = [
    'wc_deepest_last3',
    'wc_knockout_wr',
    'wc_penalty_wr',
    'wc_titles',
    'wc_finals',
]

for col in wc_history_cols:
    df[f'team_a_{col}_wtd'] = df[f'team_a_{col}'] * df['team_a_squad_overlap']
    df[f'team_b_{col}_wtd'] = df[f'team_b_{col}'] * df['team_b_squad_overlap']
    df[f'{col}_diff_wtd'] = df[f'team_a_{col}_wtd'] - df[f'team_b_{col}_wtd']

tier4 = [f'{col}_diff_wtd' for col in wc_history_cols]
```

### Tier 5 — Structural / new-team features (weakest, for teams with sparse data)
```python
tier5 = [
    'confederation_tier_a',
    'confederation_tier_b',
    'is_wc_debut_a',
    'is_wc_debut_b',
]
```

### Interaction features
```python
df['form_x_elo']         = df['form10_ppg_diff'] * df['elo_diff'] / 1000
df['attack_dominance']   = df['attack_vs_defence'] * df['squad_value_ratio']
df['pressure_experience']= df['stage'] * (df['team_a_avg_wc_caps_xi'] -
                                           df['team_b_avg_wc_caps_xi'])
df['debut_penalty']      = df['is_wc_debut_a'] * -0.5  # debut teams lose ~50% more
```

---

## STEP 5 — Feature Selection

File: `features/select.py`

Run three selection methods independently on the training set. Take the union of features that appear in at least 2 of the 3 methods. This avoids over-relying on any single selection algorithm.

```python
# Method 1: XGBoost built-in importance
xgb_quick = XGBClassifier(n_estimators=200, max_depth=4)
xgb_quick.fit(X_train, y_train)
imp = pd.Series(xgb_quick.feature_importances_, index=feature_names)
top_xgb = set(imp.nlargest(30).index)

# Method 2: Mutual information
mi_scores = mutual_info_classif(X_train, y_train, random_state=42)
mi = pd.Series(mi_scores, index=feature_names)
top_mi = set(mi.nlargest(30).index)

# Method 3: RFE with logistic regression
rfe = RFE(LogisticRegression(max_iter=1000), n_features_to_select=25)
rfe.fit(X_train_scaled, y_train)
top_rfe = set(np.array(feature_names)[rfe.support_])

# Union of features in at least 2 methods
final_features = (top_xgb & top_mi) | (top_xgb & top_rfe) | (top_mi & top_rfe)

# Correlation filter: remove one from any pair with |r| > 0.92
corr = pd.DataFrame(X_train, columns=feature_names)[list(final_features)].corr().abs()
to_drop = set()
for i, col_i in enumerate(corr.columns):
    for col_j in corr.columns[i+1:]:
        if corr.loc[col_i, col_j] > 0.92:
            # drop whichever has lower XGB importance
            drop = col_i if imp[col_i] < imp[col_j] else col_j
            to_drop.add(drop)
final_features -= to_drop

# Always force-include all Tier 1 features regardless of selection outcome
final_features |= set(tier1)

import json
with open('features/selected_features.json', 'w') as f:
    json.dump(sorted(final_features), f, indent=2)

print(f"Final feature count: {len(final_features)}")
```

---

## STEP 6 — Model Training

File: `models/train.py`

Train three components. Each predicts a different thing and they are blended for final output.

### Component A — XGBoost match outcome classifier

Predicts P(team_a win), P(draw), P(team_b win) as three probabilities.

```python
import optuna
from xgboost import XGBClassifier

def objective(trial):
    params = {
        'n_estimators':      trial.suggest_int('n_estimators', 200, 800),
        'max_depth':         trial.suggest_int('max_depth', 3, 7),
        'learning_rate':     trial.suggest_float('learning_rate', 0.01, 0.15, log=True),
        'subsample':         trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree':  trial.suggest_float('colsample_bytree', 0.6, 1.0),
        'min_child_weight':  trial.suggest_int('min_child_weight', 1, 10),
        'gamma':             trial.suggest_float('gamma', 0, 5),
        'objective':         'multi:softprob',
        'num_class':         3,
        'eval_metric':       'mlogloss',
        'use_label_encoder': False,
        'early_stopping_rounds': 50,
    }
    model = XGBClassifier(**params)
    model.fit(X_train, y_train,
              eval_set=[(X_val, y_val)],
              verbose=False)
    preds = model.predict_proba(X_val)
    return log_loss(y_val, preds)

study = optuna.create_study(direction='minimize')
study.optimize(objective, n_trials=100)
best_xgb = XGBClassifier(**study.best_params)
best_xgb.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=100)
joblib.dump(best_xgb, 'models/xgb_model.pkl')
```

### Component B — Poisson regression (scoreline model)

Train two separate Poisson models predicting expected goals for each team. This is mathematically grounded — football goals follow an approximate Poisson distribution.

```python
import statsmodels.api as sm

# Team A goals model: lambda_a = exp(b0 + b1*attack_a + b2*defence_b + b3*elo_diff)
poisson_features_a = ['team_a_form10_goals_scored', 'team_b_form10_goals_conceded',
                       'elo_diff', 'squad_value_ratio', 'neutral_venue',
                       'team_a_top5_pct', 'attack_vs_defence']
X_poisson_a = sm.add_constant(df_train[poisson_features_a])
poisson_a = sm.GLM(df_train['team_a_goals'], X_poisson_a,
                   family=sm.families.Poisson()).fit()

# Team B goals model (symmetric)
poisson_features_b = ['team_b_form10_goals_scored', 'team_a_form10_goals_conceded',
                       'elo_diff', 'squad_value_ratio', 'neutral_venue',
                       'team_b_top5_pct', 'defence_vs_attack']
X_poisson_b = sm.add_constant(df_train[poisson_features_b])
poisson_b = sm.GLM(df_train['team_b_goals'], X_poisson_b,
                   family=sm.families.Poisson()).fit()

joblib.dump(poisson_a, 'models/poisson_a.pkl')
joblib.dump(poisson_b, 'models/poisson_b.pkl')

def scoreline_probabilities(lambda_a, lambda_b, max_goals=6):
    """
    Compute probability of every scoreline from 0-0 to max_goals-max_goals.
    Returns dict {(i,j): probability} and derived W/D/L probs.
    """
    from scipy.stats import poisson
    probs = {}
    for i in range(max_goals):
        for j in range(max_goals):
            probs[(i, j)] = round(poisson.pmf(i, lambda_a) * poisson.pmf(j, lambda_b), 5)

    # Normalise to sum to 1 (captures tail beyond max_goals)
    total = sum(probs.values())
    probs = {k: v/total for k, v in probs.items()}

    p_win  = sum(v for (i,j),v in probs.items() if i > j)
    p_draw = sum(v for (i,j),v in probs.items() if i == j)
    p_loss = sum(v for (i,j),v in probs.items() if i < j)

    assert abs(p_win + p_draw + p_loss - 1.0) < 1e-6, "Probabilities must sum to 1"
    return probs, p_win, p_draw, p_loss
```

### Component C — Penalty shootout model

```python
penalty_features = ['team_a_wc_penalty_wr', 'team_b_wc_penalty_wr',
                    'team_a_avg_wc_caps_xi', 'team_b_avg_wc_caps_xi',
                    'elo_diff']
penalty_df = wc_df[wc_df['penalty_shootout'] == True].copy()
penalty_df['a_won_shootout'] = (penalty_df['shootout_winner'] ==
                                 penalty_df['home_team']).astype(int)

penalty_model = LogisticRegression(max_iter=500)
penalty_model.fit(penalty_df[penalty_features], penalty_df['a_won_shootout'])
joblib.dump(penalty_model, 'models/penalty_model.pkl')
```

### Component D — Ensemble blend

```python
def predict_match(team_a, team_b, stage, features_row, models):
    """
    Blend XGBoost and Poisson predictions.
    For group stage: 60% XGBoost + 40% Poisson.
    For knockout: 55% XGBoost + 45% Poisson (Poisson more reliable under pressure).
    Returns: p_win, p_draw, p_loss, expected_goals_a, expected_goals_b,
             scoreline_probs, top5_scorelines
    """
    xgb_probs = models['xgb'].predict_proba(features_row)[0]  # [p_loss, p_draw, p_win]

    lambda_a = models['poisson_a'].predict(features_row)[0]
    lambda_b = models['poisson_b'].predict(features_row)[0]
    scoreline_probs, p_win_p, p_draw_p, p_loss_p = scoreline_probabilities(lambda_a, lambda_b)

    w = 0.55 if stage > 1 else 0.60  # XGBoost weight
    p_win  = w * xgb_probs[2] + (1-w) * p_win_p
    p_draw = w * xgb_probs[1] + (1-w) * p_draw_p
    p_loss = w * xgb_probs[0] + (1-w) * p_loss_p

    # Renormalise
    total = p_win + p_draw + p_loss
    p_win, p_draw, p_loss = p_win/total, p_draw/total, p_loss/total

    assert abs(p_win + p_draw + p_loss - 1.0) < 1e-6

    top5 = sorted(scoreline_probs.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        'p_win': round(p_win, 4),
        'p_draw': round(p_draw, 4),
        'p_loss': round(p_loss, 4),
        'expected_goals_a': round(lambda_a, 2),
        'expected_goals_b': round(lambda_b, 2),
        'top5_scorelines': [(f"{i}-{j}", round(p, 4)) for (i,j),p in top5],
        'model_confidence': 'high' if max(p_win,p_loss) > 0.55
                            else 'medium' if max(p_win,p_loss) > 0.40
                            else 'low'
    }
```

---

## STEP 7 — Model Evaluation

File: `models/evaluate.py`

Evaluate on the held-out WC 2022 test set. Report all metrics and save to `evaluation/report.json`.

### Metrics to compute

```python
from sklearn.metrics import (accuracy_score, classification_report,
                              log_loss, brier_score_loss, confusion_matrix)

def evaluate_all(y_true, y_pred_proba, y_pred_class):
    results = {}

    # Classification
    results['accuracy']   = accuracy_score(y_true, y_pred_class)
    results['log_loss']   = log_loss(y_true, y_pred_proba)
    results['report']     = classification_report(y_true, y_pred_class,
                                target_names=['B_win','draw','A_win'],
                                output_dict=True)
    results['confusion_matrix'] = confusion_matrix(y_true, y_pred_class).tolist()

    # Brier score per class
    for i, label in enumerate(['loss','draw','win']):
        binary_true = (y_true == i).astype(int)
        results[f'brier_{label}'] = brier_score_loss(binary_true, y_pred_proba[:,i])

    # RPS (Ranked Probability Score)
    def rps_single(probs, actual):
        cum_pred   = np.cumsum(probs)
        cum_actual = np.cumsum([1 if actual==i else 0 for i in range(3)])
        return float(np.mean((cum_pred - cum_actual)**2))

    results['mean_rps'] = np.mean([rps_single(y_pred_proba[i], y_true[i])
                                    for i in range(len(y_true))])

    # Scoreline MAE
    results['goals_a_mae'] = mean_absolute_error(true_goals_a, pred_lambda_a)
    results['goals_b_mae'] = mean_absolute_error(true_goals_b, pred_lambda_b)

    return results
```

### Calibration check

Plot a reliability diagram. Bin predictions into 10 buckets (0-10%, 10-20%... 90-100%). For each bucket, compare predicted probability vs actual win rate. A well-calibrated model's line should closely follow the diagonal.

### Benchmark comparison

Compare against three baselines:
1. Higher ELO always wins — assign P(win)=0.65 to higher ELO team
2. FIFA ranking proportional — P(win) scales with rank differential
3. Naive prior — always predict 45% win / 25% draw / 30% loss (historical base rates)

Report RPS and log-loss for all three baselines alongside the model.

### Output plots (save to `evaluation/plots/`)
- `confusion_matrix.png`
- `calibration_curve.png`
- `feature_importance_top20.png`
- `rps_by_stage.png` — RPS broken down by tournament stage
- `goals_mae_by_team.png` — which teams had worst goal prediction error

---

## STEP 8 — Monte Carlo Tournament Simulator

File: `simulation/monte_carlo.py`

Simulate the full WC 2026 tournament 100,000 times. Use the confirmed format: 12 groups of 4, top 2 + best 8 thirds advance to Round of 32.

```python
import numpy as np
from collections import defaultdict
from itertools import combinations

def simulate_single_match(team_a, team_b, stage, team_features, models,
                           knockout=False):
    """
    Simulate one match. Returns winner (or 'draw' for group stage).
    For knockout: if draw after 90 min, simulate extra time, then penalties.
    """
    features = build_match_features(team_a, team_b, stage, team_features)
    pred = predict_match(team_a, team_b, stage, features, models)

    # Sample a scoreline from the Poisson distribution
    lambda_a = pred['expected_goals_a']
    lambda_b = pred['expected_goals_b']
    goals_a  = np.random.poisson(lambda_a)
    goals_b  = np.random.poisson(lambda_b)

    if not knockout:
        return team_a if goals_a > goals_b else (team_b if goals_b > goals_a else 'draw'), \
               goals_a, goals_b

    # Knockout: if draw, 30% chance of extra time goal (simplified AET model)
    if goals_a == goals_b:
        aet_prob_a = pred['p_win'] / (pred['p_win'] + pred['p_loss'] + 1e-9)
        aet_rand   = np.random.random()
        if aet_rand < 0.35:  # 35% of KO draws produce an AET winner
            winner = team_a if np.random.random() < aet_prob_a else team_b
        else:
            # Penalties
            pen_features = build_penalty_features(team_a, team_b, team_features)
            p_a_wins = models['penalty'].predict_proba(pen_features)[0][1]
            winner = team_a if np.random.random() < p_a_wins else team_b
    else:
        winner = team_a if goals_a > goals_b else team_b

    return winner, goals_a, goals_b


def simulate_group(group_teams, team_features, models):
    """
    Simulate a 4-team group (6 matches). Return final standings list sorted by
    points → goal difference → goals scored → H2H → FIFA rank.
    """
    standings = {t: {'pts': 0, 'gd': 0, 'gs': 0, 'gc': 0} for t in group_teams}
    h2h = {(a,b): {'pts_a': 0, 'gd_a': 0, 'gs_a': 0}
           for a,b in combinations(group_teams, 2)}

    for team_a, team_b in combinations(group_teams, 2):
        _, ga, gb = simulate_single_match(team_a, team_b, stage=1,
                                          team_features=team_features,
                                          models=models, knockout=False)
        # Update standings
        standings[team_a]['gs'] += ga;  standings[team_a]['gc'] += gb
        standings[team_b]['gs'] += gb;  standings[team_b]['gc'] += ga
        standings[team_a]['gd'] += ga - gb
        standings[team_b]['gd'] += gb - ga

        if ga > gb:
            standings[team_a]['pts'] += 3
            h2h[(team_a,team_b)]['pts_a'] += 3
        elif gb > ga:
            standings[team_b]['pts'] += 3
        else:
            standings[team_a]['pts'] += 1
            standings[team_b]['pts'] += 1
            h2h[(team_a,team_b)]['pts_a'] += 1

        h2h[(team_a,team_b)]['gd_a']  += ga - gb
        h2h[(team_a,team_b)]['gs_a']  += ga

    def sort_key(team):
        s = standings[team]
        fifa = team_features[team].get('fifa_rank', 50)
        return (s['pts'], s['gd'], s['gs'], -fifa)

    return sorted(group_teams, key=sort_key, reverse=True)


def select_best_thirds(third_place_teams, team_features):
    """
    From 12 third-place teams, select best 8 by:
    points → goal difference → goals scored → FIFA ranking
    """
    def third_key(entry):
        team, stats = entry
        return (stats['pts'], stats['gd'], stats['gs'],
                -team_features[team].get('fifa_rank', 50))

    sorted_thirds = sorted(third_place_teams.items(), key=third_key, reverse=True)
    return [t for t, _ in sorted_thirds[:8]]


def simulate_tournament(groups, team_features, models, n_sims=100_000):
    """
    Run n_sims full tournament simulations.
    Returns: win_prob, finalist_prob, sf_prob, qf_prob, r16_prob, qualify_prob
    """
    counts = {
        'champion':  defaultdict(int),
        'finalist':  defaultdict(int),
        'sf':        defaultdict(int),
        'qf':        defaultdict(int),
        'r16':       defaultdict(int),
        'qualified': defaultdict(int),
    }

    for sim in range(n_sims):
        # --- Group stage (12 groups of 4) ---
        auto_qualifiers = []
        third_place_results = {}

        for group_id, group_teams in groups.items():
            standings = simulate_group(group_teams, team_features, models)
            auto_qualifiers.append(standings[0])   # 1st
            auto_qualifiers.append(standings[1])   # 2nd
            # Record 3rd place team with their stats for best-8 selection
            third = standings[2]
            third_place_results[third] = {
                'pts': team_features[third].get('_last_sim_pts', 3),
                'gd':  team_features[third].get('_last_sim_gd', 0),
                'gs':  team_features[third].get('_last_sim_gs', 2),
            }

        best_thirds = select_best_thirds(third_place_results, team_features)

        r32_teams = auto_qualifiers + best_thirds   # 24 + 8 = 32
        assert len(r32_teams) == 32

        for t in r32_teams:
            counts['qualified'][t] += 1

        # --- Knockout bracket: R32 → R16 → QF → SF → Final ---
        bracket = r32_teams[:]
        stage_names = ['r16', 'qf', 'sf', 'finalist']
        stage_levels = [2, 3, 4, 5]

        for stage_name, stage_level in zip(stage_names, stage_levels):
            next_round = []
            for i in range(0, len(bracket), 2):
                winner, _, _ = simulate_single_match(
                    bracket[i], bracket[i+1],
                    stage=stage_level,
                    team_features=team_features,
                    models=models,
                    knockout=True
                )
                next_round.append(winner)
                counts[stage_name][winner] += 1
            bracket = next_round

        # Final
        champion, _, _ = simulate_single_match(
            bracket[0], bracket[1],
            stage=6,
            team_features=team_features,
            models=models,
            knockout=True
        )
        counts['champion'][champion] += 1

    # Convert counts to probabilities
    results = {}
    for key, counter in counts.items():
        results[f'{key}_probability'] = {
            t: round(c / n_sims, 4)
            for t, c in sorted(counter.items(), key=lambda x: x[1], reverse=True)
        }

    return results
```

### Save simulation output

```python
import json
from datetime import datetime

output = {
    'n_simulations': 100_000,
    'timestamp': datetime.utcnow().isoformat(),
    'format': '12 groups of 4, top 2 + best 8 thirds advance, R32 to Final',
    **simulate_tournament(groups, team_features, models, n_sims=100_000),
    'group_predictions': group_predictions_dict,
    'match_predictions': all_match_predictions_list,
}

with open('simulation/results.json', 'w') as f:
    json.dump(output, f, indent=2)
```

---

## STEP 9 — FastAPI Backend

File: `api/main.py`

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import joblib, json

models_cache = {}
data_cache   = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    models_cache['xgb']     = joblib.load('models/xgb_model.pkl')
    models_cache['poisson_a']= joblib.load('models/poisson_a.pkl')
    models_cache['poisson_b']= joblib.load('models/poisson_b.pkl')
    models_cache['penalty'] = joblib.load('models/penalty_model.pkl')
    models_cache['scaler']  = joblib.load('models/scaler.pkl')
    with open('simulation/results.json') as f:
        data_cache['simulation'] = json.load(f)
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/api/teams")
def get_teams():
    """All 48 qualified teams with metadata."""

@app.get("/api/groups")
def get_groups():
    """All 12 groups with predicted standings and qualification probabilities."""

@app.get("/api/match/{match_id}")
def get_match(match_id: str):
    """Full prediction for one match: probs, scorelines, stats, confidence."""

@app.get("/api/simulation/results")
def get_simulation():
    """Full Monte Carlo output: champion/finalist/SF/QF probabilities."""

@app.get("/api/team/{team_name}/path")
def get_team_path(team_name: str):
    """Most likely bracket path for a team with probability at each stage."""

@app.get("/api/group/{group_id}/table")
def get_group_table(group_id: str):
    """Predicted group table: points, GD, goals, qualification probability."""

@app.post("/api/simulate/custom")
def run_custom_simulation(overrides: dict):
    """
    Re-run Monte Carlo with user-provided ELO/form overrides for specific teams.
    Useful for 'what if' scenarios (e.g. what if Mbappe is injured).
    """
```

Run with: `uvicorn api.main:app --reload --port 8000`

---

## STEP 10 — Frontend (Next.js 14 + Tailwind CSS)

### Design system
- Background: `#0a0e1a` (dark navy)
- Surface cards: `#111827`
- Text primary: `#f9fafb`
- Text muted: `#9ca3af`
- Win color: `#22c55e` (green)
- Draw color: `#f59e0b` (amber)
- Loss color: `#ef4444` (red)
- Accent: `#3b82f6` (blue)
- Use `recharts` for all charts
- Use `framer-motion` for animations
- Emoji flags for all teams (no image dependencies)

### Page 1 — Home (`/`)
- Header: "FIFA World Cup 2026 — ML Predictions"
- Top 8 teams by champion probability as horizontal bars with flag, name, percentage
- Summary stats: total simulations run, model accuracy on WC 2022, last updated
- Quick links to Groups, Matches, Bracket pages

### Page 2 — Group stage (`/groups`)
- 12 group tables in a 3-column responsive grid
- Each table: team flag + name, predicted points, goal difference, qualification %
- Row colors: green background if qualify prob > 70%, amber if 30–70%, red if < 30%
- Click any group row → expand to show all 6 match predictions for that group
- Each match shows win/draw/loss bar + most likely score

### Page 3 — Match predictor (`/matches`)
- All 48 group stage matches as cards
- Each card:
  - Flags + team names + date
  - Segmented horizontal bar: [WIN %] [DRAW %] [LOSS %] in green/amber/red
  - Expected score: "1.8 – 0.9 xG"
  - Top 3 scorelines: "2-0 (18%) · 1-0 (15%) · 2-1 (13%)"
  - Stat bars: ELO gap, form gap, attack vs defence
  - Confidence badge: High / Medium / Low
- Filter bar: by group (A–L), by date, by team name search

### Page 4 — Bracket simulator (`/bracket`)
- Full visual bracket from R32 to Final
- Each matchup slot: Team A flag+name vs Team B flag+name, winner probability
- Color-highlight the most likely path for top 3 predicted finalists
- "Re-simulate" button → POST to `/api/simulate/custom` → update bracket live
- Convergence chart: line chart showing champion probability stabilising from
  1,000 → 10,000 → 100,000 simulations (pre-computed, not live)

### Page 5 — Team deep dive (`/team/[slug]`)
- Flag, team name, confederation, FIFA rank, current ELO
- Four probability stat cards: Champion / Finalist / Semi-final / Quarter-final
- Form strip: last 10 results as colored dots W=green D=amber L=red
- Radar chart (recharts RadarChart): 6 axes normalised 0–10:
  Attack · Defence · Form · WC Pedigree · Squad Value · Experience
- Group fixtures with predicted outcome for each match
- Bracket path tree: most likely elimination scenario

### Frontend data fetching

```typescript
// scripts/fetch-predictions.ts (run at build time)
// Calls FastAPI, saves results to public/data/predictions.json
// This enables static generation — no API calls needed at runtime

// components use SWR for client-side revalidation every 24 hours
import useSWR from 'swr'
const { data } = useSWR('/data/predictions.json', fetcher, {
  revalidateOnFocus: false,
  dedupingInterval: 86_400_000
})
```

---

## STEP 11 — Run Pipeline

### `requirements.txt`
```
pandas==2.1.0
numpy==1.26.0
scikit-learn==1.3.0
xgboost==2.0.0
optuna==3.4.0
statsmodels==0.14.0
scipy==1.11.0
imbalanced-learn==0.11.0
joblib==1.3.0
requests==2.31.0
beautifulsoup4==4.12.0
fastapi==0.104.0
uvicorn==0.24.0
matplotlib==3.8.0
seaborn==0.13.0
```

### `run_pipeline.sh`
```bash
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

echo "Starting API server on port 8000..."
uvicorn api.main:app --reload --port 8000 &

echo "Building frontend..."
cd web && npm install && npm run build && npm start
```

---

## Hard Quality Rules

1. All code must be fully runnable — zero placeholder functions, zero TODO comments
2. Every probability output must pass: `assert abs(sum(probs) - 1.0) < 1e-6`
3. ELO snapshot must happen BEFORE update at each match row — no data leakage
4. WC historical features must be multiplied by squad_overlap before use
5. Group stage uses 12 groups of 4 teams — 6 matches per group, 3 per team
6. 24 auto-qualifiers (top 2 × 12 groups) + 8 best thirds = 32 in R32
7. Monte Carlo must complete 100,000 simulations in under 5 minutes — use numpy vectorised sampling, avoid Python loops inside the simulation hot path
8. All scrapers must save timestamped files and never overwrite without backup
9. Scaler must be fit on training data only — never fit on val or test
10. Feature selection must always force-include all Tier 1 features regardless of selection algorithm output
11. Frontend must be fully responsive and load in under 2 seconds (static generation + SWR)
12. Every docstring must state: inputs, outputs, known edge cases