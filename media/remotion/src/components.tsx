// Building blocks of the promo v2 look: headline, subtitle, floating app cards, the comparison card, the glowing logo.
// Everything takes plain numbers (progress 0..1, rotations) so a scene can animate it with spring() / interpolate().
import React from "react";
import { Img, staticFile } from "remotion";
import { C, FONT } from "./theme";

export const Headline: React.FC<{ text: string; accent?: string; progress?: number; size?: number; align?: "center" | "left"; top?: number }> = ({
  text,
  accent,
  progress = 1,
  size = 86,
  align = "center",
  top = 70,
}) => {
  const words = text.split(" ");
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top, textAlign: align, fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.08, color: C.white, letterSpacing: -1.5 }}>
      {words.map((w, i) => {
        const p = Math.min(1, Math.max(0, progress * (words.length + 1.5) - i));
        const isAccent = accent && accent.split(" ").includes(w.replace(/[^\w·%-]/g, "")) ;
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", marginRight: size * 0.26 }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - p) * 110}%)`,
                opacity: p,
                color: isAccent ? C.lavender : C.white,
                textShadow: isAccent ? "0 0 40px rgba(138,92,255,0.7)" : "none",
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const Subtitle: React.FC<{ text: string; opacity?: number; bottom?: number; size?: number }> = ({ text, opacity = 1, bottom = 70, size = 38 }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom, display: "flex", justifyContent: "center", opacity, transform: `translateY(${(1 - opacity) * 14}px)` }}>
    <div
      style={{
        fontFamily: FONT,
        fontWeight: 600,
        fontSize: size,
        color: C.ink,
        background: "rgba(11,16,38,0.72)",
        border: "1px solid rgba(201,182,250,0.25)",
        padding: "14px 34px",
        borderRadius: 999,
        maxWidth: 1700,
        textAlign: "center",
        backdropFilter: "blur(6px)",
      }}
    >
      {text}
    </div>
  </div>
);

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

export const Chip: React.FC<{ text: string; left: number; top: number; rotate?: number; opacity?: number; scale?: number }> = ({ text, left, top, rotate = 0, opacity = 1, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      transform: `rotate(${rotate}deg) scale(${scale})`,
      opacity,
      fontFamily: FONT,
      fontWeight: 600,
      fontSize: 26,
      color: C.ink,
      background: "rgba(255,255,255,0.1)",
      border: "1px solid rgba(255,255,255,0.28)",
      padding: "10px 20px",
      borderRadius: 14,
      backdropFilter: "blur(6px)",
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

// Scene 8: Owl-L against typical online translators. Generic on purpose: no product is named or shown.
export const CompareCard: React.FC<{ rows: number /* how many rows have ticked in (0..3) */; pop?: number }> = ({ rows, pop = 1 }) => {
  const data: [string, string, string][] = [
    ["Works offline", "✓", "✗"],
    ["Text stays on your PC", "✓", "✗"],
    ["Free, no limits", "✓", "often limited"],
  ];
  const col = { fontFamily: FONT, fontWeight: 700, fontSize: 40 } as const;
  return (
    <div
      style={{
        position: "absolute",
        left: 260,
        top: 250,
        width: 1400,
        padding: "44px 56px",
        borderRadius: 36,
        background: "linear-gradient(160deg, rgba(40,32,110,0.85), rgba(16,14,52,0.92))",
        border: "1px solid rgba(201,182,250,0.3)",
        boxShadow: "0 40px 100px rgba(0,0,0,0.5), 0 0 90px rgba(138,92,255,0.25)",
        transform: `scale(${0.94 + 0.06 * pop})`,
        opacity: pop,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.1fr", alignItems: "center", rowGap: 30 }}>
        <div />
        <div style={{ ...col, color: C.white, textAlign: "center", fontSize: 44 }}>
          <span style={{ color: C.lavender }}>Owl-L</span>
        </div>
        <div style={{ ...col, color: C.muted, textAlign: "center", fontSize: 30, fontWeight: 600 }}>typical online translators</div>
        {data.map(([label, a, b], i) => {
          const on = rows > i;
          return (
            <React.Fragment key={label}>
              <div style={{ ...col, color: C.ink, fontWeight: 600, opacity: on ? 1 : 0.35, fontSize: 38 }}>{label}</div>
              <div style={{ textAlign: "center", opacity: on ? 1 : 0, transform: `scale(${on ? 1 : 0.4})` }}>
                <span style={{ display: "inline-block", width: 74, height: 74, lineHeight: "74px", borderRadius: 37, background: C.green, color: "#06281B", fontWeight: 800, fontSize: 48, fontFamily: FONT, boxShadow: `0 0 34px ${C.green}` }}>{a}</span>
              </div>
              <div style={{ ...col, textAlign: "center", color: "rgba(244,242,255,0.45)", fontSize: b.length > 3 ? 32 : 52, opacity: on ? 1 : 0 }}>{b}</div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// The purple logo has to pop on the dark background: a white ring and a soft glow around it.
export const LogoGlow: React.FC<{ size: number; left: number; top: number; scale?: number; glow?: number }> = ({ size, left, top, scale = 1, glow = 1 }) => (
  <div style={{ position: "absolute", left, top, width: size, height: size, transform: `scale(${scale})` }}>
    <div style={{ position: "absolute", inset: -size * 0.28, borderRadius: "50%", background: `radial-gradient(circle, rgba(201,182,250,${0.55 * glow}) 0%, rgba(138,92,255,${0.25 * glow}) 40%, rgba(0,0,0,0) 70%)`, filter: "blur(8px)" }} />
    <div style={{ position: "absolute", inset: -6, borderRadius: size * 0.235, background: "rgba(255,255,255,0.95)", boxShadow: `0 0 ${60 * glow}px rgba(255,255,255,${0.55 * glow})` }} />
    <Img src={staticFile("logo.png")} style={{ position: "absolute", inset: 0, width: size, height: size, borderRadius: size * 0.22 }} />
  </div>
);
