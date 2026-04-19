"use client";

import { useEffect, useRef, useState } from "react";

type Variant = "moat" | "warning" | "rehearse";

type Props = {
  text: string;
  label: string;             // short label shown on the pill ("MOAT BRIEFING", "RED FLAG")
  variant?: Variant;
  sublabel?: string;         // e.g. company name
};

/**
 * Compact inline play button that fetches /api/briefing for the given text and
 * plays the audio via a hidden <audio>. Three states: idle → loading → playing.
 * Used for per-moat voice dossiers and red-flag warnings.
 */
export default function VoiceChip({ text, label, variant = "moat", sublabel }: Props) {
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "playing" | "error">(
    "idle"
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setAudioUrl(null);
    setPhase("idle");
    setErr(null);
  }, [text]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function ensureAudio(): Promise<string | null> {
    if (audioUrl) return audioUrl;
    setPhase("loading");
    setErr(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Briefing failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setPhase("ready");
      return url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
      return null;
    }
  }

  async function onClick() {
    const url = await ensureAudio();
    if (!url) return;
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      try {
        await a.play();
        setPhase("playing");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Playback failed");
        setPhase("error");
      }
    } else {
      a.pause();
      setPhase("ready");
    }
  }

  const palette =
    variant === "warning"
      ? {
          border: "border-[var(--accent-red)]",
          fill: "bg-[var(--accent-red)]/15",
          text: "text-[var(--accent-red)]",
          icon: "⚠",
        }
      : variant === "rehearse"
      ? {
          border: "border-[var(--accent-green)]",
          fill: "bg-[var(--accent-green)]/15",
          text: "text-[var(--accent-green)]",
          icon: "▶",
        }
      : {
          border: "border-[var(--accent-amber)]",
          fill: "bg-[var(--accent-amber)]/15",
          text: "text-[var(--accent-amber)]",
          icon: "▶",
        };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={phase === "loading"}
        className={[
          "inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition",
          palette.border,
          palette.fill,
          palette.text,
          "hover:brightness-110 disabled:opacity-60",
        ].join(" ")}
        title={text}
      >
        {phase === "loading" ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : phase === "playing" ? (
          <span className="text-[11px] leading-none">❚❚</span>
        ) : (
          <span className="text-[11px] leading-none">{palette.icon}</span>
        )}
        <span>
          {label}
          {sublabel ? ` · ${sublabel}` : ""}
        </span>
      </button>
      {err ? (
        <span className="font-mono text-[9.5px] tracking-[0.15em] text-[var(--accent-red)]">
          {err.slice(0, 40)}
        </span>
      ) : null}
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setPhase("ready")}
          preload="metadata"
          hidden
        />
      ) : null}
    </div>
  );
}
