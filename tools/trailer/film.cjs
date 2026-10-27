// The film crew: opens the game in trailer mode (?trailer) in headless Chromium and films it frame by frame.
// Used by tools/trailer/record.cjs; the shots themselves are in tools/trailer/shots.cjs.
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const W = 1920, H = 1080, FPS = 30;

/** The dev server, in this process, with reloading off (an edit while filming must not reload the page). */
async function startServer(port = 5199) {
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
  await server.listen();
  return { url: server.resolvedUrls.local[0], stop: () => server.close() };
}

/** What the film adds to the page: a clean view (no panels), the words, and a pointer (headless shows none). */
const FILM_CSS = `
body.clean #left, body.clean #right, body.clean #keys, body.clean #touch, body.clean #btnPause, body.clean #inspect, body.clean #tip,
body.clean #upgradeBox, body.clean #overlay, body.clean #fxOverlay, body.film #tip { display: none !important; }
body.clean #app { display: block !important; padding: 0 !important; height: 100vh !important; }
body.clean #center { height: 100vh !important; padding: 0 !important; }
#filmText { position: fixed; inset: 0; z-index: 90; pointer-events: none; }
#filmText .ft { position: absolute; left: 50%; font-family: var(--display); font-weight: 400; color: var(--paper); -webkit-text-stroke: 16px var(--ink);
  paint-order: stroke fill; text-shadow: 9px 10px 0 var(--drop); line-height: .92; text-align: center; white-space: pre; letter-spacing: .01em; }
#filmText .ft small { display: block; font-size: .42em; -webkit-text-stroke-width: 9px; text-shadow: 5px 6px 0 var(--drop); margin-bottom: .18em; }
#filmText .ft.tag { color: var(--paper); background: var(--accent); -webkit-text-stroke: 0; text-shadow: none; border: 6px solid var(--ink); border-radius: 18px;
  box-shadow: 7px 8px 0 var(--drop); padding: .2em .55em .08em; }
#filmCursor { position: fixed; z-index: 95; left: 0; top: 0; width: 44px; height: 52px; pointer-events: none; display: none; filter: drop-shadow(3px 4px 0 rgba(0,0,0,.25)); }
/* the end: the main menu's title over the attract table, without the menu */
body.filmEnd #menu .mpanel, body.filmEnd #menu .mfoot { display: none !important; }
body.filmEnd #menu .mcol { transform: translateX(-80px) scale(1.5); transform-origin: 100% 50%; }
`;
const CURSOR_SVG = `<svg viewBox="0 0 44 52" width="44" height="52"><path d="M4 3 L4 40 L14 31 L21 47 L28 44 L21 28 L35 28 Z" fill="#fffaf0" stroke="#2b1d3a" stroke-width="4" stroke-linejoin="round"/></svg>`;

class Film {
  constructor(page, opts) { this.page = page; this.opts = opts; }

  static async open(url, opts = {}) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url + '?trailer');
    await page.waitForSelector('#menu .mbtn');
    await page.addStyleTag({ content: FILM_CSS });
    await page.evaluate((svg) => {
      document.body.insertAdjacentHTML('beforeend', `<div id="filmText"></div><div id="filmCursor">${svg}</div>`);
      // the film's notes: per-shot memory, and the camera's little helpers
      document.body.classList.add('film');
      window.__film = {
        mem: {},
        ease: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)),
        lerp: (a, b, u) => a + (b - a) * u,
        /** A camera that glides after a target: k is how much of the way it closes each frame. */
        glide(key, to, k) {
          const m = (this.mem[key] ??= { ...to });
          for (const q of Object.keys(to)) m[q] += (to[q] - m[q]) * k;
          return { ...m };
        },
        /** The ball nearest a point (or the highest one), as the sim has it. */
        ball(d, near) {
          const bs = d.game.sim.ballStates().filter((b) => !b.inLane || !near);
          if (!bs.length) return null;
          return near ? bs.reduce((a, b) => (Math.hypot(b.x - near.x, b.y - near.y) < Math.hypot(a.x - near.x, a.y - near.y) ? b : a)) : bs.reduce((a, b) => (b.y > a.y ? b : a));
        },
      };
      // run a shot's code in the page: `d` is the game's test hooks, `f` the film's own notes
      window.__run = (src, arg) => new Function('d', 'f', 'arg', `return (${src})(d, f, arg)`)(window.__pinball, window.__film, arg);
    }, CURSOR_SVG);
    const film = new Film(page, opts);
    film.browser = browser;
    film.errors = errors;
    return film;
  }

  /** Run a function (its source) in the page with the game's hooks. */
  run(fn, arg) { return this.page.evaluate(([src, a]) => window.__run(src, a), [fn.toString(), arg ?? null]); }

  close() { return this.browser.close(); }

  /**
   * Every CSS animation and transition runs on the film's clock: each one is paused when it first shows up and set to
   * how long it has been alive in video time, so the panels animate at the same speed as the table.
   */
  syncAnimations(t) {
    return this.page.evaluate((now) => {
      for (const a of document.getAnimations()) {
        if (a.__born === undefined) { a.__born = now; a.pause(); }
        a.currentTime = (now - a.__born) * 1000;
      }
    }, t);
  }

  /** The words on screen this frame (null: none). */
  text(spec, t) {
    return this.page.evaluate(([s, now]) => {
      const box = document.getElementById('filmText');
      if (!s) { box.innerHTML = ''; delete box.dataset.key; return; }
      const key = JSON.stringify([s.text, s.size, s.y, s.tag]);
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = `<div class="ft ${s.tag ? 'tag' : ''}" style="font-size:${s.size ?? 150}px;top:${(s.y ?? 0.5) * 100}%">${s.text}</div>`;
      }
      // it slams in like a rubber stamp, sits with a little bob, and pops out at the end
      const el = box.firstElementChild, age = now - s.from + (s.age0 ?? 0), left = s.out === false ? 1 : s.to - now;
      const a = Math.min(1, age / 0.2);
      const slam = a < 1 ? 1 + 0.9 * (1 - a) * (1 - a) - 0.1 * Math.sin(a * Math.PI) : 1;
      const out = left < 0.12 ? Math.max(0, left / 0.12) : 1;
      const rot = (s.rot ?? -4) + Math.sin(age * 3) * 0.6;
      el.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(${slam * (0.6 + 0.4 * out)})`;
      el.style.opacity = String(Math.min(1, a * 3) * out);
    }, [spec, t]);
  }

  cursor(at) {
    return this.page.evaluate((p) => {
      const c = document.getElementById('filmCursor');
      c.style.display = p ? 'block' : 'none';
      if (p) c.style.transform = `translate(${p.x - 4}px, ${p.y - 3}px) scale(${p.down ? 0.88 : 1})`;
    }, at);
  }
}

module.exports = { Film, startServer, W, H, FPS, ROOT };
