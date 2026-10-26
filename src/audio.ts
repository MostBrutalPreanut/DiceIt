/**
 * The synthesised sound kit: no assets, everything is built from a few soft voices: sines and triangles with
 * gentle attacks, low-passed noise, FM bells with mild ratios and Karplus-Strong plucks. Each part has its own
 * sound, made to be what the part is (a spinner ratchets and slows down, a bell goes ding-dong, a duck quacks).
 * Pitched parts still climb a pentatonic ladder as Mult grows.
 *
 * The mix is cosy rather than arcade-loud: every sound goes through a voice limiter (a sound repeated quickly
 * gets quieter, and a crowd of sounds is thinned out), a little room reverb, a warm low-pass, a compressor and a
 * soft clipper that keeps the peak under 0.9. Under it all a relaxed toybox tune loops, different on each
 * machine: a clockwork music box in the factory, a swung doo-wop combo in the diner, a lute in the castle.
 * While a round is played the same tune gets going: faster, brighter, with a kick, a backbeat and a pumping bass,
 * more so as the goal gets close (setIntensity).
 */
import { PARTS, type PartId } from './data/parts';

const PENTATONIC = [0, 2, 4, 7, 9];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const pent = (step: number) => PENTATONIC[step % 5] + 12 * Math.floor(step / 5);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Levels: the whole mix, the effects and the music under them. The volume setters scale the last two. */
const MASTER = 0.9;
const SFX_LEVEL = 1.2;
const MUSIC_LEVEL = 0.18;
/** The most sounds alive at once; past it, new (unimportant) ones are dropped. */
const MAX_VOICES = 24;

/** What a scoring hit tells the sound kit (a ScoreEvent fits). */
export interface HitInfo { spins?: number; tier?: number; points?: number; money?: number; notes?: string[]; label?: string; hot?: boolean }
/** What a physical contact tells the sound kit (a partHit SimEvent fits). */
export interface ContactInfo { speed: number; caught?: boolean; kicked?: boolean; mover?: boolean; goal?: boolean }

interface OscOpts {
  type?: OscillatorType;
  /** Glide to this frequency, over `glide` seconds (default: the whole sound). */
  to?: number;
  glide?: number;
  attack?: number;
  /** Hold at full level this long before the decay. */
  hold?: number;
  /** Low-pass the voice here. */
  lp?: number;
  /** Vibrato: [rate Hz, depth Hz]; `vibDecay` lets it die away (a spring's wobble). */
  vib?: [number, number];
  vibDecay?: boolean;
  /** Tremolo: [rate Hz, depth 0..1]. */
  trem?: [number, number];
  detune?: number;
}
interface NoiseOpts { f: number; q?: number; type?: BiquadFilterType; to?: number; attack?: number; hold?: number; trem?: [number, number] }

// ---- the music ------------------------------------------------------------------------------------------------------

/** One machine's tune: tempo (quarter notes a minute), steps per bar, swing, bars in the loop. */
interface Song { bpm: number; steps: number; swing: number; bars: number }
const SONGS: Record<string, Song> = {
  // Funhouse Factory: a clockwork music box, ticking along
  factory: { bpm: 78, steps: 8, swing: 0.12, bars: 8 },
  // Short Order: a lazy doo-wop shuffle, brushes and snaps, an upright bass walking
  diner: { bpm: 92, steps: 8, swing: 0.33, bars: 8 },
  // Castle Crash: a lute in 6/8 with a frame drum and a recorder
  castle: { bpm: 100, steps: 6, swing: 0, bars: 8 },
};
const _ = null;
/** Factory: Cmaj7 Am7 Dm7 G7 Cmaj7 Am7 Fmaj7 G6, in semitones from middle C. */
const FACTORY_CHORDS = [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5], [0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 4]];
const FACTORY_MELODY: (number | null)[] = [
  79, _, 76, _, 72, _, 74, 76, /**/ _, _, 72, _, 69, _, _, _,
  74, _, 77, _, 81, _, 79, 77, /**/ 76, _, _, _, 74, _, _, _,
  79, _, 76, _, 72, _, 74, 76, /**/ _, _, 84, _, 81, _, 79, _,
  77, _, 76, _, 72, _, 69, _, /**/ 71, _, 74, _, 76, _, _, _,
];
/** Diner: Fmaj9 Dm9 Gm9 C13 Am9 Dm9 Gm9 C13, rootless voicings for the electric piano, and a walking bass. */
const DINER_CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [58, 62, 65, 69], [58, 62, 64, 67], [60, 64, 67, 71], [53, 57, 60, 64], [58, 62, 65, 69], [58, 62, 64, 67]];
const DINER_BASS = [[41, 45, 48, 39], [38, 41, 45, 42], [43, 46, 38, 37], [36, 40, 43, 44], [45, 43, 40, 39], [38, 41, 45, 42], [43, 46, 38, 37], [36, 43, 38, 40]];
const DINER_MELODY: (number | null)[] = [
  81, _, _, 79, 77, _, _, _, /**/ 74, _, 77, _, 81, _, _, _,
  82, _, _, 81, 79, _, 77, _, /**/ 76, _, _, _, 79, _, _, _,
  76, _, 72, _, 74, 76, _, _, /**/ 77, _, _, _, 74, _, _, _,
  70, _, 74, _, 77, _, 81, _, /**/ 79, _, _, _, _, _, 76, _,
];
/** Castle, D dorian: Dm C Dm Am F C Dm A (root, minor?), a lute arpeggio over each and a recorder tune. */
const CASTLE_CHORDS: [number, boolean][] = [[50, true], [48, false], [50, true], [45, true], [53, false], [48, false], [50, true], [45, false]];
const LUTE_ARP = [0, 7, 12, -1, 7, 12];
const CASTLE_MELODY: (number | null)[] = [
  74, _, _, 77, _, 76, /**/ 74, _, 72, _, _, _,
  69, _, 72, 74, _, _, /**/ 76, _, _, 72, _, _,
  77, _, 76, 77, _, 79, /**/ 76, _, _, 72, _, _,
  74, _, 77, 76, _, 74, /**/ 73, _, _, _, _, _,
];

/** A short room: decaying stereo noise that darkens as it fades. */
function roomIR(ctx: BaseAudioContext, seconds: number, tau: number): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / ctx.sampleRate;
      const a = 0.7 * Math.exp(-x / (tau * 0.8)) + 0.05; // the tail gets darker
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-x / tau);
    }
  }
  return buf;
}

/** The soft clipper's curve, for input pre-scaled by 1/2: unity at low levels, never past 0.89. */
function softClip(): Float32Array<ArrayBuffer> {
  const n = 2048, c = new Float32Array(n), lim = 0.89;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    c[i] = lim * Math.tanh((2 * u) / lim);
  }
  return c;
}

export class AudioFx {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private sfxSend: GainNode | null = null;
  private music: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private echo: DelayNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private plucks = new Map<string, AudioBuffer>();
  muted = false;
  musicOn = true;
  /** 0..1, set by the settings menu. */
  musicVolume = 1;
  sfxVolume = 1;
  private theme = 'factory';
  private song: Song = SONGS.factory;
  private nextBeat = 0;
  private beat = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** How hard the music drives (0 relaxed, 1 flat out): it follows the target a little every step. */
  private energy = 0;
  private energyTarget = 0;
  private energyHeard = 0;
  private mtone: BiquadFilterNode | null = null;
  /** The voice limiter: when each kind of sound last started, and when the live ones end. */
  private recent = new Map<string, number[]>();
  private live: number[] = [];
  /** Lane rollovers lit this ball: each one rings a step higher. */
  private laneStep = 0;

