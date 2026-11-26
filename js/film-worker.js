/* Film player, off the main thread.
   Fetches the frame sequence, decodes a moving window of frames around the playhead and paints them
   to an OffscreenCanvas. The page only sends the playhead position (a fractional frame number),
   so decoding and texture uploads can never block scrolling or the DOM. */
let ctx = null, cv = null, NF = 0, WIN = 30, KEEP = 40, base = '', fx = .5;
let x = 0, lastX = 0, cur = 0, dir = 1, speed = 0, pending = 0, dirty = true, key = -1, scheduled = false, announced = false;
const blobs = [], bmp = new Map(), stats = { exact: 0, near: 0 };
const src = i => `${base}f${String(i).padStart(4, '0')}.webp`;
const raf = self.requestAnimationFrame ? cb => self.requestAnimationFrame(cb) : cb => setTimeout(cb, 8);
function schedule() { if (!scheduled) { scheduled = true; raf(tick); } }

async function loadBlob(i) { try { const r = await fetch(src(i)); if (r.ok) { blobs[i] = await r.blob(); if (Math.abs(i - cur) <= WIN) schedule(); } } catch (e) {} }
async function loadAll(start) {
  await loadBlob(start);
  const order = [], seen = new Set([start]);
  for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < NF; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
  let k = 0; const worker = async () => { while (k < order.length) await loadBlob(order[k++]); };
  await Promise.all(Array.from({ length: 8 }, worker));
}
function decode(i) {
  if (i < 0 || i >= NF || bmp.has(i) || !blobs[i] || pending >= 4) return;
  bmp.set(i, null); pending++;
  createImageBitmap(blobs[i]).then(b => {
    pending--;
    if (Math.abs(i - cur) > KEEP) { b.close(); bmp.delete(i); } else { bmp.set(i, b); dirty = true; }
    schedule();
  }, () => { pending--; bmp.delete(i); });
}
function pump() {
  // On a fast scroll, decode every 2nd or 3rd frame ahead instead of falling behind on all of them.
  const st = speed > 1.7 ? 3 : speed > .85 ? 2 : 1, al = i => st > 1 ? Math.round(i / st) * st : i;
  for (let d = 0; d <= WIN && pending < 4; d += st) { decode(al(cur + d * dir)); if (d && d <= WIN / 3) decode(al(cur - d * dir)); }
  for (const [i, b] of bmp) if (b && Math.abs(i - cur) > KEEP) { b.close(); bmp.delete(i); }
}
function paint(im, alpha) {
  const W = cv.width, H = cv.height, sc = Math.max(W / im.width, H / im.height) * 1.002;
  const dw = im.width * sc, dh = im.height * sc;
  ctx.globalAlpha = alpha; ctx.drawImage(im, (W - dw) * fx, (H - dh) * .5, dw, dh);
}
function tick() {
  scheduled = false;
  if (!ctx) return;
  const i0 = Math.min(Math.floor(x), NF - 1), a = x - i0;
  speed += (Math.abs(x - lastX) - speed) * .25; lastX = x;
  if (i0 !== cur) { dir = i0 > cur ? 1 : -1; cur = i0; }
  pump();
  const k = Math.round(x * 40);
  if (k !== key || dirty) {
    let A = bmp.get(i0); const exact = !!A;
    for (let d = 1; !A && d <= KEEP; d++) A = bmp.get(i0 - d) || bmp.get(i0 + d);
    if (A) {
      key = exact ? k : -1; dirty = false;
      if (exact) stats.exact++; else stats.near++;
      paint(A, 1);
      const B = exact && bmp.get(i0 + 1); if (B && a > .03) paint(B, a);   // blend neighbours for sub-frame smoothness
      ctx.globalAlpha = 1;
      if (!announced) { announced = true; postMessage({ type: 'ready' }); }
    }
  }
  if (speed > .002 || pending) schedule();          // keep ticking while the playhead settles or decodes are in flight
}

onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    cv = m.canvas; ctx = cv.getContext('2d', { alpha: false }); ctx.imageSmoothingQuality = 'high';
    NF = m.nf; WIN = m.win; KEEP = WIN + 10; base = m.base; fx = m.fx; cv.width = m.w; cv.height = m.h;
    x = lastX = m.x; cur = Math.floor(x); loadAll(cur);
  } else if (m.type === 'size') { cv.width = m.w; cv.height = m.h; fx = m.fx; ctx.imageSmoothingQuality = 'high'; dirty = true; }
  else if (m.type === 'x') { x = m.x; }
  else if (m.type === 'stats') { postMessage({ type: 'stats', stats: { ...stats } }); if (m.reset) { stats.exact = 0; stats.near = 0; } return; }
  schedule();
};
