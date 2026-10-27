// The trailer, shot by shot. Every function here that takes (d, f, arg) runs in the page: `d` is the game's test hooks
// (window.__pinball), `f` the film's notes for the shot. Times are seconds of video.

/** The three machines as built for the trailer: a mid-run table each, with the parts that make the best pictures. */
const BUILDS = {
  factory: [
    ['tesla', 12, 44.6, 0, 9], ['pop', 8, 43.6], ['pop', 16, 43.6], ['pop', 12, 41], ['tesla', 4.6, 40.2, 0, 6],
    ['printer', 19.8, 39.6], ['coin', 18.6, 33.6], ['coin', 5.6, 35.4], ['lamp', 15.6, 29.6],
    ['uplight', 3.4, 25.4], ['uplight', 7.6, 27.6], ['spinner', 20.4, 24.9, 1.35], ['bank', 12, 22.4],
    ['sling', 4.4, 17.6, -1.05], ['sling', 19.6, 17.6, 1.05],
  ],
  diner: [
    ['lane', 8.4, 46.4], ['lane', 12, 46.8], ['lane', 15.6, 46.4], ['pop', 7, 43.2], ['pop', 17, 43.2], ['thunder', 12, 42.2],
    ['laser', 5.2, 33], ['golden', 18.6, 32.4], ['disco', 12, 27.6], ['sparkler', 16.4, 24.2], ['split', 7.6, 24.2],
    ['coin', 4, 27.6], ['coin', 20, 27.2], ['sling', 4.4, 17.6, -1.05], ['sling', 19.6, 17.6, 1.05], ['bank', 12, 21.4],
  ],
  castle: [
    ['keg', 7.4, 44.2], ['keg', 12, 45.6], ['keg', 16.6, 44.2], ['gong', 12, 41.6], ['firecracker', 4.6, 38.6],
    ['wreck', 19.4, 38.2], ['rocks', 5.4, 30.6], ['whale', 18.4, 30.2], ['pinata', 12, 27.4], ['pop', 8.4, 23.6], ['pop', 15.6, 23.6],
    ['sling', 4.4, 17.6, -1.05], ['sling', 19.6, 17.6, 1.05],
  ],
};

/**
 * Set a machine up: a new run on it, the build placed (as the Test Lab places: free), levels set, then (round) a
 * round started with the bot at the controls. Returns the parts that did not fit.
 */
function dress(d, f, arg) {
  const g = d.game;
  d.closeMenu();
  d.theme(arg.machine);
  document.body.classList.toggle('clean', !!arg.clean);
  d.camera(null);
  const missed = [];
  delete g.layout.ledge; // the wall ledge where it stands by default, not where this run happened to put it
  g.sandbox = true;
  for (const [id, x, y, a = 0, level] of arg.parts) {
    const p = g.grantAndPlace(id, x, y, a);
    if (!p) { missed.push([id, x, y]); continue; }
    if (level) p.level = level;
  }
  g.sandbox = false;
  for (const p of g.layout.parts) { delete p.fresh; delete p.loose; }
  g.toWorkshop();
  if (arg.round) { g.startRound(); d.autopilot(arg.seed ?? 7, arg.skill ?? 0.95); } else d.autopilot(null);
  d.refresh();
  f.mem = {};
  return missed;
}


/** A part of this build, without some of it (the parts the workshop shot puts on). */
const without = (parts, ...drop) => parts.filter((p) => !drop.some(([id, x, y]) => p[0] === id && p[1] === x && p[2] === y));
const TESLA = ['tesla', 12, 44.6], PRINTER = ['printer', 19.8, 39.6];

/**
 * Drop a ball in, anywhere, at any speed. Every ball has a number, so a take (tools/trailer/takes.json, found by
 * tools/trailer/search.cjs) can nudge it: arg.jit[n] is added to its x, y, vx, vy.
 */
let balls = 0;
const ball = (x, y, vx, vy) => {
  const n = balls++;
  return new Function('d', 'f', 'arg', `const j = (arg && arg.jit && arg.jit[${n}]) || [0, 0, 0, 0]; d.game.sim.addBall(${x} + j[0], ${y} + j[1], ${vx} + j[2], ${vy} + j[3]);`);
};
ball.count = () => balls;
/** A fixed camera that pushes in (or pulls out) a little over the shot. */
const push = (x, y, z0, z1, fy = 0.5) => `(d, f, s) => ({ x: ${x}, y: ${y}, zoom: f.lerp(${z0}, ${z1}, f.ease(s.u)), fy: ${fy} })`;

