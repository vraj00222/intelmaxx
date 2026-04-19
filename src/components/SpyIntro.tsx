"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

/**
 * SpyIntro — 5s cinematic camera sweep across a cluttered corkboard world
 * (polaroids, redacted docs, newspaper clippings, handwritten notes, maps,
 * pushpins, red string) culminating in the INTELMAXXING title reveal and
 * a white flash. Ports the Spy Intro.html / intro.jsx / board.jsx prototype
 * from the design handoff bundle.
 *
 * Calls `onDone` once the intro finishes (or is skipped).
 */

// ─── Easing ───────────────────────────────────────────────────────────
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
const easeOutCubic = (t: number): number => (--t) * t * t + 1;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function interpolate(input: number[], output: number[], ease: (t: number) => number) {
  return (t: number) => {
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    for (let i = 0; i < input.length - 1; i++) {
      if (t >= input[i] && t <= input[i + 1]) {
        const span = input[i + 1] - input[i];
        const local = span === 0 ? 0 : (t - input[i]) / span;
        return output[i] + (output[i + 1] - output[i]) * ease(local);
      }
    }
    return output[output.length - 1];
  };
}

// ─── Seeded RNG for deterministic layout ─────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── World layout (6000x3000) ────────────────────────────────────────
const WORLD_W = 6000;
const WORLD_H = 3000;
const STAGE_W = 1920;
const STAGE_H = 1080;

type ItemKind = "polaroid" | "doc" | "news" | "note" | "map" | "pin";

type BaseItem = { kind: ItemKind; x: number; y: number; w: number; h: number; rot: number; z: number };
type PolaroidItem = BaseItem & { kind: "polaroid"; hueA: number; hueB: number; blur: number; bright: number; caption: string; pinColor: "red" | "amber" | "blue" };
type DocItem = BaseItem & { kind: "doc"; lines: number; seed: number; stamp: string };
type NewsItem = BaseItem & { kind: "news"; headline: string };
type NoteItem = BaseItem & { kind: "note"; tint: "yellow" | "white" | "pink" | "mint"; text: string };
type MapItemT = BaseItem & { kind: "map"; seed: number };
type PinItem = { kind: "pin"; x: number; y: number; color: "red" | "amber" | "blue"; z: number };
type AnyItem = PolaroidItem | DocItem | NewsItem | NoteItem | MapItemT | PinItem;

type StringConn = { ax: number; ay: number; bx: number; by: number };

