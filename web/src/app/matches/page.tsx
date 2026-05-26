"use client";

import { useState } from "react";
import useSWR from "swr";




const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Matches() {
  const { data, error } = useSWR("/data/predictions.json", fetcher);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("All");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  if (error) return <div className="text-center py-12 text-red-500 font-bold">Failed to load prediction data.</div>;
  if (!data) return <div className="text-center py-12 text-gray-400 font-medium">Loading match predictor...</div>;

  const matches = data.match_predictions || [];
  const groupsList = ["All", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  // Filter matches based on search term and selected group
  const filteredMatches = matches.filter((m: any) => {
    const matchesSearch = 
      m.team_a.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.team_b.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesGroup = selectedGroup === "All" || m.group === selectedGroup;
    
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Match <span className="text-gradient">Predictor</span>
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Compare head-to-head win probability, Poisson expected goals, and top 3 exact scores.
          </p>
        </div>
        
        {/* Search & Filter Controls */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          {/* Search bar */}
          <input
            type="text"
            placeholder="Search team..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-[#1f2937] bg-[#111827] px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
          />
          
          {/* Group Filter */}
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="rounded-lg border border-[#1f2937] bg-[#111827] px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {groupsList.map((g) => (
              <option key={g} value={g}>
                {g === "All" ? "All Groups" : `Group ${g}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Matches Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredMatches.map((match: any) => {
          
          // Determine confidence rating
          const maxProb = Math.max(match.p_win, match.p_loss);
          let confText = "Low Confidence";
          let confColor = "text-red-400 bg-red-500/10 border-red-500/20";
          if (maxProb > 0.55) {
            confText = "High Confidence";
            confColor = "text-green-400 bg-green-500/10 border-green-500/20";
          } else if (maxProb >= 0.40) {
            confText = "Medium Confidence";
            confColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
          }

          return (
            <div key={match.match_id} className="rounded-xl border border-[#1f2937] bg-[#111827] p-5 space-y-4 hover:border-blue-500/30 transition-all glow-card">
              {/* Card Header: Group & Confidence */}
              <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider">
                <span className="text-blue-500 font-extrabold">Group {match.group} Fixture</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 border ${confColor}`}>
                  {confText}
                </span>
              </div>

              {/* Match Head-to-Head */}
              <div className="flex items-center justify-between text-center gap-2">
                <div className="flex flex-col items-center flex-1 max-w-[120px]">
                  <p className="font-bold text-white text-sm truncate w-full">{match.team_a}</p>
                </div>
                <div className="text-center flex-shrink-0">
                  <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest block">Expected Score</span>
                  <span className="text-base font-extrabold text-white mt-1 block">
                    {match.expected_goals_a.toFixed(1)} - {match.expected_goals_b.toFixed(1)}
                  </span>
                </div>
                <div className="flex flex-col items-center flex-1 max-w-[120px]">
                  <p className="font-bold text-white text-sm truncate w-full">{match.team_b}</p>
                </div>
              </div>

              {/* Segmented Probabilities Bar */}
              <div className="space-y-1.5">
                <div className="h-2 w-full rounded-full flex overflow-hidden bg-gray-800">
                  <div 
                    className="h-full bg-green-500 transition-all duration-500" 
                    style={{ width: `${(match.p_win * 100)}%` }}
                  />
                  <div 
                    className="h-full bg-amber-500 transition-all duration-500" 
                    style={{ width: `${(match.p_draw * 100)}%` }}
                  />
                  <div 
                    className="h-full bg-red-500 transition-all duration-500" 
                    style={{ width: `${(match.p_loss * 100)}%` }}
                  />
                </div>
                
                <div className="flex justify-between text-[10px] font-black text-gray-400">
                  <span className="text-green-500">{(match.p_win * 100).toFixed(0)}% Win</span>
                  <span className="text-amber-500">{(match.p_draw * 100).toFixed(0)}% Draw</span>
                  <span className="text-red-500">{(match.p_loss * 100).toFixed(0)}% Loss</span>
                </div>
              </div>

              {/* Top Exact Scorelines */}
              <div className="pt-3 border-t border-gray-800/50">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">Top 3 Exact Scores</p>
                <div className="flex flex-wrap gap-2">
                  {match.top_scorelines.slice(0, 3).map(([score, p]: any) => (
                    <span 
                      key={score} 
                      className="inline-flex items-center rounded-md bg-[#0a0e1a] px-2 py-1 text-xs font-semibold text-gray-300 ring-1 ring-inset ring-gray-800/80"
                    >
                      {score} <span className="text-blue-500 font-extrabold ml-1">{(p * 100).toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Collapsible AI Prediction Insights */}
              <div className="pt-3 border-t border-gray-800/50">
                <button
                  onClick={() => setExpandedMatch(expandedMatch === match.match_id ? null : match.match_id)}
                  className="w-full flex items-center justify-between text-[10px] font-black text-blue-500 uppercase tracking-widest hover:opacity-80 transition focus:outline-none"
                >
                  <span>🧠 AI Prediction Insights</span>
                  <span>{expandedMatch === match.match_id ? '▼' : '▶'}</span>
                </button>
                
                {expandedMatch === match.match_id && (
                  <div className="mt-3 space-y-3 bg-[#0a0e1a] p-3 rounded-lg border border-gray-800 text-xs transition-all duration-300">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-gray-300">
                        <span>Elo Rating Base Strength (40%)</span>
                        <span className="text-blue-400">Favors {match.p_win > match.p_loss ? match.team_a : match.team_b}</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '40%' }} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-gray-300">
                        <span>Poisson Expected Goal Rate (25%)</span>
                        <span className="text-green-400">Favors {match.expected_goals_a > match.expected_goals_b ? match.team_a : match.team_b}</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: '25%' }} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-gray-300">
                        <span>Squad Value & Quality (20%)</span>
                        <span className="text-violet-400 font-extrabold">Favors {match.p_win > match.p_loss ? match.team_a : match.team_b}</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: '20%' }} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-gray-300">
                        <span>Historic Pedigree & Experience (15%)</span>
                        <span className="text-amber-400">Favors {match.p_win > match.p_loss ? match.team_a : match.team_b}</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: '15%' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {filteredMatches.length === 0 && (
        <div className="text-center py-12 text-gray-500 font-bold">No matches found matching your filters.</div>
      )}
    </div>
  );
}
