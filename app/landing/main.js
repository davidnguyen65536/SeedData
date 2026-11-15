// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.
//
// Landing diorama: a farmstead among rotation paddocks (wheat, canola, legumes, pasture, fallow, stubble),
// drawn as coloured monospace glyphs with a tilt-shift blur. Runs live and loops forever (Space pauses).
// Source for build/main.js: rebuild with `npm run build:landing` after editing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fillFields, CELLS, CLS, UZ, TRK, YV, COLS_U, CROPS, DAM_Y, DX, DZ, FH, FW, GRID_ROT, H, PATH, PD, ROWS_V, UX, WL, X0, X1, YARD_Y, YU, YX, YZ, Z0, Z1, base, clamp, damQ, dryField, fD, fH, fY, fbm, flat1, fract, hash2, inView, isDrive, isLawn, paddock, pathCurve, pathD, pathLen, pathS, rawH, rnd, samp, sstep, toWorld, trackU, yardL, yardW } from './farm.js';

const ASSETS = new URL('../assets/', import.meta.url).href;
const DURATION = 26;                       // one camera sweep in seconds
const ROWS = 100;                          // glyph rows; columns follow the window's aspect
const COARSE = matchMedia('(pointer: coarse)').matches;
const Q = COARSE ? .55 : 1;                // density of the small things (phones get fewer)
const time = { value: 0 };
function tag(mat, cls, extra) {
  mat.onBeforeCompile = (s) => {
    extra?.(s);
    s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n gl_FragColor.a = ${(cls / 16).toFixed(4)};`);
  };
  mat.customProgramCacheKey = () => `c${cls}${extra ? extra.name : ''}`;
  return mat;
}
const texLoader = new THREE.TextureLoader();
const PENDING = []; // every texture the first frame needs
function tex(name, rx = 1, ry = 1) { let t; PENDING.push(new Promise((res) => { t = texLoader.load(`${ASSETS}tex/${name}.jpg`, res, undefined, res); })); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; }

async function buildTerrain() {
  const [colTex, clsTex] = await Promise.all([texLoader.loadAsync(`${ASSETS}terrain.jpg`), texLoader.loadAsync(`${ASSETS}terrain-cls.png`)]);
  colTex.flipY = false; colTex.colorSpace = THREE.SRGBColorSpace; colTex.magFilter = THREE.LinearFilter; colTex.minFilter = THREE.LinearMipmapLinearFilter; colTex.anisotropy = 8; colTex.needsUpdate = true;
  clsTex.flipY = false; clsTex.generateMipmaps = false; clsTex.magFilter = clsTex.minFilter = THREE.NearestFilter; clsTex.needsUpdate = true;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 460, 300); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, H(x, z)); uv.setXY(i, (x - X0) / (X1 - X0), (z - Z0) / (Z1 - Z0)); }
  g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ map: colTex });
  m.onBeforeCompile = (s) => {
    s.uniforms.clsTex = { value: clsTex };
    s.fragmentShader = 'uniform sampler2D clsTex;\n' + s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n gl_FragColor.a = texture2D(clsTex, vMapUv).r;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

// ---------- dam ----------
function buildDam() {
  const depth = new Float32Array(FW * FH * 4);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) depth[(j * FW + i) * 4] = WL - fH[j * FW + i];
  const dt = new THREE.DataTexture(depth, FW, FH, THREE.RGBAFormat, THREE.FloatType);
  dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const m = new THREE.ShaderMaterial({
    uniforms: { uD: { value: dt }, uT: time, uB: { value: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) }, uC: { value: new THREE.Vector2(DX, DZ) } },
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uD; uniform float uT; uniform vec4 uB; uniform vec2 uC; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      float hgt(vec2 p){ return vn(p*1.3+vec2(uT*.55,uT*.22))*.5+vn(p*2.7-vec2(uT*.35,uT*.8))*.3+vn(p*5.3+uT*vec2(.9,-.6))*.2; }
      void main(){
        float d = texture2D(uD,(vW.xz-uB.xy)/uB.zw).r;
        vec2 p = vW.xz, qd = (p-uC)/vec2(5.2,3.3);
        if(d<0. || dot(qd,qd)>1.5) discard;
        float dist = sqrt(d);
        float white = 0.;
        float gust = .45+.9*smoothstep(.35,.75,vn(p*.22-vec2(uT*.3,uT*.12)));
        float e = .09, h0 = hgt(p);
        vec2 sl = vec2(hgt(p+vec2(e,0))-h0, hgt(p+vec2(0,e))-h0)/e*.16*gust;
        for(int i=0;i<4;i++){
          float fi = float(i), cyc = uT/4.7+fi*.37, age = fract(cyc), id = floor(cyc);
          vec2 ctr = uC + (vec2(h21(vec2(id,fi)),h21(vec2(fi,id+3.)))-.5)*vec2(6.,3.6);
          vec2 q = p-ctr; float r = length(q)+1e-4, rr = age*2.6;
          float dr = r-rr; // squared by hand: pow() of a negative number is NaN on many GPUs
          sl += q/r*cos(dr*13.)*exp(-dr*dr*9.)*(1.-age)*.55;
          white += exp(-dr*dr*49.)*(1.-age)*smoothstep(0.,.08,age);
        }
        vec3 n = normalize(vec3(-sl.x,1.,-sl.y));
        vec3 V = normalize(cameraPosition-vW), L = normalize(vec3(-28.,48.,26.));
        vec3 c = mix(vec3(.5,.48,.32), vec3(.09,.4,.42), smoothstep(.05,.7,dist));
        c = mix(c, vec3(.02,.2,.27), smoothstep(.6,1.25,dist));
        c *= .78+.42*clamp(dot(n,L),0.,1.);
        vec3 R = reflect(-V,n);
        float fres = .08+.92*pow(1.-max(dot(n,V),0.),4.);
        c = mix(c, mix(vec3(.62,.72,.74),vec3(.88,.9,.84),clamp(R.y,0.,1.)), fres*.55);
        float glint = pow(max(dot(reflect(-L,n),V),0.),60.)*2.2;
        float sp = smoothstep(.84,.93,vn(p*vec2(1.8,4.2)+uT*vec2(.35,.5)))*gust;
        c += vec3(1.,.95,.82)*(glint+sp*.45)*smoothstep(.25,.8,dist);
        // wind-driven wave crests, broken up so they read as little white ripples
        float wv = sin(dot(p,vec2(.85,.52))*5.2-uT*1.9+vn(p*.9+uT*.15)*4.);
        white += smoothstep(.82,.98,wv)*smoothstep(.42,.72,vn(p*vec2(1.6,2.3)+vec2(uT*.4,-uT*.25)))*gust*.9;
        // the edge froths as each little wave laps in
        float lap = .1+.07*sin(uT*.9+p.x*.6+vn(p*.5)*4.);
        white += (1.-smoothstep(lap,lap+.09,d))*(.55+.45*vn(p*3.+uT*.6));
        c = mix(c, vec3(1.02,1.03,.98), clamp(white,0.,1.)*.85);
        float ring = smoothstep(.75,1.,sin(dist*16.-uT*1.3+vn(p*.6)*5.));
        c += vec3(.16,.26,.26)*ring*(1.-smoothstep(.2,1.,dist));
        gl_FragColor = vec4(c, 9./16.);
      }`,
  });
  const g = new THREE.PlaneGeometry(16, 11); g.rotateX(-Math.PI / 2); g.translate(DX, WL, DZ);
  return new THREE.Mesh(g, m);
}

// ---------- wind for everything soft ----------
function bladeWind(s) {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = instanceMatrix[3].x*.34+instanceMatrix[3].z*.22;
    float gust = sin(uT*.75-ph)*.5+.5;
    transformed.x += (sin(uT*1.6+ph*2.)*.28+gust*.6)*.22*position.y*position.y;`);
}
function leafWind(s) {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = instanceMatrix[3].x*.9+instanceMatrix[3].z*.7+instanceMatrix[3].y*.8;
    transformed.y += sin(uT*2.1+ph)*.035;
    transformed += vec3(1.,0.,.4)*sin(uT*.8+instanceMatrix[3].x*.22)*.06;`);
}

