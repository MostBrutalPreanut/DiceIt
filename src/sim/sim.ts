import * as B from 'phaser-box2d/dist/PhaserBox2D.js';
import { dialValue, PARTS, SMALL_FLIPPER, triPoints, type PartInstance } from '../data/parts';
import {
  BALL_R, BALL_SEARCH_AFTER, BALL_SPAWN, BALL_TIMEOUT, DT, FLIPPER_LENGTH, FLIPPER_REST,
  FLIPPER_SPEED_DOWN, FLIPPER_SPEED_UP, FLIPPER_TORQUE, FLIPPER_UP, LANE_FLOOR_Y, LANE_TOP_Y,
  LANE_WALL_X, MAX_BALL_SPEED, MAX_BALLS, NUDGE_SPEED, NUDGE_TILT, PLUNGE_CHARGE_TIME, PLUNGE_DRIFT,
  PLUNGE_MAX, PLUNGE_MIN, PLUNGE_NOISE, SAVER_WINDOW, SUBSTEPS, TABLE_H, TABLE_W, TILT_DECAY, WALL_RESTITUTION,
} from './constants';
import { neutralMods, simModsOf, type SimMods } from '../data/mods';
import { cloneLayout, type Layout } from './layout';
import { Rng } from './rng';
import { FLIPPER_PIVOTS, TABLE_POSTS, tableSegments } from './table';

/** What the player is doing this tick. `nudge` is a one-tick pulse: -1 left, 1 right, 0 none. */
export interface Input {
  left: boolean;
  right: boolean;
  plunge: boolean;
  nudge: number;
}
export const NO_INPUT: Input = { left: false, right: false, plunge: false, nudge: 0 };

/** Physical things that happened. Scoring and presentation both consume this stream; neither feeds back. */
export type SimEvent =
  | { type: 'partHit'; t: number; uid: number; ballId: number; x: number; y: number; speed: number; spins?: number; caught?: boolean; index?: number; bankComplete?: boolean; kicked?: boolean; mover?: boolean; edge?: boolean; goal?: boolean }
  | { type: 'partRelease'; t: number; uid: number; ballId: number }
  | { type: 'extraBall'; t: number; uid: number; ballId: number }
  | { type: 'ballSaved'; t: number; uid: number; ballId: number }
  | { type: 'launch'; t: number; ballId: number; power: number }
  | { type: 'drain'; t: number; ballId: number; reason: 'drain' | 'timeout' }
  | { type: 'ballSpawn'; t: number; ballId: number }
  | { type: 'flipper'; t: number; side: 'L' | 'R'; on: boolean }
  | { type: 'nudge'; t: number; dir: number; tilt: number }
  | { type: 'tilt'; t: number }
  | { type: 'ballSearch'; t: number; ballId: number }
  | { type: 'rescue'; t: number; ballId: number };

export interface BallState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  inLane: boolean;
  held: boolean;
}

export interface FlipperState {
  x: number;
  y: number;
  angle: number;
  side: 'L' | 'R';
  pivotX: number;
  pivotY: number;
  uid?: number;
  /** The bat's length (extra flippers are shorter than the two at the bottom). */
  length: number;
}

type Local = { lx: number; ly: number };
interface BallRef {
  id: number;
  body: any;
  age: number;
  slowTime: number;
  prevLocal: Map<number, Local>;
  held: { uid: number; until: number } | null;
  /** Sim time until which a drain of this ball is saved (set when the plunger launches it; 0 = not saveable). */
  saveUntil: number;
  /** Speed just before the last step: the impact speed, since the contact has already bounced it by the time we see it. */
  preSpeed: number;
}
interface FlipperRef {
  fid: number;
  side: 'L' | 'R';
  sign: 1 | -1;
  body: any;
  joint: any;
  pivotX: number;
  pivotY: number;
  on: boolean;
  uid?: number;
  length: number;
}
interface BankState {
  shapes: any[];
  /** true = that target is knocked down */
  down: boolean[];
  /** tick at which the whole bank pops back up, once all three are down */
  resetAt: number | null;
}
interface PartRef {
  inst: PartInstance;
  body: any;
  flipper?: FlipperRef;
  bank?: BankState;
  /** Kickbacks only: ready to fire (it recharges a few seconds after each kick). */
  armed?: boolean;
  /** Kickbacks only: the sim time it is ready again. */
  readyAt?: number;
  /** The sliding piece (duck, goalie, roller): its kinematic body, where it is along its rail, and how fast it goes. */
  mover?: { body: any; dir: 1 | -1; speedX: number };
}

/** The three drop targets of a bank, as offsets along the part's long axis. */
const BANK_OFFSETS = [-1.75, 0, 1.75];
const BANK_HALF = { hw: 0.8, hh: 0.38 };
const BANK_RESET_AFTER = 0.8;

export interface SimOptions {
  dt?: number;
  substeps?: number;
  seed?: number;
  /** Safety net: pop a ball back above a flipper if it ever crosses through it. Default on. */
  rescue?: boolean;
  /** The run's upgrades that change the ball and the physics (neutral if absent). */
  mods?: Partial<SimMods>;
  /** Seconds a ball may last after its first launch, however many balls it turns into. Default BALL_TIMEOUT. */
  ballClock?: number;
}

const simMods = (m?: Partial<SimMods>): SimMods => ({ ...simModsOf(neutralMods()), ...m });

const V = (x: number, y: number) => new B.b2Vec2(x, y);

/**
 * The deterministic pinball simulation. It owns the Box2D world and nothing about
 * scoring, money or rendering. It can run headless in Node.
 */
export class Sim {
  dt: number;
  substeps: number;
  tick = 0;
  events: SimEvent[] = [];
  tiltMeter = 0;
  tilted = false;
  plungeCharge = 0;
  awaitingPlunge = false;
  rescues = 0;

