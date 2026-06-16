/* MBLabs.pro motion + interaction engine.
 * A clean TypeScript port of the design prototype's runtime: scroll-driven FX, IO reveals,
 * a live hero data-network canvas, custom cursor / magnetic / 3D-tilt, scroll-velocity marquees —
 * plus the parts the x-dc runtime gave us for free: hover/focus styles, EN/NL i18n, accent swatches,
 * and the client-side mailto contact form. No inline JS anywhere, so a strict CSP can ban it. */

import i18n from '../generated/i18n.json';

type Lang = 'en' | 'nl';
type Dict = Record<string, string>;
const DICT = i18n as { en: Dict; nl: Dict };

const W = window;
const D = document;
const reduceMotion = W.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const finePointer = !(W.matchMedia && W.matchMedia('(pointer:coarse)').matches);

const num = (el: HTMLElement, p: string, d: number): number => {
  const v = el.style.getPropertyValue(p);
  const n = v ? parseFloat(v) : NaN;
  return isNaN(n) ? d : n;
};
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const root = D.getElementById('mb-root');
const accentOf = (): string => {
  const v = root ? getComputedStyle(root).getPropertyValue('--mb-accent').trim() : '';
  return v || '#ffffff';
};

/* ----------------------------------------------------------------- scroll-driven layer */
type FX =
  | { el: HTMLElement; type: 'parallax' | 'paracx'; speed: number }
  | { el: HTMLElement; type: 'sweep'; dir: number }
  | { el: HTMLElement; type: 'progress' | 'herofade' }
  | { el: HTMLElement; type: 'bloom'; max: number };

let fxList: FX[] = [];
let marquees: HTMLElement[] = [];
let collected = false;

function collect(): void {
  fxList = [];
  marquees = [];
  D.querySelectorAll<HTMLElement>('#mb-root *').forEach((el) => {
    const t = el.style.getPropertyValue('--mb').trim();
    if (t === 'parallax' || t === 'paracx') fxList.push({ el, type: t, speed: num(el, '--mb-speed', -0.12) });
    else if (t === 'sweep') fxList.push({ el, type: 'sweep', dir: num(el, '--mb-dir', 1) });
    else if (t === 'progress' || t === 'herofade') fxList.push({ el, type: t });
    else if (t === 'bloom') fxList.push({ el, type: 'bloom', max: num(el, '--mb-max', 0.5) });
    else if (t === 'marquee') marquees.push(el);
  });
  collected = true;
}

function scrollFX(): void {
  if (!collected) collect();
  const vh = W.innerHeight;
  const doc = D.scrollingElement || D.documentElement;
  const sy = doc.scrollTop;
  const sh = doc.scrollHeight;
  for (const it of fxList) {
    const r = it.el.getBoundingClientRect();
    if (it.type === 'progress') {
      it.el.style.transform = `scaleX(${clamp(sy / Math.max(sh - vh, 1), 0, 1)})`;
    } else if (it.type === 'herofade') {
      const hp = clamp(sy / (vh * 0.85), 0, 1);
      it.el.style.opacity = String(1 - hp * 0.85);
      it.el.style.transform = `translateY(${-hp * 42}px)`;
    } else if (it.type === 'parallax') {
      const co = r.top + r.height / 2 - vh / 2;
      it.el.style.transform = `translateY(${co * it.speed}px)`;
    } else if (it.type === 'paracx') {
      const c2 = r.top + r.height / 2 - vh / 2;
      it.el.style.transform = `translate(-50%,-50%) translateY(${c2 * it.speed}px)`;
    } else if (it.type === 'sweep') {
      const pr = clamp((vh - r.top) / (vh + r.height), 0, 1);
      it.el.style.transform = `translateX(${(pr - 0.5) * 2 * 14 * it.dir}%)`;
    } else if (it.type === 'bloom') {
      const bc = r.top + r.height / 2;
      const bd = Math.abs(bc - vh / 2) / vh;
      let bp = clamp(1 - bd * 1.25, 0, 1);
      bp = bp * bp;
      it.el.style.opacity = (bp * it.max).toFixed(3);
      it.el.style.transform = `translate(-50%,-50%) scale(${(0.9 + 0.1 * bp).toFixed(3)})`;
    }
  }
}

