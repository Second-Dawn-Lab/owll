// Layouts of the three output formats. Everything is in pixels of the output; scenes read their positions from here.
export type Fmt = "16x9" | "9x16" | "1x1";

export type Scene = {
  id: string;
  start: number; // seconds
  dur: number;
  narr?: { text: string; start: number; dur: number }; // start relative to the scene start
  cues: Record<string, number>; // seconds from the scene start
  ranges?: [number, number, number][]; // stretches of the recorded clip: from, to (seconds), speed
  clip?: string; // file in public/clips
  rects?: { t: number; rect: [number, number, number, number] }[]; // camera over the clip, clip pixels
  headline: string;
  accent?: string;
};

export type Timeline = { fmt: Fmt; fps: number; period: number; total: number; scenes: Scene[]; short: boolean };

export type Layout = {
  W: number;
  H: number;
  fmt: Fmt;
  head: { top: number; size: number; left: number; right: number };
  card: { x: number; y: number; w: number; h: number }; // the area for the app card (or the main picture)
  sub: { bottom: number; size: number; maxW: number };
  owl: { h: number; left: { x: number; y: number }; right: { x: number; y: number } }; // feet of the side-character owl (bottom centre)
  u: number; // a unit: 1 at 1080p, scales text and props
};

export const layoutFor = (fmt: Fmt): Layout => {
  if (fmt === "9x16")
    return {
      W: 1080, H: 1920, fmt, u: 0.9,
      head: { top: 150, size: 84, left: 60, right: 60 },
      card: { x: 40, y: 450, w: 1000, h: 780 },
      sub: { bottom: 120, size: 42, maxW: 960 },
      owl: { h: 330, left: { x: 190, y: 1610 }, right: { x: 890, y: 1610 } },
    };
  if (fmt === "1x1")
    return {
      W: 1080, H: 1080, fmt, u: 0.75,
      head: { top: 44, size: 64, left: 40, right: 40 },
      card: { x: 150, y: 140, w: 780, h: 560 },
      sub: { bottom: 34, size: 32, maxW: 980 },
      owl: { h: 220, left: { x: 120, y: 905 }, right: { x: 960, y: 905 } },
    };
  return {
    W: 1920, H: 1080, fmt, u: 1,
    head: { top: 62, size: 92, left: 90, right: 90 },
    card: { x: 360, y: 215, w: 1200, h: 650 },
    sub: { bottom: 52, size: 38, maxW: 1500 },
    owl: { h: 330, left: { x: 230, y: 880 }, right: { x: 1690, y: 880 } },
  };
};