// ---------- the dense fill: pasture, wheat, canola, legumes, stubble ----------
function batch(geo, cls, wind) {
  const M = [], C = [];
  return {
    add(x, y, z, ry, sx, sy, r, g, b) { M.push(x, y, z, ry, sx, sy); C.push(r, g, b); },
    build(scene, rx = 0) {
      const n = C.length / 3, im = new THREE.InstancedMesh(geo, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), cls, wind), n);
      const o = new THREE.Object3D(), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        o.position.set(M[i * 6], M[i * 6 + 1], M[i * 6 + 2]); o.rotation.set(rx ? rnd() * 6 : 0, M[i * 6 + 3], rx ? rnd() * 6 : 0); o.scale.set(M[i * 6 + 4], M[i * 6 + 5], M[i * 6 + 4]); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
        c.setRGB(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]); im.setColorAt(i, c);
      }
      im.receiveShadow = true; scene.add(im);
    },
  };
}
function scatterCells(crop, density, margin, rowSp, fn) {
  for (const c of CELLS) if (c.crop === crop) {
    const n = Math.floor((c.a1 - c.a0) * (c.v1 - c.v0) * density * Q);
    for (let i = 0; i < n; i++) {
      let a = c.a0 + margin + rnd() * (c.a1 - c.a0 - 2 * margin);
      if (rowSp) a = Math.round(a / rowSp) * rowSp + (rnd() - .5) * rowSp * .32;
      const [x, z] = toWorld(c.side === 'L' ? -a : a, c.v0 + margin + rnd() * (c.v1 - c.v0 - 2 * margin));
      if (inView(x, z)) fn(x, z);
    }
  }
}
function buildCrops(scene) {
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-.045, 0, 0, .045, 0, 0, .012, .6, 0, -.045, 0, 0, .012, .6, 0, 0, 1, 0], 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const grass = batch(blade, CLS.grass, bladeWind), wheat = batch(blade, CLS.wheat, bladeWind), stubble = batch(blade, CLS.stubble, bladeWind);
  const card = new THREE.PlaneGeometry(.16, .16); card.rotateX(-Math.PI / 2 + .25);
  const bloom = batch(card, CLS.flower, bladeWind);
  const leafCard = new THREE.PlaneGeometry(.28, .22);
  const legume = batch(leafCard, CLS.leaf, leafWind);
  const green = (x, z, v) => { const tn = fbm(x * .16 + 5, z * .16), dk = .55 + 1.1 * tn, d = sstep(.5, .68, dryField(x, z)); return [(.15 + tn * .1 + .15 * d) * v * dk, (.46 + .02 * d) * v * dk, (.06 + .05 * d) * v * dk]; };

  // pasture
  scatterCells('P', 40, .1, 0, (x, z) => {
    const y = H(x, z); if (y < WL + .06) return;
    const v = .55 + rnd() * .75, c = green(x, z, v);
    grass.add(x, y - .02, z, rnd() * 6.28, 1.5, .26 + rnd() * .26, c[0], c[1], c[2]);
  });
  // verges, fence strips, lawn and the rough edges of the yard
  for (let i = 0, n = 300000 * Q; i < n; i++) {
    const x = -60 + rnd() * 132, z = -46 + rnd() * 79;
    if (!inView(x, z)) continue;
    paddock(x, z);
    const pd = pathD(x, z), [lx, lz] = yardL(x, z);
    if (isDrive(lx, lz) || pd < 1.3) continue;
    const lawn = PD.crop === 'Y' && isLawn(lx, lz);
    if (!(lawn || PD.crop === 'T' || (PD.edge < .5 && PD.crop !== 'Y') || (PD.crop === 'Y' && PD.edge < 2.4 && fbm(x * .5, z * .5) > .52))) continue;
    if (lawn && lx > -5.8 && lx < 2.7 && lz > -7.7 && lz < -1.5) continue; // under the homestead
    const v = .55 + rnd() * .75, c = lawn ? [.1 * v, .42 * v, .05 * v] : PD.crop === 'T' ? [.16 * v, .44 * v, .06 * v] : green(x, z, v);
    grass.add(x, H(x, z) - .02, z, rnd() * 6.28, 1.5, lawn ? .16 + rnd() * .1 : .34 + rnd() * .36, c[0], c[1], c[2]);
  }
  // reeds around the dam
  for (let i = 0; i < 5200 * Q; i++) {
    const a = rnd() * 6.28, q = Math.sqrt(1.02 + rnd() * .42), x = DX + Math.cos(a) * 5.2 * q, z = DZ + Math.sin(a) * 3.3 * q;
    if (fbm(x * .7, z * .7) < .44) continue;
    const v = .5 + rnd() * .6; grass.add(x, H(x, z) - .02, z, rnd() * 6.28, 1.7, .6 + rnd() * .5, .1 * v, .3 * v, .08 * v);
  }
  // wheat, sown in drill rows along the track
  scatterCells('W', 80, .5, .42, (x, z) => {
    const v = .72 + rnd() * .5, tn = .75 + .5 * fbm(x * .16 + 5, z * .16);
    wheat.add(x, H(x, z) - .02, z, rnd() * 6.28, 2.1, .62 + rnd() * .3, 1.02 * v * tn, .7 * v * tn, .2 * v * tn);
  });
  // canola: green stems under a yellow bloom
  scatterCells('C', 22, .5, .5, (x, z) => { const v = .6 + rnd() * .5; grass.add(x, H(x, z) - .02, z, rnd() * 6.28, 1.5, .5 + rnd() * .2, .22 * v, .4 * v, .06 * v); });
  scatterCells('C', 70, .5, .5, (x, z) => {
    if (fbm(x * .8, z * .8) < .3) return;
    const v = .78 + rnd() * .4; bloom.add(x, H(x, z) + .5 + rnd() * .22, z, rnd() * 6.28, 1.1 + rnd() * 1, 1, .95 * v, .76 * v, .1 * v);
  });
  // legumes: low bushes in wide rows
  scatterCells('L', 17, .6, 1, (x, z) => {
    const v = .6 + rnd() * .7;
    for (let k = 0; k < 4; k++) legume.add(x + (rnd() - .5) * .3, H(x, z) + .1 + rnd() * .26, z + (rnd() - .5) * .3, rnd() * 6.28, 1, 1, .1 * v, .32 * v, .1 * v);
  });
  // stubble
  scatterCells('S', 32, .4, .42, (x, z) => { const v = .7 + rnd() * .5; stubble.add(x, H(x, z) - .02, z, rnd() * 6.28, 1.5, .14 + rnd() * .1, .78 * v, .62 * v, .32 * v); });

  grass.build(scene); wheat.build(scene); stubble.build(scene); bloom.build(scene); legume.build(scene, 1);
}