  private worldId: any;
  private ground: any;
  private balls: BallRef[] = [];
  private parts = new Map<number, PartRef>();
  private flippers: FlipperRef[] = [];
  private nextBallId = 1;
  private nextFlipperId = 1;
  private rng: Rng;
  private plungeWasHeld = false;
  private nudgeCooldown = 0;
  private rescueOn = true;
  private mods: SimMods = simMods();
  private ballClock = BALL_TIMEOUT;
  /** When the current ball was first launched (null until it is). The clock runs for the whole ball, so a Ball Printer cannot keep it alive forever by printing fresh balls. */
  private clockStart: number | null = null;
  /** Balls the printers have printed in the current ball. */
  private printed = 0;
  private sideOn = { L: false, R: false };
  /** Ball Savers already spent on the current ball. */
  private saversUsed = new Set<number>();
  /** Safety Net saves (no part needed) already spent on the current ball. */
  private netsUsed = 0;

  constructor(layout: Layout, opts: SimOptions = {}) {
    this.dt = opts.dt ?? DT;
    this.substeps = opts.substeps ?? SUBSTEPS;
    this.rng = new Rng(opts.seed ?? 1);
    this.rescueOn = opts.rescue ?? true;
    this.mods = simMods(opts.mods);
    this.ballClock = opts.ballClock ?? BALL_TIMEOUT;

    const wd = B.b2DefaultWorldDef();
    wd.gravity = V(0, -layout.gravity);
    wd.enableSleep = false;
    wd.maximumLinearVelocity = MAX_BALL_SPEED;
    wd.restitutionThreshold = 2;
    this.worldId = B.CreateWorld({ worldDef: wd }).worldId;
    this.build(layout);
  }

  /**
   * phaser-box2d 1.1.0 never frees a world slot (b2DestroyWorld wipes a local copy), so a process
   * can only ever create 32 worlds. We therefore keep ONE world per process and rebuild its
   * contents. Prefer `createSim()` over `new Sim()` everywhere.
   */
  reset(layout: Layout, opts: SimOptions = {}) {
    this.teardown();
    this.dt = opts.dt ?? DT;
    this.substeps = opts.substeps ?? SUBSTEPS;
    this.rng = new Rng(opts.seed ?? 1);
    this.rescueOn = opts.rescue ?? true;
    this.mods = simMods(opts.mods);
    this.ballClock = opts.ballClock ?? BALL_TIMEOUT;
    B.b2World_SetGravity(this.worldId, V(0, -layout.gravity));
    this.build(layout);
  }

  private build(layout: Layout) {
    this.tick = 0;
    this.events = [];
    this.tiltMeter = 0;
    this.tilted = false;
    this.plungeCharge = 0;
    this.awaitingPlunge = false;
    this.plungeWasHeld = false;
    this.nudgeCooldown = 0;
    this.nextBallId = 1;
    this.nextFlipperId = 1;
    this.rescues = 0;
    this.sideOn = { L: false, R: false };
    this.saversUsed.clear();
    this.netsUsed = 0;
    this.clockStart = null;
    this.printed = 0;
    this.buildTable(layout.ledge);
    this.flippers.push(
      this.buildFlipper('L', FLIPPER_PIVOTS.L.x, FLIPPER_PIVOTS.L.y),
      this.buildFlipper('R', FLIPPER_PIVOTS.R.x, FLIPPER_PIVOTS.R.y),
    );
    for (const p of cloneLayout(layout).parts) this.addPart(p);
  }

  private teardown() {
    for (const b of this.balls) B.b2DestroyBody(b.body);
    for (const p of this.parts.values()) { if (p.mover) B.b2DestroyBody(p.mover.body); if (!p.flipper) B.b2DestroyBody(p.body); }
    for (const f of this.flippers) B.b2DestroyBody(f.body); // also destroys its joint
    B.b2DestroyBody(this.ground);
    this.balls = [];
    this.parts.clear();
    this.flippers = [];
  }

  /** Only for process shutdown; world slots are not reusable (see reset). */
  destroy() {
    B.b2DestroyWorld(this.worldId);
  }

  // ---- table construction -------------------------------------------------

  private buildTable(ledge?: number) {
    const bd = B.b2DefaultBodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    this.ground = B.b2CreateBody(this.worldId, bd);

    const sd = B.b2DefaultShapeDef();
    sd.friction = 0.05;
    sd.restitution = WALL_RESTITUTION;
    sd.userData = { kind: 'wall' };
    for (const g of tableSegments(ledge)) {
      B.b2CreateSegmentShape(this.ground, sd, new B.b2Segment(V(g.x1, g.y1), V(g.x2, g.y2)));
    }
    const post = B.b2DefaultShapeDef();
    post.friction = 0.05;
    post.restitution = 0.55;
    post.userData = { kind: 'wall' };
    for (const q of TABLE_POSTS) B.b2CreateCircleShape(this.ground, post, new B.b2Circle(V(q.x, q.y), q.r));
  }

  private buildFlipper(side: 'L' | 'R', pivotX: number, pivotY: number, uid?: number, L = FLIPPER_LENGTH): FlipperRef {
    const sign: 1 | -1 = side === 'L' ? 1 : -1;
    const rest = -sign * FLIPPER_REST;
    const up = sign * FLIPPER_UP;

    const bd = B.b2DefaultBodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = V(pivotX, pivotY);
    bd.rotation = B.b2MakeRot(rest);
    // NOT a bullet: Box2D v3 only sweeps a bullet (the ball) against non-bullet bodies.
    const body = B.b2CreateBody(this.worldId, bd);

    const w = L < FLIPPER_LENGTH ? 0.8 : 1; // a small flipper is a little slimmer too
    const pts = [V(0, -0.5 * w), V(sign * L, -0.28 * w), V(sign * L, 0.28 * w), V(0, 0.5 * w)];
    const hull = B.b2ComputeHull(pts, pts.length);
    const poly = B.b2MakePolygon(hull, 0.12);
    const sd = B.b2DefaultShapeDef();
    sd.density = 2;
    sd.friction = 0.3;
    sd.restitution = 0.15;
    sd.userData = { kind: 'flipper', side };
    B.b2CreatePolygonShape(body, sd, poly);

    const jd = B.b2DefaultRevoluteJointDef();
    jd.bodyIdA = this.ground;
    jd.bodyIdB = body;
    jd.localAnchorA = V(pivotX, pivotY);
    jd.localAnchorB = V(0, 0);
    jd.enableLimit = true;
    jd.lowerAngle = Math.min(rest, up);
    jd.upperAngle = Math.max(rest, up);
    jd.enableMotor = true;
    jd.maxMotorTorque = FLIPPER_TORQUE;
    jd.motorSpeed = -sign * FLIPPER_SPEED_DOWN;
    jd.collideConnected = false;
    const joint = B.b2CreateRevoluteJoint(this.worldId, jd);
    return { fid: this.nextFlipperId++, side, sign, body, joint, pivotX, pivotY, on: false, uid, length: L };
  }

