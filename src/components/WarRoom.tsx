"use client";

import { useCallback, useMemo, useState } from "react";
import Header from "./Header";
import CaseInput from "./CaseInput";
import AgentPanel from "./AgentPanel";
import EvidenceBoard from "./EvidenceBoard";
import VoiceBriefing from "./VoiceBriefing";
import LoadingSequence from "./LoadingSequence";
import type {
  AgentCode,
  AgentStatus,
  InvestigationPayload,
} from "@/lib/agents/types";

const INITIAL_STATUS: Record<AgentCode, AgentStatus> = {
  FOXHOUND: "standby",
  WIRETAP: "standby",
  GHOSTNET: "standby",
  PROFILER: "standby",
};

export default function WarRoom() {
  const [phase, setPhase] = useState<"idle" | "deploying" | "complete" | "error">(
    "idle"
  );
  const [statuses, setStatuses] = useState<Record<AgentCode, AgentStatus>>(
    INITIAL_STATUS
  );
  const [payload, setPayload] = useState<InvestigationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (query: string) => {
    setPhase("deploying");
    setError(null);
    setPayload(null);

    // Optimistic staged animation of agent deployment
    setStatuses({
      FOXHOUND: "deployed",
      WIRETAP: "standby",
      GHOSTNET: "standby",
      PROFILER: "standby",
    });
    setTimeout(
      () =>
        setStatuses({
          FOXHOUND: "investigating",
          WIRETAP: "deployed",
          GHOSTNET: "standby",
          PROFILER: "standby",
        }),
      500
    );
    setTimeout(
      () =>
        setStatuses({
          FOXHOUND: "investigating",
          WIRETAP: "investigating",
          GHOSTNET: "deployed",
          PROFILER: "standby",
        }),
      1000
    );
    setTimeout(
      () =>
        setStatuses({
          FOXHOUND: "investigating",
          WIRETAP: "investigating",
          GHOSTNET: "investigating",
          PROFILER: "deployed",
        }),
      1500
    );

    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }

      const data: InvestigationPayload = await res.json();
      setPayload(data);
      setStatuses({
        FOXHOUND: data.funding.length ? "intel_acquired" : "failed",
        WIRETAP: data.signals.length ? "intel_acquired" : "failed",
        GHOSTNET: data.oss.length ? "intel_acquired" : "failed",
        PROFILER: data.profiler.top_targets.length ? "intel_acquired" : "failed",
      });
      setPhase("complete");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Investigation failed");
      setStatuses({
        FOXHOUND: "failed",
        WIRETAP: "failed",
        GHOSTNET: "failed",
        PROFILER: "failed",
      });
      setPhase("error");
    }
  }, []);

  const findings = useMemo<Partial<Record<AgentCode, number>>>(
    () =>
      payload
        ? {
            FOXHOUND: payload.funding.length,
            WIRETAP: payload.signals.length,
            GHOSTNET: payload.oss.length,
            PROFILER: payload.profiler.top_targets.length,
          }
        : {},
    [payload]
  );

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header caseNumber={payload?.case_number} status={phase} />

      <main className="relative z-10 mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {phase === "idle" && <IdleHero />}

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.35fr]">
          <div className="space-y-6">
            <CaseInput onSubmit={handleSubmit} disabled={phase === "deploying"} />

            {phase === "deploying" && <LoadingSequence />}

            {phase === "error" && error ? (
              <div className="rounded-sm border border-[var(--accent-red)] bg-[var(--accent-red)]/10 p-4 text-sm text-[var(--accent-red)]">
                <div className="typewriter mb-1 text-[11px] tracking-[0.3em]">
                  TRANSMISSION FAILURE
                </div>
                <p className="text-[var(--text-primary)]/80">{error}</p>
              </div>
            ) : null}

            {payload ? (
              <VoiceBriefing
                briefingText={payload.profiler.intel_briefing_text}
                voiceHook={payload.profiler.intel_briefing_voice}
                caseNumber={payload.case_number}
              />
            ) : null}
          </div>

          <div className="space-y-6">
            <AgentPanel statuses={statuses} findings={findings} />

            {payload ? (
              <EvidenceBoard payload={payload} />
            ) : phase === "deploying" ? (
              <div className="corkboard rounded-sm border border-black/40 p-10 text-center opacity-80">
                <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[var(--pin-gold)] border-t-transparent" />
                <p className="typewriter text-sm text-[var(--text-primary)]/90">
                  Pinning evidence to the board...
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="mt-10 border-t border-[var(--border-subtle)] pt-5 text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>INTELMAXXING · OPERATION INNOVATION</span>
            <span>POWERED BY · GEMMA 4 · ELEVENLABS</span>
            <a
              href="https://intelmaxxing.tech"
              className="hover:text-[var(--accent-amber)]"
            >
              INTELMAXXING.TECH
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 border-t border-[var(--border-subtle)]/60 text-[9.5px] tracking-[0.22em]">
            <span className="text-[var(--text-secondary)]">DATA SOURCES</span>
            <span className="opacity-40">|</span>
            <a href="https://news.ycombinator.com" target="_blank" rel="noreferrer" className="hover:text-[var(--accent-amber)]">HACKER NEWS</a>
            <a href="https://remoteok.com" target="_blank" rel="noreferrer" className="hover:text-[var(--accent-amber)]">REMOTEOK</a>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-[var(--accent-amber)]">GITHUB</a>
            <a href="https://startups.gallery" target="_blank" rel="noreferrer" className="hover:text-[var(--accent-amber)]">STARTUPS.GALLERY</a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function IdleHero() {
  return (
    <section className="mb-8">
      <div className="inline-flex items-center gap-2 rounded-sm border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 px-3 py-1 text-[10px] tracking-[0.3em] text-[var(--accent-amber)]">
        <span className="pulse-dot" style={{ background: "var(--accent-amber)", color: "var(--accent-amber)" }} />
        <span>DISPATCH READY · 4 AGENTS ONLINE</span>
      </div>
      <h1 className="mt-4 typewriter text-[clamp(28px,4.6vw,54px)] leading-[1.05] text-[var(--text-primary)]">
        Palantir Gotham, but for your career.
      </h1>
      <p className="mt-3 max-w-2xl font-mono text-[14px] leading-relaxed text-[var(--text-secondary)]">
        Describe the mission. Four AI agents —{" "}
        <em className="not-italic text-[var(--text-primary)]">FOXHOUND</em>,{" "}
        <em className="not-italic text-[var(--text-primary)]">WIRETAP</em>,{" "}
        <em className="not-italic text-[var(--text-primary)]">GHOSTNET</em>, and{" "}
        <em className="not-italic text-[var(--text-primary)]">PROFILER</em>{" "}
        — deploy in parallel and return with funding intel, hiring signals, open-source backdoors, and a ranked dossier.
        Voice briefing narrated in noir detective style.
      </p>
      <div className="mt-4 inline-flex items-center gap-3 border-2 border-dashed border-[var(--stamp-red)] bg-[var(--stamp-red)]/10 px-3 py-1.5 text-[11px] tracking-[0.25em] text-[var(--stamp-red)]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2 3 7v6c0 5 4 9 9 9s9-4 9-9V7l-9-5zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6z" />
        </svg>
        <span>EVERY LEAD · OFF-GRID · NOT ON LINKEDIN</span>
      </div>
    </section>
  );
}