  /** Browsers only allow audio after a user gesture; call this from input handlers. */
  unlock() {
    if (this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.attach(new AudioContext());
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  /**
   * Build the mix on a context. `unlock()` does this with a live AudioContext; tools/audio-check.cjs does it with
   * an OfflineAudioContext to measure the sounds.
   */
  attach(ctx: BaseAudioContext) {
    this.ctx = ctx;
    // effects and music -> warm low-pass -> master -> compressor -> soft clipper -> out
    const mix = ctx.createGain();
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 7000;
    warm.Q.value = 0.5;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const clip = ctx.createWaveShaper();
    clip.curve = softClip();
    clip.oversample = '2x';
    mix.connect(warm).connect(this.master).connect(comp).connect(pre).connect(clip).connect(ctx.destination);

    // a small room, shared by everything
    const verbIn = ctx.createGain();
    const preDelay = ctx.createDelay(0.1);
    preDelay.delayTime.value = 0.014;
    const verb = ctx.createConvolver();
    verb.buffer = roomIR(ctx, 1.4, 0.22);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.9;
    verbIn.connect(preDelay).connect(verb).connect(verbOut).connect(mix);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = SFX_LEVEL * this.sfxVolume * this.sfxVolume;
    this.sfx.connect(mix);
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0.16;
    this.sfx.connect(this.sfxSend).connect(verbIn);

    // the music: its own volume, a duck under big moments, a darker tone, an echo and more room
    this.music = ctx.createGain();
    this.music.gain.value = this.musicGain();
    this.musicDuck = ctx.createGain();
    const mtone = ctx.createBiquadFilter();
    this.mtone = mtone;
    mtone.type = 'lowpass';
    mtone.frequency.value = 3600;
    mtone.Q.value = 0.4;
    this.music.connect(this.musicDuck).connect(mtone).connect(mix);
    const msend = ctx.createGain();
    msend.gain.value = 0.3;
    mtone.connect(msend).connect(verbIn);
    this.echo = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const eTone = ctx.createBiquadFilter();
    eTone.type = 'lowpass';
    eTone.frequency.value = 2000;
    const eOut = ctx.createGain();
    eOut.gain.value = 0.16;
    mtone.connect(this.echo).connect(eTone).connect(fb).connect(this.echo);
    eTone.connect(eOut).connect(mix);
    this.setEcho();

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.plucks.clear();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    this.applyMusicGain();
  }

  /** The settings' two volumes at once, 0..1 each. */
  setVolumes(music: number, sfx: number) {
    this.setMusicVolume(music);
    this.setSfxVolume(sfx);
  }

  /** Music volume, 0..1 (on top of the music switch). */
  setMusicVolume(v: number) {
    this.musicVolume = clamp01(v);
    this.applyMusicGain();
  }

  /** Sound-effects volume, 0..1. */
  setSfxVolume(v: number) {
    this.sfxVolume = clamp01(v);
    if (this.sfx && this.ctx) this.sfx.gain.setTargetAtTime(SFX_LEVEL * this.sfxVolume * this.sfxVolume, this.ctx.currentTime, 0.05);
  }

  /** Each machine has its own tune (and its own Big Boi voice). */
  setTheme(id: string) {
    if (id === this.theme && this.song === SONGS[id]) return;
    this.theme = SONGS[id] ? id : 'factory';
    this.song = SONGS[this.theme];
    this.beat = 0;
    this.setEcho();
  }

  private musicGain() { return this.musicOn ? MUSIC_LEVEL * this.musicVolume * this.musicVolume * (1 + 0.45 * this.energy) : 0; }
  /** The tempo right now: the song's, pushed up to a third faster as the music gets going. */
  private get bpm() { return this.song.bpm * (1 + 0.32 * this.energy); }
  /** How hard the music should drive, 0..1: 0 in the workshop and the menus, more while a round is played. */
  setIntensity(v: number) { this.energyTarget = clamp01(v); }
  private applyMusicGain() {
    if (this.music && this.ctx) this.music.gain.setTargetAtTime(this.musicGain(), this.ctx.currentTime, 0.2);
  }
  private setEcho() {
    if (!this.echo || !this.ctx) return;
    const d = (60 / this.bpm / 2) * 3;
    if (this.energy === 0) this.echo.delayTime.value = d; // a tempo change glides, so the echo does not jump
    else this.echo.delayTime.setTargetAtTime(d, this.ctx.currentTime, 0.3);
  }
  /** Big moments push the music down for a breath. */
  private duck(depth = 0.5, hold = 0.5) {
    const ctx = this.ctx, g = this.musicDuck?.gain;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(depth, t, 0.04);
    g.setTargetAtTime(1, t + hold, 0.35);
  }

  // ---- building blocks ----------------------------------------------------------------------------------------

  /**
   * Start one sound: a gain node on the effects bus at `vol`, or null if the limiter drops it. A sound of the
   * same kind within `gap` seconds is dropped, more than `cap` of them in 0.35 s too; each repeat in that window
   * is quieter than the last, so a flurry of hits never piles up into a roar.
   */
  private voice(key: string, vol: number, dur: number, gap = 0.03, cap = 4, important = false): { o: GainNode; t: number } | null {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted || this.sfxVolume <= 0) return null;
    const t = ctx.currentTime;
    const recent = (this.recent.get(key) ?? []).filter((x) => t - x < 0.35);
    if (recent.length && t - recent[recent.length - 1] < gap) return null;
    if (recent.length >= cap) return null;
    this.live = this.live.filter((e) => e > t);
    if (this.live.length >= MAX_VOICES && !important) return null;
    recent.push(t);
    this.recent.set(key, recent);
    this.live.push(t + dur);
    const o = ctx.createGain();
    o.gain.value = vol / (1 + 0.45 * (recent.length - 1)) / (1 + 0.03 * this.live.length);
    o.connect(this.sfx);
    return { o, t };
  }

  /** Attack, optional hold, then an exponential decay to silence at t + dur. */
  private env(p: AudioParam, t: number, peak: number, attack: number, dur: number, hold = 0) {
    const a = Math.max(0.001, attack), h = Math.max(0, hold);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (h) p.setValueAtTime(Math.max(0.0002, peak), t + a + h);
    p.exponentialRampToValueAtTime(0.0001, t + Math.max(a + h + 0.01, dur));
  }

  private osc(o: AudioNode, t: number, f: number, dur: number, vol: number, p: OscOpts = {}) {
    const ctx = this.ctx!;
    const os = ctx.createOscillator();
    os.type = p.type ?? 'sine';
    os.frequency.setValueAtTime(f, t);
    if (p.detune) os.detune.value = p.detune;
    if (p.to) os.frequency.exponentialRampToValueAtTime(Math.max(20, p.to), t + (p.glide ?? dur));
    const g = ctx.createGain();
    this.env(g.gain, t, vol, p.attack ?? 0.004, dur, p.hold);
    let node: AudioNode = os;
    if (p.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = p.lp;
      lp.Q.value = 0.5;
      node = node.connect(lp);
    }
    node.connect(g);
    if (p.trem) this.tremolo(g, t, dur, p.trem).connect(o);
    else g.connect(o);
    if (p.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = p.vib[0];
      lg.gain.setValueAtTime(p.vib[1], t);
      if (p.vibDecay) lg.gain.exponentialRampToValueAtTime(0.5, t + dur);
      l.connect(lg).connect(os.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    os.start(t);
    os.stop(t + dur + 0.05);
  }

  /** A gain that wobbles: [rate, depth]. Returns the node to connect onward. */
  private tremolo(input: AudioNode, t: number, dur: number, [rate, depth]: [number, number]): AudioNode {
    const ctx = this.ctx!;
    const am = ctx.createGain();
    am.gain.value = 1 - depth / 2;
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = rate;
    lg.gain.value = depth / 2;
    l.connect(lg).connect(am.gain);
    l.start(t);
    l.stop(t + dur + 0.05);
    input.connect(am);
    return am;
  }

  /** Filtered noise: clicks, thunks, swishes, rumbles. */
  private noise(o: AudioNode, t: number, dur: number, vol: number, p: NoiseOpts) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = dur > 1.8;
    const f = ctx.createBiquadFilter();
    f.type = p.type ?? 'bandpass';
    f.frequency.setValueAtTime(p.f, t);
    if (p.to) f.frequency.exponentialRampToValueAtTime(p.to, t + dur);
    f.Q.value = p.q ?? (f.type === 'bandpass' ? 1 : 0.5);
    const g = ctx.createGain();
    this.env(g.gain, t, vol, p.attack ?? 0.002, dur, p.hold);
    src.connect(f).connect(g);
    if (p.trem) this.tremolo(g, t, dur, p.trem).connect(o);
    else g.connect(o);
    src.start(t, src.loop ? 0 : Math.random() * Math.max(0, 1.9 - dur));
    src.stop(t + dur + 0.05);
  }

  /** A two-operator FM bell: a gentle ratio and an index that fades, so it is bright for a moment, then round. */
  private bell(o: AudioNode, t: number, f: number, dur: number, vol: number, ratio = 3.5, index = 1, attack = 0.002) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(index * f, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.5, index * f * 0.04), t + dur * 0.6);
    mod.connect(mg).connect(car.frequency);
    this.env(g.gain, t, vol, attack, dur);
    car.connect(g).connect(o);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  /** A marimba-ish note: a sine with a quick fourth-partial knock. */
  private mallet(o: AudioNode, t: number, f: number, dur: number, vol: number) {
    this.osc(o, t, f, dur, vol, { attack: 0.003 });
    this.osc(o, t, f * 3.99, Math.min(0.08, dur), vol * 0.25, { attack: 0.002 });
  }

  /** Karplus-Strong: a plucked string, rendered once per pitch and kept. */
  private pluck(o: AudioNode, t: number, f: number, dur: number, vol: number, bright = 0.5, bend = 0) {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate, n = Math.max(2, Math.floor(sr / f));
    const key = `${n}|${dur.toFixed(2)}|${bright.toFixed(2)}`;
    let buf = this.plucks.get(key);
    if (!buf) {
      const len = Math.ceil(sr * dur), d = new Float32Array(len);
      let lp = 0, mean = 0;
      const a = 0.08 + 0.9 * bright;
      for (let i = 0; i < n; i++) { lp += a * ((Math.random() * 2 - 1) - lp); d[i] = lp; mean += lp; }
      mean /= n;
      for (let i = 0; i < n; i++) d[i] -= mean;
      const rho = Math.pow(10, -3 / (dur * f));
      for (let i = n; i < len; i++) d[i] = rho * 0.5 * (d[i - n] + d[i - n - 1 < 0 ? 0 : i - n - 1]);
      let peak = 0;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
      if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
      buf = ctx.createBuffer(1, len, sr);
      buf.getChannelData(0).set(d);
      if (this.plucks.size > 96) this.plucks.clear();
      this.plucks.set(key, buf);
    }
    // the loop is a whole number of samples (plus half a sample from the averaging): tune the rest with the rate
    const rate = f / (sr / (n + 0.5));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate * (1 + bend), t);
    if (bend) src.playbackRate.exponentialRampToValueAtTime(rate, t + 0.07);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(9000, f * (3 + 8 * bright) + 600);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(lp).connect(g).connect(o);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** The Mult ladder: pitch climbs a pentatonic scale as Mult grows (the "numbers going up" trick). */
  private ladder(mult: number, base: number, maxSemis = 19) {
    const step = Math.max(0, Math.round((mult - 1) * 10));
    return base * Math.pow(2, Math.min(pent(step), maxSemis) / 12);
  }

  // ---- what the ball hit: one voice per part ----------------------------------------------------------------------

  /** A scoring hit (or a Lamp brightening). Saucers and the Kickback speak through `contact()` instead. */
  hit(id: PartId, mult: number, opts: HitInfo = {}) {
    const notes = opts.notes ?? [];
    switch (id) {
      case 'pop': this.bop(mult, 1); break;
      case 'roller': this.bop(mult, 0.85, true); break;
      case 'coin': this.chaChing(this.ladder(mult, 1175, 7)); break;
      case 'golden': this.goldRing(mult, (opts.money ?? 0) > 0); break;
      case 'mega': this.bigBoi(mult); break;
      case 'thunder': this.thunder(); break;
      case 'ding': this.dingDong(this.ladder(mult, 784, 7)); break;
      case 'sling': this.twang(this.ladder(mult, 165, 12)); break;
      case 'spinner': this.spin(opts.spins ?? 3); break;
      case 'lane': case 'rank': case 'wizard': this.laneRoll(); break;
      case 'tesla': this.zap(true); this.bop(mult, 0.8); break;
      case 'keg': if (opts.label === 'FUSE LIT!') this.fuse(); else this.bop(mult, 0.7); break;
      case 'laser': this.bop(mult, 0.9); if (opts.label === 'PEW!') this.pew(); break;
      case 'gong': this.gongHit(false); break;
      case 'sparkler': this.fizz(); this.bop(mult, 1.1); break;
      case 'firecracker': if (opts.label === 'WHOOSH!') this.rocket(); else this.bop(mult, 0.85); break;
      case 'rocks': this.clack(); break;
      case 'pinata': this.thwack(); break;
      case 'bell': if (notes.some((n) => n.endsWith(' toll'))) this.toll(false); else this.bop(mult, 0.95); break;
      case 'uplight': this.levelLight(this.ladder(mult, 1047, 12)); break;
      case 'lamp': this.lampGlow(opts.label); break;
      case 'vari': this.knock(opts.tier ?? 0); break;
      case 'bank': this.dropTarget(); break;
      case 'piggy': this.piggy(notes.some((n) => n.startsWith('piggy smashed'))); break;
      case 'duck': this.quack(opts.label === 'EDGE SHOT!'); break;
      case 'kickback': case 'magnet': case 'printer': case 'jackpot': break; // voiced by contact() and release()
      default: this.bop(mult, 0.9);
    }
    // the Cook's order filled: the service bell
    if (notes.some((n) => n.endsWith(' order'))) this.serviceBell();
    if (opts.hot) this.sparkle(3, 0.05);
  }

  /** A physical contact that no score speaks for: the Kickback's spring, a saucer catching, a bar, the goalie. */
  contact(id: PartId, ev: ContactInfo) {
    if (ev.kicked) { this.spring(); return; }
    if (ev.caught) {
      if (id === 'magnet') this.magnetGrab();
      else if (id === 'printer') this.printerWhirr();
      else this.scoop();
      return;
    }
    if (id === 'deflector') this.bar(ev.speed);
    else if (id === 'goal' && ev.mover) this.goalieSave(ev.speed);
  }

  /** A saucer letting its ball go. */
  release(id: PartId) {
    if (id === 'magnet') this.magnetThrow();
    else if (id === 'printer') this.printerPop();
    else this.eject();
  }

  /** Pop Bumper (and Roller Pop, which rumbles along its rail): a soft rubbery "bop". */
  private bop(mult: number, size: number, rolling = false) {
    const v = this.voice(rolling ? 'roller' : 'pop', 0.85, 0.4, 0.035, 5);
    if (!v) return;
    const { o, t } = v, f = this.ladder(mult, 247, 19) / size;
    this.osc(o, t, f * 1.6, 0.2, 0.42, { to: f, glide: 0.03, attack: 0.003 });
    this.osc(o, t, f * 0.5, 0.15, 0.3, { to: f * 0.4, attack: 0.003 });
    this.noise(o, t, 0.03, 0.14, { f: 900, type: 'lowpass' });
    if (rolling) this.noise(o, t + 0.02, 0.32, 0.22, { f: 260, type: 'lowpass', attack: 0.03, trem: [24, 0.8] });
  }

  /** Cha-Ching: the register key, the drawer, the bell, a jingle of coins. */
  private chaChing(f: number) {
    const v = this.voice('coin', 0.8, 0.9, 0.05, 4);
    if (!v) return;
    const { o, t } = v;
    this.noise(o, t, 0.025, 0.28, { f: 2400, q: 3 });
    this.osc(o, t, 190, 0.07, 0.28, { to: 110 });
    this.bell(o, t + 0.06, f, 0.8, 0.26, 3.01, 0.8);
    this.bell(o, t + 0.06, f * 1.5, 0.45, 0.08, 2, 0.5);
    for (let i = 0; i < 2; i++) this.bell(o, t + 0.13 + i * 0.05, rand(2600, 3400), 0.16, 0.05, 1.41, 0.5);
  }

  /** Golden Bumper: a bop and a bright gold ring, two bells a hair apart so it shimmers. */
  private goldRing(mult: number, coins: boolean) {
    const v = this.voice('golden', 0.8, 1.3, 0.05, 4);
    if (!v) return;
    const { o, t } = v, f = this.ladder(mult, 988, 7);
    this.osc(o, t, 330, 0.12, 0.3, { to: 196, attack: 0.003 });
    this.bell(o, t, f, 1.2, 0.18, 2, 1.1);
    this.bell(o, t, f * 1.006, 1.2, 0.14, 2, 1.1);
    this.bell(o, t + 0.04, f * 2, 0.6, 0.06, 3.5, 0.6);
    if (coins) for (let i = 0; i < 3; i++) this.bell(o, t + 0.15 + i * 0.06, rand(2400, 3400), 0.18, 0.05, 1.41, 0.5);
  }

  /** Big Boi: a deep, friendly "oomph", and a voice of his own on each machine. */
  private bigBoi(mult: number) {
    const v = this.voice('mega', 0.95, 0.9, 0.08, 3);
    if (!v) return;
    const { o, t } = v, lift = Math.pow(2, Math.min(4, Math.round((mult - 1) * 4)) / 12);
    this.osc(o, t, 92 * lift, 0.38, 0.6, { to: 48 * lift, glide: 0.25, attack: 0.006 });
    this.osc(o, t, 150 * lift, 0.28, 0.26, { type: 'triangle', to: 95 * lift, lp: 450, attack: 0.012 });
    this.noise(o, t, 0.06, 0.24, { f: 320, type: 'lowpass' });
    if (this.theme === 'diner') {
      // the Cook: a frying pan "bong" and a little sizzle
      this.bell(o, t, 349, 0.7, 0.13, 2.32, 1.2);
      this.noise(o, t + 0.05, 0.4, 0.035, { f: 6500, type: 'highpass', attack: 0.03, trem: [38, 0.9] });
    } else if (this.theme === 'castle') {
      // the Dragon: a low growl and a puff of smoke
      this.osc(o, t, 58, 0.5, 0.16, { type: 'sawtooth', lp: 300, vib: [19, 5], attack: 0.04 });
      this.noise(o, t + 0.05, 0.4, 0.12, { f: 900, type: 'lowpass', to: 200, attack: 0.04 });
    } else {
      // the Foreman: a metal "clong" and a puff of steam
      this.bell(o, t + 0.01, 196, 0.6, 0.12, 2.76, 0.9);
      this.noise(o, t + 0.08, 0.28, 0.05, { f: 5000, type: 'highpass', attack: 0.04 });
    }
  }

  /** Thunder Bumper: a bop and a soft roll of thunder. */
  private thunder() {
    const v = this.voice('thunder', 0.8, 1.1, 0.12, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 100, 0.25, 0.4, { to: 55, attack: 0.004 });
    this.noise(o, t, 0.05, 0.2, { f: 900, type: 'lowpass' });
    this.noise(o, t + 0.01, 1.0, 0.42, { f: 170, type: 'lowpass', attack: 0.04, trem: [8, 0.7] });
    this.noise(o, t + 0.08, 0.6, 0.18, { f: 420, type: 'lowpass', to: 120, attack: 0.06 });
  }

  /** Ding-Dong Bell: it actually goes ding, dong. */
  private dingDong(f: number) {
    const v = this.voice('ding', 0.75, 1.6, 0.25, 2);
    if (!v) return;
    const { o, t } = v;
    this.bell(o, t, f, 1.1, 0.24, 3.5, 0.9);
    this.osc(o, t, f / 2, 0.9, 0.06, { attack: 0.01 });
    this.bell(o, t + 0.3, f * 0.794, 1.3, 0.22, 3.5, 0.9);
    this.osc(o, t + 0.3, f * 0.397, 1.1, 0.06, { attack: 0.01 });
  }

  /** Slingshot: a rubber band, plucked and wobbling, with a soft snap. */
  private twang(f: number) {
    const v = this.voice('sling', 0.8, 0.4, 0.04, 4);
    if (!v) return;
    const { o, t } = v;
    this.pluck(o, t, f, 0.35, 0.55, 0.7, 0.12);
    this.noise(o, t, 0.02, 0.2, { f: 1400, type: 'lowpass' });
  }

  /** Spinner: a whirr and a ratchet whose clicks come fast for a fast ball and slow down as it stops. */
  private spin(spins: number) {
    const s = Math.max(1, Math.min(10, spins));
    const n = Math.max(3, Math.min(20, s * 2));
    let dt = 0.016 + (10 - s) * 0.004, tt = 0;
    const times: number[] = [];
    for (let i = 0; i < n; i++) { times.push(tt); tt += dt; dt *= 1.09; }
    const v = this.voice('spinner', 0.75, tt + 0.1, 0.06, 2);
    if (!v) return;
    const { o, t } = v;
    times.forEach((x, i) => {
      const fade = 1 - (i / n) * 0.5;
      this.noise(o, t + x, 0.012, 0.5 * fade, { f: 3200 - i * 40 + rand(-150, 150), q: 6 });
      this.osc(o, t + x, 1500 - i * 20, 0.012, 0.08 * fade, { attack: 0.001 });
    });
    this.noise(o, t, tt + 0.05, 0.16, { f: 900 + s * 90, q: 2, to: 320, attack: 0.02 });
  }

  /** Lane Rollover: a soft switch click and a note that climbs for each lane lit this ball. */
  private laneRoll() {
    const v = this.voice('lane', 0.75, 0.45, 0.04, 4);
    if (!v) return;
    const { o, t } = v, step = Math.min(this.laneStep++, 9);
    this.noise(o, t, 0.008, 0.25, { f: 2600, q: 4 });
    this.osc(o, t, 140, 0.05, 0.2, { to: 90 });
    this.mallet(o, t + 0.01, midi(72 + pent(step)), 0.4, 0.28);
  }

  /** Level Light: a glassy chime. */
  private levelLight(f: number) {
    const v = this.voice('uplight', 0.7, 0.8, 0.05, 3);
    if (!v) return;
    const { o, t } = v;
    this.noise(o, t, 0.008, 0.18, { f: 2600, q: 4 });
    this.bell(o, t, f, 0.75, 0.22, 3.5, 0.8);
  }

  /** Lamp: a warm hum as it glows, and a ping that climbs with its brightness. */
  private lampGlow(label?: string) {
    const v = this.voice('lamp', 0.75, 0.9, 0.06, 3);
    if (!v) return;
    const { o, t } = v;
    const m = label?.match(/LAMP (\d+)/);
    const step = m ? Number(m[1]) - 1 : label === 'LAMP FULL!' ? 5 : 0;
    this.osc(o, t, 110, 0.5, 0.14, { attack: 0.06, lp: 600 });
    this.osc(o, t, 220, 0.45, 0.06, { attack: 0.06 });
    this.bell(o, t + 0.07, midi(72 + pent(step)), 0.6, 0.16, 2, 0.6);
    if (label === 'LAMP FULL!') this.bell(o, t + 0.16, midi(79 + pent(step)), 0.7, 0.12, 2, 0.6);
  }

  /** Vari-Target: a wooden knock that rises with how hard it was hit. */
  private knock(tier: number) {
    const k = Math.max(0, Math.min(3, tier));
    const v = this.voice('vari', 0.8, 0.3, 0.04, 4);
    if (!v) return;
    const { o, t } = v, f = [520, 620, 740, 880][k];
    this.osc(o, t, f, 0.08, 0.5, { to: f * 0.92, attack: 0.001 });
    this.noise(o, t, 0.03, 0.2, { f: f * 2, q: 4 });
    if (k >= 2) this.osc(o, t, 130, 0.14, 0.15 * k, { to: 70 });
    if (k === 3) this.osc(o, t + 0.06, f * 1.5, 0.08, 0.3, { to: f * 1.38, attack: 0.001 });
  }

  /** A drop target: a clack, and a thunk as it falls. */
  private dropTarget() {
    const v = this.voice('bank', 0.8, 0.3, 0.03, 4);
    if (!v) return;
    const { o, t } = v;
    this.noise(o, t, 0.015, 0.35, { f: 2200, q: 3 });
    this.osc(o, t, 1200, 0.02, 0.08);
    this.osc(o, t + 0.025, 130, 0.16, 0.45, { to: 65 });
    this.noise(o, t + 0.025, 0.08, 0.2, { f: 380, type: 'lowpass' });
  }

  /** Piggy Bank: a coin clinking in, or the smash and the coins spilling out. */
  private piggy(smashed: boolean) {
    const v = this.voice(smashed ? 'piggySmash' : 'piggy', 0.8, smashed ? 0.8 : 0.4, 0.05, 3, smashed);
    if (!v) return;
    const { o, t } = v;
    if (!smashed) {
      this.noise(o, t, 0.02, 0.12, { f: 1700, q: 5 });
      this.bell(o, t, rand(2300, 2700), 0.35, 0.16, 2.4, 0.7);
      this.bell(o, t + 0.05, rand(1700, 1900), 0.25, 0.07, 2.4, 0.5);
      return;
    }
    this.noise(o, t, 0.35, 0.4, { f: 3000, q: 0.7 });
    this.noise(o, t, 0.12, 0.35, { f: 500, type: 'lowpass' });
    this.osc(o, t, 110, 0.15, 0.3, { to: 60 });
    for (let i = 0; i < 7; i++) this.bell(o, t + 0.04 + i * 0.045 + rand(0, 0.03), rand(1800, 3600), 0.3, 0.08, 2.4, 0.6);
  }

  /** Duck Gallery: a tin clank and a cross little quack. */
  private quack(edge: boolean) {
    const v = this.voice('duck', 0.8, 0.5, 0.06, 3);
    if (!v) return;
    const { o, t } = v, ctx = this.ctx!;
    this.bell(o, t, 1400, 0.22, 0.12, 2.9, 0.7);
    // the quack: a buzzy source through two vowel formants, pitch falling
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(310, t + 0.03);
    src.frequency.exponentialRampToValueAtTime(230, t + 0.18);
    const g = ctx.createGain();
    this.env(g.gain, t + 0.03, 0.5, 0.012, 0.18, 0.04);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    for (const [f, q, a] of [[850, 4, 1], [1350, 5, 0.6]] as const) {
      const bp = ctx.createBiquadFilter(), bg = ctx.createGain();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      bg.gain.value = a;
      src.connect(bp).connect(bg).connect(lp);
    }
    lp.connect(g).connect(o);
    src.start(t + 0.03);
    src.stop(t + 0.25);
    if (edge) this.bell(o, t + 0.12, 2093, 0.4, 0.1, 3.5, 0.6);
  }

  /** Kickback: a spring "boing" with a thump behind it. */
  private spring() {
    const v = this.voice('kickback', 0.85, 0.5, 0.1, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 80, 0.16, 0.45, { to: 48 });
    this.noise(o, t, 0.05, 0.2, { f: 500, type: 'lowpass' });
    this.osc(o, t, 190, 0.4, 0.3, { type: 'triangle', lp: 1600, vib: [22, 55], vibDecay: true });
  }

  /** Mag-Grab catching: a zap, and a magnetic hum rising while it charges. */
  private magnetGrab() {
    const v = this.voice('magnet', 0.75, 0.7, 0.1, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 1600, 0.08, 0.12, { type: 'triangle', to: 300, lp: 3000 });
    this.osc(o, t, 70, 0.6, 0.18, { to: 115, glide: 0.5, attack: 0.08, hold: 0.3, vib: [7, 2] });
    this.osc(o, t, 140, 0.6, 0.07, { to: 230, glide: 0.5, attack: 0.08, hold: 0.3, trem: [30, 0.6] });
  }

  /** Mag-Grab letting go: a zap upward and a whoosh as it throws. */
  private magnetThrow() {
    const v = this.voice('magnetThrow', 0.75, 0.35, 0.1, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 300, 0.12, 0.12, { type: 'triangle', to: 1400, lp: 2500 });
    this.noise(o, t, 0.28, 0.2, { f: 500, q: 1.5, to: 2600, attack: 0.03 });
  }

  /** Ball Printer: the motor whirring while it prints. */
  private printerWhirr() {
    const v = this.voice('printer', 0.7, 0.7, 0.15, 2);
    if (!v) return;
    const { o, t } = v;
    this.noise(o, t, 0.6, 0.18, { f: 650, q: 4, attack: 0.05, hold: 0.3, trem: [26, 0.7] });
    this.osc(o, t, 90, 0.6, 0.12, { type: 'triangle', to: 150, lp: 500, attack: 0.05, hold: 0.3 });
  }

  /** Ball Printer: the clunk and the pop of the ball coming out. */
  private printerPop() {
    const v = this.voice('printerPop', 0.8, 0.3, 0.1, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 150, 0.1, 0.25, { to: 80 });
    this.noise(o, t, 0.05, 0.2, { f: 500, type: 'lowpass' });
    this.osc(o, t + 0.05, 420, 0.06, 0.18, { to: 950, attack: 0.002 });
  }

  /** A fresh ball from the printer: a cheerful "ta-da". */
  printed() {
    const v = this.voice('printed', 0.7, 0.8, 0.2, 2);
    if (!v) return;
    const { o, t } = v;
    this.bell(o, t, 1047, 0.5, 0.16, 3.5, 0.6);
    this.bell(o, t + 0.1, 1568, 0.7, 0.16, 3.5, 0.6);
  }

  /** Jackpot Scoop (and any other saucer): a gulp as it swallows the ball. */
  private scoop() {
    const v = this.voice('scoop', 0.75, 0.25, 0.1, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 520, 0.16, 0.3, { to: 170, attack: 0.004 });
    this.noise(o, t, 0.1, 0.2, { f: 450, type: 'lowpass' });
  }

  /** A saucer firing its ball out: a soft "fwump". */
  private eject() {
    const v = this.voice('eject', 0.75, 0.3, 0.1, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 95, 0.14, 0.4, { to: 58 });
    this.noise(o, t, 0.22, 0.18, { f: 300, q: 1, to: 1500, attack: 0.01 });
  }

  /** Deflector: a rubbery bonk, as hard as the ball hit it. */
  private bar(speed: number) {
    if (speed < 4) return;
    const v = this.voice('deflector', 0.6 * Math.min(1, speed / 35), 0.15, 0.05, 4);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 220, 0.1, 0.4, { to: 150, attack: 0.003 });
    this.noise(o, t, 0.03, 0.2, { f: 700, type: 'lowpass' });
  }

