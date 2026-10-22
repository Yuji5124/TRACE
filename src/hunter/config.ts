import { SOUND_PROFILES, type SonicKind } from "../sonic/kinds";
export const HUNTER_CONFIG = Object.freeze({
  brainHz: 10,
  replanSeconds: 1,
  memorySeconds: 9,
  searchSeconds: 5,
  lostSightSeconds: 0.8,
  idleSight: 6,
  alertSight: 13,
  idleFov: 90,
  alertFov: 110,
  turnSpeed: 2.4, // radians/second; no instant turn toward an unheard player
  chaseTurnSpeed: 3.2,
  investigateSpeed: 2.5,
  chaseSpeed: 4.5,
  patrolSpeed: 1.4,
  captureDistance: 1.05,
  immunitySeconds: 5,
  stuckSeconds: 1.6,
});
// Deliberately independent of shader ranges: tune hearing without changing visibility.
export const HEARING: Readonly<
  Record<SonicKind, { radius: number; priority: number }>
> = Object.freeze({
  FOOTSTEP: { radius: SOUND_PROFILES.FOOTSTEP.maxRadius, priority: 1 },
  RUN: { radius: SOUND_PROFILES.RUN.maxRadius, priority: 2 },
  LANDING: { radius: SOUND_PROFILES.LANDING.maxRadius, priority: 3 },
  TEST: { radius: SOUND_PROFILES.TEST.maxRadius, priority: 4 },
  GUNSHOT: { radius: SOUND_PROFILES.GUNSHOT.maxRadius, priority: 5 },
  ANIMAL: { radius: SOUND_PROFILES.ANIMAL.maxRadius, priority: 1 },
});
