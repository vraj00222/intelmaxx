"use client";

import type { FundingIntel, HiringSignal, OSSIntel } from "@/lib/agents/types";

type CaseItem =
  | { kind: "funding"; data: FundingIntel }
  | { kind: "signal"; data: HiringSignal }
  | { kind: "oss"; data: OSSIntel };

type Props = {
  item: CaseItem;
  rot?: number; // 1..5
  hot?: boolean;
};

const ROT = ["rot-1", "rot-2", "rot-3", "rot-4", "rot-5"];

export default function CaseFileCard({ item, rot = 1, hot }: Props) {
  const rotClass = ROT[(rot - 1) % ROT.length];

  if (item.kind === "funding") {
    const f = item.data;
    return (
      <Shell rotClass={rotClass} hot={hot} codename="FOXHOUND" accent="var(--accent-amber)">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] tracking-[0.2em] opacity-60">FUNDING INTEL</div>
            <h3 className="mt-0.5 typewriter text-lg leading-tight">
              {f.company_name}
            </h3>
          </div>
          <ScoreBadge score={f.relevance_score} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] tracking-[0.12em] uppercase">
          <Chip>{f.funding_stage}</Chip>
          <Chip emphasis>{f.funding_amount}</Chip>
          {f.industry && <Chip muted>{f.industry}</Chip>}
          <Chip offgrid>OFF-GRID</Chip>
        </div>

        <p className="mt-3 text-[13px] leading-snug">{f.one_liner}</p>

        {f.investors?.length ? (
          <div className="mt-3 text-[11px] opacity-80">
            <span className="opacity-60">Investors: </span>
            {f.investors.slice(0, 4).join(" · ")}
          </div>
        ) : null}

        <Footer url={f.url} date={f.date} />
      </Shell>
    );
  }

  if (item.kind === "signal") {
    const s = item.data;
    return (
      <Shell rotClass={rotClass} hot={hot} codename="WIRETAP" accent="var(--accent-red)">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] tracking-[0.2em] opacity-60">HIRING SIGNAL</div>
            <h3 className="mt-0.5 typewriter text-lg leading-tight">{s.company_name}</h3>
          </div>
          <Chip emphasis>{s.confidence.toUpperCase()}</Chip>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] tracking-[0.12em] uppercase">
          <Chip>{s.signal_type.replace("_", " ")}</Chip>
          <Chip muted>{s.urgency}</Chip>
          <Chip offgrid>NOT ON LINKEDIN</Chip>
        </div>

        <p className="mt-3 border-l-2 border-black/20 pl-3 text-[12.5px] italic leading-snug">
          “{s.signal_text}”
        </p>

        {s.role_hints?.length ? (
          <div className="mt-3 text-[11px]">
            <span className="opacity-60">Likely roles: </span>
            {s.role_hints.slice(0, 4).join(" · ")}
          </div>
        ) : null}

        <Footer url={s.source_url} />
      </Shell>
    );
  }

  const o = item.data;
  return (
    <Shell rotClass={rotClass} hot={hot} codename="GHOSTNET" accent="var(--accent-green)">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] tracking-[0.2em] opacity-60">OSS BACKDOOR</div>
          <h3 className="mt-0.5 typewriter text-lg leading-tight">{o.company_name}</h3>
        </div>
        <Chip emphasis>★ {o.stars.toLocaleString()}</Chip>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] tracking-[0.12em] uppercase">
        <Chip>{o.good_first_issues_count} GFI</Chip>
        {o.has_contributing_guide && <Chip>CONTRIB GUIDE</Chip>}
        <Chip muted>HIRE CORR · {o.oss_hiring_correlation}</Chip>
        <Chip offgrid>BACKDOOR</Chip>
      </div>

      <p className="mt-3 text-[13px] leading-snug">
        <span className="opacity-60">Entry strategy: </span>
        {o.entry_strategy}
      </p>

      <Footer url={o.repo_url} />
    </Shell>
  );
}

function Shell({
  children,
  rotClass,
  hot,
  codename,
  accent,
}: {
  children: React.ReactNode;
  rotClass: string;
  hot?: boolean;
  codename: string;
  accent: string;
}) {
  return (
    <div className={`relative ${rotClass} transition hover:!rotate-0 hover:scale-[1.02]`}>
      <div className="pin" />
      <div
        className="paper relative w-full overflow-hidden rounded-[2px] p-5"
        style={{
          boxShadow: "var(--shadow-paper)",
          borderLeft: `3px solid ${accent}`,
          minHeight: 200,
        }}
      >
        <div className="pointer-events-none absolute -right-3 -top-3 h-12 w-12 rotate-[18deg] rounded-full bg-amber-900/5 blur-md" />

        <div className="mb-2 flex items-center justify-between text-[9px] tracking-[0.3em] opacity-60">
          <span>AGENT: {codename}</span>
          <span>FILE · {Math.floor(Math.random() * 999)}</span>
        </div>

        {hot ? (
          <div className="pointer-events-none absolute right-2 top-8">
            <span className="stamp text-[11px]">HOT LEAD</span>
          </div>
        ) : null}

        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const s = Math.max(0, Math.min(10, score || 0));
  return (
    <div
      className="flex h-10 w-10 flex-col items-center justify-center rounded-full border border-black/30 text-center"
      style={{ background: "rgba(139,26,26,0.1)" }}
    >
      <span className="typewriter text-[14px] leading-none">{s}</span>
      <span className="text-[7px] tracking-[0.15em] opacity-70">RLV</span>
    </div>
  );
}

function Chip({
  children,
  emphasis,
  muted,
  offgrid,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
  muted?: boolean;
  offgrid?: boolean;
}) {
  if (offgrid) {
    return (
      <span
        className="rounded-sm border-2 border-dashed px-2 py-0.5 font-semibold"
        style={{
          borderColor: "var(--stamp-red)",
          color: "var(--stamp-red)",
          background: "rgba(139,26,26,0.08)",
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 ${
        emphasis
          ? "border-black/40 bg-black/10 text-black"
          : muted
          ? "border-black/20 text-black/60"
          : "border-black/25 text-black/80"
      }`}
    >
      {children}
    </span>
  );
}

function Footer({ url, date }: { url?: string; date?: string }) {
  if (!url) return null;
  return (
    <div className="mt-4 flex items-center justify-between border-t border-black/15 pt-3 text-[10px] tracking-[0.14em] uppercase">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="group inline-flex items-center gap-1 text-black/70 hover:text-black"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 17 17 7M7 7h10v10" />
        </svg>
        Open Source
      </a>
      {date ? (
        <span className="text-black/50">{new Date(date).toLocaleDateString()}</span>
      ) : null}
    </div>
  );
}
