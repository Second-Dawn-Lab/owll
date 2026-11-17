// The Owl-L mascot, built from code (primitives and extruded shapes), based on the logo in assets/brand:
// white body, big round eyes with dark indigo pupils and a white highlight, two ear tufts, a leaf-shaped wing with a lavender stripe.
// Reusable for other Second Dawn videos: <Owl pose={...} /> inside a Remotion <ThreeCanvas>. All motion comes from the numbers in `pose`
// (animate them with spring()/interpolate() from the current frame), so the same owl works in every composition.
import React, { useMemo } from "react";
import * as THREE from "three";
import { C } from "./theme";

export type OwlPose = {
  position?: [number, number, number];
  rotation?: [number, number, number]; // radians (x, y, z) of the whole owl
  scale?: number;
  squash?: number; // 0..1: landing squash (wider and lower)
  flap?: number; // wing flap angle in radians (both wings, mirrored)
  waveRight?: number; // extra lift of the right wing (radians), for waving
  headTilt?: number; // radians around z
  headTurn?: number; // radians around y
  headNod?: number; // radians around x
  blink?: number; // 0 open .. 1 closed
  breathe?: number; // phase in radians
  glasses?: number; // 0..1 (scale of the glasses; 1 = worn)
  look?: [number, number]; // where the pupils look, -1..1 (x, y)
  shadow?: number; // 0..1 opacity of the blob shadow
  feetOffset?: number; // lifts the feet while flying (tucks them)
};

const WHITE = new THREE.Color(C.white);

function useLeaf(w: number, h: number, depth: number, bevel = 0.025): THREE.ExtrudeGeometry {
  // A leaf pointing down: round at the top, pointed at the bottom, like the wing of the logo.
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0.02 * w, 0.5 * h);
    s.bezierCurveTo(0.5 * w, 0.42 * h, 0.62 * w, 0.0 * h, 0.1 * w, -0.5 * h);
    s.bezierCurveTo(0.0 * w, -0.32 * h, -0.5 * w, -0.05 * h, -0.38 * w, 0.25 * h);
    s.bezierCurveTo(-0.3 * w, 0.46 * h, -0.12 * w, 0.52 * h, 0.02 * w, 0.5 * h);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 24 });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [w, h, depth, bevel]);
}

const Mat: React.FC<{ color?: string; rough?: number; emissive?: string; ei?: number }> = ({ color = C.white, rough = 0.5, emissive = "#2b1a6e", ei = 0.05 }) => (
  <meshStandardMaterial color={color} roughness={rough} metalness={0.02} emissive={emissive} emissiveIntensity={ei} />
);

const Wing: React.FC<{ side: 1 | -1; angle: number; stripe: boolean }> = ({ side, angle, stripe }) => {
  const outer = useLeaf(0.62, 1.25, 0.13);
  const inner = useLeaf(0.34, 0.8, 0.05, 0.015);
  return (
    <group position={[side * 0.56, 0.42, 0.02]} rotation={[0, 0, side * angle]} scale={[side, 1, 1]}>
      {/* pivot at the shoulder: the leaf hangs from it */}
      <group position={[0, -0.5, 0]} rotation={[0, 0, 0.1]}>
        <mesh geometry={outer}>
          <Mat />
        </mesh>
        {stripe && (
          <mesh geometry={inner} position={[0.02, -0.12, 0.1]} rotation={[0, 0, 0.12]}>
            <Mat color={C.lavender} rough={0.45} emissive={C.violet} ei={0.12} />
          </mesh>
        )}
      </group>
    </group>
  );
};

const Eye: React.FC<{ x: number; look: [number, number]; blink: number }> = ({ x, look, blink }) => {
  const open = 1 - 0.92 * blink;
  return (
    <group position={[x, 0.03, 0.43]} scale={[1, open, 1]}>
      <mesh scale={[0.3, 0.3, 0.12]}>
        <sphereGeometry args={[1, 48, 32]} />
        <Mat color="#F3EFFF" rough={0.3} ei={0.03} />
      </mesh>
      <group position={[look[0] * 0.05, look[1] * 0.05, 0.1]}>
        <mesh scale={[1, 1, 0.55]} position={[0, 0, 0.0]}>
          <sphereGeometry args={[0.17, 40, 28]} />
          <meshStandardMaterial color={C.violetDark} roughness={0.15} metalness={0.1} emissive={C.violetDark} emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0.06, 0.07, 0.07]}>
          <sphereGeometry args={[0.045, 20, 16]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
      </group>
    </group>
  );
};

