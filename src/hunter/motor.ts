import RAPIER from "@dimforge/rapier3d-compat";
import type { Physics } from "../physics/world";
import type { SonicOrigin as Point } from "../sonic/waves";
export class HunterMotor {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private vertical = 0;
  constructor(
    readonly physics: Physics,
    spawn: Point,
  ) {
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y,
        spawn.z,
      ),
    );
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.5, 0.3),
      this.body,
    );
    this.controller = physics.world.createCharacterController(0.015);
    this.controller.enableAutostep(0.26, 0.3, true);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
  }
  get position() {
    return this.body.translation();
  }
  prepare(target: Point | null, speed: number, dt: number) {
    const p = this.position,
      dx = target ? target.x - p.x : 0,
      dz = target ? target.z - p.z : 0,
      d = Math.hypot(dx, dz),
      scale = d > 0 ? Math.min(speed * dt, d) / d : 0;
    this.vertical = Math.max(-30, this.vertical - 20 * dt);
    this.controller.computeColliderMovement(
      this.collider,
      { x: dx * scale, y: this.vertical * dt, z: dz * scale },
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
      undefined,
      (c) => c.handle !== this.collider.handle,
    );
    const m = this.controller.computedMovement();
    this.body.setNextKinematicTranslation({
      x: p.x + m.x,
      y: p.y + m.y,
      z: p.z + m.z,
    });
    if (this.controller.computedGrounded()) this.vertical = 0;
  }
  reset(p: Point) {
    this.vertical = 0;
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
  }
  dispose() {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
  canSee(p: Point, range: number) {
    const a = this.position,
      dx = p.x - a.x,
      dy = p.y - a.y,
      dz = p.z - a.z,
      d = Math.hypot(dx, dy, dz);
    if (d > range) return false;
    if (d < 0.01) return true;
    const ray = new RAPIER.Ray(
      { x: a.x, y: a.y + 0.45, z: a.z },
      { x: dx / d, y: dy / d, z: dz / d },
    );
    const hit = this.physics.world.castRay(
      ray,
      d,
      true,
      undefined,
      undefined,
      this.collider,
      undefined,
      (c) => c.handle !== this.physics.player.handle,
    );
    return !hit;
  }
}
