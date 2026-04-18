"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  briefingText: string;
  voiceHook?: string;
  caseNumber?: string | null;
};

type Phase = "idle" | "loading" | "ready" | "playing" | "error";

export default function VoiceBriefing({ briefingText, voiceHook, caseNumber }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"short" | "long">("short");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Reset when briefing text changes (new investigation)
  useEffect(() => {
    setAudioUrl(null);
    setPhase("idle");
    setElapsed(0);
    setDuration(0);
    setErrorMsg(null);
  }, [briefingText, mode]);

  async function fetchAudio() {
    const textToSpeak =
      mode === "short" && voiceHook ? voiceHook : briefingText;
    if (!textToSpeak) return;
    setPhase("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Briefing request failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setPhase("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  }

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const togglePlay = async () => {
    if (!audioUrl) {
      await fetchAudio();
      // after fetch, don't auto-play — user may have navigated
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      await a.play();
      setPhase("playing");
    } else {
      a.pause();
      setPhase("ready");
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-3 text-[10px] tracking-[0.3em] text-[var(--text-muted)]">
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span>INTEL BRIEFING · AUDIO DEBRIEF</span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>

      {voiceHook ? (
        <div className="mb-2 flex items-center gap-1 text-[10px] tracking-[0.22em]">
          <button
            type="button"
            onClick={() => setMode("short")}
            className={`rounded-sm border px-2 py-1 transition ${
              mode === "short"
                ? "border-[var(--accent-amber)] bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]"
                : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent-amber)]"
            }`}
          >
            ⚡ SPY HOOK · 15s
          </button>
          <button
            type="button"
            onClick={() => setMode("long")}
            className={`rounded-sm border px-2 py-1 transition ${
              mode === "long"
                ? "border-[var(--accent-amber)] bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]"
                : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent-amber)]"
            }`}
          >
            🎙 FULL DEBRIEF
          </button>
        </div>
      ) : null}

      <div className="hud-corners relative overflow-hidden rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <button
            type="button"
            onClick={togglePlay}
            disabled={phase === "loading"}
            className="group relative flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent-amber)] bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] transition hover:bg-[var(--accent-amber)]/25 disabled:opacity-50"
            aria-label="Play intel briefing"
          >
            {phase === "loading" ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-amber)] border-t-transparent" />
            ) : phase === "playing" ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                boxShadow: phase === "playing" ? "0 0 40px rgba(229,142,38,0.45)" : "none",
              }}
            />
          </button>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-[0.22em] text-[var(--text-muted)]">
              <span>VOICE · ELEVENLABS</span>
              {caseNumber && <span className="opacity-50">|</span>}
              {caseNumber && <span>№ {caseNumber}</span>}
              <span className="opacity-50">|</span>
              <span className="text-[var(--accent-amber)]">
                {phase === "idle"
                  ? "TAP TO GENERATE"
                  : phase === "loading"
                  ? "SYNTHESIZING VOICE..."
                  : phase === "ready"
                  ? "READY"
                  : phase === "playing"
                  ? "TRANSMITTING"
                  : "TRANSMISSION FAILED"}
              </span>
            </div>

            <div className="mt-3 flex h-10 items-center gap-[2px] overflow-hidden rounded-sm bg-black/20 px-2">
              {Array.from({ length: 48 }).map((_, i) => (
                <span
                  key={i}
                  className="wave-bar"
                  style={{
                    animationPlayState: phase === "playing" ? "running" : "paused",
                    animationDelay: `${(i * 47) % 600}ms`,
                    height: `${10 + ((i * 13) % 22)}px`,
                    opacity: phase === "playing" ? 1 : 0.35,
                  }}
                />
              ))}
            </div>

            <div className="mt-2 flex justify-between text-[10px] tracking-[0.18em] text-[var(--text-muted)]">
              <span>
                {formatTime(elapsed)} / {duration ? formatTime(duration) : "--:--"}
              </span>
              {errorMsg ? (
                <span className="text-[var(--accent-red)]">{errorMsg.slice(0, 48)}</span>
              ) : (
                <span>DECRYPTED · MISSION LOG</span>
              )}
            </div>
          </div>
        </div>

        {audioUrl ? (
          <audio
            ref={audioRef}
            src={audioUrl}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
            onEnded={() => setPhase("ready")}
            preload="metadata"
            hidden
          />
        ) : null}

        <details className="mt-5 rounded-sm border border-[var(--border-subtle)] bg-black/20 p-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
          <summary className="cursor-pointer text-[10px] tracking-[0.22em] text-[var(--text-muted)]">
            TRANSCRIPT · {mode === "short" ? "SPY HOOK" : "FULL DEBRIEF"}
          </summary>
          <p className="mt-3 whitespace-pre-wrap font-mono text-[var(--text-primary)]/90">
            {mode === "short" && voiceHook ? voiceHook : briefingText}
          </p>
        </details>
      </div>
    </section>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}
