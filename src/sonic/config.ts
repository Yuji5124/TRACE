/** Visual gameplay propagation, deliberately not the physical speed of sound. */
export const MAX_SONIC_WAVES = 8;
export interface SonicVisionConfig {
  speed: number;
  maxRadius: number;
  thickness: number;
  afterglow: number;
  maxWaves: number;
}
export const SONIC_CONFIG: Readonly<SonicVisionConfig> = Object.freeze({
  speed: 25,
  maxRadius: 35,
  thickness: 1.5,
  afterglow: 1.2,
  maxWaves: MAX_SONIC_WAVES,
});
export function validateConfig(c: SonicVisionConfig) {
  if (
    ![c.speed, c.maxRadius, c.thickness, c.afterglow].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    !Number.isInteger(c.maxWaves) ||
    c.maxWaves < 1 ||
    c.maxWaves > MAX_SONIC_WAVES
  )
    throw new Error("Invalid sonic configuration");
}
