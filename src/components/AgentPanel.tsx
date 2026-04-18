"use client";

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
    failed: "SIGNAL LOST",
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

export default function AgentPanel({ statuses, findings = {} }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3 text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span>FIELD AGENTS · DEPLOYMENT STATUS</span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {AGENTS.map((a) => {
          const s = statuses[a.code] ?? "standby";
          const color = statusColor(s);
          const isActive = s === "deployed" || s === "investigating";
          return (
            <div
              key={a.code}
              className="relative overflow-hidden rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-4 transition"
              style={{
                boxShadow:
                  s === "intel_acquired"
                    ? "0 0 0 1px rgba(39,174,96,0.45), 0 0 30px rgba(39,174,96,0.15)"
                    : s === "failed"
                    ? "0 0 0 1px rgba(194,54,22,0.45)"
                    : isActive
                    ? "0 0 0 1px rgba(229,142,38,0.45), 0 0 30px rgba(229,142,38,0.18)"
                    : undefined,
              }}
            >
              {isActive && <div className="scanline" />}

              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-sm border border-[var(--border-subtle)]"
                    style={{ color }}
                  >
                    <div className="h-5 w-5">{a.icon}</div>
                  </div>
                  <div>
                    <div className="typewriter text-sm tracking-[0.14em] text-[var(--text-primary)]">
                      {a.code}
                    </div>
                    <div className="text-[10px] tracking-[0.15em] text-[var(--text-muted)]">
                      {a.title.toUpperCase()}
                    </div>
                  </div>
                </div>

                <span className="pulse-dot" style={{ background: color, color }} />
              </div>

              <div className="relative mt-4 text-[11px] text-[var(--text-secondary)]">
                {a.purpose}
              </div>

              <div className="relative mt-3 flex items-center justify-between text-[10px] tracking-[0.22em]">
                <span style={{ color }}>{statusLabel(s)}</span>
                <span className="text-[var(--text-muted)]">
                  {s === "intel_acquired"
                    ? `${findings[a.code] ?? 0} INTEL`
                    : s === "investigating"
                    ? "SCANNING..."
                    : s === "deployed"
                    ? "DEPLOYING..."
                    : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
