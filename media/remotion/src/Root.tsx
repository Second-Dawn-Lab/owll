import React from "react";
import { Composition } from "remotion";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import { OwlPreview, PREVIEW_SECONDS } from "./OwlPreview";
import { OwlCandidate } from "./OwlGlb";
import { Owl25DPreview } from "./Owl25D";
import { Hybrid1, Hybrid2 } from "./Hybrid";
import { Promo, Thumb } from "./promo/Promo";
import { layoutFor, Timeline } from "./promo/layout";
import { Style1, Style2, Style3, Style4, Style5, Style6, Style7, Style8, Style9 } from "./StyleFrames";

export const Root: React.FC = () => (
  <>
    <Composition id="OwlPreview" component={OwlPreview} durationInFrames={Math.round(PREVIEW_SECONDS * 30)} fps={30} width={1920} height={1080} />
    <Composition
      id="OwlCandidate"
      component={OwlCandidate}
      durationInFrames={150}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ file: "owls/pp_fNkq9CwSG6d.glb", name: "Great horned owl", author: "Poly by Google", licence: "CC-BY 3.0", info: "894 triangles" }}
    />
    <Composition id="Owl25DPreview" component={Owl25DPreview} durationInFrames={150} fps={30} width={1920} height={1080} />
    <Composition id="Hybrid1" component={Hybrid1} durationInFrames={60} fps={30} width={1920} height={1080} />
    <Composition id="Hybrid2" component={Hybrid2} durationInFrames={60} fps={30} width={1920} height={1080} />
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
    {[Style1, Style2, Style3, Style4, Style5, Style6, Style7, Style8, Style9].map((C, i) => (
      <Composition key={i} id={`Style${i + 1}`} component={C} durationInFrames={60} fps={30} width={1920} height={1080} />
    ))}
  </>
);
