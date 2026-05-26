'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  Override, isResolvedTeam, getPredictedScore,
  getRenderScore, getLikelyWinner,
} from '@/lib/predictions';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fetcher = (url: string) => fetch(`${API_BASE}${url}`).then(res => res.json());

interface GroupStanding {
  team: string;
  avg_points: number;
  avg_goal_diff: number;
  avg_goals_scored: number;
  qualification_probability: number;
}

// ---------------------------------------------------------------------------
// Mobile round accordion component
// ---------------------------------------------------------------------------
function MobileRound({
  title,
  color,
  matches,
  overrides,
  onMatchClick,
}: {
  title: string;
  color: string;
  matches: { a: string; b: string; label?: string }[];
  overrides: Override[];
  onMatchClick: (a: string, b: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-[#1f2937] bg-[#111827] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
      >
        <span className={`text-sm font-black uppercase tracking-widest ${color}`}>{title}</span>
        <span className="text-gray-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {matches.map((m, idx) => {
            const showScore = isResolvedTeam(m.a) && isResolvedTeam(m.b);
            const score = getRenderScore(m.a, m.b, overrides);
            const winner = getLikelyWinner(m.a, m.b, overrides);
            return (
              <div
                key={idx}
                onClick={() => showScore && onMatchClick(m.a, m.b)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs ${
                  showScore
                    ? 'border-gray-800 bg-[#0a0e1a] cursor-pointer hover:border-blue-500/40 transition-colors'
                    : 'border-gray-800/50 bg-[#0a0e1a]/50'
                }`}
              >
                <span className={`font-bold truncate max-w-[100px] ${winner === m.a && showScore ? 'text-green-400' : 'text-gray-300'}`}>{m.a}</span>
                {showScore ? (
                  <div className="text-center px-2 shrink-0">
                    <span className="font-black text-white">{score.goalsA} – {score.goalsB}</span>
                    {score.goesToPenalties && (
                      <span className="block text-[8px] text-gray-500">pens</span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-700 font-bold px-4">vs</span>
                )}
                <span className={`font-bold truncate max-w-[100px] text-right ${winner === m.b && showScore ? 'text-green-400' : 'text-gray-300'}`}>{m.b}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main bracket page
// ---------------------------------------------------------------------------
export default function BracketPage() {
  const { mutate } = useSWRConfig();
  const [selectedMatch, setSelectedMatch] = useState<{ teamA: string; teamB: string } | null>(null);
  const [goalsA, setGoalsA] = useState('2');
  const [goalsB, setGoalsB] = useState('1');
  const [isSimulating, setIsSimulating] = useState(false);

  const { data: simData, error } = useSWR('/api/simulation/results', fetcher);
  const { data: overridesData, mutate: mutateOverrides } = useSWR<{ overrides: Override[] }>('/api/match_overrides', fetcher);

  // ---- SVG connector refs ----
  const bracketRef = useRef<HTMLDivElement>(null);
  const r32Refs    = useRef<(HTMLDivElement | null)[]>(new Array(16).fill(null));
  const r16Refs    = useRef<(HTMLDivElement | null)[]>(new Array(8).fill(null));
  const qfRefs     = useRef<(HTMLDivElement | null)[]>(new Array(4).fill(null));
  const sfRefs     = useRef<(HTMLDivElement | null)[]>(new Array(2).fill(null));
  const finalRef   = useRef<HTMLDivElement | null>(null);

  const [svgPaths, setSvgPaths] = useState<{ d: string; color: string }[]>([]);
  const [svgH, setSvgH] = useState(0);

  // ---- SVG connector builder ----
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buildConnectors = useCallback(() => {
    const container = bracketRef.current;
    if (!container) return;

    const cr = container.getBoundingClientRect();

    const rel = (el: HTMLDivElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        right: r.right  - cr.left,
        left:  r.left   - cr.left,
        midY:  r.top - cr.top + r.height / 2,
      };
    };

    const paths: { d: string; color: string }[] = [];

    const draw = (
      src: HTMLDivElement | null,
      tgt: HTMLDivElement | null,
      color: string,
    ) => {
      const s = rel(src);
      const t = rel(tgt);
      if (!s || !t) return;
      const mx = (s.right + t.left) / 2;
      paths.push({
        d: `M ${s.right} ${s.midY} H ${mx} V ${t.midY} H ${t.left}`,
        color,
      });
    };

    // R32 → R16  (which r32 feeds which r16)
    const r32ToR16: [number, number][] = [
      [1,0],[4,0], [0,1],[2,1], [3,2],[5,2], [6,3],[7,3],
      [8,4],[9,4], [10,5],[11,5], [12,6],[13,6], [14,7],[15,7],
    ];
    r32ToR16.forEach(([si, ti]) => draw(r32Refs.current[si], r16Refs.current[ti], '#4f46e5'));

    // R16 → QF
    const r16ToQF: [number, number][] = [
      [0,0],[1,0], [2,1],[3,1], [4,2],[5,2], [6,3],[7,3],
    ];
    r16ToQF.forEach(([si, ti]) => draw(r16Refs.current[si], qfRefs.current[ti], '#14b8a6'));

    // QF → SF
    const qfToSF: [number, number][] = [[0,0],[1,0],[2,1],[3,1]];
    qfToSF.forEach(([si, ti]) => draw(qfRefs.current[si], sfRefs.current[ti], '#a78bfa'));

    // SF → Final
    [0, 1].forEach(si => draw(sfRefs.current[si], finalRef.current, '#f59e0b'));

    setSvgPaths(paths);
    setSvgH(container.scrollHeight);
  }, []); // bracket layout is fixed — no deps needed

  // Recompute after every data change and on resize
  useEffect(() => {
    const timer = setTimeout(buildConnectors, 80); // wait for DOM paint
    return () => clearTimeout(timer);
  }, [simData, overridesData, buildConnectors]);

  useEffect(() => {
    const onResize = () => buildConnectors();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [buildConnectors]);

  if (error) return <div className="text-red-500 text-center py-12">Failed to load bracket data. Please verify the API is running on port 8000.</div>;
  if (!simData) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-t-blue-500 border-gray-800" />
        <p className="text-white font-bold">Loading tournament bracket…</p>
      </div>
    </div>
  );

  const overrides = overridesData?.overrides ?? [];

  // ---- Group stage resolution ----
  const groupStandings: Record<string, GroupStanding[]> = simData.group_predictions || {};
  const winners: Record<string, string>     = {};
  const runners_up: Record<string, string>  = {};
  const thirds: { team: string; group: string; pts: number; gd: number }[] = [];

  Object.keys(groupStandings).forEach(gId => {
    const list = groupStandings[gId] || [];
    if (list.length >= 1) winners[gId]    = list[0].team;
    if (list.length >= 2) runners_up[gId] = list[1].team;
    if (list.length >= 3) {
      thirds.push({
        team:  list[2].team,
        group: gId,
        pts:   list[2].avg_points   ?? 0,
        gd:    list[2].avg_goal_diff ?? 0,
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

  // ---- Build bracket ----
  const r32Matches = [
    { id: 73, name: "Match 73", a: runners_up['A'] || "2A",  b: runners_up['B'] || "2B" },
    { id: 74, name: "Match 74", a: winners['E']   || "1E",   b: thirdPlaceAssignments['E'] || "3rd E" },
    { id: 75, name: "Match 75", a: winners['F']   || "1F",   b: runners_up['C'] || "2C" },
    { id: 76, name: "Match 76", a: winners['C']   || "1C",   b: runners_up['F'] || "2F" },
    { id: 77, name: "Match 77", a: winners['I']   || "1I",   b: thirdPlaceAssignments['I'] || "3rd I" },
    { id: 78, name: "Match 78", a: runners_up['E']|| "2E",   b: runners_up['I'] || "2I" },
    { id: 79, name: "Match 79", a: winners['A']   || "1A",   b: thirdPlaceAssignments['A'] || "3rd A" },
    { id: 80, name: "Match 80", a: winners['L']   || "1L",   b: thirdPlaceAssignments['L'] || "3rd L" },
    { id: 81, name: "Match 81", a: winners['D']   || "1D",   b: thirdPlaceAssignments['D'] || "3rd D" },
    { id: 82, name: "Match 82", a: winners['G']   || "1G",   b: thirdPlaceAssignments['G'] || "3rd G" },
    { id: 83, name: "Match 83", a: winners['B']   || "1B",   b: thirdPlaceAssignments['B'] || "3rd B" },
    { id: 84, name: "Match 84", a: runners_up['D']|| "2D",   b: runners_up['G'] || "2G" },
    { id: 85, name: "Match 85", a: winners['J']   || "1J",   b: runners_up['H'] || "2H" },
    { id: 86, name: "Match 86", a: winners['K']   || "1K",   b: thirdPlaceAssignments['K'] || "3rd K" },
    { id: 87, name: "Match 87", a: runners_up['K']|| "2K",   b: runners_up['L'] || "2L" },
    { id: 88, name: "Match 88", a: winners['H']   || "1H",   b: runners_up['J'] || "2J" },
  ];

  const r16Prob   = simData.r16_probability   || {};
  const qfProb    = simData.qf_probability    || {};
  const sfProb    = simData.sf_probability    || {};
  const finalistProb = simData.finalist_probability || {};
  const champProb = simData.champion_probability   || {};

  const r16Teams  = r32Matches.map(m => getLikelyWinner(m.a, m.b, overrides));
  const r16Matches = [
    { name: "Match 89",  a: r16Teams[1],  b: r16Teams[4]  },
    { name: "Match 90",  a: r16Teams[0],  b: r16Teams[2]  },
    { name: "Match 91",  a: r16Teams[3],  b: r16Teams[5]  },
    { name: "Match 92",  a: r16Teams[6],  b: r16Teams[7]  },
    { name: "Match 93",  a: r16Teams[10], b: r16Teams[11] },
    { name: "Match 94",  a: r16Teams[8],  b: r16Teams[9]  },
    { name: "Match 95",  a: r16Teams[13], b: r16Teams[15] },
    { name: "Match 96",  a: r16Teams[12], b: r16Teams[14] },
  ];

  const qfTeams   = r16Matches.map(m => getLikelyWinner(m.a, m.b, overrides));
  const qfMatches = [
    { name: "Match 97",  a: qfTeams[0], b: qfTeams[1] },
    { name: "Match 98",  a: qfTeams[4], b: qfTeams[5] },
    { name: "Match 99",  a: qfTeams[2], b: qfTeams[3] },
    { name: "Match 100", a: qfTeams[6], b: qfTeams[7] },
  ];

  const sfTeams   = qfMatches.map(m => getLikelyWinner(m.a, m.b, overrides));
  const sfMatches = [
    { name: "Match 101", a: sfTeams[0], b: sfTeams[1] },
    { name: "Match 102", a: sfTeams[2], b: sfTeams[3] },
  ];

  const finalTeams = sfMatches.map(m => getLikelyWinner(m.a, m.b, overrides));
  const finalMatch  = { name: "Match 104", a: finalTeams[0], b: finalTeams[1] };
  const champion    = getLikelyWinner(finalMatch.a, finalMatch.b, overrides);

  // ---- Match card renderer (reusable team row) ----
  const renderTeamRow = (
    team: string,
    stageProb: Record<string, number>,
    goals: number,
    isWinner: boolean,
    showScore: boolean,
    goesToPenalties: boolean,
  ) => {
    const prob      = stageProb[team] || 0;
    const isResolved = isResolvedTeam(team);
    return (
      <div className={`flex items-center justify-between font-bold ${isWinner && isResolved ? 'text-green-400' : 'text-gray-300'}`}>
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate max-w-[120px] text-xs">{team}</span>
          {isResolved && goesToPenalties && isWinner && (
            <span className="text-[7px] font-black px-1 py-0.5 bg-green-500/10 text-green-400 rounded border border-green-500/20 uppercase tracking-wider shrink-0">P</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isResolved && (
            <span className="text-gray-600 font-normal text-[9px]">{(prob * 100).toFixed(0)}%</span>
          )}
          {isResolved && showScore && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black min-w-[18px] text-center ${
              isWinner ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-500'
            }`}>
              {goals}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ---- Modal handlers ----
  const handleMatchClick = (teamA: string, teamB: string) => {
    const existing = overridesData?.overrides?.find(o =>
      (o.team_a === teamA && o.team_b === teamB) ||
      (o.team_a === teamB && o.team_b === teamA)
    );
    if (existing) {
      if (existing.team_a === teamA) {
        setGoalsA(existing.goals_a.toString());
        setGoalsB(existing.goals_b.toString());
      } else {
        setGoalsA(existing.goals_b.toString());
        setGoalsB(existing.goals_a.toString());
      }
    } else {
      const pred = getPredictedScore(teamA, teamB);
      setGoalsA(pred.goalsA.toString());
      setGoalsB(pred.goalsB.toString());
    }
    setSelectedMatch({ teamA, teamB });
  };

  const handleSaveOverride = async () => {
    if (!selectedMatch) return;
    setIsSimulating(true);
    const { teamA, teamB } = selectedMatch;
    const currentList = overridesData?.overrides || [];
    const filtered = currentList.filter(o =>
      !((o.team_a === teamA && o.team_b === teamB) || (o.team_a === teamB && o.team_b === teamA))
    );
    const newList = [...filtered, {
      team_a: teamA, team_b: teamB,
      goals_a: parseInt(goalsA) || 0,
      goals_b: parseInt(goalsB) || 0,
    }];
    try {
      await fetch(`${API_BASE}/api/match_overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: newList }),
      });
      mutateOverrides();
      mutate('/api/simulation/results');
      setSelectedMatch(null);
    } catch (e) { console.error(e); }
    finally { setIsSimulating(false); }
  };

  const handleResetAll = async () => {
    setIsSimulating(true);
    try {
      await fetch(`${API_BASE}/api/match_overrides/reset`, { method: 'POST' });
      mutateOverrides();
      mutate('/api/simulation/results');
    } catch (e) { console.error(e); }
    finally { setIsSimulating(false); }
  };

  const hasOverrides = (overridesData?.overrides?.length ?? 0) > 0;

  // ---- Column card renderer ----
  const matchCard = (
    m: { name: string; a: string; b: string },
    idx: number,
    refArr: React.MutableRefObject<(HTMLDivElement | null)[]> | null,
    singleRef: React.MutableRefObject<HTMLDivElement | null> | null,
    probNext: Record<string, number>,
    roundLabel: string,
    roundColor: string,
    hoverColor: string,
  ) => {
    const score     = getRenderScore(m.a, m.b, overrides);
    const isWinnerA = score.goalsA > score.goalsB || (score.goalsA === score.goalsB && score.shootoutWinner === m.a);
    const isWinnerB = score.goalsB > score.goalsA || (score.goalsA === score.goalsB && score.shootoutWinner === m.b);
    const showScore = isResolvedTeam(m.a) && isResolvedTeam(m.b);

    return (
      <div
        key={idx}
        ref={el => {
          if (refArr) refArr.current[idx] = el;
          if (singleRef) (singleRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        onClick={() => handleMatchClick(m.a, m.b)}
        className={`bg-[#111827] border border-[#1f2937] ${hoverColor} rounded-lg p-2 text-xs space-y-1.5 cursor-pointer shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95`}
      >
        <div className="flex justify-between items-center text-gray-500 font-extrabold text-[9px] uppercase">
          <span>{m.name}</span>
          <span className={`${roundColor} font-black`}>{roundLabel}</span>
        </div>
        <div className="space-y-1">
          {renderTeamRow(m.a, probNext, score.goalsA, isWinnerA, showScore, score.goesToPenalties)}
          <div className="border-t border-gray-800/40" />
          {renderTeamRow(m.b, probNext, score.goalsB, isWinnerB, showScore, score.goesToPenalties)}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-full px-4 sm:px-6 py-8 select-none text-white space-y-6">

      {/* ---- Header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#1f2937] pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Interactive <span className="text-gradient">Tournament Bracket</span>
          </h1>
          <p className="mt-1.5 text-sm text-gray-400">
            Dynamic bracket from Round of 32 to Champion. Click any match to override the scoreline.
          </p>
        </div>
        {hasOverrides && (
          <button
            onClick={handleResetAll}
            className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-bold hover:bg-red-500/10 hover:border-red-500/50 transition-all"
          >
            <span>✕</span> Reset All Overrides ({overridesData?.overrides?.length})
          </button>
        )}
      </div>

      {/* ---- Simulating overlay ---- */}
      {isSimulating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-t-blue-500 border-gray-800" />
          <h3 className="mt-4 text-xl font-bold text-white">Recalculating Bracket…</h3>
          <p className="text-sm text-gray-400 mt-1">Running ELO-Poisson simulation with overrides</p>
        </div>
      )}

      {/* ================================================================ */}
      {/* MOBILE LAYOUT (< lg)                                              */}
      {/* ================================================================ */}
      <div className="lg:hidden space-y-4">
        <p className="text-xs text-gray-500 text-center">Tap any fixture to override its scoreline</p>

        <MobileRound
          title="Round of 32"
          color="text-indigo-400"
          matches={r32Matches.map(m => ({ a: m.a, b: m.b, label: m.name }))}
          overrides={overrides}
          onMatchClick={handleMatchClick}
        />
        <MobileRound
          title="Round of 16"
          color="text-teal-400"
          matches={r16Matches}
          overrides={overrides}
          onMatchClick={handleMatchClick}
        />
        <MobileRound
          title="Quarterfinals"
          color="text-violet-400"
          matches={qfMatches}
          overrides={overrides}
          onMatchClick={handleMatchClick}
        />
        <MobileRound
          title="Semifinals"
          color="text-red-400"
          matches={sfMatches}
          overrides={overrides}
          onMatchClick={handleMatchClick}
        />
        <MobileRound
          title="Final"
          color="text-amber-400"
          matches={[finalMatch]}
          overrides={overrides}
          onMatchClick={handleMatchClick}
        />

        {/* Mobile Champion */}
        <div className="rounded-xl border border-amber-500/30 bg-[#0f172a] p-6 text-center space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Estimated Champion</span>
          <div className="text-5xl animate-bounce">🏆</div>
          <h4 className="text-2xl font-black text-white">{champion}</h4>
          <p className="text-sm text-amber-400">{((champProb[champion] ?? 0) * 100).toFixed(1)}% win probability</p>
        </div>
      </div>

      {/* ================================================================ */}
      {/* DESKTOP LAYOUT (≥ lg) — horizontal bracket tree with SVG lines  */}
      {/* ================================================================ */}
      <div className="hidden lg:block overflow-x-auto pb-8 pt-2">
        {/* bracketRef wraps everything so SVG coords are relative to it */}
        <div ref={bracketRef} className="relative flex items-start gap-8 min-w-[1480px] justify-between px-4">

          {/* SVG connector overlay */}
          <svg
            className="pointer-events-none absolute top-0 left-0"
            style={{ width: '100%', height: svgH || '100%', overflow: 'visible' }}
          >
            {svgPaths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                stroke={p.color}
                strokeWidth={1.5}
                fill="none"
                strokeOpacity={0.35}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {/* ---- Column 1: Round of 32 (16 matches) ---- */}
          <div className="flex flex-col gap-5 w-[230px] shrink-0">
            <h3 className="text-center font-black uppercase text-[10px] tracking-wider text-indigo-400 border-b border-indigo-500/20 pb-2">
              Round of 32
            </h3>
            {r32Matches.map((m, idx) =>
              matchCard(m, idx, r32Refs, null, r16Prob, 'R32', 'text-indigo-400', 'hover:border-indigo-500/50')
            )}
          </div>

          {/* ---- Column 2: Round of 16 (8 matches) ---- */}
          <div className="flex flex-col gap-[68px] w-[230px] shrink-0 pt-10">
            <h3 className="text-center font-black uppercase text-[10px] tracking-wider text-teal-400 border-b border-teal-500/20 pb-2">
              Round of 16
            </h3>
            {r16Matches.map((m, idx) =>
              matchCard(m, idx, r16Refs, null, qfProb, 'R16', 'text-teal-400', 'hover:border-teal-500/50')
            )}
          </div>

          {/* ---- Column 3: Quarterfinals (4 matches) ---- */}
          <div className="flex flex-col gap-[170px] w-[230px] shrink-0 pt-[86px]">
            <h3 className="text-center font-black uppercase text-[10px] tracking-wider text-violet-400 border-b border-violet-500/20 pb-2">
              Quarterfinals
            </h3>
            {qfMatches.map((m, idx) =>
              matchCard(m, idx, qfRefs, null, sfProb, 'QF', 'text-violet-400', 'hover:border-violet-500/50')
            )}
          </div>

          {/* ---- Column 4: Semifinals (2 matches) ---- */}
          <div className="flex flex-col gap-[384px] w-[230px] shrink-0 pt-[195px]">
            <h3 className="text-center font-black uppercase text-[10px] tracking-wider text-red-400 border-b border-red-500/20 pb-2">
              Semifinals
            </h3>
            {sfMatches.map((m, idx) =>
              matchCard(m, idx, sfRefs, null, finalistProb, 'SF', 'text-red-400', 'hover:border-red-500/50')
            )}
          </div>

          {/* ---- Column 5: Final + Champion ---- */}
          <div className="flex flex-col gap-8 w-[240px] shrink-0 pt-[400px]">
            <h3 className="text-center font-black uppercase text-[10px] tracking-wider text-amber-400 border-b border-amber-500/20 pb-2">
              Final &amp; Champion
            </h3>

            {/* Final match card */}
            {(() => {
              const score     = getRenderScore(finalMatch.a, finalMatch.b, overrides);
              const isWinnerA = score.goalsA > score.goalsB || (score.goalsA === score.goalsB && score.shootoutWinner === finalMatch.a);
              const isWinnerB = score.goalsB > score.goalsA || (score.goalsA === score.goalsB && score.shootoutWinner === finalMatch.b);
              const showScore = isResolvedTeam(finalMatch.a) && isResolvedTeam(finalMatch.b);
              return (
                <div
                  ref={el => { finalRef.current = el; }}
                  onClick={() => handleMatchClick(finalMatch.a, finalMatch.b)}
                  className="bg-[#111827] border border-amber-500/30 hover:border-amber-500/60 rounded-lg p-3 text-xs space-y-1.5 cursor-pointer shadow-2xl transition-all hover:scale-[1.02]"
                >
                  <div className="flex justify-between items-center text-[9px] uppercase font-black">
                    <span className="text-gray-500">{finalMatch.name}</span>
                    <span className="text-amber-400">Final</span>
                  </div>
                  <div className="space-y-1">
                    {renderTeamRow(finalMatch.a, champProb, score.goalsA, isWinnerA, showScore, score.goesToPenalties)}
                    <div className="border-t border-gray-800/40" />
                    {renderTeamRow(finalMatch.b, champProb, score.goalsB, isWinnerB, showScore, score.goesToPenalties)}
                  </div>
                </div>
              );
            })()}

            {/* Champion spotlight */}
            <div className="rounded-xl border border-amber-500/30 bg-[#0f172a] p-5 text-center space-y-2 shadow-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Estimated Champion
              </span>
              <div className="text-5xl animate-bounce mt-2">🏆</div>
              <h4 className="text-lg font-black text-white mt-1">{champion}</h4>
              <p className="text-sm text-amber-400 font-bold">{((champProb[champion] ?? 0) * 100).toFixed(1)}%</p>
              <p className="text-[9px] text-gray-600">ELO-Poisson · 100k simulations</p>
            </div>
          </div>

        </div>
      </div>

      {/* ================================================================ */}
      {/* Override Modal                                                     */}
      {/* ================================================================ */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111827] border border-gray-700 rounded-2xl p-6 shadow-2xl w-full max-w-sm space-y-5">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                🔒 Override Knockout Match
              </h3>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Lock a custom score to re-simulate the entire bracket from this point.
              </p>
            </div>

            <div className="bg-[#0a0e1a] p-4 rounded-xl border border-gray-800">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 text-center">
                  <div className="text-[10px] text-gray-400 mb-1 uppercase font-bold">Home</div>
                  <div className="text-sm font-black text-white truncate">{selectedMatch.teamA}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={goalsA}
                    onChange={e => setGoalsA(e.target.value)}
                    className="w-14 text-center bg-[#111827] border border-gray-700 rounded-lg py-2 text-lg font-black text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <span className="text-gray-600 font-black text-lg">–</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={goalsB}
                    onChange={e => setGoalsB(e.target.value)}
                    className="w-14 text-center bg-[#111827] border border-gray-700 rounded-lg py-2 text-lg font-black text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="flex-1 text-center">
                  <div className="text-[10px] text-gray-400 mb-1 uppercase font-bold">Away</div>
                  <div className="text-sm font-black text-white truncate">{selectedMatch.teamB}</div>
                </div>
              </div>
              <p className="text-[10px] text-gray-600 text-center mt-3">Equal scores go to penalty shootout (winner determined by ELO)</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedMatch(null)}
                className="flex-1 py-2.5 bg-[#0a0e1a] border border-gray-700 rounded-xl hover:border-gray-600 transition text-gray-300 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOverride}
                className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition rounded-xl text-white text-sm font-black shadow-lg"
              >
                Lock Score
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
