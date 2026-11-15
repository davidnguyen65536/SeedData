// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.
//
// The farm plan, land shape and ground-colour bake, shared by the page (main.js) and the build step (bake.mjs).
import * as THREE from 'three';

export const CLS = { grass: 1, leaf: 2, flower: 3, metal: 4, dirt: 5, roof: 6, wood: 7, soil: 8, water: 9, wheat: 10, animal: 11, hay: 12, stubble: 13, fence: 14, mote: 15 };

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const fract = x => x - Math.floor(x);
export const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
export function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (hash2(i, j) * (1 - u) + hash2(i + 1, j) * u) * (1 - v) + (hash2(i, j + 1) * (1 - u) + hash2(i + 1, j + 1) * u) * v;
}
export const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.1 + 3, y * 2.1) * .28 + vnoise(x * 4.3, y * 4.3 + 5) * .15 + vnoise(x * 8.7, y * 8.7) * .07;
export let seed = 23;
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- the farm plan ----------
// Paddocks are laid out in (uu, v): v runs along the track, uu is the distance across it. The grid is turned
// about 26 degrees from the screen so the track reads as the diagonal leading line.
export const UX = .901, UZ = .434, TRK = 1.9;
export const trackU = (v) => 1.6 * Math.sin(v * .07 + .4);
export const toWorld = (uu, v) => { const u = uu + trackU(v); return [u * UX - v * UZ, u * UZ + v * UX]; };
export const COLS_U = [TRK, 19, 37, 56, 200];
export const ROWS_V = {
  L: [[-60, -38, -23, -8, 7, 21, 60], [-60, -45, -29, -13, 3, 18, 60], [-60, -36, -20, -4, 12, 60], [-60, 60]],
  R: [[-60, -41, -26, -10, 8, 23, 60], [-60, -33, -18, -3, 13, 27, 60], [-60, -40, -24, -8, 8, 60], [-60, 60]],
};
// W wheat, C canola, L legume rows, P pasture, F fallow, S stubble with bales, Y farmyard, T track
export const CROPS = { L: ['WLCWFP', 'CPWLPW', 'PCWFL', 'P'], R: ['PWPYPF', 'PCSWFP', 'WPLPS', 'W'] };
export const PD = { crop: 'P', edge: 0, uu: 0, v: 0 };
export function paddock(x, z) {
  const v = -x * UZ + z * UX, uu = x * UX + z * UZ - trackU(v), a = Math.abs(uu), side = uu < 0 ? 'L' : 'R';
  PD.uu = uu; PD.v = v;
  if (a < TRK) { PD.crop = 'T'; PD.edge = TRK - a; return PD; }
  let c = 0; while (c < 3 && a > COLS_U[c + 1]) c++;
  const rows = ROWS_V[side][c]; let r = 0; while (r < rows.length - 2 && v > rows[r + 1]) r++;
  PD.crop = CROPS[side][c][r]; PD.edge = Math.min(a - COLS_U[c], COLS_U[c + 1] - a, v - rows[r], rows[r + 1] - v);
  return PD;
}
export const CELLS = [];
for (const side of ['L', 'R']) ROWS_V[side].forEach((rows, c) => { for (let r = 0; r < rows.length - 1; r++) CELLS.push({ side, crop: CROPS[side][c][r], a0: COLS_U[c], a1: Math.min(COLS_U[c + 1], 75), v0: Math.max(rows[r], -62), v1: Math.min(rows[r + 1], 50) }); });
export const inView = (x, z) => x > -60 && x < 72 && z > -46 && z < 33 && !(z < -33 && Math.abs(x - 6) > 32);

// farmyard (rigid local frame: +x away from the track, +z towards the viewer) and the dam
export const YU = 11, YV = -1;
export const yardW = (lx, lz) => { const u = YU + lx, v = YV + lz; return [u * UX - v * UZ, u * UZ + v * UX]; };
export const yardL = (x, z) => [x * UX + z * UZ - YU, -x * UZ + z * UX - YV];
export const GRID_ROT = -Math.atan2(UZ, UX);
export const [YX, YZ] = yardW(0, 0), [DX, DZ] = toWorld(10, 13);
export const damQ = (x, z) => ((x - DX) / 5.2) ** 2 + ((z - DZ) / 3.3) ** 2;

