export const SONIC_KINDS = [
  "FOOTSTEP",
  "RUN",
  "LANDING",
  "GUNSHOT",
  "TEST",
  "ANIMAL",
] as const;
export type SonicKind = (typeof SONIC_KINDS)[number];
/** Defaults are shared by local actions and future animal/network producers. */
export const SOUND_PROFILES: Readonly<
  Record<SonicKind, { maxRadius: number }>
> = Object.freeze({
  FOOTSTEP: { maxRadius: 4 },
  RUN: { maxRadius: 8 },
  LANDING: { maxRadius: 10 },
  GUNSHOT: { maxRadius: 35 },
  TEST: { maxRadius: 35 },
  ANIMAL: { maxRadius: 8 },
});
