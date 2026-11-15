# Landing diorama

The front page (`app/index.html`) shows a live miniature of a farmstead among rotation paddocks, drawn as coloured text characters with a tilt-shift blur. It is a Three.js scene with two full-screen shader passes.

| File | Purpose |
| --- | --- |
| `main.js` | Scene source: land, paddocks, crops, trees, fences, farmstead, animals, glyph and blur shaders |
| `build/main.js` | Bundled copy that the page loads. Committed, because the site has no build step |
| `farm.js` | The farm plan, land shape and ground-colour bake, shared by the page and the build |
| `bake.mjs` | Build step: bakes the ground colours into `assets/terrain.jpg` and `assets/terrain-cls.png` |
| `assets/tex/` | Six 512 px textures |
| `assets/poster-*.webp` | The opening frame as a still, shown the moment the page opens |

## Change it

```bash
npm install
npm run build:landing
```

Run the build after every edit to `main.js` or `farm.js`, then reload the page. Add `?debug` to the URL to expose the renderer on `window.__diorama`. Space pauses the animation (unless the button has focus).

The paddock plan is the `ROWS_V` and `CROPS` tables near the top of `farm.js`. The farmyard is laid out in `buildFarmstead`.

## Opening still

The page shows `assets/poster-wide.webp` (landscape) or `assets/poster-tall.webp` (portrait) at once, and the live scene fades in over it about a second later. If you change how the scene looks, regenerate them. Open the page with `?debug`, then run `__diorama.poster(1400, 1200)` and `__diorama.poster(720, 984)` in the console (the shapes of the farm area on a laptop and on a phone). Each call returns a WebP data URL. Save them, shrink them to 1120 and 560 px wide, and keep each under about 190 KB.

## Behaviour

- Opening the page: the ground colours are baked at build time and the textures download while the scene is built, so the live scene starts in about a second and a half on a typical laptop.
- Layout: the farm fills about three quarters of a laptop screen and a paper panel with a torn edge holds the words; on tall screens the farm sits on top and the panel below. The canvas sizes itself to its own box. On load things happen one at a time: the farm comes alive, once its fade-in is done it runs for a second, then the seedling blooms slowly (seed, stem, then each leaf), and the moment the last leaf has opened the arrow by "Ten years of NASA data" draws itself. The script drives this from real events (the scene's first frame, the leaf's animationend), with timers only as a backstop. The button keeps one size: at rest "Plan your next season", on hover (or tap) it turns green and shows "Your best season yet". Pressing it sends a ripple across it, then a green-then-paper curtain grows from that spot and `dashboard.html` opens. The scene pauses while the curtain runs.
- The 3D scene renders at about three pixels per glyph cell, not at screen size, because the glyph pass only reads one averaged colour per cell. Only the glyphs are drawn at full sharpness.
- Shaders avoid `pow()` of negative numbers and reversed `smoothstep` edges. Either can give NaN pixels, which spread through the blur and flicker. The glyph pass also blanks any NaN it meets.
- Everything time-driven loops or turns round: the camera sweeps back and forth, and the farmer and dog walk to the end of the track and back.
- The picture fills the window and follows its shape. On tall screens the camera pulls back and the glyph grid gets more rows, so the tractor's paddock stays in view. Phones get fewer blades and leaves.
- On a slow device the page measures its frame rate once, about two seconds in, and if needed lowers the 3D scene resolution once. The canvas never changes size for this: resizing a canvas blanks it for a frame, which showed as a flicker.
- Visitors who ask for reduced motion get a still picture.
- Without WebGL 2 the page shows a plain backdrop.

## Assets and licences

All textures are from [Poly Haven](https://polyhaven.com) under CC0 (no credit required), resized to 512 px:
`leafy_grass`, `farm_soil`, `red_laterite_soil_stones`, `corrugated_iron`, `eucalyptus_bark`, `white_planks_clean`.

Every model in the scene is built in code. [Three.js](https://threejs.org) is MIT licensed and is bundled into `build/main.js`.

The scene started from the [ascii-diorama](https://github.com/JDhruv14/ascii-diorama) starter template (MIT).
