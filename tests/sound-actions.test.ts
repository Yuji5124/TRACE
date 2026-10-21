import { test } from "node:test";
import assert from "node:assert/strict";
import { SonicWaveSystem } from "../src/sonic/waves";
import { SOUND_PROFILES, SONIC_KINDS } from "../src/sonic/kinds";
import {
  SoundActionSystem,
  FootstepTracker,
  SOUND_ACTION_CONFIG,
} from "../src/sound/actions";
import { createPhysics } from "../src/physics/world";
import { terrainGeometry } from "../src/render/world";
import { generateWorld } from "../src/world/generate";

test("typed pulses keep independent radius/lifetime, preserve TEST defaults and cap to configuration", () => {
  const s = new SonicWaveSystem();
  for (const kind of SONIC_KINDS) {
    const w = s.emit({ x: 0, y: 0, z: 0 }, { kind });
    assert.equal(w.kind, kind);
    assert.equal(w.maxRadius, SOUND_PROFILES[kind].maxRadius);
    s.update(0.4);
    assert.ok(s.radius(w) <= w.maxRadius);
  }
  const foot = s.emit({ x: 0, y: 0, z: 0 }, { kind: "FOOTSTEP" }),
    gun = s.emit({ x: 0, y: 0, z: 0 }, { kind: "GUNSHOT" });
  s.update(1.5);
  assert.equal(foot.active, false);
  assert.equal(gun.active, true);
  assert.equal(s.emit({ x: 0, y: 0, z: 0 }).kind, "TEST");
  assert.equal(s.emit({ x: 0, y: 0, z: 0 }, { maxRadius: 100 }).maxRadius, 35);
  assert.throws(() => s.emit({ x: 0, y: 0, z: 0 }, { kind: "bad" as never }));
});
test("shared capacity replaces global oldest serial independent of kind; audio failure cannot suppress a pulse", () => {
  const waves = new SonicWaveSystem(),
    actions = new SoundActionSystem(waves, {
      play() {
        throw Error("audio unavailable");
      },
    });
  for (let i = 0; i < 20; i++)
    actions.emit(SONIC_KINDS[i % SONIC_KINDS.length], { x: i, y: 0.08, z: 0 });
  assert.equal(waves.count, 8);
  assert.ok(waves.slots.every((w) => w.serial >= 13));
  assert.equal(actions.audioFailures, 20);
});
test("shoot cooldown is atomic: rejected shot has neither sound nor extra pulse", () => {
  const waves = new SonicWaveSystem();
  let audio = 0;
  const a = new SoundActionSystem(waves, {
      play() {
        audio++;
      },
    }),
    p = { x: 0, y: 1, z: 0 };
  assert.equal(a.shoot(p), true);
  assert.equal(a.shoot(p), false);
  assert.equal(waves.emitted, 1);
  assert.equal(audio, 1);
  waves.update(SOUND_ACTION_CONFIG.shotCooldown);
  assert.equal(a.shoot(p), true);
  assert.equal(a.shots, 2);
  assert.equal(audio, 2);
});
test("spawn settling, stationary and airborne states stay quiet; meaningful landing emits once", () => {
  const kinds: string[] = [];
  const t = new FootstepTracker((kind) => kinds.push(kind));
  t.update({
    before: { x: 0, y: 1.8, z: 0 },
    after: { x: 0, y: 0.81, z: 0 },
    dt: 0.2,
    grounded: true,
    running: false,
  });
  assert.equal(kinds.length, 0);
  for (let i = 0; i < 200; i++)
    t.update({
      before: { x: 0, y: 0.81, z: 0 },
      after: { x: 0, y: 0.81, z: 0 },
      dt: 1 / 60,
      grounded: true,
      running: true,
    });
  assert.equal(kinds.length, 0);
  let y = 1.8;
  for (let i = 0; i < 4; i++) {
    t.update({
      before: { x: 0, y, z: 0 },
      after: { x: 0, y: y - 0.2, z: 0 },
      dt: 0.05,
      grounded: false,
      running: true,
    });
    y -= 0.2;
  }
  t.update({
    before: { x: 0, y, z: 0 },
    after: { x: 0, y: 0.81, z: 0 },
    dt: 0.05,
    grounded: true,
    running: false,
  });
  assert.deepEqual(kinds, ["LANDING"]);
});
test("actual Rapier displacement drives footfalls: running emits more; walls and stopping emit none", async () => {
  const physics = await createPhysics(generateWorld(104729), terrainGeometry()),
    waves = new SonicWaveSystem(),
    a = new SoundActionSystem(waves),
    STEP = 1 / 60;
  function tick(dx: number, dz: number, running = false) {
    waves.update(STEP);
    const before = physics.body.translation(),
      after = physics.move(dx, dz, STEP);
    a.footsteps.update({
      before,
      after,
      dt: STEP,
      grounded: physics.controller.computedGrounded(),
      running,
    });
  }
  for (let i = 0; i < 120; i++) tick(0, 0);
  assert.equal(waves.emissions.LANDING, 0);
  for (let i = 0; i < 90; i++) tick(0, -3.6 * STEP);
  const walk = waves.emissions.FOOTSTEP;
  assert.ok(walk >= 3);
  assert.ok(
    waves.slots
      .filter((w) => w.kind === "FOOTSTEP")
      .every((w) => w.origin.y < 0.15 && w.maxRadius === 4),
  );
  physics.reset();
  a.reset();
  for (let i = 0; i < 120; i++) tick(0, 0);
  for (let i = 0; i < 90; i++) tick(0, -6.2 * STEP, true);
  assert.ok(waves.emissions.RUN > walk);
  assert.ok(
    waves.slots.filter((w) => w.kind === "RUN").every((w) => w.maxRadius === 8),
  );
  const stopped = waves.emitted;
  for (let i = 0; i < 120; i++) tick(0, 0, true);
  assert.equal(waves.emitted, stopped);
  physics.body.setTranslation({ x: 0, y: 0.81, z: 4 }, true);
  physics.world.step();
  a.reset();
  for (let i = 0; i < 120; i++) tick(0, -6.2 * STEP, true);
  const blocked = waves.emitted;
  for (let i = 0; i < 180; i++) tick(0, -6.2 * STEP, true);
  assert.equal(
    waves.emitted,
    blocked,
    "held movement into fountain cannot synthesize more footsteps",
  );
  physics.world.free();
});