function buildBoard(seed = 7): { items: AnyItem[]; strings: StringConn[] } {
  const rand = mulberry32(seed);
  const r = (a: number, b: number) => a + rand() * (b - a);
  const ri = (a: number, b: number) => Math.floor(r(a, b));
  const pick = <T,>(...arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const items: AnyItem[] = [];

  // Polaroids
  const hues = [14, 28, 200, 220, 340, 10, 180, 40, 260];
  for (let i = 0; i < 22; i++) {
    const w = ri(220, 340);
    items.push({
      kind: "polaroid",
      x: r(200, WORLD_W - w - 200),
      y: r(200, WORLD_H - 420),
      w,
      h: w * r(1.1, 1.35),
      rot: r(-14, 14),
      hueA: hues[ri(0, hues.length)],
      hueB: hues[ri(0, hues.length)],
      blur: r(4, 14),
      bright: r(0.45, 0.85),
      caption: pick("SUBJECT 04", "UNKNOWN", "LAST SEEN", "04:12 AM", "TARGET", "GHOST", "SITE B", "UNIT 7", "INFORMANT", "SOURCE", "CODE: IRIS", "SIGHTING", "NIGHT WATCH", "ASSET", "CONTACT"),
      pinColor: pick("red", "red", "amber", "blue", "red"),
      z: ri(1, 6),
    });
  }

  // Redacted docs
  for (let i = 0; i < 10; i++) {
    const w = ri(360, 560);
    items.push({
      kind: "doc",
      x: r(100, WORLD_W - w - 100),
      y: r(150, WORLD_H - 520),
      w,
      h: w * r(1.25, 1.45),
      rot: r(-8, 8),
      lines: ri(9, 16),
      seed: ri(0, 9999),
      stamp: pick("CLASSIFIED", "TOP SECRET", "EYES ONLY", "OP: MIRAGE", "CONFIDENTIAL"),
      z: ri(1, 4),
    });
  }

  // Newspaper clippings
  for (let i = 0; i < 6; i++) {
    const w = ri(300, 460);
    items.push({
      kind: "news",
      x: r(150, WORLD_W - w - 150),
      y: r(200, WORLD_H - 440),
      w,
      h: w * r(0.7, 1.0),
      rot: r(-10, 10),
      headline: pick(
        "VANISHED WITHOUT A TRACE",
        "THE SIGNAL RETURNS",
        "MAYOR DENIES ALL KNOWLEDGE",
        "BLACKOUT: 14 MINUTES",
        "WITNESSES STAY SILENT",
        "UNEXPLAINED MOVEMENTS"
      ),
      z: ri(1, 4),
    });
  }

  // Notes
  for (let i = 0; i < 14; i++) {
    const w = ri(160, 260);
    items.push({
      kind: "note",
      x: r(100, WORLD_W - w - 100),
      y: r(150, WORLD_H - 320),
      w,
      h: w * r(0.65, 0.9),
      rot: r(-18, 18),
      tint: pick("yellow", "white", "pink", "mint"),
      text: pick(
        "WHO IS\nIRIS?",
        "CHECK THE\nTAPES",
        "04:12\nEVERY NIGHT",
        "FOLLOW\nTHE MONEY",
        "NOT HERE",
        "LIES",
        "TRUST NO ONE",
        "DOUBLE\nCROSS?",
        "SEE FILE 7",
        "WHO KNEW?"
      ),
      z: ri(1, 5),
    });
  }

  // Maps
  for (let i = 0; i < 3; i++) {
    const w = ri(520, 720);
    items.push({
      kind: "map",
      x: r(150, WORLD_W - w - 150),
      y: r(200, WORLD_H - 560),
      w,
      h: w * r(0.75, 0.95),
      rot: r(-6, 6),
      seed: ri(0, 9999),
      z: ri(1, 3),
    });
  }

  // Scatter pins
  for (let i = 0; i < 14; i++) {
    items.push({
      kind: "pin",
      x: r(100, WORLD_W - 100),
      y: r(100, WORLD_H - 100),
      color: pick("red", "red", "amber", "red", "blue"),
      z: 9,
    });
  }

  // Red string web
  const anchors = items
    .filter((it) => it.kind !== "pin")
    .map((it) => {
      const bi = it as BaseItem;
      return { x: bi.x + bi.w * r(0.3, 0.7), y: bi.y + (bi.h || bi.w) * r(0.08, 0.2) };
    })
    .concat(items.filter((it) => it.kind === "pin").map((it) => ({ x: it.x, y: it.y })));

  const strings: StringConn[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (rand() < 0.55) {
      const a = anchors[i];
      const b = anchors[ri(0, anchors.length)];
      strings.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
  }
  for (let i = 0; i < 30; i++) {
    const a = anchors[ri(0, anchors.length)];
    const b = anchors[ri(0, anchors.length)];
    strings.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
  }

  return { items, strings };
}

// ─── Color grade ──────────────────────────────────────────────────────
const NOIR = {
  bg: "#0b0a09",
  wood: "#1a1310",
  paper: "#d8cdb3",
  paperDim: "#a8987a",
  ink: "#120f0c",
  string: "#c1272d",
  accent: "#e8d9a8",
  shadow: "rgba(0,0,0,0.6)",
  veil: "rgba(10,8,6,0.55)",
  tape: "rgba(225,210,170,0.55)",
};

// ─── Renderers ────────────────────────────────────────────────────────
function Pin({ color = "red", x = 0, y = 0 }: { color?: "red" | "amber" | "blue"; x?: number; y?: number }) {
  const map = {
    red: { a: "#ff4a3a", b: "#8a0f0a" },
    amber: { a: "#f6c65a", b: "#8a5b0a" },
    blue: { a: "#5aa8f6", b: "#0a3a8a" },
  } as const;
  const c = map[color] || map.red;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 18, height: 18 }}>
      <div style={{ position: "absolute", left: 3, top: 14, width: 16, height: 6, background: "rgba(0,0,0,0.35)", filter: "blur(3px)", borderRadius: "50%" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 18, height: 18, borderRadius: "50%", background: `radial-gradient(circle at 30% 30%, ${c.a}, ${c.b})`, boxShadow: "inset -3px -3px 6px rgba(0,0,0,0.5), 0 2px 3px rgba(0,0,0,0.5)" }} />
      <div style={{ position: "absolute", left: 4, top: 3, width: 6, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.7)", filter: "blur(1px)" }} />
    </div>
  );
}

