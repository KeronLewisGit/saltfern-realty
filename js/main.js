import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import MOTION from './motion.js';

/* ------------------------------------------------------------------ helpers */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let still = root.dataset.motion === 'still' || reduced;

/* ------------------------------------------------------------------ renderer (only draws the particle villa at the bottom of the page) */
const canvas = $('#scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
catch (e) { root.classList.add('no-gl', 'ready'); throw e; }
const mobile = matchMedia('(max-width: 760px)').matches;
const PR = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(PR);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b14);
const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 3000);
const view = { aspect: 1, w: 1, h: 1 };
const pointer = { x: 0, y: 0, sx: 0, sy: 0 };

/* ------------------------------------------------------------------ particle villa
   A drifting star field that gathers into the Ridge House as you reach the call to action.
   Most points sit on the edges of the building so it reads as a drawn outline, not a cloud. */
const R = Math.random;
const COOL = [.74, .82, 1], WARM = [1, .68, .34], AQUA = [.3, .92, 1], LEAF = [.62, .95, .7];
const BOX = [ // w, h, d, x, y, z (y = base), colour, weight
  [20, .4, 15, 0, 0, 2.5, COOL, .8],                       // terrace
  [7.5, .06, 4.2, -4.6, .42, 6.6, AQUA, 2.4],              // pool
  [11, 3.2, 7, 2.6, .4, -1.2, WARM, 1.5],                  // living floor
  [12.6, 3, 7.6, 3.2, 3.6, -1.2, COOL, 1.2],               // bedroom floor
  [17, .34, 11.4, 2.4, 6.6, -.6, COOL, 1.5],               // roof, overhanging
  [3.2, 3, .3, 7.8, 3.6, 2.5, WARM, 1],                    // timber screen
];
for (let x = -2.9; x <= 8.2; x += 1.85) BOX.push([.08, 3.2, .08, x, .4, 2.3, WARM, 2.2]);     // glazing bars, living floor
for (let x = -3.1; x <= 6; x += 1.85) BOX.push([.08, 3, .08, x, 3.6, 2.6, COOL, 1.8]);        // glazing bars, bedroom floor
for (const x of [-7.6, -6.2, -1.2]) BOX.push([.8, .28, 2.1, x, .42, 3.4, COOL, 1.4]);          // loungers
function boxPoint(b) {
  const [w, h, d, x, y, z] = b; let px = (R() - .5) * w, py = R() * h, pz = (R() - .5) * d;
  if (R() < .68) { const ax = R() * (w + h + d), sA = R() < .5 ? -.5 : .5, sB = R() < .5 ? 0 : 1;      // on an edge
    if (ax < w) { py = sB * h; pz = sA * d; } else if (ax < w + h) { px = sA * w; pz = (sB - .5) * d; } else { px = sA * w; py = sB * h; } }
  else { const f = R() * (w * h + h * d + w * d); if (f < w * h) pz = (R() < .5 ? -.5 : .5) * d; else if (f < w * h + h * d) px = (R() < .5 ? -.5 : .5) * w; else py = R() < .5 ? 0 : h; }
  return [x + px, y + py, z + pz];
}
function palmPoint(bx, bz, H) {
  if (R() < .3) { const t = R(); return [bx + Math.sin(t * 1.3) * 1.1, .4 + t * H, bz]; }              // bent trunk
  const a = Math.floor(R() * 9) / 9 * Math.PI * 2, t = R(), L = 3.6;                                    // nine drooping fronds
  return [bx + 1 + Math.cos(a) * t * L, .4 + H + Math.sin(t * Math.PI * .9) * 1.1 - t * t * 1.9, bz + Math.sin(a) * t * L];
}
const PN = mobile ? 11000 : 24000;
const pGeo = new THREE.BufferGeometry();
{
  const wts = BOX.map(b => (b[0] + b[1] + b[2]) * b[7]), total = wts.reduce((a, b) => a + b, 0);
  const pos = new Float32Array(PN * 3), tgt = new Float32Array(PN * 3), col = new Float32Array(PN * 3), seed = new Float32Array(PN), stay = new Float32Array(PN);
  for (let i = 0; i < PN; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = 16 + Math.pow(R(), .6) * 42, s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(th) * rr * 1.5, u * rr * .8, s * Math.sin(th) * rr], i * 3);
    seed[i] = R(); let p, c = COOL;
    const k = R();
    if (k < .14) { stay[i] = 1; p = [0, 0, 0]; }                                                          // stays a star, keeps the sky alive
    else if (k < .24) { p = R() < .5 ? palmPoint(-9.2, 1.5, 6.6) : palmPoint(10.4, 4.4, 7.6); c = LEAF; }
    else { let r = R() * total, j = 0; while (r > wts[j] && j < BOX.length - 1) { r -= wts[j]; j++; } p = boxPoint(BOX[j]); c = BOX[j][6]; }
    tgt.set([p[0] - 1.5, p[1] - 3.4, p[2] - 1.5], i * 3); col.set(c, i * 3);
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pGeo.setAttribute('aTarget', new THREE.BufferAttribute(tgt, 3));
  pGeo.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); pGeo.setAttribute('aStay', new THREE.BufferAttribute(stay, 1));
}
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uSize: { value: 1 } },
  vertexShader: `
    attribute vec3 aTarget, aCol; attribute float aSeed, aStay;
    uniform float uMorph, uTime, uSize; varying float vSeed, vD, vGlow; varying vec3 vCol;
    void main(){
      float d = clamp(uMorph * 1.8 - aSeed * .8, 0., 1.) * (1. - aStay); d = d*d*d*(d*(d*6.-15.)+10.);
      vec3 drift = vec3(sin(uTime*.21 + aSeed*41.), cos(uTime*.17 + aSeed*23.), sin(uTime*.13 + aSeed*67.));
      vec3 swirl = vec3(-position.z, position.y * .15, position.x) * .32 * sin(d * 3.1416);
      vec3 p = mix(position + drift * 1.8, aTarget + drift * .035, d) + swirl;
      float sweep = fract(uTime * .07) * 46. - 23.;                         // a slow band of light crossing the finished house
      vGlow = d * smoothstep(5., 0., abs(aTarget.x - sweep));
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      gl_Position = projectionMatrix * mv;
      float tw = 1. + .6 * sin(uTime * 1.3 + aSeed * 90.) * (1. - d);
      gl_PointSize = min(uSize * mix(.55 + aSeed * 1.1, .42 + aSeed * .5, d) * tw * (1. + vGlow * .45) / -mv.z, uSize * .05);
      vSeed = aSeed; vD = d; vCol = aCol;
    }`,
  fragmentShader: `
    varying float vSeed, vD, vGlow; varying vec3 vCol;
    void main(){
      float r = length(gl_PointCoord - .5); float a = smoothstep(.5, .05, r);
      vec3 star = mix(vec3(.72,.8,1.), vec3(1.), vSeed);
      vec3 c = mix(star, vCol, vD) * (1.1 + vGlow * .6);
      gl_FragColor = vec4(c, a * mix(.35 + .65 * vSeed, .55 + .35 * vSeed, vD));
    }`
});
const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false;
const pointsPivot = new THREE.Group(); pointsPivot.add(points); scene.add(pointsPivot);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), .32, .6, .82));
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ film: pre-rendered photoreal frames, scrubbed by scroll */
const film = $('#film');
// Preferred path: a worker owns the canvas, so decoding never blocks scrolling. Fallback: same player on the main thread.
const filmWorker = film.transferControlToOffscreen && window.Worker ? new Worker('js/film-worker.js?v=1') : null;
const fctx = filmWorker ? null : film.getContext('2d', { alpha: false });
let filmSent = -1;
if (filmWorker) filmWorker.onmessage = e => { if (e.data.type === 'ready') root.classList.add('ready'); else if (e.data.type === 'stats') window.__filmStats = e.data.stats; };
window.__filmPoll = reset => filmWorker && filmWorker.postMessage({ type: 'stats', reset });
const filmFx = () => view.aspect < 1 ? .64 : .5;
const NF = MOTION.length - 10;                                   // the last frames are a held still
const frameSrc = i => `media/seq/f${String(i).padStart(4, '0')}.webp`;
// Pace: scroll distance follows how much the picture changes, so a fast pan gets more scroll and a held shot less.
const cum = new Float32Array(NF);
{ const sm = i => { let a = 0, n = 0; for (let k = -3; k <= 3; k++) { const v = MOTION[i + k]; if (v !== undefined) { a += v; n++; } } return a / n; };
  for (let i = 1; i < NF; i++) cum[i] = cum[i - 1] + Math.pow(Math.max(sm(i), 1.1), .55);
  for (let i = 1; i < NF; i++) cum[i] /= cum[NF - 1]; }
