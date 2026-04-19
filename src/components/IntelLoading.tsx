"use client";

// Port of the "Intel Loading" design — slow camera hop across 12 app nodes
// (YC, HN, Reddit, X, Glassdoor, LinkedIn, Wellfound, Indeed, GitHub,
// Product Hunt, Levels.fyi, Crunchbase) connected by glowing yellow lines.
// The camera parks on each node, then zips along the curve to the next while
// an edge draws ahead of it. Previously drawn edges stay lit so the graph
// fills in as the walk progresses. Designed to loop indefinitely until
// results arrive, then flip to a "Results ready" state.

import { useEffect, useRef, useState } from "react";

type App = { id: string; name: string; x: number; y: number; r: number; tag: string };

const NET_W = 3600;
const NET_H = 2400;
const STAGE_W = 1920;
const STAGE_H = 1080;

const APPS: App[] = [
  { id: "yc", name: "Y Combinator", x: 520, y: 640, r: 68, tag: "BATCH INDEX" },
  { id: "hn", name: "Hacker News", x: 1240, y: 340, r: 72, tag: "FRONT PAGE" },
  { id: "reddit", name: "Reddit", x: 2100, y: 520, r: 76, tag: "r/ANTIWORK" },
  { id: "x", name: "X", x: 2880, y: 780, r: 70, tag: "TIMELINE" },
  { id: "glass", name: "Glassdoor", x: 3200, y: 1480, r: 72, tag: "COMP DATA" },
  { id: "li", name: "LinkedIn", x: 2420, y: 1760, r: 74, tag: "SIGNAL" },
  { id: "wf", name: "Wellfound", x: 1600, y: 1520, r: 64, tag: "STARTUP JOBS" },
  { id: "indeed", name: "Indeed", x: 820, y: 1780, r: 66, tag: "POSTINGS" },
  { id: "gh", name: "GitHub", x: 320, y: 1280, r: 72, tag: "COMMIT GRAPH" },
  { id: "ph", name: "Product Hunt", x: 1880, y: 960, r: 60, tag: "LAUNCH FEED" },
  { id: "lv", name: "Levels.fyi", x: 2720, y: 1180, r: 58, tag: "OFFERS" },
  { id: "cb", name: "Crunchbase", x: 1080, y: 1080, r: 62, tag: "FUNDING" },
];

const EDGES: [string, string][] = [
  ["yc", "hn"], ["yc", "gh"], ["yc", "cb"], ["yc", "ph"], ["yc", "wf"],
  ["hn", "reddit"], ["hn", "ph"], ["hn", "x"], ["hn", "gh"],
  ["reddit", "x"], ["reddit", "ph"], ["reddit", "wf"],
  ["x", "glass"], ["x", "li"],
  ["glass", "li"], ["glass", "lv"], ["glass", "indeed"],
  ["li", "lv"], ["li", "wf"], ["li", "indeed"],
  ["wf", "ph"], ["wf", "cb"], ["wf", "indeed"],
  ["gh", "cb"], ["gh", "indeed"],
  ["cb", "ph"], ["cb", "lv"],
  ["ph", "lv"],
];

const STATUS_LINES = [
  "Connecting to Y Combinator feeds…",
  "Scraping Hacker News signals",
  "Cross-referencing r/antiwork",
  "Sampling X timeline chatter",
  "Indexing Glassdoor comp bands",
  "Weighing LinkedIn movement",
  "Scanning Wellfound postings",
  "Diffing GitHub commit activity",
  "Surfacing Levels.fyi offers",
  "Correlating Crunchbase rounds",
  "Harvesting Product Hunt launches",
  "Reconciling Indeed listings",
  "Synthesizing signal graph",
  "Refining candidate shortlist",
];

const APP_BY: Record<string, App> = Object.fromEntries(APPS.map((a) => [a.id, a]));
const DWELL = 1.1;
const TRAVEL = 0.55;

const EASE_IN_OUT = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function buildHopSequence(seed = 42): [string, string][] {
  const adj: Record<string, string[]> = {};
  for (const [a, b] of EDGES) {
    (adj[a] ||= []).push(b);
    (adj[b] ||= []).push(a);
  }
  const seq: [string, string][] = [];
  let cur = "yc";
  let prev: string | null = null;
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 180; i++) {
    const opts = (adj[cur] || []).filter((n) => n !== prev);
    const list = opts.length ? opts : adj[cur];
    const next = list[Math.floor(rnd() * list.length)];
    seq.push([cur, next]);
    prev = cur;
    cur = next;
  }
  return seq;
}

const HOPS = buildHopSequence();