  /** Goal!: the goalie gets a glove to it. */
  private goalieSave(speed: number) {
    if (speed < 3) return;
    const v = this.voice('goalie', 0.7 * Math.min(1, speed / 30), 0.25, 0.08, 3);
    if (!v) return;
    const { o, t } = v;
    this.noise(o, t, 0.05, 0.4, { f: 800, type: 'lowpass' });
    this.osc(o, t, 160, 0.12, 0.35, { to: 90 });
  }

  /** A diner's service bell: order up! */
  private serviceBell() {
    const v = this.voice('order', 0.6, 0.9, 0.2, 2);
    if (v) this.bell(v.o, v.t, 2637, 0.9, 0.16, 2.76, 0.7);
  }

  /** A few glittering high notes. */
  private sparkle(n: number, vol: number, spread = 0.06) {
    const v = this.voice('sparkle', 1, n * spread + 0.4, 0.08, 3);
    if (!v) return;
    for (let i = 0; i < n; i++) this.bell(v.o, v.t + i * spread, midi(84 + pent(Math.floor(rand(0, 8)))), 0.35, vol, 3.5, 0.5);
  }

  /** Glow Strip: a soft shimmer under the floor (it lights whenever anything pays a bonus). */
  glow() {
    const v = this.voice('strip', 0.7, 0.9, 0.3, 1);
    if (!v) return;
    const { o, t } = v;
    this.noise(o, t, 0.8, 0.05, { f: 6000, type: 'highpass', attack: 0.15, trem: [12, 0.8] });
    for (let i = 0; i < 5; i++) this.bell(o, t + 0.05 + i * 0.09, midi(88 + pent(i)), 0.4, 0.05, 2, 0.4);
  }

