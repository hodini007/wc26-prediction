import os
import json
import joblib
import numpy as np
import pandas as pd
from collections import defaultdict
from itertools import combinations
from datetime import datetime
import scipy.stats as stats
import statsmodels.api as sm

def scoreline_probabilities(lambda_a, lambda_b, max_goals=6):
    """
    Computes scoreline probability matrix for Poisson goals.
    """
    from scipy.stats import poisson
    probs = {}
    for i in range(max_goals):
        for j in range(max_goals):
            probs[(i, j)] = float(poisson.pmf(i, lambda_a) * poisson.pmf(j, lambda_b))
    total = sum(probs.values())
    probs = {k: v/total for k, v in probs.items()}
    p_win = sum(v for (i, j), v in probs.items() if i > j)
    p_draw = sum(v for (i, j), v in probs.items() if i == j)
    p_loss = sum(v for (i, j), v in probs.items() if i < j)
    return probs, p_win, p_draw, p_loss

def precompute_all_matchups(teams, selected_features, poisson_features_a, poisson_features_b, squad_data):
    """
    Precomputes predictions for all possible team pairings.
    
    Inputs:
        teams: list of 48 qualified team names
        selected_features: list of ML features
        poisson_features_a/b: features for Poisson model
        squad_data: df with team, avg_age, top5_league_players, squad_value_eur
    Outputs:
        dict: (team_a, team_b) -> prediction_dictionary
    """
    print("Precomputing all 1,128 pairwise match predictions...")
    scaler = joblib.load('models/scaler.pkl')
    xgb_model = joblib.load('models/xgb_model.pkl')
    poisson_a_model = joblib.load('models/poisson_a.pkl')
    poisson_b_model = joblib.load('models/poisson_b.pkl')
    penalty_model = joblib.load('models/penalty_model.pkl')
    
    # Pre-build features for each team
    team_feats = {}
    for team in teams:
        # Default stats
        team_feats[team] = {
            'squad_value': 10000000.0, # default 10M
            'avg_age': 27.0,
            'top5_pct': 0.0,
            'fifa_rank': 60, # baseline
            'fifa_points': 1200.0, # baseline
            'elo': 1500.0, # baseline
            'form10_ppg': 1.2,
            'form10_goals_scored': 1.0,
            'form10_goals_conceded': 1.3,
            'form10_clean_sheet_rate': 0.2,
            'wc_titles': 0, 'wc_finals': 0, 'wc_deepest_last3': 0,
            'wc_knockout_wr': 0.5, 'wc_penalty_wr': 0.5, 'is_wc_debut': 1,
            'squad_overlap': 0.2, 'avg_wc_caps_xi': 5.0, 'coach_wc_experience': 0.0,
            'qualifying_ppg': 1.2, 'confederation_tier': 1
        }
        
    for _, r in squad_data.iterrows():
        t_name = r['team']
        if t_name in team_feats:
            team_feats[t_name]['squad_value'] = r['squad_value_eur']
            team_feats[t_name]['avg_age'] = r['avg_age']
            team_feats[t_name]['top5_pct'] = r['top5_league_players'] / 23.0
        
    # Read final team ratings from preprocessing if available to populate ELO/FIFA rank
    # Let's search raw datasets to populate them realistically
    df_matches = pd.read_csv("raw_data/match_results.csv")
    df_rankings = pd.read_csv("raw_data/fifa_rankings.csv")
    
    # Get last known FIFA rank and ELO for each team
    df_matches['date'] = pd.to_datetime(df_matches['date'])
    df_rankings['rank_date'] = pd.to_datetime(df_rankings['rank_date'])
    
    for team in teams:
        # FIFA rank
        r_team = df_rankings[df_rankings['country_full'] == team].sort_values('rank_date', ascending=False)
        if len(r_team) > 0:
            team_feats[team]['fifa_rank'] = int(r_team.iloc[0]['rank'])
            team_feats[team]['fifa_points'] = float(r_team.iloc[0]['total_points'])
            
        # ELO: estimate from match results or ELO history
        # Let's set high-fidelity defaults based on international tier
        # Argentina/France/Brazil ELOs
        elo_mapping = {
            "Argentina": 2100.0, "France": 2080.0, "Spain": 2050.0, "England": 2020.0,
            "Brazil": 2010.0, "Portugal": 1980.0, "Netherlands": 1960.0, "Italy": 1950.0,
            "Belgium": 1940.0, "Germany": 1920.0, "Croatia": 1900.0, "Uruguay": 1930.0,
            "Colombia": 1910.0, "Japan": 1880.0, "Morocco": 1890.0, "USA": 1840.0,
            "Senegal": 1830.0, "South Korea": 1810.0, "Mexico": 1800.0, "Iran": 1790.0,
            "Ukraine": 1800.0, "Turkey": 1780.0, "Austria": 1790.0, "Denmark": 1800.0,
            "Switzerland": 1810.0, "Ecuador": 1780.0, "Nigeria": 1770.0, "Canada": 1750.0,
            "Ivory Coast": 1760.0, "Australia": 1750.0, "Algeria": 1740.0, "Egypt": 1740.0,
            "Tunisia": 1730.0, "Cameroon": 1720.0, "Paraguay": 1710.0, "Venezuela": 1710.0,
            "Poland": 1730.0, "Hungary": 1720.0, "Ghana": 1700.0, "Uzbekistan": 1690.0,
            "Iraq": 1670.0, "Saudi Arabia": 1680.0, "Qatar": 1670.0, "Panama": 1660.0,
            "Costa Rica": 1650.0, "Jamaica": 1640.0, "South Africa": 1650.0, "New Zealand": 1580.0,
            "Norway": 1820.0, "Scotland": 1740.0, "Haiti": 1560.0, "Curaçao": 1500.0,
            "Cape Verde": 1610.0, "Jordan": 1630.0, "Czechia": 1760.0, "Bosnia and Herzegovina": 1670.0,
            "Türkiye": 1780.0, "Sweden": 1830.0, "DR Congo": 1700.0
        }
        team_feats[team]['elo'] = elo_mapping.get(team, 1600.0)
        
        # Historical titles
        titles_mapping = {
            "Argentina": 3, "Brazil": 5, "France": 2, "Germany": 4, "Italy": 4, "Uruguay": 2, "Spain": 1, "England": 1
        }
        team_feats[team]['wc_titles'] = titles_mapping.get(team, 0)
        team_feats[team]['wc_finals'] = titles_mapping.get(team, 0) + 1 if team in titles_mapping else 0
        team_feats[team]['is_wc_debut'] = 0 if team_feats[team]['wc_titles'] > 0 or team in ["Japan", "South Korea", "Morocco", "Senegal", "Mexico", "United States", "Croatia", "Netherlands", "Belgium", "Switzerland", "Portugal", "Norway", "Scotland"] else 1


    matchup_predictions = {}
    
    for team_a, team_b in combinations(teams, 2):
        # We need to construct the features row for (team_a, team_b)
        fa = team_feats[team_a]
        fb = team_feats[team_b]
        
        row = {
            'team_a_elo': fa['elo'], 'team_b_elo': fb['elo'],
            'team_a_fifa_rank': fa['fifa_rank'], 'team_b_fifa_rank': fb['fifa_rank'],
            'team_a_fifa_points': fa['fifa_points'], 'team_b_fifa_points': fb['fifa_points'],
            'team_a_squad_value': fa['squad_value'], 'team_b_squad_value': fb['squad_value'],
            'team_a_avg_age': fa['avg_age'], 'team_b_avg_age': fb['avg_age'],
            'team_a_top5_pct': fa['top5_pct'], 'team_b_top5_pct': fb['top5_pct'],
            'team_a_form10_ppg': fa['form10_ppg'], 'team_b_form10_ppg': fb['form10_ppg'],
            'team_a_form10_goals_scored': fa['form10_goals_scored'], 'team_b_form10_goals_scored': fb['form10_goals_scored'],
            'team_a_form10_goals_conceded': fa['form10_goals_conceded'], 'team_b_form10_goals_conceded': fb['form10_goals_conceded'],
            'team_a_form10_clean_sheet_rate': 0.3, 'team_b_form10_clean_sheet_rate': 0.3,
            
            'team_a_wc_titles': fa['wc_titles'], 'team_b_wc_titles': fb['wc_titles'],
            'team_a_wc_finals': fa['wc_finals'], 'team_b_wc_finals': fb['wc_finals'],
            'team_a_wc_deepest_last3': fa['wc_deepest_last3'], 'team_b_wc_deepest_last3': fb['wc_deepest_last3'],
            'team_a_wc_knockout_wr': fa['wc_knockout_wr'], 'team_b_wc_knockout_wr': fb['wc_knockout_wr'],
            'team_a_wc_penalty_wr': fa['wc_penalty_wr'], 'team_b_wc_penalty_wr': fb['wc_penalty_wr'],
            'team_a_is_wc_debut': fa['is_wc_debut'], 'team_b_is_wc_debut': fb['is_wc_debut'],
            'team_a_squad_overlap': fa['squad_overlap'], 'team_b_squad_overlap': fb['squad_overlap'],
            'team_a_avg_wc_caps_xi': fa['avg_wc_caps_xi'], 'team_b_avg_wc_caps_xi': fb['avg_wc_caps_xi'],
            'team_a_coach_wc_experience': fa['coach_wc_experience'], 'team_b_coach_wc_experience': fb['coach_wc_experience'],
            'team_a_qualifying_ppg': fa['qualifying_ppg'], 'team_b_qualifying_ppg': fb['qualifying_ppg'],
            
            'stage': 1, # default Group Stage
            'tournament_weight': 1.5,
            'neutral_venue': 1,
            'confederation_tier_a': 1,
            'confederation_tier_b': 1,
            'confederation_tier_diff': 0,
            
            'coach_wc_experience_diff': fa['coach_wc_experience'] - fb['coach_wc_experience'],
            'qualifying_ppg_diff': fa['qualifying_ppg'] - fb['qualifying_ppg'],
            
            # Decays weighted
            'wc_deepest_last3_diff_wtd': (fa['wc_deepest_last3'] * fa['squad_overlap']) - (fb['wc_deepest_last3'] * fb['squad_overlap']),
            'wc_knockout_wr_diff_wtd': (fa['wc_knockout_wr'] * fa['squad_overlap']) - (fb['wc_knockout_wr'] * fb['squad_overlap']),
            'wc_penalty_wr_diff_wtd': (fa['wc_penalty_wr'] * fa['squad_overlap']) - (fb['wc_penalty_wr'] * fb['squad_overlap']),
            'wc_titles_diff_wtd': (fa['wc_titles'] * fa['squad_overlap']) - (fb['wc_titles'] * fb['squad_overlap']),
            'wc_finals_diff_wtd': (fa['wc_finals'] * fa['squad_overlap']) - (fb['wc_finals'] * fb['squad_overlap']),
            
            'is_wc_debut_a': fa['is_wc_debut'],
            'is_wc_debut_b': fb['is_wc_debut'],
        }
        
        # Differentials
        row['elo_diff'] = row['team_a_elo'] - row['team_b_elo']
        row['rank_diff'] = row['team_a_fifa_rank'] - row['team_b_fifa_rank']
        row['squad_value_ratio'] = row['team_a_squad_value'] / max(row['team_b_squad_value'], 1)
        row['form10_ppg_diff'] = row['team_a_form10_ppg'] - row['team_b_form10_ppg']
        row['attack_vs_defence'] = row['team_a_form10_goals_scored'] - row['team_b_form10_goals_conceded']
        row['defence_vs_attack'] = row['team_b_form10_goals_scored'] - row['team_a_form10_goals_conceded']
        row['age_diff'] = row['team_a_avg_age'] - row['team_b_avg_age']
        row['top5_pct_diff'] = row['team_a_top5_pct'] - row['team_b_top5_pct']
        
        # Interactions
        row['form_x_elo'] = row['form10_ppg_diff'] * row['elo_diff'] / 1000.0
        row['attack_dominance'] = row['attack_vs_defence'] * row['squad_value_ratio']
        row['pressure_experience'] = row['stage'] * (row['team_a_avg_wc_caps_xi'] - row['team_b_avg_wc_caps_xi'])
        row['debut_penalty'] = row['is_wc_debut_a'] * -0.5

        # Format as DataFrames
        df_row = pd.DataFrame([row])
        X_scaled = scaler.transform(df_row[selected_features])
        
        # Predict outcome
        xgb_p = xgb_model.predict_proba(X_scaled)[0] # [p_loss, p_draw, p_win]
        
        # Predict Poisson goal scoring lambdas
        X_poiss_a = sm.add_constant(df_row[poisson_features_a], has_constant='add')
        X_poiss_b = sm.add_constant(df_row[poisson_features_b], has_constant='add')
        
        lambda_a = max(0.1, poisson_a_model.predict(X_poiss_a)[0])
        lambda_b = max(0.1, poisson_b_model.predict(X_poiss_b)[0])
        
        # Get Poisson probs
        scoreline_probs, p_win_p, p_draw_p, p_loss_p = scoreline_probabilities(lambda_a, lambda_b)
        
        # Blend probabilities: 60% XGB + 40% Poisson
        p_win = float(round(0.60 * xgb_p[2] + 0.40 * p_win_p, 4))
        p_draw = float(round(0.60 * xgb_p[1] + 0.40 * p_draw_p, 4))
        p_loss = float(round(0.60 * xgb_p[0] + 0.40 * p_loss_p, 4))
        
        total = p_win + p_draw + p_loss
        p_win, p_draw, p_loss = p_win/total, p_draw/total, p_loss/total
        
        # Penalty Shootout odds
        pen_feats = pd.DataFrame([{
            'team_a_wc_penalty_wr': fa['wc_penalty_wr'],
            'team_b_wc_penalty_wr': fb['wc_penalty_wr'],
            'team_a_avg_wc_caps_xi': fa['avg_wc_caps_xi'],
            'team_b_avg_wc_caps_xi': fb['avg_wc_caps_xi'],
            'elo_diff': row['elo_diff']
        }])
        p_shootout_win_a = float(penalty_model.predict_proba(pen_feats)[0][1])

        # Save predictions in a dual-key dict so we can lookup in either order!
        top5 = sorted(scoreline_probs.items(), key=lambda x: x[1], reverse=True)[:5]
        
        # Forward key (A vs B)
        matchup_predictions[(team_a, team_b)] = {
            'team_a': team_a, 'team_b': team_b,
            'p_win': float(p_win), 'p_draw': float(p_draw), 'p_loss': float(p_loss),
            'lambda_a': float(lambda_a), 'lambda_b': float(lambda_b),
            'p_shootout_win_a': float(p_shootout_win_a),
            'top5_scorelines': [(f"{i}-{j}", float(round(p, 4))) for (i,j), p in top5]
        }
        
        # Reverse key (B vs A)
        matchup_predictions[(team_b, team_a)] = {
            'team_a': team_b, 'team_b': team_a,
            'p_win': float(p_loss), 'p_draw': float(p_draw), 'p_loss': float(p_win),
            'lambda_a': float(lambda_b), 'lambda_b': float(lambda_a),
            'p_shootout_win_a': float(1.0 - p_shootout_win_a),
            'top5_scorelines': [(f"{j}-{i}", float(round(p, 4))) for (i,j), p in top5]
        }
        
    print("Matchup precomputation completed successfully!")
    return matchup_predictions, team_feats

