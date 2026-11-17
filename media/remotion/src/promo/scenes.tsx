// The nine scenes of promo v2. Each one gets the scene time t (seconds, can be slightly negative during a transition), the layout of the output
// format and the timeline entry (cues in seconds, narration, clip ranges). The owl is the artwork of Second Dawn, animated in OwlActor.
import React from "react";
import { Img, staticFile } from "remotion";
import { C, FONT } from "../theme";
import { LogoGlow } from "../components";
import { GlowRing, Motes, Sparkles, clamp, ease, easeInOut, lerp, spring01, squash } from "./fx";
import { Layout, Scene, Timeline } from "./layout";
import { OwlActor } from "./OwlActor";
import { CompareBlock, DocFlip, Headline, Subtitle, VideoCard, cue } from "./parts";

export type SceneProps = { sc: Scene; t: number; L: Layout; tl: Timeline; lead: number };

const Frame: React.FC<SceneProps & { children?: React.ReactNode; headlineAt?: number; noHead?: boolean }> = ({ sc, t, L, tl, children, headlineAt = 0.35, noHead }) => (
  <>
    {children}
    {!noHead && <Headline text={sc.headline} accent={sc.accent} t={t} start={cue(sc, "head", headlineAt)} period={tl.period} L={L} />}
    <Subtitle sc={sc} t={t} L={L} />
  </>
);

// blink times, irregular: 3 to 5 s apart
const blinks = (seed: number) => [1.7 + seed * 0.3, 5.4 + seed * 0.5, 9.1 + seed * 0.2, 13.3];

// --- laptop and cloud (scenes 1 and 2) -----------------------------------------------------------------------------------------------------
const lapBox = (L: Layout) => {
  const w = L.fmt === "16x9" ? L.W * 0.3 : L.fmt === "9x16" ? L.W * 0.78 : L.W * 0.5;
  const h = w * (898 / 1354);
  const x = L.fmt === "16x9" ? L.W * 0.4 : L.W * 0.5;
  const yb = L.fmt === "16x9" ? L.H * 0.83 : L.fmt === "9x16" ? L.H * 0.74 : L.H * 0.75;
  return { w, h, x, yb, top: yb - h, screen: { x: x - w * 0.04, y: yb - h * 0.62 } };
};
const cloudBox = (L: Layout) => {
  const w = L.fmt === "16x9" ? L.W * 0.3 : L.fmt === "9x16" ? L.W * 0.62 : L.W * 0.42;
  return { w, h: w * (887 / 1350), x: L.fmt === "16x9" ? L.W * 0.74 : L.fmt === "9x16" ? L.W * 0.7 : L.W * 0.74, y: L.fmt === "16x9" ? L.H * 0.42 : L.fmt === "9x16" ? L.H * 0.3 : L.H * 0.34 };
};