  // ---- parts: live edits (the workshop changes the machine while a test ball is rolling) ----

  /** Add a part to the world. Parts in the inventory (placed: false) have no body. */
  addPart(inst: PartInstance) {
    if (!inst.placed || this.parts.has(inst.uid)) return;
    const def = PARTS[inst.def];

    if (def.kind === 'flipper') {
      const f = this.buildFlipper(inst.def === 'flipperR' ? 'R' : 'L', inst.x, inst.y, inst.uid, FLIPPER_LENGTH * SMALL_FLIPPER);
      this.flippers.push(f);
      this.parts.set(inst.uid, { inst: { ...inst, dials: { ...inst.dials } }, body: f.body, flipper: f });
      return;
    }

    const bd = B.b2DefaultBodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    bd.position = V(inst.x, inst.y);
    bd.rotation = B.b2MakeRot(inst.angle);
    const body = B.b2CreateBody(this.worldId, bd);

    if (def.kind === 'bank') {
      const ref: PartRef = { inst: { ...inst, dials: { ...inst.dials } }, body, bank: { shapes: [], down: [false, false, false], resetAt: null } };
      this.parts.set(inst.uid, ref);
      this.raiseBank(ref);
      return;
    }
    if (def.kind === 'saver' || def.kind === 'strip') {
      // an insert in the playfield: it has a place on the board, but no collision
      this.parts.set(inst.uid, { inst: { ...inst, dials: { ...inst.dials } }, body });
      return;
    }
    if (def.kind === 'mover' || def.kind === 'goal') {
      const ref: PartRef = { inst: { ...inst, dials: { ...inst.dials } }, body };
      if (def.kind === 'goal') this.buildGoal(ref);
      this.addMover(ref);
      this.parts.set(inst.uid, ref);
      return;
    }
    const sd = B.b2DefaultShapeDef();
    sd.friction = 0.1;
    sd.restitution = def.kind === 'deflector' ? 0.6 : def.kind === 'kicker' ? 0.3 : def.kind === 'target' ? 0.5 : 0.45;
    sd.isSensor = def.kind === 'spinner' || def.kind === 'rollover' || def.kind === 'saucer' || def.kind === 'lamp' || def.kind === 'kickback';
    sd.userData = { kind: 'part', uid: inst.uid };
    if (def.shape.type === 'circle') B.b2CreateCircleShape(body, sd, new B.b2Circle(V(0, 0), def.shape.r));
    else if (def.shape.type === 'tri') {
      const pts = triPoints(def.shape.hw, def.shape.hh).map(([a, b]) => V(a, b));
      B.b2CreatePolygonShape(body, sd, B.b2MakePolygon(B.b2ComputeHull(pts, pts.length), 0.15));
    } else B.b2CreatePolygonShape(body, sd, B.b2MakeBox(def.shape.hw, def.shape.hh));
    const kb = def.kind === 'kickback';
    this.parts.set(inst.uid, { inst: { ...inst, dials: { ...inst.dials } }, body, armed: kb ? true : undefined, readyAt: kb ? 0 : undefined });
  }

  /**
   * The goal's frame, on the part's own static body: a back bar and two side walls (the mouth faces down the
   * table), and a sensor across the mouth that sees a goal. A ball that scores bounces off the back and falls out.
   */
  private buildGoal(ref: PartRef) {
    const wall = B.b2DefaultShapeDef();
    wall.friction = 0.05;
    wall.restitution = 0.5;
    wall.userData = { kind: 'wall' };
    B.b2CreatePolygonShape(ref.body, wall, B.b2MakeOffsetBox(2.65, 0.14, V(0, 0.95), 0));
    for (const sx of [-1, 1]) B.b2CreatePolygonShape(ref.body, wall, B.b2MakeOffsetBox(0.14, 0.5, V(sx * 2.55, 0.5), 0));
    const line = B.b2DefaultShapeDef();
    line.isSensor = true;
    line.userData = { kind: 'part', uid: ref.inst.uid, goal: true };
    B.b2CreatePolygonShape(ref.body, line, B.b2MakeOffsetBox(2.3, 0.2, V(0, 0.45), 0));
  }

  /** The sliding piece of a duck, a goalie or a roller: a kinematic body that travels along the part's rail. */
  private addMover(ref: PartRef) {
    const m = PARTS[ref.inst.def].mover;
    if (!m) return;
    const bd = B.b2DefaultBodyDef();
    bd.type = B.b2BodyType.b2_kinematicBody;
    bd.position = V(ref.inst.x, ref.inst.y + m.y);
    const body = B.b2CreateBody(this.worldId, bd);
    const sd = B.b2DefaultShapeDef();
    sd.friction = 0.1;
    sd.restitution = m.restitution;
    sd.userData = { kind: 'part', uid: ref.inst.uid, mover: true };
    if (m.shape.type === 'circle') B.b2CreateCircleShape(body, sd, new B.b2Circle(V(0, 0), m.shape.r));
    else {
      // a capsule: round ends and a round top, so a ball can never sit on it
      const cap = new B.b2Capsule();
      cap.center1 = V(-m.shape.hw + m.shape.hh, 0);
      cap.center2 = V(m.shape.hw - m.shape.hh, 0);
      cap.radius = m.shape.hh;
      B.b2CreateCapsuleShape(body, sd, cap);
    }
    ref.mover = { body, dir: 1, speedX: 1 };
    B.b2Body_SetLinearVelocity(body, V(m.speed, 0));
  }

