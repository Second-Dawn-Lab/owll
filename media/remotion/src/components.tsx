// Building blocks of the promo v2 look: floating app cards and the glowing logo.
// Everything takes plain numbers (progress 0..1, rotations) so a scene can animate it with spring() / interpolate().
import React from "react";
import { Img, staticFile } from "remotion";
import { C, FONT } from "./theme";

// A floating app card: rounded corners, 3D tilt, a soft glow and shadow.
export const Card3D: React.FC<{
  src: string;
  width: number;
  left: number;
  top: number;
  rotateY?: number;
  rotateX?: number;
  rotateZ?: number;
  scale?: number;
  glow?: number;
  highlight?: { x: number; y: number; w: number; h: number }; // fractions of the picture
  opacity?: number;
}> = ({ src, width, left, top, rotateY = 0, rotateX = 0, rotateZ = 0, scale = 1, glow = 0.5, highlight, opacity = 1 }) => (
  <div style={{ position: "absolute", left, top, width, perspective: 1800, opacity }}>
    <div
      style={{
        transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg) scale(${scale})`,
        transformStyle: "preserve-3d",
        borderRadius: 26,
        overflow: "hidden",
        boxShadow: `0 40px 90px rgba(0,0,0,0.55), 0 0 ${70 * glow}px rgba(138,92,255,${0.55 * glow}), 0 0 0 1px rgba(255,255,255,0.12)`,
        position: "relative",
        background: "#fff",
      }}
    >
      <Img src={staticFile(src)} style={{ width: "100%", display: "block" }} />
      {highlight && (
        <div
          style={{
            position: "absolute",
            left: `${highlight.x * 100}%`,
            top: `${highlight.y * 100}%`,
            width: `${highlight.w * 100}%`,
            height: `${highlight.h * 100}%`,
            border: `4px solid ${C.violetBright}`,
            borderRadius: 16,
            boxShadow: `0 0 36px ${C.violetBright}, inset 0 0 24px rgba(138,92,255,0.25)`,
          }}
        />
      )}
    </div>
  </div>
);

// The purple logo has to pop on the dark background: a white ring and a soft glow around it.
export const LogoGlow: React.FC<{ size: number; left: number; top: number; scale?: number; glow?: number }> = ({ size, left, top, scale = 1, glow = 1 }) => (
  <div style={{ position: "absolute", left, top, width: size, height: size, transform: `scale(${scale})` }}>
    <div style={{ position: "absolute", inset: -size * 0.28, borderRadius: "50%", background: `radial-gradient(circle, rgba(201,182,250,${0.55 * glow}) 0%, rgba(138,92,255,${0.25 * glow}) 40%, rgba(0,0,0,0) 70%)`, filter: "blur(8px)" }} />
    <div style={{ position: "absolute", inset: -6, borderRadius: size * 0.235, background: "rgba(255,255,255,0.95)", boxShadow: `0 0 ${60 * glow}px rgba(255,255,255,${0.55 * glow})` }} />
    <Img src={staticFile("logo.png")} style={{ position: "absolute", inset: 0, width: size, height: size, borderRadius: size * 0.22 }} />
  </div>
);