function Polaroid({ it }: { it: PolaroidItem }) {
  const frame = 18;
  const capH = 56;
  const bg = `radial-gradient(ellipse at 30% 35%, hsl(${it.hueA} 55% 55% / 0.9), hsl(${it.hueA} 40% 25%) 60%), radial-gradient(ellipse at 70% 70%, hsl(${it.hueB} 60% 50% / 0.85), transparent 60%)`;
  return (
    <div style={{ position: "absolute", left: it.x, top: it.y, width: it.w, height: it.h, transform: `rotate(${it.rot}deg)`, background: NOIR.paper, boxShadow: `0 8px 20px ${NOIR.shadow}, 0 2px 4px rgba(0,0,0,0.3), inset 0 0 40px rgba(0,0,0,0.08)`, padding: frame, paddingBottom: capH, boxSizing: "border-box", transformOrigin: "center" }}>
      <div style={{ width: "100%", height: "100%", background: bg, filter: `blur(${it.blur}px) saturate(${it.bright + 0.3}) brightness(${it.bright})`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px)", mixBlendMode: "overlay" }} />
      </div>
      <div style={{ position: "absolute", left: frame, right: frame, bottom: 14, fontFamily: '"Special Elite","Courier New", monospace', fontSize: Math.max(12, it.w * 0.06), color: NOIR.ink, letterSpacing: "0.08em", textAlign: "center", opacity: 0.75 }}>
        {it.caption}
      </div>
      <Pin color={it.pinColor} x={it.w / 2 - 8} y={-6} />
      {it.w > 270 ? (
        <div style={{ position: "absolute", left: -14, top: -10, width: 60, height: 22, background: NOIR.tape, transform: "rotate(-22deg)", boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} />
      ) : null}
    </div>
  );
}

function Doc({ it }: { it: DocItem }) {
  const rand = mulberry32(it.seed);
  const lines: { w: number; redacted: boolean }[][] = [];
  for (let i = 0; i < it.lines; i++) {
    const segs: { w: number; redacted: boolean }[] = [];
    let x = 0;
    const target = 1 - rand() * 0.25;
    while (x < target) {
      const w = 0.03 + rand() * 0.18;
      const redacted = rand() < 0.38;
      segs.push({ w: Math.min(w, target - x), redacted });
      x += w + 0.015;
    }
    lines.push(segs);
  }
  return (
    <div style={{ position: "absolute", left: it.x, top: it.y, width: it.w, height: it.h, transform: `rotate(${it.rot}deg)`, transformOrigin: "center", background: NOIR.paper, boxShadow: `0 6px 18px ${NOIR.shadow}, 0 1px 3px rgba(0,0,0,0.3)`, padding: "32px 28px", boxSizing: "border-box", color: NOIR.ink, fontFamily: '"Special Elite", "Courier New", monospace', overflow: "hidden" }}>
      <div style={{ fontSize: it.w * 0.05, letterSpacing: "0.18em", opacity: 0.9, marginBottom: 10, fontWeight: 700 }}>{it.stamp}</div>
      <div style={{ fontSize: it.w * 0.028, opacity: 0.75, marginBottom: 14, letterSpacing: "0.05em" }}>
        FILE {String(it.seed).padStart(4, "0")} · {it.stamp === "EYES ONLY" ? "DO NOT DUPLICATE" : "INTERNAL USE"}
      </div>
      {lines.map((segs, i) => (
        <div key={i} style={{ display: "flex", gap: 4, marginBottom: 6, height: Math.max(8, it.w * 0.022) }}>
          {segs.map((s, j) => (
            <div key={j} style={{ width: `${s.w * 100}%`, background: s.redacted ? NOIR.ink : "rgba(0,0,0,0.28)", height: "100%" }} />
          ))}
        </div>
      ))}
      <div style={{ position: "absolute", right: 24, bottom: 24, padding: "8px 18px", border: `3px solid ${NOIR.string}`, color: NOIR.string, fontSize: it.w * 0.055, letterSpacing: "0.2em", fontWeight: 900, transform: "rotate(-8deg)", opacity: 0.85, fontFamily: '"Special Elite", "Courier New", monospace' }}>
        {it.stamp}
      </div>
      <Pin color="red" x={it.w / 2 - 8} y={-6} />
    </div>
  );
}

function News({ it }: { it: NewsItem }) {
  return (
    <div style={{ position: "absolute", left: it.x, top: it.y, width: it.w, height: it.h, transform: `rotate(${it.rot}deg)`, transformOrigin: "center", background: NOIR.paperDim, boxShadow: `0 6px 16px ${NOIR.shadow}`, padding: 18, boxSizing: "border-box", color: NOIR.ink, fontFamily: '"Playfair Display", Georgia, serif', overflow: "hidden" }}>
      <div style={{ fontSize: it.w * 0.036, letterSpacing: "0.25em", opacity: 0.7, marginBottom: 8, fontFamily: '"Special Elite", monospace' }}>DAILY LEDGER · VOL. IX</div>
      <div style={{ fontSize: it.w * 0.085, fontWeight: 900, lineHeight: 1.02, marginBottom: 10, textTransform: "uppercase" }}>{it.headline}</div>
      <div style={{ display: "flex", gap: 10 }}>
        {[0, 1].map((c) => (
          <div key={c} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 5, background: "rgba(0,0,0,0.35)", width: `${72 + ((i * 13) % 28)}%` }} />
            ))}
          </div>
        ))}
      </div>
      <Pin color="amber" x={it.w / 2 - 8} y={-6} />
    </div>
  );
}

