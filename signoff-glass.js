/* =========================================================
   FlitzWeb — sign-off glass reveal
   When the footer comes into view, the bolt forms in a glass tile right where the Z of the wordmark
   sits, the glass lets go and the bolt settles into the wordmark, then "flit" and "web" follow.
   Afterwards the canvas is removed and the plain logo is left, exactly as without this script.

   Loaded by site.js only when the footer comes near, and never for visitors who asked for less
   motion. Without WebGL2, or when the footer is already on screen, it does nothing.

   Shader and spring timeline ported from zanwei/glass-icon-reveal (MIT),
   https://github.com/zanwei/glass-icon-reveal, via the 21st.dev "liquid glass logo reveal".
   ========================================================= */
(() => {
  "use strict";

  const signoff = document.querySelector(".signoff");
  const svg = signoff && signoff.querySelector(".signoff__inner .logo svg");
  const symbol = document.getElementById("fw-logo");
  const boltPath = symbol && symbol.querySelector('path[fill="var(--bolt)"]');
  if (!svg || !boltPath) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Already (partly) on screen: hiding the logo now would flash. Leave it as it is.
  if (signoff.getBoundingClientRect().top < window.innerHeight) return;

  /* ---------- Settings (the dark look of the original, tuned for the sign-off) ---------- */
  const css = getComputedStyle(svg);
  const pageBg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#060913";
  const boltColor = css.getPropertyValue("--bolt").trim() || "#7c9bff";

  const P = {
    logoScale: 0.64, finalScale: 0.42, logoOffset: [0, 0], iconPlate: true, keepPlate: false, originalColors: false,
    opticalDepth: 0.75, dispersion: 0.9, colorBleed: 0.45, doubleBevel: 1, bevelWidth: 0.22, corner: 5,
    cornerPull: 1.4, cornerWidth: 1.2, cornerFocus: 0.4, edgeSmear: 1.2, stretch: 0, tilt: 0, bulge: 1,
    specular: 1, halo: 1, shadow: 0, ripple: 0.5,
    bounce: 0, response: 0.42, startSize: 0.2, startZoom: 1.6, glide: 2.3, present: 2.4, drift: 0.05, swell: 0.5, focus: 1,
    sheen: 1, lightTurn: 0.9,
    background: pageBg, plateColor: "#0b1224", logoColor: boltColor,
  };
  const TAIL = 1.1;
  const END = P.present + TAIL; // the bolt has settled
  const LETTERS_AT = P.present + 0.55; // "flit" and "web" start to follow

  /* ---------- Spring timeline ---------- */
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const smoother = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };

  function hexToRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.replace(/./g, "$&$&");
    const v = parseInt(h.slice(0, 6), 16) || 0;
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Step response of a critically damped (or underdamped) spring released at t = 0.
  function spring(t, response, damping) {
    if (t <= 0) return 0;
    const w = (2 * Math.PI) / response;
    if (damping >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
    const wd = w * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
  }
  function timeToReach(level, response, damping) {
    let lo = 0, hi = 3;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (spring(mid, response, damping) < level) lo = mid; else hi = mid;
    }
    return hi;
  }
  const DAMPING = 1 - P.bounce;
  const T_LAND = timeToReach(0.85, P.response, DAMPING) - 0.01;
  const T_MORPH = timeToReach(0.92, P.response, DAMPING) - 0.01;

  function frameAt(T) {
    const tx = P.present;
    const grow = spring(T + 0.01, P.response, DAMPING);
    const morph = spring(T - T_MORPH, 0.4, 1);
    const drop = 1 - smooth(0.05, 1, morph);
    const appear = smooth(0, 0.08, T);
    const drift = P.drift * spring(T - 0.3, 2.2, 1);
    const zoomIn = 0.25 * spring(T, 0.7, 1) + 0.75 * smoother(0, P.glide, T);
    const settle = spring(T - 0.5, 2.4, 1);
    const exit = spring(T - tx, 0.95, 1);
    const release = spring(T - tx - 0.05, 0.65, 1);
    const dome = 0.15 * P.bulge * (1 - smooth(0.4, 0.95, grow));
    const view = (1 + (P.startZoom - 1) * (1 - zoomIn)) * (1 - 0.045 * settle) * mix(1, P.finalScale, exit);
    const bandW = mix(P.bevelWidth, Math.max(P.bevelWidth, 0.4), drop);
    const plateScale = mix(P.startSize, 1, grow) * (1 + drift) * (1 + 0.14 * release);
    const bg = hexToRgb(P.background);
    return {
      uPlateScale: plateScale,
      uShapeN: mix(2, P.corner, morph),
      uCornerN: P.corner,
      uOptics: 1 - smooth(0.55, 1, release),
      uPlateAlpha: appear * (1 - smooth(0.45, 1, release)),
      uLogoHalf: P.logoScale * view,
      uLogoOff: [0, 0],
      uKeep: 0,
      uSheen: P.sheen,
      uSweep: mix(-1.6, 1.6, smoother(0.9, tx - 0.1, T)),
      uLightAng: P.lightTurn * smoother(0.4, tx + 0.4, T),
      uBold: P.swell * 0.03 * (1 - zoomIn),
      uBlur: P.focus * 0.05 * (1 - smooth(0.3, 0.95, grow)),
      uFrost: P.focus * (1 - smooth(0.5, 0.95, grow)),
      uPinch: 0.38 * P.stretch * smooth(0.1, 0.9, morph) * smooth(0.75, 0.97, zoomIn),
      uTilt: P.tilt,
      uDome: dome,
      uDrop: drop,
      uRim: 1 + 0.8 * drop,
      uHalo: P.halo * (0.5 + 0.5 * drop),
      uShadow: P.shadow * smooth(0.45, 0.8, grow) * (1 - smooth(0, 0.6, morph)),
      uGhost: smooth(0, 0.03, T) * (1 - smooth(0.04, 0.08, T)),
      uRipR: 1 + 0.9 * Math.max(0, T - T_LAND),
      uRipA: P.ripple * smooth(T_LAND, T_LAND + 0.06, T) * Math.exp(-Math.max(0, T - T_LAND) / 0.6),
      uBare: smooth(tx - 0.25, tx, T),
      uReach: bandW * plateScale,
      uCornerPull: P.cornerPull,
      uStreak: P.edgeSmear,
      uWiden: P.cornerWidth,
      uSlab: 0.3 * P.opticalDepth,
      uEtaSpread: 0.06,
      uFocus: P.cornerFocus,
      uFocusK: 1.0,
      uFocusSplit: 0.056 * P.colorBleed,
      uRimLine: 0.09,
      uCornerOn: smooth(0.35, 1, morph),
      uGlow: 0.012 * P.colorBleed,
      uFaceDisp: 0.012 * P.dispersion,
      uVivid: 0.85,
      uDissolve: release,
      uDisp: P.dispersion,
      uDouble: P.doubleBevel,
      uBevelW: bandW * (1 - release),
      uSpec: P.specular,
      uIconPlate: P.iconPlate ? 1 : 0,
      uUseColor: 0,
      uLightScene: luminance(bg) > 0.5 ? 1 : 0,
      uLightGlass: luminance(P.iconPlate ? hexToRgb(P.plateColor) : bg) > 0.5 ? 1 : 0,
      uBg: bg,
      uPlateCol: hexToRgb(P.plateColor),
      uLogoCol: hexToRgb(P.logoColor),
    };
  }
  // Half size of the bolt once it has settled, in tile half sizes: sets the tile so it lands on the Z.
  const SETTLED_HALF = frameAt(END).uLogoHalf;

  /* ---------- Bolt -> texture + signed distance field ---------- */
  const TEX = 512;
  const BOX = 0.75;

  // The bolt's corner points, straight from the wordmark symbol (never retyped).
  const nums = (boltPath.getAttribute("d").match(/-?\d*\.?\d+/g) || []).map(Number);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    bx0 = Math.min(bx0, nums[i]); bx1 = Math.max(bx1, nums[i]);
    by0 = Math.min(by0, nums[i + 1]); by1 = Math.max(by1, nums[i + 1]);
  }
  if (!(bx1 > bx0 && by1 > by0)) return;

  function boltImage() {
    const w = bx1 - bx0, h = by1 - by0;
    const s = TEX / Math.max(w, h);
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx0} ${by0} ${w} ${h}" width="${Math.round(w * s)}" height="${Math.round(h * s)}"><path fill="#ffffff" d="${boltPath.getAttribute("d")}"/></svg>`;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("signoff-glass: bolt image"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
    });
  }

  // Centre the bolt in a TEX x TEX canvas with its long side filling BOX of it.
  function fitToTexture(img) {
    const out = document.createElement("canvas");
    out.width = out.height = TEX;
    const ctx = out.getContext("2d", { willReadFrequently: true });
    const sw = img.naturalWidth || TEX, sh = img.naturalHeight || TEX;
    const s = (TEX * BOX) / Math.max(sw, sh);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (TEX - sw * s) / 2, (TEX - sh * s) / 2, sw * s, sh * s);
    return out;
  }

  // Signed distance field from alpha (TinySDF method): + outside, - inside, in texture units.
  function buildSdf(canvas) {
    const n = TEX * TEX;
    const alpha = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, TEX, TEX).data;
    const INF = 1e20;
    const outer = new Float64Array(n);
    const inner = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = alpha[i * 4 + 3] / 255;
      if (a >= 1) { outer[i] = 0; inner[i] = INF; }
      else if (a <= 0) { outer[i] = INF; inner[i] = 0; }
      else {
        const dd = 0.5 - a;
        outer[i] = dd > 0 ? dd * dd : 0;
        inner[i] = dd < 0 ? dd * dd : 0;
      }
    }
    const f = new Float64Array(TEX);
    const z = new Float64Array(TEX + 1);
    const v = new Uint16Array(TEX);
    edt(outer, f, v, z, INF);
    edt(inner, f, v, z, INF);
    const sdf = new Float32Array(n);
    for (let i = 0; i < n; i++) sdf[i] = (Math.sqrt(outer[i]) - Math.sqrt(inner[i])) / TEX;
    return sdf;
  }
  function edt(grid, f, v, z, INF) {
    for (let x = 0; x < TEX; x++) edt1d(grid, x, TEX, f, v, z, INF);
    for (let y = 0; y < TEX; y++) edt1d(grid, y * TEX, 1, f, v, z, INF);
  }
  function edt1d(grid, offset, stride, f, v, z, INF) {
    v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
    for (let q = 1, k = 0, s = 0; q < TEX; q++) {
      f[q] = grid[offset + q * stride];
      const q2 = q * q;
      do {
        const r = v[k];
        s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
      } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    for (let q = 0, k = 0; q < TEX; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k];
      const qr = q - r;
      grid[offset + q * stride] = f[r] + qr * qr;
    }
  }

  /* ---------- Shader ---------- */
  const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uCenter;
