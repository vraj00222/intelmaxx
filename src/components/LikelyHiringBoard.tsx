"use client";

import { useState } from "react";
import type { LikelyHiringDossier, PersonDossier } from "@/lib/agents/types";
import VoiceChip from "./VoiceChip";

/** Wrap a cold email in a short framing line so ElevenLabs narrates it like a
 *  rehearsal, not a generic TTS readout. Keeps it in-universe. */
function rehearsalScript(d: LikelyHiringDossier): string {
  const target = d.ceo?.name || d.cto?.name || "the founder";
  const intro = `Rehearsal transmission. You're pitching ${target} at ${d.company_name}. Subject line: ${d.cold_email_subject}. Message begins.`;
  return `${intro} ${d.cold_email_body}. End rehearsal.`;
}

/** Narrated red-flag warning — Gotham-style "heads-up before you send the email"
 *  moment. Only used when a dossier actually has red-flag chatter. */
function redFlagScript(d: LikelyHiringDossier): string {
  const head = `Advisory on ${d.company_name}. Field intercepts flag potential concerns.`;
  const lines = d.reddit_red_flags
    .slice(0, 3)
    .map((r) => r.headline)
    .join(". ");
  return `${head} ${lines}. Verify independently before engaging.`;
}

type Props = {
  dossiers: LikelyHiringDossier[];
  onOpenCaseFile?: (company: string, domain?: string) => void;
};

