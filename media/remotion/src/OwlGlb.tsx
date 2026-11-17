// Loads a ready-made 3D model (glTF/GLB) with an HDRI environment and a soft key + rim light, and shows a turntable.
// Used to judge owl model candidates (npm run owl-candidates) and as the base for scenes that use a downloaded model.
import React, { useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { Background } from "./Background";
import { C, FONT } from "./theme";

export const Env: React.FC<{ file?: string; intensity?: number }> = ({ file = "hdri/studio_small_09_1k.hdr", intensity = 1 }) => {
  const tex = useLoader(RGBELoader, staticFile(file));
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = tex;
    (scene as any).environmentIntensity = intensity;
    return () => {
      scene.environment = null;
    };
  }, [tex, scene, intensity]);
  return null;
};

export const Studio: React.FC = () => (
  <>
    {/* soft key from the front left, cool rim lights from behind: the owl gets a light edge against the dark background */}
    <directionalLight position={[-3, 5, 5]} intensity={1.6} color="#fff3e4" castShadow shadow-mapSize={[2048, 2048]} shadow-radius={8} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} />
    <directionalLight position={[4, 3, -5]} intensity={2.4} color="#8fb2ff" />
    <directionalLight position={[-5, 2, -4]} intensity={1.6} color="#c18cff" />
    <hemisphereLight args={["#dfe8ff", "#2a1f66", 0.5]} />
  </>
);

export const GlbModel: React.FC<{ file: string; size?: number; rotationY?: number; time?: number; clip?: number; position?: [number, number, number]; fit?: "height" | "max" }> = ({
  file,
  size = 2.4,
  rotationY = 0,
  time = 0,
  clip = 0,
  position = [0, 0, 0],
  fit = "max",
}) => {
  const gltf = useLoader(GLTFLoader, staticFile(file));
  const { root, mixer, scale, offset } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as THREE.Object3D;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const dim = box.getSize(new THREE.Vector3());
    const s = size / (fit === "height" ? dim.y : Math.max(dim.x, dim.y, dim.z));
    const center = box.getCenter(new THREE.Vector3());
    const mixer = gltf.animations.length ? new THREE.AnimationMixer(root) : null;
    if (mixer) mixer.clipAction(gltf.animations[Math.min(clip, gltf.animations.length - 1)]).play();
    return { root, mixer, scale: s, offset: new THREE.Vector3(-center.x * s, -box.min.y * s, -center.z * s) };
  }, [gltf, size, fit, clip]);
  if (mixer) mixer.setTime(time);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group position={offset.toArray()} scale={scale}>
        <primitive object={root} />
      </group>
    </group>
  );
};

const Orbit: React.FC<{ az: number; el: number; d: number; ty: number }> = ({ az, el, d, ty }) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(d * Math.sin(az) * Math.cos(el), ty + d * Math.sin(el), d * Math.cos(az) * Math.cos(el));
    camera.lookAt(0, ty, 0);
    camera.updateProjectionMatrix();
  }, [camera, az, el, d, ty]);
  return null;
};

export type CandidateProps = { file: string; name: string; author: string; licence: string; info: string; fit?: "height" | "max"; clip?: number };

// A 5 second turntable: one full turn, a slight camera bob, soft shadow on the floor.
export const OwlCandidate: React.FC<CandidateProps> = ({ file, name, author, licence, info, fit = "max", clip = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const p = frame / durationInFrames;
  return (
    <AbsoluteFill>
      <Background />
      <ThreeCanvas width={width} height={height} shadows camera={{ fov: 28, position: [0, 1, 8], near: 0.1, far: 80 }} gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
        <Env />
        <Studio />
        <Orbit az={p * Math.PI * 2} el={0.14 + 0.05 * Math.sin(p * Math.PI * 2)} d={8.2} ty={1.2} />
        <GlbModel file={file} size={2.6} fit={fit} time={frame / fps} clip={clip} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
          <circleGeometry args={[3.2, 64]} />
          <shadowMaterial opacity={0.35} />
        </mesh>
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 60, bottom: 50, fontFamily: FONT, color: C.ink }}>
        <div style={{ fontWeight: 800, fontSize: 44 }}>{name}</div>
        <div style={{ fontWeight: 500, fontSize: 28, color: C.muted }}>{author} · {licence} · {info}</div>
      </div>
    </AbsoluteFill>
  );
};