const Cards: React.FC<{ t: number; t0: number; L: Layout; fade?: number; from: { x: number; y: number }; to: { x: number; y: number } }> = ({ t, t0, L, fade = 1, from, to }) => {
  const specs = [
    { lines: [90, 70, 80], hue: "143,178,255" },
    { lines: [60, 85], hue: "176,124,255" },
    { lines: [95, 55, 75, 40], hue: "143,178,255" },
    { lines: [70, 90], hue: "201,182,250" },
    { lines: [85, 45, 65], hue: "143,178,255" },
    { lines: [75, 60], hue: "176,124,255" },
  ];
  const via = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - L.H * 0.14 };
  return (
    <>
      {specs.map((c, i) => {
        const p = ((t - t0 - i * 0.42) / 2.2) % 1.35;
        if (t < t0 + i * 0.42 || p < 0 || p > 1) return null;
        const q = easeInOut(p);
        const x = (1 - q) * (1 - q) * from.x + 2 * (1 - q) * q * via.x + q * q * to.x;
        const y = (1 - q) * (1 - q) * from.y + 2 * (1 - q) * q * via.y + q * q * to.y;
        const s = lerp(0.5, 1, clamp(p / 0.2)) * lerp(1, 0.4, clamp((p - 0.6) / 0.4)) * (L.fmt === "16x9" ? 1 : 0.8);
        const o = clamp(p / 0.08) * clamp((1 - p) / 0.15) * fade;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 190, padding: "14px 16px", borderRadius: 14, transform: `translate(-50%,-50%) rotate(${-14 + p * 26 + i * 4}deg) scale(${s})`, opacity: o, background: `linear-gradient(160deg, rgba(${c.hue},0.24), rgba(255,255,255,0.06))`, border: `1px solid rgba(${c.hue},0.75)`, boxShadow: `0 0 28px rgba(${c.hue},0.6), inset 0 0 18px rgba(${c.hue},0.18)`, backdropFilter: "blur(4px)" }}>
            {c.lines.map((w, k) => (
              <div key={k} style={{ height: 8, width: `${w}%`, borderRadius: 4, marginBottom: k < c.lines.length - 1 ? 9 : 0, background: "rgba(244,242,255,0.88)", boxShadow: "0 0 8px rgba(255,255,255,0.65)" }} />
            ))}
          </div>
        );
      })}
    </>
  );
};

export const SceneWhere: React.FC<SceneProps> = (p) => {
  const { sc, t, L } = p;
  const lap = lapBox(L);
  const cl = cloudBox(L);
  const land = cue(sc, "land", 1.4);
  const ownerH = L.fmt === "16x9" ? 270 : L.fmt === "9x16" ? 330 : 200;
  const landX = lap.x - lap.w * 0.03;
  const landY = lap.top + lap.h * 0.1;
  // the swoop: a quadratic path from off-screen (upper right) to the laptop
  const u = clamp(t / land);
  const e = 1 - Math.pow(1 - u, 3);
  const P0 = { x: L.W + 260, y: -200 };
  const P1 = { x: L.W * 0.78, y: L.H * 0.12 };
  const P2 = { x: landX, y: landY };
  const bz = (k: number) => ({ x: (1 - k) * (1 - k) * P0.x + 2 * (1 - k) * k * P1.x + k * k * P2.x, y: (1 - k) * (1 - k) * P0.y + 2 * (1 - k) * k * P1.y + k * k * P2.y });
  const pos = bz(e);
  const flying = t < land;
  const ghosts = flying ? [0.05, 0.1, 0.16].map((d, i) => { const q = bz(1 - Math.pow(1 - clamp((t - d) / land), 3)); return { dx: q.x - pos.x, dy: q.y - pos.y, o: 0.32 - i * 0.09 }; }) : [];
  const fl = flying ? Math.sin(t * 85) * 5 - 8 * (1 - u) : 0;
  const cloudIn = spring01(t, 0.1, 10, 6);
  return (
    <Frame {...p}>
      <Img src={staticFile("art/cloud.png")} style={{ position: "absolute", left: cl.x - cl.w / 2, top: cl.y - cl.h / 2 + Math.sin(t * 1.1) * 8, width: cl.w, opacity: clamp(cloudIn * 2) * 0.96, transform: `scale(${0.8 + 0.2 * cloudIn})`, filter: "drop-shadow(0 0 40px rgba(143,178,255,0.45))" }} />
      <Img src={staticFile("art/laptop.png")} style={{ position: "absolute", left: lap.x - lap.w / 2, top: lap.top, width: lap.w, transform: `translateY(${(1 - spring01(t, 0, 12, 6)) * 60}px)`, opacity: clamp(spring01(t, 0, 12, 6) * 2), filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.5)) drop-shadow(0 0 50px rgba(138,92,255,0.3))" }} />
      <Cards t={t} t0={cue(sc, "cards", 2.2)} L={L} from={{ x: lap.x, y: lap.top + lap.h * 0.35 }} to={{ x: cl.x, y: cl.y }} />
      <OwlActor t={t} x={flying ? pos.x : landX} y={flying ? pos.y : landY} h={ownerH} poses={[{ t: 0, pose: "owl-fly" }, { t: land, pose: "owl-front" }]} squashAt={land} blur={flying ? 16 * Math.pow(1 - u, 1.6) : 0} ghosts={ghosts} tilt={fl} blinkAt={blinks(0).map((b) => b + land)} shadow={flying ? 0 : 1} />
    </Frame>
  );
};