function Note({ it }: { it: NoteItem }) {
  const tints: Record<NoteItem["tint"], string> = { yellow: "#f5e58a", white: "#f4efe0", pink: "#f4b8b8", mint: "#b8e0c8" };
  return (
    <div style={{ position: "absolute", left: it.x, top: it.y, width: it.w, height: it.h, transform: `rotate(${it.rot}deg)`, transformOrigin: "center", background: tints[it.tint] || "#f5e58a", boxShadow: `0 6px 14px ${NOIR.shadow}, inset 0 0 30px rgba(0,0,0,0.05)`, padding: 14, boxSizing: "border-box", color: "#222", fontFamily: '"Caveat","Permanent Marker", cursive', fontSize: it.w * 0.16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", whiteSpace: "pre", fontWeight: 700 }}>
      {it.text}
      <Pin color="red" x={it.w / 2 - 8} y={-6} />
    </div>
  );
}

function MapItem({ it }: { it: MapItemT }) {
  const rand = mulberry32(it.seed);
  const dots: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) dots.push({ x: rand() * 0.9 + 0.05, y: rand() * 0.8 + 0.1 });
  return (
    <div style={{ position: "absolute", left: it.x, top: it.y, width: it.w, height: it.h, transform: `rotate(${it.rot}deg)`, transformOrigin: "center", background: NOIR.paperDim, boxShadow: `0 8px 20px ${NOIR.shadow}`, overflow: "hidden" }}>
      <svg viewBox={`0 0 ${it.w} ${it.h}`} width={it.w} height={it.h} style={{ display: "block" }}>
        <rect x="0" y="0" width={it.w} height={it.h} fill={NOIR.paperDim} />
        {Array.from({ length: 16 }).map((_, i) => (
          <line key={"h" + i} x1="0" y1={(i / 16) * it.h + rand() * 6} x2={it.w} y2={(i / 16) * it.h + rand() * 6} stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
        ))}
        {Array.from({ length: 22 }).map((_, i) => (
          <line key={"v" + i} x1={(i / 22) * it.w + rand() * 6} y1="0" x2={(i / 22) * it.w + rand() * 6} y2={it.h} stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
        ))}
        <path d={`M 0 ${it.h * 0.6} Q ${it.w * 0.3} ${it.h * 0.3}, ${it.w * 0.6} ${it.h * 0.5} T ${it.w} ${it.h * 0.4}`} stroke="rgba(0,0,0,0.35)" strokeWidth="4" fill="none" />
        <path d={`M ${it.w * 0.1} 0 Q ${it.w * 0.4} ${it.h * 0.4}, ${it.w * 0.3} ${it.h * 0.7} T ${it.w * 0.2} ${it.h}`} stroke={NOIR.accent} strokeWidth="5" fill="none" opacity="0.5" />
        {dots.map((d, i) => (
          <g key={i}>
            <circle cx={d.x * it.w} cy={d.y * it.h} r="10" fill={NOIR.string} opacity="0.9" />
            <circle cx={d.x * it.w} cy={d.y * it.h} r="22" fill="none" stroke={NOIR.string} strokeWidth="2" opacity="0.6" />
          </g>
        ))}
      </svg>
      <div style={{ position: "absolute", left: 10, top: 8, fontFamily: '"Special Elite", monospace', fontSize: it.w * 0.04, letterSpacing: "0.2em", color: NOIR.ink, opacity: 0.75 }}>SECTOR 7 · GRID MAP</div>
      <Pin color="red" x={it.w / 2 - 8} y={-6} />
    </div>
  );
}

function StringWeb({ strings }: { strings: StringConn[] }) {
  return (
    <svg width={WORLD_W} height={WORLD_H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.4))" }}>
      {strings.map((s, i) => {
        const mx = (s.ax + s.bx) / 2;
        const my = (s.ay + s.by) / 2 + 18;
        return <path key={i} d={`M ${s.ax} ${s.ay} Q ${mx} ${my}, ${s.bx} ${s.by}`} stroke={NOIR.string} strokeWidth="2.2" fill="none" opacity="0.85" />;
      })}
    </svg>
  );
}

