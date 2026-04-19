"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "./Header";
import CaseInput from "./CaseInput";
import AgentPanel from "./AgentPanel";
import EvidenceBoard from "./EvidenceBoard";
import VoiceBriefing from "./VoiceBriefing";
import LoadingSequence from "./LoadingSequence";
import IntelLoading from "./IntelLoading";
import CaseFileDrawer from "./CaseFileDrawer";
import ProviderToggle, { type Provider } from "./ProviderToggle";
import type {
  AgentCode,
  AgentStatus,
  CaseFilePayload,
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
  // Quick-deploy chips drop their text into CaseInput rather than auto-submitting,
  // so the user sees the brief before hitting deploy. Nonce forces a re-run of
  // CaseInput's effect even if the same chip is clicked twice.
  const [prefillValue, setPrefillValue] = useState<string>("");
  const [prefillNonce, setPrefillNonce] = useState<number>(0);
  const prefillBrief = useCallback((q: string) => {
    setPrefillValue(q);
    setPrefillNonce((n) => n + 1);
  }, []);

  // Case-file drawer state — independent of the main mission pipeline.
  const [caseFileOpen, setCaseFileOpen] = useState(false);
  const [caseFileCompany, setCaseFileCompany] = useState<string | null>(null);
  const [caseFilePayload, setCaseFilePayload] = useState<CaseFilePayload | null>(null);
  const [caseFileLoading, setCaseFileLoading] = useState(false);
  const [caseFileError, setCaseFileError] = useState<string | null>(null);

  const openCaseFile = useCallback(async (company: string, domain?: string) => {
    const name = company.trim();
    if (!name) return;
    setCaseFileOpen(true);
    setCaseFileCompany(name);
    setCaseFilePayload(null);
    setCaseFileError(null);
    setCaseFileLoading(true);
    try {
      const res = await fetch("/api/casefile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: name, domain }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Case file failed: ${res.status}`);
      }
      const data: CaseFilePayload = await res.json();
      setCaseFilePayload(data);
    } catch (e) {
      setCaseFileError(e instanceof Error ? e.message : "Case file failed");
    } finally {
      setCaseFileLoading(false);
    }
  }, []);

  const closeCaseFile = useCallback(() => {
    setCaseFileOpen(false);
  }, []);

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
    // Slash-command shortcut: "/case Acme Corp" opens a case file instead of
    // running the full agent pipeline. Handy as a judge-mode power move.
    const caseMatch = /^\/case(?:file)?\s+(.+)$/i.exec(query.trim());
    if (caseMatch) {
      openCaseFile(caseMatch[1].trim());
      return;
    }

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
        {phase === "idle" && <IdleHero onPick={prefillBrief} />}

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
            <CaseInput
              onSubmit={handleSubmit}
              disabled={phase === "deploying"}
              prefillValue={prefillValue}
              prefillNonce={prefillNonce}
            />

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
              <EvidenceBoard payload={payload} onOpenCaseFile={openCaseFile} />
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

      <CaseFileDrawer
        open={caseFileOpen}
        company={caseFileCompany}
        payload={caseFilePayload}
        loading={caseFileLoading}
        error={caseFileError}
        onClose={closeCaseFile}
      />
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
    <section className="mb-6">
      <h1 className="typewriter text-[clamp(28px,4.4vw,52px)] leading-[1.05] text-[var(--text-primary)]">
        Palantir Gotham, but for your career.
      </h1>
      <p className="mt-3 max-w-2xl font-mono text-[13px] leading-relaxed text-[var(--text-secondary)]">
        Four agents deploy in parallel. Funding intel, hiring signals,
        open-source backdoors, ranked dossier. Every lead off-grid —{" "}
        <span className="text-[var(--stamp-red)]">never LinkedIn</span>.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--accent-amber)]/50 bg-[var(--accent-amber)]/10 px-2 py-1 font-mono text-[10px] tracking-[0.22em] text-[var(--accent-amber)]">
          <span className="text-[var(--text-muted)]">TIP</span>
          <span>·</span>
          <code className="text-[var(--accent-amber)]">/case &lt;company&gt;</code>
        </span>
        {SUGGESTED_MISSIONS.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => onPick(m.query)}
            className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] text-[var(--text-secondary)] transition hover:border-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/10 hover:text-[var(--accent-amber)]"
            title={m.query}
          >
            {m.label}
          </button>
        ))}
      </div>
    </section>
  );
}
