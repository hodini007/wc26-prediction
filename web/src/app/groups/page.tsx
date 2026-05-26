"use client";

import { useState } from "react";
import useSWR from "swr";

const flags: { [key: string]: string } = {
  "Argentina": "🇦🇷", "Brazil": "🇧🇷", "France": "🇫🇷", "Spain": "🇪🇸", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Portugal": "🇵🇹", "Netherlands": "🇳🇱", "Italy": "🇮🇹", "Belgium": "🇧🇪", "Germany": "🇩🇪",
  "Uruguay": "🇺🇾", "Croatia": "🇭🇷", "Colombia": "🇨🇴", "Japan": "🇯🇵", "Morocco": "🇲🇦",
  "USA": "🇺🇸", "Senegal": "🇸🇳", "South Korea": "🇰🇷", "Mexico": "🇲🇽", "Iran": "🇮🇷",
  "Ukraine": "🇺🇦", "Turkey": "🇹🇷", "Austria": "🇦🇹", "Denmark": "🇩🇰", "Switzerland": "🇨🇭",
  "Ecuador": "🇪🇨", "Nigeria": "🇳🇬", "Canada": "🇨🇦", "Ivory Coast": "🇨🇮", "Australia": "🇦🇺",
  "Algeria": "🇩🇿", "Egypt": "🇪🇬", "Tunisia": "🇹🇳", "Cameroon": "🇨🇲", "Paraguay": "🇵🇾",
  "Venezuela": "🇻🇪", "Poland": "🇵🇱", "Hungary": "🇭🇺", "Ghana": "🇬🇭", "Uzbekistan": "🇺🇿",
  "Iraq": "🇮🇶", "Saudi Arabia": "🇸🇦", "Qatar": "🇶🇦", "Panama": "🇵🇦", "Costa Rica": "🇨🇷",
  "Jamaica": "🇯🇲", "South Africa": "🇿🇦", "New Zealand": "🇳🇿",
  "Norway": "🇳🇴", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Haiti": "🇭🇹", "Curaçao": "🇨🇼", "Cape Verde": "🇨🇻",
  "Jordan": "🇯🇴", "Czechia": "🇨🇿", "Bosnia and Herzegovina": "🇧🇦", "Türkiye": "🇹🇷", "Sweden": "🇸🇪",
  "DR Congo": "🇨🇩"
};


