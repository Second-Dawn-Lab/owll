import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "./theme";

// Deep navy to indigo, soft glowing blobs and slow particles. Deliberately not purple-on-purple, so the purple logo pops.
export const Background: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  const f = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = f / fps;
  const blobs = [
    { x: 0.2, y: 0.25, r: 0.42, c: "rgba(109,46,240,0.35)", sx: 0.11, sy: 0.07, p: 0 },
    { x: 0.82, y: 0.72, r: 0.5, c: "rgba(56,120,255,0.22)", sx: 0.08, sy: 0.1, p: 2 },
    { x: 0.62, y: 0.18, r: 0.3, c: "rgba(190,120,255,0.2)", sx: 0.1, sy: 0.06, p: 4 },
  ];
  const particles = Array.from({ length: 46 }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const bx = (seed / 233280) % 1;
    const by = (((i * 7919) % 1000) / 1000) % 1;
    const sp = 0.012 + ((i * 31) % 10) / 900;
    const y = (((by - t * sp) % 1) + 1) % 1;
    return { x: bx * width + Math.sin(t * 0.4 + i) * 12, y: y * height, r: 1 + ((i * 13) % 4) * 0.7, o: 0.15 + ((i * 17) % 10) / 40 };
  });
  return (
    <AbsoluteFill style={{ background: dark ? `linear-gradient(160deg, #060919 0%, ${C.navy} 60%, #120C33 100%)` : `linear-gradient(160deg, ${C.navy} 0%, #14103A 55%, ${C.indigo} 100%)` }}>
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: (b.x + Math.sin(t * b.sx * 6 + b.p) * 0.05) * width - (b.r * width) / 2,
            top: (b.y + Math.cos(t * b.sy * 6 + b.p) * 0.05) * height - (b.r * width) / 2,
            width: b.r * width,
            height: b.r * width,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${b.c} 0%, rgba(0,0,0,0) 68%)`,
            filter: "blur(10px)",
          }}
        />
      ))}
      {particles.map((p, i) => (
        <div key={i} style={{ position: "absolute", left: p.x, top: p.y, width: p.r * 2, height: p.r * 2, borderRadius: "50%", background: "#CFC4FF", opacity: p.o * interpolate(Math.sin(t + i), [-1, 1], [0.5, 1]) }} />
      ))}
    </AbsoluteFill>
  );
};
