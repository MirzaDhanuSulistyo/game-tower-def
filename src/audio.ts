/** Tiny WebAudio synth — all TD sounds generated live, no assets. */
export class SoundKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  ensure(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, gain: number, filterFreq: number, type: BiquadFilterType = 'lowpass', delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t0);
  }

  click(): void { this.tone(760, 0.05, 'square', 0.07, 560); }
  build(): void {
    this.noise(0.15, 0.2, 900);
    this.tone(220, 0.12, 'triangle', 0.15, 330);
  }
  shoot(kind: string): void {
    if (kind === 'cannon') { this.tone(120, 0.18, 'sawtooth', 0.12, 60); this.noise(0.12, 0.1, 800, 'bandpass'); }
    else if (kind === 'gatling') { this.tone(880, 0.06, 'square', 0.05, 440); }
    else if (kind === 'frost') { this.tone(1200, 0.2, 'sine', 0.08, 2400); }
    else if (kind === 'mortar') { this.tone(90, 0.25, 'sawtooth', 0.12, 50); }
  }
  boom(): void {
    this.noise(0.5, 0.4, 220);
    this.tone(60, 0.45, 'sine', 0.35, 30);
  }
  pop(): void {
    this.noise(0.15, 0.22, 2400, 'highpass');
    this.tone(520, 0.12, 'triangle', 0.12, 180);
  }
  splash(): void { this.noise(0.3, 0.2, 1200, 'bandpass'); }
  leak(): void {
    this.tone(300, 0.25, 'sawtooth', 0.14, 120);
    this.tone(150, 0.3, 'square', 0.08, 90, 0.1);
  }
  horn(): void {
    this.tone(196, 0.35, 'sawtooth', 0.14);
    this.tone(262, 0.35, 'sawtooth', 0.12, undefined, 0.18);
  }
  coin(): void { this.tone(990, 0.08, 'triangle', 0.1, 1320); }
  upgrade(): void {
    this.tone(440, 0.12, 'triangle', 0.14, 660);
    this.tone(660, 0.14, 'triangle', 0.14, 880, 0.1);
  }
  victory(): void {
    [523, 659, 784, 1047, 1319].forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.16, undefined, i * 0.13));
  }
  defeat(): void {
    this.tone(330, 0.3, 'triangle', 0.16);
    this.tone(262, 0.3, 'triangle', 0.16, undefined, 0.22);
    this.tone(196, 0.5, 'triangle', 0.18, undefined, 0.44);
  }
}
