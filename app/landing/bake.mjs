// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.
//
// Build step: bakes the ground colour and surface classes once, so the page does not spend seconds on it at load.
// Writes assets/terrain.jpg and assets/terrain-cls.png. Run by `npm run build:landing`.
import fs from 'node:fs';
import zlib from 'node:zlib';
import jpeg from 'jpeg-js';
import { bakeTerrain, fillFields, TW, TH } from './farm.js';

const dir = new URL('./assets/', import.meta.url);
const load = (n) => { const j = jpeg.decode(fs.readFileSync(new URL(`tex/${n}.jpg`, dir)), { useTArray: true }); return { d: j.data, w: j.width, h: j.height }; };
fillFields();
const { col, cls } = bakeTerrain(load('leafy_grass'), load('farm_soil'), load('red_laterite_soil_stones'));
fs.writeFileSync(new URL('terrain.jpg', dir), jpeg.encode({ data: col, width: TW, height: TH }, 70).data);

// 8-bit greyscale PNG, rows top to bottom (the page reads it with flipY off, row 0 at the far edge)
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };
const raw = Buffer.alloc((TW + 1) * TH);
for (let j = 0; j < TH; j++) { raw[j * (TW + 1)] = 0; Buffer.from(cls.buffer, j * TW, TW).copy(raw, j * (TW + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(TW, 0); ihdr.writeUInt32BE(TH, 4); ihdr[8] = 8; ihdr[9] = 0;
fs.writeFileSync(new URL('terrain-cls.png', dir), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log('baked terrain', TW, 'x', TH);
