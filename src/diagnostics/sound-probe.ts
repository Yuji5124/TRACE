// Same synthesis functions as the live AudioContext. No files or external samples.
import { createNoiseBuffer, synthesizeVoice } from "../sound/synthesis";
import type { SonicKind } from "../sonic/kinds";
export async function renderSoundProbe(kind: SonicKind) {
  const context = new OfflineAudioContext(1, 22050, 44100),
    gain = context.createGain();
  gain.gain.value = 0.4;
  gain.connect(context.destination);
  synthesizeVoice(context, kind, gain, createNoiseBuffer(context));
  const buffer = await context.startRendering(),
    data = buffer.getChannelData(0);
  let peak = 0,
    sum = 0,
    late = 0;
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i]));
    sum += data[i] * data[i];
    if (i > data.length * 0.8) late += data[i] * data[i];
  }
  return {
    kind,
    peak,
    rms: Math.sqrt(sum / data.length),
    lateEnergy: late,
    samples: data.length,
    sampleRate: 44100,
  };
}
