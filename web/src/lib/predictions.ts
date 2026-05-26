/**
 * Shared prediction utilities — ELO constants, Poisson score sampler,
 * getRenderScore, getLikelyWinner. Imported by page.tsx and bracket/page.tsx
 * so the logic lives in exactly one place.
 */

export interface ScoreResult {
  goalsA: number;
  goalsB: number;
  goesToPenalties: boolean;
  shootoutWinner?: string;
}

export interface Override {
  team_a: string;
  team_b: string;
  goals_a: number;
  goals_b: number;
}

// ---------------------------------------------------------------------------
// ELO ratings (base strength — same values used in backend dynamic_simulation.py)
// ---------------------------------------------------------------------------
export const BASE_ELO: Record<string, number> = {
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
  "Cape Verde": 1610.0, "Jordan": 1630.0, "Czechia": 1760.0,
  "Bosnia and Herzegovina": 1670.0, "Türkiye": 1780.0, "Sweden": 1830.0,
  "DR Congo": 1700.0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic string → uniform float [0, 1) */
export function seedRandom(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

/**
 * Seeded Poisson sampler — produces realistic integer goal counts (0–5).
 * Uses a Linear Congruential Generator so the result is deterministic for a
 * given (lambda, seed) pair but varies meaningfully across different matchups.
 */
function poissonSample(lambda: number, seed: number): number {
  const MAX = 5;
  const L = Math.exp(-Math.min(lambda, 8));
  let k = 0;
  let p = 1.0;
  // Seed the LCG from the float seed value
  let s = (Math.abs(Math.floor(seed * 0x7fffffff)) | 0) >>> 0;
  do {
    k++;
    s = ((s * 1664525 + 1013904223) >>> 0);
    p *= s / 0x100000000;
  } while (p > L && k <= MAX);
  return Math.min(k - 1, MAX);
}

export function isResolvedTeam(team: string): boolean {
  if (!team) return false;
  if (/^\d/.test(team)) return false;   // "1E", "2A"
  if (team.includes("/")) return false; // "Netherlands/Morocco"
  if (team === "TBD" || team.includes("3rd")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Core prediction — ELO-adjusted Poisson score with seeded sampling
// ---------------------------------------------------------------------------
export function getPredictedScore(a: string, b: string): ScoreResult {
  if (!isResolvedTeam(a) || !isResolvedTeam(b)) {
    return { goalsA: 0, goalsB: 0, goesToPenalties: false };
  }

  const eloA = BASE_ELO[a] ?? 1600;
  const eloB = BASE_ELO[b] ?? 1600;
  const diff = eloA - eloB;

  // Independent seeds per team so A and B goals are uncorrelated
  const seedA = seedRandom(`${a}|home|${b}`);
  const seedB = seedRandom(`${b}|away|${a}`);

  // World Cup knockout baseline ≈ 1.3 expected goals per team; scaled by ELO gap.
  // diff/500: Argentina (2100) vs Haiti (1560) → diff=540 → lambdaA=2.38, lambdaB=0.22
  // diff/500: Argentina (2100) vs France (2080) → diff=20  → lambdaA=1.34, lambdaB=1.26
  const lambdaA = Math.max(0.3, 1.3 + diff / 500);
  const lambdaB = Math.max(0.3, 1.3 - diff / 500);

  const goalsA = poissonSample(lambdaA, seedA);
  const goalsB = poissonSample(lambdaB, seedB);

  if (goalsA === goalsB) {
    // Penalty shootout — seeded by matchup string, weighted by ELO
    const pSeed = seedRandom(`${a} vs ${b} penalties`);
    const eloWinProb = 0.5 + diff / 1200;
    return { goalsA, goalsB, goesToPenalties: true, shootoutWinner: pSeed <= eloWinProb ? a : b };
  }
  return { goalsA, goalsB, goesToPenalties: false };
}

// ---------------------------------------------------------------------------
// Override-aware wrapper — returns override result if present, else prediction
// ---------------------------------------------------------------------------
export function getRenderScore(
  a: string,
  b: string,
  overrides?: Override[] | null,
): ScoreResult {
  if (overrides && overrides.length > 0) {
    const ov = overrides.find(
      (o) => (o.team_a === a && o.team_b === b) || (o.team_a === b && o.team_b === a),
    );
    if (ov) {
      const isHomeA = ov.team_a === a;
      const goalsA = isHomeA ? ov.goals_a : ov.goals_b;
      const goalsB = isHomeA ? ov.goals_b : ov.goals_a;
      if (goalsA === goalsB) {
        const eloA = BASE_ELO[a] ?? 1600;
        const eloB = BASE_ELO[b] ?? 1600;
        const pSeed = seedRandom(`${a} vs ${b} penalties`);
        const eloWinProb = 0.5 + (eloA - eloB) / 1200;
        return { goalsA, goalsB, goesToPenalties: true, shootoutWinner: pSeed <= eloWinProb ? a : b };
      }
      return { goalsA, goalsB, goesToPenalties: false };
    }
  }
  return getPredictedScore(a, b);
}

// ---------------------------------------------------------------------------
// Bracket progression — who wins this match?
// ---------------------------------------------------------------------------
export function getLikelyWinner(
  a: string,
  b: string,
  overrides?: Override[] | null,
): string {
  if (isResolvedTeam(a) && isResolvedTeam(b)) {
    const s = getRenderScore(a, b, overrides);
    if (s.goalsA > s.goalsB) return a;
    if (s.goalsB > s.goalsA) return b;
    if (s.shootoutWinner) return s.shootoutWinner;
    // Absolute fallback: higher ELO wins
    return (BASE_ELO[a] ?? 1600) >= (BASE_ELO[b] ?? 1600) ? a : b;
  }
  if (isResolvedTeam(a)) return a;
  if (isResolvedTeam(b)) return b;
  return `${a}/${b}`;
}
