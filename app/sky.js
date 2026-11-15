// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

// The dashboard's sky: a grid of small blue tiles with drifting clouds outlined in text characters.
// Moving the pointer across it leaves a short wind trail that bends the clouds it passes.
// Plain 2D canvas, no libraries. Pauses when off screen or in a background tab.

const canvas = document.getElementById('sky');
if (canvas) start(canvas);

function start(canvas) {
  const ctx = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CELL = matchMedia('(pointer: coarse)').matches ? 10 : 12; // tile pitch in CSS px
  const FPS = 30;

  // value noise
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => noise(x, y) * .55 + noise(x * 2.1 + 5.2, y * 2.1 + 1.3) * .3 + noise(x * 4.3 + 9.1, y * 4.3 + 7.7) * .15;

  let W = 0, H = 0, cols = 0, rows = 0, wind, windX, windY, tiles;
  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / CELL); rows = Math.ceil(H / CELL);
    wind = new Float32Array(cols * rows); windX = new Float32Array(cols * rows); windY = new Float32Array(cols * rows);
    tiles = new Float32Array(cols * rows).map((_, i) => hash(i % cols, Math.floor(i / cols) + 50)); // fixed per-tile shade
    if (calm) draw(0);
  }

  // pointer wind: each move stamps strength and direction into nearby cells; it fades every frame
  let last = null;
  addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (calm || x < 0 || y < 0 || x > W || y > H) { last = null; return; }
    if (last) {
      const dx = x - last.x, dy = y - last.y, len = Math.hypot(dx, dy);
      if (len > 1) {
        const steps = Math.ceil(len / (CELL * .5)), ux = dx / len, uy = dy / len;
        for (let s = 1; s <= steps; s++) stamp(last.x + dx * s / steps, last.y + dy * s / steps, ux, uy, Math.min(1, len / 30));
      }
    }
    last = { x, y };
  }, { passive: true });
  addEventListener('pointerleave', () => { last = null; });
  function stamp(px, py, ux, uy, k) {
    const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const x = cx + i, y = cy + j; if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const n = y * cols + x, w = (i || j ? .55 : 1) * k;
      if (w > wind[n]) { wind[n] = w; windX[n] = ux; windY[n] = uy; }
    }
  }

  const CLOUD = ' .:;~o0()8'; // light edge → dense body
  function glyphFor(ux, uy) { // stroke that follows the wind's direction
    const a = Math.atan2(uy, ux), s = Math.abs(Math.sin(a)), c = Math.abs(Math.cos(a));
    if (s < .38) return Math.sin(a * 7) > 0 ? '—' : '~';
    if (c < .38) return '|';
    return (ux * uy > 0) ? '\\' : '/';
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = `600 ${CELL - 2}px ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const drift = t * .045, sz = CELL - 2;
    for (let y = 0; y < rows; y++) {
      const fy = y / rows, py = y * CELL;
      for (let x = 0; x < cols; x++) {
        const n = y * cols + x, px = x * CELL, w = wind[n];
        // wind bends the clouds it passes
        const bx = x - windX[n] * w * 2.2, by = y - windY[n] * w * 2.2;
        // sky tile: blue, darker up top, shimmering slowly
        const sh = .55 * tiles[n] + .45 * noise(x * .12 + t * .05, y * .18 - t * .03);
        const r = 112 + 62 * fy + 70 * sh, g = 172 + 40 * fy + 40 * sh, b = 228 + 14 * fy + 12 * sh;
        // clouds: drifting fbm, a little more of them through the middle band
        let d = fbm(bx * .045 - drift, by * .1 + drift * .2) + .08 * Math.sin(fy * 3.1) - .06;
        if (d > .64) { // cloud body: white, with characters around its edge and here and there inside
          ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(px, py, CELL, CELL);
          const edge = d < .68, k = edge ? Math.min(4, 1 + Math.floor((d - .64) * 80)) : 5 + Math.floor(hash(x, y) * 5);
          if (edge || hash(x + 3, y) > .35) {
            ctx.fillStyle = edge ? 'rgba(98,118,145,.85)' : 'rgba(120,138,160,.55)';
            ctx.fillText(CLOUD[k], px + CELL / 2, py + CELL / 2 + .5);
          }
        } else {
          const haze = d > .56 ? (d - .56) * 12 : 0; // soft light rim around each cloud
          ctx.fillStyle = `rgb(${r + (255 - r) * haze * .5 | 0},${g + (255 - g) * haze * .5 | 0},${b + (255 - b) * haze * .5 | 0})`;
          ctx.beginPath(); ctx.roundRect(px + 1, py + 1, sz, sz, 2); ctx.fill();
          ctx.fillStyle = `rgba(40,110,190,${.35 - .15 * fy})`; ctx.fillRect(px + CELL / 2 - 1, py + CELL / 2 - 1, 2, 2);
        }
        if (w > .08) { // the wind trail: the tile gives way to a bold stroke along the wind
          ctx.fillStyle = `rgba(244,249,255,${Math.min(1, w * 1.5)})`; ctx.fillRect(px, py, CELL, CELL);
          ctx.fillStyle = `rgba(24,96,206,${Math.min(1, w * 1.4)})`;
          ctx.font = `800 ${CELL + 1}px ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace`;
          ctx.fillText(glyphFor(windX[n], windY[n]), px + CELL / 2, py + CELL / 2 + .5);
          ctx.font = `600 ${CELL - 2}px ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace`;
        }
      }
    }
    for (let i = 0; i < wind.length; i++) if (wind[i]) wind[i] = wind[i] > .02 ? wind[i] * .9 : 0;
  }

  resize();
  new ResizeObserver(() => resize()).observe(canvas);
  if (location.search.includes('debug')) window.__sky = { draw, get wind() { return wind; } };
  if (calm) return;
  draw(0); // paint straight away, before the first animation frame
  let on = true, prev = 0, t = 0;
  new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(canvas);
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (!on || now - prev < 1000 / FPS - 2) return;
    t += Math.min(.1, (now - (prev || now)) / 1000); prev = now;
    draw(t);
  };
  requestAnimationFrame(loop);
}
