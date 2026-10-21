import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWorld } from "../src/world/generate";
import { terrainHeight, parseSeed } from "../src/world/random";
import { terrainGeometry } from "../src/render/world";
import { createPhysics } from "../src/physics/world";

test("same seed produces identical shared map; alternate seed changes vegetation/buildings", () => {
  assert.deepEqual(generateWorld(123), generateWorld(123));
  assert.notDeepEqual(generateWorld(123), generateWorld(124));
  const w = generateWorld(123);
  assert.equal(w.size, 150);
  assert.equal(new Set(w.objects.map((o) => o.id)).size, w.objects.length);
  for (const o of w.objects) {
    assert.ok(o.position.every(Number.isFinite));
    assert.ok(o.scale.every((v) => v > 0));
  }
});
test("seed parsing preserves zero and rejects invalid values; circulation remains flat", () => {
  assert.equal(parseSeed("0"), 0);
  assert.equal(parseSeed("bad"), 104729);
  for (let n = -75; n <= 75; n++) assert.equal(terrainHeight(0, n), 0);
  assert.ok(terrainHeight(-25, -25) > 1);
});
test("player settles, stops at fountain, walks stairs and is bounded without any visual group", async () => {
  const def = generateWorld(104729),
    p = await createPhysics(def, terrainGeometry());
  for (let i = 0; i < 120; i++) p.move(0, 0, 1 / 60);
  assert.ok(Math.abs(p.body.translation().y - 0.81) < 0.08, "ground contact");
  for (let i = 0; i < 600; i++) p.move(0, -0.06, 1 / 60);
  assert.ok(
    p.body.translation().z > 3.5 && p.body.translation().z < 3.8,
    "fountain blocks capsule",
  );
  p.body.setTranslation({ x: -20, y: 0.82, z: 8 }, true);
  p.world.step();
  for (let i = 0; i < 180; i++) p.move(0, 0.04, 1 / 60);
  assert.ok(p.body.translation().z > 12.5, "stair ascent");
  assert.ok(p.body.translation().y > 1.75, "terrace elevation");
  p.body.setTranslation({ x: 0, y: 0.82, z: 70 }, true);
  p.world.step();
  for (let i = 0; i < 180; i++) p.move(0, 0.06, 1 / 60);
  assert.ok(p.body.translation().z < 74.7, "map boundary");
  p.world.free();
});