// ---------- trees: eucalypts in shelterbelts, a few paddock gums, a small orchard ----------
function buildTrees(scene, barkTex) {
  const spots = [];
  const belt = (sg, a0, a1, v0, v1, n, s = 1) => {
    for (let i = 0; i < n; i++) {
      const f = (i + .5) / n, [x, z] = toWorld(sg * (a0 + (a1 - a0) * f) + (rnd() - .5) * 1.3, v0 + (v1 - v0) * f + (rnd() - .5) * 1.3);
      if (inView(x, z)) spots.push({ x, z, s: s * (.8 + rnd() * .45), kind: rnd() < .1 ? 'wattle' : 'gum' });
    }
  };
  belt(-1, 3, 18, -24.3, -24.3, 6); belt(1, 3, 18, -27.4, -27.4, 6); belt(-1, 20.4, 20.4, -12, 2, 5);
  belt(1, 20.5, 20.5, -17, -4, 4); belt(1, 38.3, 38.3, -30, 6, 9); belt(-1, 38.3, 38.3, -18, 14, 8);
  belt(-1, 21, 34, 19.2, 19.2, 4); belt(1, 20.5, 20.5, 14, 26, 4); belt(-1, 3, 18, -39.3, -39.3, 5); belt(1, 3, 18, -42.4, -42.4, 5);
  for (const [uu, v, s] of [[6, -20, 1.05], [14, -14.5, .9], [16.5, -23, 1], [16.4, 10.5, .95], [15.5, 19.5, 1.05], [4.6, 20.5, .9], [-25, 8, 1], [-31, 13, .9], [-23, 15.5, .85], [26, 2, .9], [31, -8, 1], [-27, -33, 1], [9, -52, 1]]) { const [x, z] = toWorld(uu, v); spots.push({ x, z, s, kind: 'gum' }); }
  for (const [lx, lz, s, kind] of [[7.9, -8.2, 1.05, 'gum'], [8.1, 8, .95, 'gum'], [-3.4, 8.2, .85, 'gum'], [-8, -8.7, .8, 'gum'], [-7.5, -7, .36, 'fruit'], [-7.5, -5.4, .34, 'fruit'], [-7.5, -3.8, .37, 'fruit'], [-7.5, -2.2, .33, 'fruit']]) { const [x, z] = yardW(lx, lz); spots.push({ x, z, s, kind }); }
  const leaves = [], pal = {
    gum: [[.3, .42, .2], [.38, .48, .24], [.2, .3, .15], [.46, .52, .3], [.26, .38, .22]],
    wattle: [[.95, .74, .12], [.8, .6, .08], [.3, .42, .16], [.42, .5, .2]],
    fruit: [[.12, .32, .08], [.18, .4, .1], [.1, .24, .07], [.95, .5, .08]],
  };
  const trunks = [], perLobe = Math.round(145 * (COARSE ? .6 : 1));
  for (const t of spots) {
    const y0 = H(t.x, t.z), H0 = 5.5 * t.s;
    const tg = new THREE.CylinderGeometry(.09 * t.s, .2 * t.s, H0, 7); tg.translate(t.x, y0 + H0 / 2, t.z);
    trunks.push(tg);
    for (let b = 0; b < 3; b++) { const a = rnd() * 6.28; const bg = new THREE.CylinderGeometry(.03 * t.s, .08 * t.s, 2.4 * t.s, 5); bg.rotateZ(.8); bg.rotateY(a); bg.translate(t.x + Math.cos(a) * .7 * t.s, y0 + H0 * .7, t.z - Math.sin(a) * .7 * t.s); trunks.push(bg); }
    for (let l = 0; l < 10; l++) {
      const a = rnd() * 6.28, r = rnd() ** .6 * 2.7 * t.s, lx = t.x + Math.cos(a) * r, lz = t.z + Math.sin(a) * r, ly = y0 + H0 * .8 + (rnd() - .35) * 1.9 * t.s + (1 - r / (2.8 * t.s)) * 1.2 * t.s;
      const lr = (.7 + rnd() * .55) * t.s;
      for (let i = 0; i < perLobe; i++) {
        const u = rnd() * 2 - 1, th = rnd() * 6.28, q = Math.sqrt(1 - u * u), rr = lr * Math.cbrt(rnd());
        const p = pal[t.kind][(rnd() * pal[t.kind].length) | 0], lit = .72 + .6 * clamp(u * .5 + .5);
        leaves.push(lx + q * Math.cos(th) * rr, ly + u * rr * .75, lz + q * Math.sin(th) * rr, p[0] * lit, p[1] * lit, p[2] * lit);
      }
    }
  }
  const trunk = new THREE.Mesh(mergeGeometries(trunks), tag(new THREE.MeshLambertMaterial({ map: barkTex, color: '#efe8dc' }), CLS.wood)); trunk.castShadow = true; scene.add(trunk);
  const count = leaves.length / 6, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(.3, .24), tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.leaf, leafWind), count);
  const o = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    o.position.set(leaves[i * 6], leaves[i * 6 + 1], leaves[i * 6 + 2]); o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    c.setRGB(leaves[i * 6 + 3], leaves[i * 6 + 4], leaves[i * 6 + 5]); im.setColorAt(i, c);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}

// ---------- fences: posts and two wires along every paddock boundary and both sides of the track ----------
function buildFences(scene) {
  const posts = [], wires = [];
  const run = (sg, a0, a1, v0, v1) => {
    const n = Math.ceil(Math.hypot(a1 - a0, v1 - v0) / 1.55); let prev = null;
    for (let i = 0; i <= n; i++) {
      const f = i / n, a = a0 + (a1 - a0) * f, v = v0 + (v1 - v0) * f, [x, z] = toWorld(sg * a, v);
      if ((sg > 0 && a0 === TRK && a1 === TRK && v > -3.7 && v < 1.7) || !inView(x, z)) { prev = null; continue; } // yard gate
      const cur = [x, H(x, z), z]; posts.push(cur);
      if (prev) wires.push([prev, cur]);
      prev = cur;
    }
  };
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? -1 : 1;
    for (let c = 0; c < 4; c++) run(sg, COLS_U[c], COLS_U[c], -60, 48);
    ROWS_V[side].forEach((rows, c) => { for (let r = 1; r < rows.length - 1; r++) run(sg, COLS_U[c], Math.min(COLS_U[c + 1], 75), rows[r], rows[r]); });
  }
  const o = new THREE.Object3D();
  const pim = new THREE.InstancedMesh(new THREE.BoxGeometry(.26, 1.15, .26), tag(new THREE.MeshLambertMaterial({ color: '#e0d2b2' }), CLS.fence), posts.length);
  posts.forEach(([x, y, z], i) => { o.position.set(x, y + .52, z); o.rotation.set(0, rnd(), 0); o.updateMatrix(); pim.setMatrixAt(i, o.matrix); });
  pim.castShadow = true; scene.add(pim);
  const wim = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .06, .06), tag(new THREE.MeshLambertMaterial({ color: '#cfc8ba' }), CLS.fence), wires.length * 2);
  wires.forEach(([a, b], i) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
    for (let k = 0; k < 2; k++) { o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + .55 + k * .4, (a[2] + b[2]) / 2); o.rotation.set(0, Math.atan2(-dz, dx), Math.asin(dy / len)); o.scale.set(len, 1, 1); o.updateMatrix(); wim.setMatrixAt(i * 2 + k, o.matrix); }
  });
  scene.add(wim);
}

