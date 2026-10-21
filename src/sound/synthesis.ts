import type { SonicKind } from "../sonic/kinds";
/** Original deterministic noise: no downloaded sound samples. */
export function createNoiseBuffer(context: BaseAudioContext) {
  const buffer = context.createBuffer(
      1,
      context.sampleRate,
      context.sampleRate,
    ),
    data = buffer.getChannelData(0);
  let seed = 0x715ace;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = (seed >>> 0) / 2147483648 - 1;
  }
  return buffer;
}
export function synthesizeVoice(
  context: BaseAudioContext,
  kind: SonicKind,
  destination: AudioNode,
  noise: AudioBuffer,
  onEnded: () => void = () => {},
) {
  const shot = kind === "GUNSHOT",
    landing = kind === "LANDING",
    run = kind === "RUN";
  const duration = shot ? 0.24 : landing ? 0.2 : 0.12,
    now = context.currentTime;
  const source = context.createBufferSource(),
    filter = context.createBiquadFilter(),
    envelope = context.createGain(),
    osc = context.createOscillator(),
    thump = context.createGain();
  source.buffer = noise;
  filter.type = "lowpass";
  filter.frequency.value = shot ? 6500 : run ? 1100 : 750;
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.linearRampToValueAtTime(
    shot ? 0.65 : landing ? 0.4 : run ? 0.28 : 0.18,
    now + 0.003,
  );
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);
  osc.type = shot ? "triangle" : "sine";
  osc.frequency.setValueAtTime(shot ? 110 : landing ? 66 : run ? 88 : 78, now);
  osc.frequency.exponentialRampToValueAtTime(shot ? 32 : 45, now + duration);
  thump.gain.setValueAtTime(
    shot ? 0.35 : landing ? 0.3 : run ? 0.18 : 0.12,
    now,
  );
  thump.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(thump);
  thump.connect(destination);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    source.disconnect();
    filter.disconnect();
    envelope.disconnect();
    osc.disconnect();
    thump.disconnect();
    onEnded();
  };
  source.onended = cleanup;
  try {
    source.start(now, 0, duration);
    osc.start(now);
    osc.stop(now + duration);
  } catch (error) {
    cleanup();
    throw error;
  }
  return {
    stop() {
      try {
        source.stop();
        osc.stop();
      } catch {}
      cleanup();
    },
  };
}