const Glasses: React.FC<{ s: number }> = ({ s }) => {
  const frame = "#2A1A6E";
  return (
    <group position={[0, 0.03, 0.56]} scale={[s, s, s]}>
      {[-1, 1].map((k) => (
        <group key={k} position={[k * 0.3, 0, 0]}>
          <mesh>
            <torusGeometry args={[0.235, 0.032, 16, 48]} />
            <meshStandardMaterial color={frame} roughness={0.35} metalness={0.2} emissive={C.violet} emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, 0, -0.005]}>
            <circleGeometry args={[0.232, 40]} />
            <meshBasicMaterial color="#9ec3ff" transparent opacity={0.12} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.022, 0.1, 6, 12]} />
        <meshStandardMaterial color={frame} roughness={0.35} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * 0.545, 0.02, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.02, 0.5, 6, 12]} />
          <meshStandardMaterial color={frame} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
};

const shadowTexture = (() => {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.6, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  return t;
})();

export const Owl: React.FC<{ pose?: OwlPose }> = ({ pose = {} }) => {
  const {
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = 1,
    squash = 0,
    flap = 0.12,
    waveRight = 0,
    headTilt = 0,
    headTurn = 0,
    headNod = 0,
    blink = 0,
    breathe = 0,
    glasses = 0,
    look = [0, 0],
    shadow = 1,
    feetOffset = 0,
  } = pose;
  const br = Math.sin(breathe) * 0.012;
  const sy = 1 - 0.16 * squash + br;
  const sxz = 1 + 0.1 * squash - br * 0.5;
  const tuft = useMemo(() => {
    // a curved, leaf-like tuft sweeping outwards (the ears of the logo), not a spike
    const sh = new THREE.Shape();
    sh.moveTo(-0.13, 0);
    sh.bezierCurveTo(-0.17, 0.22, -0.02, 0.5, 0.2, 0.62);
    sh.bezierCurveTo(0.2, 0.36, 0.2, 0.16, 0.15, 0);
    sh.lineTo(-0.13, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 5, curveSegments: 20 });
    g.translate(0, 0, -0.05);
    return g;
  }, []);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* a blob shadow on the floor (the floor is y = -0.78 in the owl's own units) */}
      {shadowTexture && shadow > 0 && (
        <mesh position={[0, -0.76, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.7 - feetOffset * 0.5, 1.4 - feetOffset * 0.4, 1]} renderOrder={2}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={shadowTexture} transparent opacity={shadow * (1 - Math.min(1, feetOffset) * 0.6)} depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
        </mesh>
      )}
      <group scale={[sxz, sy, sxz]} position={[0, -0.775 * (1 - sy), 0]}>
        {/* body: an egg */}
        <mesh scale={[0.6, 0.76, 0.52]} position={[0, -0.05, 0]}>
          <sphereGeometry args={[1, 56, 40]} />
          <Mat />
        </mesh>
        {/* chest patch and feather marks in the lavender of the logo */}
        <mesh scale={[0.36, 0.46, 0.14]} position={[0, -0.12, 0.42]}>
          <sphereGeometry args={[1, 40, 28]} />
          <Mat color="#E6DDFF" rough={0.55} ei={0.08} />
        </mesh>
        {[0, 1, 2].map((r) =>
          [-1, 0, 1].map((c) => (
            <mesh key={`${r}${c}`} position={[c * 0.17 + (r % 2) * 0.085, -0.02 - r * 0.17, 0.545 - r * 0.045]} rotation={[0.35 + r * 0.12, 0, Math.PI]}>
              <torusGeometry args={[0.075, 0.014, 8, 20, Math.PI]} />
              <meshStandardMaterial color="#C3B0F8" roughness={0.6} />
            </mesh>
          ))
        )}
        {/* feet */}
        {[-1, 1].map((k) => (
          <group key={k} position={[k * 0.22, -0.74 + feetOffset * 0.12, 0.14]} rotation={[feetOffset * 0.8, 0, 0]}>
            {[-1, 0, 1].map((t) => (
              <mesh key={t} position={[t * 0.07, 0, 0.1]} rotation={[0, t * 0.25, 0]} scale={[0.5, 0.35, 1.2]}>
                <sphereGeometry args={[0.09, 16, 12]} />
                <meshStandardMaterial color={C.violetBright} roughness={0.5} emissive={C.violet} emissiveIntensity={0.15} />
              </mesh>
            ))}
          </group>
        ))}
        {/* tail */}
        <mesh position={[0, -0.55, -0.46]} rotation={[0.55, 0, 0]} scale={[0.5, 0.7, 0.4]}>
          <sphereGeometry args={[0.5, 24, 16]} />
          <Mat color="#EDE6FF" />
        </mesh>
        {/* wings: the flap lifts them out to the sides; the right one can wave */}
        <Wing side={-1} angle={flap} stripe />
        <Wing side={1} angle={flap + waveRight} stripe={false} />
        {/* head */}
        <group position={[0, 0.88, 0.06]} rotation={[headNod, headTurn, headTilt]}>
          <mesh scale={[0.66, 0.5, 0.54]}>
            <sphereGeometry args={[1, 56, 40]} />
            <Mat />
          </mesh>
          {/* ear tufts, leaning outwards like the logo */}
          {[-1, 1].map((k) => (
            <mesh key={k} geometry={tuft} position={[k * 0.36, 0.34, -0.02]} rotation={[-0.1, 0, -k * 0.35]} scale={[k * 0.6, 0.58, 0.8]}>
              <Mat />
            </mesh>
          ))}
          {/* the brow lines (the V of the logo) */}
          {[-1, 1].map((k) => (
            <mesh key={k} position={[k * 0.22, 0.2, 0.46]} rotation={[0.1, 0, k * 0.42 + Math.PI * 0.12]}>
              <torusGeometry args={[0.24, 0.022, 10, 30, Math.PI * 0.62]} />
              <meshStandardMaterial color={C.violet} roughness={0.5} emissive={C.violet} emissiveIntensity={0.25} />
            </mesh>
          ))}
          <Eye x={-0.28} look={look} blink={blink} />
          <Eye x={0.28} look={look} blink={blink} />
          {/* beak */}
          <mesh position={[0, -0.12, 0.5]} rotation={[0.35, Math.PI / 4, 0]} scale={[1, 1.35, 0.9]}>
            <coneGeometry args={[0.1, 0.2, 4]} />
            <Mat color="#FBF9FF" rough={0.4} />
          </mesh>
          <Glasses s={glasses} />
        </group>
      </group>
    </group>
  );
};