  /** Where every sliding piece is (for drawing), keyed by part uid. */
  moverStates(): Map<number, { x: number; y: number }> {
    const out = new Map<number, { x: number; y: number }>();
    for (const [uid, p] of this.parts) if (p.mover) { const q = B.b2Body_GetPosition(p.mover.body); out.set(uid, { x: q.x, y: q.y }); }
    return out;
  }

  /** (Re)create the physical targets of a bank, all standing. */
  private raiseBank(ref: PartRef) {
    const bank = ref.bank!;
    bank.shapes = [];
    for (let i = 0; i < BANK_OFFSETS.length; i++) {
      const sd = B.b2DefaultShapeDef();
      sd.friction = 0.1;
      sd.restitution = 0.4;
      sd.userData = { kind: 'part', uid: ref.inst.uid, index: i };
      const poly = B.b2MakeOffsetBox(BANK_HALF.hw, BANK_HALF.hh, V(BANK_OFFSETS[i], 0), 0);
      bank.shapes.push(B.b2CreatePolygonShape(ref.body, sd, poly));
    }
    bank.down = [false, false, false];
    bank.resetAt = null;
  }

  private resetBank(ref: PartRef) {
    for (let i = 0; i < ref.bank!.shapes.length; i++) if (ref.bank!.down[i]) { /* already destroyed */ }
    // destroyed shapes are gone; raise only the missing ones by rebuilding the whole set
    for (let i = 0; i < ref.bank!.shapes.length; i++) if (!ref.bank!.down[i]) B.b2DestroyShape(ref.bank!.shapes[i]);
    this.raiseBank(ref);
  }

  /** Which targets of each bank are down, for drawing. */
  bankStates(): Map<number, boolean[]> {
    const m = new Map<number, boolean[]>();
    for (const [uid, p] of this.parts) if (p.bank) m.set(uid, [...p.bank.down]);
    return m;
  }

  removePart(uid: number) {
    const p = this.parts.get(uid);
    if (!p) return;
    this.saversUsed.delete(uid);
    for (const b of this.balls) if (b.held?.uid === uid) this.release(b);
    if (p.flipper) this.flippers = this.flippers.filter((f) => f !== p.flipper);
    if (p.mover) B.b2DestroyBody(p.mover.body);
    B.b2DestroyBody(p.body);
    this.parts.delete(uid);
  }

  /** Re-sync one part with its instance (moved, rotated, a dial turned, stored, placed). */
  updatePart(inst: PartInstance) {
    this.removePart(inst.uid);
    this.addPart(inst);
  }

  setGravity(g: number) {
    B.b2World_SetGravity(this.worldId, V(0, -g));
  }

  // ---- balls -----------------------------------------------------------------

  /** Put a ball in the plunger lane, ready to launch. */
  spawnBall(): number {
    const id = this.addBall(BALL_SPAWN.x, BALL_SPAWN.y, 0, 0);
    // a Twin Ball waits right behind the first one; the plunger fires whichever is on top
    if (this.mods.twin) this.addBall(BALL_SPAWN.x, BALL_SPAWN.y + BALL_R * 2.2, 0, 0);
    this.awaitingPlunge = true;
    this.plungeCharge = 0;
    this.tilted = false;
    this.tiltMeter = 0;
    for (const p of this.parts.values()) if (p.bank && p.bank.down.some(Boolean)) this.resetBank(p);
    this.rearm();
    this.clockStart = null; // a new ball: a new clock, and the printers may print again
    this.printed = 0;
    this.events.push({ type: 'ballSpawn', t: this.time, ballId: id });
    return id;
  }

  /** A new ball: every Kickback is armed again and every Ball Saver is ready. */
  rearm() {
    this.saversUsed.clear();
    this.netsUsed = 0;
    for (const p of this.parts.values()) {
      if (p.armed !== undefined) { p.armed = true; p.readyAt = 0; }
      if (p.mover) p.mover.speedX = 1; // a new ball: the duck calms down
    }
  }

  /** Test hook / multiball: drop a ball anywhere with a velocity. */
  addBall(x: number, y: number, vx: number, vy: number): number {
    const bd = B.b2DefaultBodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = V(x, y);
    bd.linearVelocity = V(vx, vy);
    bd.isBullet = true;
    bd.angularDamping = 0.4;
    const body = B.b2CreateBody(this.worldId, bd);
    const id = this.nextBallId++;
    const sd = B.b2DefaultShapeDef();
    sd.density = 1;
    sd.friction = 0.15;
    sd.restitution = 0.3 + this.mods.ballBounce;
    sd.userData = { kind: 'ball', id };
    B.b2CreateCircleShape(body, sd, new B.b2Circle(V(0, 0), BALL_R));
    B.b2Body_SetGravityScale(body, this.mods.ballGravity);
    this.balls.push({ id, body, age: 0, slowTime: 0, prevLocal: new Map(), held: null, saveUntil: 0, preSpeed: 0 });
    return id;
  }

  get time() {
    return this.tick * this.dt;
  }

  /** Seconds left on the ball clock, or null before the ball is launched. */
  get clockLeft(): number | null {
    return this.clockStart === null ? null : Math.max(0, this.ballClock - (this.time - this.clockStart));
  }

  get clockTotal() {
    return this.ballClock;
  }

  get ballCount() {
    return this.balls.length;
  }

  ballStates(): BallState[] {
    return this.balls.map((b) => {
      const p = B.b2Body_GetPosition(b.body);
      const v = B.b2Body_GetLinearVelocity(b.body);
      return { id: b.id, x: p.x, y: p.y, vx: v.x, vy: v.y, inLane: p.x > LANE_WALL_X - 0.1 && p.y < LANE_TOP_Y, held: b.held !== null };
    });
  }

  flipperStates(): FlipperState[] {
    return this.flippers.map((f) => {
      const p = B.b2Body_GetPosition(f.body);
      return { x: p.x, y: p.y, angle: B.b2RevoluteJoint_GetAngle(f.joint), side: f.side, pivotX: f.pivotX, pivotY: f.pivotY, uid: f.uid, length: f.length };
    });
  }

  /** Kickbacks that are armed, keyed by part uid (for drawing). */
  kickbackStates(): Map<number, boolean> {
    const m = new Map<number, boolean>();
    for (const [uid, p] of this.parts) if (p.armed !== undefined) m.set(uid, p.armed);
    return m;
  }

