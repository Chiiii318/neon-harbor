// Neon Harbor — procedural WebAudio sound engine.
// No audio files: engine hum, sirens, crashes, punches and jingles are all
// synthesized. Browsers require a user gesture, so start() runs on the
// Start button click (or first tap).

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.ambientGain = null;
    this.started = false;
  }

  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.started = true;
      this._startEngine();
      this._startSiren();
      this._startAmbient();
    } catch (err) {
      this.started = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineFilter = filter;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  _startSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 760;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  _startAmbient() {
    // Gentle filtered noise = sea breeze / city room tone.
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.035;
    src.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.master);
    src.start();
  }

  // Called every frame: engine pitch follows speed, siren follows wanted level.
  update(dt, speedRatio, driving, sirenLevel, sirenDistance) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const targetEngine = driving ? 0.05 + speedRatio * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(targetEngine, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + speedRatio * 165, t, 0.06);
    if (this.engineFilter) this.engineFilter.frequency.setTargetAtTime(280 + speedRatio * 900, t, 0.1);
    let siren = 0;
    if (sirenLevel > 0) {
      const dist = Math.max(6, sirenDistance || 60);
      siren = Math.min(0.075, 26 / dist) * (0.5 + sirenLevel * 0.12);
    }
    this.sirenGain.gain.setTargetAtTime(siren, t, 0.15);
  }

  _blip(freqA, freqB, duration, type, volume) {
    if (!this.started) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqA, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume || 0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  _noiseBurst(duration, volume, filterFreq) {
    if (!this.started) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 900;
    const gain = ctx.createGain();
    gain.gain.value = volume || 0.3;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  playCrash(strength) {
    this._noiseBurst(0.28, Math.min(0.5, 0.18 + strength * 0.05), 700);
    this._blip(160, 45, 0.3, 'square', 0.12);
  }

  playPunch() {
    this._noiseBurst(0.09, 0.28, 1600);
    this._blip(220, 70, 0.1, 'sine', 0.2);
  }

  playCoin() {
    this._blip(880, 1320, 0.12, 'square', 0.1);
    setTimeout(() => this._blip(1320, 1760, 0.16, 'square', 0.09), 70);
  }

  playDoor() {
    this._blip(300, 140, 0.14, 'sine', 0.14);
    this._noiseBurst(0.05, 0.1, 500);
  }

  playBusted() {
    this._blip(392, 392, 0.22, 'triangle', 0.16);
    setTimeout(() => this._blip(330, 330, 0.22, 'triangle', 0.16), 200);
    setTimeout(() => this._blip(262, 196, 0.4, 'triangle', 0.16), 400);
  }

  playMissionSuccess() {
    if (!this.started) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this._blip(freq, freq, 0.22, 'triangle', 0.15), i * 110);
    });
  }

  playMissionFail() {
    this._blip(330, 165, 0.45, 'sawtooth', 0.1);
  }

  playCheckpoint() {
    this._blip(740, 1180, 0.14, 'sine', 0.14);
  }
}