/* ------------------------------------------------------------------------- IO reveals */
function setupReveals(): void {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target as HTMLElement;
        const t = el.style.getPropertyValue('--mb').trim();
        const dl = el.style.getPropertyValue('--mb-delay').trim();
        const d = dl ? ' ' + dl : '';
        if (t === 'hi') {
          el.style.transformOrigin = 'left';
          el.style.animation = `mbEnterHi .7s cubic-bezier(.6,0,.2,1)${d} both`;
        } else if (t === 'line') {
          el.style.transformOrigin = 'left';
          el.style.animation = 'mbEnterLine 1.1s cubic-bezier(.6,0,.2,1) .2s both';
        } else {
          el.style.animation = `mbEnter .85s cubic-bezier(.2,.7,.2,1)${d} both`;
          el.addEventListener('animationend', function (this: HTMLElement) { this.style.animation = ''; }, { once: true });
        }
        io.unobserve(el);
      });
    },
    { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0 },
  );
  D.querySelectorAll<HTMLElement>('#mb-root *').forEach((el) => {
    const t = el.style.getPropertyValue('--mb').trim();
    if (t === 'reveal' || t === 'hi' || t === 'line') io.observe(el);
  });
}

/* --------------------------------------------------------- hero data-network canvas */
interface Node { x: number; y: number; vx: number; vy: number; }
interface Packet { a: number; b: number; t: number; spd: number; }
const cv = D.querySelector<HTMLCanvasElement>('canvas[data-mb-net]');
let ctx: CanvasRenderingContext2D | null = null;
let nodes: Node[] = [];
let packets: Packet[] = [];
const mouse = { x: -999, y: -999 };
const dpr = Math.min(W.devicePixelRatio || 1, 2);

function initNet(): void {
  if (!cv) return;
  ctx = cv.getContext('2d');
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, r.width * dpr);
  cv.height = Math.max(1, r.height * dpr);
  const count = Math.max(26, Math.min(64, Math.floor((r.width * r.height) / 17000)));
  nodes = Array.from({ length: count }, () => ({
    x: Math.random() * r.width, y: Math.random() * r.height,
    vx: (Math.random() - 0.5) * 0.34, vy: (Math.random() - 0.5) * 0.34,
  }));
  packets = Array.from({ length: 7 }, () => ({
    a: Math.floor(Math.random() * count), b: Math.floor(Math.random() * count),
    t: Math.random(), spd: 0.004 + Math.random() * 0.007,
  }));
}