uniform float uTile;
uniform sampler2D uSdf;
uniform float uBoxFrac;

uniform float uPlateScale, uShapeN, uCornerN, uOptics, uPlateAlpha, uLogoHalf;
uniform vec2 uLogoOff;
uniform float uBold, uBlur, uFrost, uDome, uDrop, uPinch, uTilt, uRim, uHalo, uShadow, uGhost;
uniform float uRipR, uRipA, uBare, uReach, uCornerPull, uStreak, uWiden, uSlab, uEtaSpread;
uniform float uFocus, uFocusK, uFocusSplit, uRimLine, uCornerOn, uDissolve, uGlow, uFaceDisp, uVivid;
uniform float uDisp, uDouble, uBevelW, uSpec, uIconPlate, uLightScene, uLightGlass, uKeep;
uniform float uSheen, uSweep, uLightAng;
uniform vec3 uBg, uPlateCol, uLogoCol;

float px;

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

vec4 logoAt(vec2 q, float blur, float aa) {
  float L = uLogoHalf;
  float k = 0.5 * uBoxFrac / L;
  vec2 uv = vec2(0.5 + (q.x - uLogoOff.x) * k, 0.5 - (q.y - uLogoOff.y) * k);
  float d = texture(uSdf, uv).r / k;
  float w = 0.75 * aa + blur;
  float a = 1.0 - smoothstep(-w, w, d - uBold * L);
  return vec4(uLogoCol, a);
}

