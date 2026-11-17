import React from "react";
import { Easing, interpolate } from "remotion";

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = Easing.bezier(0.22, 1, 0.36, 1); // a soft, springy ease-out
export const easeInOut = Easing.inOut(Easing.cubic);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A damped spring from 0 to 1 starting at t0 (seconds): overshoots a little and settles. */
export const spring01 = (t: number, t0: number, stiffness = 14, damping = 6.5) => {
  const x = t - t0;
  if (x <= 0) return 0;
  const w = Math.sqrt(stiffness * 4);
  return 1 - Math.exp(-damping * x) * (Math.cos(w * x) + (damping / w) * Math.sin(w * x));
};

/** The "pop" of a pose swap: 0.9 -> 1.07 -> 1. */
export const popScale = (t: number, t0: number) => {
  const x = t - t0;
  if (x < 0) return 1;
  if (x < 0.1) return lerp(0.88, 1.08, x / 0.1);
  if (x < 0.28) return lerp(1.08, 1, easeInOut((x - 0.1) / 0.18));
  return 1;
};

/** Landing squash (wider and lower, then a small stretch) starting at t0. returns [scaleX, scaleY]. */
export const squash = (t: number, t0: number): [number, number] => {
  const x = t - t0;
  if (x < 0 || x > 0.9) return [1, 1];
  const k = Math.exp(-x * 6) * Math.cos(x * 18);
  return [1 + 0.16 * k, 1 - 0.2 * k];
};

/** A four-point star that grows and fades: the sparkle at a pose swap or a click. */
export const Sparkles: React.FC<{ t: number; t0: number; x: number; y: number; size?: number; count?: number }> = ({ t, t0, x, y, size = 120, count = 7 }) => {
  const dt = t - t0;
  if (dt < 0 || dt > 0.8) return null;
  const p = dt / 0.8;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + 0.6;
        const r = size * (0.35 + 0.65 * ease(p)) * (0.7 + 0.5 * ((i * 37) % 10) / 10);
        const s = size * 0.2 * (0.6 + ((i * 13) % 7) / 10) * (1 - p * 0.6);
        return (
          <svg key={i} width={s * 2} height={s * 2} viewBox="-10 -10 20 20" style={{ position: "absolute", left: x + Math.cos(a) * r - s, top: y + Math.sin(a) * r - s, opacity: 1 - p, transform: `rotate(${p * 90}deg)`, filter: "drop-shadow(0 0 6px rgba(255,255,255,0.9))" }}>
            <path d="M0 -9 C1 -2 2 -1 9 0 C2 1 1 2 0 9 C-1 2 -2 1 -9 0 C-2 -1 -1 -2 0 -9Z" fill={i % 3 === 0 ? "#FFE48A" : "#FFFFFF"} />
          </svg>
        );
      })}
    </>
  );
};

/** An expanding light ring with a glow (the pulse when the lock closes). */
export const GlowRing: React.FC<{ t: number; t0: number; x: number; y: number; size: number; color?: string }> = ({ t, t0, x, y, size, color = "201,182,250" }) => {
  const dt = t - t0;
  if (dt < 0 || dt > 0.9) return null;
  const p = ease(dt / 0.9);
  const s = size * (0.4 + 1.6 * p);
  return <div style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: "50%", border: `${6 * (1 - p) + 2}px solid rgba(${color},${0.95 * (1 - p)})`, boxShadow: `0 0 ${50 * (1 - p)}px rgba(${color},${0.8 * (1 - p)}), inset 0 0 ${40 * (1 - p)}px rgba(${color},${0.5 * (1 - p)})` }} />;
};

/** Soft light particles that rise around a point (the glow of the logo, the dissolving cloud). */
export const Motes: React.FC<{ t: number; x: number; y: number; w: number; h: number; n?: number; speed?: number; opacity?: number }> = ({ t, x, y, w, h, n = 22, speed = 1, opacity = 1 }) => (
  <>
    {Array.from({ length: n }, (_, i) => {
      const seed = (i * 9301 + 49297) % 233280;
      const px = (seed / 233280) % 1;
      const ph = ((i * 7919) % 1000) / 1000;
      const yy = (((ph - t * 0.06 * speed * (0.6 + (i % 5) / 8)) % 1) + 1) % 1;
      const r = 2 + ((i * 13) % 5);
      return <div key={i} style={{ position: "absolute", left: x + px * w + Math.sin(t * 0.8 + i) * 10, top: y + yy * h, width: r * 2, height: r * 2, borderRadius: "50%", background: "#DCD3FF", opacity: opacity * (0.25 + ((i * 17) % 10) / 22), boxShadow: "0 0 10px rgba(220,211,255,0.9)" }} />;
    })}
  </>
);
