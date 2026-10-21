import { SONIC_CONFIG, validateConfig, type SonicVisionConfig } from "./config";
export interface SonicOrigin {
  x: number;
  y: number;
  z: number;
}
export interface SonicWave {
  active: boolean;
  origin: SonicOrigin;
  bornAt: number;
  serial: number;
}
/** Pure simulation; pooled slots never refer to Three.js or collision objects. */
export class SonicWaveSystem {
  readonly config: Readonly<SonicVisionConfig>;
  readonly slots: SonicWave[];
  time = 0;
  emitted = 0;
  constructor(config: SonicVisionConfig = SONIC_CONFIG) {
    validateConfig(config);
    this.config = Object.freeze({ ...config });
    this.slots = Array.from({ length: config.maxWaves }, () => ({
      active: false,
      origin: { x: 0, y: 0, z: 0 },
      bornAt: 0,
      serial: 0,
    }));
  }
  get lifetime() {
    return (
      this.config.maxRadius / this.config.speed +
      this.config.thickness / this.config.speed +
      this.config.afterglow
    );
  }
  get count() {
    let n = 0;
    for (const w of this.slots) if (w.active) n++;
    return n;
  }
  emit(origin: SonicOrigin) {
    if (![origin.x, origin.y, origin.z].every(Number.isFinite))
      throw new Error("Invalid sonic origin");
    let slot = this.slots.find((w) => !w.active);
    if (!slot) {
      slot = this.slots[0];
      for (const w of this.slots) if (w.serial < slot.serial) slot = w;
    }
    slot.active = true;
    slot.origin.x = origin.x;
    slot.origin.y = origin.y;
    slot.origin.z = origin.z;
    slot.bornAt = this.time;
    slot.serial = ++this.emitted;
    return slot;
  }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid sonic delta");
    this.time += dt;
    for (const w of this.slots)
      if (w.active && this.time - w.bornAt >= this.lifetime) w.active = false;
  }
  clear() {
    for (const w of this.slots) w.active = false;
  }
  radius(w: SonicWave) {
    return Math.min(
      this.config.maxRadius,
      Math.max(0, (this.time - w.bornAt) * this.config.speed),
    );
  }
}
/** Reference transfer function used to test arrival order and tail duration. */
export function surfaceStrength(
  distance: number,
  age: number,
  c: SonicVisionConfig = SONIC_CONFIG,
) {
  const since = age - distance / c.speed,
    band = c.thickness / c.speed;
  if (
    distance < 0 ||
    distance > c.maxRadius ||
    since < 0 ||
    since >= band + c.afterglow
  )
    return 0;
  const u = Math.min(1, since / band),
    front = 1 - u * u * (3 - 2 * u);
  const tail =
    0.34 *
    Math.pow(1 - Math.max(0, Math.min(1, (since - band) / c.afterglow)), 2);
  return Math.max(front, tail);
}
