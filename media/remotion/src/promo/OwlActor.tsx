// The Owl-L mascot as a 2.5D character: Second Dawn's own artwork (work/v2/art, normalised by py/artprep.py), animated with springs:
// idle float and breathing, squash on landing, a pop and a sparkle at every pose swap, irregular blinks, a peek-in from the edge.
import React from "react";
import { Img, staticFile } from "remotion";
import { Sparkles, clamp, lerp, popScale, spring01, squash } from "./fx";

export type PosePlan = { t: number; pose: string }[]; // from time t (scene seconds) on, this picture is shown

const NH: Record<string, number> = { "owl-fly": 1077 }; // the natural heights relative to the standing poses (1197)
const STAND = 1197;

export const currentPose = (plan: PosePlan, t: number): { pose: string; since: number; index: number } => {
  let cur = plan[0];
  let idx = 0;
  plan.forEach((p, i) => {
    if (t >= p.t) {
      cur = p;
      idx = i;
    }
  });
  return { pose: cur.pose, since: cur.t, index: idx };
};

export type Enter = { kind: "peek"; from: "left" | "right" | "bottom"; t0: number; dist?: number } | { kind: "pop"; t0: number };

export const OwlActor: React.FC<{
  t: number;
  x: number;
  y: number;
  h: number;
  poses: PosePlan;
  enter?: Enter;
  blinkAt?: number[];
  squashAt?: number;
  flipX?: boolean;
  tilt?: number; // degrees, extra
  blur?: number; // px, for fast moves
  ghosts?: { dx: number; dy: number; o: number }[];
  shadow?: number;
  opacity?: number;
  idle?: boolean;
  waveAt?: number; // the waving owl rocks from this time on
}> = ({ t, x, y, h, poses, enter, blinkAt = [], squashAt, flipX, tilt = 0, blur = 0, ghosts = [], shadow = 1, opacity = 1, idle = true, waveAt }) => {
  const cur = currentPose(poses, t);
  const first = poses[0].t;
  let pose = cur.pose;
  // an irregular blink: the closed-eye picture for ~3 frames
  if (pose === "owl-front" && blinkAt.some((b) => t >= b && t < b + 0.11)) pose = "owl-front-blink";
  const swapped = cur.index > 0 ? cur.since : null;
  const pop = swapped !== null ? popScale(t, swapped) : 1;

  // entrance
  let ex = 0;
  let ey = 0;
  let es = 1;
  let er = 0;
  let eo = 1;
  if (enter) {
    const p = spring01(t, enter.t0, 11, 5.5);
    if (enter.kind === "peek") {
      const d = (enter.dist ?? h * 1.1) * (1 - p);
      if (enter.from === "left") ex = -d;
      if (enter.from === "right") ex = d;
      if (enter.from === "bottom") ey = d;
      er = (enter.from === "left" ? -1 : enter.from === "right" ? 1 : 0) * 14 * (1 - p);
    } else {
      es = p;
    }
    eo = clamp((t - enter.t0) / 0.05);
  }
  const [sqx, sqy] = squashAt !== undefined ? squash(t, squashAt) : [1, 1];
  const floatY = idle ? Math.sin(t * 2.3 + 0.7) * h * 0.012 : 0;
  const breathe = idle ? 1 + Math.sin(t * 2.7) * 0.014 : 1;
  const sway = (idle ? Math.sin(t * 1.35) * 1.3 : 0) + tilt + er + (waveAt !== undefined && t > waveAt ? Math.sin((t - waveAt) * 7) * 3.5 : 0);
  const ph = (pose === "owl-fly" ? NH["owl-fly"] : STAND) / STAND;
  const hh = h * ph;
  const lift = Math.max(0, -floatY);
  const show = t >= first - 0.001 && eo > 0;

  if (!show) return null;
  return (
    <>
      {/* soft contact shadow */}
      {shadow > 0 && (
        <div style={{ position: "absolute", left: x + ex * 0.2, top: y - h * 0.035, width: h * 0.62, height: h * 0.075, transform: `translateX(-50%) scale(${(1 - lift / h * 4) * es * sqx})`, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)", opacity: shadow * eo * opacity, filter: "blur(4px)" }} />
      )}
      {ghosts.map((g, i) => (
        <img key={i} src={staticFile(`art/${pose}.png`)} style={{ position: "absolute", left: x + g.dx + ex, top: y + g.dy + ey, height: hh, transform: `translate(-50%,-100%) scaleX(${flipX ? -1 : 1})`, opacity: g.o * opacity, filter: "blur(10px)" }} />
      ))}
      <div style={{ position: "absolute", left: x + ex, top: y + ey + floatY, width: 0, height: 0, opacity: eo * opacity }}>
        <div style={{ position: "absolute", left: 0, bottom: 0, transform: `translateX(-50%) rotate(${sway}deg) scale(${es * sqx * pop * breathe * (flipX ? 1 : 1)}, ${es * sqy * pop * breathe})`, transformOrigin: "50% 100%" }}>
          <Img src={staticFile(`art/${pose}.png`)} style={{ height: hh, display: "block", transform: flipX ? "scaleX(-1)" : undefined, filter: `${blur ? `blur(${blur}px) ` : ""}drop-shadow(0 8px 14px rgba(0,0,0,0.35)) drop-shadow(0 0 22px rgba(143,178,255,0.18))` }} />
        </div>
      </div>
      {swapped !== null && <Sparkles t={t} t0={swapped} x={x + ex} y={y - h * 0.55} size={h * 0.42} />}
      {enter && enter.kind === "pop" && <Sparkles t={t} t0={enter.t0} x={x} y={y - h * 0.55} size={h * 0.42} />}
    </>
  );
};
