import * as B from 'phaser-box2d/dist/PhaserBox2D.js';
import { PARTS } from '../data/parts';
import {
  BALL_R, BALL_SEARCH_AFTER, BALL_SPAWN, BALL_TIMEOUT, DT, FLIPPER_LENGTH, FLIPPER_REST,
  FLIPPER_SPEED_DOWN, FLIPPER_SPEED_UP, FLIPPER_TORQUE, FLIPPER_UP, LANE_FLOOR_Y,
  MAX_BALL_SPEED, NUDGE_SPEED, NUDGE_TILT, PLUNGE_CHARGE_TIME, PLUNGE_MAX, PLUNGE_MIN,
  SUBSTEPS, TILT_DECAY,
} from './constants';
import { cloneLayout, type Layout, type PartInstance } from './layout';
import { Rng } from './rng';
import { FLIPPER_PIVOTS, tableSegments } from './table';

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
  | { type: 'partHit'; t: number; uid: number; ballId: number; x: number; y: number; speed: number }
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
}

export interface FlipperState {
  x: number;
  y: number;
  angle: number;
  side: 'L' | 'R';
  pivotX: number;
  pivotY: number;
}

interface BallRef {
  id: number;
  body: any;
  age: number;
  slowTime: number;
  prevLocal: { L?: { lx: number; ly: number }; R?: { lx: number; ly: number } };
}
interface PartRef {
  inst: PartInstance;
  body: any;
}
interface FlipperRef {
  side: 'L' | 'R';
  sign: 1 | -1;
  body: any;
  joint: any;
  pivotX: number;
  pivotY: number;
  on: boolean;
}

