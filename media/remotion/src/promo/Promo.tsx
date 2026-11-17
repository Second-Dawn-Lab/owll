import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Background } from "../Background";
import { C, FONT } from "../theme";
import { clamp, ease, easeInOut } from "./fx";
import { Layout, Timeline, layoutFor } from "./layout";
import { OwlActor } from "./OwlActor";
import { SCENES } from "./scenes";
import { Card3D } from "../components";

const LEAD = 6; // frames: a transition is centred on the downbeat that starts the next scene
const TYPES = ["whip", "zoom", "flip", "whip", "wipe", "zoom", "whip", "flip", "zoom"] as const;

const Transition: React.FC<{ kind: (typeof TYPES)[number]; f: number; durFrames: number; lead: number; first: boolean; last: boolean; L: Layout; children: React.ReactNode }> = ({ kind, f, durFrames, lead, first, last, L, children }) => {
  const span = 2 * lead;
  const pin = first ? 1 : clamp(f / span);
  const pout = last ? 0 : clamp((f - durFrames) / span);
  const ein = ease(pin);
  const eout = easeInOut(pout);
  let style: React.CSSProperties = {};
  if (kind === "whip") {
    const x = (1 - ein) * L.W * 1.0 - eout * L.W * 0.7;
    style = { transform: `translateX(${x}px) skewX(${(1 - ein) * -8 + eout * 8}deg)`, filter: `blur(${(1 - ein) * 16 + eout * 12}px)`, opacity: 1 - eout * 0.4 };
  } else if (kind === "zoom") {
    const s = (0.82 + 0.18 * ein) * (1 + eout * 0.35);
    style = { transform: `scale(${s})`, opacity: clamp(ein * 1.5) * (1 - eout), filter: `blur(${(1 - ein) * 10 + eout * 14}px)` };
  } else if (kind === "flip") {
    style = { transform: `perspective(1600px) rotateX(${(1 - ein) * -65 + eout * 65}deg) scale(${0.9 + 0.1 * ein})`, opacity: clamp(ein * 1.4) * (1 - eout), transformOrigin: "50% 100%" };
  } else {
    style = { clipPath: pin < 1 ? `circle(${ein * 150}% at 50% 58%)` : "none", opacity: 1 - eout, transform: `scale(${1 + eout * 0.12})` };
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

export const Promo: React.FC<{ tl: Timeline }> = ({ tl }) => {
  const L = layoutFor(tl.fmt);
  const fps = tl.fps;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Background />
      {tl.scenes.map((sc, i) => {
        const first = i === 0;
        const last = i === tl.scenes.length - 1;
        const lead = first ? 0 : LEAD;
        const from = Math.round(sc.start * fps) - lead;
        const durFrames = Math.round(sc.dur * fps);
        const Scene = SCENES[sc.id];
        return (
          <Sequence key={sc.id} from={from} durationInFrames={durFrames + lead + (last ? 0 : LEAD)} layout="none">
            <SceneHost sc={sc} i={i} first={first} last={last} lead={lead} durFrames={durFrames} tl={tl} L={L} Scene={Scene} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const SceneHost: React.FC<{ sc: Timeline["scenes"][number]; i: number; first: boolean; last: boolean; lead: number; durFrames: number; tl: Timeline; L: Layout; Scene: React.FC<any> }> = ({ sc, i, first, last, lead, durFrames, tl, L, Scene }) => {
  const f = useCurrentFrame();
  const t = (f - lead) / tl.fps;
  return (
    <Transition kind={TYPES[i % TYPES.length]} f={f} durFrames={durFrames + lead} lead={LEAD} first={first} last={last} L={L}>
      <Scene sc={sc} t={t} L={L} tl={tl} lead={lead} />
    </Transition>
  );
};

// The thumbnail: the headset owl next to the meeting caption translation. Big, high-contrast text so that it reads at small size.
export const Thumb: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT }}>
    <Background />
    <div style={{ position: "absolute", left: 56, top: 64, width: 640, color: C.white, fontWeight: 800, fontSize: 104, lineHeight: 1.02, letterSpacing: -2, textShadow: "0 6px 30px rgba(0,0,0,0.45)" }}>
      Live <span style={{ color: C.lavender, textShadow: "0 0 40px rgba(138,92,255,0.8)" }}>meeting</span> translation
    </div>
    <div style={{ position: "absolute", left: 60, top: 420, display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ background: C.green, color: "#06281B", fontWeight: 800, fontSize: 40, padding: "10px 26px", borderRadius: 999, boxShadow: "0 0 36px rgba(61,220,151,0.6)" }}>100% offline</div>
    </div>
    <div style={{ position: "absolute", left: 60, top: 520, color: C.ink, fontWeight: 700, fontSize: 34, opacity: 0.85 }}>Free · Open source</div>
    <Card3D src="meeting.png" width={500} left={760} top={90} rotateY={-9} rotateX={4} glow={0.8} highlight={{ x: 0.02, y: 0.62, w: 0.96, h: 0.36 }} />
    <OwlActor t={0.5} x={640} y={705} h={400} poses={[{ t: 0, pose: "owl-headset" }]} idle={false} />
  </AbsoluteFill>
);
