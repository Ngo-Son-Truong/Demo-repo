import type { AmbienceSettings, MusicMood } from "@/lib/types";

type AmbienceKey = "rain" | "waves" | "birds" | "wind";

type MoodConfig = {
  tempo: number; // beats per minute
  chords: number[][];
  scale: number[];
  padWave: OscillatorType;
  leadWave: OscillatorType;
  padGain: number;
  leadGain: number;
  bassGain: number;
  swing: number;
  brightness: number;
};

const MOODS: Record<MusicMood, MoodConfig> = {
  // Warm lo-fi: slow, dusted chords with a lazy melody on top.
  lofi: {
    tempo: 68,
    chords: [
      [53, 57, 60, 64],
      [55, 59, 62, 65],
      [50, 53, 57, 60],
      [48, 52, 55, 59],
    ],
    scale: [60, 62, 64, 67, 69, 72, 74, 76],
    padWave: "triangle",
    leadWave: "sine",
    padGain: 0.12,
    leadGain: 0.16,
    bassGain: 0.14,
    swing: 0.14,
    brightness: 1400,
  },
  // Loose jazz voicings with a walking-ish bass.
  jazz: {
    tempo: 84,
    chords: [
      [55, 59, 62, 65],
      [57, 60, 64, 67],
      [50, 54, 57, 61],
      [48, 52, 55, 59],
    ],
    scale: [60, 63, 65, 67, 70, 72, 75, 77],
    padWave: "sine",
    leadWave: "triangle",
    padGain: 0.09,
    leadGain: 0.15,
    bassGain: 0.17,
    swing: 0.22,
    brightness: 2200,
  },
  // Sparse piano arpeggios, very quiet and roomy.
  piano: {
    tempo: 60,
    chords: [
      [53, 57, 60, 65],
      [55, 58, 62, 65],
      [48, 52, 55, 60],
      [50, 53, 57, 60],
    ],
    scale: [60, 62, 65, 67, 69, 72, 74, 77],
    padWave: "sine",
    leadWave: "sine",
    padGain: 0.07,
    leadGain: 0.2,
    bassGain: 0.08,
    swing: 0.05,
    brightness: 3000,
  },
  // Airy ambient pads, almost no rhythm.
  soft: {
    tempo: 54,
    chords: [
      [52, 55, 59, 64],
      [50, 54, 57, 62],
      [48, 52, 55, 60],
      [53, 57, 60, 65],
    ],
    scale: [60, 62, 64, 67, 69, 72, 74, 76],
    padWave: "sine",
    leadWave: "triangle",
    padGain: 0.1,
    leadGain: 0.1,
    bassGain: 0.09,
    swing: 0,
    brightness: 1100,
  },
};

function midiToHz(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function makeNoiseBuffer(ctx: AudioContext, seconds = 3) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buffer;
}

/**
 * Fully procedural ambience: gentle generative music plus layered nature sounds.
 * No audio files needed, and the whole thing is independent of the table / voice layer.
 */