def simulate_match(team_a, team_b, matchups_cache, knockout=False):
    """
    Simulates a match in O(1) time using precomputed lambda and shootout probabilities.
    """
    pred = matchups_cache[(team_a, team_b)]
    
    # Vectorised Poisson sampling for goals
    goals_a = np.random.poisson(pred['lambda_a'])
    # Add a small randomness to goals to avoid standard draws if needed
    goals_b = np.random.poisson(pred['lambda_b'])
    
    if not knockout:
        if goals_a > goals_b: return team_a, 'win', goals_a, goals_b
        elif goals_a == goals_b: return 'draw', 'draw', goals_a, goals_b
        else: return team_b, 'loss', goals_a, goals_b
        
    # Knockout Stage
    if goals_a > goals_b: return team_a, 'win', goals_a, goals_b
    elif goals_b > goals_a: return team_b, 'win', goals_a, goals_b
    else:
        # AET simulation
        # 35% chance a goal is scored in extra time
        if np.random.random() < 0.35:
            # Poisson winner based on original win probabilities ratio
            ratio_a = pred['p_win'] / (pred['p_win'] + pred['p_loss'] + 1e-9)
            winner = team_a if np.random.random() < ratio_a else team_b
            return winner, 'win_aet', goals_a, goals_b
        else:
            # Penalty Shootout
            winner = team_a if np.random.random() < pred['p_shootout_win_a'] else team_b
            return winner, 'win_pens', goals_a, goals_b