function BoardWorld({ seed = 7 }: { seed?: number }) {
  const { items, strings } = useMemo(() => buildBoard(seed), [seed]);
  const sorted = [...items].sort((a, b) => ((a as BaseItem).z || 0) - ((b as BaseItem).z || 0));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: WORLD_W, height: WORLD_H }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 20% 30%, rgba(255,220,150,0.06), transparent 50%), radial-gradient(circle at 80% 70%, rgba(255,200,140,0.05), transparent 50%), ${NOIR.wood}` }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 10% 20%, rgba(120,80,40,0.35) 0 2px, transparent 3px), radial-gradient(circle at 30% 60%, rgba(80,50,20,0.3) 0 2px, transparent 3px), radial-gradient(circle at 60% 40%, rgba(140,95,50,0.3) 0 1.5px, transparent 2.5px), radial-gradient(circle at 80% 80%, rgba(100,70,40,0.3) 0 2px, transparent 3px)", backgroundSize: "120px 120px, 180px 180px, 90px 90px, 160px 160px", opacity: 0.7, mixBlendMode: "overlay" }} />
      {sorted.filter((it) => it.kind !== "pin").map((it, i) => {
        if (it.kind === "polaroid") return <Polaroid key={i} it={it} />;
        if (it.kind === "doc") return <Doc key={i} it={it} />;
        if (it.kind === "news") return <News key={i} it={it} />;
        if (it.kind === "note") return <Note key={i} it={it} />;
        if (it.kind === "map") return <MapItem key={i} it={it} />;
        return null;
      })}
      <StringWeb strings={strings} />
      {sorted.filter((it) => it.kind === "pin").map((it, i) => (
        <Pin key={"p" + i} color={(it as PinItem).color} x={it.x} y={it.y} />
      ))}
    </div>
  );
}

// ─── Camera choreography ──────────────────────────────────────────────
const CAM_KEYS: [number, number, number, number, number][] = [
  [0.0, 800, 500, 1.15, -3],
  [0.9, 1400, 900, 1.05, 2],
  [1.9, 2500, 1500, 0.95, -2],
  [2.8, 3500, 1200, 1.0, 3],
  [3.6, 3000, 1500, 1.35, -1.5],
  [4.3, 3000, 1500, 2.0, 0],
  [4.7, 3000, 1500, 2.4, 0],
];

function evalCam(t: number) {
  if (t <= CAM_KEYS[0][0]) {
    const [, cx, cy, s, rot] = CAM_KEYS[0];
    return { cx, cy, s, rot };
  }
  for (let i = 0; i < CAM_KEYS.length - 1; i++) {
    const [t0, cx0, cy0, s0, r0] = CAM_KEYS[i];
    const [t1, cx1, cy1, s1, r1] = CAM_KEYS[i + 1];
    if (t >= t0 && t <= t1) {
      const local = (t - t0) / (t1 - t0);
      const e = easeInOutCubic(local);
      return { cx: cx0 + (cx1 - cx0) * e, cy: cy0 + (cy1 - cy0) * e, s: s0 + (s1 - s0) * e, rot: r0 + (r1 - r0) * e };
    }
  }
  const last = CAM_KEYS[CAM_KEYS.length - 1];
  return { cx: last[1], cy: last[2], s: last[3], rot: last[4] };
}

function shake(t: number, amp = 1) {
  const sx = (Math.sin(t * 7.3) + Math.sin(t * 13.1) * 0.6 + Math.sin(t * 3.7) * 0.3) * amp;
  const sy = (Math.cos(t * 6.1) + Math.sin(t * 11.7) * 0.5 + Math.cos(t * 4.3) * 0.4) * amp;
  const sr = (Math.sin(t * 5.2) * 0.4 + Math.sin(t * 9.1) * 0.2) * amp * 0.4;
  return { sx, sy, sr };
}

// ─── Overlays (letterbox, vignette, grain, flicker) ───────────────────
const GRAIN_SVG = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.3 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

function CinematicOverlays({ time }: { time: number }) {
  const letter = clamp(interpolate([0, 0.5, 4.0, 4.6], [28, 36, 60, 100], easeInOutCubic)(time), 0, 220);
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: letter, background: "#000", zIndex: 50, pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: letter, background: "#000", zIndex: 50, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.75) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 45, pointerEvents: "none", opacity: 0.22, mixBlendMode: "overlay", backgroundImage: GRAIN_SVG, animation: "intel-grain 0.2s steps(6) infinite" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 42, pointerEvents: "none", background: NOIR.veil, opacity: 0.3 + 0.12 * Math.sin(time * 11), mixBlendMode: "multiply" }} />
    </>
  );
}

// ─── Title reveal + flash ─────────────────────────────────────────────
function TitleReveal({ time }: { time: number }) {
  if (time < 4.0) return null;
  const appear = clamp((time - 4.25) / 0.35, 0, 1);
  const appearE = easeOutCubic(appear);
  const tightenLetter = interpolate([0, 1], [0.3, 0.02], easeOutCubic)(appear);
  const flash = clamp((time - 4.55) / 0.18, 0, 1);
  const flashOut = clamp((time - 4.75) / 0.2, 0, 1);
  const flashA = flash * (1 - flashOut);
  const white = clamp((time - 4.8) / 0.2, 0, 1);

  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, background: NOIR.string, boxShadow: `0 0 24px ${NOIR.string}, 0 0 48px ${NOIR.string}`, zIndex: 60, transform: `translateY(${interpolate([0, 1], [-400, 400], easeInOutCubic)(clamp((time - 4.0) / 0.3, 0, 1))}px) scaleX(${clamp((time - 4.0) / 0.15, 0, 1)})`, opacity: time < 4.3 ? 1 : 0, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 70, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ fontFamily: '"Special Elite","Courier New", monospace', fontSize: 22, letterSpacing: "0.5em", color: NOIR.string, opacity: appearE * (1 - white), marginBottom: 18, textTransform: "uppercase", transform: `translateY(${(1 - appearE) * -12}px)` }}>
          [ CLASSIFIED · OPERATION ]
        </div>
        <div style={{ fontFamily: '"Anton","Oswald","Inter", sans-serif', fontWeight: 900, fontSize: 200, letterSpacing: `${tightenLetter}em`, color: "#f5efe0", textShadow: "0 4px 40px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.7)", opacity: appearE * (1 - white), transform: `scale(${0.96 + appearE * 0.04})`, WebkitTextStroke: "1px rgba(255,255,255,0.08)", textTransform: "uppercase" }}>
          INTELMAXXING
        </div>
        <div style={{ marginTop: 14, fontFamily: '"Special Elite","Courier New", monospace', fontSize: 18, letterSpacing: "0.4em", color: "rgba(245,239,224,0.7)", opacity: clamp((time - 4.42) / 0.25, 0, 1) * (1 - white) }}>
          — DO NOT SHARE —
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: 80, pointerEvents: "none", background: "#fff", opacity: Math.max(flashA, white) }} />
    </>
  );
}

// ─── Main intro ───────────────────────────────────────────────────────
const DURATION = 5.0;
const REDIRECT_AT = 5.0;

export default function SpyIntro({ onDone }: { onDone: () => void }) {
  const [time, setTime] = useState(0);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number | null>(null);
  const firedRef = useRef(false);

  // RAF playhead
  useEffect(() => {
    let raf = 0;
    const step = (ts: number) => {
      if (startedAt.current == null) startedAt.current = ts;
      const t = (ts - startedAt.current) / 1000;
      setTime(t);
      if (t >= REDIRECT_AT && !firedRef.current) {
        firedRef.current = true;
        setTimeout(() => onDone(), 200);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  // Fit 1920x1080 stage to viewport
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const s = Math.min(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H);
      setScale(Math.max(0.05, s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Skip on click / keypress
  useEffect(() => {
    const skip = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      onDone();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Escape" || e.code === "Enter") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const cam = evalCam(time);
  const shakeAmp = time < 2 ? 2.5 : time < 3.5 ? 3.0 : time < 4.2 ? 5.0 : time < 4.55 ? 2.0 : 0.8;
  const sh = shake(time, shakeAmp);
  const blurAmt = time < 0.3 ? 0 : time < 3.5 ? 2.5 : time < 4.2 ? 1.0 : 0;
  const fringe = time < 0.4 ? clamp(1 - time / 0.4, 0, 1) : time > 4.4 && time < 4.6 ? 1 : 0;

  const worldTransform = `translate(${STAGE_W / 2 + sh.sx}px, ${STAGE_H / 2 + sh.sy}px) rotate(${cam.rot + sh.sr}deg) scale(${cam.s}) translate(${-cam.cx}px, ${-cam.cy}px)`;

  const stageStyle: CSSProperties = {
    width: STAGE_W,
    height: STAGE_H,
    background: NOIR.bg,
    position: "relative",
    overflow: "hidden",
    transform: `scale(${scale})`,
    transformOrigin: "center",
    flexShrink: 0,
  };

  return (
    <div
      ref={stageRef}
      onClick={() => {
        if (firedRef.current) return;
        firedRef.current = true;
        onDone();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      <style>{`@keyframes intel-grain { 0%{transform:translate(0,0)} 20%{transform:translate(-4px,3px)} 40%{transform:translate(3px,-2px)} 60%{transform:translate(-2px,-3px)} 80%{transform:translate(4px,2px)} 100%{transform:translate(0,0)} }`}</style>
      <div style={stageStyle}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: WORLD_W,
            height: WORLD_H,
            transform: worldTransform,
            transformOrigin: "0 0",
            filter: `blur(${blurAmt}px) saturate(0.85) contrast(1.05)`,
            willChange: "transform, filter",
          }}
        >
          <BoardWorld seed={7} />
        </div>

        {fringe > 0 ? (
          <>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "screen", opacity: 0.35 * fringe, transform: `translate(${4 * fringe}px, 0)`, background: "radial-gradient(circle at 50% 50%, rgba(255,0,0,0.4), transparent 60%)" }} />
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "screen", opacity: 0.3 * fringe, transform: `translate(${-4 * fringe}px, 0)`, background: "radial-gradient(circle at 50% 50%, rgba(0,140,255,0.3), transparent 60%)" }} />
          </>
        ) : null}

        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30, background: "radial-gradient(circle at 50% 52%, transparent 15%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.9) 100%)" }} />

        <CinematicOverlays time={time} />
        <TitleReveal time={time} />
      </div>

      <div
        style={{
          position: "absolute",
          right: 20,
          bottom: 20,
          zIndex: 10000,
          fontFamily: '"Special Elite", monospace',
          fontSize: 10,
          letterSpacing: "0.25em",
          color: "rgba(245,239,224,0.45)",
          pointerEvents: "none",
        }}
      >
        CLICK / SPACE · SKIP
      </div>
    </div>
  );
}