export const SceneOffline: React.FC<SceneProps> = (p) => {
  const { sc, t, L } = p;
  const lap = lapBox(L);
  const cl = cloudBox(L);
  const dis = cue(sc, "dissolve", 0.5);
  const lockOpen = cue(sc, "lock-open", 0.9);
  const lockClose = cue(sc, "lock-close", 1.9);
  const ownerH = L.fmt === "16x9" ? 270 : L.fmt === "9x16" ? 330 : 200;
  const landX = lap.x - lap.w * 0.03;
  const landY = lap.top + lap.h * 0.1;
  const dp = easeInOut(clamp((t - dis) / 1.1));
  const closed = t >= lockClose;
  const lockH = lap.h * 0.62;
  const lockIn = spring01(t, lockOpen, 12, 6);
  const [sx, sy] = squash(t, lockClose);
  const lx = lap.screen.x;
  const ly = lap.screen.y + lockH * 0.5;
  const flash = clamp(1 - (t - lockClose) / 0.35) * (t >= lockClose ? 1 : 0);
  return (
    <Frame {...p}>
      <Img src={staticFile("art/cloud.png")} style={{ position: "absolute", left: cl.x - cl.w / 2, top: cl.y - cl.h / 2, width: cl.w, opacity: (1 - dp) * 0.96, transform: `scale(${1 + 0.35 * dp})`, filter: `blur(${dp * 26}px) drop-shadow(0 0 40px rgba(143,178,255,0.4))` }} />
      {dp > 0 && dp < 1 && <Motes t={t} x={cl.x - cl.w / 2} y={cl.y - cl.h / 2} w={cl.w} h={cl.h} n={26} speed={2.5} opacity={(1 - dp) * 1.2} />}
      <Img src={staticFile("art/laptop.png")} style={{ position: "absolute", left: lap.x - lap.w / 2, top: lap.top, width: lap.w, filter: `drop-shadow(0 30px 40px rgba(0,0,0,0.5)) drop-shadow(0 0 ${50 + flash * 70}px rgba(138,92,255,${0.3 + flash * 0.6}))` }} />
      <Cards t={t + 3} t0={0} L={L} fade={clamp(1 - t / 0.6) * 0.8} from={{ x: lap.x, y: lap.top + lap.h * 0.35 }} to={{ x: cl.x, y: cl.y }} />
      {t >= lockOpen && (
        <div style={{ position: "absolute", left: lx, top: ly, width: 0, height: 0, filter: `drop-shadow(0 0 ${24 + flash * 60}px rgba(201,182,250,${0.7 + flash * 0.3}))` }}>
          <Img src={staticFile(closed ? "art/padlock-closed.png" : "art/padlock-open.png")} style={{ position: "absolute", height: lockH, left: 0, top: 0, transform: `translate(-50%,-50%) scale(${(0.15 + 0.85 * lockIn) * (closed ? sx : 1)}, ${(0.15 + 0.85 * lockIn) * (closed ? sy : 1)}) rotate(${closed ? 0 : Math.sin(t * 4) * 2}deg)` }} />
        </div>
      )}
      <GlowRing t={t} t0={lockClose} x={lx} y={ly} size={lockH * 1.1} />
      <GlowRing t={t} t0={lockClose + 0.12} x={lx} y={ly} size={lockH * 0.8} color="255,255,255" />
      <Sparkles t={t} t0={lockClose} x={lx} y={ly} size={lockH * 0.9} count={9} />
      <OwlActor t={t} x={landX} y={landY} h={ownerH} poses={[{ t: -1, pose: "owl-front" }, { t: lockClose, pose: "owl-lock" }]} blinkAt={blinks(1)} />
    </Frame>
  );
};

