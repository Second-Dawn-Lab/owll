// One still per scene, showing how the final video will look (script of the brief, scenes 1 to 9). Run: npm run style-frames
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { Background } from "./Background";
import { Owl, Lock, OwlPose } from "./Owl";
import { CameraRig, Lights } from "./OwlPreview";
import { Card3D, Chip, CompareCard, Headline, LogoGlow, Subtitle } from "./components";
import { C, FONT } from "./theme";

// --- small 3D props for the first scenes ---------------------------------------------------------------------------------------------
const Laptop: React.FC<{ position?: [number, number, number]; scale?: number; glow?: number }> = ({ position = [0, 0, 0], scale = 1, glow = 1 }) => {
  const base = React.useMemo(() => {
    const s = new THREE.Shape();
    const w = 1.5, h = 1.0, r = 0.1;
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
    s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4 });
  }, []);
  return (
    <group position={position} scale={scale}>
      {/* keyboard deck, lying down */}
      <mesh geometry={base} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.1]}>
        <meshStandardMaterial color="#C8CCE0" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.07, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.3, 0.9]} />
        <meshStandardMaterial color="#2A2F4A" roughness={0.6} />
      </mesh>
      {/* screen, tilted back */}
      <group position={[0, 0.06, -0.9]} rotation={[-0.22, 0, 0]}>
        <mesh geometry={base} scale={[1, 0.72, 1]} position={[0, 0.72, 0]}>
          <meshStandardMaterial color="#C8CCE0" roughness={0.35} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.72, 0.1]}>
          <planeGeometry args={[2.7, 1.45]} />
          <meshStandardMaterial color="#14123A" emissive="#6D2EF0" emissiveIntensity={0.55 * glow} />
        </mesh>
        {[0.35, 0.55, 0.75, 0.95, 1.15].map((y, i) => (
          <mesh key={i} position={[-0.7 + (i % 2) * 0.12, y, 0.11]}>
            <planeGeometry args={[1.0 + (i % 3) * 0.45, 0.07]} />
            <meshBasicMaterial color="#C9B6FA" transparent opacity={0.75} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

const Cloud: React.FC<{ position?: [number, number, number]; scale?: number; opacity?: number }> = ({ position = [0, 0, 0], scale = 1, opacity = 1 }) => (
  <group position={position} scale={scale}>
    {[[0, 0, 0, 0.8], [0.8, -0.1, 0, 0.62], [-0.8, -0.12, 0, 0.6], [0.35, 0.45, 0, 0.55], [-0.35, 0.38, 0, 0.5], [1.35, -0.2, 0, 0.4]].map(([x, y, z, r], i) => (
      <mesh key={i} position={[x, y, z]}>
        <sphereGeometry args={[r, 32, 24]} />
        <meshStandardMaterial color="#DCE6FF" roughness={0.6} transparent opacity={0.9 * opacity} emissive="#5F86FF" emissiveIntensity={0.25} />
      </mesh>
    ))}
  </group>
);

const Stage3D: React.FC<{ children: React.ReactNode; az?: number; d?: number; ty?: number; tx?: number }> = ({ children, az = 0, d = 12, ty = 0.5, tx = 0 }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: 30, position: [0, 1, 12], near: 0.1, far: 80 }} gl={{ antialias: true, alpha: true }}>
      <Lights />
      <CameraRig az={az} el={0.1} d={d} ty={ty} tx={tx} />
      {children}
    </ThreeCanvas>
  );
};

const stand: OwlPose = { flap: 0.12, breathe: 0.5 };

const Frame: React.FC<{ children: React.ReactNode; headline: string; accent?: string; subtitle?: string; dark?: boolean }> = ({ children, headline, accent, subtitle, dark }) => (
  <AbsoluteFill style={{ fontFamily: FONT }}>
    <Background dark={dark} />
    {children}
    <Headline text={headline} accent={accent} />
    {subtitle && <Subtitle text={subtitle} />}
  </AbsoluteFill>
);

// 1: the owl lands on a laptop; snippets float out into a cloud
export const Style1: React.FC = () => (
  <Frame headline="Where does your text go?" accent="text" subtitle="Every time you paste text into an online translator, it leaves your computer.">
    <Stage3D az={0.12} d={13} ty={0.9} tx={0.5}>
      <Laptop position={[-1.8, -1.3, 0]} scale={1.0} />
      <Owl pose={{ ...stand, position: [-1.9, 0.5, -0.6], scale: 0.55, rotation: [0, 0.25, 0] }} />
      <Cloud position={[4.1, 2.2, -1]} scale={1.1} />
    </Stage3D>
    <Chip text="Dear Anna, here is the draft…" left={720} top={470} rotate={-6} />
    <Chip text="contract_final_v3.docx" left={900} top={390} rotate={4} opacity={0.85} />
    <Chip text="meeting notes, Monday" left={1060} top={300} rotate={-3} opacity={0.7} />
    <Chip text="salary review" left={1180} top={230} rotate={5} opacity={0.5} scale={0.9} />
  </Frame>
);