  // ---- bonuses and big moments ----------------------------------------------------------------------------------

  /** A part paid a bonus (a set, a level-up, a jackpot, a goal...): each has its own moment. */
  bonus(id?: PartId, label?: string, strips = false) {
    if (label === 'LANES COMPLETE' || label === 'LANE SETS MAXED') { this.laneSet(label === 'LANES COMPLETE'); this.laneStep = 0; }
    else if (label === 'BANK COMPLETE') this.bankSet();
    else if (label === 'GOAL!' || id === 'goal') this.goalCheer();
    else if (label === 'JACKPOT!' || id === 'jackpot') this.jackpotFanfare();
    else if (label === 'ARMOUR BROKEN!') this.dragonRoar();
    else if (label?.startsWith('THE BELL RINGS')) this.toll(true);
    else if (label === 'KABOOM!') this.kaboom();
    else if (label === 'BOOM!') this.gongHit(true);
    else if (id === 'clock') this.midnight();
    else if (id === 'wizard') this.wizardMode();
    else if (label === 'PIÑATA!') this.pinataBurst();
    else if (id === 'altar') this.ritual(label === 'TEMPEST!' ? 0 : label === 'INFERNO!' ? 1 : 2);
    else if (id === 'rank') this.rankUp(label?.startsWith('DIAMOND') ? 3 : label?.startsWith('GOLD') ? 2 : 1);
    else if (id === 'disco') this.disco();
    else if (id === 'xlane') this.swoosh(!label?.includes('MAXED'));
    else if (id === 'uplight') this.levelUp(!!label && /LEVEL/.test(label));
    else this.fanfare();
    if (strips) this.glow();
  }