  /**
   * Ball Savers, keyed by part uid (for drawing): `armed` until it has saved a ball this ball, and
   * `left`, the fraction of the save window still open (1 while the ball waits to be launched).
   */
  saverStates(): Map<number, { armed: boolean; left: number }> {
    let until = 0;
    for (const b of this.balls) until = Math.max(until, b.saveUntil);
    const idle = this.awaitingPlunge || this.balls.length === 0;
    const left = idle ? 1 : Math.max(0, Math.min(1, (until - this.time) / SAVER_WINDOW));
    const m = new Map<number, { armed: boolean; left: number }>();
    for (const [uid, p] of this.parts) if (PARTS[p.inst.def].kind === 'saver') m.set(uid, { armed: !this.saversUsed.has(uid), left });
    return m;
  }

  /** The balls currently held by saucers, keyed by part uid (for drawing). */
  heldBalls(): Map<number, number> {
    const m = new Map<number, number>();
    for (const b of this.balls) if (b.held) m.set(b.held.uid, b.id);
    return m;
  }

  // ---- stepping ---------------------------------------------------------------

  /** Advance one fixed tick. Returns (and clears) the events produced. */
  step(input: Input): SimEvent[] {
    this.tick++;
    this.events = [];
    const t = this.time;

    // flippers: every flipper follows the button of its side
    for (const side of ['L', 'R'] as const) {
      const button = this.mods.swapFlippers ? (side === 'L' ? input.right : input.left) : side === 'L' ? input.left : input.right;
      const want = button && !this.tilted;
      if (want !== this.sideOn[side]) {
        this.sideOn[side] = want;
        this.events.push({ type: 'flipper', t, side, on: want });
      }
    }
    for (const f of this.flippers) {
      f.on = this.sideOn[f.side];
      B.b2RevoluteJoint_SetMotorSpeed(f.joint, f.sign * (f.on ? FLIPPER_SPEED_UP : -FLIPPER_SPEED_DOWN));
    }

    // plunger: hold to charge, release to launch
    if (this.awaitingPlunge) {
      if (input.plunge) {
        this.plungeCharge = Math.min(1, this.plungeCharge + this.dt / PLUNGE_CHARGE_TIME);
      } else if (this.plungeWasHeld && this.plungeCharge > 0.02) {
        // with several balls in the lane, fire the top one: it has a clear way out
        const laneBalls = this.balls.filter((b) => !b.held && this.inLane(b));
        const top = (b: BallRef) => B.b2Body_GetPosition(b.body).y;
        laneBalls.sort((a, b) => top(b) - top(a));
        const ball = laneBalls[0] ?? this.balls[0];
        if (ball) {
          const power = PLUNGE_MIN + (PLUNGE_MAX - PLUNGE_MIN) * this.plungeCharge;
          // like Space Cadet's plunger: the shot is never exactly the charge you gave it
          const boosted = power * (1 + this.rng.range(0, PLUNGE_NOISE));
          B.b2Body_SetLinearVelocity(ball.body, V(this.rng.range(-PLUNGE_DRIFT, PLUNGE_DRIFT), boosted));
          ball.saveUntil = this.armedSaver() || this.netsUsed < this.mods.extraSaves ? t + SAVER_WINDOW : 0;
          if (this.clockStart === null) this.clockStart = t;
          this.events.push({ type: 'launch', t, ballId: ball.id, power });
          this.awaitingPlunge = false;
        }
        this.plungeCharge = 0;
      }
      this.plungeWasHeld = input.plunge;
    }

    // nudge: a velocity kick on every live ball, paid for with tilt
    this.nudgeCooldown = Math.max(0, this.nudgeCooldown - this.dt);
    this.tiltMeter = Math.max(0, this.tiltMeter - TILT_DECAY * this.dt);
    if (input.nudge !== 0 && !this.awaitingPlunge && this.nudgeCooldown === 0 && !this.tilted) {
      this.nudgeCooldown = 0.15;
      this.tiltMeter += NUDGE_TILT;
      for (const b of this.balls) {
        if (b.held) continue;
        const v = B.b2Body_GetLinearVelocity(b.body);
        B.b2Body_SetLinearVelocity(b.body, V(v.x + input.nudge * NUDGE_SPEED * this.mods.nudge, v.y + 2 * this.mods.nudge));
      }
      this.events.push({ type: 'nudge', t, dir: input.nudge, tilt: this.tiltMeter });
      if (this.tiltMeter >= 1) {
        this.tilted = true;
        this.events.push({ type: 'tilt', t });
      }
    }

    // saucers keep their caught balls dead still, then fire them out
    for (const b of [...this.balls]) {
      if (!b.held) continue;
      const pr = this.parts.get(b.held.uid);
      if (!pr) { this.release(b); continue; }
      B.b2Body_SetTransform(b.body, V(pr.inst.x, pr.inst.y), B.b2MakeRot(0));
      B.b2Body_SetLinearVelocity(b.body, V(0, 0));
      if (this.tick >= b.held.until) this.eject(b, pr);
    }

    for (const p of this.parts.values()) if (p.bank?.resetAt != null && this.tick >= p.bank.resetAt) this.resetBank(p);

    // the sliding pieces go back and forth along their rails
    for (const p of this.parts.values()) {
      if (!p.mover) continue;
      const m = PARTS[p.inst.def].mover!;
      const x = B.b2Body_GetPosition(p.mover.body).x - p.inst.x;
      if (x > m.travel && p.mover.dir > 0) p.mover.dir = -1;
      else if (x < -m.travel && p.mover.dir < 0) p.mover.dir = 1;
      B.b2Body_SetLinearVelocity(p.mover.body, V(p.mover.dir * m.speed * p.mover.speedX, 0));
    }
    // a kickback recharges
    for (const p of this.parts.values()) if (p.armed === false && t >= (p.readyAt ?? 0)) p.armed = true;

    // a boss's magnet tugs every free ball towards it, harder the closer it is
    const mg = this.mods.magnet;
    if (mg) {
      for (const b of this.balls) {
        if (b.held) continue;
        const p = B.b2Body_GetPosition(b.body);
        if (p.x > LANE_WALL_X - 0.1 && p.y < LANE_TOP_Y) continue; // not in the plunger lane
        const dx = mg.x - p.x, dy = mg.y - p.y, d = Math.hypot(dx, dy);
        if (d > mg.radius || d < 0.5) continue;
        const a = mg.strength * (1 - d / mg.radius) * this.dt;
        const v = B.b2Body_GetLinearVelocity(b.body);
        B.b2Body_SetLinearVelocity(b.body, V(v.x + (dx / d) * a, v.y + (dy / d) * a));
      }
    }
    for (const b of this.balls) {
      const v = B.b2Body_GetLinearVelocity(b.body);
      b.preSpeed = Math.hypot(v.x, v.y);
    }
    B.b2World_Step(this.worldId, this.dt, this.substeps);

    this.processContacts();
    this.processSensors();
    this.checkBalls();
    return this.events;
  }

