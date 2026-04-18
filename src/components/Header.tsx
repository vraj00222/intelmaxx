"use client";

type Props = {
  caseNumber?: string | null;
  status: "idle" | "deploying" | "complete" | "error";
};

export default function Header({ caseNumber, status }: Props) {
  const statusLabel = {
    idle: "STANDBY",
    deploying: "LIVE OP",
    complete: "INTEL ACQUIRED",
    error: "SIGNAL LOST",
  }[status];

  const statusColor = {
    idle: "var(--text-muted)",
    deploying: "var(--accent-amber)",
    complete: "var(--accent-green)",
    error: "var(--accent-red)",
  }[status];

  return (
    <header className="relative z-10 border-b border-[var(--border-subtle)] bg-[rgba(20,17,16,0.85)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-[var(--accent-amber)] text-[var(--accent-amber)]"
            aria-hidden
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <div className="typewriter text-[22px] tracking-[0.18em] text-[var(--text-primary)]">
              INTELMAXXING
            </div>
            <div className="mt-1 text-[10px] tracking-[0.35em] text-[var(--text-muted)]">
              CAREER INTELLIGENCE · WAR ROOM
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end text-right">
            <div className="text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
              CASE FILE
            </div>
            <div className="typewriter text-sm text-[var(--text-primary)]">
              {caseNumber ? `№ ${caseNumber}` : "№ ——————"}
            </div>
          </div>

          <div
            className="flex items-center gap-2 rounded border border-[var(--border-strong)] px-3 py-1.5"
            style={{ color: statusColor }}
          >
            <span className="pulse-dot" style={{ background: statusColor, color: statusColor }} />
            <span className="text-[10px] tracking-[0.3em]">{statusLabel}</span>
          </div>

          <div className="hidden sm:inline-block stamp text-[10px]">CLASSIFIED</div>
        </div>
      </div>
    </header>
  );
}
