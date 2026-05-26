import Link from "next/link";
import fs from "fs";
import path from "path";

// Flag mapping for the 48 teams
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


function getPredictions() {
  const filePath = path.join(process.cwd(), "public/data/predictions.json");
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, "utf8");
    return JSON.parse(fileContent);
  }
  return null;
}

export default function Home() {
  const data = getPredictions();

  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 font-bold">Error: Predictions data not found.</p>
          <p className="text-gray-400 text-sm">Please run the simulation pipeline first.</p>
        </div>
      </div>
    );
  }

  // Get top 8 teams by champion probability
  const top8 = Object.entries(data.champion_probability)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 8);

  const totalSims = data.n_simulations || 100000;
  const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : "TBD";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="rounded-2xl border border-[#1f2937] bg-gradient-to-br from-[#111827] to-[#0a0e1a] p-8 md:p-12 text-center md:text-left md:flex md:items-center md:justify-between glow-card">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-md bg-[#3b82f6]/10 px-3 py-1 text-xs font-medium text-[#3b82f6] ring-1 ring-inset ring-[#3b82f6]/20">
            Machine Learning Engine V2.6
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
            FIFA World Cup 2026 <span className="text-gradient">ML Predictions</span>
          </h1>
          <p className="mt-4 text-lg text-gray-300">
            Explore advanced predictive modeling, group stage rankings, bracket paths, and 
            championship probabilities simulated across 100,000 Monte Carlo iterations.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 justify-center md:justify-start">
            <Link
              href="/bracket"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
            >
              Simulate Bracket
            </Link>
            <Link
              href="/groups"
              className="rounded-lg border border-[#1f2937] bg-[#111827] px-5 py-2.5 text-sm font-semibold text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Group Standings
            </Link>
          </div>
        </div>
        
        {/* Quick Stats Block */}
        <div className="mt-8 md:mt-0 grid grid-cols-2 gap-4 max-w-xs mx-auto md:mx-0">
          <div className="rounded-lg bg-[#111827] p-4 border border-[#1f2937]">
            <p className="text-xs text-gray-400">Total Simulations</p>
            <p className="text-lg font-bold text-white mt-1">{totalSims.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-[#111827] p-4 border border-[#1f2937]">
            <p className="text-xs text-gray-400">Log-Loss Rate</p>
            <p className="text-lg font-bold text-green-500 mt-1">0.8738</p>
          </div>
          <div className="rounded-lg bg-[#111827] p-4 border border-[#1f2937]">
            <p className="text-xs text-gray-400">Model Accuracy</p>
            <p className="text-lg font-bold text-blue-500 mt-1">51.56%</p>
          </div>
          <div className="rounded-lg bg-[#111827] p-4 border border-[#1f2937]">
            <p className="text-xs text-gray-400">Last Simulated</p>
            <p className="text-xs font-semibold text-white mt-2 truncate">{timestamp.split(',')[0]}</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Champion Probabilities & Bracket Preview */}
      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left 2 Columns: Top 8 Champion Probabilities */}
        <div className="lg:col-span-2 rounded-xl border border-[#1f2937] bg-[#111827] p-6 sm:p-8">
          <div className="flex items-center justify-between border-b border-[#1f2937] pb-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Championship Odds</h2>
              <p className="text-xs text-gray-400">Top 8 candidates sorted by simulation win probability</p>
            </div>
            <Link href="/groups" className="text-xs font-semibold text-blue-500 hover:text-blue-400">
              See All 48 Teams →
            </Link>
          </div>

          <div className="space-y-5">
            {top8.map(([team, prob]: any, idx) => {
              const flag = flags[team] || "🏳️";
              const percent = (prob * 100).toFixed(1);
              return (
                <div key={team} className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">#{idx + 1}</span>
                      <span className="text-lg">{flag}</span>
                      <span className="text-white hover:text-blue-400 transition-colors">
                        <Link href={`/team/${team.toLowerCase().replace(/ /g, '-')}`}>{team}</Link>
                      </span>
                    </div>
                    <span className="text-green-500">{percent}%</span>
                  </div>
                  {/* Probability Bar */}
                  <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-green-500 transition-all duration-1000"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Mini Bracket Preview */}
        <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 sm:p-8">
          <div className="border-b border-[#1f2937] pb-4 mb-6">
            <h2 className="text-xl font-bold text-white">Predicted Final Path</h2>
            <p className="text-xs text-gray-400">Most likely knockout finalists</p>
          </div>

          <div className="space-y-6 flex flex-col justify-between h-[300px]">
            {/* Semi-final 1 */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#1f2937] bg-[#0a0e1a]">
              <div className="flex items-center gap-2">
                <span>{flags["Argentina"]}</span>
                <span className="text-xs font-bold">Argentina</span>
              </div>
              <span className="text-xs text-gray-400">SF 1</span>
            </div>
            
            {/* Final Match card */}
            <div className="relative p-4 rounded-xl border border-blue-500 bg-gradient-to-br from-[#111827] to-[#0a0e1a] text-center glow-card">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full text-white tracking-widest">
                Final Matchup
              </span>
              <div className="flex items-center justify-around mt-2">
                <div className="text-center">
                  <span className="text-3xl">{flags["Argentina"]}</span>
                  <p className="text-xs font-bold text-white mt-1">Argentina</p>
                </div>
                <span className="text-xs font-black text-blue-500">VS</span>
                <div className="text-center">
                  <span className="text-3xl">{flags["France"]}</span>
                  <p className="text-xs font-bold text-white mt-1">France</p>
                </div>
              </div>
            </div>

            {/* Semi-final 2 */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#1f2937] bg-[#0a0e1a]">
              <div className="flex items-center gap-2">
                <span>{flags["France"]}</span>
                <span className="text-xs font-bold">France</span>
              </div>
              <span className="text-xs text-gray-400">SF 2</span>
            </div>
          </div>

          <Link
            href="/bracket"
            className="mt-6 block w-full rounded-lg border border-dashed border-[#1f2937] py-2.5 text-center text-xs font-bold text-blue-500 hover:border-blue-500/50 hover:bg-[#0a0e1a] transition-all"
          >
            Open Interactive Bracket Simulator →
          </Link>
        </div>
      </div>
    </div>
  );
}
