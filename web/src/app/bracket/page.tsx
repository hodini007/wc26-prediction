"use client";

import { useState } from "react";
import useSWR from "swr";

const flags: { [key: string]: string } = {
  "Argentina": "🇦🇷", "Brazil": "🇧🇷", "France": "🇫🇷", "Spain": "🇪🇸", "England": "🏴󠁧󠁢󠁥󠁮ッグ󠁿",
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

export default function Bracket() {
  const { data, error, mutate } = useSWR("/data/predictions.json", fetcher);
  
  // Custom ELO overrides state
  const [selectedTeam, setSelectedTeam] = useState("");
  const [customElo, setCustomElo] = useState<number>(1800);
  const [overridesList, setOverridesList] = useState<{ [key: string]: { elo: number } }>({});
  
  const [customResults, setCustomResults] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  if (error) return <div className="text-center py-12 text-red-500 font-bold">Failed to load prediction data.</div>;
  if (!data) return <div className="text-center py-12 text-gray-400 font-medium">Loading bracket simulator...</div>;

  const currentChamps = customResults ? customResults.champion_probability : data.champion_probability;
  const sortedChamps = Object.entries(currentChamps)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 10);

  const handleAddOverride = () => {
    if (!selectedTeam) return;
    setOverridesList({
      ...overridesList,
      [selectedTeam]: { elo: customElo }
    });
  };

  const handleClearOverrides = () => {
    setOverridesList({});
    setCustomResults(null);
  };

  const handleReSimulate = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/simulate/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: overridesList })
      });
      const resultData = await res.json();
      setCustomResults(resultData);
    } catch (e) {
      console.error("Error triggering custom simulation:", e);
      alert("FastAPI backend is offline. Run `python api/main.py` first!");
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Title */}
      <div className="text-center md:text-left mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Bracket <span className="text-gradient">Simulator</span>
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Run Monte Carlo re-simulations dynamically by overriding team ELO ratings.
        </p>
      </div>

      {/* Grid: Left column (Overrides & Stats), Right column (Simulation Results) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Overrides Builder */}
        <div className="space-y-6 lg:col-span-1">
          {/* Override Form */}
          <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-5 space-y-4">
            <h3 className="text-base font-bold text-white">Custom ELO Overrides</h3>
            <p className="text-xs text-gray-400">Set ELO overrides to see how injuries or form changes affect tournament outcomes.</p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Select Team</label>
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="w-full rounded-lg border border-[#1f2937] bg-[#0a0e1a] px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Choose Team --</option>
                  {data.teams.map((t: any) => (
                    <option key={t.team} value={t.team}>{t.team}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Custom ELO ({customElo})</label>
                <input
                  type="range"
                  min="1400"
                  max="2300"
                  step="25"
                  value={customElo}
                  onChange={(e) => setCustomElo(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>1400 (Weak)</span>
                  <span>2300 (Elite)</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddOverride}
                className="w-full rounded-lg border border-[#1f2937] bg-[#0a0e1a] py-2 text-xs font-semibold text-blue-500 hover:border-blue-500/50 hover:bg-[#111827] transition-all"
              >
                Add Override Rule
              </button>
            </div>

            {/* Current Active Overrides */}
            {Object.keys(overridesList).length > 0 && (
              <div className="pt-3 border-t border-gray-800 space-y-2">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">Active Rules</p>
                <div className="max-h-[120px] overflow-y-auto space-y-1">
                  {Object.entries(overridesList).map(([team, val]: any) => (
                    <div key={team} className="flex justify-between items-center text-xs p-1.5 rounded bg-[#0a0e1a] border border-gray-800">
                      <span className="font-bold text-white">{flags[team] || "🏳️"} {team}</span>
                      <span className="text-blue-500 font-extrabold">ELO: {val.elo}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleReSimulate}
                    disabled={isSimulating}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition-all"
                  >
                    {isSimulating ? "Simulating..." : "Re-Simulate (5k runs)"}
                  </button>
                  <button
                    onClick={handleClearOverrides}
                    className="rounded-lg border border-[#1f2937] bg-[#0a0e1a] px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Simulation Probability Odds */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 sm:p-8 space-y-5">
            <div className="border-b border-[#1f2937] pb-4 mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {customResults ? "Custom Simulation Odds" : "Championship Probabilities"}
                </h2>
                <p className="text-xs text-gray-400">
                  {customResults ? `Based on 5,000 custom simulations with active overrides` : `Based on 100,000 Monte Carlo runs`}
                </p>
              </div>
              {customResults && (
                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
                  Overrides Active
                </span>
              )}
            </div>

            <div className="space-y-4">
              {sortedChamps.map(([team, prob]: any, idx) => {
                const percent = (prob * 100).toFixed(1);
                const flag = flags[team] || "🏳️";
                return (
                  <div key={team} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">#{idx + 1}</span>
                        <span className="text-base">{flag}</span>
                        <span>{team}</span>
                      </div>
                      <span className="text-green-500 font-extrabold">{percent}%</span>
                    </div>
                    {/* Prob bar */}
                    <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-600 to-green-500 transition-all duration-500" 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