/**
 * The workshop shot's pointer: it picks an offer up in the shop, carries it over to a spot on the table and drops it.
 * `path`: [t, where, button] keys; where is an offer slot ({ slot }), a sim point ({ x, y }) or a selector ({ el }).
 */
function pointer(path) {
  return async (film, t) => {
    const where = async (w) => {
      if (w.el || w.slot !== undefined) {
        const sel = w.el ?? `#offers .offer[data-slot="${w.slot}"] .plinth`;
        // (an offer that has been bought is gone: it is where it was)
        film.boxes ??= {};
        const b = (await film.page.locator(sel).first().boundingBox()) ?? film.boxes[sel];
        film.boxes[sel] = b;
        return { x: b.x + b.width * (w.fx ?? 0.5), y: b.y + b.height * (w.fy ?? 0.5) };
      }
      return film.run((d, f, p) => d.toScreen(p.x, p.y), w);
    };
    let i = path.findIndex((k) => k[0] > t);
    if (i < 0) i = path.length;
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i)];
    const pa = await where(a[1]), pb = await where(b[1]);
    const u = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 1;
    const e = u * u * (3 - 2 * u);
    const at = { x: pa.x + (pb.x - pa.x) * e, y: pa.y + (pb.y - pa.y) * e - Math.sin(e * Math.PI) * 60 * (a[3] ?? 0) };
    const film_ = (film.ptr ??= { down: false });
    await film.page.mouse.move(at.x, at.y);
    // presses and releases land on their keys
    const key = path.find((k) => Math.abs(k[0] - t) < 0.5 / 30);
    if (key?.[2] === 'down' && !film_.down) { await film.page.mouse.down(); film_.down = true; }
    if (key?.[2] === 'up' && film_.down) { await film.page.mouse.up(); film_.down = false; }
    if (key?.[2] === 'click') { await film.page.mouse.down(); await film.page.mouse.up(); }
    await film.cursor({ ...at, down: film_.down });
  };
}

/** The workshop: the shop is stocked with what the shot needs and there is money to spend. */
function stock(d, f, arg) {
  const g = d.game;
  g.shop.offers = arg.offers;
  g.money = 34;
  d.refresh();
}

/**
 * The shots, in order. beats: how long, in quarter notes of the music (the cuts land on the beat); energy: how hard
 * the music drives under it (it glides there; `reset` jumps). machine/parts: the table; clean: no panels (false for the
 * workshop); pre: seconds played before the camera rolls; at: [t, fn] things that happen (t < 0: in the run-up);
 * cam: the camera each frame; text: words on screen.
 */