const tOfFrame = i => cum[clamp(Math.round(i), 0, NF - 1)];
function frameAt(t) {
  t = clamp(t); let lo = 0, hi = NF - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= t) lo = m; else hi = m; }
  return lo + (cum[hi] > cum[lo] ? (t - cum[lo]) / (cum[hi] - cum[lo]) : 0);
}
// Frames are fetched once as compressed blobs, then decoded off the main thread into a moving window around the playhead.
const WIN = +new URLSearchParams(location.search).get('win') || (mobile ? 14 : 30), KEEP = WIN + 10;
const blobs = new Array(NF), bmp = new Map();
const filmStats = window.__filmStats = { exact: 0, near: 0 };            // draws that had the exact frame decoded vs a neighbour
let filmSpeed = 0, filmX = 0, pendingDec = 0, filmCur = 0, filmDir = 1, filmDirty = true, filmKey = -1;
async function loadBlob(i) { try { const r = await fetch(frameSrc(i)); if (r.ok) blobs[i] = await r.blob(); } catch (e) {} }
async function loadFilm() {
  const order = [], seen = new Set();
  for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < NF; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
  let k = 0; const worker = async () => { while (k < order.length) await loadBlob(order[k++]); };
  await Promise.all(Array.from({ length: 8 }, worker));
}
function decode(i) {
  if (i < 0 || i >= NF || bmp.has(i) || !blobs[i] || pendingDec >= 4) return;
  bmp.set(i, null); pendingDec++;
  createImageBitmap(blobs[i]).then(b => { pendingDec--; if (Math.abs(i - filmCur) > KEEP) { b.close(); bmp.delete(i); } else { bmp.set(i, b); filmDirty = true; } }, () => { pendingDec--; bmp.delete(i); });
}
function pump() {
  // On a fast scroll, decode every 2nd or 3rd frame ahead instead of falling behind on all of them.
  const st = filmSpeed > 1.7 ? 3 : filmSpeed > .85 ? 2 : 1, al = i => st > 1 ? Math.round(i / st) * st : i;
  for (let d = 0; d <= WIN && pendingDec < 4; d += st) { decode(al(filmCur + d * filmDir)); if (d && d <= WIN / 3) decode(al(filmCur - d * filmDir)); }
  for (const [i, b] of bmp) if (b && Math.abs(i - filmCur) > KEEP) { b.close(); bmp.delete(i); }
}
function paintFrame(im, alpha) {
  const W = film.width, H = film.height, sc = Math.max(W / im.width, H / im.height) * 1.002;
  const dw = im.width * sc, dh = im.height * sc, fx = filmFx();
  fctx.globalAlpha = alpha; fctx.drawImage(im, (W - dw) * fx, (H - dh) * .5, dw, dh);
}
function drawFilm(t) {
  if (filmWorker) { const x = frameAt(t); if (Math.abs(x - filmSent) > .012) { filmSent = x; filmWorker.postMessage({ type: 'x', x }); } return; }
  const x = frameAt(t), i0 = Math.min(Math.floor(x), NF - 1), a = x - i0;
  filmSpeed += (Math.abs(x - filmX) - filmSpeed) * .25; filmX = x;      // frames advanced per screen refresh, smoothed
  if (i0 !== filmCur) { filmDir = i0 > filmCur ? 1 : -1; filmCur = i0; }
  pump();
  const key = Math.round(x * 40);
  if (key === filmKey && !filmDirty) return;
  let A = bmp.get(i0), exact = !!A;
  for (let d = 1; !A && d <= KEEP; d++) A = bmp.get(i0 - d) || bmp.get(i0 + d);
  if (!A) return;
  filmKey = exact ? key : -1; filmDirty = false;
  if (exact) filmStats.exact++; else filmStats.near++;
  paintFrame(A, 1);
  const B = exact && bmp.get(i0 + 1); if (B && a > .03) paintFrame(B, a);   // blend neighbours for sub-frame smoothness
  fctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ sizing */
function resize() {
  view.w = innerWidth; view.h = innerHeight; view.aspect = view.w / view.h;
  renderer.setSize(view.w, view.h, false); composer.setSize(view.w, view.h);
  camera.aspect = view.aspect;
  if (view.w > 760) camera.setViewOffset(view.w, view.h, -view.w * .15, 0, view.w, view.h);
  else camera.setViewOffset(view.w, view.h, 0, view.h * .15, view.w, view.h);
  camera.updateProjectionMatrix();
  pMat.uniforms.uSize.value = view.h * PR * .11;
  const fw = Math.round(view.w * PR), fh = Math.round(view.h * PR);
  if (filmWorker) { if (filmSent >= 0) filmWorker.postMessage({ type: 'size', w: fw, h: fh, fx: filmFx() }); }
  else { film.width = fw; film.height = fh; fctx.imageSmoothingQuality = 'high'; filmDirty = true; }
}

/* ------------------------------------------------------------------ scroll + DOM */
const journey = $('#journey'), nightEl = $('#night'), bridge = $('#bridge');
const chapters = $$('.ch'), tourItems = $$('.tour li'), tourBars = tourItems.map(li => $('b', li)), hdr = $('.hdr'), hereName = $('#hereName');
const railFill = $('#railFill'), railPct = $('#railPct'), railEl = $('.rail');
const CH = [0, tOfFrame(24), tOfFrame(186), tOfFrame(266), tOfFrame(432), 1.001];   // chapter starts, as frame numbers
const themed = $$('[data-theme]').filter(e => e !== hdr);
let tTarget = 0, tNow = 0, tVel = 0, activeCh = -1, mode = 'journey', morphNow = 0, morphTarget = 0, pageP = 0, pageNow = 0;

function onScroll() {
  const y = scrollY, vh = innerHeight, jr = journey.getBoundingClientRect();
  tTarget = clamp(-jr.top / (jr.height - vh));
  const nr = nightEl.getBoundingClientRect();
  mode = jr.bottom > 0 ? 'journey' : (nr.top < vh ? 'particles' : 'idle');
  const br = bridge.getBoundingClientRect();
  const inP = clamp((vh * .75 - br.top) / (vh * .95)), outP = clamp((-br.top - (br.height - vh) * .95) / (vh * 1.1));
  morphTarget = inP * (1 - outP * .82);
  hdr.dataset.solid = y > 30;
  for (const s of themed) { const r = s.getBoundingClientRect(); if (r.top <= 40 && r.bottom > 40) { hdr.dataset.theme = s.dataset.theme; if (s.dataset.label && s !== journey) hereName.textContent = s.dataset.label; break; } }
  for (const sct of themed) { const r = sct.getBoundingClientRect(); if (r.top <= vh / 2 && r.bottom > vh / 2) { if (railEl.dataset.theme !== sct.dataset.theme) railEl.dataset.theme = sct.dataset.theme; break; } }
  pageP = clamp(y / (root.scrollHeight - vh));
}
function setChapters(t) {
  let idx = 0; for (let i = 0; i < 5; i++) if (t >= CH[i]) idx = i;
  if (idx !== activeCh) {
    activeCh = idx;
    chapters.forEach((c, i) => { c.classList.toggle('is-on', i === idx); c.classList.toggle('is-past', i < idx); });
    tourItems.forEach((li, i) => li.classList.toggle('is-on', i === idx));
    if (mode === 'journey') hereName.textContent = chapters[idx].dataset.name;
  }
  tourBars.forEach((b, i) => { const v = clamp((t - CH[i]) / (CH[i + 1] - CH[i])).toFixed(3); if (b._v !== v) { b._v = v; b.style.transform = `scaleX(${v})`; } });
}

/* ------------------------------------------------------------------ loop */
let last = performance.now(), time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .05); last = now;
  if (!still) time += dt;
  // The film always glides to the scroll position (critically damped: no overshoot, no snap).
  // "Pause motion" only stops ambient movement; reduced-motion users get a direct, unanimated scrub.
  if (reduced) { tNow = tTarget; tVel = 0; }
  else { const w = 4.2, sub = 2; for (let k = 0; k < sub; k++) { const h = dt / sub; tVel += (w * w * (tTarget - tNow) - 2 * w * tVel) * h; tNow += tVel * h; } }
  if (still) { morphNow = morphTarget; pageNow = pageP; }
  else { const k = 1 - Math.exp(-dt * 3.2); morphNow += (morphTarget - morphNow) * k; pageNow += (pageP - pageNow) * (1 - Math.exp(-dt * 8)); }
  pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 2.5)); pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 2.5));
  setChapters(tNow);
  { const v = pageNow.toFixed(3); if (railFill._v !== v) { railFill._v = v; railFill.style.transform = `scaleY(${v})`; } const pc = String(Math.round(pageNow * 100)).padStart(2, '0'); if (railPct._v !== pc) { railPct._v = pc; railPct.textContent = pc; } }
  if (mode === 'idle' || document.hidden) return;

  film.style.opacity = mode === 'journey' ? 1 : 0;
  if (mode === 'journey') { drawFilm(tNow); return; }
  {
    const far = view.aspect < 1 ? 1 + (1 - view.aspect) * 1.9 : 1 + clamp(1.7 - view.aspect, 0, .7) * .5;
    camera.position.set(pointer.sx * 2.4, 3.2 + pointer.sy * 1.4, 52 * far); camera.lookAt(0, .4, 0);
    pointsPivot.rotation.set(.16, -.62 + Math.sin(time * .14) * .26 + morphNow * .3, 0);
    pointsPivot.position.set(view.aspect < 1 ? 0 : 5.6 * clamp((view.aspect - .85) / .8), view.aspect < 1 ? 5 : view.aspect < 1.3 ? -4 : -.4, 0);
    pMat.uniforms.uMorph.value = morphNow; pMat.uniforms.uTime.value = time;
  }
  composer.render();
}