// ---------- land ----------
export const base = (x, z) => 1.3 + (fbm(x * .03 + 7, z * .03) - .5) * 5.5 + (fbm(x * .11, z * .11 + 3) - .5) * .9;
export const YARD_Y = base(YX, YZ);
export const flat1 = (x, z) => { const y = base(x, z); return y + (YARD_Y - y) * sstep(16, 9, Math.hypot(x - YX, z - YZ)); };
export const DAM_Y = flat1(DX, DZ), WL = DAM_Y - .55;
export function rawH(x, z) {
  let y = flat1(x, z);
  const q = damQ(x, z);
  if (q < 5) { y += (DAM_Y - y) * sstep(4.5, 2, q); y -= 2 * Math.exp(-q * 1.1); }
  return y;
}
export const PATH = []; for (let v = -52; v <= 44; v += 6) PATH.push(toWorld(0, v));
export const pathCurve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', .5);
export const pathLen = pathCurve.getLength();
export const pathS = [];
for (let i = 0; i <= 500; i++) { const p = pathCurve.getPointAt(i / 500); pathS.push({ x: p.x, z: p.z, y: rawH(p.x, p.z) }); }
for (let pass = 0; pass < 7; pass++) {
  const c = pathS.map(s => s.y);
  for (let i = 0; i < c.length; i++) { let a = 0, n = 0; for (let k = -9; k <= 9; k++) { const v = c[i + k]; if (v !== undefined) { a += v; n++; } } pathS[i].y = a / n; }
}
export const X0 = -72, X1 = 78, Z0 = -56, Z1 = 42, FW = 751, FH = 491;
export const fD = new Float32Array(FW * FH), fY = new Float32Array(FW * FH), fH = new Float32Array(FW * FH);
// Height, nearest-track distance and track height on a grid. Called once before anything samples H, pathD or fY.
let filled = false;
export function fillFields() {
  if (filled) return; filled = true;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const x = X0 + (X1 - X0) * i / (FW - 1), z = Z0 + (Z1 - Z0) * j / (FH - 1);
    const vv = -x * UZ + z * UX, uu0 = Math.abs(x * UX + z * UZ - trackU(vv));
    if (uu0 > 7 && vv > -50 && vv < 42) { fD[j * FW + i] = uu0; fY[j * FW + i] = 0; fH[j * FW + i] = rawH(x, z); continue; }
    let best = 1e9, by = 0;
    for (let k = 0; k < pathS.length; k += 3) { const s = pathS[k], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < best) { best = d; by = s.y; } }
    const D = Math.sqrt(best), k = sstep(3, 1.4, D);
    fD[j * FW + i] = D; fY[j * FW + i] = by;
    fH[j * FW + i] = rawH(x, z) * (1 - k) + (by - .03) * k;
  }
}
export function samp(f, x, z) {
  const u = clamp((x - X0) / (X1 - X0)) * (FW - 1), v = clamp((z - Z0) / (Z1 - Z0)) * (FH - 1);
  const i = Math.min(FW - 2, u | 0), j = Math.min(FH - 2, v | 0), a = u - i, b = v - j;
  return (f[j * FW + i] * (1 - a) + f[j * FW + i + 1] * a) * (1 - b) + (f[(j + 1) * FW + i] * (1 - a) + f[(j + 1) * FW + i + 1] * a) * b;
}
export const H = (x, z) => samp(fH, x, z);
export const pathD = (x, z) => samp(fD, x, z);
export const isLawn = (lx, lz) => lx > -8.7 && lx < 3.3 && lz > -8.7 && lz < -1.1;
export const isDrive = (lx, lz) => lx > -11.5 && lx < -6.5 && Math.abs(lz) < 2.5;
export const dryField = (x, z) => fbm(x * .07 + 20, z * .07);


