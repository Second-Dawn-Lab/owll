import React from "react";
import { Img, OffthreadVideo, Sequence, staticFile } from "remotion";
import { C, FONT } from "../theme";
import { Layout, Scene, Timeline } from "./layout";
import { clamp, ease, easeInOut, lerp, spring01 } from "./fx";

export const cue = (sc: Scene, name: string, fallback = 0) => (sc.cues[name] !== undefined ? sc.cues[name] : fallback);

// --- text --------------------------------------------------------------------------------------------------------------------------------
export const Headline: React.FC<{ text: string; accent?: string; t: number; start: number; period: number; L: Layout }> = ({ text, accent, t, start, period, L }) => {
  const words = text.split(" ");
  const acc = (accent ?? "").split(" ");
  const size = L.head.size * (L.fmt === "16x9" ? 1 : L.fmt === "9x16" ? 1 : 1);
  return (
    <div style={{ position: "absolute", left: L.head.left, right: L.head.right, top: L.head.top, textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.08, color: C.white, letterSpacing: -1.5 }}>
      {words.map((w, i) => {
        const p = spring01(t, start + i * period * 0.5, 16, 7);
        const clean = w.replace(/[^\w·%-]/g, "");
        const isAcc = acc.includes(clean) || (accent && accent.includes(clean) && clean.length > 1);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", marginRight: size * 0.26, paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - clamp(p, 0, 1.05)) * 115}%) rotate(${(1 - clamp(p)) * 4}deg)`, opacity: clamp(p * 1.6), color: isAcc ? C.lavender : C.white, textShadow: isAcc ? "0 0 40px rgba(138,92,255,0.75)" : "0 4px 24px rgba(0,0,0,0.35)" }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

/** The one caption: the narration, below the card. */
export const Subtitle: React.FC<{ sc: Scene; t: number; L: Layout }> = ({ sc, t, L }) => {
  if (!sc.narr) return null;
  const a = sc.narr.start - 0.05;
  const b = sc.narr.start + sc.narr.dur + 0.25;
  const o = clamp((t - a) / 0.18) * clamp((b - t) / 0.2);
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: L.sub.bottom, display: "flex", justifyContent: "center", opacity: o, transform: `translateY(${(1 - o) * 14}px)` }}>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: L.sub.size, lineHeight: 1.25, color: C.ink, background: "rgba(11,16,38,0.78)", border: "1px solid rgba(201,182,250,0.28)", padding: `${L.sub.size * 0.36}px ${L.sub.size * 0.9}px`, borderRadius: L.sub.size * 0.9, maxWidth: L.sub.maxW, textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }}>{sc.narr.text}</div>
    </div>
  );
};

// --- the app footage on a floating card ----------------------------------------------------------------------------------------------------
type Rect = [number, number, number, number];
const fitAspect = (r: Rect, ar: number): Rect => {
  let [l, t, rr, b] = r;
  let w = rr - l;
  let h = b - t;
  const cx = (l + rr) / 2;
  const cy = (t + b) / 2;
  if (w / h < ar) w = h * ar;
  else h = w / ar;
  if (w > 2400) {
    w = 2400;
    h = w / ar;
  }
  if (h > 1350) {
    h = 1350;
    w = h * ar;
  }
  const x = Math.min(Math.max(cx, w / 2), 2400 - w / 2);
  const y = Math.min(Math.max(cy, h / 2), 1350 - h / 2);
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
};

export const cameraAt = (rects: NonNullable<Scene["rects"]>, ar: number, t: number): Rect => {
  const ks = rects.map((k) => ({ t: k.t, r: fitAspect(k.rect, ar) }));
  if (t <= ks[0].t) return ks[0].r;
  for (let i = 0; i < ks.length - 1; i++) {
    if (t <= ks[i + 1].t) {
      const u = easeInOut(clamp((t - ks[i].t) / (ks[i + 1].t - ks[i].t)));
      return ks[i].r.map((v, j) => lerp(v, ks[i + 1].r[j], u)) as Rect;
    }
  }
  return ks[ks.length - 1].r;
};

