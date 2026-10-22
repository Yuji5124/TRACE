import test from "node:test";
import assert from "node:assert/strict";
import { inViewCone, turnToward } from "../src/hunter/perception";
const origin = { x: 0, y: 0, z: 0 };
test("view cone has inclusive edges, rejects rear and wraps headings across ±pi", () => {
  assert.ok(inViewCone(origin, { x: 0, y: 20, z: 5 }, 0, 90));
  assert.ok(inViewCone(origin, { x: 5, y: 0, z: 5 }, 0, 90));
  assert.ok(!inViewCone(origin, { x: 5.1, y: 0, z: 5 }, 0, 90));
  assert.ok(!inViewCone(origin, { x: 0, y: 0, z: -5 }, 0, 110));
  assert.ok(inViewCone(origin, { x: -0.1, y: 0, z: -5 }, Math.PI - 0.02, 90));
  assert.ok(inViewCone(origin, { x: 6, y: 0, z: 5 }, 0, 110));
  assert.ok(!inViewCone(origin, { x: 6, y: 0, z: 5 }, 0, 90));
});
test("turns follow shortest arc and never exceed angular speed even across wrap", () => {
  assert.equal(turnToward(0, Math.PI, 0.04), 0.04);
  const next = turnToward(Math.PI - 0.02, -Math.PI + 0.02, 0.01);
  assert.ok(Math.abs(next - (Math.PI - 0.01)) < 1e-8);
  assert.ok(Math.abs(turnToward(0, 0.01, 0.04) - 0.01) < 1e-8);
});
