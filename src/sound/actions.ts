import {
  SonicWaveSystem,
  type SonicOrigin,
  type SonicWave,
} from "../sonic/waves";
import type { SonicKind } from "../sonic/kinds";
export const SOUND_ACTION_CONFIG = Object.freeze({
  walkStride: 1.65,
  runStride: 1.45,
  firstStepDistance: 0.25,
  minRunSpeed: 4.15,
  minFootstepSpeed: 0.2,
  shotCooldown: 0.3,
  muzzleDuration: 0.075,
  minimumLandingDrop: 0.45,
  minimumAirTime: 0.12,
});
export interface SoundOutput {
  play(kind: SonicKind): void;
}
export interface MotionSample {
  before: SonicOrigin;
  after: SonicOrigin;
  dt: number;
  grounded: boolean;
  running: boolean;
}
export class FootstepTracker {
  private distance = 0;
  private stepped = false;
  private airTime = 0;
  private drop = 0;
  private wasGrounded = false;
  private seenGround = false;
  constructor(
    private readonly emit: (kind: SonicKind, origin: SonicOrigin) => void,
  ) {}
  reset() {
    this.distance = 0;
    this.stepped = false;
    this.airTime = 0;
    this.drop = 0;
    this.wasGrounded = false;
    this.seenGround = false;
  }
  update(s: MotionSample) {
    const c = SOUND_ACTION_CONFIG,
      dx = s.after.x - s.before.x,
      dz = s.after.z - s.before.z,
      d = Math.hypot(dx, dz);
    if (s.dt <= 0 || !Number.isFinite(d) || d > Math.max(1, s.dt * 15)) {
      this.reset();
      return;
    }
    // Capsule half-height is 0.8m; use its support surface, including raised stairs.
    const origin = { x: s.after.x, y: s.after.y - 0.8 + 0.07, z: s.after.z };
    if (!s.grounded) {
      if (this.seenGround) {
        this.airTime += s.dt;
        this.drop += Math.max(0, s.before.y - s.after.y);
      }
      this.distance = 0;
      this.stepped = false;
      this.wasGrounded = false;
      return;
    }
    const landed =
      this.seenGround &&
      !this.wasGrounded &&
      this.airTime >= c.minimumAirTime &&
      this.drop >= c.minimumLandingDrop;
    this.seenGround = true;
    this.wasGrounded = true;
    this.airTime = 0;
    this.drop = 0;
    if (landed) {
      this.emit("LANDING", origin);
      this.distance = 0;
      this.stepped = false;
      return;
    }
    // Input into a wall or resting collision jitter must not produce footsteps.
    if (d < 0.0001 || d / s.dt < c.minFootstepSpeed) {
      this.distance = 0;
      this.stepped = false;
      return;
    }
    const run = s.running && d / s.dt >= c.minRunSpeed;
    this.distance += d;
    const stride = run ? c.runStride : c.walkStride;
    const threshold = this.stepped ? stride : c.firstStepDistance;
    if (this.distance >= threshold) {
      this.distance -= threshold;
      this.stepped = true;
      this.emit(run ? "RUN" : "FOOTSTEP", origin);
    }
  }
}
/** Shared entry point for player, future Yuka actors and validated network events. */
export class SoundActionSystem {
  readonly footsteps: FootstepTracker;
  lastShotTime = -Infinity;
  shots = 0;
  audioFailures = 0;
  constructor(
    readonly waves: SonicWaveSystem,
    private readonly output: SoundOutput = { play() {} },
  ) {
    this.footsteps = new FootstepTracker((kind, origin) =>
      this.emit(kind, origin),
    );
  }
  emit(kind: SonicKind, origin: SonicOrigin): SonicWave {
    const wave = this.waves.emit(origin, { kind });
    // Rendering is committed before touching the optional audio subsystem.
    try {
      this.output.play(kind);
    } catch {
      this.audioFailures++;
    }
    return wave;
  }
  shoot(origin: SonicOrigin) {
    if (
      this.waves.time - this.lastShotTime + 1e-8 <
      SOUND_ACTION_CONFIG.shotCooldown
    )
      return false;
    this.lastShotTime = this.waves.time;
    this.shots++;
    this.emit("GUNSHOT", origin);
    return true;
  }
  reset() {
    this.footsteps.reset();
    this.lastShotTime = -Infinity;
  }
}