export const VideoCard: React.FC<{
  sc: Scene;
  t: number;
  tl: Timeline;
  L: Layout;
  lead: number;
  appear: number; // seconds: the card flies in
  align?: "center" | "left" | "right";
  tilt?: number;
  area?: { x: number; y: number; w: number; h: number };
}> = ({ sc, t, tl, L, lead, appear, align = "center", tilt = -7, area }) => {
  const A = area ?? L.card;
  const r0 = sc.rects![0].rect;
  const ar = (r0[2] - r0[0]) / (r0[3] - r0[1]);
  const w = Math.min(A.w, A.h * ar);
  const h = w / ar;
  const x = A.x + (align === "center" ? (A.w - w) / 2 : align === "left" ? 0 : A.w - w);
  const y = A.y + (A.h - h) / 2;
  const cam = cameraAt(sc.rects!, ar, t);
  const s = w / (cam[2] - cam[0]);
  const p = spring01(t, appear, 12, 6.2);
  const fps = tl.fps;
  let acc = 0;
  const segs = (sc.ranges ?? []).map(([a, b, sp]) => {
    const dur = (b - a) / sp;
    const seg = { from: Math.round(acc * fps) + lead, frames: Math.max(1, Math.round(dur * fps)), a, b, sp };
    acc += dur;
    return seg;
  });
  const drift = Math.sin(t * 0.55) * 1.4;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, perspective: 2200, opacity: clamp(p * 2.4), transform: `translateY(${(1 - p) * 90}px)` }}>
      <div style={{ width: w, height: h, transform: `rotateY(${(tilt + drift) * (0.4 + 0.6 * p)}deg) rotateX(${2.5 + Math.sin(t * 0.4) * 0.8}deg) scale(${0.9 + 0.1 * p})`, borderRadius: 26 * L.u, overflow: "hidden", position: "relative", background: "#dfe3ef", boxShadow: "0 50px 110px rgba(0,0,0,0.6), 0 0 90px rgba(138,92,255,0.38), 0 0 0 1px rgba(255,255,255,0.16)" }}>
        <div style={{ position: "absolute", width: 2400 * s, height: 1350 * s, left: -cam[0] * s, top: -cam[1] * s }}>
          {segs.map((g, i) => (
            <Sequence key={i} from={g.from} durationInFrames={g.frames}>
              <OffthreadVideo src={staticFile(`clips/${sc.clip}.mp4`)} startFrom={Math.round(g.a * fps)} endAt={Math.round(g.b * fps)} playbackRate={g.sp} muted style={{ width: 2400 * s, height: 1350 * s }} />
            </Sequence>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0) 40%)", pointerEvents: "none" }} />
      </div>
    </div>
  );
};

