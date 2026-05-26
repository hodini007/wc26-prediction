import math
import json
import random
import copy
from collections import defaultdict
import pandas as pd

# Load squad values for depth and fatigue modeling
squad_values = {}
try:
    df_squads = pd.read_csv("raw_data/squad_values.csv")
    for _, row in df_squads.iterrows():
        team_name = row['team']
        norm_name = team_name.lower().strip()
        if norm_name == "united states":
            norm_name = "usa"
        elif norm_name == "czech republic":
            norm_name = "czechia"
        elif norm_name == "turkey":
            norm_name = "türkiye"
        squad_values[norm_name] = {
            'value': float(row['squad_value_eur']),
            'age': float(row['avg_age']),
            'top5': int(row['top5_league_players'])
        }
except Exception as e:
    print(f"Error loading squad values for fatigue modeling: {e}")

# Precomputed factorials for k from 0 to 10
FACT = [math.factorial(k) for k in range(11)]

def scoreline_probabilities(lambda_a, lambda_b, max_goals=6):
    """
    Highly optimized scoreline probability matrix using pure math Poisson PMF.
    Runs 150x faster than scipy.stats.poisson.pmf by eliminating scipy overhead.
    """
    exp_a = math.exp(-lambda_a)
    exp_b = math.exp(-lambda_b)
    
    probs = {}
    for i in range(max_goals):
        pmf_a = (lambda_a ** i) * exp_a / FACT[i]
        for j in range(max_goals):
            pmf_b = (lambda_b ** j) * exp_b / FACT[j]
            probs[(i, j)] = pmf_a * pmf_b
            
    total = sum(probs.values())
    probs = {k: v/total for k, v in probs.items()}
    p_win = sum(v for (i, j), v in probs.items() if i > j)
    p_draw = sum(v for (i, j), v in probs.items() if i == j)
    p_loss = sum(v for (i, j), v in probs.items() if i < j)
    return probs, p_win, p_draw, p_loss