float shape(vec2 p, float scale, float n, out vec2 nOut, out float g, out vec2 dg) {
  vec2 pp = p / scale;
  vec2 a = max(abs(pp), vec2(1e-6));
  g = pow(pow(a.x, n) + pow(a.y, n), 1.0 / n);
  dg = sign(pp) * pow(a, vec2(n - 1.0)) * pow(max(g, 1e-6), 1.0 - n);
  float dgl = max(length(dg), 1e-6);
  nOut = dg / dgl;
  return (g - 1.0) / dgl * scale;
}

float contourRadius(vec2 p, float scale, float n) {
  vec2 a = max(abs(p / scale), vec2(1e-4));
  vec2 a1 = pow(a, vec2(n - 1.0));
  vec2 a2 = pow(a, vec2(n - 2.0));
  float k = (n - 1.0) * (a2.x * a1.y * a1.y + a2.y * a1.x * a1.x) / pow(max(dot(a1, a1), 1e-30), 1.5);
  return scale / max(k, 1e-3);
}

vec2 refractSample(float x, float bwF, float eta, float R, vec2 dirOut, vec2 p, float dome, float offMul) {
  float u = clamp(1.0 - x, 0.0, 0.995);
  float th = asin(u), thr = asin(u / eta);
  float z = uSlab + bwF * sqrt(1.0 - u * u);
  float off = offMul * z * tan(th - thr);
  off = off / (1.0 + off / (6.0 * R));
  return p - (dirOut * off + p * dome) * uOptics;
}