function netStep(): void {
  if (!ctx || !cv) return;
  const r = cv.getBoundingClientRect();
  const w = r.width, h = r.height;
  if (!w || !h) return;
  const accent = accentOf();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const maxD = Math.min(150, w / 6.5);
  for (const n of nodes) {
    n.x += n.vx; n.y += n.vy;
    if (n.x < 0 || n.x > w) n.vx *= -1;
    if (n.y < 0 || n.y > h) n.vy *= -1;
    const dxm = n.x - mouse.x, dym = n.y - mouse.y, dm = Math.sqrt(dxm * dxm + dym * dym);
    if (dm < 130 && dm > 0) { n.x += (dxm / dm) * (130 - dm) * 0.025; n.y += (dym / dm) * (130 - dm) * 0.025; }
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!, b = nodes[j]!, dx = a.x - b.x, dy = a.y - b.y, dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < maxD) {
        ctx.strokeStyle = `rgba(255,255,255,${(0.16 * (1 - dd / maxD)).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (const n of nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, 1.5, 0, 6.2832); ctx.fill(); }
  ctx.fillStyle = accent; ctx.shadowColor = accent;
  for (const pk of packets) {
    const na = nodes[pk.a], nb = nodes[pk.b];
    if (!na || !nb) { pk.a = Math.floor(Math.random() * nodes.length); pk.b = Math.floor(Math.random() * nodes.length); continue; }
    pk.t += pk.spd;
    if (pk.t >= 1) { pk.t = 0; pk.a = Math.floor(Math.random() * nodes.length); pk.b = Math.floor(Math.random() * nodes.length); }
    const px = na.x + (nb.x - na.x) * pk.t, py = na.y + (nb.y - na.y) * pk.t;
    ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, 6.2832); ctx.fill();
  }
  ctx.shadowBlur = 0;
}

/* -------------------------------------------------- cursor / magnetic / tilt (fine only) */
let magnets: HTMLElement[] = [];
let tilts: HTMLElement[] = [];
let cur: HTMLElement | null = null;
let dot: HTMLElement | null = null;
let cx = 0, cy = 0, tx = 0, ty = 0, curShown = false;

function collectX(): void {
  magnets = []; tilts = [];
  D.querySelectorAll<HTMLElement>('#mb-root *').forEach((el) => {
    const t = el.style.getPropertyValue('--mbx').trim();
    if (t === 'magnetic') magnets.push(el);
    else if (t === 'tilt') tilts.push(el);
  });
}

function initCursor(): void {
  if (!finePointer) return;
  const accent = accentOf();
  cur = D.createElement('div');
  cur.style.cssText =
    'position:fixed;left:0;top:0;width:36px;height:36px;border:1.5px solid ' + accent +
    ';border-radius:50%;pointer-events:none;z-index:99998;opacity:0;transition:width .22s,height .22s,opacity .3s,background .22s;will-change:transform;';
  dot = D.createElement('div');
  dot.style.cssText =
    'position:fixed;left:0;top:0;width:6px;height:6px;border-radius:50%;background:' + accent +
    ';pointer-events:none;z-index:99999;opacity:0;transition:opacity .3s;will-change:transform;';
  D.body.appendChild(cur); D.body.appendChild(dot);
  root?.classList.add('mb-cursor-on');
  D.addEventListener('mouseover', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('a,button,[data-mbx],input,textarea')) {
      cur!.style.width = '58px'; cur!.style.height = '58px'; cur!.style.background = 'rgba(255,255,255,0.10)';
    } else {
      cur!.style.width = '36px'; cur!.style.height = '36px'; cur!.style.background = 'transparent';
    }
  });
}

function onMove(e: MouseEvent): void {
  const mx = e.clientX, my = e.clientY;
  tx = mx; ty = my;
  if (cur && dot && !curShown) { cur.style.opacity = '1'; dot.style.opacity = '1'; curShown = true; }
  if (cv) { const rr = cv.getBoundingClientRect(); mouse.x = mx - rr.left; mouse.y = my - rr.top; }
  for (const el of magnets) {
    const r = el.getBoundingClientRect(), ax = r.left + r.width / 2, ay = r.top + r.height / 2;
    const dx = mx - ax, dy = my - ay, dd = Math.sqrt(dx * dx + dy * dy);
    el.style.transform = dd < 170 ? `translate(${(dx * 0.3).toFixed(1)}px,${(dy * 0.3).toFixed(1)}px)` : 'translate(0,0)';
  }
  for (const t2 of tilts) {
    const r2 = t2.getBoundingClientRect();
    if (mx >= r2.left && mx <= r2.right && my >= r2.top && my <= r2.bottom) {
      const rx = (my - r2.top) / r2.height - 0.5, ry = (mx - r2.left) / r2.width - 0.5;
      t2.style.transform = `perspective(820px) rotateX(${(-rx * 8).toFixed(2)}deg) rotateY(${(ry * 8).toFixed(2)}deg) translateY(-6px)`;
    } else if (t2.style.transform) {
      t2.style.transform = '';
    }
  }
}

/* ----------------------------------------------------------------- marquee velocity */
let lastSy = 0, vel = 0, marqRate = 1;
function marqueeStep(): void {
  const target = 1 + clamp(Math.abs(vel) * 0.05, 0, 5);
  marqRate += (target - marqRate) * 0.12;
  vel *= 0.82;
  for (const m of marquees) {
    try { m.getAnimations().forEach((a) => { (a as Animation).playbackRate = marqRate; }); } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------- hover / focus styles */
function declarations(css: string): [string, string][] {
  return css.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
  }).filter(([p]) => p);
}
function bindStateStyles(): void {
  D.querySelectorAll<HTMLElement>('#mb-root [data-hover]').forEach((el) => {
    const decls = declarations(el.getAttribute('data-hover') || '');
    const saved = new Map<string, string>();
    const enter = () => { saved.clear(); for (const [p, v] of decls) { saved.set(p, el.style.getPropertyValue(p)); el.style.setProperty(p, v); } };
    const leave = () => { for (const [p] of decls) { const s = saved.get(p); if (s) el.style.setProperty(p, s); else el.style.removeProperty(p); } };
    el.addEventListener('mouseenter', enter); el.addEventListener('mouseleave', leave);
    el.addEventListener('focus', enter); el.addEventListener('blur', leave);
  });
  D.querySelectorAll<HTMLElement>('#mb-root [data-focus]').forEach((el) => {
    const decls = declarations(el.getAttribute('data-focus') || '');
    const saved = new Map<string, string>();
    el.addEventListener('focus', () => { saved.clear(); for (const [p, v] of decls) { saved.set(p, el.style.getPropertyValue(p)); el.style.setProperty(p, v); } });
    el.addEventListener('blur', () => { for (const [p] of decls) { const s = saved.get(p); if (s) el.style.setProperty(p, s); else el.style.removeProperty(p); } });
  });
}

/* --------------------------------------------------------------------- i18n toggle */
function applyLang(lang: Lang): void {
  const d = DICT[lang];
  D.querySelectorAll<HTMLElement>('#mb-root [data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n')!;
    if (k in d) el.textContent = d[k]!;
  });
  D.documentElement.lang = lang;
  try { localStorage.setItem('mb-lang', lang); } catch { /* ignore */ }
}
function initLang(): void {
  let lang: Lang = 'en';
  try { const s = localStorage.getItem('mb-lang'); if (s === 'nl' || s === 'en') lang = s; } catch { /* ignore */ }
  if (lang !== 'en') applyLang(lang);
  D.querySelectorAll<HTMLElement>('[data-mb-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lang = lang === 'en' ? 'nl' : 'en';
      applyLang(lang);
    });
  });
}

/* ------------------------------------------------------------------ accent swatches */
function initAccent(): void {
  if (!root) return;
  const btns = D.querySelectorAll<HTMLButtonElement>('[data-accent]');
  const set = (hex: string) => {
    root.style.setProperty('--mb-accent', hex);
    if (cur) cur.style.borderColor = hex;
    if (dot) dot.style.background = hex;
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.accent === hex)));
  };
  btns.forEach((b) => b.addEventListener('click', () => set(b.dataset.accent || '#FFFFFF')));
}

/* ---------------------------------------------------------------- contact -> mailto */
function initForm(): void {
  D.querySelectorAll<HTMLFormElement>('[data-mb-form]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const el = f.elements as HTMLFormControlsCollection & Record<string, HTMLInputElement | HTMLTextAreaElement>;
      const name = (el['cname']?.value || '').trim();
      const email = (el['cemail']?.value || '').trim();
      const msg = (el['cmsg']?.value || '').trim();
      const subject = encodeURIComponent('Project inquiry — ' + (name || 'MBLabs'));
      const body = encodeURIComponent(msg + '\n\n— ' + name + (email ? ' (' + email + ')' : ''));
      W.location.href = `mailto:michael.bracke@mblabs.pro?subject=${subject}&body=${body}`;
    });
  });
}

/* ----------------------------------------------------------------------- main loop */
function tick(): void {
  scrollFX();
  if (!reduceMotion) netStep();
  marqueeStep();
  if (cur && dot) {
    cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
    cur.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) translate(-50%,-50%)`;
    dot.style.transform = `translate(${tx}px,${ty}px) translate(-50%,-50%)`;
  }
  W.requestAnimationFrame(tick);
}

function start(): void {
  if ((W as unknown as { __mbEngine?: boolean }).__mbEngine) return;
  (W as unknown as { __mbEngine?: boolean }).__mbEngine = true;

  collect();
  setupReveals();
  collectX();
  bindStateStyles();
  initLang();
  initAccent();
  initForm();
  if (!reduceMotion) { initNet(); initCursor(); }

  W.addEventListener('mousemove', onMove, { passive: true });
  W.addEventListener('scroll', () => {
    const sy = (D.scrollingElement || D.documentElement).scrollTop;
    vel = sy - lastSy; lastSy = sy; scrollFX();
  }, { passive: true });
  W.addEventListener('resize', () => { collected = false; collectX(); initNet(); scrollFX(); });

  scrollFX();
  W.requestAnimationFrame(tick);
}

if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start);
else start();
