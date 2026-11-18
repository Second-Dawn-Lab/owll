import React from "react";
import { Composition } from "remotion";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import { Promo, Thumb } from "./promo/Promo";
import { layoutFor, Timeline } from "./promo/layout";

export const Root: React.FC = () => (
  <>
    <Composition
      id="Promo"
      component={Promo}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ tl: { fmt: "16x9", fps: 30, period: 0.476, total: 30, short: false, scenes: [] } as Timeline }}
      calculateMetadata={({ props }) => {
        const L = layoutFor(props.tl.fmt);
        return { durationInFrames: Math.max(30, Math.round(props.tl.total * props.tl.fps)), width: L.W, height: L.H, fps: props.tl.fps };
      }}
    />
    <Composition id="Thumb" component={Thumb} durationInFrames={30} fps={30} width={1280} height={720} />
  </>
);