float gauss(float x, float c, float w) { float d = (x - c) / w; return exp(-0.5 * d * d); }
float band(float x, float a, float b, float w) { return smoothstep(a - w, a, x) * (1.0 - smoothstep(b, b + w, x)); }
float bump(float x, float c, float w) { float d = (x - c) / w; return exp(-0.5 * d * d); }
vec3 spectrum(float x) {
  return vec3(bump(x, 0.34, 0.2) + 0.08 * bump(x, 0.93, 0.05), bump(x, 0.58, 0.1), bump(x, 0.8, 0.11));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  px = 2.0 / uTile;
  vec2 p = (gl_FragCoord.xy - uCenter) * px;

  vec4 lg = logoAt(p, uBlur, px);
  vec3 plain = mix(uBg, lg.rgb, lg.a * uBare);

  vec2 nOut, dg; float g;
  float sd = shape(p, uPlateScale, uShapeN, nOut, g, dg);
  float s = -sd;
  float bw = max(uBevelW, 0.004) * uPlateScale;
  float x = clamp(s / bw, 0.0, 1.0);
  float R = contourRadius(p, uPlateScale, uShapeN);
  vec2 pq = p * p;
  float diag = 4.0 * pq.x * pq.y / max((pq.x + pq.y) * (pq.x + pq.y), 1e-6);
  float tilt = mix(1.0 - uTilt, 1.0, smoothstep(-0.02, 0.02, p.x * p.y));
  float pinchPart = uPinch * min(g * g, 1.0) * diag * diag * tilt;
  float dome = uDome * (1.0 - min(g * g, 1.0)) + pinchPart;
  vec2 dirOut = normalize(mix(nOut, p / max(length(p), 1e-4), 0.2));
  float cornerness = max(smoothstep(0.1, 0.9, 4.0 * nOut.x * nOut.x * nOut.y * nOut.y), smoothstep(0.15, 0.75, diag));
  float offMul = 1.0 + 0.4 * max(uCornerPull - 1.0, 0.0) * tilt * cornerness * uCornerOn;
  vec2 focus = sign(p) * (pow(0.5, 1.0 / uShapeN) - uFocus * 0.70710678) * uPlateScale;
  float focusW = tilt * cornerness * uOptics * uCornerOn;
  float bwF = max(uReach, 0.004) * (1.0 + uWiden * tilt * cornerness * uCornerOn);
  float xf = clamp(s / bwF, 0.0, 1.0);
  vec2 qc = refractSample(xf, bwF, 1.5, R, dirOut, p, dome, offMul);
  float foot = max(max(length(dFdx(qc)), length(dFdy(qc))), 0.25 * px);

  vec3 bg = uBg;
  vec3 lift = mix(uBg + vec3(0.06), mix(uBg, vec3(1.0), 0.55), uLightScene);
  if (uGhost > 0.001) {
    vec2 gn, gdg; float gg;
    float gsd = shape(p, 1.0, uCornerN, gn, gg, gdg);
    bg = mix(bg, lift, uGhost * 0.12 * (1.0 - smoothstep(-0.16, 0.14, gsd)));
    bg *= 1.0 - uGhost * 0.03 * uLightScene * exp(-max(gsd, 0.0) / 0.12) * step(0.0, gsd);
  }
  float outside = max(sd, 0.0);
  if (uRipA > 0.001) {
    float d0 = (uRipR - 1.0) * uPlateScale;
    float rx = (sd - d0) / 0.022;
    float ring = exp(-rx * rx);
    bg += uRipA * ring * (0.04 * (0.55 + 0.45 * dot(nOut, normalize(vec2(-0.5, 0.8))))) * mix(0.5, 1.0, uLightScene);
    bg -= uRipA * 0.016 * uLightScene * exp(-(rx - 1.6) * (rx - 1.6));
  }
  float shadowFall = max(sd, 0.0) / (0.9 * uPlateScale);
  bg *= 1.0 - uShadow * 0.03 * exp(-shadowFall * shadowFall) * step(0.0, sd);
  vec3 haloCol = mix(vec3(0.62, 0.69, 0.80), vec3(1.0), uLightScene);
  bg = mix(bg, haloCol, clamp(uHalo * (0.30 * exp(-outside / (0.025 * uPlateScale)) + 0.07 * exp(-outside / (0.12 * uPlateScale))), 0.0, 1.0) * step(0.0, sd));

  vec3 col = bg;
  float soft = px + uBlur * 0.8 + 0.06 * uDissolve * (1.0 - uKeep) * uPlateScale;
  if (sd < soft) {
    float y1 = 1.0 - x;
    const float K = 2.6;
    float base1 = max(1.0 - pow(y1, K), 1e-4);
    float db = min(pow(y1, K - 1.0) * pow(base1, 1.0 / K - 1.0), 25.0);
    float s1 = bw * 0.62;
    float w2 = bw * 0.22;
    float t2 = clamp((s - s1) / w2, -1.0, 1.0);
    float dh2 = uDouble * bw * 0.16;
    float dd = dh2 * 0.5 * cos(t2 * 1.5707963) * 1.5707963 / w2 * step(abs(t2), 0.999);
    vec2 gDome = -uDome * 2.0 * g * dg * step(g, 1.0);
    vec2 grad = -(db + dd) * nOut + gDome;

    vec3 back = mix(uBg, uPlateCol, uIconPlate);
    vec3 liftG = mix(back + vec3(0.06), mix(back, vec3(1.0), 0.55), uLightGlass);
    float rblur = uBlur + 0.05 * length(qc - p) + min(uGlow * uOptics * (1.0 - xf) * foot / px, 0.04);

    float cornerW = smoothstep(0.1, 0.9, 4.0 * nOut.x * nOut.x * nOut.y * nOut.y);
    float streak = 0.35 * uStreak * bw * mix(0.15, 1.0, cornerW) * pow(1.0 - xf, 1.5) * uOptics;
    vec2 tangent = vec2(-nOut.y, nOut.x);
    vec3 acc = vec3(0.0), wsum = vec3(0.0);
    for (int i = 0; i < 20; i++) {
      float lam = (float(i) + 0.5) / 20.0;
      float c = uDisp * (1.0 - 2.0 * lam);
      vec2 along = tangent * (streak * 2.0 * (fract(float(i) * 0.618034 + 0.31) - 0.5));
      float cf = uDisp * (1.0 - 2.0 * lam) * (lam > 0.5 ? 1.0 : 0.5);
      vec2 sp = refractSample(xf, bwF, 1.5 + uEtaSpread * c, R, dirOut, p + along,
                              dome + pinchPart * 0.3 * c, offMul);
      vec2 focusL = focus - sign(p) * (0.70710678 * uFocusSplit * c * uPlateScale);
      float wFocus = pow(1.0 - xf, uFocusK) * smoothstep(0.0, uRimLine * (1.0 + 0.6 * c), xf);
      sp = mix(sp, mix(p + along, focusL, wFocus), focusW);
      float faceOnly = smoothstep(0.7, 1.0, xf) * uOptics;
      sp *= 1.0 + uFaceDisp * cf * faceOnly;
      vec4 l = logoAt(sp, rblur + 0.12 * streak + uFaceDisp * 0.5 * max(c, 0.0) * faceOnly, foot);
      vec3 w = spectrum(lam);
      acc += mix(back, l.rgb, l.a) * w;
      wsum += w;
    }
    vec3 trans = acc / wsum;
    float tl = dot(trans, vec3(0.2126, 0.7152, 0.0722));
    trans = clamp(tl + (trans - tl) * (1.0 + uVivid * uOptics), 0.0, 1.0);
    float hazeLum = dot(trans, vec3(0.2126, 0.7152, 0.0722));
    float hazeGate = mix(1.0 - smoothstep(0.25, 0.75, hazeLum), smoothstep(0.25, 0.75, hazeLum), uLightGlass);
    trans = mix(trans, liftG, uFrost * 0.45 * hazeGate);

    float glassAmt = pow(1.0 - uDissolve, 1.5);
    float lit = uSpec * glassAmt;
    vec3 rimCol = mix(vec3(0.80, 0.87, 0.97), vec3(1.0), uLightGlass);

    float sc = uPlateScale;
    float tLum = dot(trans, vec3(0.2126, 0.7152, 0.0722));
    float lightOnly = smoothstep(0.35, 0.85, tLum);
    float hw = smoothstep(-0.85, 0.5, dot(nOut, rot(vec2(0.5, 0.866), uLightAng)));
    float tileBand = band(s, 0.016 * sc, 0.075 * sc, 0.022 * sc);
    float dropBand = (1.0 - smoothstep(0.06 * sc, 0.13 * sc, s)) * smoothstep(0.0, 0.004 * sc, s);
    float glow = mix(0.32 * tileBand, 0.75 * dropBand, uDrop) * lightOnly;
    float edgeLine = gauss(s, 0.005 * sc, 0.0045 * sc);
    float lip = gauss(s, 0.15 * sc, 0.007 * sc) * uDouble * (1.0 - uDrop);
    vec3 lightGlass = mix(trans, vec3(1.0), glow * glassAmt);
    lightGlass += (0.075 * hw * edgeLine + 0.06 * (0.4 + 0.6 * hw) * lip) * lit;
    lightGlass *= 1.0 - 0.05 * (1.0 - hw) * edgeLine * glassAmt * (1.0 - uDrop);
    lightGlass = mix(lightGlass, vec3(1.0), 0.55 * uDrop * glassAmt * edgeLine);

    vec3 Nl = normalize(vec3(-grad, 1.0));
    float edge = 1.0 - Nl.z;
    vec2 ldir = rot(normalize(vec2(-0.62, 0.78)), uLightAng);
    float side = dot(nOut, ldir);
    float fres = pow(edge, 1.5);
    vec3 rim = rimCol * fres * (0.35 + 0.65 * max(side, -side * 0.8)) * uRim * 0.65;
    vec3 Hv = normalize(normalize(vec3(-0.45, 0.6, 0.66)) + vec3(0.0, 0.0, 1.0));
    float spc = pow(max(dot(Nl, Hv), 0.0), 140.0) * 0.8 * smoothstep(0.0, 0.25, y1);
    vec3 darkGlass = trans * (1.0 - 0.25 * fres) + (rim + vec3(spc)) * lit;
    darkGlass = mix(darkGlass, rimCol, uDrop * 0.4 * uSpec * (1.0 - smoothstep(0.0, 0.1 * uPlateScale, s)));
    vec3 glass = mix(darkGlass, lightGlass, uLightGlass);

    float sweepD = dot(p / uPlateScale, normalize(vec2(0.8, 0.6))) - uSweep;
    float sheen = uSheen * glassAmt * exp(-sweepD * sweepD / 0.03) * (0.55 + 0.45 * (1.0 - x));
    glass = mix(glass, vec3(1.0), sheen * mix(0.22, 0.42, uLightGlass));

    float cov = clamp(0.5 - sd / soft, 0.0, 1.0);
    col = mix(bg, glass, cov);
  }

  vec3 outc = mix(plain, col, uPlateAlpha);
  outc += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(outc, 1.0);
}`;

  /* ---------- Renderer ---------- */
  function createRenderer(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
    if (!gl) return null;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "program");
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i);
      U[info.name] = gl.getUniformLocation(prog, info.name);
    }
    gl.uniform1i(U.uSdf, 0);

    return {
      setSdf(sdf) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TEX, TEX, 0, gl.RED, gl.FLOAT, sdf);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      },
      render(fr, w, h, tilePx) {
        gl.viewport(0, 0, w, h);
        gl.uniform2f(U.uCenter, w / 2, h / 2);
        gl.uniform1f(U.uTile, tilePx);
        gl.uniform1f(U.uBoxFrac, BOX);
        for (const k in fr) {
          const v = fr[k];
          if (typeof v === "number" && U[k]) gl.uniform1f(U[k], v);
        }
        gl.uniform3fv(U.uBg, fr.uBg);
        gl.uniform3fv(U.uPlateCol, fr.uPlateCol);
        gl.uniform3fv(U.uLogoCol, fr.uLogoCol);
        gl.uniform2fv(U.uLogoOff, fr.uLogoOff);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose() { gl.getExtension("WEBGL_lose_context")?.loseContext(); },
    };
  }

  /* ---------- Sign-off choreography ---------- */
  const canvas = document.createElement("canvas");
  canvas.className = "signoff__glass";
  canvas.setAttribute("aria-hidden", "true");

  let renderer = null;
  try { renderer = createRenderer(canvas); } catch (err) { console.error(err); }
  if (!renderer) return;

  let tile = 0, size = 0; // css px
  let T = 0, last = 0, raf = 0;
  let ready = false, started = false, visible = false, done = false;

  // Where the Z is on screen: canvas centred on it, tile sized so the settled bolt matches it exactly.
  function layout() {
    const outerVb = (svg.getAttribute("viewBox") || "0 0 802 180").split(/[\s,]+/).map(Number);
    const symVb = (symbol.getAttribute("viewBox") || outerVb.join(" ")).split(/[\s,]+/).map(Number);
    // The symbol fills the outer viewBox (xMidYMid meet).
    const fit = Math.min(outerVb[2] / symVb[2], outerVb[3] / symVb[3]);
    const offX = outerVb[0] + (outerVb[2] - symVb[2] * fit) / 2 - symVb[0] * fit;
    const offY = outerVb[1] + (outerVb[3] - symVb[3] * fit) / 2 - symVb[1] * fit;
    const r = svg.getBoundingClientRect();
    const host = signoff.getBoundingClientRect();
    const k = r.width / outerVb[2];
    const cx = r.left - host.left + (offX + ((bx0 + bx1) / 2) * fit - outerVb[0]) * k;
    const cy = r.top - host.top + (offY + ((by0 + by1) / 2) * fit - outerVb[1]) * k;
    const longSide = Math.max(bx1 - bx0, by1 - by0) * fit * k;
    tile = longSide / SETTLED_HALF;
    size = Math.ceil(tile * 1.8);
    canvas.style.left = `${cx - size / 2}px`;
    canvas.style.top = `${cy - size / 2}px`;
    canvas.style.width = canvas.style.height = `${size}px`;
    // Where the letters start to appear from, as a share of the wordmark's width.
    const zx = ((offX + ((bx0 + bx1) / 2) * fit - outerVb[0]) / outerVb[2]) * 100;
    svg.style.setProperty("--glass-l", `${zx.toFixed(2)}%`);
    svg.style.setProperty("--glass-r", `${(100 - zx).toFixed(2)}%`);
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(size * dpr));
    if (canvas.width !== w || canvas.height !== w) { canvas.width = w; canvas.height = w; }
    renderer.render(frameAt(Math.min(T, END)), w, w, tile * dpr);
  }

  function tick(now) {
    raf = 0;
    T += Math.min(0.05, (now - last) / 1000);
    last = now;
    if (T >= LETTERS_AT && signoff.dataset.glass === "wait") signoff.dataset.glass = "letters";
    draw();
    if (T >= END) { finish(); return; }
    if (visible) raf = requestAnimationFrame(tick);
  }

  function kick() {
    if (raf || done || !ready || !started || !visible) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // The bolt has landed on the Z: hand over to the wordmark and remove the canvas.
  function finish() {
    if (done) return;
    done = true;
    signoff.dataset.glass = "done";
    canvas.style.opacity = "0";
    setTimeout(cleanup, 400);
  }

  // Also the way out when anything fails: the plain logo, as without this script.
  function cleanup() {
    done = true;
    if (raf) cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    renderer.dispose();
    canvas.remove();
    delete signoff.dataset.glass;
    svg.style.removeProperty("--glass-l");
    svg.style.removeProperty("--glass-r");
  }

  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    visible = e.isIntersecting;
    if (e.intersectionRatio >= 0.5) started = true;
    if (visible) kick();
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { threshold: [0, 0.5] });
  const ro = new ResizeObserver(() => { if (!done) { layout(); if (ready) draw(); } });

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); if (!done) cleanup(); });

  // Hide the wordmark now (the footer is still below the fold), then build the bolt.
  signoff.dataset.glass = "wait";
  signoff.appendChild(canvas);
  layout();
  io.observe(signoff);
  ro.observe(signoff);

  boltImage()
    .then((img) => {
      if (done) return;
      renderer.setSdf(buildSdf(fitToTexture(img)));
      ready = true;
      draw(); // first frame: empty page background, invisible under the blend
      kick();
    })
    .catch((err) => { console.error(err); cleanup(); });
})();
