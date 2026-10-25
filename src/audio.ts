/**
 * Tiny synthesised sound kit so the spike can be felt, not just seen. Everything is oscillators:
 * no assets. The real sound pass (samples, adaptive music) comes in M3.
 */
const PENTATONIC = [0, 2, 4, 7, 9];

export class AudioFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Browsers only allow audio after a user gesture; call this from input handlers. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Pitch climbs a pentatonic ladder as Mult grows: the Balatro "numbers going up" trick. */
  bumper(mult: number, coin = false) {
    const step = Math.max(0, Math.round((mult - 1) * 10));
    const semis = PENTATONIC[step % 5] + 12 * Math.floor(step / 5);
    const f = 330 * Math.pow(2, Math.min(semis, 30) / 12);
    this.tone(f, 0.16, coin ? 'square' : 'triangle', 0.5);
    this.tone(f * 2, 0.08, 'sine', 0.2);
    if (coin) this.tone(f * 3, 0.12, 'square', 0.15, undefined, 0.05);
  }
  flipper(on: boolean) {
    this.tone(on ? 140 : 90, 0.07, 'square', on ? 0.35 : 0.18, on ? 70 : 60);
  }
  launch(power: number) {
    this.tone(120, 0.35, 'sawtooth', 0.3, 120 + power * 5);
  }
  drain() {
    this.tone(330, 0.5, 'sawtooth', 0.3, 70);
  }
  goal() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'square', 0.3, undefined, i * 0.09));
  }
  tilt() {
    this.tone(90, 0.7, 'sawtooth', 0.45, 45);
  }
  nudge() {
    this.tone(200, 0.08, 'triangle', 0.3, 120);
  }
  place() {
    this.tone(440, 0.07, 'square', 0.25, 880);
  }
  remove() {
    this.tone(500, 0.12, 'square', 0.2, 120);
  }
}
