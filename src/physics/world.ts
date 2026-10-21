import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { WorldDefinition, WorldObject } from "../world/types";

export async function createPhysics(
  def: WorldDefinition,
  ground: THREE.BufferGeometry,
) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 });
  const vertices = new Float32Array(ground.attributes.position.array);
  const indices = new Uint32Array(ground.index!.array);
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.8),
  );
  const colliderObjects = new Map<number, WorldObject>();
  const q = new THREE.Quaternion();
  for (const o of def.objects)
    if (o.collider) {
      // Conservative proxies for organic rocks; non-uniform ellipsoids use cuboids.
      const [w, h, d] = o.scale;
      const desc =
        o.shape === "cylinder"
          ? RAPIER.ColliderDesc.cylinder(h / 2, w / 2)
          : RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2);
      q.setFromEuler(new THREE.Euler(...(o.rotation ?? [0, 0, 0])));
      desc
        .setTranslation(...o.position)
        .setRotation(q)
        .setFriction(0.7);
      const c = world.createCollider(desc);
      colliderObjects.set(c.handle, o);
    }
  // Boundaries are explicit and visualised in F3.
  for (const [x, z, w, d] of [
    [-75, 0, 0.3, 150],
    [75, 0, 0.3, 150],
    [0, -75, 150, 0.3],
    [0, 75, 150, 0.3],
  ])
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, 12, d / 2).setTranslation(x, 12, z),
    );
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...def.spawn),
  );
  const player = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.5, 0.3),
    body,
  );
  const controller = world.createCharacterController(0.015);
  controller.enableAutostep(0.26, 0.3, true);
  controller.enableSnapToGround(0.3);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  controller.setMinSlopeSlideAngle(Math.PI * 0.3);
  world.timestep = 1 / 60;
  world.step();
  const beforeStep = new Set<(dt: number) => void>();
  let vertical = 0;
  const move = (dx: number, dz: number, dt: number) => {
    vertical = Math.max(-30, vertical - 20 * dt);
    controller.computeColliderMovement(
      player,
      { x: dx, y: vertical * dt, z: dz },
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
      undefined,
      (c) => c.handle !== player.handle,
    );
    const m = controller.computedMovement(),
      p = body.translation();
    body.setNextKinematicTranslation({
      x: p.x + m.x,
      y: p.y + m.y,
      z: p.z + m.z,
    });
    for (const tick of beforeStep) tick(dt);
    world.timestep = dt;
    world.step();
    if (controller.computedGrounded()) vertical = 0;
    return body.translation();
  };
  const reset = () => {
    vertical = 0;
    body.setTranslation(
      { x: def.spawn[0], y: def.spawn[1], z: def.spawn[2] },
      true,
    );
    body.setNextKinematicTranslation({
      x: def.spawn[0],
      y: def.spawn[1],
      z: def.spawn[2],
    });
    world.step();
  };
  return {
    world,
    body,
    player,
    controller,
    colliderObjects,
    move,
    reset,
    beforeStep,
  };
}
export type Physics = Awaited<ReturnType<typeof createPhysics>>;
