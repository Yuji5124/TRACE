import test from "node:test";
import assert from "node:assert/strict";
import { createPhysics } from "../src/physics/world";
import { generateWorld } from "../src/world/generate";
import { terrainGeometry } from "../src/render/world";
import { SonicWaveSystem } from "../src/sonic/waves";
import { SoundActionSystem } from "../src/sound/actions";
import { EchoHunter } from "../src/hunter/hunter";
const STEP = 1 / 60;
async function fixture(seed = 104729) {
  const physics = await createPhysics(generateWorld(seed), terrainGeometry()),
    waves = new SonicWaveSystem(),
    hunter = new EchoHunter(physics, waves, seed);
  const putPlayer = (x = 70, y = 0.81, z = 45) => {
    physics.body.setTranslation({ x, y, z }, true);
    physics.body.setNextKinematicTranslation({ x, y, z });
    physics.world.step();
  };
  putPlayer();
  const tick = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      waves.update(STEP);
      physics.move(0, 0, STEP);
    }
  };
  const close = () => {
    hunter.dispose();
    physics.world.free();
  };
  return { physics, waves, hunter, putPlayer, tick, close };
}
test("hunter ignores sounds outside radius; range and propagation delay are independent of visuals", async () => {
  const f = await fixture();
  try {
    const p = f.hunter.position;
    f.waves.emit({ x: p.x + 40, y: p.y, z: p.z }, { kind: "TEST" });
    f.tick(2);
    assert.equal(Boolean(f.hunter.lastHeard), false);
    assert.equal(f.hunter.state, "IDLE");
    f.waves.emit({ x: p.x, y: p.y, z: p.z + 15 }, { kind: "TEST" });
    f.tick(0.3);
    assert.equal(Boolean(f.hunter.lastHeard), false);
    f.tick(0.4);
    assert.equal(f.hunter.lastHeard?.kind, "TEST");
    assert.equal(f.hunter.state, "INVESTIGATE");
  } finally {
    f.close();
  }
});
test("walking 4m does not reach 6m; running 8m reaches and records original position", async () => {
  const f = await fixture();
  try {
    const p = f.hunter.position,
      source = { x: p.x + 6, y: p.y, z: p.z };
    f.waves.emit(source, { kind: "FOOTSTEP" });
    f.tick(0.5);
    assert.equal(Boolean(f.hunter.lastHeard), false);
    f.waves.emit(source, { kind: "RUN" });
    f.tick(0.4);
    assert.equal(f.hunter.lastHeard?.kind, "RUN");
    assert.deepEqual(f.hunter.lastHeard?.origin, source);
  } finally {
    f.close();
  }
});
test("gunshot wins over weaker newer events, then recent sound can retarget after attention expires", async () => {
  const f = await fixture();
  try {
    const p = f.hunter.position;
    f.waves.emit({ x: p.x + 2, y: p.y, z: p.z }, { kind: "GUNSHOT" });
    f.tick(0.2);
    f.waves.emit({ x: p.x - 2, y: p.y, z: p.z }, { kind: "RUN" });
    f.tick(0.2);
    assert.equal(f.hunter.lastHeard?.kind, "GUNSHOT");
    f.tick(2.1);
    const next = { x: f.hunter.position.x, y: p.y, z: f.hunter.position.z + 3 };
    f.waves.emit(next, { kind: "RUN" });
    f.tick(0.3);
    assert.equal(f.hunter.lastHeard?.kind, "RUN");
    assert.deepEqual(f.hunter.target, next);
  } finally {
    f.close();
  }
});
test("old source memory expires through SEARCH and RETURN, without tracking a silent player", async () => {
  const f = await fixture();
  try {
    const p = f.hunter.position,
      source = { x: p.x, y: p.y, z: p.z + 20 };
    f.waves.emit(source, { kind: "TEST" });
    f.tick(1);
    assert.deepEqual(f.hunter.target, source);
    f.putPlayer(-65, 0.81, -45);
    f.tick(0.4);
    assert.deepEqual(f.hunter.target, source);
    f.tick(22);
    assert.notEqual(f.hunter.state, "INVESTIGATE");
    assert.ok(f.hunter.logs.some((x) => x.to === "SEARCH"));
    assert.ok(f.hunter.logs.some((x) => x.to === "RETURN"));
  } finally {
    f.close();
  }
});
test("A* routes around a building and finds raised terrace support without corner cutting", async () => {
  const f = await fixture();
  try {
    const n = f.hunter.navigation,
      path = n.route({ x: 0, y: 0.81, z: 53 }, { x: 0, y: 0.81, z: 74 });
    assert.ok(path && path.length > 30);
    assert.ok(path.some((p) => Math.abs(p.x) > 9));
    const stairs = n.route(
      { x: -20, y: 0.81, z: 7 },
      { x: -20, y: 1.81, z: 20 },
    );
    assert.ok(stairs?.some((p) => p.y > 1.7));
  } finally {
    f.close();
  }
});
test("actual Rapier motor cannot walk straight through building facade", async () => {
  const f = await fixture();
  try {
    f.physics.beforeStep.clear();
    f.hunter.motor.reset({ x: 0, y: 0.81, z: 53 });
    f.physics.world.step();
    const go = (dt: number) =>
      f.hunter.motor.prepare({ x: 0, y: 0.81, z: 67 }, 6, dt);
    f.physics.beforeStep.add(go);
    f.tick(4);
    assert.ok(f.hunter.position.z < 55.3);
    assert.ok(f.hunter.position.z > 53);
    f.physics.beforeStep.delete(go);
  } finally {
    f.close();
  }
});
test("LOS loss behind actual fountain collider enters SEARCH at last seen point", async () => {
  const f = await fixture();
  try {
    f.hunter.motor.reset({ x: 6, y: 0.81, z: 5 });
    f.putPlayer(6, 0.81, 0);
    f.tick(0.2);
    assert.equal(f.hunter.state, "CHASE");
    const seen = { ...f.hunter.lastSeen! };
    f.hunter.motor.reset({ x: -4, y: 0.81, z: 0 });
    f.putPlayer(4, 0.81, 0);
    f.hunter.pauseUntil = f.hunter.time + 3;
    f.tick(1);
    assert.equal(f.hunter.state, "SEARCH");
    assert.deepEqual(f.hunter.lastSeen, seen);
    assert.notDeepEqual(f.hunter.target, { x: 4, y: 0.81, z: 0 });
  } finally {
    f.close();
  }
});
test("capture requires LOS and expired grace; reset clears brain queue and prevents immediate recapture", async () => {
  const f = await fixture();
  try {
    const p = f.hunter.position;
    f.putPlayer(p.x + 0.7, p.y, p.z);
    f.hunter.immunityUntil = 0;
    f.tick(0.2);
    assert.equal(f.hunter.captures, 1);
    assert.equal(f.hunter.capturePending, true);
    f.waves.emit(p, { kind: "TEST" });
    f.hunter.reset();
    f.waves.clear();
    f.physics.reset();
    assert.equal(f.hunter.pending.length, 0);
    assert.equal(Boolean(f.hunter.lastHeard), false);
    assert.equal(f.hunter.state, "IDLE");
    assert.equal(f.hunter.immune, true);
    f.tick(1);
    assert.equal(f.hunter.captures, 1);
  } finally {
    f.close();
  }
});
test("audio output failure cannot prevent hearing; wave-slot reuse does not mutate queued event memory", async () => {
  const f = await fixture();
  try {
    const a = new SoundActionSystem(f.waves, {
        play() {
          throw Error("denied");
        },
      }),
      p = f.hunter.position,
      source = { x: p.x + 10, y: p.y, z: p.z };
    a.emit("GUNSHOT", source);
    for (let i = 0; i < 12; i++) a.emit("FOOTSTEP", { x: 70, y: 0, z: 70 });
    f.tick(0.6);
    assert.equal(a.audioFailures, 13);
    assert.equal(f.hunter.lastHeard?.kind, "GUNSHOT");
    assert.deepEqual(f.hunter.lastHeard?.origin, source);
  } finally {
    f.close();
  }
});
test("same seed and fixed simulation steps reproduce hunter patrol, bounded decision and path rates", async () => {
  const a = await fixture(),
    b = await fixture();
  try {
    a.tick(10);
    b.tick(10);
    assert.deepEqual(a.hunter.position, b.hunter.position);
    assert.equal(a.hunter.state, b.hunter.state);
    assert.equal(a.hunter.brainTicks, 100);
    assert.ok(a.hunter.navigation.searches <= 11);
    assert.ok(a.hunter.pending.length <= 64);
    assert.ok(a.hunter.logs.length <= 128);
  } finally {
    a.close();
    b.close();
  }
});

