'use client';

import React, { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import StageToggle from '@/components/StageToggle';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const fetcher = (url: string) => fetch(`http://localhost:8000${url}`).then(res => res.json());

const teamsList = [
  "Algeria", "Argentina", "Australia", "Austria", "Belgium", "Bosnia and Herzegovina", "Brazil", 
  "Cameroon", "Canada", "Cape Verde", "Colombia", "Costa Rica", "Croatia", "Curaçao", "Czechia", 
  "Denmark", "DR Congo", "Ecuador", "Egypt", "England", "France", "Germany", "Ghana", "Haiti", 
  "Hungary", "Iran", "Iraq", "Italy", "Ivory Coast", "Jamaica", "Jordan", "Japan", "Mexico", 
  "Morocco", "New Zealand", "Nigeria", "Norway", "Panama", "Paraguay", "Poland", "Portugal", 
  "Qatar", "Saudi Arabia", "Scotland", "Senegal", "South Africa", "South Korea", "Spain", 
  "Sweden", "Switzerland", "Tunisia", "Turkey", "Türkiye", "USA", "Ukraine", "Uruguay", "Uzbekistan", "Venezuela"
].sort();

interface StageData {
  team: string;
  stages: {
    group: number;
    r32: number;
    r16: number;
    qf: number;
    sf: number;
    final: number;
    champion: number;
  };
}

interface Override {
  team_a: string;
  team_b: string;
  goals_a: number;
  goals_b: number;
}

export default function StagesPage() {
  const { mutate } = useSWRConfig();
  const [dynamic, setDynamic] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);

  // Playroom Input State
  const [teamA, setTeamA] = useState('Mexico');
  const [teamB, setTeamB] = useState('South Korea');
  const [goalsA, setGoalsA] = useState('2');
  const [goalsB, setGoalsB] = useState('0');
  const [searchQuery, setSearchQuery] = useState('');

  const endpoint = dynamic ? '/api/dynamic_stage_predictions' : '/api/stage_predictions';
  const { data: stageData, error, isLoading } = useSWR<StageData[]>(endpoint, fetcher);
  const { data: overridesData, mutate: mutateOverrides } = useSWR<{ overrides: Override[] }>('/api/match_overrides', fetcher);
  const { data: matchesData } = useSWR('/data/predictions.json', url => fetch(url).then(res => res.json()));

  if (isLoading) return <div className="flex justify-center items-center h-96 text-white font-bold">Loading tournament predictions…</div>;
  if (error) return <div className="text-red-500 text-center py-12">Failed to load prediction data. Please make sure the API server is running on port 8000.</div>;

  const chartData = stageData?.map(d => ({
    team: d.team,
    Group: d.stages.group * 100,
    R32: d.stages.r32 * 100,
    R16: d.stages.r16 * 100,
    QF: d.stages.qf * 100,
    SF: d.stages.sf * 100,
    Final: d.stages.final * 100,
    Champion: d.stages.champion * 100,
  })) ?? [];

  const stageColors = {
    Group: 'var(--stage-group)',
    R32: 'var(--stage-r32)',
    R16: 'var(--stage-r16)',
    QF: 'var(--stage-qf)',
    SF: 'var(--stage-sf)',
    Final: 'var(--stage-final)',
    Champion: 'var(--stage-champion)',
  } as const;

  const chartHeight = Math.max(700, (stageData?.length ?? 0) * 32);

  // Handlers for Overrides
  const handleSaveOverride = async (ta: string, tb: string, ga: number, gb: number) => {
    if (ta === tb) return alert("A team cannot play against itself.");
    setIsSimulating(true);

    const currentList = overridesData?.overrides || [];
    // Filter out existing matches of these two teams
    const filteredList = currentList.filter(o => {
      const match1 = (o.team_a === ta && o.team_b === tb);
      const match2 = (o.team_a === tb && o.team_b === ta);
      return !match1 && !match2;
    });

    const newList = [...filteredList, { team_a: ta, team_b: tb, goals_a: ga, goals_b: gb }];

    try {
      await fetch('http://localhost:8000/api/match_overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: newList })
      });
      // Refresh SWR caches
      mutateOverrides();
      mutate('/api/dynamic_stage_predictions');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRemoveOverride = async (ta: string, tb: string) => {
    setIsSimulating(true);
    const currentList = overridesData?.overrides || [];
    const newList = currentList.filter(o => !((o.team_a === ta && o.team_b === tb) || (o.team_a === tb && o.team_b === ta)));

    try {
      await fetch('http://localhost:8000/api/match_overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: newList })
      });
      mutateOverrides();
      mutate('/api/dynamic_stage_predictions');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetOverrides = async () => {
    setIsSimulating(true);
    try {
      await fetch('http://localhost:8000/api/match_overrides/reset', { method: 'POST' });
      mutateOverrides();
      mutate('/api/dynamic_stage_predictions');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  // Filter Group Stage Schedule to search fixtures easily
  const allGroupFixtures = matchesData?.match_predictions || [];
  const filteredGroupFixtures = allGroupFixtures.filter((m: any) => 
    m.team_a.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.team_b.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 5); // Limit search suggestion to top 5 matches

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-[#1f2937] pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Tournament <span className="text-gradient">Stage Simulator</span>
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Compare static odds with a dynamic Poisson-Elo simulation. Override scores to run custom "What-If" scenarios.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 bg-[#111827] px-4 py-2 rounded-lg border border-[#1f2937]">
          <StageToggle dynamic={dynamic} setDynamic={setDynamic} />
        </div>
      </div>

      {isSimulating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-t-blue-500 border-gray-800" />
          <h3 className="mt-4 text-xl font-bold text-white">Simulating 10,000 World Cups...</h3>
          <p className="text-sm text-gray-400 mt-1">Recalculating Elo updates and bracket states based on overrides</p>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        
        {/* Left Section (7 columns): Recharts Visualization */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 shadow-2xl overflow-y-auto" style={{ maxHeight: '800px' }}>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              📊 Stage Progression Probabilities
              {dynamic && <span className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/30">Dynamic ELO Active</span>}
            </h2>
            <div style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 120, bottom: 10 }}
                >
                  <XAxis type="number" domain={[0, 100]} tickFormatter={value => `${value}%`} stroke="#9ca3af" />
                  <YAxis dataKey="team" type="category" width={110} interval={0} stroke="#9ca3af" tick={{ fill: '#e5e7eb', fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: any) => `${(Number(value) || 0).toFixed(1)}%`}
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px', color: '#fff' }} 
                  />
                  <Legend wrapperStyle={{ color: '#fff' }} />
                  {Object.keys(stageColors).map(stage => (
                    <Bar key={stage} dataKey={stage} stackId="a" fill={stageColors[stage as keyof typeof stageColors]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Section (3 columns): What-If Simulation Playground */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Playground Panel */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 shadow-2xl space-y-5">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                🎮 What-If Simulation Playroom
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Enter actual scores below to lock results and instantly re-simulate all remaining matches!
              </p>
            </div>

            {/* Set Match Override Form */}
            <div className="space-y-3 bg-[#0a0e1a] p-3 rounded-lg border border-gray-800">
              <span className="text-[10px] font-black uppercase text-blue-500 tracking-widest block">Lock Custom Match Score</span>
              
              {/* Dropdowns */}
              <div className="space-y-2">
                <div className="flex flex-col">
                  <label className="text-xs text-gray-400 mb-1">Team A</label>
                  <select 
                    value={teamA} 
                    onChange={(e) => setTeamA(e.target.value)} 
                    className="bg-[#111827] border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    {teamsList.map(team => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-gray-400 mb-1">Team B</label>
                  <select 
                    value={teamB} 
                    onChange={(e) => setTeamB(e.target.value)} 
                    className="bg-[#111827] border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    {teamsList.map(team => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Goals */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input 
                    type="number" 
                    min="0" 
                    value={goalsA} 
                    onChange={(e) => setGoalsA(e.target.value)} 
                    className="w-full text-center bg-[#111827] border border-gray-800 rounded py-1 text-sm text-white" 
                  />
                  <span className="text-[9px] text-center text-gray-500 block mt-1">Goals A</span>
                </div>
                <span className="text-gray-500 font-bold">-</span>
                <div className="flex-1">
                  <input 
                    type="number" 
                    min="0" 
                    value={goalsB} 
                    onChange={(e) => setGoalsB(e.target.value)} 
                    className="w-full text-center bg-[#111827] border border-gray-800 rounded py-1 text-sm text-white" 
                  />
                  <span className="text-[9px] text-center text-gray-500 block mt-1">Goals B</span>
                </div>
              </div>

              <button 
                onClick={() => handleSaveOverride(teamA, teamB, parseInt(goalsA) || 0, parseInt(goalsB) || 0)}
                className="w-full mt-2 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 transition rounded text-white text-xs font-bold"
              >
                🔒 Lock Score & Recalculate
              </button>
            </div>

            {/* Quick Search Preset Fixture */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest block">Quick Fixture Override Search</span>
              <input 
                type="text" 
                placeholder="Search group fixture (e.g. Mexico)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-gray-850 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none"
              />
              {searchQuery && (
                <div className="bg-[#0a0e1a] border border-gray-800 rounded divide-y divide-gray-800/50 overflow-hidden text-xs max-h-48 overflow-y-auto">
                  {filteredGroupFixtures.map((fixture: any, idx: number) => (
                    <div 
                      key={idx} 
                      onClick={() => {
                        setTeamA(fixture.team_a);
                        setTeamB(fixture.team_b);
                        setSearchQuery('');
                      }}
                      className="p-2 hover:bg-blue-500/10 cursor-pointer flex justify-between items-center text-gray-300"
                    >
                      <span>{fixture.team_a} vs {fixture.team_b}</span>
                      <span className="text-[9px] bg-gray-800 text-blue-400 px-1.5 py-0.5 rounded uppercase">Select</span>
                    </div>
                  ))}
                  {filteredGroupFixtures.length === 0 && (
                    <div className="p-2 text-gray-500 text-center">No fixtures found</div>
                  )}
                </div>
              )}
            </div>

            {/* List of Active Overrides */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Active Locked Results</span>
                {overridesData?.overrides && overridesData.overrides.length > 0 && (
                  <button 
                    onClick={handleResetOverrides}
                    className="text-[9px] font-bold text-red-500 hover:text-red-400 underline transition"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {overridesData?.overrides && overridesData.overrides.length > 0 ? (
                  overridesData.overrides.map((override, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 rounded bg-green-500/5 border border-green-500/10 text-xs">
                      <div className="flex items-center gap-1.5 text-white font-semibold">
                        <span>{override.team_a}</span>
                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-md font-extrabold">{override.goals_a} - {override.goals_b}</span>
                        <span>{override.team_b}</span>
                      </div>
                      <button 
                        onClick={() => handleRemoveOverride(override.team_a, override.team_b)}
                        className="text-gray-500 hover:text-red-400 transition font-black ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500 text-center py-4 bg-[#0a0e1a] rounded border border-dashed border-gray-800">
                    No active overrides. Every match is simulated using the baseline Poisson-Elo models.
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(stageData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'stage_predictions.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="w-full py-2 bg-[#0a0e1a] border border-[#1f2937] hover:border-gray-700 transition rounded text-gray-300 text-xs font-bold"
            >
              📥 Download Simulation JSON
            </button>

          </div>
        </div>

      </div>

    </div>
  );
}
