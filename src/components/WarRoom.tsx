"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "./Header";
import CaseInput from "./CaseInput";
import AgentPanel from "./AgentPanel";
import EvidenceBoard from "./EvidenceBoard";
import VoiceBriefing from "./VoiceBriefing";
import LoadingSequence from "./LoadingSequence";
import IntelLoading from "./IntelLoading";
import ProviderToggle, { type Provider } from "./ProviderToggle";
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
  const [lastQuery, setLastQuery] = useState<string>("");
  const [provider, setProvider] = useState<Provider>("novita");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gemma_provider");
      if (saved === "ollama" || saved === "novita") setProvider(saved);
    } catch {}
  }, []);

  const updateProvider = useCallback((p: Provider) => {
    setProvider(p);
    try {
      localStorage.setItem("gemma_provider", p);
    } catch {}
  }, []);

  const handleSubmit = useCallback(async (query: string) => {
    setPhase("deploying");
    setError(null);
    setPayload(null);
    setLastQuery(query);

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
        body: JSON.stringify({ query, provider }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }

      const data: InvestigationPayload = await res.json();
      setPayload(data);
      // Credit downstream contributions: if the dossier agent surfaced a card
      // sourced from funding / YC / signals streams, mark the upstream agent as
      // succeeded. An agent is only "NO MATCHES" when the whole pipeline came
      // back empty of any intel the candidate can act on.
      const dossiers = data.likely_hiring || [];
      const fundingDossiers = dossiers.filter((d) => d.source === "funding").length;
      const ycDossiers = dossiers.filter((d) => d.source === "yc").length;
      const signalDossiers = dossiers.filter((d) => d.source === "gallery").length;
      const anyDossier = dossiers.length > 0;
      const foxhoundCount = data.funding.length + fundingDossiers + ycDossiers;
      const wiretapCount = data.signals.length + signalDossiers;
      const ghostnetCount = data.oss.length;
      const profilerCount = data.profiler.top_targets.length + dossiers.length;
      setStatuses({
        FOXHOUND: foxhoundCount ? "intel_acquired" : "failed",
        WIRETAP: wiretapCount || anyDossier ? "intel_acquired" : "failed",
        GHOSTNET: ghostnetCount || anyDossier ? "intel_acquired" : "failed",
        PROFILER: profilerCount ? "intel_acquired" : "failed",
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
  }, [provider]);

  const findings = useMemo<Partial<Record<AgentCode, number>>>(
    () => {
      if (!payload) return {};
      const dossiers = payload.likely_hiring || [];
      const fundingDossiers = dossiers.filter((d) => d.source === "funding").length;
      const ycDossiers = dossiers.filter((d) => d.source === "yc").length;
      const signalDossiers = dossiers.filter((d) => d.source === "gallery").length;
      return {
        FOXHOUND: payload.funding.length + fundingDossiers + ycDossiers,
        WIRETAP: payload.signals.length + signalDossiers,
        GHOSTNET: payload.oss.length,
        PROFILER: payload.profiler.top_targets.length + dossiers.length,
      };
    },
    [payload]
  );

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header caseNumber={payload?.case_number} status={phase} />

      <main className="relative z-10 mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {phase === "idle" && <IdleHero onPick={handleSubmit} />}

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.35fr]">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
                INTEL MODEL
              </span>
              <ProviderToggle
                value={provider}
                onChange={updateProvider}
                disabled={phase === "deploying"}
              />
            </div>
            <CaseInput onSubmit={handleSubmit} disabled={phase === "deploying"} />

            {phase === "deploying" && <LoadingSequence />}

            {phase === "error" && error ? (
              <div className="rounded-sm border border-[var(--accent-red)] bg-[var(--accent-red)]/10 p-4 text-sm text-[var(--accent-red)]">
                <div className="typewriter mb-1 text-[11px] tracking-[0.3em]">
                  TRANSMISSION FAILURE
                </div>
                <p className="text-[var(--text-primary)]/80">{error}</p>
                {lastQuery ? (
                  <button
                    type="button"
                    onClick={() => handleSubmit(lastQuery)}
                    className="mt-3 inline-flex items-center gap-2 rounded-sm border border-[var(--accent-amber)] bg-[var(--accent-amber)]/10 px-3 py-1.5 text-[10px] tracking-[0.3em] text-[var(--accent-amber)] transition hover:bg-[var(--accent-amber)]/25"
                  >
                    <span>↻ REDEPLOY AGENTS</span>
                  </button>
                ) : null}
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
              <IntelLoading />
            ) : null}
          </div>
        </div>

        <footer className="mt-10 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-5 text-[10px] tracking-[0.3em] text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>INTELMAXXING · OPERATION INNOVATION</span>
          <span>POWERED BY · GEMMA 4 · ELEVENLABS</span>
          <a
            href="https://intelmaxxing.tech"
            className="hover:text-[var(--accent-amber)]"
          >
            INTELMAXXING.TECH
          </a>
        </footer>
      </main>
    </div>
  );
}

const SUGGESTED_MISSIONS: { label: string; query: string }[] = [
  {
    label: "AI INFRA · FOUNDING ENGINEER",
    query: "AI infrastructure startups hiring founding engineers in SF",
  },
  {
    label: "YC W26 · DEV TOOLS",
    query: "YC W26 developer tools startups hiring backend engineers",
  },
  {
    label: "SEED · FINTECH · SERIES A",
    query: "seed and Series A fintech startups hiring founding engineers",
  },
  {
    label: "ML INFRA · OSS HIRING",
    query: "ML infrastructure startups with active open source projects hiring",
  },
];

function IdleHero({ onPick }: { onPick: (q: string) => void }) {
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

      <div className="mt-6">
        <div className="mb-2 flex items-center gap-3 text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
          <span>SUGGESTED MISSIONS · ONE-CLICK DEPLOY</span>
          <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_MISSIONS.map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => onPick(m.query)}
              className="group rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] px-3 py-1.5 text-[10px] tracking-[0.22em] text-[var(--text-secondary)] transition hover:border-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/10 hover:text-[var(--accent-amber)]"
              title={m.query}
            >
              <span className="typewriter">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