  private inLane(b: BallRef) {
    const p = B.b2Body_GetPosition(b.body);
    return p.x > LANE_WALL_X - 0.1 && p.y < LANE_TOP_Y;
  }

  private release(b: BallRef) {
    b.held = null;
    B.b2Body_SetGravityScale(b.body, this.mods.ballGravity);
  }

  /** Fire a caught ball out of its saucer. Like Space Cadet's throw_ball: random angle and speed around the aim. */
  private eject(b: BallRef, pr: PartRef) {
    const speed = dialValue(pr.inst, 'power');
    // an aimed saucer (Mag-Grab) throws the way it faces; the others fire out at random, somewhere up the table
    const a = PARTS[pr.inst.def].rotatable ? pr.inst.angle + this.rng.range(-0.12, 0.12) : this.rng.range(-1.2, 1.2);
    const s = speed * (1 + this.rng.range(-0.08, 0.08));
    this.release(b);
    B.b2Body_SetLinearVelocity(b.body, V(-Math.sin(a) * s, Math.cos(a) * s));
    this.events.push({ type: 'partRelease', t: this.time, uid: pr.inst.uid, ballId: b.id });

    const def = PARTS[pr.inst.def];
    for (let k = 0; def.recipe.spawn && k < def.recipe.spawn + this.mods.printerExtra && this.balls.length < MAX_BALLS && this.printed < (def.recipe.printCap ?? Infinity); k++) {
      this.printed++;
      const a2 = a + this.rng.range(0.3, 0.6) * (this.rng.next() < 0.5 ? -1 : 1);
      const id = this.addBall(pr.inst.x, pr.inst.y, -Math.sin(a2) * s * 0.9, Math.cos(a2) * s * 0.9);
      this.events.push({ type: 'extraBall', t: this.time, uid: pr.inst.uid, ballId: id });
    }
  }

  private processContacts() {
    const ev = B.b2World_GetContactEvents(this.worldId);
    // read everything first: a drop target destroys its shape, which invalidates later events on it
    const pairs: { a: any; b: any }[] = [];
    for (let i = 0; i < ev.beginCount; i++) {
      const e = ev.beginEvents[i];
      pairs.push({ a: B.b2Shape_GetUserData(e.shapeIdA), b: B.b2Shape_GetUserData(e.shapeIdB) });
    }
    for (const { a, b } of pairs) {
      const ball = a?.kind === 'ball' ? a : b?.kind === 'ball' ? b : null;
      const part = a?.kind === 'part' ? a : b?.kind === 'part' ? b : null;
      if (!ball || !part) continue;
      const pr = this.parts.get(part.uid);
      const br = this.balls.find((x) => x.id === ball.id);
      if (!pr || !br) continue;
      const def = PARTS[pr.inst.def];

      if (part.mover && pr.mover) {
        // a hit on the sliding piece: near either end of its rail is an edge shot; a moving bumper kicks
        const m = def.mover!, mp = B.b2Body_GetPosition(pr.mover.body), bp = B.b2Body_GetPosition(br.body);
        const edge = def.recipe.edgeShot ? Math.abs(mp.x - pr.inst.x) >= m.travel * def.recipe.edgeShot.edge : false;
        if (m.kick) {
          const dx = bp.x - mp.x, dy = bp.y - mp.y, len = Math.hypot(dx, dy) || 1;
          const v = B.b2Body_GetLinearVelocity(br.body);
          B.b2Body_SetLinearVelocity(br.body, V(v.x + (dx / len) * m.kick * this.mods.kickFactor, v.y + (dy / len) * m.kick * this.mods.kickFactor));
        }
        const up = def.recipe.speedUp;
        if (up) pr.mover.speedX = Math.min(up.max, pr.mover.speedX * (1 + up.by));
        this.events.push({ type: 'partHit', t: this.time, uid: pr.inst.uid, ballId: br.id, x: mp.x, y: mp.y, speed: br.preSpeed, mover: true, edge });
        continue;
      }

      if (def.kind === 'bank' && pr.bank && part.index !== undefined) {
        if (pr.bank.down[part.index]) continue;
        B.b2DestroyShape(pr.bank.shapes[part.index]);
        pr.bank.down[part.index] = true;
        const vel = B.b2Body_GetLinearVelocity(br.body);
        const c = Math.cos(pr.inst.angle), s = Math.sin(pr.inst.angle);
        const off = BANK_OFFSETS[part.index];
        const hit = { type: 'partHit' as const, t: this.time, uid: pr.inst.uid, ballId: br.id, x: pr.inst.x + c * off, y: pr.inst.y + s * off, speed: Math.hypot(vel.x, vel.y) };
        this.events.push({ ...hit, index: part.index });
        if (pr.bank.down.every(Boolean)) {
          pr.bank.resetAt = this.tick + Math.round(BANK_RESET_AFTER / this.dt);
          this.events.push({ ...hit, bankComplete: true });
        }
        continue;
      }
      if (def.kind === 'target' || def.kind === 'deflector') {
        // a passive standup (or a deflector bar): it just bounces the ball, and reports how hard it was hit
        this.events.push({ type: 'partHit', t: this.time, uid: pr.inst.uid, ballId: br.id, x: pr.inst.x, y: pr.inst.y, speed: br.preSpeed });
        continue;
      }
      if (def.kind !== 'bumper' && def.kind !== 'kicker') continue;

      const bp = B.b2Body_GetPosition(br.body);
      const v = B.b2Body_GetLinearVelocity(br.body);
      const kickSpeed = dialValue(pr.inst, 'kick') * def.kickUnit * this.mods.kickFactor;
      let nx: number, ny: number;
      if (def.shape.type === 'circle') {
        const dx = bp.x - pr.inst.x, dy = bp.y - pr.inst.y;
        const len = Math.hypot(dx, dy) || 1;
        nx = dx / len;
        ny = dy / len;
      } else if (def.shape.type === 'tri') {
        // a wedge throws the ball away from it and up the table
        const dx = bp.x - pr.inst.x, dy = bp.y - pr.inst.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len + 1.1, ul = Math.hypot(ux, uy) || 1;
        nx = ux / ul;
        ny = uy / ul;
      } else {
        // kick along the face of the box that was hit
        const c = Math.cos(pr.inst.angle), s = Math.sin(pr.inst.angle);
        const dx = bp.x - pr.inst.x, dy = bp.y - pr.inst.y;
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        const alongX = Math.abs(lx) / def.shape.hw > Math.abs(ly) / def.shape.hh;
        const nlx = alongX ? Math.sign(lx) || 1 : 0, nly = alongX ? 0 : Math.sign(ly) || 1;
        nx = nlx * c - nly * s;
        ny = nlx * s + nly * c;
      }
      B.b2Body_SetLinearVelocity(br.body, V(v.x + nx * kickSpeed, v.y + ny * kickSpeed));
      const r = def.shape.type === 'circle' ? def.shape.r : def.shape.type === 'tri' ? def.shape.hh : 0.4;
      this.events.push({
        type: 'partHit', t: this.time, uid: pr.inst.uid, ballId: br.id,
        x: pr.inst.x + nx * r, y: pr.inst.y + ny * r, speed: Math.hypot(v.x, v.y),
      });
    }
  }