// ---------- farmstead ----------
function colored(g, r, gr, b) {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([r, gr, b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const mergeFlat = (parts) => { const m = mergeGeometries(parts); m.computeVertexNormals(); return m; };
// Hip roof or veranda skirt: a top rectangle w0 x d0 at height h over a bottom rectangle w1 x d1.
function frustumRect(w0, d0, w1, d1, h) {
  const T = [[w0 / 2, h, d0 / 2], [-w0 / 2, h, d0 / 2], [-w0 / 2, h, -d0 / 2], [w0 / 2, h, -d0 / 2]], B = [[w1 / 2, 0, d1 / 2], [-w1 / 2, 0, d1 / 2], [-w1 / 2, 0, -d1 / 2], [w1 / 2, 0, -d1 / 2]];
  const pos = [], uv = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pos.push(...B[i], ...T[j], ...B[j], ...B[i], ...T[i], ...T[j]); uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1); }
  pos.push(...T[0], ...T[2], ...T[1], ...T[0], ...T[3], ...T[2]); uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function beam(p0, p1, th) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), d = b.clone().sub(a), g = new THREE.BoxGeometry(th, d.length(), th);
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
}
// Gable roof with the ridge along z: two slabs, plus the two triangles under them.
function gable(span, len, pitch, eave, mat, wallMat) {
  const g = new THREE.Group(), half = span / 2 + eave, sw = half / Math.cos(pitch), rise = half * Math.tan(pitch);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(sw, .08, len + eave * 2), mat); m.rotation.z = -s * pitch; m.position.set(s * half / 2, rise / 2, 0); g.add(m); }
  if (wallMat) for (const s of [-1, 1]) {
    const t = new THREE.BufferGeometry(), h = span / 2 * Math.tan(pitch);
    t.setAttribute('position', new THREE.Float32BufferAttribute([-span / 2, -eave * Math.tan(pitch), s * len / 2, span / 2, -eave * Math.tan(pitch), s * len / 2, 0, h - eave * Math.tan(pitch), s * len / 2], 3));
    t.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .5, 1], 2)); t.computeVertexNormals(); g.add(new THREE.Mesh(t, wallMat));
  }
  g.position.y = -eave * Math.tan(pitch) * 0;
  return g;
}
function buildFarmstead(scene) {
  const D = THREE.DoubleSide;
  const iron = (rx, ry) => tex('corrugated_iron', rx, ry);
  const roofRed = tag(new THREE.MeshLambertMaterial({ map: iron(3, 2), color: '#ff4a26', emissive: '#5a0d02', emissiveIntensity: .28, side: D }), CLS.roof);
  const roofRed2 = tag(new THREE.MeshLambertMaterial({ map: iron(4, 1), color: '#b5331a', emissive: '#4a0b02', emissiveIntensity: .2, side: D }), CLS.roof);
  const galv = tag(new THREE.MeshLambertMaterial({ map: iron(2, 2), color: '#eef2f4', side: D }), CLS.metal);
  const shedWall = tag(new THREE.MeshLambertMaterial({ map: iron(3, 1), color: '#aeb7b8', side: D }), CLS.metal);
  const wall = tag(new THREE.MeshLambertMaterial({ map: tex('white_planks_clean', 2, 1), color: '#f6ead2', side: D }), CLS.wood);
  const timber = tag(new THREE.MeshLambertMaterial({ color: '#8d7558' }), CLS.wood);
  const white = tag(new THREE.MeshLambertMaterial({ color: '#f4f1e8' }), CLS.metal);
  const dark = tag(new THREE.MeshLambertMaterial({ color: '#2b2622' }), CLS.fence);
  const hay = tag(new THREE.MeshLambertMaterial({ color: new THREE.Color(.95, .72, .26) }), CLS.hay);
  const farm = new THREE.Group();
  const box = (w, h, d, mat, x, y, z, parent = farm) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const at = (g, x, y, z, parent = farm) => { g.position.set(x, y, z); parent.add(g); return g; };

  // homestead: weatherboard walls, wrap-around veranda, red iron hip roof, brick chimney
  const house = at(new THREE.Group(), -1.7, 0, -4.7); house.scale.setScalar(1.14);
  box(8.1, .14, 6, timber, 0, .07, 0, house);
  box(6, 1.5, 3.9, wall, 0, .89, 0, house);
  at(new THREE.Mesh(frustumRect(6.2, 4.1, 8.5, 6.4, .42), roofRed2), 0, 1.6, 0, house);
  at(new THREE.Mesh(frustumRect(2.3, .1, 6.5, 4.4, 1.5), roofRed), 0, 1.98, 0, house);
  for (const x of [-3.9, -1.95, 0, 1.95, 3.9]) for (const z of [-2.85, 2.85]) box(.1, 1.5, .1, white, x, .85, z, house);
  for (const z of [-.95, .95]) for (const x of [-3.9, 3.9]) box(.1, 1.5, .1, white, x, .85, z, house);
  box(.5, 1, .06, dark, .3, .7, 1.97, house); for (const x of [-2.2, -1.2, 1.4, 2.4]) box(.6, .55, .06, dark, x, .95, 1.97, house);
  for (const x of [-2.2, 2.2]) box(.06, .55, .6, dark, x * 1.37, .95, .2, house);
  // ridge cap, hip caps and white gutters give the roof crisp edges from above
  const trim = tag(new THREE.MeshLambertMaterial({ color: '#f2efe6' }), CLS.metal);
  box(2.4, .1, .16, trim, 0, 3.5, 0, house);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) house.add(new THREE.Mesh(beam([sx * 1.15, 3.5, 0], [sx * 3.25, 2.0, sz * 2.2], .12), trim));
  for (const sz of [-1, 1]) box(6.6, .1, .12, trim, 0, 2.0, sz * 2.2, house);
  for (const sx of [-1, 1]) box(.12, .1, 4.5, trim, sx * 3.25, 2.0, 0, house);
  for (const sz of [-1, 1]) box(8.6, .07, .1, trim, 0, 1.6, sz * 3.2, house);
  const chimney = box(.5, 1.5, .5, tag(new THREE.MeshLambertMaterial({ color: '#a05a40' }), CLS.wood), 1.7, 2.85, -.5, house);
  box(.62, .1, .62, tag(new THREE.MeshLambertMaterial({ color: '#5a3426' }), CLS.wood), 1.7, 3.62, -.5, house);
  // rainwater tank behind the house
  at(new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, 1.5, 16), tag(new THREE.MeshLambertMaterial({ map: iron(4, 1), color: '#a9bfae' }), CLS.metal)), 4.4, .75, -8.6);

  // machinery shed
  const shed = at(new THREE.Group(), 5.6, 0, -3.6);
  box(4.4, 2.3, 6.4, shedWall, 0, 1.15, 0, shed);
  box(.06, 1.75, 3.2, dark, -2.22, .88, .4, shed);
  at(gable(4.4, 6.4, .4, .3, roofRed, shedWall), 0, 2.3 - .3 * Math.tan(.4), 0, shed);

  // hay shed: open sides, galvanised roof, a stack of bales under it
  const hs = at(new THREE.Group(), 5.6, 0, 4.4);
  for (const x of [-1.95, 1.95]) for (const z of [-1.6, 0, 1.6]) box(.16, 2.3, .16, timber, x, 1.15, z, hs);
  at(gable(4.1, 3.5, .26, .3, galv), 0, 2.3 - .3 * Math.tan(.26), 0, hs);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < (i === 2 ? 1 : 2); k++) box(.95, .7, 1.25, hay, -1.05 + i * 1.02, .36 + k * .72, -.7 + j * 1.35, hs).rotation.y = (rnd() - .5) * .08;

  // silos
  const bandMat = tag(new THREE.MeshLambertMaterial({ color: '#6f787b' }), CLS.metal);
  for (const [x, z, r, h] of [[.8, 5.5, .95, 3.1], [2.5, 6.9, .95, 3.4], [-.7, 7.3, .7, 2.5]]) {
    at(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), galv), x, h / 2 + .15, z);
    at(new THREE.Mesh(new THREE.ConeGeometry(r * 1.06, r * .7, 18), galv), x, h + .15 + r * .35, z);
    for (let y = .7; y < h; y += .62) at(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.035, r * 1.035, .09, 18), bandMat), x, y, z);
    for (const s of [-1, 1]) box(.05, h, .05, bandMat, x - r - .1, h / 2 + .15, z + s * .14);
    for (let y = .5; y < h; y += .3) box(.04, .04, .3, bandMat, x - r - .1, y, z);
    at(new THREE.Mesh(new THREE.CylinderGeometry(r * .22, r * .22, .14, 10), bandMat), x, h + .15 + r * .7, z);
  }

  // windmill with a turning fan, and a tank on a stand beside it
  const wm = at(new THREE.Group(), -6.3, 0, 4.4), TH = 5.6, legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(beam([sx * .62, 0, sz * .62], [sx * .09, TH, sz * .09], .07));
  for (const f of [.22, .48, .74]) { const w = .62 - (.62 - .09) * f, y = TH * f; legs.push(beam([-w, y, -w], [w, y, -w], .04), beam([-w, y, w], [w, y, w], .04), beam([-w, y, -w], [-w, y, w], .04), beam([w, y, -w], [w, y, w], .04)); }
  const steel = tag(new THREE.MeshLambertMaterial({ color: '#c3c9cb' }), CLS.metal);
  wm.add(new THREE.Mesh(mergeFlat(legs.map(g => { g.deleteAttribute('uv'); return g.toNonIndexed(); })), steel));
  const head = at(new THREE.Group(), 0, TH + .12, 0, wm); head.rotation.y = -.3;
  const blades = [];
  for (let i = 0; i < 14; i++) { const b = new THREE.BoxGeometry(.3, .95, .02); b.translate(0, .86, 0); b.rotateZ(i * Math.PI * 2 / 14); blades.push(b.toNonIndexed()); }
  const ring = new THREE.TorusGeometry(1.34, .04, 4, 28); blades.push(ring.toNonIndexed());
  const fan = at(new THREE.Mesh(mergeFlat(blades.map(g => { g.deleteAttribute('uv'); return g; })), tag(new THREE.MeshLambertMaterial({ color: '#f1f4f4', side: D }), CLS.metal)), 0, 0, .5, head);
  box(.06, .06, 1.9, steel, 0, 0, -.6, head); box(.03, .7, .95, tag(new THREE.MeshLambertMaterial({ color: '#f1f4f4', side: D }), CLS.metal), 0, 0, -1.7, head);
  const stand = at(new THREE.Group(), -6.9, 0, 6.8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.12, 1.5, .12, timber, sx * .55, .75, sz * .55, stand);
  at(new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, 1, 16), galv), 0, 2, 0, stand);
  box(1.7, .32, .55, dark, -4.6, .16, 4.9);

  // ute parked in the yard
  const ute = at(new THREE.Group(), .3, 0, .9); ute.rotation.y = .5;
  box(2, .42, .92, white, 0, .5, 0, ute); box(.78, .42, .86, white, .2, .92, 0, ute); box(.8, .3, .88, dark, .2, .93, 0, ute).scale.set(.9, 1, 1.01);
  for (const x of [-.65, .68]) for (const z of [-.46, .46]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .16, 10), dark); w.rotation.x = Math.PI / 2; w.position.set(x, .24, z); ute.add(w); }

  farm.position.set(YX, H(YX, YZ) - .03, YZ); farm.rotation.y = GRID_ROT;
  farm.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); scene.add(farm);
  farm.updateMatrixWorld(true);
  return { fan, chimney: chimney.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .7, 0)) };
}