// --- the comparison card (generic: no product is named or shown) -----------------------------------------------------------------------
export const CompareBlock: React.FC<{ t: number; ticks: number[]; L: Layout; appear: number }> = ({ t, ticks, L, appear }) => {
  const A = L.card;
  const u = L.fmt === "16x9" ? 1 : L.fmt === "9x16" ? 0.82 : 0.68;
  const rows: [string, string, string][] = [
    ["Works offline", "✓", "✗"],
    ["Text stays on your PC", "✓", "✗"],
    ["Free, no limits", "✓", "often limited"],
  ];
  const p = spring01(t, appear, 12, 6);
  const w = Math.min(A.w, L.fmt === "16x9" ? 1100 : 1000);
  return (
    <div style={{ position: "absolute", left: L.fmt === "16x9" ? A.x : A.x + (A.w - w) / 2, top: A.y + (A.h - 520 * u) / 2, width: w, padding: `${40 * u}px ${52 * u}px`, borderRadius: 36, background: "linear-gradient(160deg, rgba(44,34,120,0.9), rgba(16,14,52,0.94))", border: "1px solid rgba(201,182,250,0.32)", boxShadow: "0 40px 100px rgba(0,0,0,0.55), 0 0 90px rgba(138,92,255,0.28)", transform: `scale(${0.92 + 0.08 * p}) translateY(${(1 - p) * 70}px)`, opacity: clamp(p * 2.2), fontFamily: FONT }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.15fr", alignItems: "center", rowGap: 30 * u }}>
        <div />
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 46 * u, color: C.lavender }}>Owl-L</div>
        <div style={{ textAlign: "center", fontWeight: 600, fontSize: 30 * u, color: C.muted, lineHeight: 1.15 }}>typical online translators</div>
        {rows.map(([label, a, b], i) => {
          const k = spring01(t, ticks[i], 16, 6);
          return (
            <React.Fragment key={label}>
              <div style={{ fontWeight: 600, fontSize: 38 * u, color: C.ink, opacity: 0.4 + 0.6 * clamp(k * 2) }}>{label}</div>
              <div style={{ textAlign: "center", opacity: clamp(k * 3), transform: `scale(${0.3 + 0.7 * clamp(k, 0, 1.15)})` }}>
                <span style={{ display: "inline-block", width: 76 * u, height: 76 * u, lineHeight: `${76 * u}px`, borderRadius: "50%", background: C.green, color: "#06281B", fontWeight: 800, fontSize: 48 * u, boxShadow: `0 0 ${34 * k}px ${C.green}` }}>{a}</span>
              </div>
              <div style={{ textAlign: "center", fontWeight: 700, fontSize: (b.length > 3 ? 32 : 54) * u, color: "rgba(244,242,255,0.42)", opacity: clamp(k * 2) }}>{b}</div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// --- the document: the original page flips into the translated page -----------------------------------------------------------------------
export const DocFlip: React.FC<{ t: number; flipAt: number; L: Layout; appear: number }> = ({ t, flipAt, L, appear }) => {
  const A = L.card;
  const ar = 900 / 792;
  const h = Math.min(A.h, A.w / ar);
  const w = h * ar;
  const p = spring01(t, appear, 12, 6);
  const f = spring01(t, flipAt, 9, 5.2);
  const rot = 180 * clamp(f, 0, 1.06);
  const lift = Math.sin(clamp(f, 0, 1) * Math.PI) * 60;
  const face: React.CSSProperties = { position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 22 * L.u, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.55), 0 0 80px rgba(138,92,255,0.3)", background: "#fff" };
  const label = (text: string, side: "front" | "back"): React.CSSProperties => ({ position: "absolute", top: 14, left: 14, fontFamily: FONT, fontWeight: 700, fontSize: 26 * L.u, color: "#fff", background: side === "front" ? "rgba(60,64,90,0.85)" : "rgba(109,46,240,0.95)", padding: "6px 16px", borderRadius: 999 });
  return (
    <div style={{ position: "absolute", left: A.x + (A.w - w) / 2, top: A.y + (A.h - h) / 2, width: w, height: h, perspective: 2000, opacity: clamp(p * 2.4), transform: `translateY(${(1 - p) * 90 - lift}px) scale(${0.92 + 0.08 * p + Math.sin(clamp(f, 0, 1) * Math.PI) * 0.05})` }}>
      <div style={{ width: w, height: h, position: "relative", transformStyle: "preserve-3d", transform: `rotateY(${rot}deg) rotateZ(${Math.sin(clamp(f, 0, 1) * Math.PI) * -3}deg)` }}>
        <div style={face}>
          <Img src={staticFile("doc-original.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={label("Original", "front")}>Original (German)</div>
        </div>
        <div style={{ ...face, transform: "rotateY(180deg)" }}>
          <Img src={staticFile("doc-translated.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={label("Translated", "back")}>Translated by Owl-L</div>
        </div>
      </div>
    </div>
  );
};
