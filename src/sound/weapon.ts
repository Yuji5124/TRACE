import * as THREE from "three";
import { SoundActionSystem, SOUND_ACTION_CONFIG } from "./actions";
export class SoundWeapon {
  readonly group = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly barrel = new THREE.CylinderGeometry(0.026, 0.032, 0.26, 8);
  private readonly bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0x6c817d,
  });
  private readonly gripMaterial = new THREE.MeshBasicMaterial({
    color: 0x293d38,
  });
  private readonly flashGeometry = new THREE.BufferGeometry();
  private readonly flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe5a0,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  private readonly flash: THREE.Mesh;
  private readonly muzzle = new THREE.Vector3();
  private shownShot = 0;
  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly actions: SoundActionSystem,
  ) {
    this.group.name = "sound-action-viewmodel";
    this.group.position.set(0.3, -0.25, -0.55);
    const body = new THREE.Mesh(this.box, this.bodyMaterial);
    body.scale.set(0.14, 0.11, 0.22);
    this.group.add(body);
    const grip = new THREE.Mesh(this.box, this.gripMaterial);
    grip.scale.set(0.08, 0.16, 0.1);
    grip.position.set(0, -0.09, 0.05);
    grip.rotation.x = -0.25;
    this.group.add(grip);
    const barrel = new THREE.Mesh(this.barrel, this.bodyMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.22;
    this.group.add(barrel);
    const vertices: number[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6,
        b = ((i + 1) * Math.PI) / 6;
      const ra = i % 2 ? 0.038 : 0.095,
        rb = (i + 1) % 2 ? 0.038 : 0.095;
      vertices.push(
        0,
        0,
        0,
        Math.cos(a) * ra,
        Math.sin(a) * ra,
        0,
        Math.cos(b) * rb,
        Math.sin(b) * rb,
        0,
      );
    }
    this.flashGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    this.flash = new THREE.Mesh(this.flashGeometry, this.flashMaterial);
    this.flash.position.z = -0.36;
    this.flash.visible = false;
    this.flash.renderOrder = 30;
    this.group.add(this.flash);
    camera.add(this.group);
  }
  private fitViewport() {
    const width = Math.min(1, this.camera.aspect);
    this.group.position.x = 0.3 * width;
    this.group.scale.setScalar(Math.min(1, width * 0.9 + 0.1));
  }
  shoot() {
    this.fitViewport();
    this.camera.updateMatrixWorld(true);
    this.flash.getWorldPosition(this.muzzle);
    const fired = this.actions.shoot(this.muzzle);
    if (fired) {
      this.flash.visible = true;
      this.flashMaterial.opacity = 1;
    }
    return fired;
  }
  update() {
    this.fitViewport();
    const age = this.actions.waves.time - this.actions.lastShotTime;
    const newShot = this.shownShot !== this.actions.shots;
    this.flash.visible =
      this.actions.shots > 0 &&
      (newShot || age < SOUND_ACTION_CONFIG.muzzleDuration);
    this.flashMaterial.opacity = newShot
      ? 1
      : Math.max(0, 1 - age / SOUND_ACTION_CONFIG.muzzleDuration);
    this.shownShot = this.actions.shots;
  }
  reset() {
    this.flash.visible = false;
    this.shownShot = this.actions.shots;
  }
  get flashVisible() {
    return this.flash.visible;
  }
  dispose() {
    this.group.removeFromParent();
    this.box.dispose();
    this.barrel.dispose();
    this.flashGeometry.dispose();
    this.bodyMaterial.dispose();
    this.gripMaterial.dispose();
    this.flashMaterial.dispose();
    this.group.clear();
  }
}