export default function LikelyHiringBoard({ dossiers, onOpenCaseFile }: Props) {
  if (!dossiers.length) return null;

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center gap-3 text-[10px] tracking-[0.3em] text-[var(--stamp-red)]">
        <span className="h-px flex-1 bg-[var(--stamp-red)]/40" />
        <span>LIKELY HIRING · FULL DOSSIER · {dossiers.length}</span>
        <span className="h-px flex-1 bg-[var(--stamp-red)]/40" />
      </div>
      <div
        className="corkboard relative overflow-hidden rounded-sm border-2 border-dashed border-[var(--stamp-red)] p-5 sm:p-6"
        style={{
          boxShadow: "inset 0 0 60px rgba(139,26,26,0.12), 0 0 0 1px rgba(139,26,26,0.2)",
        }}
      >
        <div className="pointer-events-none absolute right-3 top-3">
          <span className="stamp text-[10px]">PRIORITY · COLD-EMAIL READY</span>
        </div>
        <p className="mb-4 max-w-2xl font-mono text-[11px] leading-relaxed tracking-[0.1em] text-[var(--text-secondary)]">
          Cross-referenced fresh money, recent YC batches, and active hiring signals.
          CEO/CTO handles surfaced via open-web search. Cold email drafted and ready to copy.
        </p>
        <div className="relative z-10 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {dossiers.map((d, i) => (
            <DossierCard
              key={`${d.company_name}-${i}`}
              d={d}
              onOpenCaseFile={onOpenCaseFile}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DossierCard({
  d,
  onOpenCaseFile,
}: {
  d: LikelyHiringDossier;
  onOpenCaseFile?: (company: string, domain?: string) => void;
}) {
  const [tab, setTab] = useState<"hiring" | "buzz" | "flags">(
    d.reddit_hiring_buzz.length
      ? "hiring"
      : d.reddit_positive.length
      ? "buzz"
      : "flags"
  );
  const [emailOpen, setEmailOpen] = useState(false);

  const sourceColor =
    d.source === "funding"
      ? "var(--accent-amber)"
      : d.source === "yc"
      ? "var(--pin-gold)"
      : "var(--accent-red)";

  return (
    <article
      className="relative flex flex-col gap-3 rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-4 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h4 className="typewriter truncate text-[15px] tracking-[0.04em] text-[var(--text-primary)]">
            {d.company_name}
          </h4>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[9.5px] tracking-[0.18em]">
            <span
              className="rounded-sm border px-1.5 py-0.5"
              style={{ borderColor: sourceColor, color: sourceColor }}
            >
              {d.source_label}
            </span>
            {d.age_years !== undefined ? (
              <span className="text-[var(--text-muted)]">· {d.age_years}y</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenCaseFile ? (
            <button
              type="button"
              onClick={() => onOpenCaseFile(d.company_name, d.domain || undefined)}
              className="rounded-sm border border-[var(--stamp-red)] bg-[var(--stamp-red)]/10 px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.2em] text-[var(--stamp-red)] hover:bg-[var(--stamp-red)]/25"
              title="Open full case file"
            >
              CASE FILE
            </button>
          ) : null}
          {d.url ? (
            <a
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[9.5px] tracking-[0.2em] text-[var(--text-muted)] hover:text-[var(--accent-amber)]"
            >
              SITE ↗
            </a>
          ) : null}
        </div>
      </div>

      <p className="text-[12.5px] leading-snug text-[var(--text-secondary)]">
        {d.one_liner}
      </p>

      {/* People */}
      {(d.ceo || d.cto || d.engineers_linkedin.length) ? (
        <div className="rounded-sm border border-[var(--border-subtle)] bg-black/20 p-2.5">
          <div className="mb-1.5 font-mono text-[9.5px] tracking-[0.22em] text-[var(--text-muted)]">
            PEOPLE
          </div>
          <div className="flex flex-col gap-1.5">
            {d.ceo ? <PersonRow p={d.ceo} domain={d.domain} /> : null}
            {d.cto ? <PersonRow p={d.cto} domain={d.domain} /> : null}
            {d.engineers_linkedin.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="font-mono text-[9.5px] tracking-[0.2em] text-[var(--text-muted)]">
                  ENG ·
                </span>
                {d.engineers_linkedin.slice(0, 4).map((u, i) => (
                  <a
                    key={i}
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-[var(--text-secondary)] hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)]"
                  >
                    in/{u.split("/in/")[1]?.slice(0, 16) || "profile"}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Reddit chatter tabs */}
      {(d.reddit_hiring_buzz.length || d.reddit_positive.length || d.reddit_red_flags.length) ? (
        <div className="rounded-sm border border-[var(--border-subtle)] bg-black/20">
          <div className="flex border-b border-[var(--border-subtle)]">
            {([
              ["hiring", "HIRING BUZZ", d.reddit_hiring_buzz.length, "var(--accent-amber)"],
              ["buzz", "PRODUCT CHATTER", d.reddit_positive.length, "var(--pin-gold)"],
              ["flags", "RED FLAGS", d.reddit_red_flags.length, "var(--accent-red)"],
            ] as const).map(([key, label, n, color]) => (
              <button
                key={key}
                disabled={!n}
                onClick={() => setTab(key)}
                className="flex-1 px-2 py-1.5 font-mono text-[9.5px] tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-30"
                style={{
                  color: tab === key ? color : "var(--text-muted)",
                  borderBottom: tab === key ? `2px solid ${color}` : "2px solid transparent",
                }}
              >
                {label} · {n}
              </button>
            ))}
          </div>
          <div className="max-h-28 overflow-auto p-2.5 text-[11.5px] leading-snug">
            <ChatterList
              items={
                tab === "hiring"
                  ? d.reddit_hiring_buzz
                  : tab === "buzz"
                  ? d.reddit_positive
                  : d.reddit_red_flags
              }
            />
          </div>
          {tab === "flags" && d.reddit_red_flags.length ? (
            <div className="border-t border-[var(--border-subtle)] p-2">
              <VoiceChip
                text={redFlagScript(d)}
                label="RED FLAG BRIEF"
                sublabel={d.company_name}
                variant="warning"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Cold email drawer */}
      <div className="rounded-sm border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/5">
        <button
          onClick={() => setEmailOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left font-mono text-[10px] tracking-[0.22em] text-[var(--accent-amber)]"
        >
          <span>{emailOpen ? "▾" : "▸"} COLD EMAIL · READY</span>
          <span className="opacity-70">{d.ceo?.name || d.cto?.name || "founder"}</span>
        </button>
        {emailOpen ? (
          <div className="border-t border-[var(--accent-amber)]/30 p-3">
            <CopyField label="SUBJECT" value={d.cold_email_subject} mono />
            <CopyField label="BODY" value={d.cold_email_body} area />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <MailtoButton dossier={d} />
              <VoiceChip
                text={rehearsalScript(d)}
                label="REHEARSE PITCH"
                sublabel={d.company_name}
                variant="rehearse"
              />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PersonRow({ p, domain }: { p: PersonDossier; domain: string | null }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="w-9 shrink-0 font-mono text-[9.5px] tracking-[0.22em] text-[var(--text-muted)]">
        {p.title}
      </span>
      <span className="truncate text-[var(--text-primary)]">{p.name || "(unresolved)"}</span>
      <span className="ml-auto flex items-center gap-1.5">
        {p.x_url ? (
          <a
            href={p.x_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-[var(--text-secondary)] hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)]"
          >
            X ↗
          </a>
        ) : null}
        {p.linkedin_url ? (
          <a
            href={p.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-[var(--text-secondary)] hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)]"
          >
            IN ↗
          </a>
        ) : null}
        {p.email_patterns.length ? (
          <EmailChip patterns={p.email_patterns} />
        ) : domain ? (
          <EmailChip patterns={[`hello@${domain}`, `founders@${domain}`]} />
        ) : null}
      </span>
    </div>
  );
}

function EmailChip({ patterns }: { patterns: string[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(v);
      setTimeout(() => setCopied(null), 1200);
    } catch {}
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-sm border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-[var(--text-secondary)] hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)]"
      >
        ✉ EMAIL
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-60 rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-2 shadow-lg">
          <div className="mb-1 font-mono text-[9.5px] tracking-[0.22em] text-[var(--text-muted)]">
            LIKELY PATTERNS · UNVERIFIED
          </div>
          <ul className="flex flex-col gap-1">
            {patterns.map((p) => (
              <li key={p} className="flex items-center gap-1.5 text-[11.5px]">
                <code className="flex-1 truncate text-[var(--text-primary)]">{p}</code>
                <button
                  onClick={() => copy(p)}
                  className="rounded-sm border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em] text-[var(--text-muted)] hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)]"
                >
                  {copied === p ? "✓" : "COPY"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CopyField({
  label,
  value,
  mono,
  area,
}: {
  label: string;
  value: string;
  mono?: boolean;
  area?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[9.5px] tracking-[0.22em] text-[var(--text-muted)]">
          {label}
        </span>
        <button
          onClick={copy}
          className="rounded-sm border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[9px] tracking-[0.16em] text-[var(--text-muted)] hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)]"
        >
          {copied ? "✓ COPIED" : "COPY"}
        </button>
      </div>
      {area ? (
        <pre className="whitespace-pre-wrap rounded-sm border border-[var(--border-subtle)] bg-black/30 p-2 text-[11.5px] leading-snug text-[var(--text-primary)]/90">
          {value}
        </pre>
      ) : (
        <div
          className={`rounded-sm border border-[var(--border-subtle)] bg-black/30 p-2 ${
            mono ? "font-mono" : ""
          } text-[12px] text-[var(--text-primary)]/95`}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function MailtoButton({ dossier }: { dossier: LikelyHiringDossier }) {
  const firstEmail =
    dossier.ceo?.email_patterns[0] ||
    dossier.cto?.email_patterns[0] ||
    (dossier.domain ? `hello@${dossier.domain}` : "");
  if (!firstEmail) return null;
  const href = `mailto:${encodeURIComponent(firstEmail)}?subject=${encodeURIComponent(
    dossier.cold_email_subject
  )}&body=${encodeURIComponent(dossier.cold_email_body)}`;
  return (
    <a
      href={href}
      className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-[var(--accent-amber)] bg-[var(--accent-amber)]/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/20"
    >
      ✉ OPEN IN MAIL · {firstEmail}
    </a>
  );
}

function ChatterList({ items }: { items: { headline: string; excerpt?: string; subreddit: string; permalink: string; score: number; matched?: string }[] }) {
  if (!items.length) {
    return <div className="text-[var(--text-muted)]">No chatter surfaced.</div>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((x, i) => (
        <li key={i} className="flex flex-col gap-0.5">
          <a
            href={x.permalink}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--text-primary)]/90 hover:text-[var(--accent-amber)]"
          >
            {x.headline}
          </a>
          <div className="font-mono text-[9.5px] tracking-[0.15em] text-[var(--text-muted)]">
            r/{x.subreddit} · ↑{x.score}
            {x.matched ? ` · ${x.matched}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}