// --- props the owl uses ------------------------------------------------------------------------------------------------------------------
export const Lock: React.FC<{ position?: [number, number, number]; scale?: number; closed?: number; glow?: number }> = ({ position = [0, 0, 0], scale = 1, closed = 0, glow = 0 }) => {
  const body = useMemo(() => {
    const s = new THREE.Shape();
    const w = 0.5, h = 0.42, r = 0.08;
    s.moveTo(-w + r, -h);
    s.lineTo(w - r, -h);
    s.quadraticCurveTo(w, -h, w, -h + r);
    s.lineTo(w, h - r);
    s.quadraticCurveTo(w, h, w - r, h);
    s.lineTo(-w + r, h);
    s.quadraticCurveTo(-w, h, -w, h - r);
    s.lineTo(-w, -h + r);
    s.quadraticCurveTo(-w, -h, -w + r, -h);
    return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 6 });
  }, []);
  const lift = (1 - closed) * 0.2;
  return (
    <group position={position} scale={scale}>
      {/* the shackle slides down and swings shut */}
      <group position={[(1 - closed) * 0.2, 0.42 + lift, 0.15]} rotation={[0, 0, (1 - closed) * 0.35]}>
        <mesh>
          <torusGeometry args={[0.28, 0.065, 16, 40, Math.PI]} />
          <meshStandardMaterial color="#EDEAFB" roughness={0.25} metalness={0.7} />
        </mesh>
        <mesh position={[0.28, -0.12, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 0.24, 16]} />
          <meshStandardMaterial color="#EDEAFB" roughness={0.25} metalness={0.7} />
        </mesh>
        <mesh position={[-0.28, -0.12 - (1 - closed) * 0.1, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 0.24, 16]} />
          <meshStandardMaterial color="#EDEAFB" roughness={0.25} metalness={0.7} />
        </mesh>
      </group>
      <mesh geometry={body} position={[0, 0, -0.15]}>
        <meshStandardMaterial color={C.violetBright} roughness={0.3} metalness={0.15} emissive={C.violet} emissiveIntensity={0.35 + glow * 1.2} />
      </mesh>
      <mesh position={[0, -0.02, 0.24]}>
        <circleGeometry args={[0.075, 24]} />
        <meshBasicMaterial color="#1B1446" />
      </mesh>
      <mesh position={[0, -0.12, 0.24]}>
        <planeGeometry args={[0.05, 0.12]} />
        <meshBasicMaterial color="#1B1446" />
      </mesh>
      {glow > 0 && (
        <mesh position={[0, 0.1, -0.2]} scale={1 + glow * 1.2}>
          <ringGeometry args={[0.7, 0.78, 48]} />
          <meshBasicMaterial color="#C9B6FA" transparent opacity={Math.max(0, 0.9 - glow * 0.9)} />
        </mesh>
      )}
    </group>
  );
};

export const Platform: React.FC<{ y?: number; r?: number }> = ({ y = -0.8, r = 1.5 }) => (
  <mesh position={[0, y - 0.07, 0]}>
    <cylinderGeometry args={[r, r * 1.04, 0.12, 64]} />
    <meshStandardMaterial color="#1E1A5C" roughness={0.55} metalness={0.1} emissive="#3A1594" emissiveIntensity={0.25} />
  </mesh>
);
