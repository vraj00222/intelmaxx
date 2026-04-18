"use client";

import { useEffect, useState } from "react";

const LINES = [
  { agent: "ORCHESTRATOR", text: "Parsing mission brief..." },
  { agent: "FOXHOUND", text: "Scanning funding records..." },
  { agent: "WIRETAP", text: "Intercepting hiring signals..." },
  { agent: "GHOSTNET", text: "Sweeping open-source networks..." },
  { agent: "PROFILER", text: "Cross-referencing targets..." },
  { agent: "PROFILER", text: "Compiling dossier..." },
];

export default function LoadingSequence() {
  const [shown, setShown] = useState(1);

  useEffect(() => {
    const id = setInterval(() => {
      setShown((s) => (s >= LINES.length ? s : s + 1));
    }, 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hud-corners relative rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-5">
      <div className="scanline" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-[var(--accent-amber)]">
          <span className="pulse-dot" style={{ background: "var(--accent-amber)", color: "var(--accent-amber)" }} />
          <span>DEPLOYING AGENTS...</span>
        </div>
        <ul className="mt-4 space-y-2 font-mono text-[13px]">
          {LINES.slice(0, shown).map((l, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-[var(--text-muted)]">
                [{new Date().toLocaleTimeString()}]
              </span>
              <span className="text-[var(--accent-amber)]">{l.agent}</span>
              <span
                className={`text-[var(--text-primary)]/90 ${i === shown - 1 ? "caret" : ""}`}
              >
                {l.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