// round bales left in the stubble
function buildBales(scene) {
  const spots = [];
  for (const c of CELLS) if (c.crop === 'S') for (let a = c.a0 + 2; a < c.a1 - 1.5; a += 2.9) for (let v = c.v0 + 1.8; v < c.v1 - 1.2; v += 2.5) {
    if (rnd() < .16) continue;
    const [x, z] = toWorld((c.side === 'L' ? -1 : 1) * (a + (rnd() - .5) * .8), v + (rnd() - .5) * 1.3);
    if (inView(x, z)) spots.push([x, z]);
  }
  const g = new THREE.CylinderGeometry(.5, .5, .68, 14); g.rotateZ(Math.PI / 2);
  const im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ color: new THREE.Color(1, .78, .3) }), CLS.hay), spots.length), o = new THREE.Object3D();
  spots.forEach(([x, z], i) => { o.position.set(x, H(x, z) + .46, z); o.rotation.y = GRID_ROT + Math.PI / 2 + (rnd() - .5) * .5; o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}

// ---------- animals, people and machines ----------
function sheepGeo() {
  const body = new THREE.IcosahedronGeometry(.3, 1); body.scale(1.3, .9, .95); body.translate(0, .42, 0);
  const head = new THREE.BoxGeometry(.2, .17, .17); head.translate(.43, .5, 0);
  const parts = [colored(body, 1.5, 1.42, 1.22), colored(head, .16, .13, .12)];
  for (const x of [-.22, .22]) for (const z of [-.11, .11]) { const l = new THREE.BoxGeometry(.06, .26, .06); l.translate(x, .13, z); parts.push(colored(l, .16, .13, .12)); }
  return mergeFlat(parts);
}
function farmerGeo() {
  const P = [];
  for (const z of [-.08, .08]) { const l = new THREE.BoxGeometry(.11, .42, .11); l.translate(0, .21, z); P.push(colored(l, .12, .16, .3)); }
  const torso = new THREE.BoxGeometry(.2, .4, .34); torso.translate(0, .62, 0); P.push(colored(torso, .25, .5, .95));
  const hd = new THREE.BoxGeometry(.17, .17, .17); hd.translate(0, .91, 0); P.push(colored(hd, .9, .65, .5));
  const brim = new THREE.CylinderGeometry(.3, .3, .04, 10); brim.translate(0, 1.01, 0); P.push(colored(brim, 1.3, 1.1, .75));
  const crown = new THREE.CylinderGeometry(.13, .15, .13, 8); crown.translate(0, 1.08, 0); P.push(colored(crown, 1.3, 1.1, .75));
  return mergeFlat(P);
}
function dogGeo() {
  const P = [];
  const b = new THREE.BoxGeometry(.5, .19, .18); b.translate(0, .3, 0); P.push(colored(b, .85, .36, .12));
  const h = new THREE.BoxGeometry(.2, .17, .16); h.translate(.33, .4, 0); P.push(colored(h, .85, .36, .12));
  const t = new THREE.BoxGeometry(.24, .05, .05); t.rotateZ(.6); t.translate(-.33, .4, 0); P.push(colored(t, .7, .28, .1));
  for (const x of [-.18, .18]) for (const z of [-.07, .07]) { const l = new THREE.BoxGeometry(.06, .22, .06); l.translate(x, .11, z); P.push(colored(l, .6, .25, .1)); }
  return mergeFlat(P);
}
function buildTractor(scene) {
  const g = new THREE.Group();
  const red = tag(new THREE.MeshLambertMaterial({ color: '#ff3a18', emissive: '#5a0d02', emissiveIntensity: .5 }), CLS.roof);
  const dark = tag(new THREE.MeshLambertMaterial({ color: '#221f1c' }), CLS.fence), white = tag(new THREE.MeshLambertMaterial({ color: '#f1efe6' }), CLS.metal);
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); };
  const wheel = (r, w, x, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), dark); m.rotation.x = Math.PI / 2; m.position.set(x, r, z); g.add(m); };
  box(1.25, .5, .62, red, .35, .78, 0); box(.75, .22, .7, red, -.5, 1.05, 0); box(.78, .62, .74, dark, -.5, 1.42, 0); box(.95, .07, .9, white, -.5, 1.77, 0);
  wheel(.56, .34, -.5, -.56); wheel(.56, .34, -.5, .56); wheel(.3, .22, .75, -.46); wheel(.3, .22, .75, .46);
  box(.12, .12, 2.7, dark, -1.75, .32, 0); box(.9, .08, .1, dark, -1.3, .5, 0);
  for (let i = 0; i < 7; i++) box(.3, .26, .06, dark, -1.85, .17, -1.2 + i * .4);
  g.scale.setScalar(1.55); g.traverse(o => { o.castShadow = true; }); scene.add(g);
  return g;
}
// The tractor works the fallow paddock on a racetrack loop, so it never jumps.
const TR = { r: 1.7, len: 8, a0: 6.8, a1: 10.2, v0: 9.8 };
TR.total = 2 * TR.len + 2 * Math.PI * TR.r;
function tractorAt(s, out) {
  s = ((s % TR.total) + TR.total) % TR.total;
  const arc = Math.PI * TR.r, cu = -(TR.a0 + TR.a1) / 2; let uu, v, du, dv;
  if (s < TR.len) { uu = -TR.a0; v = TR.v0 + s; du = 0; dv = 1; }
  else if (s < TR.len + arc) { const p = (s - TR.len) / TR.r; uu = cu + TR.r * Math.cos(p); v = TR.v0 + TR.len + TR.r * Math.sin(p); du = -Math.sin(p); dv = Math.cos(p); }
  else if (s < 2 * TR.len + arc) { uu = -TR.a1; v = TR.v0 + TR.len - (s - TR.len - arc); du = 0; dv = -1; }
  else { const p = Math.PI + (s - 2 * TR.len - arc) / TR.r; uu = cu + TR.r * Math.cos(p); v = TR.v0 + TR.r * Math.sin(p); du = -Math.sin(p); dv = Math.cos(p); }
  const [x, z] = toWorld(uu, v);
  out.x = x; out.z = z; out.hx = du * UX - dv * UZ; out.hz = du * UZ + dv * UX;
  return out;
}

