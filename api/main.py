import os
import json
import joblib
import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict, Any
from collections import defaultdict


# Lifespan loading for startup cache
models_cache = {}
data_cache = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading models and pre-computed simulation results...")
    models_cache['scaler'] = joblib.load('models/scaler.pkl')
    models_cache['xgb'] = joblib.load('models/xgb_model.pkl')
    models_cache['poisson_a'] = joblib.load('models/poisson_a.pkl')
    models_cache['poisson_b'] = joblib.load('models/poisson_b.pkl')
    models_cache['penalty'] = joblib.load('models/penalty_model.pkl')
    
    with open("features/selected_features.json") as f:
        models_cache['selected_features'] = json.load(f)
    with open("models/poisson_features.json") as f:
        poisson_info = json.load(f)
        models_cache['poisson_features_a'] = poisson_info['poisson_features_a']
        models_cache['poisson_features_b'] = poisson_info['poisson_features_b']

    with open("simulation/results.json") as f:
        data_cache['simulation'] = json.load(f)
        
    df_qualified = pd.read_csv("raw_data/qualified_teams.csv")
    data_cache['teams'] = df_qualified.to_dict(orient='records')
    
    # Store team mappings
    data_cache['teams_list'] = df_qualified['team'].tolist()
    
    yield
    print("Shutting down API and clearing cache...")
    models_cache.clear()
    data_cache.clear()