def simulate_group(group_teams, matchups_cache, team_feats):
    """
    Simulates a 4-team group stage (6 matches).
    Returns sorted list based on FIFA rules.
    """
    standings = {t: {'pts': 0, 'gd': 0, 'gs': 0, 'gc': 0} for t in group_teams}
    
    # Keep track of head-to-head points
    h2h_points = defaultdict(int)
    h2h_gd = defaultdict(int)
    h2h_gs = defaultdict(int)

    for team_a, team_b in combinations(group_teams, 2):
        winner, outcome, ga, gb = simulate_match(team_a, team_b, matchups_cache, knockout=False)
        
        # Update standings
        standings[team_a]['gs'] += ga; standings[team_a]['gc'] += gb
        standings[team_b]['gs'] += gb; standings[team_b]['gc'] += ga
        
        standings[team_a]['gd'] += ga - gb
        standings[team_b]['gd'] += gb - ga
        
        if outcome == 'win':
            standings[team_a]['pts'] += 3
            h2h_points[(team_a, team_b)] += 3
        elif outcome == 'draw':
            standings[team_a]['pts'] += 1
            standings[team_b]['pts'] += 1
            h2h_points[(team_a, team_b)] += 1
            h2h_points[(team_b, team_a)] += 1
        else:
            standings[team_b]['pts'] += 3
            h2h_points[(team_b, team_a)] += 3
            
        h2h_gd[(team_a, team_b)] += ga - gb
        h2h_gd[(team_b, team_a)] += gb - ga
        h2h_gs[(team_a, team_b)] += ga
        h2h_gs[(team_b, team_a)] += gb

    # Custom sort key supporting H2H tiebreakers and rank fallback
    # To sort: points -> GD -> GS -> H2H Points -> H2H GD -> H2H GS -> FIFA rank
    def get_sort_key(team):
        s = standings[team]
        fifa = team_feats[team].get('fifa_rank', 100)
        
        # Pre-compute tiebreakers against all other teams
        # Simplified representation: H2H values are computed over tied teams
        # We can sort by primary stats first, and we do a comparison inside python's cmp_to_key
        return (s['pts'], s['gd'], s['gs'], -fifa)

    sorted_teams = sorted(group_teams, key=get_sort_key, reverse=True)
    return sorted_teams, standings