const SHOTS = [
  // ---- the cold open: the board, three machines, no words --------------------------------------------------------
  { id: 'A1', want: { 'hit:mega': 4, hit: 0.5 }, beats: 3, energy: 0.3, machine: 'factory', pre: 0, seed: 3,
    at: [[-0.1, ball(8.2, 41.5, 5, -2)], [0.9, ball(16.5, 41, -5, 2)]],
    cam: push(12, 35.4, 6.2, 7.0) },
  { id: 'A2', want: { hit: 1, bonus: 2 }, beats: 2, energy: 0.3, machine: 'diner', pre: 0, seed: 4,
    at: [[-0.25, ball(7.4, 47.6, 0.5, -6)], [-0.05, ball(16.6, 47.6, -0.5, -6)]],
    cam: push(12, 43.6, 4.4, 4.8) },
  { id: 'A3', want: { hit: 1, bonus: 2, spark: 0.5 }, beats: 2, energy: 0.3, machine: 'castle', pre: 0, seed: 5,
    at: [[-0.2, ball(16.6, 33.4, -1, -8)], [0.1, ball(10.5, 31, 2, -6)]],
    cam: push(13.6, 28.6, 4.2, 4.6) },
  { id: 'A4', want: { hit: 1, zap: 1, bonus: 2 }, beats: 2, energy: 0.3, machine: 'diner', pre: 7, seed: 9,
    cam: push(12.6, 27, 2.0, 2.3) },

  // ---- the workshop, with the panels: put a part on the table -------------------------------------------------------
  { id: 'B1', beats: 4, energy: 0.3, machine: 'factory', parts: without(BUILDS.factory, TESLA, PRINTER), clean: false, round: false, warm: 30,
    setup: stock, arg: { offers: ['tesla', 'printer', 'lamp', 'golden'] },
    ui: pointer([[0, { slot: 0, fx: 0.9, fy: 1.4 }], [0.35, { slot: 0 }, 'down'], [0.45, { slot: 0 }], [1.35, { x: 12, y: 44.6 }, null, 1], [1.5, { x: 12, y: 44.6 }, 'up'], [2.4, { x: 14.5, y: 40 }]]),
    text: { text: 'BUILD YOUR OWN<br>PINBALL MACHINE', from: 0.25, y: 0.8, size: 118, out: false } },
  { id: 'B2', beats: 3, energy: 0.3, machine: 'factory', parts: without(BUILDS.factory, PRINTER), clean: false, round: false, warm: 30,
    setup: stock, arg: { offers: [null, 'printer', 'lamp', 'golden'] },
    ui: pointer([[0, { x: 14.5, y: 40 }], [0.3, { slot: 1 }], [0.38, { slot: 1 }, 'down'], [0.45, { slot: 1 }], [1.2, { x: 19.8, y: 39.6 }, null, 1], [1.32, { x: 19.8, y: 39.6 }, 'up'], [1.75, { el: '#btnStart', fx: 0.4 }], [1.85, { el: '#btnStart', fx: 0.4 }, 'click']]),
    text: { text: 'BUILD YOUR OWN<br>PINBALL MACHINE', from: 0, age0: 5, y: 0.8, size: 118 } },

  // ---- test it -----------------------------------------------------------------------------------------------------
  { id: 'C1', want: { hit: 1 }, beats: 3, energy: 0.75, machine: 'factory', pre: 0, seed: 11,
    cam: `(d, f, s) => { const b = f.ball(d); const to = b && b.y > 9 ? { x: Math.min(22, b.x), y: b.y, zoom: 3.2 } : { x: 23.2, y: 8, zoom: 5 }; return { ...f.glide('c', to, 0.16), fy: 0.55 }; }`,
    text: { text: 'TEST IT.', from: 0.12, y: 0.5, size: 190 } },
  { id: 'C2', want: { zap: 3, 'hit:tesla': 2 }, beats: 2, energy: 0.75, machine: 'factory', pre: 0, seed: 12,
    at: [[-0.3, ball(13.3, 48.2, -2, -12)], [0.4, ball(10, 48.4, 2.5, -10)]],
    cam: push(11, 43.4, 4.8, 5.4) },
  { id: 'C3', want: { beam: 6, zap: 1 }, beats: 2, energy: 0.75, machine: 'diner', pre: 0, seed: 13,
    at: [[-0.3, ball(7.6, 37.4, -3, -9)]],
    cam: push(11, 32, 3.0, 3.3) },
  { id: 'C4', want: { grow: 8, hit: 0.5 }, window: [0.05, 0.4], beats: 2, energy: 0.75, machine: 'castle', pre: 0, seed: 14,
    at: [[-0.15, ball(19.2, 41.4, 0, -5)]],
    cam: `(d, f, s) => { const b = f.ball(d, { x: 19, y: 38 }); return { ...f.glide('c', b ? { x: b.x, y: b.y } : { x: 19, y: 38 }, 0.12), zoom: f.lerp(4.6, 3.8, s.u) }; }` },

  // ---- break it ----------------------------------------------------------------------------------------------------
  { id: 'D1', want: { extraBall: 10, 'hit:printer': 2 }, window: [0.2, 0.6], beats: 3, energy: 1, machine: 'factory', pre: 0, seed: 15,
    at: [[-0.2, ball(19.8, 42.4, 0, -4)]],
    cam: push(17, 39, 4.6, 3.4),
    text: { text: 'BREAK IT.', from: 0.55, y: 0.76, size: 190 } },
  { id: 'D2', want: { 'hit:mega': 4, hit: 0.3 }, beats: 2, energy: 1, machine: 'factory', pre: 0, seed: 16,
    at: [[-0.2, ball(7.8, 40.5, 4, -1)], [-0.1, ball(16.4, 40, -4, -1)], [0, (d) => d.mood('shocked', 0.7)], [0.25, ball(12, 41.5, 1, 3)]],
    cam: push(12, 35.4, 7.4, 8.0) },
  { id: 'D3', want: { blast: 6, zap: 1 }, beats: 3, energy: 1, machine: 'castle', pre: 0, seed: 17,
    at: [[-2.3, ball(7.4, 47, 0, -10)], [-2.0, ball(12, 48.6, 0, -10)], [-1.7, ball(16.6, 47, 0, -10)]],
    cam: push(12, 43.4, 3.8, 3.4) },
  { id: 'D4', want: { spark: 1, hit: 1, bonus: 2 }, beats: 2, energy: 1, machine: 'diner', pre: 0, seed: 18,
    at: [[-0.3, ball(7.6, 27, 0, -6)], [-0.2, ball(16.4, 27, 0, -8)], [0.2, ball(12, 31, 0, -6)]],
    cam: push(12, 25.6, 3.8, 4.2) },

  // ---- go big ------------------------------------------------------------------------------------------------------
  { id: 'E1', want: { 'hit:mega': 4, hit: 0.3 }, beats: 3, energy: 1, machine: 'castle', pre: 1, seed: 21,
    at: [[-0.5, (d) => d.mood('cool', 10)], [-0.2, ball(8, 41, 4, -1)], [0.4, ball(16, 41, -4, -1)]],
    cam: push(12, 35.4, 6.4, 7.2),
    text: { text: 'GO BIG.', from: 0.25, y: 0.8, size: 220 } },

  // ---- the title: the main menu's title over the attract table, no menu -----------------------------------------
  { id: 'F1', beats: 7, energy: 0, reset: true, title: true, warm: 2,
    setup: (d) => {
      d.theme('factory');
      document.body.classList.remove('clean');
      document.body.classList.add('filmEnd');
      d.camera(null);
      d.openMenu();
      d.demo(2.5); // the demo ball is already in play
    } },
];

