/* Page motion that does not depend on WebGL: headline reveals, counters, and in-view video. */
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const paused = () => reduced || root.dataset.motion === 'still';

/* --- headlines: split into words that rise out of a mask, one after another --- */
function split(el) {
  let n = 0;
  const walk = node => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const w = document.createElement('span'); w.className = 'w';
          const inner = document.createElement('span'); inner.textContent = part; inner.style.transitionDelay = `${n++ * 55}ms`;
          w.append(inner); frag.append(w);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
    }
  };
  el.setAttribute('aria-label', el.innerText.replace(/\s+/g, ' ').trim());
  walk(el); el.classList.add('words');
}
if (!reduced) $$('.h2').forEach(split);

/* --- counters --- */
function count(el) {
  const to = +el.dataset.count, t0 = performance.now(), dur = 900 + to * 25;
  if (reduced || to < 2) { el.textContent = to; return; }
  const step = now => { const k = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
  el.textContent = 0; requestAnimationFrame(step);
}

/* --- reveal on scroll (headlines and counters) --- */
const seen = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in'); seen.unobserve(e.target);
  if (e.target.dataset.count) count(e.target);
}), { rootMargin: '0px 0px -12% 0px' });
$$('.words, [data-count], .sun, .spec').forEach(e => seen.observe(e));

/* --- video: load when near, play only while on screen and motion is on --- */
const vids = $$('video.vid');
const sync = v => { if (v._on && !paused()) { if (!v.src) v.src = v.dataset.src; v.play().then(() => v.classList.add('playing'), () => {}); } else v.pause(); };
const vio = new IntersectionObserver(es => es.forEach(e => { e.target._on = e.isIntersecting; sync(e.target); }), { rootMargin: '120px 0px' });
vids.forEach(v => vio.observe(v));
new MutationObserver(() => vids.forEach(sync)).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
document.addEventListener('visibilitychange', () => vids.forEach(v => document.hidden ? v.pause() : sync(v)));