// ---------- ascii + tilt shift ----------
const GLYPHS = " .'`,:;-~=+*oOsS$%&8#@/\\|_^v\u2014\"Y";
const GI = Object.fromEntries([...GLYPHS].map((c, i) => [c, i]));
const gg = (c) => GI[c].toFixed(1);
function buildAtlas() {
  const tw = 64, th = 120, c = document.createElement('canvas');
  c.width = tw * GLYPHS.length; c.height = th;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 100px Menlo, Monaco, Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", monospace';
  [...GLYPHS].forEach((ch, i) => { if (ch === '\u2014') x.fillRect(i * tw, th * .44, tw, th * .12); else x.fillText(ch, (i + .5) * tw, th * .52); });
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.flipY = false;
  return t;
}
const asciiFrag = /* glsl */`
precision highp float;
uniform sampler2D uScene, uAtlas; uniform vec2 uGrid; uniform float uTime, uN;
in vec2 vUv; out vec4 outColor;
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float lum(vec3 c){ return dot(c,vec3(.25,.6,.15)); }
vec3 grade(vec3 c){
  if(any(isnan(c)) || any(isinf(c))) c = vec3(0.);
  c = max(c,0.); c = c/(1.+c*.12); c = pow(c,vec3(1./2.2));
  c = mix(c,c*c*(3.-2.*c),.5);
  float l = lum(c); c = mix(vec3(l),c,1.24);
  return clamp(c,0.,1.);
}
void main(){
  vec2 g = vUv*uGrid, cell = floor(g), cuv = (cell+.5)/uGrid;
  ivec2 sz = textureSize(uScene,0);
  float lodC = log2(float(sz.x)/uGrid.x)+.05;
  vec3 col = grade(textureLod(uScene,cuv,lodC).rgb);
  float cls = floor(texelFetch(uScene,ivec2(cuv*vec2(sz)),0).a*16.+.5);
  float L = lum(col);
  vec2 e = 1./uGrid;
  float lx0=lum(grade(textureLod(uScene,cuv-vec2(e.x,0),lodC).rgb)), lx1=lum(grade(textureLod(uScene,cuv+vec2(e.x,0),lodC).rgb));
  float ly0=lum(grade(textureLod(uScene,cuv-vec2(0,e.y),lodC).rgb)), ly1=lum(grade(textureLod(uScene,cuv+vec2(0,e.y),lodC).rgb));
  vec2 grad = vec2(lx1-lx0,(ly1-ly0)*.55); float mag = length(grad);
  float a4 = mod(atan(grad.y,grad.x)+.3927,3.14159)/.7854;
  float edgeG = a4<1.?${gg('|')}:a4<2.?${gg('\\')}:a4<3.?${gg('\u2014')}:${gg('/')};
  float w = vn(cell*vec2(.05,.09)+vec2(-uTime*.28,uTime*.07))*2.-1.;
  float gl = ${gg('.')};
  if(cls<1.5){        // pasture, verges, reeds
    gl = L<.1?${gg('.')}:L<.17?${gg(':')}:(w<-.2?${gg('\\')}:w>.2?${gg('/')}:${gg('|')});
  } else if(cls<2.5){ // leaves, legume rows
    gl = L<.12?${gg('.')}:L<.24?${gg(':')}:L<.38?${gg('*')}:L<.5?${gg('+')}:${gg('o')};
  } else if(cls<3.5){ // canola in flower
    gl = L<.3?${gg(':')}:L<.5?${gg('*')}:L<.74?${gg('%')}:${gg('#')};
  } else if(cls<4.5){ // iron: silos, tanks, windmill, shed walls, ute
    gl = L<.16?${gg(':')}:L<.3?${gg('=')}:L<.46?${gg('+')}:L<.62?${gg('%')}:L<.8?${gg('#')}:${gg('@')};
    if(mag>.22) gl = edgeG;
  } else if(cls<5.5){ // track and yard dirt
    gl = L<.2?${gg('.')}:L<.36?${gg(':')}:L<.56?${gg(';')}:${gg('=')};
  } else if(cls<6.5){ // red roofs, tractor
    gl = L<.08?${gg(':')}:L<.18?${gg('=')}:L<.32?${gg('#')}:L<.5?${gg('%')}:${gg('@')};
    if(mag>.24 && L>.06) gl = edgeG;
  } else if(cls<7.5){ // timber, trunks, weatherboard
    gl = L<.14?${gg(':')}:(mag>.18?edgeG:(L<.34?${gg('|')}:${gg('#')}));
  } else if(cls<8.5){ // ploughed soil
    gl = L<.1?${gg('.')}:L<.2?${gg('-')}:L<.34?${gg('=')}:${gg('\u2014')};
  } else if(cls<9.5){ // water
    gl = L<.22?${gg('-')}:L<.45?(w>0.?${gg('~')}:${gg('-')}):L<.72?${gg('~')}:L<.86?${gg('=')}:${gg('*')};
  } else if(cls<10.5){ // wheat
    gl = L<.16?${gg(':')}:(w<-.22?${gg('\\')}:w>.22?${gg('/')}:(L>.6?${gg('Y')}:${gg('|')}));
  } else if(cls<11.5){ // sheep, dog, farmer, birds
    gl = L<.3?${gg('&')}:L<.68?${gg('$')}:${gg('@')};
  } else if(cls<12.5){ // hay bales
    gl = L<.3?${gg('o')}:L<.62?${gg('O')}:${gg('@')};
  } else if(cls<13.5){ // stubble
    gl = L<.3?${gg('.')}:L<.5?${gg(',')}:L<.7?${gg("'")}:${gg('"')};
  } else if(cls<14.5){ // fence posts and wire, tyres
    gl = L<.25?${gg(':')}:${gg('+')};
    if(mag>.22) gl = edgeG;
  } else {             // smoke, dust, chaff
    gl = L<.22?${gg('.')}:L<.4?${gg(':')}:L<.6?${gg('o')}:${gg('O')};
  }
  vec2 gv = g-cell, dx = dFdx(g), dy = dFdy(g);
  float ink = smoothstep(.05,.95,textureGrad(uAtlas,vec2((gl+gv.x)/uN,1.-gv.y),dx/uN,dy).r);
  vec3 blur = grade(textureLod(uScene,vUv,lodC+1.2).rgb);
  outColor = vec4(mix(blur*.38,col*1.24+.012,ink),1.);
}`;
const tiltFrag = /* glsl */`
precision highp float;
uniform sampler2D uA; uniform vec2 uRes; uniform float uBlur;
in vec2 vUv; out vec4 outColor;
void main(){
  float dy = abs(vUv.y-.45);
  float r = pow(smoothstep(.27,.6,dy),1.6)*uBlur;
  vec3 c = vec3(0.); float tw = 0.;
  if(r<.2){ outColor = vec4(texture(uA,vUv).rgb,1.); return; }
  float lod = max(log2(r/4.),0.);
  for(int i=0;i<22;i++){
    float t = float(i)+.5, a = t*2.39996, rr = sqrt(t/22.)*r;
    vec2 o = vec2(cos(a),sin(a))*rr/uRes;
    c += textureLod(uA,vUv+o,lod).rgb; tw += 1.;
  }
  outColor = vec4(c/tw,1.);
}`;

