"use client";

import { useEffect, useState } from "react";
import type { CaseFilePayload } from "@/lib/agents/types";
import VoiceChip from "./VoiceChip";

type Props = {
  open: boolean;
  company: string | null;
  payload: CaseFilePayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

/**
 * Manila-folder reveal for a single-company case file. Three animation phases
 * driven by CSS classes: `cf-enter` (slide/fade in) → `cf-flap` (tab peels
 * back) → `cf-contents` (staggered rows fade up). The backend returns the full
 * payload in one shot; we only animate the presentation.
 */
export default function CaseFileDrawer({
  open,
  company,
  payload,
  loading,
  error,
  onClose,
}: Props) {
  // One flag: `armed` triggers the opening animation. Staged sub-timings are
  // handled by CSS animation-delay so React doesn't need to babysit them.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!open) {
      setArmed(false);
      return;
    }
    // Next tick so the initial "closed" state paints at least one frame before
    // the class flips — ensures the flip animation always plays from the top.
    const raf = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`casefile-folder relative w-[min(1100px,96vw)] max-h-[92vh] rounded-md border-2 border-[var(--stamp-red)] bg-[#e4d8b3] text-[#1a1714] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] ${
          armed ? "cf-open" : ""
        }`}
        style={{ transformOrigin: "top center" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Folder tab — always visible, doesn't flip */}
        <div className="casefile-tab relative z-10 flex items-center justify-between gap-4 border-b-2 border-[var(--stamp-red)] bg-[#d8c995] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] tracking-[0.28em] text-[var(--stamp-red)]">
              CASE FILE ·
            </span>
            <span className="typewriter text-[15px] tracking-[0.06em] text-[#1a1714]">
              {company || "…"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm border border-[var(--stamp-red)] bg-[var(--stamp-red)]/15 px-2.5 py-1 font-mono text-[10px] tracking-[0.25em] text-[var(--stamp-red)] hover:bg-[var(--stamp-red)]/30"
          >
            ✕ CLOSE
          </button>
        </div>

        {/* The flippable top cover — sits over the body, peels back on open */}
        <div className="casefile-cover pointer-events-none absolute left-0 right-0 top-[54px] bottom-0 overflow-hidden rounded-b-md">
          <div className="casefile-cover-face absolute inset-0 flex items-center justify-center">
            <div className="casefile-cover-texture absolute inset-0" />
            <div className="casefile-cover-scanlines absolute inset-0" />
            <div className="relative z-10 flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-3">
                <span className="inline-block h-[2px] w-10 bg-[var(--stamp-red)]" />
                <span className="font-mono text-[10px] tracking-[0.4em] text-[var(--stamp-red)]/80">
                  CONFIDENTIAL
                </span>
                <span className="inline-block h-[2px] w-10 bg-[var(--stamp-red)]" />
              </div>
              <div className="casefile-stamp border-4 border-[var(--stamp-red)]/80 px-4 py-1.5 text-[22px] tracking-[0.25em] text-[var(--stamp-red)]">
                CLASSIFIED
              </div>
              <div className="font-mono text-[10px] tracking-[0.3em] text-[#6b5a30]">
                {company || "—"}
              </div>
              <div className="mt-1 font-mono text-[9.5px] tracking-[0.25em] text-[#8a7a4a]">
                FOR AUTHORIZED OPERATIVES ONLY
              </div>
            </div>
            <div className="casefile-tape absolute left-1/2 top-0 -translate-x-1/2" />
          </div>
        </div>

        <div className="casefile-body relative z-0 overflow-y-auto max-h-[calc(92vh-56px)] p-6">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} />
          ) : payload ? (
            <Body payload={payload} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 font-mono text-[12px] tracking-[0.25em] text-[var(--stamp-red)]">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span>ASSEMBLING FILE · PULLING GITHUB · CROSS-REFERENCING REDDIT</span>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="rounded-sm border-2 border-dashed border-[var(--stamp-red)] bg-[var(--stamp-red)]/10 p-6 font-mono text-[13px] text-[var(--stamp-red)]">
      <div className="mb-2 tracking-[0.25em]">FILE CORRUPTED</div>
      <p className="text-[#1a1714]">{error}</p>
    </div>
  );
}

