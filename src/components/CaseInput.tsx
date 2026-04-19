"use client";

import { useEffect, useRef, useState } from "react";

const EXAMPLES = [
  "I want to work at an early-stage AI startup in SF...",
  "Find me DevTools companies hiring founding engineers...",
  "Show me YC 2026 fintech companies looking for ML talent...",
  "Climate-tech startups with active open source projects...",
  "Infrastructure companies just out of stealth...",
];

type Props = {
  onSubmit: (q: string) => void;
  disabled?: boolean;
};

export default function CaseInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState(EXAMPLES[0]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (disabled || value) return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % EXAMPLES.length;
      setPlaceholder(EXAMPLES[i]);
    }, 3200);
    return () => clearInterval(id);
  }, [disabled, value]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      if (value.trim() && !disabled) onSubmit(value.trim());
    }
  };

  return (
    <div className="relative">
      <div className="mb-3 flex items-center gap-3 text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span>OPEN NEW CASE · MISSION BRIEF</span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>

      <div className="hud-corners relative rounded-sm border border-[var(--border-strong)] bg-[var(--bg-secondary)] p-1 shadow-[0_0_0_1px_rgba(229,142,38,0.06),0_12px_40px_-10px_rgba(0,0,0,0.7)]">
        <div className="relative">
          <div className="absolute left-4 top-4 select-none text-[11px] tracking-[0.3em] text-[var(--accent-amber)] opacity-80">
            <span className="typewriter">&gt; TRANSMIT BRIEF:</span>
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            rows={3}
            maxLength={500}
            disabled={disabled}
            spellCheck={false}
            className="min-h-[120px] w-full resize-none bg-transparent px-5 pt-10 pb-16 font-mono text-[17px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/70 disabled:opacity-60"
          />
          <div className="pointer-events-none absolute inset-x-4 bottom-14 h-px bg-[var(--border-subtle)]" />

          <div className="flex items-center justify-between px-5 pb-4">
            <div className="flex items-center gap-4 text-[10px] tracking-[0.22em] text-[var(--text-muted)]">
              <span>↵ DEPLOY</span>
              <span className="opacity-40">|</span>
              <span>⌘↵ DEPLOY</span>
              <span className="opacity-40">|</span>
              <span
                className={
                  value.length >= 450
                    ? "text-[var(--accent-red)]"
                    : value
                    ? "text-[var(--accent-amber)]"
                    : ""
                }
              >
                {value.length.toString().padStart(3, "0")} / 500 CHAR
              </span>
            </div>
            <button
              type="button"
              onClick={() => value.trim() && !disabled && onSubmit(value.trim())}
              disabled={!value.trim() || disabled}
              className="group relative flex items-center gap-3 overflow-hidden rounded-sm border border-[var(--accent-amber)] bg-[var(--accent-amber)]/10 px-5 py-2.5 text-[12px] tracking-[0.32em] text-[var(--accent-amber)] transition hover:bg-[var(--accent-amber)]/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="relative z-10 typewriter">DEPLOY AGENTS</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="relative z-10 transition group-hover:translate-x-1"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