// 2: the owl closes the lock; the cloud dissolves
export const Style2: React.FC = () => (
  <Frame headline="Owl-L · 100% offline" accent="100% offline" subtitle="Meet Owl-L. It translates right on your PC. No internet, no account, no subscription.">
    <Stage3D az={-0.1} d={13} ty={0.9} tx={0.3}>
      <Laptop position={[-1.8, -1.3, 0]} scale={1.0} />
      <Owl pose={{ ...stand, position: [-1.9, 0.5, -0.6], scale: 0.55, rotation: [0, -0.3, 0], waveRight: 0.9, headTurn: 0.4 }} />
      <Lock position={[1.2, -0.3, 0.6]} scale={1.1} closed={1} glow={0.5} />
      <Cloud position={[4.6, 2.4, -1]} scale={1.0} opacity={0.18} />
    </Stage3D>
  </Frame>
);

// 3: the meeting scene on a tilted card (the highlight of the video)
export const Style3: React.FC = () => (
  <Frame headline="Live meeting translation" accent="meeting" subtitle="In a meeting in another language? Turn on captions, and Owl-L translates them live, speaker by speaker.">
    <Card3D src="meeting.png" width={700} left={610} top={190} rotateY={-9} rotateX={4} glow={0.7} highlight={{ x: 0.02, y: 0.62, w: 0.96, h: 0.37 }} />
  </Frame>
);

// 4
export const Style4: React.FC = () => (
  <Frame headline="Translate anything on screen" accent="anything" subtitle="Can't copy the text? Just draw a box: images, videos, games.">
    <Card3D src="capture.png" width={800} left={560} top={250} rotateY={7} rotateX={3} glow={0.6} />
    <Chip text="images" left={380} top={420} rotate={-5} />
    <Chip text="videos" left={1560} top={500} rotate={4} />
    <Chip text="games" left={1500} top={330} rotate={-3} opacity={0.8} />
  </Frame>
);

// 5
export const Style5: React.FC = () => (
  <Frame headline="Works in every app" accent="every" subtitle="Select text anywhere and press Ctrl+C twice.">
    <Card3D src="popup.png" width={900} left={510} top={250} rotateY={-6} rotateX={3} glow={0.6} />
  </Frame>
);

// 6: the original page flips into the translated page
export const Style6: React.FC = () => (
  <Frame headline="Whole documents" accent="documents" subtitle="Translate Word, PowerPoint and Excel files and keep the layout.">
    <Card3D src="doc-original.png" width={560} left={430} top={270} rotateY={38} rotateZ={-3} glow={0.3} opacity={0.75} />
    <Card3D src="doc-translated.png" width={560} left={940} top={250} rotateY={-14} rotateZ={2} glow={0.8} />
    <div style={{ position: "absolute", left: 905, top: 480, fontFamily: FONT, fontWeight: 800, fontSize: 90, color: C.lavender, textShadow: "0 0 30px rgba(138,92,255,0.8)" }}>→</div>
  </Frame>
);

// 7: the Write tab; the owl pops in at the side wearing glasses
export const Style7: React.FC = () => (
  <Frame headline="Local AI, no cloud" accent="no cloud" subtitle="Optional local AI polishes translations and fixes your grammar, still on your PC.">
    <Card3D src="write.png" width={980} left={300} top={250} rotateY={6} rotateX={2} glow={0.6} />
    <Stage3D az={-0.15} d={12} ty={0.4} tx={0}>
      <Owl pose={{ ...stand, position: [4.3, -1.3, 1.2], scale: 0.62, rotation: [0, -0.5, 0], glasses: 1, headTilt: 0.12, headTurn: -0.25 }} />
    </Stage3D>
  </Frame>
);

// 8: the comparison card (generic, no product named)
export const Style8: React.FC = () => (
  <Frame headline="Your words stay yours" accent="yours" subtitle="Your words stay yours.">
    <CompareCard rows={3} />
  </Frame>
);

// 9: the logo with glow on a dark background; the owl waves
export const Style9: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT }}>
    <Background dark />
    <LogoGlow size={300} left={810} top={170} />
    <Stage3D az={0.05} d={12} ty={0.4} tx={0}>
      <Owl pose={{ ...stand, position: [-4.2, -1.4, 0.5], scale: 0.85, rotation: [0, 0.35, 0], waveRight: 2.3 }} />
    </Stage3D>
    <div style={{ position: "absolute", top: 560, left: 0, right: 0, textAlign: "center", fontWeight: 800, fontSize: 118, color: C.white, letterSpacing: -2 }}>Owl-L</div>
    <div style={{ position: "absolute", top: 710, left: 0, right: 0, textAlign: "center", fontWeight: 700, fontSize: 54, color: C.lavender }}>github.com/Second-Dawn-Lab/owll</div>
    <div style={{ position: "absolute", top: 800, left: 0, right: 0, textAlign: "center", fontWeight: 600, fontSize: 40, color: C.muted }}>⭐ Star it on GitHub</div>
    <Subtitle text="Owl-L. Free and open source. Download it on GitHub." />
  </AbsoluteFill>
);
