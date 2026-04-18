"use client";

import { useEffect, useState } from "react";

type Line = { agent: string; text: string; color: string };

const LINES: Line[] = [
  { agent: "ORCH", text: "Parsing mission brief with Gemma 4...", color: "var(--accent-amber)" },
  { agent: "FOXHOUND", text: "Scanning funding records · YC · HN...", color: "var(--accent-amber)" },
  { agent: "WIRETAP", text: "Intercepting hiring signals...", color: "var(--accent-red)" },
  { agent: "GHOSTNET", text: "Sweeping open-source networks...", color: "var(--accent-green)" },
  { agent: "WIRETAP", text: "Decoding Who-Is-Hiring thread...", color: "var(--accent-red)" },
  { agent: "GHOSTNET", text: "Enumerating good-first-issues...", color: "var(--accent-green)" },
  { agent: "FOXHOUND", text: "Cross-checking Series-A signals...", color: "var(--accent-amber)" },
  { agent: "PROFILER", text: "Cross-referencing targets...", color: "var(--accent-blue)" },
  { agent: "PROFILER", text: "Compiling dossier...", color: "var(--accent-blue)" },
  { agent: "PROFILER", text: "Writing noir briefing...", color: "var(--accent-blue)" },
];

export default function LoadingSequence() {
  const [shown, setShown] = useState(1);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setShown((s) => (s >= LINES.length ? s : s + 1));
    }, 900);
    const t = setInterval(() => setTick((x) => x + 1), 220);
    return () => {
      clearInterval(id);
      clearInterval(t);
    };
  }, []);

  const clock = new Date().toLocaleTimeString([], { hour12: false });
  const hex = (Math.sin(tick) * 0xffff).toString(16).slice(-4).toUpperCase().padStart(4, "0");

  return (
    <div className="hud-corners relative overflow-hidden rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-5">
      <div className="scanline" />

      <div className="relative flex items-center justify-between text-[10px] tracking-[0.3em]">
        <span className="flex items-center gap-2 text-[var(--accent-amber)]">
          <span className="pulse-dot" style={{ background: "var(--accent-amber)", color: "var(--accent-amber)" }} />
          LIVE · DEPLOYING AGENTS
        </span>
        <span className="text-[var(--text-muted)]">
          {clock} · KEY {hex}
        </span>
      </div>

      <ul className="relative mt-4 space-y-1.5 font-mono text-[12.5px]">
        {LINES.slice(0, shown).map((l, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-[var(--text-muted)]">
              [{String(i + 1).padStart(2, "0")}]
            </span>
            <span
              className="inline-block w-[82px] shrink-0 tracking-[0.14em]"
              style={{ color: l.color }}
            >
              {l.agent}
            </span>
            <span
              className={`flex-1 text-[var(--text-primary)]/90 ${
                i === shown - 1 ? "caret" : ""
              }`}
            >
              {l.text}
            </span>
            {i < shown - 1 ? (
              <span className="text-[var(--accent-green)]">✓</span>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Progress bar */}
      <div className="relative mt-4 h-[3px] overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent-amber)] via-[var(--accent-red)] to-[var(--accent-amber)]"
          style={{
            width: `${Math.min(100, (shown / LINES.length) * 100)}%`,
            transition: "width 0.6s ease",
            boxShadow: "0 0 12px rgba(229,142,38,0.6)",
          }}
        />
      </div>
    </div>
  );
}
