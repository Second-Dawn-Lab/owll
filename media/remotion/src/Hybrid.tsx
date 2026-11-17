// Scenes 1 and 2 as a hybrid of layers: a photo-real owl (public-domain photo, 2.5D), a CC0 laptop model (Poly Haven "Classic Laptop" by Arrangemonk)
// lit by an HDRI, soft volumetric clouds (drei <Clouds>, a texture generated for this project), illustrated glow layers, and small glowing text cards.
import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useLoader } from "@react-three/fiber";
import { Cloud, Clouds } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Background } from "./Background";
import { Env, Studio } from "./OwlGlb";
import { Photo25D } from "./Owl25D";
import { Headline, Subtitle } from "./components";
import { CameraRig } from "./OwlPreview";
import { C, FONT } from "./theme";

const LaptopModel: React.FC<{ position: [number, number, number]; scale: number; rotationY?: number; screenGlow?: number }> = ({ position, scale, rotationY = 0, screenGlow = 1 }) => {
  const gltf = useLoader(GLTFLoader, staticFile("laptop/classic_laptop_1k.gltf"));
  const root = React.useMemo(() => {
    const r = gltf.scene.clone(true);
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        if (mat.name.includes("screen")) {
          mat.color = new THREE.Color("#0b0a24");
          mat.emissive = new THREE.Color("#7a52f4");
          mat.emissiveIntensity = 0.9 * screenGlow;
          mat.roughness = 0.15;
          mat.metalness = 0;
        }
        m.material = mat;
      }
    });
    return r;
  }, [gltf, screenGlow]);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <primitive object={root} />
      {/* the glow of the screen on the keyboard and the owl */}
      <pointLight position={[0, 0.16, 0.12]} intensity={1.6 * screenGlow} color="#8a5cff" distance={0.9} />
    </group>
  );
};

const Bokeh: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 30;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 16 }, (_, i) => {
        const x = ((i * 337) % 1920);
        const y = 120 + ((i * 211) % 800);
        const r = 30 + ((i * 53) % 90);
        return <div key={i} style={{ position: "absolute", left: x + Math.sin(t * 0.5 + i) * 14, top: y, width: r, height: r, borderRadius: "50%", background: `radial-gradient(circle, rgba(${i % 2 ? "143,178,255" : "176,124,255"},0.20), rgba(0,0,0,0) 70%)`, filter: "blur(6px)" }} />;
      })}
    </AbsoluteFill>
  );
};

// A small glowing text card: a few lines of "text", like a snippet leaving the laptop.
const TextCard: React.FC<{ x: number; y: number; rotate: number; scale: number; opacity: number; lines: number[]; hue?: string }> = ({ x, y, rotate, scale, opacity, lines, hue = "143,178,255" }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 190,
      padding: "14px 16px",
      borderRadius: 14,
      transform: `translate(-50%,-50%) rotate(${rotate}deg) scale(${scale})`,
      opacity,
      background: `linear-gradient(160deg, rgba(${hue},0.22), rgba(255,255,255,0.06))`,
      border: `1px solid rgba(${hue},0.7)`,
      boxShadow: `0 0 28px rgba(${hue},0.55), inset 0 0 18px rgba(${hue},0.18)`,
      backdropFilter: "blur(4px)",
    }}
  >
    {lines.map((w, i) => (
      <div key={i} style={{ height: 8, width: `${w}%`, borderRadius: 4, marginBottom: i < lines.length - 1 ? 9 : 0, background: "rgba(244,242,255,0.85)", boxShadow: "0 0 8px rgba(255,255,255,0.6)" }} />
    ))}
  </div>
);