export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private nodes: AudioNode[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private nextNoteTime = 0;
  private step = 0;
  private mood: MusicMood = "lofi";
  private settings: AmbienceSettings;
  private ambienceGains: Record<AmbienceKey, GainNode | null> = {
    rain: null,
    waves: null,
    birds: null,
    wind: null,
  };
  private playing = false;

  constructor(settings: AmbienceSettings) {
    this.settings = settings;
    this.mood = settings.mood;
  }

  private ensureContext() {
    if (this.ctx) return this.ctx;
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return null;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;
    master.connect(analyser);

    const musicBus = ctx.createGain();
    musicBus.gain.value = 0.9;
    musicBus.connect(master);

    const ambienceBus = ctx.createGain();
    ambienceBus.gain.value = 0.75;
    ambienceBus.connect(master);

    // A soft plate-ish tail so pads feel like they sit in a room.
    const delay = ctx.createDelay(1.2);
    delay.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1800;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    musicBus.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(wet);
    wet.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.analyser = analyser;
    this.musicBus = musicBus;
    this.ambienceBus = ambienceBus;
    this.noiseBuffer = makeNoiseBuffer(ctx);
    return ctx;
  }

  private track<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  play() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    void ctx.resume();
    if (this.playing) return;
    this.playing = true;
    this.master!.gain.cancelScheduledValues(ctx.currentTime);
    this.master!.gain.setValueAtTime(this.master!.gain.value, ctx.currentTime);
    this.master!.gain.linearRampToValueAtTime(this.targetVolume(), ctx.currentTime + 0.8);
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.step = 0;
    this.syncAmbience();
    this.timers.push(
      setInterval(() => this.scheduler(), 90),
      setInterval(() => this.textureScheduler(), 1400),
    );
  }

  pause() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.playing = false;
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
  }

  setVolume(volume: number) {
    this.settings = { ...this.settings, volume };
    if (!this.ctx || !this.master || !this.playing) return;
    this.master.gain.linearRampToValueAtTime(this.targetVolume(), this.ctx.currentTime + 0.15);
  }

  setMood(mood: MusicMood) {
    if (this.mood === mood) return;
    this.mood = mood;
    this.settings = { ...this.settings, mood };
    if (this.playing) {
      this.step = 0;
      if (this.ctx) this.nextNoteTime = this.ctx.currentTime + 0.15;
    }
  }

  setAmbience(partial: Partial<Pick<AmbienceSettings, AmbienceKey>>) {
    this.settings = { ...this.settings, ...partial };
    this.syncAmbience();
  }

  getAnalyser() {
    return this.analyser;
  }

  private targetVolume() {
    return Math.max(0, Math.min(1, this.settings.volume)) * 0.85;
  }

  private scheduler() {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.playing) return;
    const config = MOODS[this.mood];
    const beat = 60 / config.tempo;
    while (this.nextNoteTime < ctx.currentTime + 0.4) {
      this.scheduleStep(this.step, this.nextNoteTime, beat, config);
      const swing = this.step % 2 === 1 ? beat * config.swing : 0;
      this.nextNoteTime += beat / 2 + swing;
      this.step = (this.step + 1) % 64;
    }
  }

  private scheduleStep(step: number, time: number, beat: number, config: MoodConfig) {
    const bar = Math.floor(step / 8) % config.chords.length;
    const chord = config.chords[bar];
    const inBar = step % 8;

    // Pad once per bar.
    if (inBar === 0) {
      chord.forEach((note, i) => {
        this.voice(midiToHz(note + (i === 0 ? 0 : 0)), time, beat * 3.6, {
          wave: config.padWave,
          gain: config.padGain / chord.length,
          attack: 0.9,
          release: 1.6,
          filter: config.brightness,
          detune: i * 3,
        });
      });
      this.voice(midiToHz(chord[0] - 24), time, beat * 3, {
        wave: "sine",
        gain: config.bassGain,
        attack: 0.12,
        release: 1.4,
        filter: 420,
      });
    }

    // Lazy melody: sparse, more present on the off-beats.
    const density = this.mood === "soft" ? 0.28 : 0.5;
    if (inBar % 2 === 0 && Math.random() < density) {
      const note = config.scale[Math.floor(Math.random() * config.scale.length)];
      this.voice(midiToHz(note + 12), time + 0.02, beat * (Math.random() > 0.6 ? 1.6 : 0.9), {
        wave: config.leadWave,
        gain: config.leadGain,
        attack: 0.02,
        release: 0.9,
        filter: config.brightness * 1.6,
      });
    }

    // A brushed tick for lo-fi / jazz texture.
    if ((this.mood === "lofi" || this.mood === "jazz") && inBar % 4 === 2) {
      this.brush(time + beat * 0.5);
    }
  }

  private voice(
    freq: number,
    time: number,
    duration: number,
    opts: {
      wave: OscillatorType;
      gain: number;
      attack: number;
      release: number;
      filter: number;
      detune?: number;
    },
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const osc = this.track(ctx.createOscillator());
    const gain = this.track(ctx.createGain());
    const filter = this.track(ctx.createBiquadFilter());
    filter.type = "lowpass";
    filter.frequency.value = opts.filter;
    filter.Q.value = 0.6;
    osc.type = opts.wave;
    osc.frequency.value = freq;
    osc.detune.value = opts.detune ?? 0;
    const peak = Math.max(0.0001, opts.gain);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peak, time + opts.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + opts.release);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + duration + opts.release + 0.1);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      filter.disconnect();
      this.nodes = this.nodes.filter((n) => n !== osc && n !== gain && n !== filter);
    };
  }

  private brush(time: number) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.musicBus) return;
    const src = this.track(ctx.createBufferSource());
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1.2;
    const bp = this.track(ctx.createBiquadFilter());
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 0.9;
    const gain = this.track(ctx.createGain());
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.035, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.musicBus);
    src.start(time);
    src.stop(time + 0.2);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      gain.disconnect();
      this.nodes = this.nodes.filter((n) => n !== src && n !== bp && n !== gain);
    };
  }

  private textureScheduler() {
    if (!this.playing) return;
    if (this.settings.birds && Math.random() < 0.75) this.chirp();
  }

  private chirp() {
    const ctx = this.ctx;
    if (!ctx || !this.ambienceBus) return;
    const base = 1500 + Math.random() * 1400;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i += 1) {
      const time = ctx.currentTime + i * (0.09 + Math.random() * 0.07);
      const osc = this.track(ctx.createOscillator());
      const gain = this.track(ctx.createGain());
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, time);
      osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), time + 0.05);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.05, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
      osc.connect(gain);
      gain.connect(this.ambienceBus);
      osc.start(time);
      osc.stop(time + 0.12);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        this.nodes = this.nodes.filter((n) => n !== osc && n !== gain);
      };
    }
  }

  private syncAmbience() {
    if (!this.ctx || !this.ambienceBus || !this.noiseBuffer) return;
    (Object.keys(this.ambienceGains) as AmbienceKey[]).forEach((key) => {
      const on = this.settings[key];
      const existing = this.ambienceGains[key];
      if (on && !existing) {
        this.ambienceGains[key] = this.buildAmbience(key);
      } else if (!on && existing) {
        existing.gain.linearRampToValueAtTime(0.0001, this.ctx!.currentTime + 0.8);
        const doomed = existing;
        this.ambienceGains[key] = null;
        setTimeout(() => {
          try {
            doomed.disconnect();
          } catch {
            /* noop */
          }
        }, 1000);
      }
    });
  }

  private buildAmbience(key: AmbienceKey): GainNode {
    const ctx = this.ctx!;
    const src = this.track(ctx.createBufferSource());
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.track(ctx.createBiquadFilter());
    const gain = this.track(ctx.createGain());
    gain.gain.value = 0.0001;

    if (key === "rain") {
      filter.type = "highpass";
      filter.frequency.value = 900;
      const lp = this.track(ctx.createBiquadFilter());
      lp.type = "lowpass";
      lp.frequency.value = 7000;
      src.connect(filter);
      filter.connect(lp);
      lp.connect(gain);
      gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.2);
    } else if (key === "waves") {
      filter.type = "lowpass";
      filter.frequency.value = 720;
      const swell = this.track(ctx.createGain());
      swell.gain.value = 0.5;
      const lfo = this.track(ctx.createOscillator());
      lfo.frequency.value = 0.08;
      const lfoGain = this.track(ctx.createGain());
      lfoGain.gain.value = 0.34;
      lfo.connect(lfoGain);
      lfoGain.connect(swell.gain);
      lfo.start();
      src.connect(filter);
      filter.connect(swell);
      swell.connect(gain);
      gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.4);
    } else if (key === "wind") {
      filter.type = "bandpass";
      filter.frequency.value = 460;
      filter.Q.value = 0.6;
      const lfo = this.track(ctx.createOscillator());
      lfo.frequency.value = 0.05;
      const lfoGain = this.track(ctx.createGain());
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      src.connect(filter);
      filter.connect(gain);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 1.4);
    } else {
      // birds: only a faint forest bed, chirps are scheduled separately
      filter.type = "lowpass";
      filter.frequency.value = 500;
      src.connect(filter);
      filter.connect(gain);
      gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 1);
    }

    gain.connect(this.ambienceBus!);
    src.start();
    return gain;
  }

  dispose() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.nodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        /* noop */
      }
    });
    this.nodes = [];
    if (this.ctx) {
      void this.ctx.close();
    }
    this.ctx = null;
    this.playing = false;
  }
}
