import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FIFA World Cup 2026 — ML Predictions Dashboard",
  description:
    "Advanced Machine Learning prediction system and Monte Carlo simulator for the FIFA World Cup 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#0a0e1a] text-[#f9fafb]">
        {/* Global Premium Header Nav */}
        <header className="sticky top-0 z-50 border-b border-[#1f2937] bg-[#0a0e1a]/80 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              {/* Logo / Brand */}
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <Link href="/" className="text-lg font-bold tracking-tight text-white hover:opacity-90">
                  FIFA <span className="text-gradient font-extrabold">WC 2026</span> Predictor
                </Link>
              </div>

              {/* Desktop Nav */}
              <nav className="hidden sm:flex items-center gap-6">
                <Link href="/" className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                  Overview
                </Link>
                <Link href="/groups" className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                  Groups
                </Link>
                <Link href="/matches" className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                  Matches
                </Link>
                <Link href="/stages" className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                  Stage Predictions
                </Link>
                <Link href="/bracket" className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                  Interactive Bracket
                </Link>
              </nav>

              {/* Mobile Nav — simple icon links */}
              <nav className="flex sm:hidden items-center gap-3 text-xs">
                <Link href="/groups" className="text-gray-400 hover:text-white">Groups</Link>
                <Link href="/bracket" className="text-gray-400 hover:text-white">Bracket</Link>
                <Link href="/stages" className="text-gray-400 hover:text-white">Stages</Link>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow">
          {children}
        </main>

        {/* Premium Footer */}
        <footer className="border-t border-[#1f2937] bg-[#0a0e1a] py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-500">
            <p>© 2026 FIFA World Cup Machine Learning Prediction Engine. Powered by Antigravity AI.</p>
            <p className="mt-1">All rights reserved. Simulated with 100,000 Monte Carlo iterations using ELO-Poisson models.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