/* ------------------------------------------------------------------ boot */
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { resize(); onScroll(); });
addEventListener('pointermove', e => { if (still || e.pointerType === 'touch') return; pointer.x = e.clientX / innerWidth - .5; pointer.y = .5 - e.clientY / innerHeight; });

const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
$$('.rv').forEach(e => io.observe(e));

const motionBtn = $('#motionBtn');
function paintMotion() { motionBtn.setAttribute('aria-pressed', still); $('#motionTxt').textContent = still ? 'Play motion' : 'Pause motion'; if (still) root.dataset.motion = 'still'; else delete root.dataset.motion; }
motionBtn.addEventListener('click', () => { still = !still; try { sessionStorage.setItem('sf-motion', still ? 'still' : 'on'); } catch (e) {} paintMotion(); });
paintMotion();

$('#viewForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, note = $('#formNote'); let ok = true;
  $$('input[required]', f).forEach(i => { const bad = !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value)); i.closest('.f').classList.toggle('bad', bad); if (bad) ok = false; });
  note.classList.toggle('ok', ok);
  note.textContent = ok ? 'Thanks. This is a concept build, so the form is not connected yet and nothing was sent.' : 'Please add your name and a valid email.';
});
$('#yr').textContent = new Date().getFullYear();

resize(); onScroll();
tNow = tTarget; pageNow = pageP;
requestAnimationFrame(frame);
if (filmWorker) {
  const off = film.transferControlToOffscreen(); filmSent = frameAt(tTarget);
  filmWorker.postMessage({ type: 'init', canvas: off, nf: NF, win: WIN, base: new URL('media/seq/', location.href).href, fx: filmFx(), w: Math.round(view.w * PR), h: Math.round(view.h * PR), x: filmSent }, [off]);
  setTimeout(() => root.classList.add('ready'), 4000);          // never leave the veil up if the first frame is slow
} else loadBlob(Math.floor(frameAt(tTarget))).then(() => { root.classList.add('ready'); loadFilm(); });
