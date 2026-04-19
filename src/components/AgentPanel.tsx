"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentCode, AgentStatus } from "@/lib/agents/types";

type AgentSlot = {
  code: AgentCode;
  title: string;
  purpose: string;
  icon: React.ReactNode;
};

const AGENTS: AgentSlot[] = [
  {
    code: "FOXHOUND",
    title: "Funding Scout",
    purpose: "Funding intel · YC · Series rounds",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
        <path d="M11 8v3l2 2" />
      </svg>
    ),
  },
  {
    code: "WIRETAP",
    title: "Hiring Signals",
    purpose: "HN threads · Show HN · hiring chatter",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v6" />
        <path d="M5.6 9a9 9 0 0 1 12.8 0" />
        <path d="M8.5 11.5a5 5 0 0 1 7 0" />
        <circle cx="12" cy="14" r="2" />
        <path d="M10 22l2-5 2 5" />
      </svg>
    ),
  },
  {
    code: "GHOSTNET",
    title: "Open-Source Radar",
    purpose: "GitHub · OSS activity · good-first-issues",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15 15 0 0 1 0 20" />
        <path d="M12 2a15 15 0 0 0 0 20" />
        <path d="M2 12h20" />
      </svg>
    ),
  },
  {
    code: "PROFILER",
    title: "Target Analyst",
    purpose: "Cross-reference · rank · brief",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    ),
  },
];

function statusLabel(s: AgentStatus): string {
  return {
    standby: "STANDBY",
    deployed: "DEPLOYED",
    investigating: "INVESTIGATING",
    intel_acquired: "INTEL ACQUIRED",
    failed: "NO MATCHES",
  }[s];
}

function statusColor(s: AgentStatus): string {
  return {
    standby: "var(--text-muted)",
    deployed: "var(--accent-amber)",
    investigating: "var(--accent-amber)",
    intel_acquired: "var(--accent-green)",
    failed: "var(--accent-red)",
  }[s];
}

type Props = {
  statuses: Record<AgentCode, AgentStatus>;
  findings?: Partial<Record<AgentCode, number>>;
};

/** Animate a numeric count from 0 → target over ~450ms when target changes. */
function useCountUp(target: number): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number>(0);
  useEffect(() => {
    if (target === val) return;
    fromRef.current = val;
    startRef.current = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - startRef.current) / 450);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(fromRef.current + (target - fromRef.current) * eased);
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return val;
}

function AgentCard({
  slot,
  status,
  intel,
}: {
  slot: AgentSlot;
  status: AgentStatus;
  intel: number;
}) {
  const color = statusColor(status);
  const isActive = status === "deployed" || status === "investigating";
  const count = useCountUp(intel);

  // Per-agent elapsed timer — resets when the agent transitions into an
  // active state so each card shows how long IT specifically has been working.
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (isActive) {
      if (startRef.current === null) startRef.current = performance.now();
      const id = setInterval(() => {
        if (startRef.current !== null) setElapsed(performance.now() - startRef.current);
      }, 200);
      return () => clearInterval(id);
    }
    startRef.current = null;
  }, [isActive]);

  const elapsedStr = `${(elapsed / 1000).toFixed(1)}s`;

  return (
    <div
      className="relative overflow-hidden rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-4 transition-all duration-300"
      style={{
        boxShadow:
          status === "intel_acquired"
            ? "0 0 0 1px rgba(39,174,96,0.45), 0 0 30px rgba(39,174,96,0.18)"
            : status === "failed"
            ? "0 0 0 1px rgba(194,54,22,0.45)"
            : isActive
            ? "0 0 0 1px rgba(229,142,38,0.55), 0 0 30px rgba(229,142,38,0.22)"
            : undefined,
        transform: isActive ? "translateY(-1px)" : undefined,
      }}
    >
      {isActive && <div className="scanline" />}

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-[var(--border-subtle)] transition-colors"
            style={{
              color,
              borderColor: isActive ? "var(--accent-amber)" : "var(--border-subtle)",
              background: isActive ? "rgba(229,142,38,0.06)" : undefined,
            }}
          >
            <div className="h-5 w-5">{slot.icon}</div>
          </div>
          <div>
            <div className="typewriter text-sm tracking-[0.14em] text-[var(--text-primary)]">
              {slot.code}
            </div>
            <div className="text-[10px] tracking-[0.15em] text-[var(--text-muted)]">
              {slot.title.toUpperCase()}
            </div>
          </div>
        </div>

        <span className="pulse-dot" style={{ background: color, color }} />
      </div>

      <div className="relative mt-4 text-[11px] text-[var(--text-secondary)]">
        {slot.purpose}
      </div>

      <div className="relative mt-3 flex items-center justify-between text-[10px] tracking-[0.22em]">
        <span style={{ color }}>{statusLabel(status)}</span>
        <span className="tabular-nums text-[var(--text-muted)]">
          {status === "intel_acquired"
            ? intel > 0
              ? `${count} INTEL`
              : "CROSS-FED"
            : status === "investigating"
            ? `${elapsedStr} · SCANNING`
            : status === "deployed"
            ? `${elapsedStr} · DEPLOYED`
            : "—"}
        </span>
      </div>

      {/* Thin activity bar — appears only while the agent is active */}
      {isActive ? (
        <div className="relative mt-2 h-[2px] overflow-hidden rounded-full bg-black/40">
          <div
            className="absolute inset-y-0 w-1/3"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--accent-amber), transparent)",
              animation: "intel-ticker-sweep 1.4s linear infinite",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function AgentPanel({ statuses, findings = {} }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3 text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span>FIELD AGENTS · DEPLOYMENT STATUS</span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {AGENTS.map((a) => (
          <AgentCard
            key={a.code}
            slot={a}
            status={statuses[a.code] ?? "standby"}
            intel={findings[a.code] ?? 0}
          />
        ))}
      </div>
    </section>
  );
}
