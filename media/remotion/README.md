# Owl-L promo v2: motion design (Remotion)

The video project behind `make-demo.ps1 -Steps v2` (see `../README.md`, section "Promo v2"). Dependencies are pinned in `package.json` and stay inside this folder. Not part of the app: the app's lint and type check ignore `media/`. Generated files, the owl artwork and the frames of the recorded clips live outside the repository (`E:\SecondDawn\media\out2`, `E:\SecondDawn\media\work2`).

- `src/Root.tsx`: registers the `Promo` composition (one per format, size and length come from the timeline that `py/promo2.py` writes) and `Thumb` (the YouTube thumbnail).
- `src/promo/`: `layout.ts` (the three formats), `OwlActor.tsx` (the owl as a 2.5D character: float, breathing, squash and stretch, blinks, pose swaps), `scenes.tsx` (the nine scenes), `parts.tsx` (headline, subtitle, video card, comparison card), `fx.tsx` (springs, sparkles, glow), `Promo.tsx` (transitions, `Thumb`).
- `src/components.tsx`, `src/Background.tsx`, `src/theme.ts`: floating app card, glowing logo, background, colours and font.
- Fonts: Plus Jakarta Sans (SIL Open Font License 1.1) through `@fontsource/plus-jakarta-sans`, bundled locally.
- `npm run studio` opens Remotion Studio (needs the timeline props, so rendering normally goes through `py/promo2.py`).
- Remotion licence: free for individuals, for-profit companies with up to 3 employees and non-profits (https://github.com/remotion-dev/remotion/blob/main/LICENSE.md); an open-source project by an individual developer qualifies. Remotion 5 will change the licence slightly; check it when upgrading.