async function main() {
  // Let the browser paint the opening still before the heavy setup starts.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  fillFields();
  const canvas = document.getElementById('diorama') || document.body.appendChild(document.createElement('canvas'));
  // Placement and size come from the page's CSS; the scene follows the canvas box.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight('#ffe7c4', 3.3); sun.position.set(-28, 48, 26); sun.target.position.set(6, 1, -2);
  sun.castShadow = true; sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -76, right: 76, top: 56, bottom: -56, near: 5, far: 180 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; sun.shadow.autoUpdate = false;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#efe6d8', '#6d6236', 1.0));

  const terrain = buildTerrain(); // downloads while the rest is built
  scene.add(buildDam());
  buildCrops(scene); buildTrees(scene, tex('eucalyptus_bark', 1, 2)); buildFences(scene); buildBales(scene);
  const { fan, chimney } = buildFarmstead(scene);
  const tractor = buildTractor(scene);

  // sheep: small mobs that graze, then amble a few steps
  const flock = [];
  const mob = (uu, v, n, spread) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * spread, [x, z] = toWorld(uu + Math.cos(a) * r, v + Math.sin(a) * r * .8); flock.push({ x, z, r: .5 + rnd() * 1.1, rate: .07 + rnd() * .06, off: rnd() * 40, th: rnd() * 6.28, dir: rnd() < .5 ? -1 : 1, s: .9 + rnd() * .3 }); } };
  mob(8, -15.5, 13, 3.2); mob(12.5, -21, 11, 2.8); mob(15, -13.5, 9, 2.2); mob(5.6, -22, 7, 2); mob(-27, 10, 10, 3.2); mob(27.5, -11, 0, 1);
  for (let i = 0; i < 13; i++) { const a = -.4 + rnd() * 3.9, q = 1.55 + rnd() * .5; flock.push({ x: DX + Math.cos(a) * 5.2 * q, z: DZ - Math.abs(Math.sin(a)) * 3.3 * q, r: .4 + rnd() * .5, rate: .06 + rnd() * .05, off: rnd() * 40, th: rnd() * 6.28, dir: rnd() < .5 ? -1 : 1, s: .9 + rnd() * .3 }); }
  const animalMat = () => tag(new THREE.MeshLambertMaterial({ vertexColors: true }), CLS.animal);
  const sheep = new THREE.InstancedMesh(sheepGeo(), animalMat(), flock.length); sheep.castShadow = true; scene.add(sheep);
  const farmer = new THREE.Mesh(farmerGeo(), animalMat()); farmer.scale.setScalar(1.3); farmer.castShadow = true; scene.add(farmer);
  const dog = new THREE.Mesh(dogGeo(), animalMat()); dog.scale.setScalar(1.25); dog.castShadow = true; scene.add(dog);

  // chaff on the wind, chimney smoke, dust behind the plough, cockatoos overhead
  const moteMat = (r, g, b) => tag(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide }), CLS.mote);
  const chaff = new THREE.InstancedMesh(new THREE.PlaneGeometry(.09, .09), moteMat(1.5, 1.25, .7), 170); scene.add(chaff);
  const chaffS = Array.from({ length: 170 }, () => [rnd(), rnd(), rnd(), rnd()]);
  const puffGeo = new THREE.PlaneGeometry(.5, .5); puffGeo.rotateX(-.9);
  const smoke = new THREE.InstancedMesh(puffGeo, moteMat(.95, .95, .97), 30); scene.add(smoke);
  const dust = new THREE.InstancedMesh(puffGeo, moteMat(.8, .62, .44), 16); scene.add(dust);
  const wing = new THREE.PlaneGeometry(.75, .24); wing.rotateX(-Math.PI / 2);
  const birds = new THREE.InstancedMesh(wing, tag(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.7, 1.6), side: THREE.DoubleSide }), CLS.animal), 9); birds.castShadow = true; scene.add(birds);
  const birdS = Array.from({ length: 9 }, (_, i) => [-(i % 5) * 1.5 - rnd(), (i - 4) * 1.1 + rnd(), rnd() * 6.28]);

  const camera = new THREE.PerspectiveCamera(23, 1, 5, 400);
  const TARGET = new THREE.Vector3(6.5, 1.5, 3);
  let camDist = 1; // >1 pulls the camera back on narrow screens
  function placeCamera(t) {
    // Eased sweep across one period, back again on the next, so a live loop never jumps.
    const k = .5 - .5 * Math.cos(Math.PI * t / DURATION), az = THREE.MathUtils.degToRad(-7 + 14 * k), el = THREE.MathUtils.degToRad(52 + 1.4 * Math.sin(k * 3.14)), R = (95 - 3 * k) * camDist;
    camera.position.set(TARGET.x + Math.sin(az) * Math.cos(el) * R, TARGET.y + Math.sin(el) * R, TARGET.z + Math.cos(az) * Math.cos(el) * R);
    camera.lookAt(TARGET); camera.updateMatrixWorld();
  }

  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const art = new THREE.WebGLRenderTarget(4, 4, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const vtx = `in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`;
  const ascii = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader: asciiFrag, depthTest: false, depthWrite: false,
    uniforms: { uScene: { value: rt.texture }, uAtlas: { value: buildAtlas() }, uGrid: { value: new THREE.Vector2(200, ROWS) }, uTime: time, uN: { value: GLYPHS.length } } });
  const tilt = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader: tiltFrag, depthTest: false, depthWrite: false,
    uniforms: { uA: { value: art.texture }, uRes: { value: new THREE.Vector2(4, 4) }, uBlur: { value: 26 } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ascii); quad.frustumCulled = false;
  const post = new THREE.Scene(); post.add(quad); const postCam = new THREE.Camera();

  // The picture fills the window: render size, glyph grid and camera all follow its shape.
  let qScale = 1;
  function resize(w0 = canvas.clientWidth || innerWidth, h0 = canvas.clientHeight || innerHeight) { // the canvas fills its own area of the page
    const cw = Math.max(1, w0), ch = Math.max(1, h0), aspect = cw / ch;
    let h = clamp(ch * Math.min(devicePixelRatio || 1, 2), 720, COARSE ? 1100 : 1440), w = h * aspect;
    const maxW = 2560; if (w > maxW) { h *= maxW / w; w = maxW; }
    const W = Math.round(w), HH = Math.round(h);
    // Tall screens get more glyph rows, so the zoomed-out farm keeps its detail.
    const rows = Math.round(ROWS * clamp(Math.sqrt(.9 / aspect), 1, 1.45)), cols = Math.round(rows * 2 * aspect);
    ascii.uniforms.uGrid.value.set(cols, rows);
    // The 3D scene is only ever read one glyph cell at a time, so it renders at a few pixels per cell,
    // not at screen resolution. Only the glyphs themselves are drawn at full sharpness.
    const S = (COARSE ? 2.6 : 3.2) * Math.sqrt(qScale);
    // Resizing a canvas blanks it, so only do it when the size really changes.
    if (canvas.width !== W || canvas.height !== HH) renderer.setSize(W, HH, false); rt.setSize(Math.round(cols * S), Math.round(rows * 2 * S)); art.setSize(W, HH);
    tilt.uniforms.uRes.value.set(W, HH); tilt.uniforms.uBlur.value = 26 * HH / 1440;
    // Keep most of the laptop view's width on a phone: widen the lens a little, then pull the camera back.
    const hT = .2645 * (.64 + .36 * sstep(.6, 1.2, aspect)), vT = hT / Math.min(aspect, 1.3), fT = Math.min(vT, .3057);
    camera.aspect = aspect; camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(fT)); camera.updateProjectionMatrix();
    camDist = vT / fT;
    TARGET.x = 6.5 - 4.5 * sstep(1.1, .6, aspect); // on a tall phone, lean left so the tractor's paddock stays in frame
  }
  resize();
  let rsz = 0; new ResizeObserver(() => { clearTimeout(rsz); rsz = setTimeout(() => resize(), 120); }).observe(canvas);

  const dummy = new THREE.Object3D(), tp = {}, WALK = .62; let shadowTick = 0;
  const face = (o, hx, hz) => { o.rotation.y = Math.atan2(-hz, hx); };
  function drawFrame(t) {
    time.value = t; placeCamera(t);
    fan.rotation.z = -t * 2.4;

    // farmer and kelpie walk the track to one end of the farm, turn round and walk back, so they never jump
    const wq = fract(.18 + t * WALK / pathLen / 2) * 2, dir = wq < 1 ? 1 : -1, u = clamp(wq < 1 ? wq : 2 - wq, .002, .998);
    const p = pathCurve.getPointAt(u), tg = pathCurve.getTangentAt(u).multiplyScalar(dir), step = t * 5.2;
    farmer.position.set(p.x - tg.z * .35, samp(fY, p.x, p.z) + Math.abs(Math.sin(step)) * .05, p.z + tg.x * .35); face(farmer, tg.x, tg.z);
    const ud = clamp(u + dir * (1.7 + Math.sin(t * .4) * .7) / pathLen, 0, 1), pq = pathCurve.getPointAt(ud), tq = pathCurve.getTangentAt(ud).multiplyScalar(dir), side = Math.sin(t * .55) * .75;
    dog.position.set(pq.x + tq.z * side, samp(fY, pq.x, pq.z) + Math.abs(Math.sin(step * 1.7)) * .06, pq.z - tq.x * side); face(dog, tq.x + tq.z * Math.cos(t * .55) * .3, tq.z - tq.x * Math.cos(t * .55) * .3);

    // sheep
    flock.forEach((s, i) => {
      const q = t * s.rate + s.off, f = fract(q), mv = clamp(f / .3), th = s.th + s.dir * (Math.floor(q) + mv * mv * (3 - 2 * mv)) * .55;
      const x = s.x + Math.cos(th) * s.r, z = s.z + Math.sin(th) * s.r;
      dummy.position.set(x, H(x, z) - .02 + (mv < 1 ? Math.abs(Math.sin(mv * 12.566)) * .05 : 0), z);
      dummy.rotation.set(0, Math.atan2(-Math.cos(th) * s.dir, -Math.sin(th) * s.dir), 0); dummy.scale.setScalar(s.s); dummy.updateMatrix(); sheep.setMatrixAt(i, dummy.matrix);
    });
    sheep.instanceMatrix.needsUpdate = true;

    // tractor and its dust
    const ts = t * 1.05; tractorAt(ts, tp);
    tractor.position.set(tp.x, H(tp.x, tp.z), tp.z); face(tractor, tp.hx, tp.hz);
    for (let i = 0; i < 16; i++) {
      const age = (i + 1 - fract(ts / .2)) * .2; tractorAt(ts - 2.1 - age, tp);
      dummy.position.set(tp.x + Math.sin(i * 7.3) * .5, H(tp.x, tp.z) + .25 + age * .28, tp.z + Math.cos(i * 4.1) * .5);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.35 + age * .3); dummy.updateMatrix(); dust.setMatrixAt(i, dummy.matrix);
    }
    dust.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < 30; i++) {
      const k = fract(i / 30 + t * .1), sw = Math.sin(i * 2.3) * .35 * k;
      dummy.position.set(chimney.x + k * k * 2.8 + Math.sin(t * .8 + i * 1.7) * .14 * k + sw, chimney.y + k * 3.6, chimney.z + k * .6 + Math.cos(i * 1.3) * .3 * k);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar((.24 + k * .62) * (1 - .55 * k * k)); dummy.updateMatrix(); smoke.setMatrixAt(i, dummy.matrix);
    }
    smoke.instanceMatrix.needsUpdate = true;

    chaffS.forEach((s, i) => {
      const k = fract(s[0] + t * (.014 + s[3] * .01));
      const x = -54 + k * 122 + Math.sin(t * .6 + s[1] * 9) * .5, z = -30 + s[2] * 56;
      dummy.position.set(x, H(x, z) + 1 + s[1] * 4 + Math.sin(t * .9 + s[3] * 12) * .35, z);
      dummy.rotation.set(t + s[0] * 9, t * .7, s[1]); dummy.scale.setScalar(.8 + s[3] * .8); dummy.updateMatrix(); chaff.setMatrixAt(i, dummy.matrix);
    });
    chaff.instanceMatrix.needsUpdate = true;

    const bk = fract(t / 44 + .2), bx = -80 + bk * 170, bz = -16 + bk * 20;
    birdS.forEach((s, i) => {
      dummy.position.set(bx + s[0], 9.5 + Math.sin(t * 1.3 + s[2]) * .4, bz + s[1]);
      dummy.rotation.set(0, -.12, 0); dummy.scale.set(1, 1, .35 + Math.abs(Math.sin(t * 7 + s[2]))); dummy.updateMatrix(); birds.setMatrixAt(i, dummy.matrix);
    });
    birds.instanceMatrix.needsUpdate = true;

    if (shadowTick++ % 3 === 0) sun.shadow.needsUpdate = true;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x1a2412, 0); renderer.clear(); renderer.render(scene, camera);
    quad.material = ascii; renderer.setRenderTarget(art); renderer.render(post, postCam);
    quad.material = tilt; renderer.setRenderTarget(null); renderer.render(post, postCam);
  }

  // Wait for the ground and textures, and compile every shader off the main path, so the first frame is complete.
  scene.add(await terrain);
  await Promise.all(PENDING);
  placeCamera(0);
  try { await renderer.compileAsync(scene, camera); } catch { /* older browsers compile on first draw */ }

  // Live loop. Slow machines drop the render size a step at a time; reduced-motion visitors get a still.
  let paused = false, clock = 0, last = performance.now(), frames = 0, holdQ = false, decided = false, tSum = 0, tN = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches, root = document.documentElement;
  addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { paused = !paused; e.preventDefault(); } });
  const loop = (now) => {
    // Hold the scene while the curtain opens, so the page's whole budget goes to that animation.
    if (now - last < 14 || root.classList.contains('leaving')) { if (now - last >= 14) last = now; requestAnimationFrame(loop); return; }
    const dt = (now - last) / 1000; last = now;
    if (!paused) clock += Math.min(.1, dt);
    drawFrame(clock);
    if (frames === 1) { canvas.classList.add('ready'); window.__readyAt = performance.now(); if (still) paused = true; }
    // Slow device? Measure once after warm-up, then pick a lighter scene resolution once.
    // The canvas itself never changes size for this, so nothing blinks.
    if (++frames > 30 && !decided && !paused && !holdQ && dt < .25) {
      tSum += dt; tN++;
      if (tN === 90) { decided = true; const avg = tSum / tN; if (avg > .022) { qScale = avg > .04 ? .45 : .7; resize(); } }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  if (location.search.includes('debug')) window.__diorama = { renderer, scene, sun, camera, resize, rt, art, ascii, tilt, set q(v) { qScale = v; resize(); }, get q() { return qScale; }, set hold(v) { holdQ = v; },
    // Renders the opening frame at a given size and returns it as an image, for the poster the page shows while loading.
    poster(w, h) { paused = true; holdQ = true; qScale = 1; resize(w, h); drawFrame(0); return renderer.domElement.toDataURL('image/webp', .8); } };
}
main().catch(e => { console.error(e); document.documentElement.classList.add('diorama-failed'); });