const bez = (p0: number[], p1: number[], p2: number[], t: number) => [
  (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
  (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
];

const Cards: React.FC<{ t: number; fade?: number }> = ({ t, fade = 1 }) => {
  const from = [780, 430];
  const via = [980, 200];
  const to = [1700, 280];
  const cards = [
    { lines: [90, 70, 80], hue: "143,178,255" },
    { lines: [60, 85], hue: "176,124,255" },
    { lines: [95, 55, 75, 40], hue: "143,178,255" },
    { lines: [70, 90], hue: "201,182,250" },
    { lines: [85, 45, 65], hue: "143,178,255" },
  ];
  return (
    <>
      {cards.map((c, i) => {
        const p = Math.min(1, Math.max(0, (t * 0.5 - i * 0.12) % 1.2));
        const [x, y] = bez(from, via, to, p);
        const s = interpolate(p, [0, 0.15, 1], [0.35, 1, 0.45]);
        const o = interpolate(p, [0, 0.1, 0.85, 1], [0, 1, 0.9, 0]) * fade;
        return <TextCard key={i} x={x} y={y} rotate={-14 + p * 24 + i * 5} scale={s} opacity={o} lines={c.lines} hue={c.hue} />;
      })}
    </>
  );
};

const SceneCanvas: React.FC<{ cloudOpacity: number; screenGlow: number }> = ({ cloudOpacity, screenGlow }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: 28, position: [0, 0.6, 9], near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
      <Env intensity={0.8} />
      <Studio />
      <CameraRig az={0.16} el={0.05} d={9} ty={0.1} tx={0} />
      <LaptopModel position={[-1.0, -1.4, 0]} scale={3.3} rotationY={0.3} screenGlow={screenGlow} />
      <Photo25D src="owl25d/perched.png" depth="owl25d/perched_depth.png" height={1.25} position={[-1.0, 0.88, -0.05]} rotation={[0, 0.1, 0]} relief={0.3} />
      <group position={[1.5, 0.35, 0]}>
      <Clouds material={THREE.MeshBasicMaterial} texture={staticFile("cloud.png")} limit={140}>
        <Cloud seed={3} segments={30} bounds={[1.3, 0.35, 0.5]} volume={0.5} color="#ffffff" opacity={0.95 * cloudOpacity} fade={10} growth={1.2} speed={0} position={[3.9, 1.2, -1.5]} />
        <Cloud seed={9} segments={16} bounds={[0.9, 0.3, 0.4]} volume={0.4} color="#c9d4ff" opacity={0.8 * cloudOpacity} fade={10} speed={0} position={[4.8, 0.8, -1.9]} />
        <Cloud seed={21} segments={14} bounds={[0.8, 0.25, 0.4]} volume={0.35} color="#e6ecff" opacity={0.7 * cloudOpacity} fade={10} speed={0} position={[3.1, 0.8, -2.1]} />
      </Clouds>
      </group>
    </ThreeCanvas>
  );
};

// Scene 1: Where does your text go?
export const Hybrid1: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 30 + 1.2;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Background />
      <Bokeh />
      <SceneCanvas cloudOpacity={1} screenGlow={1} />
      <Cards t={t} />
      <Headline text="Where does your text go?" accent="text" />
      <Subtitle text="Every time you paste text into an online translator, it leaves your computer." />
    </AbsoluteFill>
  );
};

// Scene 2: the lock closes on the laptop; the cloud dissolves
const LockOverlay: React.FC<{ progress: number }> = ({ progress }) => (
  <svg width="260" height="300" viewBox="0 0 260 300" style={{ position: "absolute", left: 600, top: 400, filter: `drop-shadow(0 0 ${30 * progress}px rgba(201,182,250,0.95)) drop-shadow(0 0 70px rgba(138,92,255,0.8))`, opacity: Math.min(1, progress * 3) }}>
    <defs>
      <linearGradient id="lk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#B79CFF" />
        <stop offset="1" stopColor="#6D2EF0" />
      </linearGradient>
    </defs>
    <path d={`M65 130 V ${95 - 25 * (1 - progress)} a65 65 0 0 1 130 0 V130`} fill="none" stroke="#EDEAFB" strokeWidth="22" strokeLinecap="round" />
    <rect x="30" y="125" width="200" height="150" rx="28" fill="url(#lk)" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" />
    <circle cx="130" cy="188" r="20" fill="#1B1446" />
    <rect x="122" y="196" width="16" height="44" rx="8" fill="#1B1446" />
  </svg>
);

export const Hybrid2: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 30 + 1.2;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Background />
      <Bokeh />
      <SceneCanvas cloudOpacity={0.22} screenGlow={1.4} />
      <Cards t={t} fade={0.18} />
      <LockOverlay progress={1} />
      <Headline text="Owl-L · 100% offline" accent="100% offline" />
      <Subtitle text="Meet Owl-L. It translates right on your PC. No internet, no account, no subscription." />
    </AbsoluteFill>
  );
};