// --- scenes 3 to 7: an app card with the owl as a side character --------------------------------------------------------------------
const owlSpot = (L: Layout, side: "left" | "right") => (side === "left" ? L.owl.left : L.owl.right);

export const SceneMeeting: React.FC<SceneProps> = (p) => {
  const { sc, t, L, tl, lead } = p;
  const s = owlSpot(L, "left");
  return (
    <Frame {...p}>
      <VideoCard sc={sc} t={t} tl={tl} L={L} lead={lead} appear={0.05} tilt={-7} />
      <OwlActor t={t} x={s.x} y={s.y} h={L.owl.h} poses={[{ t: cue(sc, "peek", 0.9), pose: "owl-headset" }]} enter={{ kind: "peek", from: "left", t0: cue(sc, "peek", 0.9) }} />
    </Frame>
  );
};

export const SceneCapture: React.FC<SceneProps> = (p) => {
  const { sc, t, L, tl, lead } = p;
  const s = owlSpot(L, "right");
  return (
    <Frame {...p}>
      <VideoCard sc={sc} t={t} tl={tl} L={L} lead={lead} appear={0.05} tilt={6} />
      <OwlActor t={t} x={s.x} y={s.y} h={L.owl.h} poses={[{ t: cue(sc, "peek", 0.9), pose: "owl-magnifier" }]} enter={{ kind: "peek", from: "right", t0: cue(sc, "peek", 0.9) }} />
    </Frame>
  );
};

export const ScenePopup: React.FC<SceneProps> = (p) => {
  const { sc, t, L, tl, lead } = p;
  const s = owlSpot(L, "left");
  return (
    <Frame {...p}>
      <VideoCard sc={sc} t={t} tl={tl} L={L} lead={lead} appear={0.05} tilt={-5} />
      <OwlActor t={t} x={s.x} y={s.y} h={L.owl.h} poses={[{ t: cue(sc, "peek", 0.9), pose: "owl-front" }]} enter={{ kind: "peek", from: "left", t0: cue(sc, "peek", 0.9) }} blinkAt={blinks(2).map((b) => b + 1)} />
    </Frame>
  );
};

export const SceneDocs: React.FC<SceneProps> = (p) => {
  const { sc, t, L } = p;
  const s = owlSpot(L, "right");
  return (
    <Frame {...p}>
      <DocFlip t={t} flipAt={cue(sc, "flip", 2.0)} L={L} appear={0.05} />
      <OwlActor t={t} x={s.x} y={s.y} h={L.owl.h} poses={[{ t: cue(sc, "pop", 0.7), pose: "owl-document" }]} enter={{ kind: "pop", t0: cue(sc, "pop", 0.7) }} />
    </Frame>
  );
};

export const SceneWrite: React.FC<SceneProps> = (p) => {
  const { sc, t, L, tl, lead } = p;
  const s = owlSpot(L, "left");
  return (
    <Frame {...p}>
      <VideoCard sc={sc} t={t} tl={tl} L={L} lead={lead} appear={0.05} tilt={5} />
      <OwlActor t={t} x={s.x} y={s.y} h={L.owl.h} poses={[{ t: cue(sc, "pop", 1.0), pose: "owl-glasses" }]} enter={{ kind: "pop", t0: cue(sc, "pop", 1.0) }} />
    </Frame>
  );
};

