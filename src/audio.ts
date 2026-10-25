/**
 * The synthesised sound kit: every sound is oscillators and filtered noise, no assets. Each part type has its
 * own voice so you can hear what the ball hit; pitch still climbs a pentatonic ladder as Mult grows. A soft
 * arcade music loop plays underneath, different for each theme.
 */
import type { PartId } from './data/parts';

const PENTATONIC = [0, 2, 4, 7, 9];
const MUSIC_VOL = 0.07;

/** One theme's music: tempo, a four-chord loop (semitones from the root), and the instruments' timbres. */
interface Song { bpm: number; root: number; chords: number[][]; bass: OscillatorType; lead: OscillatorType; swing: number; arp: number[]; hat: boolean }
const SONGS: Record<string, Song> = {
  // Funhouse Factory: bouncy major, square lead, a busy hi-hat
  factory: { bpm: 116, root: 57, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]], bass: 'square', lead: 'square', swing: 0, arp: [0, 1, 2, 1, 0, 2, 1, 2], hat: true },
  // Short Order: lazy jazzy sevenths with a swing, soft triangle keys
  diner: { bpm: 96, root: 55, chords: [[0, 4, 7, 11], [9, 12, 16, 19], [2, 5, 9, 12], [7, 11, 14, 17]], bass: 'triangle', lead: 'triangle', swing: 0.18, arp: [0, 2, 1, 3, 2, 1, 3, 2], hat: false },
  // Castle Crash: a plucked dorian tune, slower, like a lute on a hill
  castle: { bpm: 88, root: 50, chords: [[0, 3, 7], [5, 9, 12], [3, 7, 10], [10, 14, 17]], bass: 'sine', lead: 'triangle', swing: 0.08, arp: [0, 1, 2, 0, 2, 1, 0, 2], hat: false },
};
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  musicOn = true;
  private song: Song = SONGS.factory;
  private nextBeat = 0;
  private beat = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Browsers only allow audio after a user gesture; call this from input handlers. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxVol;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.musicOn ? MUSIC_VOL * this.musicVol : 0;
      this.music.connect(this.master);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.music && this.ctx) this.music.gain.setTargetAtTime(on ? MUSIC_VOL * this.musicVol : 0, this.ctx.currentTime, 0.2);
  }

  /** The settings' volumes, 0..1 each, on top of the mix above (0 is off). */
  musicVol = 1;
  sfxVol = 1;
  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.sfx?.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.music?.gain.setTargetAtTime(this.musicOn ? MUSIC_VOL * music : 0, this.ctx.currentTime, 0.1);
  }

  /** Each theme has its own tune. */
  setTheme(id: string) { this.song = SONGS[id] ?? SONGS.factory; this.beat = 0; }

  // ---- building blocks ---------------------------------------------------------------------------------

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0, out: AudioNode | null = this.sfx) {
    const ctx = this.ctx;
    if (!ctx || !out) return;
    const t0 = Math.max(ctx.currentTime, ctx.currentTime + delay);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A burst of filtered noise: clicks, thunks, snaps and whooshes. */
  private hiss(dur: number, freq: number, q: number, vol: number, delay = 0, type: BiquadFilterType = 'bandpass', sweepTo?: number, out: AudioNode | null = this.sfx) {
    const ctx = this.ctx;
    if (!ctx || !out || !this.noise) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0, Math.random() * 0.3);
    src.stop(t0 + dur + 0.02);
  }

  /** The Mult ladder: pitch climbs a pentatonic scale as Mult grows (the "numbers going up" trick). */
  private ladder(mult: number, base = 330) {
    const step = Math.max(0, Math.round((mult - 1) * 10));
    const semis = PENTATONIC[step % 5] + 12 * Math.floor(step / 5);
    return base * Math.pow(2, Math.min(semis, 30) / 12);
  }

  // ---- what the ball hit: one voice per part type --------------------------------------------------------

  hit(id: PartId, mult: number, opts: { spins?: number; tier?: number; points?: number } = {}) {
    const f = this.ladder(mult);
    switch (id) {
      case 'pop': // a rubbery boing
        this.tone(f, 0.16, 'triangle', 0.5, f * 0.7);
        this.tone(f * 2, 0.07, 'sine', 0.18);
        this.hiss(0.04, 2400, 3, 0.15);
        break;
      case 'coin': // ka-ching: a bright two-note bell
        this.tone(f * 2, 0.1, 'square', 0.18);
        this.tone(f * 3, 0.22, 'square', 0.14, undefined, 0.06);
        this.tone(f * 4, 0.2, 'sine', 0.12, undefined, 0.06);
        break;
      case 'mega': // a big, low thump with a wobble on top
        this.tone(f * 0.35, 0.3, 'sine', 0.7, f * 0.2);
        this.tone(f * 0.7, 0.22, 'triangle', 0.3, f * 0.5);
        this.hiss(0.08, 300, 1, 0.35, 0, 'lowpass');
        break;
      case 'sling': // a snappy rubber-band crack
        this.hiss(0.06, 3200, 2, 0.4);
        this.tone(f * 1.5, 0.06, 'square', 0.18, f * 0.8);
        break;
      case 'spinner': { // rattling ticks, more for more spins
        const n = Math.min(8, Math.max(2, opts.spins ?? 3));
        for (let i = 0; i < n; i++) this.hiss(0.025, 3500 - i * 150, 6, 0.22, i * 0.035);
        break;
      }
      case 'lane': // a soft little bell
        this.tone(f * 2, 0.25, 'sine', 0.3);
        this.tone(f * 3, 0.18, 'sine', 0.12, undefined, 0.03);
        break;
      case 'uplight': // a glassy chime
        this.tone(f * 2.5, 0.35, 'sine', 0.25);
        this.tone(f * 3.75, 0.3, 'triangle', 0.1, undefined, 0.05);
        break;
      case 'lamp': // a light clicking on
        this.hiss(0.02, 5000, 4, 0.25);
        this.tone(1800, 0.12, 'sine', 0.15);
        break;
      case 'bank': // a target falls with a thunk
        this.hiss(0.09, 600, 1.5, 0.45, 0, 'lowpass');
        this.tone(f * 0.5, 0.12, 'square', 0.15, f * 0.3);
        break;
      case 'printer': // a mechanical whir and a clunk
        this.tone(160, 0.35, 'sawtooth', 0.15, 320);
        this.hiss(0.1, 900, 2, 0.3, 0.3, 'lowpass');
        break;
      case 'kickback': // a spring let go
        this.tone(140, 0.3, 'square', 0.25, 700);
        this.hiss(0.08, 2000, 1, 0.25);
        break;
      case 'vari': { // a thwack that rises with the tier
        const tier = opts.tier ?? 0;
        this.hiss(0.05, 1200 + tier * 600, 2, 0.4);
        this.tone(f * (1 + tier * 0.5), 0.14, 'triangle', 0.3);
        break;
      }
      default:
        this.tone(f, 0.12, 'triangle', 0.35);
    }
  }

  /** A completed set or a level-up: a quick fanfare. */
  bonus() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.2, 'square', 0.22, undefined, i * 0.06)); }
  /** A Mult stamp landing on the dial. */
  stamp() { this.tone(220, 0.12, 'square', 0.3, 110); this.hiss(0.05, 800, 1, 0.3); }
  /** A coin landing on the money stack. */
  coinLand() { this.tone(1568, 0.08, 'square', 0.12); this.tone(2093, 0.12, 'sine', 0.1, undefined, 0.04); }

  flipper(on: boolean) {
    this.tone(on ? 140 : 90, 0.07, 'square', on ? 0.3 : 0.15, on ? 70 : 60);
    if (on) this.hiss(0.03, 1500, 2, 0.15);
  }
  launch(power: number) {
    this.hiss(0.25, 400, 1, 0.25, 0, 'bandpass', 2400);
    this.tone(120, 0.35, 'sawtooth', 0.2, 120 + power * 5);
  }
  drain() { this.tone(330, 0.6, 'sawtooth', 0.25, 70); this.tone(165, 0.6, 'triangle', 0.2, 50, 0.08); }
  goal() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'square', 0.3, undefined, i * 0.09)); }
  tilt() { this.tone(90, 0.7, 'sawtooth', 0.45, 45); this.hiss(0.5, 200, 1, 0.4, 0, 'lowpass'); }
  nudge() { this.hiss(0.1, 250, 1, 0.5, 0, 'lowpass'); this.tone(80, 0.12, 'sine', 0.4, 50); }
  saved() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.3, undefined, i * 0.05)); }

  // ---- the workshop -------------------------------------------------------------------------------------

  /** A shop card rolling down onto the shelf (one per card, climbing). */
  shopRoll(i: number) { this.hiss(0.05, 1800 + i * 300, 3, 0.25); this.tone(500 + i * 120, 0.06, 'triangle', 0.18, 700 + i * 120); }
  /** Money changes hands. */
  buy() { this.tone(1046, 0.07, 'square', 0.2); this.tone(1568, 0.16, 'square', 0.16, undefined, 0.06); this.hiss(0.05, 6000, 2, 0.12, 0.05); }
  /** A part picked up off the shelf, the toolbox or the table. */
  pickUp() { this.tone(300, 0.08, 'triangle', 0.2, 600); }
  /** A part set down on the table: a solid clunk. */
  place() { this.hiss(0.07, 500, 1, 0.45, 0, 'lowpass'); this.tone(220, 0.1, 'square', 0.18, 110); }
  remove() { this.tone(500, 0.12, 'square', 0.2, 120); }
  /** The receipt printing a line. */
  print(lines = 1) { for (let i = 0; i < lines * 4; i++) this.hiss(0.02, 4200, 5, 0.12, i * 0.03); }
  /** The run is over. */
  gameOver() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.3, f * 0.97, i * 0.22)); }

  // ---- music: a lookahead scheduler plays the theme's loop softly underneath --------------------------------

  private startMusic() {
    if (!this.ctx || this.timer) return;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.music || ctx.state !== 'running') return;
    const s = this.song, eighth = 60 / s.bpm / 2;
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const b = this.beat, bar = Math.floor(b / 8) % s.chords.length, step = b % 8;
      const chord = s.chords[bar];
      const t = this.nextBeat + (step % 2 ? s.swing * eighth : 0) - ctx.currentTime;
      // bass on the beat, the arpeggio on every eighth, a soft hat
      if (step % 4 === 0) this.tone(midi(s.root - 12 + chord[0]), eighth * 1.8, s.bass, 0.5, undefined, t, this.music);
      if (step === 6 && bar % 2 === 1) this.tone(midi(s.root - 12 + chord[1]), eighth * 0.9, s.bass, 0.35, undefined, t, this.music);
      const note = chord[s.arp[step] % chord.length] + (step >= 4 ? 12 : 0);
      this.tone(midi(s.root + note), eighth * 0.9, s.lead, 0.22, undefined, t, this.music);
      if (s.hat && step % 2 === 1) this.hiss(0.03, 7000, 3, 0.12, t, 'highpass', undefined, this.music);
      this.nextBeat += eighth;
      this.beat++;
    }
  }
}