  private processSensors() {
    const ev = B.b2World_GetSensorEvents(this.worldId);
    for (let i = 0; i < ev.beginCount; i++) {
      const e = ev.beginEvents[i];
      const s = B.b2Shape_GetUserData(e.sensorShapeId);
      const v = B.b2Shape_GetUserData(e.visitorShapeId);
      if (s?.kind !== 'part' || v?.kind !== 'ball') continue;
      const pr = this.parts.get(s.uid);
      const br = this.balls.find((x) => x.id === v.id);
      if (!pr || !br || br.held) continue;
      const def = PARTS[pr.inst.def];
      const vel = B.b2Body_GetLinearVelocity(br.body);
      const speed = Math.hypot(vel.x, vel.y);
      const hit = { type: 'partHit' as const, t: this.time, uid: pr.inst.uid, ballId: br.id, x: pr.inst.x, y: pr.inst.y, speed };

      if (s.goal) {
        this.events.push({ ...hit, goal: true });
      } else if (def.kind === 'spinner') {
        const spins = Math.max(1, Math.min(Math.round(10 * this.mods.spinBoost), Math.round((speed / 10) * this.mods.spinBoost)));
        const drag = 1 - 0.08 * dialValue(pr.inst, 'drag');
        B.b2Body_SetLinearVelocity(br.body, V(vel.x * drag, vel.y * drag));
        this.events.push({ ...hit, spins });
      } else if (def.kind === 'saucer') {
        if ([...this.balls].some((o) => o.held?.uid === pr.inst.uid)) continue; // one at a time
        br.held = { uid: pr.inst.uid, until: this.tick + Math.round(dialValue(pr.inst, 'hold') / this.dt) };
        B.b2Body_SetTransform(br.body, V(pr.inst.x, pr.inst.y), B.b2MakeRot(0));
        B.b2Body_SetLinearVelocity(br.body, V(0, 0));
        B.b2Body_SetGravityScale(br.body, 0);
        this.events.push({ ...hit, caught: true });
      } else if (def.kind === 'kickback') {
        if (!pr.armed) continue;
        // like the saucer's throw: never exactly the same shot twice
        pr.armed = false;
        pr.readyAt = this.time + (PARTS[pr.inst.def].recipe.cooldown ?? 4) * this.mods.kickbackCooldown;
        const a = pr.inst.angle + this.rng.range(-0.08, 0.08);
        const s = dialValue(pr.inst, 'power') * (1 + this.rng.range(-0.05, 0.05));
        B.b2Body_SetLinearVelocity(br.body, V(-Math.sin(a) * s, Math.cos(a) * s));
        this.events.push({ ...hit, kicked: true });
      } else if (def.kind === 'rollover' || def.kind === 'lamp') {
        this.events.push(hit);
      }
    }
  }

  private checkBalls() {
    const t = this.time;
    // the ball clock: once it runs out every ball on the table is lost (a ball waiting in the plunger lane is not in play)
    const expired = this.clockStart !== null && t - this.clockStart > this.ballClock;
    if (expired) this.clockStart = null;
    for (const b of [...this.balls]) {
      b.age += this.dt;
      if (b.held && !expired) continue;
      const p = B.b2Body_GetPosition(b.body);
      const v = B.b2Body_GetLinearVelocity(b.body);
      const inLane = p.x > LANE_WALL_X - 0.1 && p.y < LANE_TOP_Y;

      let reason: 'drain' | 'timeout' | null = null;
      if (p.y < 2.2 && !inLane) reason = 'drain';
      else if (expired && !inLane) reason = 'timeout';
      else if (b.age > BALL_TIMEOUT && !this.awaitingPlunge) reason = 'timeout';
      // a ball that leaves the table any other way is a bug; treat it as a drain so a run can't soft-lock
      else if (p.x < -1 || p.x > TABLE_W + 1 || p.y > TABLE_H + 2) reason = 'drain';

      if (reason === 'drain' && this.trySave(b)) continue;
      if (reason) {
        B.b2DestroyBody(b.body);
        this.balls = this.balls.filter((x) => x !== b);
        this.events.push({ type: 'drain', t, ballId: b.id, reason });
        continue;
      }

      // a plunge that fell short leaves the ball resting in the lane: re-arm the plunger
      if (inLane && !this.awaitingPlunge && p.y < LANE_FLOOR_Y + 1.2 && Math.hypot(v.x, v.y) < 3) {
        this.awaitingPlunge = true;
        this.plungeCharge = 0;
        this.plungeWasHeld = true; // require a fresh press
      }

      if (this.rescueOn) this.rescueFromFlippers(b);

      // ball search: a motionless ball gets a kick instead of stalling the round
      if (!this.awaitingPlunge && Math.hypot(v.x, v.y) < 0.6) {
        b.slowTime += this.dt;
        if (b.slowTime > BALL_SEARCH_AFTER) {
          b.slowTime = 0;
          B.b2Body_SetLinearVelocity(b.body, V(this.rng.range(-8, 8), this.rng.range(10, 18)));
          this.events.push({ type: 'ballSearch', t, ballId: b.id });
        }
      } else {
        b.slowTime = 0;
      }
    }
  }

