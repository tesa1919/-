export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuffer = null;
    this.voices = [];
    this.bigMonkVoiceBuffer = null;
    this.monkVoices = [];
    this.lastVoice = -1;
    this.lastMonkVoice = -1;
    this.muted = false;
    this.bgmWanted = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.ready = false;
  }

  async unlock() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    this.ready = true;
    if (this.bgmWanted && !this.muted) this.startBgm();
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.musicBus.connect(this.master);

    this.noiseBuffer = this.makeNoise(2);
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  async loadVoices(paths) {
    this.ensure();
    if (!this.ctx) return;
    const results = await Promise.allSettled(
      paths.map(async (path) => {
        const res = await fetch(path, { cache: "force-cache" });
        if (!res.ok) throw new Error("voice fetch failed");
        const arr = await res.arrayBuffer();
        return await this.ctx.decodeAudioData(arr);
      }),
    );
    this.voices = results
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);
  }

  async loadBigMonkVoice(path = "assets/audio/bigmonk.mp3") {
    this.ensure();
    if (!this.ctx) return;
    try {
      const res = await fetch(path, { cache: "force-cache" });
      if (!res.ok) throw new Error("bigmonk voice fetch failed");
      const arr = await res.arrayBuffer();
      this.bigMonkVoiceBuffer = await this.ctx.decodeAudioData(arr);
    } catch (err) {
      console.warn("Failed to load bigmonk voice:", err);
    }
  }

  async loadMonkVoices(paths = ["assets/audio/monk1.mp3", "assets/audio/monk2.mp3"]) {
    this.ensure();
    if (!this.ctx) return;
    const results = await Promise.allSettled(
      paths.map(async (path) => {
        const res = await fetch(path, { cache: "force-cache" });
        if (!res.ok) throw new Error("monk voice fetch failed");
        const arr = await res.arrayBuffer();
        return await this.ctx.decodeAudioData(arr);
      }),
    );
    this.monkVoices = results
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, now, 0.02);
    if (this.muted) {
      if (this.bgmTimer) {
        clearInterval(this.bgmTimer);
        this.bgmTimer = null;
      }
    } else if (this.bgmWanted) {
      this.startBgm();
    }
  }

  playVoice({ chance = 1 } = {}) {
    if (!this.ctx || this.muted || this.voices.length === 0) return false;
    if (Math.random() > chance) return false;
    const now = this.ctx.currentTime;
    let index = Math.floor(Math.random() * this.voices.length);
    if (this.voices.length > 1 && index === this.lastVoice) {
      index = (index + 1 + Math.floor(Math.random() * (this.voices.length - 1))) % this.voices.length;
    }
    this.lastVoice = index;

    const src = this.ctx.createBufferSource();
    src.buffer = this.voices[index];
    src.playbackRate.value = 0.96 + Math.random() * 0.08;

    const dry = this.ctx.createGain();
    dry.gain.value = 0.52;
    src.connect(dry);
    dry.connect(this.sfxBus);

    // Tape-ish echo with feedback and a low-pass in the loop.
    const send = this.ctx.createGain();
    send.gain.value = 0.5;
    const delay = this.ctx.createDelay(1.2);
    delay.delayTime.value = 0.27 + Math.random() * 0.12;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.38;
    const damp = this.ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2400;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.55;

    src.connect(send);
    send.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(wet);
    wet.connect(this.sfxBus);

    src.start(now);
    return true;
  }

  playBigMonkVoice() {
    if (!this.ctx || this.muted || !this.bigMonkVoiceBuffer) return false;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.bigMonkVoiceBuffer;
    src.playbackRate.value = 1.0;

    const dry = this.ctx.createGain();
    dry.gain.value = 0.95;
    src.connect(dry);
    dry.connect(this.sfxBus);

    const send = this.ctx.createGain();
    send.gain.value = 0.65;
    const delay = this.ctx.createDelay(2.0);
    delay.delayTime.value = 0.32;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.44;
    const damp = this.ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2800;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.72;

    src.connect(send);
    send.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(wet);
    wet.connect(this.sfxBus);

    src.start(now);
    return true;
  }

  playMonkVoice() {
    if (!this.ctx || this.muted || this.monkVoices.length === 0) return false;
    const now = this.ctx.currentTime;
    let index = Math.floor(Math.random() * this.monkVoices.length);
    if (this.monkVoices.length > 1 && index === this.lastMonkVoice) {
      index = (index + 1 + Math.floor(Math.random() * (this.monkVoices.length - 1))) % this.monkVoices.length;
    }
    this.lastMonkVoice = index;

    const src = this.ctx.createBufferSource();
    src.buffer = this.monkVoices[index];
    src.playbackRate.value = 1.0;

    const dry = this.ctx.createGain();
    dry.gain.value = 0.95;
    src.connect(dry);
    dry.connect(this.sfxBus);

    const send = this.ctx.createGain();
    send.gain.value = 0.65;
    const delay = this.ctx.createDelay(2.0);
    delay.delayTime.value = 0.30;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.42;
    const damp = this.ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2800;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.70;

    src.connect(send);
    send.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(wet);
    wet.connect(this.sfxBus);

    src.start(now);
    return true;
  }

  tone({
    freq,
    type = "sine",
    dur = 0.2,
    vol = 0.2,
    attack = 0.006,
    slideTo = null,
    delay = 0,
    bus = null,
  }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({
    dur = 0.2,
    vol = 0.2,
    type = "bandpass",
    freq = 1200,
    freqEnd = null,
    q = 0.8,
    delay = 0,
    bus = null,
  }) {
    if (!this.ctx || this.muted || !this.noiseBuffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus || this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  click() {
    this.tone({ freq: 620, type: "triangle", dur: 0.06, vol: 0.08, slideTo: 900 });
  }

  drop() {
    this.tone({ freq: 330, type: "sine", dur: 0.11, vol: 0.13, slideTo: 190 });
    this.noise({ dur: 0.05, vol: 0.035, type: "highpass", freq: 2200 });
  }

  merge(level) {
    const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
    const base = 261.63 * Math.pow(2, scale[level] / 12);
    const vol = 0.1 + Math.min(level, 8) * 0.011;
    this.tone({ freq: base, type: "triangle", dur: 0.28, vol, slideTo: base * 1.01 });
    this.tone({ freq: base * 1.5, type: "sine", dur: 0.22, vol: vol * 0.5, delay: 0.015 });
    this.tone({ freq: base * 2, type: "sine", dur: 0.18, vol: vol * 0.24, delay: 0.03 });
    this.noise({ dur: 0.08, vol: 0.04, type: "highpass", freq: 3200 });
    if (level >= 8) this.sivaSpark();
  }

  sivaSpark() {
    this.noise({ dur: 0.35, vol: 0.09, type: "bandpass", freq: 1600, freqEnd: 280, q: 1.4 });
    this.tone({ freq: 880, type: "sawtooth", dur: 0.2, vol: 0.05, slideTo: 220 });
  }

  sivaSpawn() {
    this.tone({ freq: 120, type: "sawtooth", dur: 0.7, vol: 0.06, slideTo: 640 });
    this.noise({ dur: 0.6, vol: 0.08, type: "bandpass", freq: 300, freqEnd: 2600, q: 0.7 });
    this.tone({ freq: 55, type: "sine", dur: 1.2, vol: 0.12, slideTo: 40 });
  }

  explosion(power = 1) {
    this.noise({ dur: 0.7, vol: 0.38 * power, type: "lowpass", freq: 1800, freqEnd: 90, q: 0.8 });
    this.tone({ freq: 90, type: "sine", dur: 0.6, vol: 0.28 * power, slideTo: 28 });
    this.tone({ freq: 160, type: "sawtooth", dur: 0.18, vol: 0.08 * power, slideTo: 48 });
    this.noise({ dur: 0.12, vol: 0.18 * power, type: "highpass", freq: 1400 });
  }

  monk() {
    this.playMonkVoice();
    [110, 164.81, 220, 329.63].forEach((f, i) => {
      this.tone({
        freq: f,
        type: i === 0 ? "sine" : "triangle",
        dur: 2.2,
        vol: 0.14 / (i + 1),
        attack: 0.02,
        delay: i * 0.015,
      });
    });
    this.noise({ dur: 0.5, vol: 0.05, type: "lowpass", freq: 900, freqEnd: 120 });
  }

  bigMonk() {
    this.playBigMonkVoice();
    [55, 82.41, 110, 164.81, 220, 329.63, 440].forEach((f, i) => {
      this.tone({
        freq: f,
        type: i < 2 ? "sine" : "triangle",
        dur: 3.4,
        vol: 0.18 / (1 + i * 0.42),
        attack: 0.012,
        delay: i * 0.018,
      });
    });
    this.noise({ dur: 1.6, vol: 0.12, type: "lowpass", freq: 2400, freqEnd: 100 });
    for (let i = 0; i < 6; i++) {
      this.tone({
        freq: 1046.5 * Math.pow(2, [0, 3, 5, 7, 10, 12][i] / 12),
        type: "sine",
        dur: 0.65,
        vol: 0.045,
        delay: 0.25 + i * 0.09,
      });
    }
  }

  gameOver() {
    [392, 349.23, 293.66, 220].forEach((f, i) => {
      this.tone({ freq: f, type: "triangle", dur: 0.7, vol: 0.09, delay: i * 0.15 });
    });
    this.noise({ dur: 0.8, vol: 0.06, type: "lowpass", freq: 700, freqEnd: 80 });
  }

  newBest() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone({ freq: f, type: "triangle", dur: 0.32, vol: 0.08, delay: i * 0.08 });
    });
  }

  startBgm() {
    if (!this.ctx || this.muted) return;
    this.bgmWanted = true;
    if (this.bgmTimer) return;
    this.bgmStep = 0;
    this.bgmTimer = setInterval(() => this.scheduleBar(), 2000);
    this.scheduleBar();
  }

  stopBgm() {
    this.bgmWanted = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  scheduleBar() {
    if (!this.ctx || this.muted) return;
    const step = 0.125;
    const bar = 2;
    const b = this.ctx.currentTime + 0.06;
    const bass = [55, 55, 65.41, 55, 55, 73.42, 65.41, 49];
    for (let i = 0; i < 16; i++) {
      const t = b + i * step;
      if (i % 4 === 0) {
        this.kick(t, 0.1);
        this.bassNote(t, bass[(this.bgmStep + Math.floor(i / 4)) % bass.length]);
      }
      if (i % 2 === 1) this.hat(t, i % 4 === 3 ? 0.024 : 0.014);
      if ([0, 3, 6, 10, 13].includes(i)) {
        const melody = [261.63, 392, 329.63, 440, 349.23, 523.25, 392, 329.63];
        const note = melody[(this.bgmStep + i) % melody.length];
        this.pluck(t, note, 0.025);
      }
    }
    this.bgmStep = (this.bgmStep + 4) % 8;
    this.tone({
      freq: 130.81,
      type: "sine",
      dur: bar,
      vol: 0.018,
      attack: 0.2,
      bus: this.musicBus,
    });
  }

  kick(t, vol) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  bassNote(t, freq) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.58);
  }

  hat(t, vol) {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.05);
  }

  pluck(t, freq, vol) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}
