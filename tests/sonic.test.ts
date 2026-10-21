import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SonicWaveSystem, surfaceStrength } from "../src/sonic/waves";
import { SONIC_CONFIG } from "../src/sonic/config";
import { SonicVisionRenderer } from "../src/sonic/vision";

test("wave speed, fixed origin, bounded radius and tail lifetime", () => {
  const s = new SonicWaveSystem(),
    origin = { x: 1, y: 2, z: 3 },
    w = s.emit(origin);
  origin.x = 100;
  s.update(0.5);
  assert.equal(s.radius(w), 12.5);
  assert.equal(w.origin.x, 1);
  s.update(1);
  assert.equal(s.radius(w), 35);
  assert.equal(s.count, 1);
  s.update(s.lifetime - 1.5 + 0.001);
  assert.equal(s.count, 0);
});
test("two points on one broad wall reveal at different times, then fade to zero", () => {
  // Wall plane z=10: centre distance 10, far corner distance sqrt(30²+10²).
  const near = 10,
    far = Math.hypot(30, 10);
  assert.equal(surfaceStrength(near, 0.39), 0);
  assert.ok(surfaceStrength(near, 0.42) > 0.5);
  assert.equal(surfaceStrength(far, 0.42), 0);
  assert.ok(surfaceStrength(far, far / 25 + 0.01) > 0.8);
  assert.ok(surfaceStrength(near, 0.7) > surfaceStrength(near, 1.1));
  assert.equal(surfaceStrength(near, 1.7), 0);
  assert.equal(surfaceStrength(35.01, 1.41), 0);
});
test("rapid emissions reuse exactly eight slots, replace oldest and clear without allocating new slots", () => {
  const s = new SonicWaveSystem(),
    slots = [...s.slots];
  for (let i = 0; i < 80; i++) {
    s.emit({ x: i, y: 0, z: 0 });
    s.update(0.001);
    assert.ok(s.count <= 8);
  }
  assert.deepEqual(s.slots, slots);
  assert.equal(s.count, 8);
  assert.ok(s.slots.every((w) => w.serial >= 73));
  s.clear();
  assert.equal(s.count, 0);
  assert.throws(() => new SonicWaveSystem({ ...SONIC_CONFIG, maxWaves: 9 }));
  assert.throws(() => s.update(-1));
  assert.throws(() => s.emit({ x: NaN, y: 0, z: 0 }));
});
test("render proxies borrow exact geometry/transforms; modes and disposal preserve original materials", () => {
  const source = new THREE.Group(),
    g = new THREE.BoxGeometry(20, 10, 1),
    m = new THREE.MeshStandardMaterial({ color: "green" });
  const wall = new THREE.InstancedMesh(g, m, 2),
    matrix = new THREE.Matrix4().makeTranslation(10, 5, 20);
  wall.name = "test-wall";
  wall.setMatrixAt(0, matrix);
  wall.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-5, 5, 20));
  source.add(wall);
  let disposedGeometry = false,
    disposedMaterial = false;
  g.addEventListener("dispose", () => (disposedGeometry = true));
  m.addEventListener("dispose", () => (disposedMaterial = true));
  const waves = new SonicWaveSystem(),
    v = new SonicVisionRenderer(source, waves);
  const proxy = v.proxies[0] as THREE.InstancedMesh;
  assert.equal(proxy.geometry, g);
  assert.notEqual(proxy.instanceMatrix, wall.instanceMatrix);
  assert.deepEqual(proxy.instanceMatrix.array, wall.instanceMatrix.array);
  for (const mode of [1, 2, 3, 1]) {
    v.setMode(mode);
    assert.equal(wall.material, m);
    assert.equal(m.transparent, false);
  }
  waves.emit({ x: 0, y: 0, z: 0 });
  v.update();
  assert.equal(v.group.visible, true);
  waves.update(3);
  v.update();
  assert.equal(v.group.visible, false);
  v.dispose();
  assert.equal(disposedGeometry, false);
  assert.equal(disposedMaterial, false);
  assert.equal(source.children[0], wall);
  g.dispose();
  m.dispose();
  wall.dispose();
});