  /** The default bonus: a little toy fanfare on mallets and a bell. */
  private fanfare() {
    const v = this.voice('fanfare', 0.7, 1, 0.15, 2, true);
    if (!v) return;
    this.duck(0.6, 0.4);
    [0, 4, 7, 12].forEach((s, i) => this.mallet(v.o, v.t + i * 0.07, midi(72 + s), 0.45, 0.22));
    this.bell(v.o, v.t + 0.28, midi(91), 0.7, 0.08, 3.5, 0.6);
  }

  private laneSet(paid: boolean) {
    const v = this.voice('laneSet', 0.7, 1, 0.2, 2, true);
    if (!v) return;
    this.duck(0.6, 0.4);
    const notes = paid ? [0, 4, 7, 9, 12, 16] : [7, 4];
    notes.forEach((s, i) => this.mallet(v.o, v.t + i * 0.06, midi(72 + s), 0.4, 0.2));
  }

  /** Drop-Target Bank complete: the three targets snap back up, and a chord. */
  private bankSet() {
    const v = this.voice('bankSet', 0.7, 1.1, 0.2, 2, true);
    if (!v) return;
    this.duck(0.6, 0.5);
    for (let i = 0; i < 3; i++) {
      this.noise(v.o, v.t + 0.25 + i * 0.07, 0.015, 0.25, { f: 2000 + i * 300, q: 3 });
      this.osc(v.o, v.t + 0.25 + i * 0.07, 300 + i * 80, 0.06, 0.2, { to: 420 + i * 100 });
    }
    [0, 4, 7].forEach((s, i) => this.mallet(v.o, v.t + i * 0.06, midi(67 + s), 0.6, 0.18));
  }

  /** Level Lights complete: a sparkle running up. */
  private levelUp(levelled: boolean) {
    const v = this.voice('levelUp', 0.7, 1, 0.2, 2, true);
    if (!v) return;
    this.duck(0.6, 0.4);
    const n = levelled ? 6 : 2;
    for (let i = 0; i < n; i++) this.bell(v.o, v.t + i * 0.06, midi(76 + pent(i * 2)), 0.6, 0.14, 3.5, 0.7);
  }

  /** A zap: a short electric crackle with a buzz under it. One voice for a burst, so many zaps stay one sound. */
  zap(big = false) {
    const v = this.voice('zap', big ? 0.7 : 0.5, 0.25, 0.06, 2);
    if (!v) return;
    const { o, t } = v;
    this.noise(o, t, big ? 0.2 : 0.12, 0.22, { f: 3800, type: 'highpass', trem: [70, 0.9] });
    this.osc(o, t, 110, big ? 0.18 : 0.1, 0.07, { to: 90, attack: 0.002 });
  }

  /** A spark touching a part: the smallest tick. Many at once stay a patter, not a roar. */
  tick() {
    const v = this.voice('tick', 0.25, 0.06, 0.04, 3);
    if (v) this.osc(v.o, v.t, rand(2600, 3400), 0.05, 0.06, { type: 'triangle', attack: 0.001 });
  }

  /** Sparkler: a short bright fizz. */
  private fizz() {
    const v = this.voice('fizz', 0.4, 0.3, 0.08, 2);
    if (v) this.noise(v.o, v.t, 0.25, 0.14, { f: 6000, type: 'highpass', trem: [45, 0.7] });
  }

  /** Firecracker: a rising whistle as the rocket goes up, and the bang when it bursts at the top. */
  private rocket() {
    const v = this.voice('rocket', 0.7, 1.4, 0.2, 2, true);
    if (!v) return;
    const fly = PARTS.firecracker.recipe.rocket!.delay;
    this.noise(v.o, v.t, fly, 0.16, { f: 2500, q: 2, attack: 0.05 });
    this.osc(v.o, v.t, 700, fly, 0.05, { to: 2400, glide: fly, attack: 0.03 });
    this.noise(v.o, v.t + fly, 0.6, 0.42, { f: 1400, type: 'lowpass' });
    this.osc(v.o, v.t + fly, 140, 0.35, 0.3, { to: 45, attack: 0.002 });
    for (let i = 0; i < 6; i++) this.noise(v.o, v.t + fly + 0.1 + i * rand(0.04, 0.08), 0.04, 0.12, { f: rand(3000, 6000), q: 3 });
  }

  /** Rock Pile: a dry stone clack. */
  private clack() {
    const v = this.voice('clack', 0.5, 0.15, 0.04, 3);
    if (!v) return;
    this.noise(v.o, v.t, 0.06, 0.3, { f: 1800, q: 4 });
    this.osc(v.o, v.t, 320, 0.07, 0.12, { to: 180, attack: 0.001 });
  }

  /** Piñata: a papery thwack. */
  private thwack() {
    const v = this.voice('thwack', 0.5, 0.2, 0.05, 3);
    if (!v) return;
    this.noise(v.o, v.t, 0.12, 0.3, { f: 900, q: 1.5 });
    this.osc(v.o, v.t, 180, 0.1, 0.12, { to: 110, attack: 0.002 });
  }

  /** Piñata bursting: a crunch of paper, a party horn and a patter of falling candy. */
  private pinataBurst() {
    const v = this.voice('pinata', 0.8, 1.6, 0.4, 1, true);
    if (!v) return;
    this.duck(0.5, 0.8);
    this.noise(v.o, v.t, 0.3, 0.45, { f: 1500, q: 0.8 });
    this.osc(v.o, v.t + 0.12, 520, 0.5, 0.08, { type: 'sawtooth', lp: 2400, to: 700, glide: 0.4, attack: 0.02 });
    for (let i = 0; i < 10; i++) this.noise(v.o, v.t + 0.3 + i * rand(0.05, 0.1), 0.04, 0.1, { f: rand(2500, 5000), q: 4 });
  }

  /** Wizard Lamp: WIZARD MODE, a long rising run of bells over a big chord. */
  private wizardMode() {
    const v = this.voice('wizard', 0.9, 2.6, 0.5, 1, true);
    if (!v) return;
    this.duck(0.4, 1.6);
    for (let i = 0; i < 14; i++) this.bell(v.o, v.t + i * 0.06, midi(67 + pent(i)), 0.6, 0.1, 3.5, 0.7);
    for (const n of [55, 59, 62, 67]) this.osc(v.o, v.t + 0.85, midi(n), 1.6, 0.05, { type: 'sawtooth', lp: 1600, attack: 0.05, hold: 0.6, detune: 5 });
  }

  /** Midnight Clock: twelve quick chimes over a low gong, then the madness. */
  private midnight() {
    const v = this.voice('midnight', 0.8, 2.6, 0.5, 1, true);
    if (!v) return;
    this.duck(0.5, 1.4);
    for (let i = 0; i < 12; i++) this.bell(v.o, v.t + i * 0.12, midi(i % 2 ? 79 : 84), 0.5, 0.09, 3.5, 0.8);
    this.bell(v.o, v.t, 98, 2.4, 0.2, 1.41, 1.5);
  }

  /** Ritual Altar: a low choir-ish drone (a stack of detuned saws), then the ritual's own colour. */
  private ritual(kind: number) {
    const v = this.voice('ritual', 0.8, 2.2, 0.5, 1, true);
    if (!v) return;
    this.duck(0.5, 1.2);
    for (const [n, d] of [[45, -6], [52, 5], [57, -3]] as const) this.osc(v.o, v.t, midi(n), 1.8, 0.05, { type: 'sawtooth', lp: 900, attack: 0.25, hold: 0.8, detune: d });
    if (kind === 0) this.noise(v.o, v.t + 0.2, 1.2, 0.3, { f: 600, type: 'lowpass', attack: 0.01 });
    if (kind === 1) this.noise(v.o, v.t + 0.1, 1.4, 0.2, { f: 1800, q: 0.7, attack: 0.3, trem: [12, 0.4] });
    if (kind === 2) for (let i = 0; i < 8; i++) this.noise(v.o, v.t + 0.3 + i * 0.09, 0.05, 0.12, { f: rand(3000, 6000), q: 3 });
  }