const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Groups() {
  const { data, error } = useSWR("/data/predictions.json", fetcher);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  if (error) return <div className="text-center py-12 text-red-500 font-bold">Failed to load prediction data.</div>;
  if (!data) return <div className="text-center py-12 text-gray-400 font-medium">Loading group predictions...</div>;

  const groups = data.group_predictions || {};
  const matchPredictions = data.match_predictions || [];

  const handleGroupClick = (groupId: string) => {
    setExpandedGroup(expandedGroup === groupId ? null : groupId);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Title */}
      <div className="text-center md:text-left mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Group Stage <span className="text-gradient">Standings</span>
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Click any group to expand and view its 6 match outcome predictions.
        </p>
      </div>

      {/* Grid of 12 Groups */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(groups).map(([gId, teamStats]: any) => {
          const isExpanded = expandedGroup === gId;
          return (
            <div 
              key={gId} 
              className={`rounded-xl border transition-all overflow-hidden ${
                isExpanded ? "border-blue-500 ring-1 ring-blue-500/20" : "border-[#1f2937]"
              } bg-[#111827]`}
            >
              {/* Group Header */}
              <div 
                onClick={() => handleGroupClick(gId)}
                className="flex items-center justify-between p-4 bg-[#0a0e1a]/50 border-b border-[#1f2937] cursor-pointer hover:bg-gray-800 transition-colors"
              >
                <h3 className="font-extrabold text-lg tracking-wide text-white">Group {gId}</h3>
                <span className="text-xs text-blue-500 font-bold">
                  {isExpanded ? "Hide Fixtures ▲" : "View Fixtures ▼"}
                </span>
              </div>

              {/* Standings Table */}
              <div className="p-4 overflow-x-auto">
                <table className="min-w-full text-xs text-left">
                  <thead>
                    <tr className="text-gray-400 font-semibold border-b border-gray-800 pb-2">
                      <th className="py-2">Team</th>
                      <th className="py-2 text-center">Pts</th>
                      <th className="py-2 text-center">GD</th>
                      <th className="py-2 text-right">Qualify</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/30">
                    {teamStats.map((teamRow: any) => {
                      const flag = flags[teamRow.team] || "🏳️";
                      const qualProb = teamRow.qualification_probability;
                      
                      // Color coding rows based on qualification likelihood
                      let rowBg = "hover:bg-gray-800/30";
                      let badgeColor = "text-gray-400 bg-gray-900 border-gray-800";
                      if (qualProb > 0.70) {
                        rowBg = "bg-green-500/5 hover:bg-green-500/10";
                        badgeColor = "text-green-400 bg-green-500/10 border-green-500/20";
                      } else if (qualProb >= 0.30) {
                        rowBg = "bg-amber-500/5 hover:bg-amber-500/10";
                        badgeColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                      } else {
                        rowBg = "bg-red-500/5 hover:bg-red-500/10";
                        badgeColor = "text-red-400 bg-red-500/10 border-red-500/20";
                      }

                      return (
                        <tr key={teamRow.team} className={`${rowBg} transition-colors`}>
                          <td className="py-2.5 font-bold flex items-center gap-1.5 text-white">
                            <span className="text-base">{flag}</span>
                            <span className="truncate">{teamRow.team}</span>
                          </td>
                          <td className="py-2.5 font-bold text-center text-gray-300">{teamRow.avg_points.toFixed(1)}</td>
                          <td className="py-2.5 font-bold text-center text-gray-300">{teamRow.avg_goal_diff > 0 ? `+${teamRow.avg_goal_diff.toFixed(1)}` : teamRow.avg_goal_diff.toFixed(1)}</td>
                          <td className="py-2.5 text-right font-black">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${badgeColor}`}>
                              {(qualProb * 100).toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expandable Fixtures Drawer */}
              {isExpanded && (
                <div className="border-t border-[#1f2937] bg-[#0a0e1a] p-4 space-y-4">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">Group Fixtures & Outcomes</h4>
                  {matchPredictions
                    .filter((m: any) => m.group === gId)
                    .map((match: any) => {
                      const flagA = flags[match.team_a] || "🏳️";
                      const flagB = flags[match.team_b] || "🏳️";
                      return (
                        <div key={match.match_id} className="p-3 rounded-lg border border-[#1f2937] bg-[#111827]/70 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{flagA}</span>
                              <span className="truncate max-w-[80px]">{match.team_a}</span>
                            </div>
                            <span className="text-[10px] text-gray-400 font-extrabold px-1.5 py-0.5 rounded bg-gray-800">
                              {match.expected_goals_a.toFixed(1)} - {match.expected_goals_b.toFixed(1)} xG
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="truncate max-w-[80px] text-right">{match.team_b}</span>
                              <span>{flagB}</span>
                            </div>
                          </div>
                          
                          {/* Segmented Probabilities Bar */}
                          <div className="h-1.5 w-full rounded-full flex overflow-hidden bg-gray-800">
                            <div 
                              className="h-full bg-green-500" 
                              style={{ width: `${(match.p_win * 100)}%` }}
                              title={`Win: ${(match.p_win * 100).toFixed(0)}%`}
                            />
                            <div 
                              className="h-full bg-amber-500" 
                              style={{ width: `${(match.p_draw * 100)}%` }}
                              title={`Draw: ${(match.p_draw * 100).toFixed(0)}%`}
                            />
                            <div 
                              className="h-full bg-red-500" 
                              style={{ width: `${(match.p_loss * 100)}%` }}
                              title={`Loss: ${(match.p_loss * 100).toFixed(0)}%`}
                            />
                          </div>
                          
                          <div className="flex justify-between text-[9px] font-extrabold text-gray-400">
                            <span>W: {(match.p_win * 100).toFixed(0)}%</span>
                            <span>D: {(match.p_draw * 100).toFixed(0)}%</span>
                            <span>L: {(match.p_loss * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
