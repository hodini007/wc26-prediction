'use client';

import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  BASE_ELO, Override, isResolvedTeam,
  getRenderScore, getLikelyWinner,
} from '@/lib/predictions';

const fetcher = (url: string) => fetch(`http://localhost:8000${url}`).then(res => res.json());

interface GroupStanding {
  team: string;
  avg_points: number;
  avg_goal_diff: number;
  avg_goals_scored: number;
  qualification_probability: number;
}

export default function Home() {
  const { data, error } = useSWR('/api/simulation/results', fetcher);
  const { data: overridesData } = useSWR<{ overrides: Override[] }>('/api/match_overrides', fetcher);

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-2">
        <p className="text-red-500 font-bold">Failed to load prediction data.</p>
        <p className="text-gray-500 text-sm">Make sure the API is running on port 8000.</p>
      </div>
    </div>
  );
  if (!data) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-t-blue-500 border-gray-800" />
        <p className="text-white font-bold">Loading tournament predictions…</p>
      </div>
    </div>
  );

  const overrides = overridesData?.overrides ?? [];
  const groupStandings: Record<string, GroupStanding[]> = data.group_predictions || {};

  // ---- Resolve group-stage qualifiers ----
  const winners: Record<string, string> = {};
  const runners_up: Record<string, string> = {};
  const thirds: { team: string; group: string; pts: number; gd: number }[] = [];

  Object.keys(groupStandings).forEach(gId => {
    const list = groupStandings[gId] || [];
    if (list.length >= 1) winners[gId] = list[0].team;
    if (list.length >= 2) runners_up[gId] = list[1].team;
    if (list.length >= 3) {
      thirds.push({
        team: list[2].team,
        group: gId,
        pts: list[2].avg_points ?? 0,
        gd: list[2].avg_goal_diff ?? 0,
      });
    }
  });

  thirds.sort((a, b) => (b.pts - a.pts) || (b.gd - a.gd));
  const bestThirds = thirds.slice(0, 8);

  const winnerGroupsNeedingThirds = ['E', 'I', 'A', 'L', 'D', 'G', 'B', 'K'];
  const thirdPlaceAssignments: Record<string, string> = {};
  const availableThirds = [...bestThirds];

  winnerGroupsNeedingThirds.forEach(w_gp => {
    let assigned = availableThirds.find(t => t.group !== w_gp);
    if (!assigned && availableThirds.length > 0) assigned = availableThirds[0];
    if (assigned) {
      thirdPlaceAssignments[w_gp] = assigned.team;
      availableThirds.splice(availableThirds.indexOf(assigned), 1);
    }
  });

  // ---- Build R32 bracket ----
  const r32Matches = [
    { a: runners_up['A'] || "2A",  b: runners_up['B'] || "2B" },
    { a: winners['E']   || "1E",   b: thirdPlaceAssignments['E'] || "3rd E" },
    { a: winners['F']   || "1F",   b: runners_up['C'] || "2C" },
    { a: winners['C']   || "1C",   b: runners_up['F'] || "2F" },
    { a: winners['I']   || "1I",   b: thirdPlaceAssignments['I'] || "3rd I" },
    { a: runners_up['E']|| "2E",   b: runners_up['I'] || "2I" },
    { a: winners['A']   || "1A",   b: thirdPlaceAssignments['A'] || "3rd A" },
    { a: winners['L']   || "1L",   b: thirdPlaceAssignments['L'] || "3rd L" },
    { a: winners['D']   || "1D",   b: thirdPlaceAssignments['D'] || "3rd D" },
    { a: winners['G']   || "1G",   b: thirdPlaceAssignments['G'] || "3rd G" },
    { a: winners['B']   || "1B",   b: thirdPlaceAssignments['B'] || "3rd B" },
    { a: runners_up['D']|| "2D",   b: runners_up['G'] || "2G" },
    { a: winners['J']   || "1J",   b: runners_up['H'] || "2H" },
    { a: winners['K']   || "1K",   b: thirdPlaceAssignments['K'] || "3rd K" },
    { a: runners_up['K']|| "2K",   b: runners_up['L'] || "2L" },
    { a: winners['H']   || "1H",   b: runners_up['J'] || "2J" },
  ];

  // ---- Cascade through rounds ----
  const r16Teams = r32Matches.map(m => getLikelyWinner(m.a, m.b, overrides));
  const r16Matches = [
    { a: r16Teams[1], b: r16Teams[4] },
    { a: r16Teams[0], b: r16Teams[2] },
    { a: r16Teams[3], b: r16Teams[5] },
    { a: r16Teams[6], b: r16Teams[7] },
    { a: r16Teams[10], b: r16Teams[11] },
    { a: r16Teams[8], b: r16Teams[9] },
    { a: r16Teams[13], b: r16Teams[15] },
    { a: r16Teams[12], b: r16Teams[14] },
  ];

  const qfTeams = r16Matches.map(m => getLikelyWinner(m.a, m.b, overrides));
  const qfMatches = [
    { a: qfTeams[0], b: qfTeams[1] },
    { a: qfTeams[4], b: qfTeams[5] },
    { a: qfTeams[2], b: qfTeams[3] },
    { a: qfTeams[6], b: qfTeams[7] },
  ];

  const sfTeams = qfMatches.map(m => getLikelyWinner(m.a, m.b, overrides));
  const sfMatches = [
    { a: sfTeams[0], b: sfTeams[1] },
    { a: sfTeams[2], b: sfTeams[3] },
  ];

  const finalTeams = sfMatches.map(m => getLikelyWinner(m.a, m.b, overrides));
  const finalMatch = { a: finalTeams[0] || 'TBD', b: finalTeams[1] || 'TBD' };
  const champion = getLikelyWinner(finalMatch.a, finalMatch.b, overrides);

  const finalScore   = getRenderScore(finalMatch.a, finalMatch.b, overrides);
  const sf1Score     = getRenderScore(sfMatches[0].a, sfMatches[0].b, overrides);
  const sf2Score     = getRenderScore(sfMatches[1].a, sfMatches[1].b, overrides);
  const sf1Winner    = getLikelyWinner(sfMatches[0].a, sfMatches[0].b, overrides);
  const sf2Winner    = getLikelyWinner(sfMatches[1].a, sfMatches[1].b, overrides);

  const champProb    = data.champion_probability || {};
  const champPct     = ((champProb[champion] ?? 0) * 100).toFixed(1);
  const champElo     = BASE_ELO[champion] ?? 1600;

  const top8 = Object.entries(data.champion_probability || {})
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 8);

  const totalSims = data.n_simulations || 100000;
  const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleDateString() : "TBD";

  // Group leaders strip (sorted A → L)
  const groupLeaders = Object.entries(winners).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">

      {/* ================================================================ */}
      {/* HERO — Champion Spotlight                                         */}
      {/* ================================================================ */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0a0e1a] p-8 md:p-10 glow-champion">
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-blue-500/5" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/5 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center gap-10">

          {/* Left: Champion info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-400 ring-1 ring-inset ring-amber-500/25 uppercase tracking-wider">
                🏆 Predicted Champion
              </span>
              {overrides.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-400 ring-1 ring-inset ring-blue-500/20 uppercase tracking-wider">
                  {overrides.length} override{overrides.length > 1 ? 's' : ''} active
                </span>
              )}
            </div>

            <h1 className="mt-4 text-5xl font-black tracking-tight text-white sm:text-6xl md:text-7xl">
              {champion}
            </h1>
            <div className="mt-2 flex items-center gap-4 flex-wrap">
              <span className="text-amber-400 font-bold text-xl">{champPct}% win probability</span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-400 text-sm">ELO {champElo.toLocaleString()}</span>
            </div>
            <p className="mt-3 text-gray-400 text-sm max-w-lg leading-relaxed">
              Advanced ELO-Poisson simulation across {totalSims.toLocaleString()} Monte Carlo iterations,
              incorporating squad depth, match history, and dynamic ELO updates.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/bracket"
                className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition-all shadow-lg hover:shadow-amber-500/25"
              >
                Open Bracket Simulator →
              </Link>
              <Link
                href="/groups"
                className="rounded-lg border border-[#1f2937] bg-[#111827] px-5 py-2.5 text-sm font-semibold text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Group Standings
              </Link>
            </div>
          </div>

          {/* Right: Final Preview Card */}
          <div className="w-full md:w-80 shrink-0">
            <div className="rounded-xl border border-amber-500/25 bg-[#0a0e1a]/80 p-5 space-y-4 backdrop-blur-sm">
              <div className="text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400/80">
                  Predicted Final · {timestamp}
                </span>
              </div>

              {/* Final Scoreline */}
              <div className="flex items-center gap-3">
                <div className={`flex-1 text-center p-3 rounded-lg transition-all ${finalMatch.a === champion ? 'bg-amber-500/10 border border-amber-500/25' : 'bg-gray-900/60 border border-gray-800'}`}>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">{finalMatch.a || 'TBD'}</div>
                  <div className={`text-3xl font-black mt-1.5 ${finalMatch.a === champion ? 'text-amber-400' : 'text-gray-300'}`}>
                    {isResolvedTeam(finalMatch.a) && isResolvedTeam(finalMatch.b) ? finalScore.goalsA : '—'}
                  </div>
                  {finalMatch.a === champion && (
                    <div className="text-[9px] text-amber-500/80 mt-1 font-bold uppercase">Champion</div>
                  )}
                </div>

                <div className="text-center shrink-0">
                  <div className="text-[10px] font-black text-gray-600 uppercase">
                    {finalScore.goesToPenalties ? 'Pens' : 'FT'}
                  </div>
                </div>

                <div className={`flex-1 text-center p-3 rounded-lg transition-all ${finalMatch.b === champion ? 'bg-amber-500/10 border border-amber-500/25' : 'bg-gray-900/60 border border-gray-800'}`}>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">{finalMatch.b || 'TBD'}</div>
                  <div className={`text-3xl font-black mt-1.5 ${finalMatch.b === champion ? 'text-amber-400' : 'text-gray-300'}`}>
                    {isResolvedTeam(finalMatch.a) && isResolvedTeam(finalMatch.b) ? finalScore.goalsB : '—'}
                  </div>
                  {finalMatch.b === champion && (
                    <div className="text-[9px] text-amber-500/80 mt-1 font-bold uppercase">Champion</div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-800 pt-3 text-center">
                <Link href="/bracket" className="text-[11px] text-blue-500 hover:text-blue-400 font-semibold transition-colors">
                  Override this result in the simulator →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* STATS ROW                                                         */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#111827] p-4 border border-[#1f2937] space-y-1">
          <p className="text-xs text-gray-400">Total Simulations</p>
          <p className="text-2xl font-black text-white">{totalSims.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-[#111827] p-4 border border-[#1f2937] space-y-1" title="Log-loss measures probability calibration. Lower is better. A random model scores ≈1.10.">
          <p className="text-xs text-gray-400">Log-Loss</p>
          <p className="text-2xl font-black text-blue-400">0.8738</p>
          <p className="text-[10px] text-gray-600">Lower is better · random ≈ 1.10</p>
        </div>
        <div className="rounded-xl bg-[#111827] p-4 border border-[#1f2937] space-y-1" title="Win/Draw/Loss directional accuracy — not scoreline accuracy. Equivalent to ~coin-flip for football.">
          <p className="text-xs text-gray-400">Match Direction Accuracy</p>
          <p className="text-2xl font-black text-gray-300">51.6%</p>
          <p className="text-[10px] text-gray-600">W/D/L direction only</p>
        </div>
        <div className="rounded-xl bg-[#111827] p-4 border border-[#1f2937] space-y-1">
          <p className="text-xs text-gray-400">Teams Simulated</p>
          <p className="text-2xl font-black text-white">48</p>
          <p className="text-[10px] text-gray-600">12 groups · 3 host nations</p>
        </div>
      </div>

      {/* ================================================================ */}
      {/* GROUP LEADERS STRIP                                               */}
      {/* ================================================================ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Predicted Group Winners</h2>
            <p className="text-xs text-gray-500 mt-0.5">Most likely teams to top each of the 12 groups</p>
          </div>
          <Link href="/groups" className="text-xs text-blue-500 hover:text-blue-400 font-semibold transition-colors">
            See Full Standings →
          </Link>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {groupLeaders.map(([groupId, team]) => {
            const standing = groupStandings[groupId]?.[0];
            const qualProb = standing?.qualification_probability ?? 0;
            const elo = BASE_ELO[team] ?? 1600;
            return (
              <div
                key={groupId}
                className="shrink-0 w-36 rounded-xl border border-[#1f2937] bg-[#111827] p-3 text-center hover:border-blue-500/40 hover:bg-[#131f35] transition-all cursor-default group"
              >
                <div className="text-[9px] font-black uppercase tracking-widest text-blue-400">
                  Group {groupId}
                </div>
                <div className="text-sm font-bold text-white mt-2 truncate leading-tight">{team}</div>
                <div className="mt-1.5 flex items-center justify-center gap-1.5">
                  <span className="text-[10px] text-green-400 font-bold">{(qualProb * 100).toFixed(0)}%</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-[10px] text-gray-500">{elo}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================================================================ */}
      {/* MAIN GRID — Championship Odds + Semifinal Path                   */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Championship Odds Bars */}
        <div className="lg:col-span-2 rounded-xl border border-[#1f2937] bg-[#111827] p-6 sm:p-8">
          <div className="flex items-center justify-between border-b border-[#1f2937] pb-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Championship Odds</h2>
              <p className="text-xs text-gray-400 mt-0.5">Top 8 contenders by Monte Carlo win probability</p>
            </div>
            <Link href="/stages" className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors">
              Full Stage View →
            </Link>
          </div>

          <div className="space-y-5">
            {top8.map(([team, prob]: any, idx) => {
              const percent = (prob * 100).toFixed(1);
              const isChamp = team === champion;
              return (
                <div key={team} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-gray-600 w-4 text-right shrink-0">#{idx + 1}</span>
                      {isChamp && (
                        <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/25 uppercase font-black tracking-wider shrink-0">
                          Champion
                        </span>
                      )}
                      <Link
                        href={`/team/${team.toLowerCase().replace(/ /g, '-')}`}
                        className={`font-bold truncate hover:underline transition-colors ${isChamp ? 'text-amber-400' : 'text-white hover:text-blue-400'}`}
                      >
                        {team}
                      </Link>
                    </div>
                    <span className={`font-black shrink-0 ml-2 ${isChamp ? 'text-amber-400' : 'text-green-500'}`}>
                      {percent}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-800/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        isChamp
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                          : 'bg-gradient-to-r from-blue-600 to-green-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Semifinal Path to Final */}
        <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 flex flex-col">
          <div className="border-b border-[#1f2937] pb-4 mb-5">
            <h2 className="text-xl font-bold text-white">Path to the Final</h2>
            <p className="text-xs text-gray-400 mt-0.5">Predicted semifinal matchups</p>
          </div>

          <div className="flex-1 space-y-4">
            {/* SF1 */}
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-2">Semifinal 1</div>
              <div className="flex gap-2">
                {([sfMatches[0].a, sfMatches[0].b] as const).map((team, i) => {
                  const isWinner = sf1Winner === team;
                  return (
                    <div key={i} className={`flex-1 p-2.5 rounded-lg border text-center ${isWinner ? 'border-red-500/30 bg-red-500/5' : 'border-gray-800 bg-[#0a0e1a]'}`}>
                      <div className="text-[11px] font-bold text-white truncate">{team || 'TBD'}</div>
                      {isResolvedTeam(sfMatches[0].a) && isResolvedTeam(sfMatches[0].b) && (
                        <div className={`text-xl font-black mt-1 ${isWinner ? 'text-red-400' : 'text-gray-600'}`}>
                          {i === 0 ? sf1Score.goalsA : sf1Score.goalsB}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {sf1Score.goesToPenalties && (
                <p className="text-[9px] text-gray-500 text-center mt-1">
                  {sf1Winner} wins on penalties
                </p>
              )}
            </div>

            {/* SF2 */}
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-2">Semifinal 2</div>
              <div className="flex gap-2">
                {([sfMatches[1].a, sfMatches[1].b] as const).map((team, i) => {
                  const isWinner = sf2Winner === team;
                  return (
                    <div key={i} className={`flex-1 p-2.5 rounded-lg border text-center ${isWinner ? 'border-red-500/30 bg-red-500/5' : 'border-gray-800 bg-[#0a0e1a]'}`}>
                      <div className="text-[11px] font-bold text-white truncate">{team || 'TBD'}</div>
                      {isResolvedTeam(sfMatches[1].a) && isResolvedTeam(sfMatches[1].b) && (
                        <div className={`text-xl font-black mt-1 ${isWinner ? 'text-red-400' : 'text-gray-600'}`}>
                          {i === 0 ? sf2Score.goalsA : sf2Score.goalsB}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {sf2Score.goesToPenalties && (
                <p className="text-[9px] text-gray-500 text-center mt-1">
                  {sf2Winner} wins on penalties
                </p>
              )}
            </div>

            {/* Arrow down to Final */}
            <div className="flex items-center justify-center gap-2">
              <div className="flex-1 border-t border-dashed border-gray-800" />
              <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">Final</span>
              <div className="flex-1 border-t border-dashed border-gray-800" />
            </div>

            {/* Final Summary */}
            <div className="rounded-lg border border-amber-500/25 bg-[#0a0e1a] p-3 text-center space-y-1">
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-400">Predicted Winner</div>
              <div className="text-lg font-black text-white">{champion}</div>
              <div className="text-amber-400 text-sm font-bold">{champPct}%</div>
            </div>
          </div>

          <Link
            href="/bracket"
            className="mt-5 block w-full rounded-lg border border-dashed border-[#1f2937] py-2.5 text-center text-xs font-bold text-blue-500 hover:border-blue-500/40 hover:bg-[#0a0e1a] transition-all"
          >
            Open Interactive Bracket Simulator →
          </Link>
        </div>
      </div>
    </div>
  );
}