  /** The Altar's Tempest striking: a crack of thunder (one voice, however many strike). */
  strike() {
    const v = this.voice('strike', 0.6, 0.8, 0.12, 2);
    if (!v) return;
    this.noise(v.o, v.t, 0.08, 0.35, { f: 4000, type: 'highpass' });
    this.noise(v.o, v.t + 0.03, 0.7, 0.3, { f: 500, type: 'lowpass' });
  }

  /** Powder Keg: the fuse catches and hisses. */
  private fuse() {
    const v = this.voice('fuse', 0.6, 0.6, 0.2, 2);
    if (v) this.noise(v.o, v.t, 0.55, 0.18, { f: 5000, type: 'highpass', attack: 0.02, trem: [30, 0.6] });
  }

  /** Powder Keg: the bang, a thump under a rush of noise. */
  private kaboom() {
    const v = this.voice('kaboom', 0.9, 1.2, 0.15, 2, true);
    if (!v) return;
    this.duck(0.5, 0.6);
    this.noise(v.o, v.t, 0.9, 0.5, { f: 700, type: 'lowpass' });
    this.osc(v.o, v.t, 90, 0.6, 0.4, { to: 32, attack: 0.002 });
  }

  /** Laser Turret: a falling "pew". */
  private pew() {
    const v = this.voice('pew', 0.5, 0.3, 0.08, 3);
    if (v) this.osc(v.o, v.t, 1900, 0.22, 0.12, { to: 260, type: 'square', attack: 0.002 });
  }

  /** Shockwave Gong: a brassy bong; the boom is a long, deep crash. */
  private gongHit(boom: boolean) {
    const v = this.voice(boom ? 'gongBoom' : 'gong', boom ? 0.9 : 0.55, boom ? 3 : 1.2, boom ? 0.3 : 0.12, boom ? 1 : 3, boom);
    if (!v) return;
    if (boom) this.duck(0.5, 1.2);
    this.bell(v.o, v.t, boom ? 82 : 147, boom ? 2.8 : 1.1, boom ? 0.3 : 0.16, 1.41, boom ? 2.2 : 1.2);
    if (boom) this.noise(v.o, v.t, 1.4, 0.18, { f: 1800, type: 'lowpass', attack: 0.01 });
  }

  /** Old Bell: one deep bronze toll; when it rings for the run, three, over a low hum. */
  private toll(rings: boolean) {
    const v = this.voice(rings ? 'tollRings' : 'toll', 0.8, rings ? 3.4 : 2, 0.4, 1, rings);
    if (!v) return;
    if (rings) this.duck(0.5, 1.4);
    const n = rings ? 3 : 1;
    for (let i = 0; i < n; i++) {
      this.bell(v.o, v.t + i * 0.75, 196, 2.2, 0.26, 2.76, 1.1);
      this.osc(v.o, v.t + i * 0.75, 98, 1.8, 0.08, { attack: 0.02 });
    }
  }

  /** Rank Lights: a bugle-ish rising call, one note higher for every rank. */
  private rankUp(step: number) {
    const v = this.voice('rank', 0.7, 1.2, 0.2, 2, true);
    if (!v) return;
    this.duck(0.6, 0.4);
    const notes = [0, 5, 9, 12, 16].slice(0, 2 + step);
    notes.forEach((s, i) => this.mallet(v.o, v.t + i * 0.08, midi(67 + s), 0.5, 0.2));
    this.bell(v.o, v.t + notes.length * 0.08, midi(79 + notes[notes.length - 1]), 0.8, 0.08, 3.5, 0.6);
  }

  /** Jackpot Scoop cashing in: a mellow brass fanfare and a shower of coins. */
  private jackpotFanfare() {
    const v = this.voice('jackpot', 0.8, 1.8, 0.3, 1, true);
    if (!v) return;
    this.duck(0.4, 1.0);
    const { o, t } = v;
    const brass = (at: number, n: number, dur: number, vol: number) => {
      for (const d of [-7, 7]) this.osc(o, at, midi(n), dur, vol, { type: 'sawtooth', lp: 1300, attack: 0.03, hold: dur * 0.4, detune: d });
    };
    brass(t, 67, 0.16, 0.08);
    brass(t + 0.14, 67, 0.12, 0.08);
    brass(t + 0.26, 72, 0.9, 0.09);
    brass(t + 0.26, 76, 0.9, 0.06);
    brass(t + 0.26, 79, 0.9, 0.05);
    for (let i = 0; i < 8; i++) this.bell(o, t + 0.3 + i * 0.07 + rand(0, 0.03), rand(2200, 3600), 0.25, 0.05, 1.41, 0.5);
  }

  /** Goal!: the referee's whistle and the crowd going up. */
  private goalCheer() {
    const v = this.voice('goalCheer', 0.75, 2, 0.5, 1, true);
    if (!v) return;
    this.duck(0.4, 1.2);
    const { o, t } = v;
    this.osc(o, t, 2500, 0.5, 0.07, { attack: 0.015, hold: 0.3, vib: [28, 120], lp: 4000 });
    this.noise(o, t + 0.1, 1.7, 0.26, { f: 900, q: 0.8, attack: 0.3, trem: [7, 0.3] });
    this.noise(o, t + 0.1, 1.5, 0.14, { f: 2200, q: 1.2, attack: 0.35 });
    this.noise(o, t + 0.05, 1.7, 0.12, { f: 450, q: 1, attack: 0.25 });
    for (let i = 0; i < 5; i++) {
      const f = rand(260, 480);
      this.osc(o, t + 0.15 + rand(0, 0.25), f, 1.0, 0.025, { type: 'sawtooth', lp: 1100, to: f * rand(1.15, 1.4), glide: 0.4, vib: [5, 6], attack: 0.15, hold: 0.3 });
    }
  }

  /** X Lane: a rising swoosh (a small one once it is maxed). */
  private swoosh(full: boolean) {
    const v = this.voice('xlane', full ? 0.75 : 0.45, 0.8, 0.2, 2, true);
    if (!v) return;
    if (full) this.duck(0.6, 0.4);
    const { o, t } = v;
    this.noise(o, t, 0.4, 0.3, { f: 300, q: 1.5, to: 3500, attack: 0.1 });
    this.osc(o, t, 330, 0.4, 0.1, { type: 'triangle', to: 990, attack: 0.08, lp: 2000 });
    if (full) this.bell(o, t + 0.36, 1568, 0.5, 0.12, 3.5, 0.6);
  }

  /** Disco Ball: a four-on-the-floor thump, an octave bass and a glitter of notes. */
  private disco() {
    const v = this.voice('disco', 0.75, 1.3, 0.5, 1, true);
    if (!v) return;
    this.duck(0.4, 1.0);
    const { o, t } = v;
    for (let i = 0; i < 2; i++) {
      this.osc(o, t + i * 0.25, 110, 0.22, 0.2, { to: 50 });
      this.osc(o, t + i * 0.25, midi(i ? 45 : 33), 0.2, 0.16, { type: 'triangle', lp: 600 });
      this.noise(o, t + i * 0.25 + 0.125, 0.18, 0.05, { f: 7000, type: 'highpass' });
    }
    for (let i = 0; i < 10; i++) this.bell(o, t + 0.05 + i * 0.06, midi(84 + pent(Math.floor(rand(0, 9)))), 0.4, 0.06, 3.5, 0.5);
  }

  /** The Dragon's armour breaking: a gong and a long growl. */
  private dragonRoar() {
    const v = this.voice('roar', 0.8, 2.2, 0.5, 1, true);
    if (!v) return;
    this.duck(0.4, 1.0);
    const { o, t } = v;
    this.bell(o, t, 98, 2.2, 0.22, 1.41, 2);
    this.osc(o, t, 62, 0.9, 0.18, { type: 'sawtooth', to: 45, lp: 350, vib: [17, 6], attack: 0.08, hold: 0.3 });
    this.noise(o, t + 0.05, 0.8, 0.14, { f: 1000, type: 'lowpass', to: 180, attack: 0.08 });
  }

  /** A Mult stamp landing on the dial: a soft rubber-stamp "thup". */
  stamp() {
    const v = this.voice('stamp', 0.7, 0.15, 0.08, 3);
    if (!v) return;
    this.noise(v.o, v.t, 0.04, 0.3, { f: 700, type: 'lowpass' });
    this.osc(v.o, v.t, 190, 0.09, 0.3, { to: 120 });
  }

  /** A coin landing on the money stack: a small clink. */
  coinLand() {
    const v = this.voice('coinLand', 0.6, 0.2, 0.03, 5);
    if (v) this.bell(v.o, v.t, rand(2100, 2700), 0.18, 0.12, 2.4, 0.6);
  }

  // ---- the ball and the cabinet ------------------------------------------------------------------------------------

  /** Flippers: a soft clack up, a softer one down. */
  flipper(on: boolean) {
    const v = this.voice(on ? 'flipUp' : 'flipDown', on ? 0.7 : 0.4, 0.08, 0.03, 4);
    if (!v) return;
    const { o, t } = v;
    if (on) {
      this.noise(o, t, 0.018, 0.22, { f: 1300, q: 1.2 });
      this.osc(o, t, 150, 0.05, 0.25, { to: 85 });
    } else {
      this.noise(o, t, 0.012, 0.12, { f: 700, q: 1 });
      this.osc(o, t, 110, 0.04, 0.15, { to: 70 });
    }
  }

  /** The plunger: a thwump and a spring. */
  launch(power: number) {
    const p = clamp01(power / 110);
    const v = this.voice('launch', 0.5 + 0.4 * p, 0.5, 0.1, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 90, 0.15, 0.35, { to: 55 });
    this.noise(o, t, 0.12, 0.16, { f: 600, type: 'lowpass' });
    this.osc(o, t, 150 + p * 110, 0.42, 0.26, { type: 'triangle', lp: 1500, vib: [16, 20 + 40 * p], vibDecay: true });
    this.bell(o, t, 880, 0.25, 0.04, 4.1, 0.5);
  }