export interface SimOptions {
  dt?: number;
  substeps?: number;
  seed?: number;
  /** Safety net: pop a ball back above a flipper if it ever crosses through it. Default on. */
  rescue?: boolean;
}

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

  private worldId: any;
  private ground: any;
  private balls: BallRef[] = [];
  private parts = new Map<number, PartRef>();
  private flippers: FlipperRef[] = [];
  private nextBallId = 1;
  private rng: Rng;
  private plungeWasHeld = false;
  private nudgeCooldown = 0;
  private gravity: number;
  private rescueOn = true;
  rescues = 0;

  constructor(layout: Layout, opts: SimOptions = {}) {
    this.dt = opts.dt ?? DT;
    this.substeps = opts.substeps ?? SUBSTEPS;
    this.rng = new Rng(opts.seed ?? 1);
    this.gravity = layout.gravity;
    this.rescueOn = opts.rescue ?? true;

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
    this.gravity = layout.gravity;
    this.rescueOn = opts.rescue ?? true;
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
    this.rescues = 0;
    this.buildTable();
    this.flippers.push(
      this.buildFlipper('L', FLIPPER_PIVOTS.L.x, FLIPPER_PIVOTS.L.y),
      this.buildFlipper('R', FLIPPER_PIVOTS.R.x, FLIPPER_PIVOTS.R.y),
    );
    for (const p of cloneLayout(layout).parts) this.addPart(p);
  }

  private teardown() {
    for (const b of this.balls) B.b2DestroyBody(b.body);
    for (const p of this.parts.values()) B.b2DestroyBody(p.body);
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

  private buildTable() {
    const bd = B.b2DefaultBodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    this.ground = B.b2CreateBody(this.worldId, bd);

    const sd = B.b2DefaultShapeDef();
    sd.friction = 0.05;
    sd.restitution = 0.25;
    sd.userData = { kind: 'wall' };
    for (const g of tableSegments()) {
      B.b2CreateSegmentShape(this.ground, sd, new B.b2Segment(V(g.x1, g.y1), V(g.x2, g.y2)));
    }
  }

  private buildFlipper(side: 'L' | 'R', pivotX: number, pivotY: number): FlipperRef {
    const sign: 1 | -1 = side === 'L' ? 1 : -1;
    const rest = -sign * FLIPPER_REST;
    const up = sign * FLIPPER_UP;

    const bd = B.b2DefaultBodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = V(pivotX, pivotY);
    bd.rotation = B.b2MakeRot(rest);
    // NOT a bullet: Box2D v3 only sweeps a bullet (the ball) against non-bullet bodies.
    const body = B.b2CreateBody(this.worldId, bd);

    const L = FLIPPER_LENGTH;
    const pts = [V(0, -0.5), V(sign * L, -0.28), V(sign * L, 0.28), V(0, 0.5)];
    // hull winding must be counter-clockwise; ComputeHull sorts it for us
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
    return { side, sign, body, joint, pivotX, pivotY, on: false };
  }

  // ---- live edits (the workshop changes the machine while a test ball is rolling) ----

  addPart(inst: PartInstance) {
    const def = PARTS[inst.def];
    const bd = B.b2DefaultBodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    bd.position = V(inst.x, inst.y);
    const body = B.b2CreateBody(this.worldId, bd);
    const sd = B.b2DefaultShapeDef();
    sd.friction = 0.1;
    sd.restitution = 0.45;
    sd.userData = { kind: 'part', uid: inst.uid };
    B.b2CreateCircleShape(body, sd, new B.b2Circle(V(0, 0), def.radius));
    this.parts.set(inst.uid, { inst: { ...inst }, body });
  }

  removePart(uid: number) {
    const p = this.parts.get(uid);
    if (!p) return;
    B.b2DestroyBody(p.body);
    this.parts.delete(uid);
  }

  movePart(uid: number, x: number, y: number) {
    const p = this.parts.get(uid);
    if (!p) return;
    p.inst.x = x;
    p.inst.y = y;
    B.b2Body_SetTransform(p.body, V(x, y), B.b2MakeRot(0));
  }

  setKick(uid: number, kick: number) {
    const p = this.parts.get(uid);
    if (p) p.inst.kick = kick;
  }

  setGravity(g: number) {
    this.gravity = g;
    B.b2World_SetGravity(this.worldId, V(0, -g));
  }

  // ---- balls -----------------------------------------------------------------

  /** Put a ball in the plunger lane, ready to launch. */
  spawnBall(): number {
    const id = this.addBall(BALL_SPAWN.x, BALL_SPAWN.y, 0, 0);
    this.awaitingPlunge = true;
    this.plungeCharge = 0;
    this.tilted = false;
    this.tiltMeter = 0;
    this.events.push({ type: 'ballSpawn', t: this.time, ballId: id });
    return id;
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
    sd.restitution = 0.3;
    sd.userData = { kind: 'ball', id };
    B.b2CreateCircleShape(body, sd, new B.b2Circle(V(0, 0), BALL_R));
    this.balls.push({ id, body, age: 0, slowTime: 0, prevLocal: {} });
    return id;
  }

  get time() {
    return this.tick * this.dt;
  }

  get ballCount() {
    return this.balls.length;
  }

  ballStates(): BallState[] {
    return this.balls.map((b) => {
      const p = B.b2Body_GetPosition(b.body);
      const v = B.b2Body_GetLinearVelocity(b.body);
      return { id: b.id, x: p.x, y: p.y, vx: v.x, vy: v.y, inLane: p.x > 19.9 && p.y < 34 };
    });
  }

  flipperStates(): FlipperState[] {
    return this.flippers.map((f) => {
      const p = B.b2Body_GetPosition(f.body);
      return {
        x: p.x,
        y: p.y,
        angle: B.b2RevoluteJoint_GetAngle(f.joint),
        side: f.side,
        pivotX: f.pivotX,
        pivotY: f.pivotY,
      };
    });
  }

  partStates(): PartInstance[] {
    return [...this.parts.values()].map((p) => ({ ...p.inst }));
  }

  // ---- stepping ---------------------------------------------------------------

  /** Advance one fixed tick. Returns (and clears) the events produced. */
  step(input: Input): SimEvent[] {
    this.tick++;
    this.events = [];
    const t = this.time;

    // flippers
    for (const f of this.flippers) {
      const want = (f.side === 'L' ? input.left : input.right) && !this.tilted;
      if (want !== f.on) {
        f.on = want;
        this.events.push({ type: 'flipper', t, side: f.side, on: want });
      }
      B.b2RevoluteJoint_SetMotorSpeed(f.joint, f.sign * (f.on ? FLIPPER_SPEED_UP : -FLIPPER_SPEED_DOWN));
    }

    // plunger: hold to charge, release to launch
    if (this.awaitingPlunge) {
      if (input.plunge) {
        this.plungeCharge = Math.min(1, this.plungeCharge + this.dt / PLUNGE_CHARGE_TIME);
      } else if (this.plungeWasHeld && this.plungeCharge > 0.02) {
        const ball = this.balls[0];
        if (ball) {
          const power = PLUNGE_MIN + (PLUNGE_MAX - PLUNGE_MIN) * this.plungeCharge;
          B.b2Body_SetLinearVelocity(ball.body, V(0, power));
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
        const v = B.b2Body_GetLinearVelocity(b.body);
        B.b2Body_SetLinearVelocity(b.body, V(v.x + input.nudge * NUDGE_SPEED, v.y + 2));
      }
      this.events.push({ type: 'nudge', t, dir: input.nudge, tilt: this.tiltMeter });
      if (this.tiltMeter >= 1) {
        this.tilted = true;
        this.events.push({ type: 'tilt', t });
      }
    }

    B.b2World_Step(this.worldId, this.dt, this.substeps);

    this.processContacts();
    this.checkBalls();
    return this.events;
  }

  private processContacts() {
    const ev = B.b2World_GetContactEvents(this.worldId);
    for (let i = 0; i < ev.beginCount; i++) {
      const e = ev.beginEvents[i];
      const a = B.b2Shape_GetUserData(e.shapeIdA);
      const b = B.b2Shape_GetUserData(e.shapeIdB);
      const ball = a?.kind === 'ball' ? a : b?.kind === 'ball' ? b : null;
      const part = a?.kind === 'part' ? a : b?.kind === 'part' ? b : null;
      if (!ball || !part) continue;
      const pr = this.parts.get(part.uid);
      const br = this.balls.find((x) => x.id === ball.id);
      if (!pr || !br) continue;

      const bp = B.b2Body_GetPosition(br.body);
      const v = B.b2Body_GetLinearVelocity(br.body);
      const dx = bp.x - pr.inst.x, dy = bp.y - pr.inst.y;
      const len = Math.hypot(dx, dy) || 1;
      const kickSpeed = pr.inst.kick * PARTS[pr.inst.def].kickUnit;
      B.b2Body_SetLinearVelocity(br.body, V(v.x + (dx / len) * kickSpeed, v.y + (dy / len) * kickSpeed));
      this.events.push({
        type: 'partHit',
        t: this.time,
        uid: pr.inst.uid,
        ballId: br.id,
        x: pr.inst.x + (dx / len) * PARTS[pr.inst.def].radius,
        y: pr.inst.y + (dy / len) * PARTS[pr.inst.def].radius,
        speed: Math.hypot(v.x, v.y),
      });
    }
  }

  private checkBalls() {
    const t = this.time;
    for (const b of [...this.balls]) {
      b.age += this.dt;
      const p = B.b2Body_GetPosition(b.body);
      const v = B.b2Body_GetLinearVelocity(b.body);
      const inLane = p.x > 19.9 && p.y < 34;

      let reason: 'drain' | 'timeout' | null = null;
      if (p.y < 2.2 && !inLane) reason = 'drain';
      else if (b.age > BALL_TIMEOUT && !this.awaitingPlunge) reason = 'timeout';
      // a ball that leaves the table any other way is a bug; treat it as a drain so a run can't soft-lock
      else if (p.x < -1 || p.x > 23 || p.y > 46) reason = 'drain';

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

  /**
   * Defence in depth against flipper tunnelling. Box2D's continuous collision is very good but not
   * perfect against a fast rotating body, so if a ball's centre crosses a flipper's span from the
   * top side to the underside, put it back on top and bounce it. Counted in `rescues` so the
   * stress tests can still measure how often the raw physics needed help.
   */
  private rescueFromFlippers(b: BallRef) {
    const p = B.b2Body_GetPosition(b.body);
    for (const f of this.flippers) {
      const loc = this.flipperLocal(f.side, p.x, p.y);
      const prev = b.prevLocal[f.side];
      const inSpan = (q: { lx: number }) => q.lx > 0.3 && q.lx < FLIPPER_LENGTH - 0.3;
      if (prev && inSpan(prev) && inSpan(loc) && prev.ly >= 0 && loc.ly < -0.3) {
        const fp = B.b2Body_GetPosition(f.body);
        const a = B.b2RevoluteJoint_GetAngle(f.joint);
        const c = Math.cos(a), s = Math.sin(a);
        const half = 0.5 + ((0.28 - 0.5) * loc.lx) / FLIPPER_LENGTH;
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
        b.prevLocal[f.side] = this.flipperLocal(f.side, nx, ny);
        continue;
      }
      b.prevLocal[f.side] = loc;
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

  /** Test hook: lateral flipper geometry so tests can detect tunnelling. */
  flipperLocal(side: 'L' | 'R', x: number, y: number) {
    const f = this.flippers.find((q) => q.side === side)!;
    const p = B.b2Body_GetPosition(f.body);
    const angle = B.b2RevoluteJoint_GetAngle(f.joint);
    const dx = x - p.x, dy = y - p.y;
    const c = Math.cos(angle), s = Math.sin(angle);
    // rotate into the flipper's frame; mirror so the long axis is +x for both sides
    const lx = (dx * c + dy * s) * f.sign;
    const ly = -dx * s + dy * c;
    return { lx, ly: ly, length: FLIPPER_LENGTH };
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