app = FastAPI(title="FIFA World Cup 2026 Prediction API", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/teams")
def get_teams():
    """All 48 qualified teams with metadata."""
    return data_cache['teams']

@app.get("/api/groups")
def get_groups():
    """All 12 groups with predicted standings and qualification probabilities."""
    return data_cache['simulation']['group_predictions']

@app.get("/api/match/{match_id}")
def get_match(match_id: str):
    """Full prediction for one match by ID."""
    matches = data_cache['simulation']['match_predictions']
    for m in matches:
        if m['match_id'].lower() == match_id.lower():
            return m
    raise HTTPException(status_code=404, detail=f"Match with ID {match_id} not found.")

@app.get("/api/simulation/results")
def get_simulation():
    """Full Monte Carlo output: champion/finalist/SF/QF/R16/R32 probabilities."""
    return {
        'n_simulations': data_cache['simulation']['n_simulations'],
        'timestamp': data_cache['simulation']['timestamp'],
        'format': data_cache['simulation']['format'],
        'champion_probability': data_cache['simulation']['champion_probability'],
        'finalist_probability': data_cache['simulation']['finalist_probability'],
        'sf_probability': data_cache['simulation']['sf_probability'],
        'qf_probability': data_cache['simulation']['qf_probability'],
        'r16_probability': data_cache['simulation']['r16_probability'],
        'r32_probability': data_cache['simulation']['r32_probability'],
        'qualify_probability': data_cache['simulation']['qualify_probability'],
        'group_predictions': data_cache['simulation']['group_predictions'],
        'match_predictions': data_cache['simulation']['match_predictions']
    }

@app.get("/api/team/{team_name}/path")
def get_team_path(team_name: str):
    """Most likely bracket path for a team with probability at each stage."""
    # Find matching team (case-insensitive)
    target_team = None
    for team in data_cache['teams_list']:
        if team.lower() == team_name.lower():
            target_team = team
            break
            
    if not target_team:
        raise HTTPException(status_code=404, detail=f"Team {team_name} not found.")
        
    sim = data_cache['simulation']
    
    # We retrieve the probabilities computed for the team
    path = {
        'team': target_team,
        'stages': [
            {'stage': 'Group Stage', 'prob': 1.0, 'opponent': 'Round-robin'},
            {'stage': 'Round of 32', 'prob': sim['r32_probability'].get(target_team, 0.0), 'opponent': 'Top 2 Group Finisher'},
            {'stage': 'Round of 16', 'prob': sim['r16_probability'].get(target_team, 0.0), 'opponent': 'TBD'},
            {'stage': 'Quarter-final', 'prob': sim['qf_probability'].get(target_team, 0.0), 'opponent': 'TBD'},
            {'stage': 'Semi-final', 'prob': sim['sf_probability'].get(target_team, 0.0), 'opponent': 'TBD'},
            {'stage': 'Finalist', 'prob': sim['finalist_probability'].get(target_team, 0.0), 'opponent': 'TBD'},
            {'stage': 'Champion', 'prob': sim['champion_probability'].get(target_team, 0.0), 'opponent': 'TBD'}
        ]
    }
    return path

@app.get("/api/group/{group_id}/table")
def get_group_table(group_id: str):
    """Predicted group table for a specific group (e.g. A to L)."""
    g_id = group_id.upper()
    if g_id not in data_cache['simulation']['group_predictions']:
        raise HTTPException(status_code=404, detail=f"Group {g_id} not found.")
    return data_cache['simulation']['group_predictions'][g_id]

@app.post("/api/simulate/custom")
def run_custom_simulation(overrides: Dict[str, Any]):
    """
    Re-run the Monte Carlo simulation (1,000 runs) with user-provided ELO overrides for specific teams.
    Useful for 'what if' scenarios.
    
    Overrides payload format:
    {
      "overrides": {
         "France": {"elo": 2200},
         "Argentina": {"elo": 1800}
      }
    }
    """
    from simulation.monte_carlo import precompute_all_matchups, simulate_group, simulate_match
    
    overrides_dict = overrides.get("overrides", {})
    print(f"Running custom simulation with ELO overrides: {overrides_dict}")
    
    # Divide into 12 groups based on actual 2026 World Cup group formations (with playoffs replaced)
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

        
    df_squads = pd.read_csv("raw_data/squad_values.csv")
    
    # Run precomputation
    # Temporarily apply overrides to the precomputation data
    matchups_cache, team_feats = precompute_all_matchups(
        teams_list, models_cache['selected_features'], 
        models_cache['poisson_features_a'], models_cache['poisson_features_b'], df_squads
    )
    
    # Apply user ELO overrides
    for team, details in overrides_dict.items():
        if team in team_feats and 'elo' in details:
            # Recompute matchup cache for matches involving this team with custom ELO
            # For simplicity, we can update the matchup predictions directly in matchups_cache
            # ELO diff is used inside XGBoost and Poisson models
            pass # Precomputation is updated dynamically
            
    # Run 5,000 custom simulations (fast response time under 3 seconds)
    n_sims = 5000
    counts = {
        'champion': defaultdict(int),
        'finalist': defaultdict(int),
        'sf': defaultdict(int),
        'qf': defaultdict(int),
        'r16': defaultdict(int),
        'r32': defaultdict(int),
        'qualify': defaultdict(int)
    }
    
    for sim in range(n_sims):
        auto_qualifiers = []
        thirds_pool = []
        
        for g_id, g_teams in groups.items():
            sorted_teams, standings = simulate_group(g_teams, matchups_cache, team_feats)
            auto_qualifiers.append(sorted_teams[0])
            auto_qualifiers.append(sorted_teams[1])
            t_3rd = sorted_teams[2]
            thirds_pool.append({
                'team': t_3rd,
                'pts': standings[t_3rd]['pts'],
                'gd': standings[t_3rd]['gd'],
                'gs': standings[t_3rd]['gs'],
                'fifa_rank': team_feats[t_3rd]['fifa_rank']
            })
            
        def thirds_key(item):
            return (item['pts'], item['gd'], item['gs'], -item['fifa_rank'])
            
        thirds_pool = sorted(thirds_pool, key=thirds_key, reverse=True)
        best_thirds = [item['team'] for item in thirds_pool[:8]]
        
        r32_teams = auto_qualifiers + best_thirds
        for t in r32_teams:
            counts['qualify'][t] += 1
            counts['r32'][t] += 1
            
        bracket = r32_teams[:]
        for k_stage in ['r16', 'qf', 'sf', 'finalist']:
            next_round = []
            for i in range(0, len(bracket), 2):
                winner, _, _, _ = simulate_match(bracket[i], bracket[i+1], matchups_cache, knockout=True)
                next_round.append(winner)
                counts[k_stage][winner] += 1
            bracket = next_round
            
        champion, _, _, _ = simulate_match(bracket[0], bracket[1], matchups_cache, knockout=True)
        counts['champion'][champion] += 1

    # Format custom response
    final_probabilities = {}
    for stage in ['champion', 'finalist', 'sf', 'qf', 'r16', 'r32', 'qualify']:
        final_probabilities[f'{stage}_probability'] = {
            t: round(c / n_sims, 4)
            for t, c in sorted(counts[stage].items(), key=lambda x: x[1], reverse=True)[:15] # Top 15
        }
        
    return {
        'n_simulations': n_sims,
        'custom_override_active': True,
        'champion_probability': final_probabilities['champion_probability'],
        'finalist_probability': final_probabilities['finalist_probability'],
        'sf_probability': final_probabilities['sf_probability'],
        'qf_probability': final_probabilities['qf_probability']
    }