  /** A ball lost: a gentle descending sigh. */
  drain() {
    this.laneStep = 0;
    const v = this.voice('drain', 0.7, 0.9, 0.3, 2);
    if (!v) return;
    const { o, t } = v;
    this.osc(o, t, 392, 0.8, 0.14, { type: 'triangle', to: 196, glide: 0.75, attack: 0.06, lp: 1400, vib: [5, 4] });
    this.osc(o, t + 0.05, 330, 0.8, 0.1, { type: 'triangle', to: 165, glide: 0.75, attack: 0.06, lp: 1400 });
    this.noise(o, t, 0.6, 0.05, { f: 1200, type: 'lowpass', to: 300, attack: 0.1 });
  }

  /** The round's goal reached: a warm chime arpeggio. */
  goal() {
    const v = this.voice('goalReached', 0.7, 1.6, 0.3, 1, true);
    if (!v) return;
    this.duck(0.5, 0.8);
    [72, 76, 79, 84].forEach((n, i) => this.bell(v.o, v.t + i * 0.11, midi(n), 0.9, 0.16, 3.5, 0.7));
    for (const n of [60, 64, 67]) this.osc(v.o, v.t + 0.33, midi(n), 1.1, 0.05, { type: 'triangle', lp: 1500, attack: 0.08, hold: 0.3 });
  }

  /** Tilt: a low, wobbly groan. */
  tilt() {
    const v = this.voice('tilt', 0.75, 1, 0.5, 1, true);
    if (!v) return;
    this.duck(0.4, 1.0);
    const { o, t } = v;
    this.osc(o, t, 110, 0.9, 0.25, { type: 'triangle', to: 82, lp: 500 });
    this.osc(o, t, 116.5, 0.9, 0.2, { type: 'triangle', to: 78, lp: 500 });
    this.noise(o, t, 0.6, 0.25, { f: 180, type: 'lowpass' });
  }

  /** A nudge: the cabinet thumped. */
  nudge() {
    const v = this.voice('nudge', 0.7, 0.15, 0.08, 3);
    if (!v) return;
    this.osc(v.o, v.t, 75, 0.14, 0.45, { to: 45 });
    this.noise(v.o, v.t, 0.08, 0.25, { f: 220, type: 'lowpass' });
  }

  /** Ball Saver: a gentle chime, the ball is back. */
  saved() {
    const v = this.voice('saved', 0.7, 1.2, 0.3, 1, true);
    if (!v) return;
    this.duck(0.6, 0.5);
    [67, 72, 76, 79].forEach((n, i) => this.bell(v.o, v.t + i * 0.08, midi(n), 0.8, 0.14, 3.5, 0.6));
  }

  // ---- the workshop -------------------------------------------------------------------------------------------------

  /** A shop card rolling down onto the shelf (one per card, climbing). */
  shopRoll(i: number) {
    const v = this.voice('shopRoll', 0.6, 0.3, 0.04, 6);
    if (!v) return;
    this.noise(v.o, v.t, 0.06, 0.12, { f: 2200, q: 1.5, to: 3200 });
    this.mallet(v.o, v.t + 0.02, midi(67 + pent(i)), 0.22, 0.2);
  }
  /** Money changes hands: a small "ka-ching". */
  buy() {
    const v = this.voice('buy', 0.65, 0.6, 0.06, 3);
    if (!v) return;
    this.noise(v.o, v.t, 0.02, 0.18, { f: 2500, q: 3 });
    this.bell(v.o, v.t + 0.05, 1568, 0.5, 0.16, 3.01, 0.8);
    this.bell(v.o, v.t + 0.09, 2093, 0.4, 0.08, 3.01, 0.6);
  }
  /** A part picked up off the shelf, the toolbox or the table. */
  pickUp() {
    const v = this.voice('pickUp', 0.6, 0.12, 0.04, 4);
    if (!v) return;
    this.osc(v.o, v.t, 330, 0.09, 0.22, { type: 'triangle', to: 520, glide: 0.06, lp: 2000 });
    this.noise(v.o, v.t, 0.01, 0.08, { f: 3000, q: 3 });
  }
  /** A part set down on the table: a solid wooden clunk. */
  place() {
    const v = this.voice('place', 0.7, 0.15, 0.04, 4);
    if (!v) return;
    this.osc(v.o, v.t, 240, 0.08, 0.4, { to: 180, attack: 0.002 });
    this.noise(v.o, v.t, 0.05, 0.3, { f: 500, type: 'lowpass' });
    this.osc(v.o, v.t, 90, 0.1, 0.25, { to: 60 });
  }
  /** A part sold, peeled or put back: a soft "bloop" down. */
  remove() {
    const v = this.voice('remove', 0.6, 0.18, 0.05, 3);
    if (v) this.osc(v.o, v.t, 440, 0.14, 0.24, { type: 'triangle', to: 200, lp: 1800 });
  }
  /** The receipt printing a line: a soft dot-matrix chatter. */
  print(lines = 1) {
    const n = Math.min(14, Math.max(1, lines) * 4);
    const v = this.voice('print', 0.55, n * 0.028 + 0.05, 0.05, 3);
    if (!v) return;
    for (let i = 0; i < n; i++) this.noise(v.o, v.t + i * 0.028, 0.012, 0.1, { f: 2600 + (i % 2) * 400, q: 3 });
    this.noise(v.o, v.t, n * 0.028, 0.04, { f: 500, type: 'lowpass', attack: 0.01 });
  }
  /** A round cleared: a snare roll, a brass fanfare up to a big major chord, a kick and a cymbal, bells raining down. */
  roundWon(big = false) {
    const v = this.voice('roundWon', 0.85, 3.2, 1, 1, true);
    if (!v) return;
    this.duck(0.15, 2.6);
    const { o, t } = v;
    for (let i = 0; i < 12; i++) this.noise(o, t + i * 0.03, 0.028, 0.05 + i * 0.01, { f: 2300, q: 0.8 });
    const brass = (at: number, n: number, dur: number, vol: number) => {
      for (const d of [-8, 8]) this.osc(o, at, midi(n), dur, vol, { type: 'sawtooth', lp: 1900, attack: 0.02, hold: dur * 0.55, detune: d });
      this.osc(o, at, midi(n - 12), dur, vol * 0.6, { type: 'triangle', lp: 900, attack: 0.02, hold: dur * 0.55 });
    };
    const s = t + 0.38;
    // ta-ta-ta TAAA, da-da DAAAAH
    brass(s, 67, 0.11, 0.075); brass(s + 0.13, 67, 0.11, 0.075); brass(s + 0.26, 67, 0.11, 0.075);
    brass(s + 0.4, 72, 0.32, 0.085);
    brass(s + 0.76, 74, 0.13, 0.075); brass(s + 0.9, 76, 0.13, 0.075);
    const hit = s + 1.05;
    for (const n of big ? [72, 76, 79, 84, 88] : [72, 76, 79, 84]) brass(hit, n, 1.3, 0.055);
    this.osc(o, hit, 130, 0.3, 0.45, { to: 42, glide: 0.2 });
    this.noise(o, hit, 1.6, 0.16, { f: 5200, type: 'highpass', attack: 0.004 });
    this.noise(o, hit, 0.3, 0.12, { f: 400, type: 'lowpass' });
    for (let i = 0; i < (big ? 16 : 10); i++) this.bell(o, hit + 0.08 + i * 0.07 + rand(0, 0.03), midi(84 + pent(Math.floor(rand(0, 10)))), 0.5, 0.06, 3.5, 0.5);
  }

  /** A line of the round's payout counted in: a coin, climbing. */
  tally(i: number) {
    const v = this.voice('tally', 0.65, 0.4, 0.05, 6);
    if (!v) return;
    this.noise(v.o, v.t, 0.015, 0.12, { f: 3000, q: 3 });
    this.bell(v.o, v.t + 0.02, midi(79 + pent(i * 2)), 0.35, 0.13, 3.01, 0.7);
  }

  /** Big Boi poked on the main menu: a rubbery boing. */
  poke() {
    const v = this.voice('poke', 0.7, 0.6, 0.12, 3);
    if (!v) return;
    this.osc(v.o, v.t, 170, 0.5, 0.3, { type: 'triangle', to: 340, glide: 0.1, lp: 1800, vib: [13, 45], vibDecay: true });
    this.osc(v.o, v.t, 95, 0.12, 0.3, { to: 60 });
  }

  /** The run is over: a slow music box, running down. */
  gameOver() {
    const v = this.voice('gameOver', 0.7, 2.6, 1, 1, true);
    if (!v) return;
    this.duck(0.3, 2.5);
    [67, 63, 60, 55].forEach((n, i) => this.bell(v.o, v.t + i * 0.34, midi(n), 1.4, 0.16, 3, 0.5));
    this.osc(v.o, v.t + 1.0, midi(48), 1.5, 0.08, { type: 'triangle', lp: 700, attack: 0.1, hold: 0.4 });
  }
  /** A decal revealed: a rising run of bells and a soft whoosh. */
  decalReveal() {
    const v = this.voice('decalReveal', 0.7, 1.3, 0.3, 2, true);
    if (!v) return;
    this.duck(0.6, 0.8);
    this.noise(v.o, v.t, 0.6, 0.1, { f: 800, q: 1, to: 4000, attack: 0.25 });
    for (let i = 0; i < 7; i++) this.bell(v.o, v.t + i * 0.07, midi(72 + pent(i)), 0.6, 0.1, 3.5, 0.6);
    this.bell(v.o, v.t + 0.5, midi(91), 0.9, 0.08, 2, 0.5);
  }
  /** A decal picked: peeled off its backing, patted down, ding. */
  decalPick() {
    const v = this.voice('decalPick', 0.7, 0.9, 0.2, 2, true);
    if (!v) return;
    this.noise(v.o, v.t, 0.14, 0.16, { f: 1500, q: 1, to: 5000, attack: 0.02 });
    this.osc(v.o, v.t + 0.16, 200, 0.09, 0.32, { to: 130 });
    this.noise(v.o, v.t + 0.16, 0.05, 0.22, { f: 600, type: 'lowpass' });
    this.bell(v.o, v.t + 0.22, 1047, 0.5, 0.12, 3.5, 0.6);
    this.bell(v.o, v.t + 0.3, 1568, 0.6, 0.12, 3.5, 0.6);
  }

