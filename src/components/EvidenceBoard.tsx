"use client";

import type { InvestigationPayload } from "@/lib/agents/types";
import CaseFileCard from "./CaseFileCard";

type Props = {
  payload: InvestigationPayload | null;
};

export default function EvidenceBoard({ payload }: Props) {
  if (!payload) return null;
  const { funding, signals, oss, profiler } = payload;

  const hotNames = new Set(
    (profiler.top_targets || []).slice(0, 3).map((t) => t.company_name.toLowerCase())
  );

  type Item = Parameters<typeof CaseFileCard>[0]["item"];
  const items: Item[] = [
    ...funding.map((f) => ({ kind: "funding" as const, data: f })),
    ...signals.map((s) => ({ kind: "signal" as const, data: s })),
    ...oss.map((o) => ({ kind: "oss" as const, data: o })),
  ];

  return (
    <section>
      <div className="mb-3 flex items-center gap-3 text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span>EVIDENCE BOARD · {items.length} CASE FILES</span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>

      <div className="corkboard relative rounded-sm border border-black/40 p-5 sm:p-7 lg:p-9">
        {/* Decorative red strings — detective-board feel */}
        {items.length > 1 ? (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <defs>
              <linearGradient id="string-grad" x1="0" x2="1">
                <stop offset="0%" stopColor="var(--accent-red)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="var(--accent-red)" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path d="M8 10 Q 40 30 72 18 T 94 60" stroke="url(#string-grad)" strokeWidth="0.4" fill="none" />
            <path d="M6 70 Q 30 50 55 75 T 92 88" stroke="url(#string-grad)" strokeWidth="0.35" fill="none" />
            <path d="M20 92 Q 50 60 80 40" stroke="var(--accent-red)" strokeOpacity="0.18" strokeWidth="0.3" fill="none" />
          </svg>
        ) : null}

        {/* Corner push-pins */}
        <span className="pin absolute left-3 top-3" />
        <span className="pin absolute right-3 top-3" style={{ background: "radial-gradient(circle at 35% 35%, #f5c948, #8a6a16)" }} />
        <span className="pin absolute bottom-3 left-3" style={{ background: "radial-gradient(circle at 35% 35%, #f5c948, #8a6a16)" }} />
        <span className="pin absolute bottom-3 right-3" />

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="stamp text-sm mb-4">NO INTEL</div>
            <p className="max-w-sm text-sm text-[var(--text-primary)]/80">
              No signals gathered. Adjust the mission parameters and redeploy.
            </p>
          </div>
        ) : (
          <div
            className="relative z-10 grid gap-8 sm:gap-6"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
          >
            {items.map((item, idx) => {
              const name =
                item.kind === "funding"
                  ? item.data.company_name
                  : item.kind === "signal"
                  ? item.data.company_name
                  : item.data.company_name;
              return (
                <CaseFileCard
                  key={`${item.kind}-${idx}`}
                  item={item}
                  rot={((idx * 7) % 5) + 1}
                  hot={hotNames.has(name.toLowerCase())}
                />
              );
            })}
          </div>
        )}
      </div>

      {profiler.top_targets?.length ? (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-3 text-[10px] tracking-[0.3em] text-[var(--accent-amber)]">
            <span className="h-px flex-1 bg-[var(--accent-amber)]/30" />
            <span>PROFILER DOSSIER · TOP TARGETS</span>
            <span className="h-px flex-1 bg-[var(--accent-amber)]/30" />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {profiler.top_targets.map((t) => (
              <article
                key={t.rank}
                className="relative rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent-amber)] text-[var(--accent-amber)] typewriter text-sm">
                      {t.rank}
                    </span>
                    <h4 className="typewriter text-base tracking-[0.05em]">
                      {t.company_name}
                    </h4>
                  </div>
                  <div className="text-[10px] tracking-[0.2em] text-[var(--accent-amber)]">
                    SCORE {Math.round((t.composite_score || 0) * 10) / 10}
                  </div>
                </div>
                <p className="mt-2 text-[12.5px] text-[var(--text-secondary)]">
                  {t.rationale}
                </p>
                {t.signals?.length ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5 text-[10px] tracking-[0.12em]">
                    {t.signals.slice(0, 4).map((s, i) => (
                      <li
                        key={i}
                        className="rounded-sm border border-[var(--border-subtle)] px-2 py-0.5 text-[var(--text-secondary)]"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {t.action_items?.length ? (
                  <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                    <div className="text-[10px] tracking-[0.22em] text-[var(--text-muted)]">
                      ACTION ITEMS
                    </div>
                    <ul className="mt-1 space-y-1 text-[12px]">
                      {t.action_items.slice(0, 3).map((a, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[var(--accent-amber)]">›</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
