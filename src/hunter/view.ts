import * as THREE from "three";
import type { EchoHunter } from "./hunter";
import type { SonicWaveSystem } from "../sonic/waves";
import { SonicVisionRenderer } from "../sonic/vision";
/** Same moving source geometry in ordinary and acoustic rendering. No hidden HUD marker. */
export class HunterView {
  readonly group = new THREE.Group();
  readonly vision: SonicVisionRenderer;
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshStandardMaterial({
    color: "#364943",
    roughness: 0.78,
  });
  readonly debugCone: THREE.Line;
  private readonly coneGeometry = new THREE.BufferGeometry();
  private readonly coneMaterial = new THREE.LineBasicMaterial({
    color: "#ffb86b", depthTest: false, transparent: true, opacity: 0.65,
  });
  private readonly conePositions = new Float32Array(35 * 3);
  private readonly limbs: THREE.Mesh[] = [];
  private travel = 0;
  private lastX = 0;
  private lastZ = 0;
  constructor(
    readonly hunter: EchoHunter,
    waves: SonicWaveSystem,
  ) {
    const part = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => {
      const m = new THREE.Mesh(this.geometry, this.material);
      m.position.set(x, y, z);
      m.scale.set(w, h, d);
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    part(0, 1.05, 0, 0.55, 0.8, 0.3);
    part(0, 1.72, 0.04, 0.32, 0.38, 0.3);
    // Non-emissive projecting face: direction is legible only when the body is visible.
    part(0, 1.71, 0.23, 0.22, 0.13, 0.16);
    this.coneGeometry.setAttribute(
      "position", new THREE.BufferAttribute(this.conePositions, 3),
    );
    this.debugCone = new THREE.Line(this.coneGeometry, this.coneMaterial);
    this.debugCone.frustumCulled = false;
    this.debugCone.renderOrder = 5;
    // main attaches the debug cone separately, outside the acoustic source tree.
    this.limbs.push(
      part(-0.2, 0.35, 0, 0.16, 0.7, 0.18),
      part(0.2, 0.35, 0, 0.16, 0.7, 0.18),
      part(-0.4, 0.92, 0, 0.12, 0.85, 0.14),
      part(0.4, 0.92, 0, 0.12, 0.85, 0.14),
    );
    this.group.name = "ECHO HUNTER";
    this.update(1);
    this.vision = new SonicVisionRenderer(this.group, waves, true);
  }
  update(mode: number) {
    const p = this.hunter.position,
      d = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    this.travel += Math.min(d, 0.5) * 3;
    this.lastX = p.x;
    this.lastZ = p.z;
    this.group.position.set(p.x, p.y - 0.8, p.z);
    this.group.rotation.y = this.hunter.facing;
    this.group.visible = mode !== 2;
    this.limbs.forEach(
      (m, i) =>
        (m.rotation.x = Math.sin(this.travel + (i % 2) * Math.PI) * 0.22),
    );
    this.debugCone.visible = mode === 3;
    this.debugCone.position.set(p.x, p.y + 0.45, p.z);
    this.debugCone.rotation.y = this.hunter.facing;
    const half = this.hunter.fieldOfView * Math.PI / 360;
    this.conePositions.fill(0);
    for (let i = 0; i <= 32; i++) {
      const a = -half + 2 * half * i / 32, index = (i + 1) * 3;
      this.conePositions[index] = Math.sin(a) * this.hunter.sightRange;
      this.conePositions[index + 2] = Math.cos(a) * this.hunter.sightRange;
    }
    this.coneGeometry.attributes.position.needsUpdate = true;
    this.group.updateMatrixWorld(true);
    this.vision?.update();
  }
  setMode(mode: number) {
    this.group.visible = mode !== 2;
    this.debugCone.visible = mode === 3;
    this.vision.setMode(mode);
  }
  dispose() {
    this.vision.dispose();
    this.group.removeFromParent();
    this.debugCone.removeFromParent();
    this.coneGeometry.dispose();
    this.coneMaterial.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