  /** A placed Ball Saver that has not saved a ball yet this ball. */
  private armedSaver(): PartRef | undefined {
    for (const p of this.parts.values()) if (PARTS[p.inst.def].kind === 'saver' && !this.saversUsed.has(p.inst.uid)) return p;
    return undefined;
  }

  /** Shoot again: a ball that drains inside its save window goes back to the plunger lane, unspent. */
  private trySave(b: BallRef): boolean {
    if (this.tilted || b.saveUntil < this.time) return false;
    const saver = this.armedSaver();
    if (!saver && this.netsUsed >= this.mods.extraSaves) return false;
    if (saver) this.saversUsed.add(saver.inst.uid);
    else this.netsUsed++;
    B.b2DestroyBody(b.body);
    this.balls = this.balls.filter((x) => x !== b);
    const id = this.addBall(BALL_SPAWN.x, BALL_SPAWN.y, 0, 0);
    this.awaitingPlunge = true;
    this.plungeCharge = 0;
    this.plungeWasHeld = true; // require a fresh press
    this.events.push({ type: 'ballSaved', t: this.time, uid: saver?.inst.uid ?? -1, ballId: id });
    return true;
  }

  /**
   * Defence in depth against flipper tunnelling. Box2D's continuous collision is very good but not
   * perfect against a fast rotating body, so if a ball's centre crosses a flipper's span from the
   * top side to the underside, put it back on top and bounce it. Counted in `rescues` so the
   * stress tests can still measure how often the raw physics needed help.
   */
  private rescueFromFlippers(b: BallRef) {
    const p = B.b2Body_GetPosition(b.body);
    for (const f of this.flippers) {
      const loc = this.localTo(f, p.x, p.y);
      const prev = b.prevLocal.get(f.fid);
      const inSpan = (q: Local) => q.lx > 0.3 && q.lx < f.length - 0.3;
      if (prev && inSpan(prev) && inSpan(loc) && prev.ly >= 0 && loc.ly < -0.3) {
        const fp = B.b2Body_GetPosition(f.body);
        const a = B.b2RevoluteJoint_GetAngle(f.joint);
        const c = Math.cos(a), s = Math.sin(a);
        const half = 0.5 + ((0.28 - 0.5) * loc.lx) / f.length;
        const lyTop = half + 0.12 + BALL_R + 0.02;
        const bx = loc.lx * f.sign, by = lyTop; // flipper body frame
        const nx = fp.x + c * bx - s * by, ny = fp.y + s * bx + c * by;
        // velocity into the flipper frame, flip the normal component outwards, back to world
        const v = B.b2Body_GetLinearVelocity(b.body);
        const vbx = v.x * c + v.y * s, vby = -v.x * s + v.y * c;
        const vn = Math.max(Math.abs(vby) * 0.4, 6);
        const wx = vbx * c - vn * s, wy = vbx * s + vn * c;
        B.b2Body_SetTransform(b.body, V(nx, ny), B.b2MakeRot(0));
        B.b2Body_SetLinearVelocity(b.body, V(wx, wy));
        this.rescues++;
        this.events.push({ type: 'rescue', t: this.time, ballId: b.id });
        b.prevLocal.set(f.fid, this.localTo(f, nx, ny));
        continue;
      }
      b.prevLocal.set(f.fid, loc);
    }
  }

  /** A compact fingerprint of the full dynamic state, for determinism tests. */
  fingerprint(): string {
    const parts: string[] = [String(this.tick)];
    for (const b of this.balls) {
      const p = B.b2Body_GetPosition(b.body);
      const v = B.b2Body_GetLinearVelocity(b.body);
      parts.push(`${p.x.toFixed(5)},${p.y.toFixed(5)},${v.x.toFixed(5)},${v.y.toFixed(5)}`);
    }
    for (const f of this.flippers) parts.push(B.b2RevoluteJoint_GetAngle(f.joint).toFixed(5));
    return parts.join('|');
  }

  /** Coordinates of a world point in a flipper's frame: long axis +x for both sides, top surface +y. */
  private localTo(f: FlipperRef, x: number, y: number): Local {
    const p = B.b2Body_GetPosition(f.body);
    const angle = B.b2RevoluteJoint_GetAngle(f.joint);
    const dx = x - p.x, dy = y - p.y;
    const c = Math.cos(angle), s = Math.sin(angle);
    return { lx: (dx * c + dy * s) * f.sign, ly: -dx * s + dy * c };
  }

  /** Test hook: flipper-local coordinates for one of the two fixed flippers. */
  flipperLocal(side: 'L' | 'R', x: number, y: number) {
    const f = this.flippers.find((q) => q.side === side && q.uid === undefined)!;
    return { ...this.localTo(f, x, y), length: FLIPPER_LENGTH };
  }
}

let shared: Sim | null = null;

/** The one way to get a Sim. Reuses the process-wide world (see Sim.reset). */
export function createSim(layout: Layout, opts: SimOptions = {}): Sim {
  if (shared) {
    shared.reset(layout, opts);
    return shared;
  }
  shared = new Sim(layout, opts);
  return shared;
}