test("Rapier follows planned building detour and climbs terrace stairs", async () => {
  const f = await fixture();
  try {
    f.physics.beforeStep.clear();
    const follow = (
      from: { x: number; y: number; z: number },
      to: { x: number; y: number; z: number },
      seconds: number,
    ) => {
      const path = f.hunter.navigation.route(from, to);
      assert.ok(path);
      f.hunter.motor.reset(from);
      f.physics.world.step();
      let index = 0;
      const go = (dt: number) => {
        const p = f.hunter.position;
        while (
          index < path.length &&
          Math.hypot(p.x - path[index].x, p.z - path[index].z) < 0.2
        )
          index++;
        f.hunter.motor.prepare(path[index] ?? null, 2.5, dt);
      };
      f.physics.beforeStep.add(go);
      f.tick(seconds);
      f.physics.beforeStep.delete(go);
      return { position: f.hunter.position, index, length: path.length };
    };
    const around = follow(
      { x: 0, y: 0.81, z: 53 },
      { x: 0, y: 0.81, z: 74 },
      25,
    );
    assert.ok(
      Math.hypot(around.position.x, around.position.z - 74) < 1,
      JSON.stringify(around),
    );
    const up = follow(
      { x: -20, y: 0.81, z: 7 },
      { x: -20, y: 1.81, z: 20 },
      10,
    );
    assert.ok(up.position.y > 1.7 && up.position.z > 19, JSON.stringify(up));
  } finally {
    f.close();
  }
});

test("continuous new sounds retarget without repeatedly clearing the route or freezing movement", async () => {
  const f = await fixture();
  try {
    const start = f.hunter.position;
    for (let i = 0; i < 12; i++) {
      f.waves.emit(
        { x: start.x, y: start.y, z: start.z + 15 },
        { kind: "TEST" },
      );
      f.tick(0.25);
    }
    assert.ok(
      Math.hypot(f.hunter.position.x - start.x, f.hunter.position.z - start.z) >
        4,
    );
    assert.ok(f.hunter.navigation.searches <= 4);
  } finally {
    f.close();
  }
});
