// A photo-real owl as a "2.5D" cut-out: a public-domain photo of a snowy owl (cut out and cleaned by py/owlcut.py) on a mesh that is pushed
// forward by a soft depth map, so the camera can swing a little (parallax) and the owl still looks like the photograph. Photos: Wikimedia Commons,
// public domain, U.S. Fish and Wildlife Service. Reusable: <Photo25D src="owl25d/perched.png" depth="owl25d/perched_depth.png" height={3} />.
import React, { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Background } from "./Background";
import { C, FONT } from "./theme";

export const Photo25D: React.FC<{
  src: string;
  depth: string;
  height: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  opacity?: number;
  relief?: number;
}> = ({ src, depth, height, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], opacity = 1, relief = 0.5 }) => {
  const [map, dmap] = useLoader(THREE.TextureLoader, [staticFile(src), staticFile(depth)]);
  const aspect = (map.image as HTMLImageElement).width / (map.image as HTMLImageElement).height;
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  }, [map]);
  const w = height * aspect;
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <planeGeometry args={[w, height, Math.round(120 * aspect) + 1, 120]} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        color="#000000"
        displacementMap={dmap}
        displacementScale={relief}
        displacementBias={-relief * 0.35}
        transparent
        opacity={opacity}
        alphaTest={0.02}
        side={THREE.DoubleSide}
        toneMapped={false}
        roughness={1}
        metalness={0}
        depthWrite={opacity > 0.98}
      />
    </mesh>
  );
};

const Rig: React.FC<{ az: number; el: number; d: number; ty: number }> = ({ az, el, d, ty }) => {
  const { camera } = useThree();
  React.useLayoutEffect(() => {
    camera.position.set(d * Math.sin(az) * Math.cos(el), ty + d * Math.sin(el), d * Math.cos(az) * Math.cos(el));
    camera.lookAt(0, ty, 0);
    camera.updateProjectionMatrix();
  }, [camera, az, el, d, ty]);
  return null;
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// 5 s: the owl swoops in with spread wings (the flight photo), lands (cross-fade and a small squash), then breathes while the camera swings.
export const Owl25DPreview: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const fly = clamp(t / 1.5);
  const e = Easing.out(Easing.cubic)(fly);
  const fx = 3.2 * (1 - e);
  const fy = 2.6 * (1 - e) * (1 - e) + 0.6;
  const fs = 0.55 + 0.45 * e;
  const swap = clamp((t - 1.25) / 0.35);
  const land = Math.max(0, t - 1.5);
  const squash = Math.exp(-land * 6) * Math.cos(land * 15) * 0.05;
  const breathe = Math.sin(t * 3.2) * 0.008;
  const az = 0.0 + 0.24 * Math.sin(Math.max(0, t - 1.6) * 1.3);
  return (
    <AbsoluteFill>
      <Background />
      <div style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 0 40px rgba(143,178,255,0.45)) drop-shadow(0 30px 40px rgba(0,0,0,0.5))" }}>
        <ThreeCanvas width={width} height={height} camera={{ fov: 28, position: [0, 0.5, 9], near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true }}>
          <Rig az={az} el={0.03 * Math.sin(t * 0.9)} d={9} ty={0.3} />
          {/* flight photo: fades out as the perched owl fades in */}
          {swap < 1 && <Photo25D src="owl25d/flying.png" depth="owl25d/flying_depth.png" height={4.2 * fs} position={[fx, fy, 0]} rotation={[0.1 * (1 - e), 0.35 * (1 - e), -0.25 * (1 - e)]} opacity={1 - swap} relief={0.35} />}
          {swap > 0 && <Photo25D src="owl25d/perched.png" depth="owl25d/perched_depth.png" height={3.6} position={[0, -0.2, 0]} scale={[1 + squash * 1.5 + breathe * 0.4, 1 - squash + breathe, 1]} rotation={[0, 0, 0.012 * Math.sin(t * 1.1)]} opacity={swap} relief={0.55} />}
        </ThreeCanvas>
      </div>
      <div style={{ position: "absolute", left: 60, bottom: 50, fontFamily: FONT, color: C.ink }}>
        <div style={{ fontWeight: 800, fontSize: 44 }}>Photo-real 2.5D owl (prototype)</div>
        <div style={{ fontWeight: 500, fontSize: 28, color: C.muted }}>Snowy owl photos, public domain (U.S. Fish and Wildlife Service, via Wikimedia Commons) · cut out and given a depth map</div>
      </div>
    </AbsoluteFill>
  );
};