function edgePath(a: App, b: App, index: number) {
  const mx = (a.x + b.x) / 2 + Math.sin(index * 1.7) * 40;
  const my = (a.y + b.y) / 2 + Math.cos(index * 2.3) * 40 + 10;
  return { d: `M ${a.x} ${a.y} Q ${mx} ${my}, ${b.x} ${b.y}`, mx, my };
}

type HopState = { fromId: string; toId: string; i: number; phase: "dwell" | "travel"; phaseP: number };

function hopAt(t: number): HopState {
  const cycle = DWELL + TRAVEL;
  const total = HOPS.length * cycle;
  const tt = ((t % total) + total) % total;
  const i = Math.floor(tt / cycle);
  const local = tt - i * cycle;
  const [fromId, toId] = HOPS[i];
  if (local < DWELL) return { fromId, toId, i, phase: "dwell", phaseP: local / DWELL };
  return { fromId, toId, i, phase: "travel", phaseP: (local - DWELL) / TRAVEL };
}

function cameraAt(t: number) {
  const hop = hopAt(t);
  const from = APP_BY[hop.fromId];
  const to = APP_BY[hop.toId];
  let cx: number, cy: number, s: number;
  if (hop.phase === "dwell") {
    const breath = Math.sin((t + hop.i * 0.3) * 1.2);
    cx = from.x + Math.sin(t * 0.7 + hop.i) * 8;
    cy = from.y + Math.cos(t * 0.6 + hop.i) * 6;
    s = 1.05 + breath * 0.015;
  } else {
    const p = hop.phaseP;
    const e = EASE_IN_OUT(p);
    const { mx, my } = edgePath(from, to, hop.i);
    cx = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * mx + e * e * to.x;
    cy = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * my + e * e * to.y;
    const pull = Math.sin(p * Math.PI);
    s = 1.05 - pull * 0.35;
  }
  const sh = Math.sin(t * 9.3) * 1.2 + Math.sin(t * 14.7) * 0.6;
  const sv = Math.cos(t * 8.1) * 1.1 + Math.cos(t * 13.3) * 0.5;
  const rot = Math.sin(t * 0.5) * 0.4;
  return { cx: cx + sh, cy: cy + sv, s, rot, hop, from, to };
}

function AppGlyph({ id, size = 60 }: { id: string; size?: number }) {
  const stroke = "#ffd76a";
  const filter = "drop-shadow(0 0 8px rgba(255,200,80,0.7))";
  const common = { width: size, height: size, style: { filter } } as const;
  switch (id) {
    case "yc":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="4" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <text x="20" y="27" textAnchor="middle" fill={stroke} fontFamily="'Inter',sans-serif" fontWeight="900" fontSize="16">Y</text>
        </svg>
      );
    case "hn":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="3" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <path d="M12 12 L20 22 L28 12 M20 22 L20 30" stroke={stroke} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "reddit":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <circle cx="20" cy="22" r="12" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <circle cx="20" cy="8" r="2" fill="none" stroke={stroke} strokeWidth="1.8" />
          <line x1="20" y1="10" x2="20" y2="14" stroke={stroke} strokeWidth="1.8" />
          <circle cx="15" cy="22" r="1.6" fill={stroke} />
          <circle cx="25" cy="22" r="1.6" fill={stroke} />
          <path d="M14 26 Q20 30 26 26" stroke={stroke} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="4" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <path d="M12 12 L28 28 M28 12 L12 28" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case "glass":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="18" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <path d="M12 14 L20 14 L20 30 Q14 30 14 24 L14 20" stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "li":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="4" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <rect x="11" y="16" width="3.5" height="12" fill={stroke} />
          <circle cx="12.7" cy="12" r="2" fill={stroke} />
          <path d="M19 16 L19 28 M22 28 L22 22 Q22 19 25 19 Q28 19 28 22 L28 28" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "wf":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="4" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <path d="M10 14 L14 28 L20 18 L26 28 L30 14" stroke={stroke} strokeWidth="2.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case "indeed":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="4" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <circle cx="20" cy="12" r="2.4" fill={stroke} />
          <rect x="18" y="16" width="4" height="14" rx="1.5" fill={stroke} />
        </svg>
      );
    case "gh":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <circle cx="20" cy="20" r="14" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <path d="M20 10 C14 10 11 14 11 19 C11 23 14 26 16 27 C16 26 16 25 16 25 C13 26 12 24 12 24 C12 23 11 22 11 22 C10 22 11 22 11 22 C12 22 13 23 13 23 C14 25 16 24 16 24 C16 23 17 22 17 22 C14 22 12 21 12 19 C12 18 12 17 13 17 C13 16 12 15 13 14 C13 14 14 14 16 15 C17 15 18 15 19 15 C20 15 21 15 22 15 C24 14 25 14 25 14 C25 15 25 16 25 17 C26 17 26 18 26 19 C26 21 24 22 21 22 C21 22 22 23 22 25 C22 26 22 27 22 27 C24 26 27 23 27 19 C27 14 24 10 20 10 Z" fill={stroke} />
        </svg>
      );
    case "ph":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <circle cx="20" cy="20" r="14" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <path d="M15 12 L15 28 M15 12 L22 12 Q26 12 26 16 Q26 20 22 20 L15 20" stroke={stroke} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
        </svg>
      );
    case "lv":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="4" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <path d="M10 26 L14 26 L14 14 M18 26 L18 14 L26 14 L26 18 L18 18 M18 22 L24 22 L30 26 L30 14" stroke={stroke} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
        </svg>
      );
    case "cb":
      return (
        <svg viewBox="0 0 40 40" {...common}>
          <rect x="4" y="4" width="32" height="32" rx="4" fill="#2a1200" stroke={stroke} strokeWidth="2" />
          <circle cx="14" cy="20" r="4" fill="none" stroke={stroke} strokeWidth="1.8" />
          <path d="M22 16 L22 24 L26 24 L26 16 Z" fill="none" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
  }
  return null;
}

