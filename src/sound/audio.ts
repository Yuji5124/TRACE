import type { SonicKind } from "../sonic/kinds";
import { createNoiseBuffer, synthesizeVoice } from "./synthesis";
/** Audio is best-effort. A rejected autoplay/resume or absent API never rejects an action. */
export class SoundAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<{ stop(): void }>();
  volume = 0.4;
  muted = false;
  played = 0;
  failures = 0;
  private unavailable = false;
  get state() {
    return this.unavailable ? "unavailable" : (this.context?.state ?? "locked");
  }
  async unlock() {
    try {
      if (!this.context) {
        const ctor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!ctor) {
          this.unavailable = true;
          return;
        }
        const context = new ctor();
        this.context = context;
        this.master = context.createGain();
        this.bus = context.createDynamicsCompressor();
        this.bus.threshold.value = -18;
        this.bus.ratio.value = 4;
        this.bus.attack.value = 0.003;
        this.bus.release.value = 0.12;
        this.bus.connect(this.master);
        this.master.connect(context.destination);
        this.noise = createNoiseBuffer(context);
        this.updateGain();
      }
      if (this.context.state !== "running") await this.context.resume();
      this.unavailable = false;
    } catch {
      this.failures++;
      this.unavailable = true;
    }
  }
  private updateGain() {
    if (this.master && this.context) {
      const gain = this.master.gain;
      gain.cancelScheduledValues(this.context.currentTime);
      gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.context.currentTime,
        0.01,
      );
    }
  }
  setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    this.updateGain();
  }
  setMuted(value: boolean) {
    this.muted = value;
    this.updateGain();
  }
  play(kind: SonicKind) {
    if (
      this.muted ||
      this.volume <= 0 ||
      this.context?.state !== "running" ||
      !this.bus ||
      !this.noise ||
      kind === "TEST" ||
      kind === "ANIMAL"
    )
      return;
    try {
      if (this.voices.size >= 16) this.voices.values().next().value?.stop();
      let voice: { stop(): void };
      voice = synthesizeVoice(this.context, kind, this.bus, this.noise, () =>
        this.voices.delete(voice),
      );
      this.voices.add(voice);
      this.played++;
    } catch {
      this.failures++;
    }
  }
  silence() {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
  }
  get status() {
    return {
      state: this.state,
      volume: this.volume,
      muted: this.muted,
      voices: this.voices.size,
      played: this.played,
      failures: this.failures,
    };
  }
  async dispose() {
    this.silence();
    try {
      await this.context?.close();
    } catch {}
    this.context = null;
    this.master = null;
    this.bus = null;
    this.noise = null;
  }
}