  // ---- music: a lookahead scheduler plays the machine's loop softly underneath ---------------------------------------

  private startMusic() {
    if (!this.ctx || this.timer) return;
    this.nextBeat = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => {
      const ctx = this.ctx;
      if (ctx instanceof AudioContext && ctx.state === 'running') this.scheduleMusic(ctx.currentTime + 0.3);
    }, 100);
  }

  /** Schedule the music's notes up to `until` (context time). The scheduler calls it; so can an offline render. */
  scheduleMusic(until: number) {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const s = this.song, loop = s.bars * s.steps;
    let step = 60 / this.bpm / 2;
    if (this.nextBeat < ctx.currentTime) {
      // fell behind (a hidden tab): skip the missed steps instead of playing them all at once
      const missed = Math.ceil((ctx.currentTime - this.nextBeat) / step);
      this.nextBeat += missed * step;
      this.beat += missed;
    }
    while (this.nextBeat < until) {
      const b = this.beat % loop, bar = Math.floor(b / s.steps), st = b % s.steps;
      const t = this.nextBeat + (st % 2 ? s.swing * step : 0);
      if (this.musicOn && this.musicVolume > 0 && !this.muted) {
        if (this.theme === 'diner') this.dinerStep(t, bar, st, step);
        else if (this.theme === 'castle') this.castleStep(t, bar, st, step);
        else this.factoryStep(t, bar, st, step);
        this.driveStep(t, bar, st, step);
      }
      this.nextBeat += step;
      this.beat++;
      // the energy ramps (up quickly when a round starts, down more gently after it), and the mix follows it
      const d = this.energyTarget - this.energy;
      this.energy = Math.abs(d) < 0.01 ? this.energyTarget : this.energy + d * (d > 0 ? 0.09 : 0.05);
      step = 60 / this.bpm / 2;
      if (Math.abs(this.energy - this.energyHeard) > 0.03 || (this.energy !== this.energyHeard && this.energy === this.energyTarget)) {
        this.energyHeard = this.energy;
        this.applyMusicGain();
        this.setEcho();
        this.mtone?.frequency.setTargetAtTime(3600 + 3400 * this.energy, ctx.currentTime, 0.3);
      }
    }
  }

  /** Funhouse Factory: a music box over a felt pad and a soft bass, a clock ticking. */
  private factoryStep(t: number, bar: number, st: number, step: number) {
    const m = this.music!, ch = FACTORY_CHORDS[bar];
    const root = 36 + ((ch[0] % 12) + 12) % 12;
    if (st === 0) {
      for (const n of ch) this.pad(m, t, midi(60 + n), step * 8, 0.014);
      this.softBass(m, t, midi(root), step * 3.5, 0.2);
    }
    if (st === 4) this.softBass(m, t, midi(root + 7), step * 3, 0.14);
    if (st % 2 === 1) this.musicBox(m, t, midi(72 + ch[[0, 2, 1, 3][st >> 1] % ch.length]), 0.9, 0.04);
    const n = FACTORY_MELODY[bar * 8 + st];
    if (n) this.musicBox(m, t, midi(n + 12), 1.6, 0.09);
    if (st % 2 === 0) this.noise(m, t, 0.012, st % 4 === 0 ? 0.05 : 0.035, { f: st % 4 === 0 ? 3400 : 2300, q: 6 });
  }

  /** Short Order: an upright bass walking, electric piano comping, vibes, brushes and finger snaps. */
  private dinerStep(t: number, bar: number, st: number, step: number) {
    const m = this.music!, ch = DINER_CHORDS[bar];
    if (st % 2 === 0) this.pluck(m, t, midi(DINER_BASS[bar][st >> 1]), 0.7, 0.42, 0.25);
    if (st === 0) for (const n of ch) this.ePiano(m, t, midi(n), step * 3, 0.04);
    if (st === 3 || (st === 7 && bar % 2 === 1)) for (const n of ch) this.ePiano(m, t, midi(n), step * 1.4, 0.03);
    if (st === 2 || st === 6) {
      this.noise(m, t, 0.03, 0.07, { f: 1800, q: 2.5 });
      this.noise(m, t, 0.18, 0.025, { f: 3000, type: 'lowpass', attack: 0.04 });
    }
    if (st % 2 === 1) this.noise(m, t, 0.03, 0.012, { f: 6000, type: 'highpass' });
    const n = DINER_MELODY[bar * 8 + st];
    if (n) this.vibes(m, t, midi(n), step * 3, 0.085);
  }

  /** Castle Crash: a lute arpeggio over a plucked bass, a frame drum, a recorder tune. */
  private castleStep(t: number, bar: number, st: number, step: number) {
    const m = this.music!, [root, minor] = CASTLE_CHORDS[bar];
    const off = LUTE_ARP[st] < 0 ? 12 + (minor ? 3 : 4) : LUTE_ARP[st];
    this.pluck(m, t, midi(root + off), 1.1, st === 0 ? 0.13 : 0.09, 0.55);
    if (st === 0) {
      this.pluck(m, t, midi(root - 12), 1.8, 0.2, 0.3);
      this.pad(m, t, midi(root - 12), step * 6, 0.02);
      this.pad(m, t, midi(root - 5), step * 6, 0.014);
    }
    if (st === 0 || st === 3) {
      this.osc(m, t, 95, 0.3, st === 0 ? 0.22 : 0.12, { to: 58, glide: 0.12 });
      this.noise(m, t, 0.05, st === 0 ? 0.08 : 0.05, { f: 500, type: 'lowpass' });
    }
    if (st === 5 && bar % 2 === 1) this.noise(m, t, 0.07, 0.02, { f: 7000, type: 'highpass' });
    const i = bar * 6 + st, n = CASTLE_MELODY[i];
    if (n) {
      let len = 1;
      while (len < 4 && CASTLE_MELODY[(i + len) % CASTLE_MELODY.length] === null) len++;
      this.recorder(m, t, midi(n), step * len, 0.05);
    }
  }

  /** The round's drive under any machine's tune: a kick on the beat, a backbeat, hats and a pumping bass on the chord's root. */
  private driveStep(t: number, bar: number, st: number, step: number) {
    const e = this.energy;
    if (e < 0.05) return;
    const m = this.music!, six = this.song.steps === 6;
    const onBeat = six ? st % 3 === 0 : st % 2 === 0;
    const back = six ? st === 3 : st === 2 || st === 6;
    if (onBeat) this.osc(m, t, 125, 0.18, 0.34 * e, { to: 46, glide: 0.11, attack: 0.002 });
    if (back) {
      this.noise(m, t, 0.11, 0.1 * e, { f: 1900, q: 0.8 });
      this.osc(m, t, 210, 0.07, 0.1 * e, { type: 'triangle', to: 150 });
    }
    this.noise(m, t, st % 2 ? 0.035 : 0.02, (st % 2 ? 0.045 : 0.025) * e, { f: 8500, type: 'highpass' });
    const root = this.theme === 'diner' ? DINER_BASS[bar][0] : this.theme === 'castle' ? CASTLE_CHORDS[bar][0] - 12 : 36 + ((FACTORY_CHORDS[bar][0] % 12) + 12) % 12;
    this.softBass(m, t, midi(root + (st % 2 ? 12 : 0)), step * 0.85, 0.13 * e);
  }

  /** A music box tine: a mellow FM bell with a faint high ping. */
  private musicBox(o: AudioNode, t: number, f: number, dur: number, vol: number) {
    this.bell(o, t, f, dur, vol, 3, 0.5);
    this.osc(o, t, f * 5.93, 0.08, vol * 0.15, { attack: 0.001 });
  }
  /** A soft held note: two detuned triangles, low-passed, slow in and out. */
  private pad(o: AudioNode, t: number, f: number, dur: number, vol: number) {
    for (const d of [-6, 6]) this.osc(o, t, f, dur + 0.4, vol, { type: 'triangle', lp: 900, attack: 0.4, hold: Math.max(0, dur - 0.8), detune: d });
  }
  /** A round bass note: a sine and a quiet triangle an octave up, plucked. */
  private softBass(o: AudioNode, t: number, f: number, dur: number, vol: number) {
    this.osc(o, t, f, dur, vol, { attack: 0.01, lp: 500 });
    this.osc(o, t, f * 2, dur * 0.6, vol * 0.25, { type: 'triangle', attack: 0.01, lp: 600 });
  }
  /** Electric piano: FM at ratio 1, the bark fading fast into a round tone. */
  private ePiano(o: AudioNode, t: number, f: number, dur: number, vol: number) {
    this.bell(o, t, f, dur, vol, 1, 1.2, 0.004);
    this.osc(o, t, f * 7, 0.05, vol * 0.1, { attack: 0.001 });
  }
  /** Vibraphone: a sine and its fourth partial, with the motor's tremolo. */
  private vibes(o: AudioNode, t: number, f: number, dur: number, vol: number) {
    this.osc(o, t, f, dur, vol, { attack: 0.003, trem: [5.5, 0.4] });
    this.osc(o, t, f * 4, 0.15, vol * 0.2, { attack: 0.002 });
  }
  /** Recorder: a breathy sine with a late vibrato. */
  private recorder(o: AudioNode, t: number, f: number, dur: number, vol: number) {
    this.osc(o, t, f, dur + 0.1, vol, { attack: 0.05, hold: Math.max(0, dur - 0.15), vib: [5, f * 0.006] });
    this.osc(o, t, f * 2, dur + 0.1, vol * 0.12, { attack: 0.05, hold: Math.max(0, dur - 0.15) });
    this.noise(o, t, Math.min(0.15, dur), vol * 0.3, { f: f * 2, q: 2, attack: 0.03 });
  }
}