function AmbientEdge({ a, b, time, index, active }: { a: App; b: App; time: number; index: number; active: boolean }) {
  const { d } = edgePath(a, b, index);
  const breath = 0.3 + 0.15 * Math.sin(time * 0.6 + index * 0.9);
  const op = active ? 1 : breath;
  return (
    <g>
      <path d={d} stroke="#ffb23a" strokeWidth={active ? 14 : 8} fill="none" opacity={active ? 0.35 : 0.08} strokeLinecap="round" />
      <path d={d} stroke="#ffd76a" strokeWidth={active ? 3.5 : 1.5} fill="none" opacity={active ? 0.9 : 0.25 * op} strokeLinecap="round" />
    </g>
  );
}

function DrawingEdge({ a, b, index, p }: { a: App; b: App; index: number; p: number }) {
  const { d, mx, my } = edgePath(a, b, index);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) * 1.04;
  const headT = Math.min(1, p * 1.05);
  const headX = (1 - headT) * (1 - headT) * a.x + 2 * (1 - headT) * headT * mx + headT * headT * b.x;
  const headY = (1 - headT) * (1 - headT) * a.y + 2 * (1 - headT) * headT * my + headT * headT * b.y;
  const offset = len * (1 - p);
  return (
    <g>
      <path d={d} stroke="#ffb23a" strokeWidth="18" fill="none" opacity={0.25} strokeDasharray={`${len} ${len}`} strokeDashoffset={offset} strokeLinecap="round" />
      <path d={d} stroke="#ffd76a" strokeWidth="6" fill="none" opacity={0.7} strokeDasharray={`${len} ${len}`} strokeDashoffset={offset} strokeLinecap="round" />
      <path d={d} stroke="#fff4c0" strokeWidth="2.2" fill="none" opacity={1} strokeDasharray={`${len} ${len}`} strokeDashoffset={offset} strokeLinecap="round" />
      {p > 0 && p < 1 ? (
        <>
          <circle cx={headX} cy={headY} r="18" fill="#ffd76a" opacity="0.4" />
          <circle cx={headX} cy={headY} r="8" fill="#fff4c0" />
          <circle cx={headX} cy={headY} r="3" fill="#fff" />
        </>
      ) : null}
    </g>
  );
}

function Node({ app, time, index }: { app: App; time: number; index: number }) {
  const pulse = 1 + 0.035 * Math.sin(time * 0.7 + index * 0.6);
  const breath = 0.55 + 0.25 * Math.sin(time * 0.5 + index);
  return (
    <div
      style={{
        position: "absolute",
        left: app.x,
        top: app.y,
        transform: `translate(-50%, -50%) scale(${pulse})`,
        willChange: "transform",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: app.r * 4,
          height: app.r * 4,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(255,200,80,0.22), transparent 60%)",
          opacity: breath,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: app.r * 2,
          height: app.r * 2,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 40%, #3a1d08, #150803 70%)",
          boxShadow: "0 0 20px rgba(255,180,40,0.35), inset 0 0 12px rgba(0,0,0,0.8)",
          border: "1.5px solid rgba(255,215,110,0.4)",
        }}
      />
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <AppGlyph id={app.id} size={app.r * 1.1} />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: app.r + 14,
          transform: "translateX(-50%)",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: "0.12em",
          color: "#ffe8a8",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          textShadow: "0 0 12px rgba(255,180,40,0.5)",
        }}
      >
        {app.name}
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: app.r + 42,
          transform: "translateX(-50%)",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 12,
          letterSpacing: "0.3em",
          color: "rgba(255,215,110,0.55)",
          whiteSpace: "nowrap",
        }}
      >
        ⟶ {app.tag}
      </div>
    </div>
  );
}

