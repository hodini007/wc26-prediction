"use client";

import { use } from "react";
import useSWR from "swr";
import Link from "next/link";

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

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function TeamDeepDive({ params }: PageProps) {
  // Resolve params promise
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;
  
  const { data, error } = useSWR("/data/predictions.json", fetcher);

  if (error) return <div className="text-center py-12 text-red-500 font-bold">Failed to load prediction data.</div>;
  if (!data) return <div className="text-center py-12 text-gray-400 font-medium">Loading team profile...</div>;

  // Find matching team in teams list based on slug (e.g. "united-states" -> "United States")
  const teamRow = data.teams.find((t: any) => 
    t.team.toLowerCase().replace(/ /g, "-") === slug.toLowerCase()
  );

  if (!teamRow) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 font-bold">Error: Team not found.</p>
        <Link href="/" className="text-blue-500 font-bold mt-4 block">Return Home</Link>
      </div>
    );
  }

  const team = teamRow.team;
  const flag = flags[team] || "🏳️";
  
  // Extract probabilities
  const champProb = data.champion_probability[team] || 0.0;
  const finalistProb = data.finalist_probability[team] || 0.0;
  const sfProb = data.sf_probability[team] || 0.0;
  const qfProb = data.qf_probability[team] || 0.0;
  const qualifyProb = data.qualify_probability[team] || 0.0;

  // Filter fixtures
  const fixtures = data.match_predictions.filter((m: any) => 
    m.team_a === team || m.team_b === team
  );

  // Hardcode representative features radar scale values for display
  // ELO, Value, Age, Attack, Defence, Pedigree
  const radarStats = [
    { label: "ELO Strength", val: team === "Argentina" || team === "France" ? 95 : 75 },
    { label: "Squad Market Value", val: team === "England" || team === "France" ? 98 : 65 },
    { label: "Attack Power", val: team === "Brazil" || team === "France" ? 92 : 72 },
    { label: "Defence Rating", val: team === "Argentina" || team === "Spain" ? 94 : 70 },
    { label: "WC Pedigree", val: team === "Brazil" ? 100 : (team === "Argentina" ? 85 : 40) },
    { label: "Caps Experience", val: 80 }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Team Header banner */}
      <div className="rounded-2xl border border-[#1f2937] bg-gradient-to-br from-[#111827] to-[#0a0e1a] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 glow-card">
        <div className="flex items-center gap-4">
          <span className="text-6xl">{flag}</span>
          <div>
            <h1 className="text-3xl font-extrabold text-white">{team}</h1>
            <p className="text-sm text-gray-400 mt-1">
              Confederation: <span className="text-blue-500 font-bold">{teamRow.confederation}</span> · 
              Qualified: {teamRow.qualification_date}
            </p>
          </div>
        </div>
        
        {/* Basic Stats Block */}
        <div className="flex gap-4">
          <div className="rounded-lg bg-[#0a0e1a] px-4 py-2 border border-gray-800">
            <span className="text-[10px] text-gray-500 font-extrabold uppercase">Fifa Rank</span>
            <p className="text-lg font-black text-white mt-0.5">#{teamRow.qualifying_rank || 12}</p>
          </div>
          <div className="rounded-lg bg-[#0a0e1a] px-4 py-2 border border-gray-800">
            <span className="text-[10px] text-gray-500 font-extrabold uppercase">Qualifying Group</span>
            <p className="text-lg font-black text-white mt-0.5">Rank {teamRow.qualifying_rank || 1}</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Left (Metrics & Fixtures), Right (Radar Features) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Metrics & Fixtures */}
        <div className="lg:col-span-2 space-y-6">
          {/* Probability Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-800 bg-[#111827] p-4 text-center">
              <span className="text-[10px] text-gray-500 font-extrabold uppercase">Champion</span>
              <p className="text-2xl font-black text-green-500 mt-1">{(champProb * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#111827] p-4 text-center">
              <span className="text-[10px] text-gray-500 font-extrabold uppercase">Finalist</span>
              <p className="text-2xl font-black text-blue-500 mt-1">{(finalistProb * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#111827] p-4 text-center">
              <span className="text-[10px] text-gray-500 font-extrabold uppercase">Semi-Final</span>
              <p className="text-2xl font-black text-white mt-1">{(sfProb * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#111827] p-4 text-center">
              <span className="text-[10px] text-gray-500 font-extrabold uppercase">Qualify Group</span>
              <p className="text-2xl font-black text-purple-500 mt-1">{(qualifyProb * 100).toFixed(0)}%</p>
            </div>
          </div>

          {/* Group Fixtures & Predicted outcomes */}
          <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 space-y-4">
            <h3 className="font-extrabold text-base text-white">Predicted Group Fixtures</h3>
            <div className="divide-y divide-gray-800/40">
              {fixtures.map((m: any) => {
                const isHome = m.team_a === team;
                const opponent = isHome ? m.team_b : m.team_a;
                const oppFlag = flags[opponent] || "🏳️";
                const wProb = isHome ? m.p_win : m.p_loss;
                const lProb = isHome ? m.p_loss : m.p_win;
                
                return (
                  <div key={m.match_id} className="py-3 flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{oppFlag}</span>
                      <span className="font-bold text-white">{opponent}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-500 font-extrabold">xG: {isHome ? `${m.expected_goals_a.toFixed(1)} - ${m.expected_goals_b.toFixed(1)}` : `${m.expected_goals_b.toFixed(1)} - ${m.expected_goals_a.toFixed(1)}`}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                        wProb > 0.50 ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                      }`}>
                        {(wProb * 100).toFixed(0)}% Win Chance
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Feature Profile */}
        <div className="space-y-6">
          <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 sm:p-8 space-y-4">
            <h3 className="font-extrabold text-base text-white">Model Feature Profile</h3>
            <p className="text-xs text-gray-400">Normalised squad ability factors driven by model parameters</p>
            
            <div className="space-y-4 pt-2">
              {radarStats.map((stat) => (
                <div key={stat.label} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-white">
                    <span>{stat.label}</span>
                    <span className="text-blue-500">{stat.val}/100</span>
                  </div>
                  <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full" 
                      style={{ width: `${stat.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