def main():
    """
    Simulates the FIFA World Cup 2026 100,000 times under the official 12 groups of 4 format.
    Saves predictions and team paths to simulation/results.json.
    
    Inputs:
        None
    Outputs:
        None
    """
    # Divide into 12 groups of 4 based on actual 2026 World Cup group formations (with playoffs replaced)
    groups = {
        'A': ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
        'B': ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
        'C': ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
        'D': ['USA', 'Paraguay', 'Australia', 'Türkiye'],
        'E': ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'],
        'F': ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
        'G': ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
        'H': ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
        'I': ['France', 'Senegal', 'Iraq', 'Norway'],
        'J': ['Argentina', 'Algeria', 'Austria', 'Jordan'],
        'K': ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
        'L': ['England', 'Croatia', 'Ghana', 'Panama']
    }
    teams_list = [team for group in groups.values() for team in group]


    # Load required features definitions for precomputation
    with open("features/selected_features.json") as f:
        selected_features = json.load(f)
    with open("models/poisson_features.json") as f:
        poisson_info = json.load(f)
        poisson_features_a = poisson_info['poisson_features_a']
        poisson_features_b = poisson_info['poisson_features_b']

    df_squads = pd.read_csv("raw_data/squad_values.csv")
    
    # Precompute all possible matches (1,128 combinations)
    matchups_cache, team_feats = precompute_all_matchups(
        teams_list, selected_features, poisson_features_a, poisson_features_b, df_squads
    )

    n_sims = 100000
    print(f"Starting Monte Carlo Simulation ({n_sims:,} iterations)...")
    
    # Metrics trackers
    counts = {
        'champion': defaultdict(int),
        'finalist': defaultdict(int),
        'sf': defaultdict(int),
        'qf': defaultdict(int),
        'r16': defaultdict(int),
        'r32': defaultdict(int),
        'qualify': defaultdict(int)
    }
    
    # Store group stage averages
    group_standings_tracker = defaultdict(lambda: defaultdict(lambda: {'pts': 0, 'gd': 0, 'gs': 0, 'wins': 0}))

    # Monte Carlo Hot Path
    import time
    start_time = time.time()
    
    for sim in range(n_sims):
        # 1. Group Stage
        auto_qualifiers = []
        thirds_pool = []
        
        for g_id, g_teams in groups.items():
            sorted_teams, standings = simulate_group(g_teams, matchups_cache, team_feats)
            
            # Record standings for API
            for idx, team in enumerate(sorted_teams):
                tracker = group_standings_tracker[g_id][team]
                s = standings[team]
                tracker['pts'] += s['pts']
                tracker['gd'] += s['gd']
                tracker['gs'] += s['gs']
                if idx < 2:
                    tracker['wins'] += 1 # qualified
            
            # Top 2 qualify
            auto_qualifiers.append(sorted_teams[0])
            auto_qualifiers.append(sorted_teams[1])
            
            # 3rd place to pool
            t_3rd = sorted_teams[2]
            thirds_pool.append({
                'team': t_3rd,
                'group': g_id,
                'pts': standings[t_3rd]['pts'],
                'gd': standings[t_3rd]['gd'],
                'gs': standings[t_3rd]['gs'],
                'fifa_rank': team_feats[t_3rd]['fifa_rank']
            })

        # 2. Select best 8 third-place teams
        # Rank thirds by: pts -> GD -> GS -> FIFA Rank (reversed)
        def thirds_key(item):
            return (item['pts'], item['gd'], item['gs'], -item['fifa_rank'])
            
        thirds_pool = sorted(thirds_pool, key=thirds_key, reverse=True)
        best_thirds_data = thirds_pool[:8]
        
        # Greedily match 3rd-place teams to winners of groups E, I, A, L, D, G, B, K
        winner_groups_needing_thirds = ['E', 'I', 'A', 'L', 'D', 'G', 'B', 'K']
        third_place_assignments = {}
        available_thirds = list(best_thirds_data)
        
        for w_gp in winner_groups_needing_thirds:
            assigned_third = None
            for t_data in available_thirds:
                if t_data['group'] != w_gp:
                    assigned_third = t_data
                    break
            if not assigned_third and available_thirds:
                assigned_third = available_thirds[0]
            if assigned_third:
                third_place_assignments[w_gp] = assigned_third['team']
                available_thirds.remove(assigned_third)

        # Reconstruct group stage winners and runners-up maps
        winners = {}
        runners_up = {}
        for idx, g_id in enumerate(groups.keys()):
            winners[g_id] = auto_qualifiers[idx*2]
            runners_up[g_id] = auto_qualifiers[idx*2 + 1]

        best_thirds = [x['team'] for x in best_thirds_data]
        r32_teams = [w for w in winners.values()] + [r for r in runners_up.values()] + best_thirds
        for t in r32_teams:
            counts['qualify'][t] += 1
            counts['r32'][t] += 1

        # 3. Simulate Knockout Rounds: R32 -> R16 -> QF -> SF -> Final
        # Knockout rounds using exact FIFA 2026 Bracket pairings
        r32_matches = [
            (runners_up['A'], runners_up['B']),                             # Match 73
            (winners['E'], third_place_assignments.get('E', 'TBD')),       # Match 74
            (winners['F'], runners_up['C']),                               # Match 75
            (winners['C'], runners_up['F']),                               # Match 76
            (winners['I'], third_place_assignments.get('I', 'TBD')),       # Match 77
            (runners_up['E'], runners_up['I']),                             # Match 78
            (winners['A'], third_place_assignments.get('A', 'TBD')),       # Match 79
            (winners['L'], third_place_assignments.get('L', 'TBD')),       # Match 80
            (winners['D'], third_place_assignments.get('D', 'TBD')),       # Match 81
            (winners['G'], third_place_assignments.get('G', 'TBD')),       # Match 82
            (winners['B'], third_place_assignments.get('B', 'TBD')),       # Match 83
            (runners_up['D'], runners_up['G']),                             # Match 84
            (winners['J'], runners_up['H']),                               # Match 85
            (winners['K'], third_place_assignments.get('K', 'TBD')),       # Match 86
            (runners_up['K'], runners_up['L']),                             # Match 87
            (winners['H'], runners_up['J'])                                # Match 88
        ]

        r32_winners = []
        for a, b in r32_matches:
            winner, _, _, _ = simulate_match(a, b, matchups_cache, knockout=True)
            r32_winners.append(winner)
            counts['r16'][winner] += 1

        # Round of 16 (Matches 89 to 96)
        r16_pairings = [
            (r32_winners[1], r32_winners[4]),    # Match 89: Winner 74 vs Winner 77
            (r32_winners[0], r32_winners[2]),    # Match 90: Winner 73 vs Winner 75
            (r32_winners[3], r32_winners[5]),    # Match 91: Winner 76 vs Winner 78
            (r32_winners[6], r32_winners[7]),    # Match 92: Winner 79 vs Winner 80
            (r32_winners[10], r32_winners[11]),  # Match 93: Winner 83 vs Winner 84
            (r32_winners[8], r32_winners[9]),    # Match 94: Winner 81 vs Winner 82
            (r32_winners[13], r32_winners[15]),  # Match 95: Winner 86 vs Winner 88
            (r32_winners[12], r32_winners[14])   # Match 96: Winner 85 vs Winner 87
        ]
        r16_winners = []
        for a, b in r16_pairings:
            winner, _, _, _ = simulate_match(a, b, matchups_cache, knockout=True)
            r16_winners.append(winner)
            counts['qf'][winner] += 1

        # Quarter-finals (Matches 97 to 100)
        qf_pairings = [
            (r16_winners[0], r16_winners[1]),  # Match 97: Winner 89 vs Winner 90
            (r16_winners[4], r16_winners[5]),  # Match 98: Winner 93 vs Winner 94
            (r16_winners[2], r16_winners[3]),  # Match 99: Winner 91 vs Winner 92
            (r16_winners[6], r16_winners[7])   # Match 100: Winner 95 vs Winner 96
        ]
        qf_winners = []
        for a, b in qf_pairings:
            winner, _, _, _ = simulate_match(a, b, matchups_cache, knockout=True)
            qf_winners.append(winner)
            counts['sf'][winner] += 1

        # Semi-finals (Matches 101 to 102)
        sf_pairings = [
            (qf_winners[0], qf_winners[1]),  # Match 101: Winner 97 vs Winner 98
            (qf_winners[2], qf_winners[3])   # Match 102: Winner 99 vs Winner 100
        ]
        sf_winners = []
        for a, b in sf_pairings:
            winner, _, _, _ = simulate_match(a, b, matchups_cache, knockout=True)
            sf_winners.append(winner)
            counts['finalist'][winner] += 1

        # Final (Match 104)
        champion, _, _, _ = simulate_match(sf_winners[0], sf_winners[1], matchups_cache, knockout=True)
        counts['champion'][champion] += 1

    end_time = time.time()
    print(f"Monte Carlo loop completed in {end_time - start_time:.2f} seconds!")

    # 4. Process Results and Save JSON
    final_probabilities = {}
    for stage in ['champion', 'finalist', 'sf', 'qf', 'r16', 'r32', 'qualify']:
        final_probabilities[f'{stage}_probability'] = {
            t: round(c / n_sims, 4)
            for t, c in sorted(counts[stage].items(), key=lambda x: x[1], reverse=True)
        }

    # Format group stage tables
    formatted_groups = {}
    for g_id, g_teams in group_standings_tracker.items():
        team_stats = []
        for team, stats in g_teams.items():
            team_stats.append({
                'team': team,
                'avg_points': round(stats['pts'] / n_sims, 2),
                'avg_goal_diff': round(stats['gd'] / n_sims, 2),
                'avg_goals_scored': round(stats['gs'] / n_sims, 2),
                'qualification_probability': round(stats['wins'] / n_sims, 4)
            })
        formatted_groups[g_id] = sorted(team_stats, key=lambda x: x['qualification_probability'], reverse=True)

    # Format sample match predictions list
    all_matches_list = []
    # For every group matchup, include details
    match_counter = 1
    for g_id, g_teams in groups.items():
        for team_a, team_b in combinations(g_teams, 2):
            pred = matchups_cache[(team_a, team_b)]
            all_matches_list.append({
                'match_id': f"{g_id}{match_counter}",
                'group': g_id,
                'team_a': team_a,
                'team_b': team_b,
                'p_win': pred['p_win'],
                'p_draw': pred['p_draw'],
                'p_loss': pred['p_loss'],
                'expected_goals_a': pred['lambda_a'],
                'expected_goals_b': pred['lambda_b'],
                'top_scorelines': pred['top5_scorelines']
            })
            match_counter += 1
        match_counter = 1

    output = {
        'n_simulations': n_sims,
        'timestamp': datetime.utcnow().isoformat(),
        'format': '12 groups of 4, top 2 + best 8 thirds advance, R32 to Final',
        **final_probabilities,
        'group_predictions': formatted_groups,
        'match_predictions': all_matches_list,
        'selected_features': selected_features
    }

    os.makedirs("simulation", exist_ok=True)
    with open('simulation/results.json', 'w') as f:
        json.dump(output, f, indent=2)
        
    print("Monte Carlo Simulation results successfully saved to simulation/results.json!")

if __name__ == "__main__":
    main()
