/* Super Pack Center homepage engine: scroll-scrubbed hero, captions, reveals, hold-to-color. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const rng = seed => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  /* ================= video settings ================= */
  const VIDEO_URL = '/assets/hero-scrub.mp4';
  const VIDEO_BYTES = 6596710;          // tamanho real de assets/hero-scrub.mp4, recuo quando falta Content-Length
  const POSTER_URL = '/assets/hero-poster.jpg';

  /* ================= split hero headlines (once, seeded) ================= */
  function split(el) {
    const text = el.textContent.trim();
    const band = el.closest('.band');
    const mode = band.classList.contains('fx-scatter') ? 'scatter' : band.classList.contains('fx-rise') ? 'rise' : 'grid';
    const spread = Number(band.dataset.spread || 0.45);
    const r = rng(Number(el.dataset.seed || 1));
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'sr';
    sr.textContent = text;
    const vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    const words = text.split(' ');
    const total = text.replace(/ /g, '').length;
    let ci = 0;
    words.forEach((word, wi) => {
      const w = document.createElement('span');
      w.className = 'w';
      if (mode === 'rise') w.style.setProperty('--th', (wi / words.length * 0.5).toFixed(3));
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        if (mode === 'grid') {
          c.style.setProperty('--th', (ci / total * spread + r() * 0.06).toFixed(3));
          c.style.setProperty('--jx', (-(14 + r() * 16)).toFixed(1) + 'px');
        } else if (mode === 'scatter') {
          c.style.setProperty('--th', (r() * 0.55).toFixed(3));
          c.style.setProperty('--jx', ((r() - 0.5) * 84).toFixed(1) + 'px');
          c.style.setProperty('--jy', ((r() - 0.5) * 64).toFixed(1) + 'px');
          c.style.setProperty('--jr', ((r() - 0.5) * 52).toFixed(1) + 'deg');
        }
        w.appendChild(c);
        ci++;
      }
      vis.appendChild(w);
      if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
    el.append(sr, vis);
  }
  $$('.band .split').forEach(split);

  /* ================= hero: bands ================= */
  const hero = $('.hero');
  const stage = $('.stage');
  const video = $('.hero-video');
  const posterLayer = $('.poster');
  const ringFill = $('.ring-fill');
  const bands = $$('.band').map(el => ({
    el, a: Number(el.dataset.a), b: Number(el.dataset.b),
    ramp: el.dataset.ramp ? Number(el.dataset.ramp) : null,
    op: -1, k: -1, on: null
  }));

  let stickTop = 64, range = 1, rangeVh = 400;
  function measure() {
    stickTop = parseFloat(getComputedStyle(stage).top) || 0;
    range = Math.max(1, hero.offsetHeight - stage.offsetHeight);
    rangeVh = range / innerHeight * 100;
  }
  function heroProgress() {
    return clamp((stickTop - hero.getBoundingClientRect().top) / range, 0, 1);
  }

  let loadK = 0;
  let scrolledState = null;
  function updateCaptions(p) {
    const f0 = 20 / rangeVh;                       // ~20vh edge ramps, expressed in progress
    const last = bands.length - 1;
    bands.forEach((B, i) => {
      const f = Math.min(f0, (B.b - B.a) / 3);
      const inOp = i === 0 ? 1 : smoothstep(p, B.a, B.a + f);
      const outOp = i === last ? 1 : 1 - smoothstep(p, B.b - f, B.b);
      const op = Math.round(inOp * outOp * 1000) / 1000;
      const ramp = B.ramp ?? Math.min(22 / rangeVh, (B.b - B.a) * 0.35);
      let k = clamp((p - B.a) / ramp, 0, 1);
      if (i === 0) k = Math.max(k, loadK);         // band one opens assembled, then holds
      if (op !== B.op) { B.el.style.opacity = op; B.op = op; }
      if (Math.abs(k - B.k) > 0.008 || (k === 1 && B.k !== 1) || (k === 0 && B.k !== 0)) {
        B.el.style.setProperty('--k', k.toFixed(3));
        B.k = k;
      }
      const on = op > 0.5;
      if (on !== B.on) { B.el.classList.toggle('on', on); B.on = on; }
    });
    const scrolled = p > 0.03;
    if (scrolled !== scrolledState) { stage.classList.toggle('scrolled', scrolled); scrolledState = scrolled; }
  }

  /* ================= hero: locked seeks ================= */
  let seekBusy = false, pendingTime = null, videoReady = false;
  function requestSeek(t) {
    if (!videoReady || !video.duration) return;
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true;
    video.currentTime = t;
  }
  video.addEventListener('seeked', () => {
    seekBusy = false;
    if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); }
  });
  video.addEventListener('error', () => {
    seekBusy = false;
    pendingTime = null;
    if (!videoReady) failVideo();
  });

  /* ================= hero: the resting rAF loop ================= */
  let target = 0, shown = 0, rafId = null, lastTick = 0, heroOnScreen = true;
  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    shown += (target - shown) * (1 - Math.pow(1 - 0.16, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) {
      shown = target;
      rafId = null;
      lastTick = 0;
    } else {
      rafId = requestAnimationFrame(tick);
    }
    requestSeek(shown * (video.duration || 0));
    updateCaptions(shown);
  }
  function onScroll() {
    target = heroProgress();
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }
  new IntersectionObserver(es => {
    heroOnScreen = es[0].isIntersecting;
    if (heroOnScreen && scrubOn) onScroll();
  }).observe(hero);

  /* ================= hero: streamed blob with an honest ring ================= */
  let heroInit = false, fetchStarted = false;
  function initHeroOnce() {
    if (heroInit) return;
    heroInit = true;
    posterLayer.style.backgroundImage = `url('${POSTER_URL}')`;   // the poster wins the bandwidth race
    const img = new Image();
    img.onload = img.onerror = startBlobFetch;
    img.src = POSTER_URL;
    setTimeout(startBlobFetch, 4000);
  }
  function startBlobFetch() {
    if (fetchStarted) return;
    fetchStarted = true;
    loadHeroBlob().catch(failVideo);
  }
  async function loadHeroBlob() {
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error('video ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), 20000);
      chunks.push(value);
      got += value.length;
      const frac = Math.min(1, got / total);
      const now = performance.now();
      if (now - lastRing > 100 || frac === 1) {
        lastRing = now;
        ringFill.style.setProperty('--ld', Math.round(126 * (1 - frac)));
      }
    }
    clearTimeout(watchdog);
    ringFill.style.setProperty('--ld', 0);
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.load();
    video.addEventListener('canplay', () => {
      videoReady = true;
      requestSeek(heroProgress() * video.duration);
      stage.classList.add('video-ready');
    }, { once: true });
  }
  function failVideo() {
    if (stage.classList.contains('video-ready')) return;
    stage.classList.add('video-failed');          // the poster and captions carry the journey
  }

  /* ================= band one: one-time load ramp ================= */
  function runLoadRamp() {
    const t0 = performance.now(), dur = 1100;
    const step = now => {
      const t = clamp((now - t0) / dur, 0, 1);
      loadK = 1 - Math.pow(1 - t, 3);
      updateCaptions(shown);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ================= the five gates, decided live ================= */
  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  const MQLS = GATES.map(q => matchMedia(q));
  let scrubOn = false, rampDone = false;
  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    measure();
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(b => { b.op = -1; b.k = -1; b.on = null; });
    unpinFinalStates();
    if (!rampDone) { rampDone = true; runLoadRamp(); }
    target = shown = heroProgress();
    updateCaptions(shown);
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
  }
  function applyHeroMode() {
    if (MQLS.some(m => m.matches)) disableScrub();
    else enableScrub();
  }
  MQLS.forEach(m => m.addEventListener('change', applyHeroMode));
  addEventListener('resize', () => { if (scrubOn) { measure(); onScroll(); } }, { passive: true });

  /* ================= reveals and live sections ================= */
  const forced = new Set();
  function reveal(el) {
    el.classList.add('in');
    const n = el.querySelectorAll('[style*="--i"]').length + 1;
    setTimeout(() => el.classList.add('settled'), n * 95 + 1200);
  }
  const revealIO = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      forced.delete(e.target);
      reveal(e.target);
      revealIO.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  $$('[data-reveal]').forEach(el => revealIO.observe(el));

  const liveIO = new IntersectionObserver(es => {
    es.forEach(e => e.target.classList.toggle('live', e.isIntersecting));
  }, { rootMargin: '10% 0px' });
  $$('[data-live]').forEach(el => liveIO.observe(el));

  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('paused', document.hidden);
  });

  /* ================= the one interactive moment: hold to color ================= */
  const trySection = $('.try');
  const holdBtn = $('.hold-btn');
  const holdLabel = $('.hold-label');
  const colors = $('.hold-colors');
  let hp = 0, holding = false, holdRaf = null, holdLast = 0, holdDone = false, holdPinned = false, lastHp = -1;

  function writeHold() {
    const v = Math.round(hp * 1000) / 1000;
    if (v === lastHp) return;
    lastHp = v;
    colors.style.setProperty('--p', v);
    holdBtn.style.setProperty('--p', v);
  }
  function finishHold() {
    holdDone = true;
    holding = false;
    holdBtn.classList.remove('holding');
    holdBtn.setAttribute('aria-disabled', 'true');
    holdLabel.textContent = 'All colored in';
    trySection.classList.add('done');
  }
  function holdTick(now) {
    const dt = Math.min(100, now - (holdLast || now));
    holdLast = now;
    hp = holding ? Math.min(1, hp + dt / 1900) : Math.max(0, hp - dt / 1300);   // release drifts back, never snaps
    writeHold();
    if (hp >= 1 && !holdDone) finishHold();
    if (!holdDone && (holding || hp > 0)) holdRaf = requestAnimationFrame(holdTick);
    else { holdRaf = null; holdLast = 0; }
  }
  function startHold(e) {
    if (holdDone) return;
    if (e && e.pointerId !== undefined) {
      e.preventDefault();
      try { holdBtn.setPointerCapture(e.pointerId); } catch (_) {}
    }
    holding = true;
    holdBtn.classList.add('holding');
    if (holdRaf === null) holdRaf = requestAnimationFrame(holdTick);
  }
  function endHold() {
    if (!holding) return;
    holding = false;
    holdBtn.classList.remove('holding');
    if (holdRaf === null && !holdDone) holdRaf = requestAnimationFrame(holdTick);
  }
  holdBtn.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(t => holdBtn.addEventListener(t, endHold));
  holdBtn.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); }
  });
  holdBtn.addEventListener('keyup', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endHold(); }
  });
  holdBtn.addEventListener('contextmenu', e => e.preventDefault());

  /* ================= reduced motion, live in both directions ================= */
  function pinToFinalStates() {
    $$('[data-reveal]').forEach(el => {
      if (!el.classList.contains('in')) { forced.add(el); el.classList.add('in', 'settled'); revealIO.unobserve(el); }
    });
    if (!holdDone) {
      if (holdRaf !== null) { cancelAnimationFrame(holdRaf); holdRaf = null; holdLast = 0; }
      hp = 1;
      writeHold();
      finishHold();
      holdPinned = true;
    }
  }
  function unpinFinalStates() {
    forced.forEach(el => { el.classList.remove('in', 'settled'); revealIO.observe(el); });
    forced.clear();
    if (holdPinned) {
      holdPinned = false;
      holdDone = false;
      hp = 0;
      writeHold();
      holdBtn.removeAttribute('aria-disabled');
      holdLabel.textContent = 'Press and hold';
      trySection.classList.remove('done');
    }
  }
  RM.addEventListener('change', e => {
    if (e.matches) pinToFinalStates();
    else { unpinFinalStates(); applyHeroMode(); }
  });

  /* ================= start ================= */
  if (RM.matches) pinToFinalStates();
  applyHeroMode();
})();
