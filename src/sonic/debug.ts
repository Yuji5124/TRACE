import * as THREE from "three";
import { SonicWaveSystem } from "./waves";
/** Rings exist only in F3; the actual sonic image is always original geometry. */
export class SonicVisionDebug {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({
    color: 0x6edcff,
    transparent: true,
    opacity: 0.35,
    depthTest: false,
  });
  private readonly rings: THREE.LineLoop[] = [];
  constructor(private readonly waves: SonicWaveSystem) {
    const p = new Float32Array(64 * 3);
    for (let i = 0; i < 64; i++) {
      p[i * 3] = Math.cos((i * Math.PI) / 32);
      p[i * 3 + 2] = Math.sin((i * Math.PI) / 32);
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(p, 3));
    for (let i = 0; i < waves.config.maxWaves; i++)
      for (let plane = 0; plane < 3; plane++) {
        const ring = new THREE.LineLoop(this.geometry, this.material);
        if (plane === 1) ring.rotation.x = Math.PI / 2;
        if (plane === 2) ring.rotation.z = Math.PI / 2;
        ring.renderOrder = 12;
        this.rings.push(ring);
        this.group.add(ring);
      }
    this.group.visible = false;
  }
  update() {
    for (let i = 0; i < this.waves.slots.length; i++) {
      const w = this.waves.slots[i];
      for (let j = 0; j < 3; j++) {
        const ring = this.rings[i * 3 + j];
        ring.visible = w.active;
        if (w.active) {
          ring.position.set(w.origin.x, w.origin.y, w.origin.z);
          ring.scale.setScalar(this.waves.radius(w));
        }
      }
    }
  }
  text() {
    let s = `\nSONIC ${this.waves.count}/${this.waves.config.maxWaves} · emitted ${this.waves.emitted}`;
    for (const w of this.waves.slots)
      if (w.active)
        s += `\n#${w.serial} ${w.kind} limit=${w.maxRadius}m r=${this.waves.radius(w).toFixed(1)}m age=${(this.waves.time - w.bornAt).toFixed(2)}s origin=${w.origin.x.toFixed(1)},${w.origin.y.toFixed(1)},${w.origin.z.toFixed(1)}`;
    return s;
  }
  dispose() {
    this.group.removeFromParent();
    this.group.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
