// A 10-second preview of the owl: it flies in and lands, breathes and blinks, tilts its head, waves, closes a lock, and puts on glasses,
// while the camera shows it from several angles. Run: npm run owl-preview (writes E:\SecondDawn\media\out\v2\owl-preview.mp4).
import React, { useLayoutEffect } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { Owl, Lock, Platform, OwlPose } from "./Owl";
import { Background } from "./Background";
import { C, FONT } from "./theme";

export const PREVIEW_SECONDS = 10.5;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ramp = (t: number, a: number, b: number, e: (x: number) => number = Easing.inOut(Easing.cubic)) => e(clamp((t - a) / (b - a)));
const pulse = (t: number, a: number, w: number) => Math.max(0, 1 - Math.abs(t - a) / w); // a triangle around time a
const overshoot = (t: number, a: number, dur: number) => {
  // a damped spring from 0 to 1 starting at a
  const x = t - a;
  if (x <= 0) return 0;
  return 1 - Math.exp(-x * (6 / dur)) * Math.cos(x * (11 / dur));
};

export const owlPoseAt = (t: number): { pose: OwlPose; lock: { scale: number; closed: number; glow: number } } => {
  // fly in (0 .. 1.6 s): an arc from the upper right, with fast wing flaps
  const p = ramp(t, 0, 1.6, Easing.out(Easing.cubic));
  const flying = 1 - p;
  const x = 3.8 * flying;
  const y = 3.4 * Math.pow(flying, 1.3) + Math.sin(Math.PI * p) * 0.7 * flying;
  const z = -1.6 * flying;
  const flapping = t < 1.9 ? (0.55 + 0.6 * Math.sin(t * 27)) * clamp(flying * 2.2) : 0;
  // landing squash: a damped bounce right after touching down
  const land = t - 1.6;
  const squash = land > 0 ? Math.exp(-land * 7.5) * Math.cos(land * 17) * 0.9 : 0;
  // head: tilt (3.2 .. 4.7 s), turn towards the lock (6.2 .. 8.0 s), a small tilt with the glasses (8.4 s)
  const tilt = 0.4 * Math.sin(Math.PI * ramp(t, 3.2, 4.7, (v) => v)) + 0.12 * Math.sin(Math.PI * ramp(t, 8.3, 9.4, (v) => v));
  const turn = 0.2 * Math.sin(Math.PI * ramp(t, 3.4, 4.7, (v) => v)) + 0.55 * Math.sin(Math.PI * ramp(t, 6.1, 8.1, (v) => v));
  const nod = 0.12 * Math.sin(Math.PI * ramp(t, 6.8, 7.4, (v) => v));
  // right wing: a wave (4.8 .. 6.1 s), then a reach towards the lock
  const wave = ramp(t, 4.8, 5.2) * (1 - ramp(t, 5.9, 6.2)) * (2.3 + 0.28 * Math.sin((t - 4.8) * 15));
  const reach = Math.sin(Math.PI * ramp(t, 6.6, 7.6, (v) => v)) * 0.95;
  const blink = Math.max(pulse(t, 2.75, 0.09), pulse(t, 7.0, 0.09), pulse(t, 9.2, 0.09), pulse(t, 5.4, 0.09));
  const glasses = clamp(overshoot(t, 8.15, 0.6) * (t > 8.15 ? 1 : 0), 0, 1.15);
  const lockIn = overshoot(t, 6.1, 0.5) * (1 - ramp(t, 7.9, 8.2));
  const closed = clamp(overshoot(t, 7.05, 0.4));
  const glow = clamp((t - 7.2) / 0.7) * (t < 7.9 ? 1 : 0);
  return {
    pose: {
      position: [x, y, z],
      rotation: [0, -0.9 * flying, 0.25 * flying],
      squash,
      flap: 0.14 + flapping + (t > 1.6 && t < 2.0 ? Math.sin((t - 1.6) * 26) * 0.35 * (1 - (t - 1.6) / 0.4) : 0),
      waveRight: Math.max(wave, reach),
      headTilt: tilt,
      headTurn: turn,
      headNod: nod,
      blink,
      breathe: t * 3.2,
      glasses,
      look: [Math.sin(t * 0.9) * 0.6 + turn * 0.8, 0.2],
      feetOffset: flying > 0.02 ? clamp(flying * 1.5) : 0,
    },
    lock: { scale: lockIn * 0.95, closed, glow },
  };
};