function StatusTicker({ done }: { done: boolean }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (done) return;
    const h = setInterval(() => setIdx((i) => (i + 1) % STATUS_LINES.length), 2400);
    return () => clearInterval(h);
  }, [done]);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 80,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 13,
          letterSpacing: "0.4em",
          color: done ? "#9effa0" : "#ffd76a",
          textTransform: "uppercase",
          marginBottom: 12,
          opacity: 0.85,
          textShadow: "0 0 12px rgba(255,180,40,0.5)",
        }}
      >
        {done ? "Results ready" : "Gathering intel"}
      </div>
      <div
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 20,
          color: "#fff4c0",
          letterSpacing: "0.02em",
          opacity: 0.9,
          textShadow: "0 0 20px rgba(255,200,60,0.35)",
        }}
      >
        <span style={{ color: done ? "#9effa0" : "#ffd76a" }}>▸</span>{" "}
        {done ? "Your shortlist is ready." : STATUS_LINES[idx]}
      </div>
      <div
        style={{
          marginTop: 18,
          width: 240,
          height: 2,
          background: "rgba(255,215,110,0.12)",
          overflow: "hidden",
          position: "relative",
          borderRadius: 1,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "40%",
            background: "linear-gradient(90deg, transparent, #ffd76a, transparent)",
            animation: "intel-ticker-sweep 2.4s linear infinite",
          }}
        />
      </div>
    </div>
  );
}

function NetworkScene({ done }: { done: boolean }) {
  const [t, setT] = useState(0);
  const startRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setT((performance.now() - startRef.current) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cam = cameraAt(t);
  const worldTransform = `translate(${STAGE_W / 2}px, ${STAGE_H / 2}px) rotate(${cam.rot}deg) scale(${cam.s}) translate(${-cam.cx}px, ${-cam.cy}px)`;

  const activeKey = `${cam.hop.fromId}-${cam.hop.toId}`;
  const revActiveKey = `${cam.hop.toId}-${cam.hop.fromId}`;
  const drawP = cam.hop.phase === "travel" ? cam.hop.phaseP : cam.hop.phase === "dwell" ? 0 : 1;

  const drawnSet = new Set<string>();
  for (let k = 0; k < cam.hop.i; k++) {
    const [a, b] = HOPS[k];
    drawnSet.add(`${a}-${b}`);
    drawnSet.add(`${b}-${a}`);
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "#0e0702", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 30% 30%, rgba(80,40,10,0.5), transparent 60%), radial-gradient(ellipse at 75% 70%, rgba(50,25,5,0.55), transparent 60%), linear-gradient(180deg, #0e0702, #1a0d04 60%, #0b0602)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.25,
          backgroundImage: "radial-gradient(rgba(255,200,80,0.22) 1px, transparent 1.5px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(ellipse at center, #000 45%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, #000 45%, transparent 85%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: NET_W,
          height: NET_H,
          transform: worldTransform,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        <svg width={NET_W} height={NET_H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {EDGES.map(([aId, bId], i) => {
            const key = `${aId}-${bId}`;
            const isActive = key === activeKey || key === revActiveKey;
            const isDrawn = drawnSet.has(key);
            return (
              <AmbientEdge
                key={i}
                a={APP_BY[aId]}
                b={APP_BY[bId]}
                time={t}
                index={i}
                active={isActive || isDrawn}
              />
            );
          })}
          <DrawingEdge a={cam.from} b={cam.to} index={cam.hop.i} p={drawP} />
        </svg>
        {APPS.map((a, i) => (
          <Node key={a.id} app={a} time={t} index={i} />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.7) 100%)",
          zIndex: 30,
        }}
      />

      <StatusTicker done={done} />
    </div>
  );
}

export default function IntelLoading({ done = false }: { done?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stageRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const fit = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      const s = Math.min(w / STAGE_W, h / STAGE_H);
      if (s > 0) canvas.style.transform = `scale(${s})`;
    };
    fit();
    requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-sm border border-[var(--border-strong)]"
      style={{ aspectRatio: "16 / 9", background: "#0b0602" }}
    >
      <div ref={stageRef} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          ref={canvasRef}
          style={{
            width: STAGE_W,
            height: STAGE_H,
            position: "relative",
            flexShrink: 0,
            transformOrigin: "center",
          }}
        >
          <NetworkScene done={done} />
        </div>
      </div>
    </div>
  );
}
