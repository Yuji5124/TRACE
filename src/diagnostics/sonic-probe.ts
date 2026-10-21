// Loaded only with ?test=1. GPU evidence on a broad two-triangle wall using
// the exact box geometry owned by the actual Phase 1 building bucket.
import * as THREE from "three";
import type { SonicKind } from "../sonic/kinds";
import { SonicWaveSystem } from "../sonic/waves";
import { SonicVisionRenderer } from "../sonic/vision";
export function createSonicProbe(
  renderer: THREE.WebGLRenderer,
  worldSource: THREE.Group,
  kind: "wall" | "ground" = "wall",
) {
  const source = worldSource.getObjectByName(
    kind === "wall" ? "building" : "sculpted-ground",
  ) as THREE.Mesh;
  const wall = new THREE.Mesh(source.geometry, new THREE.MeshBasicMaterial());
  if (kind === "wall") {
    wall.scale.set(20, 10, 0.5);
    wall.position.set(0, 5, 0);
  }
  const group = new THREE.Group();
  group.add(wall);
  const waves = new SonicWaveSystem(),
    vision = new SonicVisionRenderer(group, waves);
  vision.setMode(2);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  scene.add(vision.group);
  const camera = new THREE.OrthographicCamera(-12, 12, 7, -7, 0.1, 50);
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 5, 0);
  if (kind === "ground") {
    camera.position.set(0, 30, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
  }
  const target = new THREE.WebGLRenderTarget(128, 96, { depthBuffer: true });
  const pixels = new Uint8Array(128 * 96 * 4);
  return {
    sample(age: number, soundKind: SonicKind = "TEST") {
      waves.clear();
      waves.emit(
        kind === "wall"
          ? { x: 0, y: 5, z: 2 }
          : { x: 0, y: soundKind === "TEST" ? 1.5 : 0.08, z: 0 },
        { kind: soundKind },
      );
      waves.update(age);
      vision.update();
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 128, 96, pixels);
      renderer.setRenderTarget(previous);
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 10) lit++;
      const at = (x: number, y: number) => {
        const i = (y * 128 + x) * 4;
        return pixels[i] + pixels[i + 1] + pixels[i + 2];
      };
      return {
        age,
        lit,
        centre: at(64, 48),
        corner: at(112, 75),
        sixMetres: at(96, 48),
        total: 128 * 96,
        sharedGeometry: vision.proxies[0].geometry === source.geometry,
      };
    },
    dispose() {
      target.dispose();
      vision.dispose();
      (wall.material as THREE.Material).dispose();
    },
  };
}