function Body({ payload }: { payload: CaseFilePayload }) {
  const s = payload.summary;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-dashed border-[#1a1714]/30 pb-4">
        <div>
          <h2 className="typewriter text-[26px] leading-tight">{s.company_name}</h2>
          {s.one_liner ? (
            <p className="mt-1 max-w-3xl text-[14px] leading-snug">{s.one_liner}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-[#1a1714]/75">
            {s.yc_batch ? <Badge color="gold">YC · {s.yc_batch}</Badge> : null}
            {s.team_size ? <Badge>TEAM · {s.team_size}</Badge> : null}
            {s.location ? <Badge>{s.location.toUpperCase()}</Badge> : null}
            {s.domain ? <Badge color="red">{s.domain}</Badge> : null}
            {payload.case_number ? <Badge>{payload.case_number}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <VoiceChip
            text={payload.briefing_text}
            label="PLAY CASE BRIEFING"
            sublabel={s.company_name}
            variant="moat"
          />
          <div className="flex flex-wrap justify-end gap-1.5 font-mono text-[10px]">
            {s.homepage_url ? <LinkPill href={s.homepage_url}>SITE ↗</LinkPill> : null}
            {s.github_url ? <LinkPill href={s.github_url}>GITHUB ↗</LinkPill> : null}
            {s.twitter_url ? <LinkPill href={s.twitter_url}>X ↗</LinkPill> : null}
            {s.gallery_url ? <LinkPill href={s.gallery_url}>GALLERY ↗</LinkPill> : null}
          </div>
        </div>
      </header>

      {/* Tags */}
      {s.tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {s.tags.map((t) => (
            <span
              key={t}
              className="rounded-sm border border-[#1a1714]/30 bg-[#c8bb86] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em]"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {/* Founders */}
      {payload.founders.length ? (
        <Section title="LEADERSHIP">
          <div className="grid gap-3 sm:grid-cols-2">
            {payload.founders.map((f, i) => (
              <div
                key={i}
                className="rounded-sm border border-[#1a1714]/30 bg-[#ede3bd] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.25em] text-[var(--stamp-red)]">
                    {f.title}
                  </span>
                  <div className="flex gap-1.5">
                    {f.x_url ? <LinkPill href={f.x_url}>X</LinkPill> : null}
                    {f.linkedin_url ? <LinkPill href={f.linkedin_url}>IN</LinkPill> : null}
                  </div>
                </div>
                <div className="mt-1 typewriter text-[15px]">
                  {f.name || "(unresolved)"}
                </div>
                {f.email_patterns.length ? (
                  <div className="mt-1 font-mono text-[10px] text-[#1a1714]/70">
                    {f.email_patterns.slice(0, 2).join(" · ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Employees (GitHub contributors) */}
      {payload.employees.length ? (
        <Section title={`ENGINEERS · ${payload.employees.length}`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {payload.employees.map((e) => (
              <EmployeeCard key={e.login} e={e} />
            ))}
          </div>
        </Section>
      ) : (
        <Section title="ENGINEERS">
          <Empty
            msg={
              payload.summary.github_org
                ? `Located on GitHub as @${payload.summary.github_org}, but the top repos have no public contributor roster yet.`
                : "No public GitHub org surfaced for this company. Likely private or operating under a different handle."
            }
          />
        </Section>
      )}

      {/* Repos */}
      {payload.repos.length ? (
        <Section title="TOP REPOSITORIES">
          <div className="grid gap-2 sm:grid-cols-2">
            {payload.repos.map((r) => (
              <a
                key={r.full_name}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm border border-[#1a1714]/30 bg-[#ede3bd] p-2.5 hover:border-[var(--stamp-red)]"
              >
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="truncate text-[#1a1714]">{r.full_name}</span>
                  <span className="tracking-[0.2em] text-[var(--stamp-red)]">
                    ★ {r.stars.toLocaleString()}
                  </span>
                </div>
                {r.description ? (
                  <p className="mt-1 text-[12px] leading-snug text-[#1a1714]/80">
                    {r.description}
                  </p>
                ) : null}
                <div className="mt-1 font-mono text-[9.5px] tracking-[0.15em] text-[#1a1714]/60">
                  {r.language || "mixed"} · pushed{" "}
                  {new Date(r.pushed_at).toISOString().slice(0, 10)}
                </div>
              </a>
            ))}
          </div>
        </Section>
      ) : null}

      {/* HN + funding */}
      {payload.hn_launches.length || payload.funding_mentions.length ? (
        <Section title="NEWS · HN">
          <ul className="space-y-1.5">
            {[...payload.hn_launches, ...payload.funding_mentions].slice(0, 10).map((h, i) => (
              <li key={i}>
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-sm border border-[#1a1714]/20 bg-[#ede3bd] px-3 py-1.5 text-[12.5px] hover:border-[var(--stamp-red)]"
                >
                  {h.headline}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Reddit red flags */}
      {payload.reddit_chatter.red_flags.length ? (
        <Section title="RED FLAGS · REDDIT">
          <ul className="space-y-1.5">
            {payload.reddit_chatter.red_flags.map((r, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <a
                  href={r.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] text-[var(--stamp-red)] hover:underline"
                >
                  {r.headline}
                </a>
                <span className="font-mono text-[9.5px] tracking-[0.15em] text-[#1a1714]/60">
                  r/{r.subreddit} · ↑{r.score}
                  {r.matched ? ` · ${r.matched}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Source footer */}
      <footer className="flex flex-wrap items-center gap-2 border-t-2 border-dashed border-[#1a1714]/30 pt-3 font-mono text-[9.5px] tracking-[0.2em] text-[#1a1714]/60">
        <span>SOURCES ·</span>
        {Object.entries(payload.sources).map(([k, v]) => (
          <span
            key={k}
            className={v ? "text-[#2f6a22]" : "text-[#1a1714]/40 line-through"}
          >
            {k.toUpperCase()}
          </span>
        ))}
        <span className="ml-auto">ASSEMBLED IN {payload.elapsed_ms}MS</span>
      </footer>
    </div>
  );
}

function EmployeeCard({ e }: { e: import("@/lib/agents/types").CaseFileEmployee }) {
  return (
    <div className="flex gap-2.5 rounded-sm border border-[#1a1714]/30 bg-[#ede3bd] p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={e.avatar_url}
        alt={e.login}
        width={44}
        height={44}
        className="h-11 w-11 shrink-0 rounded-sm border border-[#1a1714]/30"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="typewriter truncate text-[13px]">
            {e.name || e.login}
          </span>
          {e.role_hint ? (
            <span className="rounded-sm border border-[var(--stamp-red)] px-1 py-[1px] font-mono text-[8.5px] tracking-[0.18em] text-[var(--stamp-red)]">
              {e.role_hint.toUpperCase()}
            </span>
          ) : null}
        </div>
        {e.bio ? (
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[#1a1714]/80">
            {e.bio}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-1 font-mono text-[9.5px]">
          <LinkPill href={e.github_url}>GH</LinkPill>
          {e.x_url ? <LinkPill href={e.x_url}>X</LinkPill> : null}
          {e.linkedin_search_url ? (
            <LinkPill href={e.linkedin_search_url}>IN?</LinkPill>
          ) : null}
          {e.blog ? (
            <LinkPill
              href={e.blog.startsWith("http") ? e.blog : `https://${e.blog}`}
            >
              SITE
            </LinkPill>
          ) : null}
          <span className="rounded-sm border border-[#1a1714]/30 px-1.5 py-[1px] tracking-[0.1em] text-[#1a1714]/70">
            {e.contributions} commits
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-[var(--stamp-red)]">
        <span>{title}</span>
        <span className="h-px flex-1 bg-[var(--stamp-red)]/30" />
      </div>
      {children}
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-sm border border-dashed border-[#1a1714]/30 bg-[#ede3bd]/50 p-3 font-mono text-[11px] text-[#1a1714]/60">
      {msg}
    </div>
  );
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: "red" | "gold";
}) {
  const palette =
    color === "red"
      ? "border-[var(--stamp-red)] text-[var(--stamp-red)]"
      : color === "gold"
      ? "border-[#a8801b] text-[#6b5010] bg-[#e6d596]"
      : "border-[#1a1714]/40 text-[#1a1714]/75";
  return (
    <span className={`rounded-sm border px-2 py-0.5 tracking-[0.15em] ${palette}`}>
      {children}
    </span>
  );
}

function LinkPill({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-sm border border-[#1a1714]/40 px-1.5 py-[1px] tracking-[0.12em] text-[#1a1714]/80 hover:border-[var(--stamp-red)] hover:text-[var(--stamp-red)]"
    >
      {children}
    </a>
  );
}
