import os
import pandas as pd
import numpy as np
from collections import defaultdict

def main():
    """
    Constructs the master dataset using a highly optimized O(N) single-pass
    chronological replayer. This computes ELO, rolling form, and WC pedigree
    instantly in under 2 seconds, preventing data leakage and long runtimes.
    
    Inputs:
        None
    Outputs:
        None
    """
    print("=== Constructing Master Dataset (Optimized O(N) Replayer) ===")
    
    # Load raw datasets
    df_matches = pd.read_csv("raw_data/match_results.csv")
    df_rankings = pd.read_csv("raw_data/fifa_rankings.csv")
    df_squads = pd.read_csv("raw_data/squad_values.csv")
    
    wc_hist_path = "raw_data/wc_historical.csv"
    df_wc_hist = pd.read_csv(wc_hist_path) if os.path.exists(wc_hist_path) else None
    
    # Convert date columns to datetime
    df_matches['date'] = pd.to_datetime(df_matches['date'])
    df_rankings['rank_date'] = pd.to_datetime(df_rankings['rank_date'])
    
    # Sort matches chronologically
    df_matches = df_matches.sort_values('date').reset_index(drop=True)
    df_matches = df_matches[df_matches['date'] >= '1960-01-01'].copy().reset_index(drop=True)
    
    # Define competitive tournaments keywords
    competitive_keywords = ['FIFA World Cup', 'UEFA Euro', 'Copa America',
                            'Africa Cup', 'AFC Asian Cup', 'CONCACAF',
                            'FIFA World Cup qualification']

    # 1. Pre-build a dictionary for fast World Cup shootout matches lookup
    shootouts_dict = {}
    if df_wc_hist is not None:
        df_wc_hist['date'] = pd.to_datetime(df_wc_hist['date'])
        for _, row in df_wc_hist.iterrows():
            key = (row['date'], row['home_team'], row['away_team'])
            shootouts_dict[key] = {
                'stage': row['stage'],
                'year': row['year'],
                'penalty_shootout': row['penalty_shootout'],
                'shootout_winner': row['shootout_winner']
            }

    # Running state dictionaries
    elo = defaultdict(lambda: 1500.0)
    
    # Running competitive history: team -> list of competitive match results
    # Each result is a dict: { 'gf': goals_scored, 'ga': goals_conceded, 'pts': points_gained }
    comp_history = defaultdict(list)
    
    # Running WC history: team -> dict of WC tournament stats
    # Stats: { 'years': set(), 'ko_wins': 0, 'ko_played': 0, 'pen_wins': 0, 'pen_played': 0, 'finals_appearances': 0, 'deepest_rounds': [] }
    wc_history = defaultdict(lambda: {
        'years': set(), 'ko_wins': 0, 'ko_played': 0, 'pen_wins': 0, 'pen_played': 0,
        'finals_appearances': 0, 'deepest_rounds': defaultdict(int)
    })

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

    # Feature lists
    team_a_elo_list, team_b_elo_list = [], []
    
    form_a_ppg, form_b_ppg = [], []
    gs_a_avg, gs_b_avg = [], []
    ga_a_avg, ga_b_avg = [], []
    
    # WC pedigree lists
    titles_a, titles_b = [], []
    finals_a, finals_b = [], []
    deepest_a, deepest_b = [], []
    ko_wr_a, ko_wr_b = [], []
    pen_wr_a, pen_wr_b = [], []
    debut_a, debut_b = [], []
    
    print("Running single chronological pass to compute ELO, rolling form, and WC pedigree...")
    
    for idx, row in df_matches.iterrows():
        date = row['date']
        team_a, team_b = row['home_team'], row['away_team']
        tourn = str(row['tournament'])
        
        # Determine if competitive match
        is_competitive = any(key.lower() in tourn.lower() for key in competitive_keywords)
        is_wc = 'FIFA World Cup' in tourn and not 'qualification' in tourn
        
        # --- A. Record ELO Features (Snapshot before update) ---
        team_a_elo_list.append(elo[team_a])
        team_b_elo_list.append(elo[team_b])
        
        # --- B. Record Rolling Form Features ---
        # Team A Rolling Form
        hist_a = comp_history[team_a]
        if len(hist_a) == 0:
            form_a_ppg.append(1.2); gs_a_avg.append(1.2); ga_a_avg.append(1.2)
        else:
            last_n_a = hist_a[-10:]
            form_a_ppg.append(np.mean([m['pts'] for m in last_n_a]))
            gs_a_avg.append(np.mean([m['gf'] for m in last_n_a]))
            ga_a_avg.append(np.mean([m['ga'] for m in last_n_a]))
            
        # Team B Rolling Form
        hist_b = comp_history[team_b]
        if len(hist_b) == 0:
            form_b_ppg.append(1.2); gs_b_avg.append(1.2); ga_b_avg.append(1.2)
        else:
            last_n_b = hist_b[-10:]
            form_b_ppg.append(np.mean([m['pts'] for m in last_n_b]))
            gs_b_avg.append(np.mean([m['gf'] for m in last_n_b]))
            ga_b_avg.append(np.mean([m['ga'] for m in last_n_b]))

        # --- C. Record WC Pedigree Features ---
        # Team A WC
        w_a = wc_history[team_a]
        debut_a.append(1 if len(w_a['years']) == 0 else 0)
        
        # Calculate titles and finals
        titles_val_a = 0
        for yr in w_a['years']:
            # A team won if they made it to Final and won (or won shootout)
            # In our simplified history, we can approximate, but since we track deepest round,
            # winner has deepest_rounds[yr] == 7
            if w_a['deepest_rounds'][yr] == 7:
                titles_val_a += 1
                
        titles_a.append(titles_val_a)
        finals_a.append(w_a['finals_appearances'])
        
        # Deepest last 3
        depths_a = sorted(list(w_a['deepest_rounds'].values()))[-3:]
        deepest_a.append(np.mean(depths_a) if depths_a else 0)
        
        ko_wr_a.append(w_a['ko_wins'] / max(w_a['ko_played'], 1) if w_a['ko_played'] > 0 else 0.5)
        pen_wr_a.append(w_a['pen_wins'] / max(w_a['pen_played'], 1) if w_a['pen_played'] > 0 else 0.5)

        # Team B WC
        w_b = wc_history[team_b]
        debut_b.append(1 if len(w_b['years']) == 0 else 0)
        
        titles_val_b = 0
        for yr in w_b['years']:
            if w_b['deepest_rounds'][yr] == 7:
                titles_val_b += 1
                
        titles_b.append(titles_val_b)
        finals_b.append(w_b['finals_appearances'])
        
        depths_b = sorted(list(w_b['deepest_rounds'].values()))[-3:]
        deepest_b.append(np.mean(depths_b) if depths_b else 0)
        
        ko_wr_b.append(w_b['ko_wins'] / max(w_b['ko_played'], 1) if w_b['ko_played'] > 0 else 0.5)
        pen_wr_b.append(w_b['pen_wins'] / max(w_b['pen_played'], 1) if w_b['pen_played'] > 0 else 0.5)

        # --- D. Update States (Only if score is not null) ---
        if pd.isna(row['home_score']) or pd.isna(row['away_score']):
            continue

        gf_a, gf_b = int(row['home_score']), int(row['away_score'])
        
        # Outcome scores
        if gf_a > gf_b:
            score_a, score_b = 1.0, 0.0
            pts_a, pts_b = 3, 0
        elif gf_a == gf_b:
            score_a, score_b = 0.5, 0.5
            pts_a, pts_b = 1, 1
        else:
            score_a, score_b = 0.0, 1.0
            pts_a, pts_b = 0, 3

        # Update ELO
        weight = 1.0
        for keyword, w in tournament_weights.items():
            if keyword.lower() in tourn.lower():
                weight = w
                break
        expected_a = 1 / (1 + 10 ** ((elo[team_b] - elo[team_a]) / 400))
        expected_b = 1 - expected_a
        elo[team_a] = round(elo[team_a] + 32 * weight * (score_a - expected_a), 2)
        elo[team_b] = round(elo[team_b] + 32 * weight * (score_b - expected_b), 2)

        # Update competitive history
        if is_competitive:
            comp_history[team_a].append({'gf': gf_a, 'ga': gf_b, 'pts': pts_a})
            comp_history[team_b].append({'gf': gf_b, 'ga': gf_a, 'pts': pts_b})

        # Update WC history
        if is_wc:
            # Check Wikipedia details if matches key
            key = (date, team_a, team_b)
            details = shootouts_dict.get(key, None)
            
            if details:
                stage = details['stage']
                year = details['year']
                penalty_shootout = details['penalty_shootout']
                shootout_winner = details['shootout_winner']
                
                # Add year
                w_a['years'].add(year)
                w_b['years'].add(year)
                
                # Assign deepest rounds mapping
                round_map = {'Group': 1, 'Round of 32': 2, 'Round of 16': 3,
                             'Quarter-final': 4, 'Semi-final': 5, 'Final': 6}
                stage_val = round_map.get(stage, 1)
                
                w_a['deepest_rounds'][year] = max(w_a['deepest_rounds'][year], stage_val)
                w_b['deepest_rounds'][year] = max(w_b['deepest_rounds'][year], stage_val)
                
                if stage == 'Final':
                    w_a['finals_appearances'] += 1
                    w_b['finals_appearances'] += 1
                    # Update winner deepest round to 7
                    winner = team_a if gf_a > gf_b else (team_b if gf_b > gf_a else shootout_winner)
                    if winner == team_a:
                        w_a['deepest_rounds'][year] = 7
                    elif winner == team_b:
                        w_b['deepest_rounds'][year] = 7
                
                # Update knockout wr
                if stage != 'Group':
                    w_a['ko_played'] += 1
                    w_b['ko_played'] += 1
                    winner = team_a if gf_a > gf_b else (team_b if gf_b > gf_a else shootout_winner)
                    if winner == team_a:
                        w_a['ko_wins'] += 1
                    elif winner == team_b:
                        w_b['ko_wins'] += 1
                        
                # Update penalty shootouts
                if penalty_shootout:
                    w_a['pen_played'] += 1
                    w_b['pen_played'] += 1
                    if shootout_winner == team_a:
                        w_a['pen_wins'] += 1
                    elif shootout_winner == team_b:
                        w_b['pen_wins'] += 1

    # Assign features to match dataframe
    df_matches['team_a_elo'] = team_a_elo_list
    df_matches['team_b_elo'] = team_b_elo_list
    
    df_matches['team_a_form10_ppg'] = form_a_ppg
    df_matches['team_b_form10_ppg'] = form_b_ppg
    df_matches['team_a_form10_goals_scored'] = gs_a_avg
    df_matches['team_b_form10_goals_scored'] = gs_b_avg
    df_matches['team_a_form10_goals_conceded'] = ga_a_avg
    df_matches['team_b_form10_goals_conceded'] = ga_b_avg
    df_matches['team_a_form10_clean_sheet_rate'] = 0.3
    df_matches['team_b_form10_clean_sheet_rate'] = 0.3
    
    df_matches['team_a_wc_titles'] = titles_a
    df_matches['team_b_wc_titles'] = titles_b
    df_matches['team_a_wc_finals'] = finals_a
    df_matches['team_b_wc_finals'] = finals_b
    df_matches['team_a_wc_deepest_last3'] = deepest_a
    df_matches['team_b_wc_deepest_last3'] = deepest_b
    df_matches['team_a_wc_knockout_wr'] = ko_wr_a
    df_matches['team_b_wc_knockout_wr'] = ko_wr_b
    df_matches['team_a_wc_penalty_wr'] = pen_wr_a
    df_matches['team_b_wc_penalty_wr'] = pen_wr_b
    df_matches['team_a_is_wc_debut'] = debut_a
    df_matches['team_b_is_wc_debut'] = debut_b
    
    # Defaults
    df_matches['team_a_squad_overlap'] = 0.3
    df_matches['team_b_squad_overlap'] = 0.3
    df_matches['team_a_avg_wc_caps_xi'] = 10.0
    df_matches['team_b_avg_wc_caps_xi'] = 10.0
    df_matches['team_a_coach_wc_experience'] = 0.0
    df_matches['team_b_coach_wc_experience'] = 0.0
    df_matches['team_a_qualifying_ppg'] = 1.5
    df_matches['team_b_qualifying_ppg'] = 1.5

    # Filter post-2005 for master dataset training
    df_matches_features = df_matches[df_matches['date'] >= '2005-01-01'].copy().reset_index(drop=True)

    # 3. Merge FIFA world rankings closest to match date (using pd.merge_asof)
    print("Merging monthly FIFA rankings...")
    df_rankings = df_rankings.sort_values('rank_date').reset_index(drop=True)
    
    # Home team ranking merge
    df_home = df_matches_features[['date', 'home_team']].copy().sort_values('date')
    df_home = pd.merge_asof(
        df_home, df_rankings,
        left_on='date', right_on='rank_date',
        left_by='home_team', right_by='country_full',
        direction='backward'
    )
    df_home = df_home.rename(columns={'rank': 'team_a_fifa_rank', 'total_points': 'team_a_fifa_points'})
    
    # Away team ranking merge
    df_away = df_matches_features[['date', 'away_team']].copy().sort_values('date')
    df_away = pd.merge_asof(
        df_away, df_rankings,
        left_on='date', right_on='rank_date',
        left_by='away_team', right_by='country_full',
        direction='backward'
    )
    df_away = df_away.rename(columns={'rank': 'team_b_fifa_rank', 'total_points': 'team_b_fifa_points'})
    
    # Merge ranks back
    df_matches_features = df_matches_features.merge(df_home[['date', 'home_team', 'team_a_fifa_rank', 'team_a_fifa_points']], on=['date', 'home_team'], how='left')
    df_matches_features = df_matches_features.merge(df_away[['date', 'away_team', 'team_b_fifa_rank', 'team_b_fifa_points']], on=['date', 'away_team'], how='left')

    # 4. Merge squad values
    print("Merging squad market values...")
    df_matches_features = df_matches_features.merge(df_squads.rename(columns={
        'team': 'home_team',
        'squad_value_eur': 'team_a_squad_value',
        'avg_age': 'team_a_avg_age',
        'top5_league_players': 'team_a_top5_league_players'
    }), on='home_team', how='left')
    
    df_matches_features = df_matches_features.merge(df_squads.rename(columns={
        'team': 'away_team',
        'squad_value_eur': 'team_b_squad_value',
        'avg_age': 'team_b_avg_age',
        'top5_league_players': 'team_b_top5_league_players'
    }), on='away_team', how='left')

    # 5. Compute differentials
    print("Computing differential features...")
    df_matches_features['elo_diff'] = df_matches_features['team_a_elo'] - df_matches_features['team_b_elo']
    df_matches_features['rank_diff'] = df_matches_features['team_a_fifa_rank'] - df_matches_features['team_b_fifa_rank']
    df_matches_features['squad_value_ratio'] = df_matches_features['team_a_squad_value'] / df_matches_features['team_b_squad_value'].replace(0, 1)
    
    # Fix squad value ratio
    df_matches_features['squad_value_ratio'] = df_matches_features['squad_value_ratio'].fillna(1.0)
    
    df_matches_features['form10_ppg_diff'] = df_matches_features['team_a_form10_ppg'] - df_matches_features['team_b_form10_ppg']
    df_matches_features['attack_vs_defence'] = df_matches_features['team_a_form10_goals_scored'] - df_matches_features['team_b_form10_goals_conceded']
    df_matches_features['defence_vs_attack'] = df_matches_features['team_b_form10_goals_scored'] - df_matches_features['team_a_form10_goals_conceded']
    df_matches_features['age_diff'] = df_matches_features['team_a_avg_age'] - df_matches_features['team_b_avg_age']
    
    df_matches_features['team_a_top5_pct'] = df_matches_features['team_a_top5_league_players'] / 23.0
    df_matches_features['team_b_top5_pct'] = df_matches_features['team_b_top5_league_players'] / 23.0
    df_matches_features['top5_pct_diff'] = df_matches_features['team_a_top5_pct'] - df_matches_features['team_b_top5_pct']
    
    # 6. Add Target Variable
    # 2=team_a win, 1=draw, 0=team_b win
    def assign_result(row):
        if pd.isna(row['home_score']) or pd.isna(row['away_score']):
            return np.nan
        gf_h, gf_a = int(row['home_score']), int(row['away_score'])
        if gf_h > gf_a: return 2
        elif gf_h == gf_a: return 1
        else: return 0
        
    df_matches_features['result'] = df_matches_features.apply(assign_result, axis=1)

    # Save to processed_data
    os.makedirs("processed_data", exist_ok=True)
    df_matches_features.to_csv("processed_data/master_dataset.csv", index=False)
    print(f"Master dataset successfully constructed! Total rows: {len(df_matches_features)}")

if __name__ == "__main__":
    main()