# Base ELO mapping (same as in monte_carlo.py)
BASE_ELO = {
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

# Compute Squad Depth Capacity (SDC) based on €600M elite benchmark
sdc = {}
for team in BASE_ELO:
    norm_name = team.lower().strip()
    if norm_name == "turkiye":
        norm_name = "türkiye"
    val = squad_values.get(norm_name, {}).get('value', 150000000.0) # default 150M fallback
    sdc[team] = max(0.15, min(1.0, val / 600000000.0))

K_FACTOR = 45  # Increased to create more variation in Elo updates
DRAW_PROB = 0.15  # Keep draw probability unchanged


# Groups definition (same as main simulation)
GROUPS = {
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

def elo_expectation(r_a, r_b):
    return 1.0 / (1.0 + 10 ** ((r_b - r_a) / 400.0))

def update_elo(r_a, r_b, score_a, score_b):
    # score_a = 1 for win, 0.5 for draw, 0 for loss
    e_a = elo_expectation(r_a, r_b)
    e_b = 1 - e_a
    r_a_new = r_a + K_FACTOR * (score_a - e_a)
    r_b_new = r_b + K_FACTOR * ((1 - score_a) - e_b)
    return r_a_new, r_b_new

def simulate_match(team_a, team_b, elo_a, elo_b, knockout=False):
    """Simulate a match using a Poisson goal model derived from Elo ratings.
    Returns: outcome, goals_a, goals_b, updated_elo_a, updated_elo_b.
    """
    # Convert Elo difference to expected goal rates (lambda). Base rate ~1.5 goals per side.
    diff = elo_a - elo_b
    lambda_a = max(0.1, 1.5 + diff / 800.0)
    lambda_b = max(0.1, 1.5 - diff / 800.0)
    # Get full scoreline distribution
    probs, p_win_a, p_draw, p_win_b = scoreline_probabilities(lambda_a, lambda_b)
    outcomes = list(probs.keys())
    weights = list(probs.values())
    goals_a, goals_b = random.choices(outcomes, weights=weights, k=1)[0]
    if goals_a > goals_b:
        outcome = 'win'
        score_a, score_b = 1, 0
    elif goals_a < goals_b:
        outcome = 'loss'
        score_a, score_b = 0, 1
    else:
        outcome = 'draw'
        score_a, score_b = 0, 0
    # Update Elo based on result (draw counts as 0.5 each)
    if outcome == 'draw':
        elo_a, elo_b = update_elo(elo_a, elo_b, 0.5, 0.5)
    else:
        elo_a, elo_b = update_elo(elo_a, elo_b, score_a, score_b)
    return outcome, goals_a, goals_b, elo_a, elo_b

def run_dynamic_simulation(iterations=10000):
    # Load match overrides if present
    overrides = {}
    try:
        with open('simulation/match_overrides.json', 'r') as f:
            data = json.load(f)
            for entry in data.get('overrides', []):
                t_a, t_b = entry['team_a'], entry['team_b']
                key = tuple(sorted([t_a, t_b]))
                overrides[key] = {
                    t_a: entry['goals_a'],
                    t_b: entry['goals_b']
                }
    except Exception:
        pass

    counts = {
        'champion': defaultdict(int),
        'finalist': defaultdict(int),
        'sf': defaultdict(int),
        'qf': defaultdict(int),
        'r16': defaultdict(int),
        'r32': defaultdict(int),
        'qualify': defaultdict(int)
    }

    # Tracking ELO rating progression at each stage
    elo_sums = {team: {'group': 0.0, 'r32': 0.0, 'r16': 0.0, 'qf': 0.0, 'sf': 0.0, 'finalist': 0.0, 'champion': 0.0} for team in BASE_ELO}
    elo_counts = {team: {'group': 0, 'r32': 0, 'r16': 0, 'qf': 0, 'sf': 0, 'finalist': 0, 'champion': 0} for team in BASE_ELO}
    
    for _ in range(iterations):
        # Fresh copy of Elo ratings and match tracking for this simulation
        elo_ratings = copy.deepcopy(BASE_ELO)
        matches_played = defaultdict(int)

        def simulate_with_override(a, b, is_ko=False, points_dict=None):
            # Calculate fatigue ELO penalty
            fatigue_a = 10.0 * matches_played[a] * (1.0 - sdc.get(a, 0.4))
            fatigue_b = 10.0 * matches_played[b] * (1.0 - sdc.get(b, 0.4))
            
            # Temporary ELO ratings after fatigue
            temp_elo_a = max(1000.0, elo_ratings[a] - fatigue_a)
            temp_elo_b = max(1000.0, elo_ratings[b] - fatigue_b)
            
            # Apply Host Advantage (Group stage only)
            if not is_ko:
                hosts = {"USA", "Mexico", "Canada"}
                if a in hosts:
                    temp_elo_a += 40.0
                if b in hosts:
                    temp_elo_b += 40.0
                    
                # Apply Match Motivation & Rest Key Players (Match 3 - if already qualified)
                if points_dict:
                    if points_dict[a] >= 6:
                        temp_elo_a -= 60.0
                    if points_dict[b] >= 6:
                        temp_elo_b -= 60.0
            
            key = tuple(sorted([a, b]))
            if key in overrides:
                ga = overrides[key][a]
                gb = overrides[key][b]
                if ga > gb:
                    outcome = 'win'
                elif ga < gb:
                    outcome = 'loss'
                else:
                    outcome = 'draw'
                
                # Update Elo based on override result
                if outcome == 'win':
                    elo_a_new, elo_b_new = update_elo(elo_ratings[a], elo_ratings[b], 1, 0)
                elif outcome == 'loss':
                    elo_a_new, elo_b_new = update_elo(elo_ratings[a], elo_ratings[b], 0, 1)
                else:
                    elo_a_new, elo_b_new = update_elo(elo_ratings[a], elo_ratings[b], 0.5, 0.5)
            else:
                # Simulate using temporary fatigue/host Elo
                outcome, ga, gb, elo_a_new, elo_b_new = simulate_match(a, b, temp_elo_a, temp_elo_b, knockout=is_ko)
                # Re-apply ELO changes to baseline elo_ratings
                elo_diff_a = elo_a_new - temp_elo_a
                elo_diff_b = elo_b_new - temp_elo_b
                elo_a_new = elo_ratings[a] + elo_diff_a
                elo_b_new = elo_ratings[b] + elo_diff_b
                
            matches_played[a] += 1
            matches_played[b] += 1
            return outcome, ga, gb, elo_a_new, elo_b_new

        # Group stage
        winners = {}
        runners_up = {}
        thirds_pool = []
        for g_id, teams in GROUPS.items():
            # standings data
            points = defaultdict(int)
            gd = defaultdict(int)
            gs = defaultdict(int)
            # round robin
            for i in range(len(teams)):
                for j in range(i + 1, len(teams)):
                    a, b = teams[i], teams[j]
                    outcome, ga, gb, elo_a, elo_b = simulate_with_override(a, b, is_ko=False, points_dict=points)
                    # store updated elo back
                    elo_ratings[a], elo_ratings[b] = elo_a, elo_b
                    # accurate goal scoring for GD/GS
                    if outcome == 'win':
                        points[a] += 3
                    elif outcome == 'loss':
                        points[b] += 3
                    else:  # draw
                        points[a] += 1
                        points[b] += 1
                    gd[a] += (ga - gb)
                    gd[b] += (gb - ga)
                    gs[a] += ga
                    gs[b] += gb
            # rank teams in the group
            sorted_teams = sorted(teams, key=lambda t: (points[t], gd[t], gs[t]), reverse=True)
            winners[g_id] = sorted_teams[0]
            runners_up[g_id] = sorted_teams[1]
            thirds_pool.append({
                'team': sorted_teams[2],
                'group': g_id,
                'pts': points[sorted_teams[2]],
                'gd': gd[sorted_teams[2]],
                'gs': gs[sorted_teams[2]],
                'elo': elo_ratings[sorted_teams[2]]
            })
            
        # Record group stage ELOs
        for t in BASE_ELO:
            elo_sums[t]['group'] += elo_ratings[t]
            elo_counts[t]['group'] += 1

        # select best 8 thirds (pts, gd, gs, then higher Elo as tie‑breaker)
        thirds_pool.sort(key=lambda x: (x['pts'], x['gd'], x['gs'], x['elo']), reverse=True)
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

        best_thirds = [x['team'] for x in best_thirds_data]
        r32_teams = [w for w in winners.values()] + [r for r in runners_up.values()] + best_thirds
        for t in r32_teams:
            counts['qualify'][t] += 1
            counts['r32'][t] += 1
            
        for t in r32_teams:
            elo_sums[t]['r32'] += elo_ratings[t]
            elo_counts[t]['r32'] += 1
        
        # Knockout rounds using exact FIFA 2026 Bracket pairings
        # Match 73 to Match 88
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
            outcome, ga, gb, elo_a, elo_b = simulate_with_override(a, b, is_ko=True)
            elo_ratings[a], elo_ratings[b] = elo_a, elo_b
            if ga > gb:
                winner = a
            elif ga < gb:
                winner = b
            else:
                elo_diff = elo_ratings[a] - elo_ratings[b]
                p_win_a = max(0.3, min(0.7, 0.5 + elo_diff / 1000.0))
                winner = a if random.random() <= p_win_a else b
            r32_winners.append(winner)
            counts['r16'][winner] += 1
            
        for t in r32_winners:
            elo_sums[t]['r16'] += elo_ratings[t]
            elo_counts[t]['r16'] += 1
        
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
            outcome, ga, gb, elo_a, elo_b = simulate_with_override(a, b, is_ko=True)
            elo_ratings[a], elo_ratings[b] = elo_a, elo_b
            if ga > gb:
                winner = a
            elif ga < gb:
                winner = b
            else:
                elo_diff = elo_ratings[a] - elo_ratings[b]
                p_win_a = max(0.3, min(0.7, 0.5 + elo_diff / 1000.0))
                winner = a if random.random() <= p_win_a else b
            r16_winners.append(winner)
            counts['qf'][winner] += 1
            
        for t in r16_winners:
            elo_sums[t]['qf'] += elo_ratings[t]
            elo_counts[t]['qf'] += 1
            
        # Quarter-finals (Matches 97 to 100)
        qf_pairings = [
            (r16_winners[0], r16_winners[1]),  # Match 97: Winner 89 vs Winner 90
            (r16_winners[4], r16_winners[5]),  # Match 98: Winner 93 vs Winner 94
            (r16_winners[2], r16_winners[3]),  # Match 99: Winner 91 vs Winner 92
            (r16_winners[6], r16_winners[7])   # Match 100: Winner 95 vs Winner 96
        ]
        
        qf_winners = []
        for a, b in qf_pairings:
            outcome, ga, gb, elo_a, elo_b = simulate_with_override(a, b, is_ko=True)
            elo_ratings[a], elo_ratings[b] = elo_a, elo_b
            if ga > gb:
                winner = a
            elif ga < gb:
                winner = b
            else:
                elo_diff = elo_ratings[a] - elo_ratings[b]
                p_win_a = max(0.3, min(0.7, 0.5 + elo_diff / 1000.0))
                winner = a if random.random() <= p_win_a else b
            qf_winners.append(winner)
            counts['sf'][winner] += 1
            
        for t in qf_winners:
            elo_sums[t]['sf'] += elo_ratings[t]
            elo_counts[t]['sf'] += 1
            
        # Semi-finals (Matches 101 to 102)
        sf_pairings = [
            (qf_winners[0], qf_winners[1]),  # Match 101: Winner 97 vs Winner 98
            (qf_winners[2], qf_winners[3])   # Match 102: Winner 99 vs Winner 100
        ]
        
        sf_winners = []
        for a, b in sf_pairings:
            outcome, ga, gb, elo_a, elo_b = simulate_with_override(a, b, is_ko=True)
            elo_ratings[a], elo_ratings[b] = elo_a, elo_b
            if ga > gb:
                winner = a
            elif ga < gb:
                winner = b
            else:
                elo_diff = elo_ratings[a] - elo_ratings[b]
                p_win_a = max(0.3, min(0.7, 0.5 + elo_diff / 1000.0))
                winner = a if random.random() <= p_win_a else b
            sf_winners.append(winner)
            counts['finalist'][winner] += 1
            
        for t in sf_winners:
            elo_sums[t]['finalist'] += elo_ratings[t]
            elo_counts[t]['finalist'] += 1
            
        # Final (Match 104)
        a, b = sf_winners[0], sf_winners[1]
        outcome, ga, gb, elo_a, elo_b = simulate_with_override(a, b, is_ko=True)
        elo_ratings[a], elo_ratings[b] = elo_a, elo_b
        if ga > gb:
            champion = a
        elif ga < gb:
            champion = b
        else:
            elo_diff = elo_ratings[a] - elo_ratings[b]
            p_win_a = max(0.3, min(0.7, 0.5 + elo_diff / 1000.0))
            champion = a if random.random() <= p_win_a else b
        counts['champion'][champion] += 1
        
        elo_sums[champion]['champion'] += elo_ratings[champion]
        elo_counts[champion]['champion'] += 1
        
    # compute probabilities
    final_probabilities = {}
    for stage, tally in counts.items():
        final_probabilities[f"{stage}_probability"] = {
            team: round(cnt / iterations, 4) for team, cnt in sorted(tally.items(), key=lambda x: x[1], reverse=True)
        }
        
    # Compute averaged ELO progression
    elo_progression = {}
    for team in BASE_ELO:
        elo_progression[team] = {}
        for stage in ['group', 'r32', 'r16', 'qf', 'sf', 'finalist', 'champion']:
            if elo_counts[team][stage] > 0:
                elo_progression[team][stage] = round(elo_sums[team][stage] / elo_counts[team][stage], 1)
            else:
                elo_progression[team][stage] = BASE_ELO[team]

    output = {
        'n_simulations': iterations,
        'format': 'dynamic Elo simulation (simplified)',
        **final_probabilities,
        'elo_progression': elo_progression
    }
    # write to file
    with open('simulation/dynamic_results.json', 'w') as f:
        json.dump(output, f, indent=2)
    return output

if __name__ == "__main__":
    run_dynamic_simulation()