/**
 * The cut list against the music: the factory tune's steps (eighth notes) walked the way AudioFx.scheduleMusic walks
 * them (the tempo rises with the energy, which glides towards each shot's), so every cut lands on a beat. Frame
 * counts come from the rounded cut times, so the picture never drifts from the sound.
 */
function timeline() {
  const BPM = 78;
  let t = 0, energy = SHOTS[0].energy, step = 0;
  const shots = [], steps = [];
  for (const s of SHOTS) {
    if (s.reset) energy = s.energy;
    const start = t, first = step;
    for (let k = 0; k < s.beats * 2; k++) {
      steps.push({ t, target: s.energy, reset: k === 0 && !!s.reset });
      t += 60 / (BPM * (1 + 0.32 * energy)) / 2;
      step++;
      const dlt = s.energy - energy;
      energy = Math.abs(dlt) < 0.01 ? s.energy : energy + dlt * (dlt > 0 ? 0.09 : 0.05);
    }
    const parts = s.parts ?? BUILDS[s.machine];
    shots.push({ ...s, parts, start, firstStep: first, frames: Math.round(t * 30) - Math.round(start * 30), dur: (Math.round(t * 30) - Math.round(start * 30)) / 30 });
  }
  return { shots, steps, length: t };
}

/** The balls a shot drops (their numbers, from the ball() functions in its events), in the order it drops them. */
const ballsOf = (shot) => [...new Set((shot.at ?? []).flatMap(([, fn]) => [...fn.toString().matchAll(/arg\.jit\[(\d+)\]/g)].map((m) => Number(m[1]))))];

/** A take's nudges (one per ball, in the order the shot drops them) as arg.jit, by ball number. */
const jitOf = (shot, take) => Object.fromEntries(ballsOf(shot).map((n, k) => [n, take?.nudges?.[k] ?? [0, 0, 0, 0]]));

module.exports = { BUILDS, SHOTS, dress, timeline, ballsOf, jitOf };