const CAMERA_KEYS: { t: number; az: number; el: number; d: number; ty: number }[] = [
  { t: 0, az: 0.1, el: 0.12, d: 9.5, ty: 0.9 },
  { t: 1.8, az: 0.5, el: 0.15, d: 7.5, ty: 0.55 },
  { t: 3.3, az: 1.0, el: 0.1, d: 6.8, ty: 0.5 },
  { t: 4.8, az: 0.05, el: 0.12, d: 7.0, ty: 0.55 },
  { t: 6.2, az: -0.45, el: 0.14, d: 7.6, ty: 0.5 },
  { t: 7.6, az: -0.75, el: 0.1, d: 7.8, ty: 0.5 },
  { t: 8.4, az: -0.15, el: 0.1, d: 6.7, ty: 0.8 },
  { t: 9.6, az: 0.12, el: 0.18, d: 6.6, ty: 0.6 },
  { t: PREVIEW_SECONDS, az: 0.25, el: 0.3, d: 7.4, ty: 0.55 },
];
const camAt = (t: number) => {
  const ks = CAMERA_KEYS;
  for (let i = 0; i < ks.length - 1; i++) {
    if (t <= ks[i + 1].t) {
      const u = Easing.inOut(Easing.cubic)(clamp((t - ks[i].t) / (ks[i + 1].t - ks[i].t)));
      const m = (a: number, b: number) => a + (b - a) * u;
      return { az: m(ks[i].az, ks[i + 1].az), el: m(ks[i].el, ks[i + 1].el), d: m(ks[i].d, ks[i + 1].d), ty: m(ks[i].ty, ks[i + 1].ty) };
    }
  }
  return ks[ks.length - 1];
};

export const CameraRig: React.FC<{ az: number; el: number; d: number; ty: number; tx?: number }> = ({ az, el, d, ty, tx = 0.25 }) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(tx + d * Math.sin(az) * Math.cos(el), ty + d * Math.sin(el), d * Math.cos(az) * Math.cos(el));
    camera.lookAt(tx, ty, 0);
    camera.updateProjectionMatrix();
  }, [camera, az, el, d, ty, tx]);
  return null;
};

export const Lights: React.FC = () => (
  <>
    <ambientLight intensity={1.0} />
    <hemisphereLight args={["#ffffff", "#5a3ad0", 0.6]} />
    <directionalLight position={[3, 5, 6]} intensity={2.4} color="#ffffff" />
    <directionalLight position={[-5, 3, -4]} intensity={2.6} color="#8fb2ff" />
    <directionalLight position={[5, 2, -5]} intensity={2.0} color="#c18cff" />
    <pointLight position={[0, 1, 4]} intensity={8} color="#ffffff" distance={12} />
  </>
);

const LABELS: [number, number, string][] = [
  [0, 1.6, "fly in with wing flaps"],
  [1.6, 2.3, "landing squash"],
  [2.3, 3.2, "breathing, blink"],
  [3.2, 4.7, "head tilt"],
  [4.7, 6.2, "wing wave"],
  [6.2, 8.1, "closing the lock"],
  [8.1, 9.6, "glasses"],
  [9.6, 99, "front view"],
];

export const OwlPreview: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const { pose, lock } = owlPoseAt(t);
  const cam = camAt(t);
  const label = LABELS.find(([a, b]) => t >= a && t < b)?.[2] ?? "";
  const azDeg = Math.round((cam.az * 180) / Math.PI);
  return (
    <AbsoluteFill>
      <Background />
      <ThreeCanvas width={width} height={height} camera={{ fov: 30, position: [0, 1, 8], near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true }}>
        <Lights />
        <CameraRig {...cam} />
        <Platform y={-0.775} r={1.7} />
        <Owl pose={pose} />
        {lock.scale > 0.01 && <Lock position={[2.1, -0.2, 0.4]} scale={lock.scale} closed={lock.closed} glow={lock.glow} />}
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 60, top: 48, fontFamily: FONT, color: C.ink, fontWeight: 800, fontSize: 40 }}>Owl-L mascot (3D, built from code)</div>
      <div style={{ position: "absolute", left: 60, bottom: 52, fontFamily: FONT, color: C.ink, fontWeight: 700, fontSize: 46, opacity: 0.95 }}>{label}</div>
      <div style={{ position: "absolute", right: 60, bottom: 58, fontFamily: FONT, color: C.muted, fontWeight: 600, fontSize: 30 }}>camera azimuth {azDeg}°</div>
    </AbsoluteFill>
  );
};
