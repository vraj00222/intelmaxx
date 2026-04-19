"use client";

import { useEffect, useState } from "react";

export type Provider = "novita" | "ollama";

type Props = {
  value: Provider;
  onChange: (p: Provider) => void;
  disabled?: boolean;
};

type ProviderInfo = {
  default: Provider;
  ollama_available: boolean;
  novita_available: boolean;
  novita_model?: string;
  ollama_model?: string;
};

export default function ProviderToggle({ value, onChange, disabled }: Props) {
  const [info, setInfo] = useState<ProviderInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/provider", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ProviderInfo) => {
        if (!cancelled) setInfo(d);
      })
      .catch(() => {
        if (!cancelled)
          setInfo({ default: "novita", ollama_available: false, novita_available: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ollamaReachable = info?.ollama_available ?? false;
  const novitaReachable = info?.novita_available ?? true;

  // If user had ollama selected but it's not reachable, silently flip to novita.
  useEffect(() => {
    if (info && value === "ollama" && !ollamaReachable) onChange("novita");
  }, [info, value, ollamaReachable, onChange]);

  const novitaModel = info?.novita_model || "google/gemma-4-31b-it";
  const ollamaModel = info?.ollama_model || "gemma4:e2b";

  return (
    <div className="inline-flex items-center gap-2 rounded-sm border border-[var(--border-subtle)] bg-black/30 px-2 py-1">
      <span className="font-mono text-[9px] tracking-[0.25em] text-[var(--text-muted)]">
        GEMMA 4
      </span>
      <Pill
        label="NOVITA"
        sub={`(${novitaModel})`}
        active={value === "novita"}
        disabled={disabled || !novitaReachable}
        onClick={() => onChange("novita")}
        dotColor="var(--accent-amber)"
      />
      <Pill
        label="OLLAMA"
        sub={ollamaReachable ? `(${ollamaModel})` : "offline"}
        active={value === "ollama"}
        disabled={disabled || !ollamaReachable}
        onClick={() => onChange("ollama")}
        dotColor={ollamaReachable ? "var(--accent-green)" : "var(--text-muted)"}
        title={
          ollamaReachable
            ? `Local Ollama · ${ollamaModel}`
            : "Ollama not reachable — unavailable in production. Run `npm run dev:ollama` locally."
        }
      />
    </div>
  );
}

function Pill({
  label,
  sub,
  active,
  disabled,
  onClick,
  dotColor,
  title,
}: {
  label: string;
  sub: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  dotColor: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={[
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.18em] transition",
        active
          ? "border-[var(--accent-amber)] bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]"
          : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        disabled ? "cursor-not-allowed opacity-40 hover:text-[var(--text-secondary)]" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      {label}
      <span className="opacity-50 text-[8.5px]">· {sub}</span>
    </button>
  );
}