export const SceneCompare: React.FC<SceneProps> = (p) => {
  const { sc, t, L } = p;
  const s = owlSpot(L, "right");
  return (
    <Frame {...p}>
      <CompareBlock t={t} L={L} appear={0.05} ticks={[cue(sc, "tick1", 1.0), cue(sc, "tick2", 1.5), cue(sc, "tick3", 2.0)]} />
      <OwlActor t={t} x={s.x} y={s.y} h={L.owl.h} poses={[{ t: cue(sc, "pop", 2.6), pose: "owl-thumbsup" }]} enter={{ kind: "pop", t0: cue(sc, "pop", 2.6) }} />
    </Frame>
  );
};

export const SceneOutro: React.FC<SceneProps> = (p) => {
  const { sc, t, L } = p;
  const dark = clamp(t / 0.6);
  const logoAt = cue(sc, "logo", 0.5);
  const owlAt = cue(sc, "owl", 0.2);
  const lp = spring01(t, logoAt, 11, 5.5);
  const wide = L.fmt === "16x9";
  const logoSize = wide ? 330 : L.fmt === "9x16" ? 380 : 260;
  const lx = wide ? L.W * 0.27 : (L.W - logoSize) / 2;
  const ly = wide ? 190 : L.fmt === "9x16" ? 300 : 90;
  const ownerH = wide ? 560 : L.fmt === "9x16" ? 430 : 300;
  const ox = wide ? L.W * 0.8 : L.fmt === "9x16" ? L.W * 0.74 : L.W * 0.82;
  const oy = wide ? 960 : L.fmt === "9x16" ? 1720 : 930;
  const cx = wide ? lx + logoSize / 2 : L.W / 2;
  const textTop = ly + logoSize + (wide ? 50 : 40);
  const fs = wide ? 118 : L.fmt === "9x16" ? 120 : 84;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `rgba(4,6,18,${0.82 * dark})` }} />
      <Motes t={t} x={0} y={0} w={L.W} h={L.H} n={34} speed={0.7} opacity={dark} />
      <LogoGlow size={logoSize} left={lx} top={ly} scale={0.2 + 0.8 * Math.min(1.08, lp)} glow={clamp(lp)} />
      <GlowRing t={t} t0={logoAt + 0.1} x={lx + logoSize / 2} y={ly + logoSize / 2} size={logoSize * 1.3} color="255,255,255" />
      <div style={{ position: "absolute", left: cx - L.W, width: L.W * 2, top: textTop, textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: fs, color: C.white, letterSpacing: -2, opacity: clamp((t - logoAt - 0.2) / 0.3), transform: `translateY(${(1 - ease(clamp((t - logoAt - 0.2) / 0.5))) * 40}px)` }}>Owl-L</div>
      <div style={{ position: "absolute", left: cx - L.W, width: L.W * 2, top: textTop + fs * 1.25, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: fs * 0.4, color: C.lavender, opacity: clamp((t - logoAt - 0.6) / 0.3) }}>github.com/Second-Dawn-Lab/owll</div>
      <div style={{ position: "absolute", left: cx - L.W, width: L.W * 2, top: textTop + fs * 1.25 + fs * 0.62, textAlign: "center", fontFamily: FONT, fontWeight: 600, fontSize: fs * 0.33, color: C.muted, opacity: clamp((t - logoAt - 1.0) / 0.3) }}>⭐ Star it on GitHub</div>
      <OwlActor t={t} x={ox} y={oy} h={ownerH} poses={[{ t: owlAt, pose: "owl-wave" }]} enter={{ kind: "pop", t0: owlAt }} waveAt={owlAt + 0.5} />
      <Subtitle sc={sc} t={t} L={L} />
    </>
  );
};

export const SCENES: Record<string, React.FC<SceneProps>> = {
  where: SceneWhere,
  offline: SceneOffline,
  meeting: SceneMeeting,
  capture: SceneCapture,
  popup: ScenePopup,
  docs: SceneDocs,
  write: SceneWrite,
  compare: SceneCompare,
  outro: SceneOutro,
};