// Ground colour (RGBA) and surface class (one byte per texel, class * 16), from three 512 px textures given as { d, w, h }.
export const TW = 1024, TH = 669;
export function bakeTerrain(grass, soil, dirt) {
  const col = new Uint8Array(TW * TH * 4), cls = new Uint8Array(TW * TH);
  const pick = (t, x, z, m) => { const o = (((fract(z / m) * t.h) | 0) * t.w + ((fract(x / m) * t.w) | 0)) * 4; return [t.d[o], t.d[o + 1], t.d[o + 2]]; };
  const mean = (t) => { let a = 0; for (let i = 0; i < t.d.length; i += 4) a += t.d[i] * .3 + t.d[i + 1] * .6 + t.d[i + 2] * .1; return a / (t.d.length / 4); };
  const soilMean = mean(soil), dirtMean = mean(dirt);
  const lumOf = (c) => clamp((c[0] * .3 + c[1] * .6 + c[2] * .1) / soilMean, .6, 1.35);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const x = X0 + (X1 - X0) * i / (TW - 1), z = Z0 + (Z1 - Z0) * j / (TH - 1), pd = pathD(x, z);
    paddock(x, z);
    const crop = PD.crop, uu = PD.uu, e = PD.edge;
    const n = fbm(x * .3, z * .3), tone = .62 + .95 * fbm(x * .16 + 5, z * .16);
    const [lx, lz] = yardL(x, z);
    let c, k;
    const rough = () => { c = pick(grass, x, z, 2.6); const d = sstep(.5, .68, dryField(x, z)); c = [c[0] * (.9 + .26 * d) * tone, c[1] * (1.22 - .04 * d) * tone, c[2] * (.44 + .1 * d) * tone]; k = CLS.grass; };
    const earth = (m) => { c = pick(dirt, x, z, 4); m *= clamp((c[0] * .3 + c[1] * .6 + c[2] * .1) / dirtMean, .7, 1.3); c = [214 * m, 150 * m, 100 * m]; k = CLS.dirt; };
    if (pd < 1.2 + n * .3) {
      earth(Math.abs(pd - .55) < .2 ? .78 : 1.05);
      if (pd < .24 && n > .42) rough();
    } else if (isDrive(lx, lz)) earth(.95);
    else if (crop === 'T' || (e < .55 && crop !== 'Y')) rough();
    else if (crop === 'Y') {
      if (isLawn(lx, lz)) { c = pick(grass, x, z, 2.6); c = [c[0] * .7 * tone, c[1] * 1.12 * tone, c[2] * .4 * tone]; k = CLS.grass; }
      else if (e < 2.6 && fbm(x * .5, z * .5) > .5) rough();
      else earth(.92 + .2 * n);
    } else if (crop === 'P') {
      rough();
      const q = damQ(x, z);
      if (q < 1.75) { const m = pick(soil, x, z, 3); const t = sstep(1.75, 1.2, q); const ml = lumOf(m); c = [c[0] * (1 - t) + 150 * ml * t, c[1] * (1 - t) + 122 * ml * t, c[2] * (1 - t) + 92 * ml * t]; if (t > .5) k = CLS.soil; }
    } else if (crop === 'W') { const m = lumOf(pick(soil, x, z, 3)); c = [205 * m * tone, 152 * m * tone, 60 * m * tone]; k = CLS.wheat; }
    else if (crop === 'C') { const m = lumOf(pick(soil, x, z, 3)); c = [172 * m * tone, 166 * m * tone, 44 * m * tone]; k = CLS.flower; }
    else if (crop === 'F') { const st = .5 + .5 * Math.sin(uu * 6.98); c = pick(soil, x, z, 3); const m = (.66 + .5 * st) * lumOf(c = pick(soil, x, z, 3)); c = [142 * m, 104 * m, 78 * m]; k = CLS.soil; }
    else if (crop === 'L') {
      if (Math.cos(uu * 6.2832) > .45) { c = [44 * tone, 92 * tone, 38 * tone]; k = CLS.leaf; }
      else { const m = lumOf(pick(soil, x, z, 3)); c = [150 * m, 112 * m, 84 * m]; k = CLS.soil; }
    } else { const m = lumOf(pick(soil, x, z, 3)) * (.9 + .12 * Math.sin(uu * 15.7)); c = [214 * m, 186 * m, 116 * m]; k = CLS.stubble; }
    const o = (j * TW + i) * 4;
    col[o] = Math.min(255, c[0]); col[o + 1] = Math.min(255, c[1]); col[o + 2] = Math.min(255, c[2]); col[o + 3] = 255; cls[j * TW + i] = k * 16;
  }
  return { col, cls };
}
