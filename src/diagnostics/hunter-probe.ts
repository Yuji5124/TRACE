import * as THREE from "three";
import type { HunterView } from "../hunter/view";
import type { SonicWaveSystem } from "../sonic/waves";
/** QA only: actual moving hunter proxy geometry rendered to an isolated target. */
export function createHunterProbe(
  renderer: THREE.WebGLRenderer,
  view: HunterView,
  waves: SonicWaveSystem,
) {
  const scene = new THREE.Scene(),
    target = new THREE.WebGLRenderTarget(128, 128),
    pixels = new Uint8Array(128 * 128 * 4);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50),
    p = view.hunter.position,
    parent = view.vision.group.parent;
  camera.position.set(p.x, p.y + 0.2, p.z + 8);
  camera.lookAt(p.x, p.y + 0.2, p.z);
  scene.add(view.vision.group);
  view.vision.setMode(2);
  waves.clear();
  waves.emit({ x: p.x + 8, y: p.y, z: p.z }, { kind: "TEST" });
  const start = waves.time;
  const oldTarget = renderer.getRenderTarget(),
    clear = renderer.getClearColor(new THREE.Color()),
    alpha = renderer.getClearAlpha();
  return {
    sample(age: number) {
      waves.update(Math.max(0, start + age - waves.time));
      view.update(2);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 6) lit++;
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(clear, alpha);
      return {
        age,
        lit,
        sharedGeometry: view.vision.proxies.every(
          (m, i) => m.geometry === view.vision.sources[i].geometry,
        ),
        aligned: view.vision.proxies.every((m, i) =>
          m.matrix.equals(view.vision.sources[i].matrixWorld),
        ),
      };
    },
    dispose() {
      parent?.add(view.vision.group);
      target.dispose();
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(clear, alpha);
    },
  };
}
