import type { SonicOrigin as Point } from "../sonic/waves";

/** Horizontal cone, facing +Z at zero. Range/occlusion remain separate tests. */
export function inViewCone(origin: Point, target: Point, facing: number, degrees: number) {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  if (dx * dx + dz * dz < 1e-8) return true;
  const angle = Math.atan2(dx, dz) - facing;
  return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= degrees * Math.PI / 360 + 1e-8;
}

export function turnToward(facing: number, desired: number, maxDelta: number) {
  const difference = Math.atan2(Math.sin(desired - facing), Math.cos(desired - facing));
  return facing + Math.max(-maxDelta, Math.min(maxDelta, difference));
}
