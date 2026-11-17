# Owl-L promo v2: motion design and the 3D owl (Remotion + React Three Fiber)

Work in progress (phase 1: the owl, the style frames; phase 2: the full videos). Dependencies are pinned in `package.json` and stay inside this folder. Generated files and the frames of the recorded clips live outside the repository (`E:\SecondDawn\media\out\v2`, `E:\SecondDawn\media\work\v2\public`).

- `src/Owl.tsx`: the mascot (`<Owl pose={...} />`), a lock and a platform. Built from code, based on the logo in `assets/brand`. Reusable in other Second Dawn videos.
- `src/OwlPreview.tsx`: the 10-second preview (`npm run owl-preview`).
- `src/StyleFrames.tsx`, `src/components.tsx`: headline, subtitle, floating cards, the comparison card and the glowing logo; one still per scene (`npm run style-frames`).
- Fonts: Plus Jakarta Sans (SIL Open Font License 1.1) through `@fontsource/plus-jakarta-sans`, bundled locally.
- Remotion licence: free for individuals, for-profit companies with up to 3 employees and non-profits (https://github.com/remotion-dev/remotion/blob/main/LICENSE.md); an open-source project by an individual developer qualifies. Remotion 5 will change the licence slightly; check it when upgrading.

## Phase 1 feedback round (real owl, hybrid scenes)

- `src/OwlGlb.tsx`: loads a glTF/GLB model with an HDRI (Poly Haven, CC0) and a soft key and rim light; `npm run owl-candidates` renders the turntables.
- `src/Owl25D.tsx`: a photo-real owl as a cut-out photo with a depth map (parallax). The photos are public domain (U.S. Fish and Wildlife Service, Wikimedia Commons); `py/owlcut.py` cuts them out (rembg, U2-Net) and cleans them.
- `src/Hybrid.tsx`: scenes 1 and 2 as a mix of the 2.5D owl, a CC0 laptop (Poly Haven "Classic Laptop" by Arrangemonk), volumetric clouds (drei `<Clouds>` with a texture generated for this project) and glowing text cards.
- The old code-built owl (`src/Owl.tsx`) is kept only for reference.
