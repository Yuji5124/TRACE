import * as THREE from "three";
import { MAX_SONIC_WAVES } from "./config";
import { SonicWaveSystem } from "./waves";

export const sonicVertexShader = /* glsl */ `
varying vec3 vSonicWorld;
void main(){
  vec4 p=vec4(position,1.0);
  #ifdef USE_INSTANCING
    p=instanceMatrix*p;
  #endif
  vec4 world=modelMatrix*p;
  vSonicWorld=world.xyz;
  gl_Position=projectionMatrix*viewMatrix*world;
}`;
export const sonicFragmentShader = /* glsl */ `
uniform vec4 uWaves[${MAX_SONIC_WAVES}];
uniform float uAges[${MAX_SONIC_WAVES}];
uniform float uSpeed;
uniform float uMaxRadius;
uniform float uThickness;
uniform float uAfterglow;
varying vec3 vSonicWorld;
// Isolated direct-path model: future occlusion/reflection belongs here or in a
// separate path field, without changing world generation or wave lifecycle.
float travelDistance(vec3 point,vec3 origin){return distance(point,origin);}
void main(){
  float strength=0.0;
  for(int i=0;i<${MAX_SONIC_WAVES};i++){
    if(uWaves[i].w<0.0)continue;
    float d=travelDistance(vSonicWorld,uWaves[i].xyz);
    float since=uAges[i]-d/uSpeed;
    float band=uThickness/uSpeed;
    if(d>uMaxRadius || since<0.0 || since>=band+uAfterglow)continue;
    float front=1.0-smoothstep(0.0,band,since);
    float tail=.34*pow(1.0-clamp((since-band)/uAfterglow,0.0,1.0),2.0);
    strength=max(strength,max(front,tail));
  }
  if(strength<.003)discard;
  // Derivative normals handle the original non-uniform instance scales and
  // terrain triangles, including broad walls with only two triangles.
  vec3 N=normalize(cross(dFdx(vSonicWorld),dFdy(vSonicWorld)));
  vec3 V=normalize(cameraPosition-vSonicWorld);
  float form=.38+.62*abs(dot(N,V));
  vec3 cell=abs(fract(vSonicWorld*.5-.5)-.5)/max(fwidth(vSonicWorld*.5),vec3(.0001));
  float grid=1.0-min(1.0,min(cell.x,min(cell.y,cell.z)));
  vec3 cold=mix(vec3(.055,.34,.55),vec3(.69,.94,1.0),pow(strength,.65));
  gl_FragColor=vec4(cold*strength*(form+.16*grid),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Borrows exact geometry; owns only proxy meshes, instance buffers and one shader. */
export class SonicVisionRenderer {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly sources: THREE.Mesh[] = [];
  readonly proxies: THREE.Mesh[] = [];
  private readonly waveVectors = Array.from(
    { length: MAX_SONIC_WAVES },
    () => new THREE.Vector4(0, 0, 0, -1),
  );
  private readonly ages = new Float32Array(MAX_SONIC_WAVES);
  constructor(
    source: THREE.Group,
    readonly waves: SonicWaveSystem,
  ) {
    const c = waves.config;
    this.group.name = "sonic-surfaces";
    this.group.renderOrder = 2;
    this.material = new THREE.ShaderMaterial({
      vertexShader: sonicVertexShader,
      fragmentShader: sonicFragmentShader,
      uniforms: {
        uWaves: { value: this.waveVectors },
        uAges: { value: this.ages },
        uSpeed: { value: c.speed },
        uMaxRadius: { value: c.maxRadius },
        uThickness: { value: c.thickness },
        uAfterglow: { value: c.afterglow },
      },
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    source.updateMatrixWorld(true);
    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      let proxy: THREE.Mesh;
      if (object instanceof THREE.InstancedMesh) {
        const inst = new THREE.InstancedMesh(
          object.geometry,
          this.material,
          object.count,
        );
        inst.instanceMatrix.copy(object.instanceMatrix);
        inst.boundingSphere = object.boundingSphere?.clone() ?? null;
        inst.boundingBox = object.boundingBox?.clone() ?? null;
        proxy = inst;
      } else proxy = new THREE.Mesh(object.geometry, this.material);
      proxy.name = object.name;
      proxy.matrixAutoUpdate = false;
      proxy.matrix.copy(object.matrixWorld);
      proxy.renderOrder = 2;
      proxy.castShadow = false;
      proxy.receiveShadow = false;
      this.sources.push(object);
      this.proxies.push(proxy);
      this.group.add(proxy);
    });
    this.setMode(1);
    this.update();
  }
  setMode(mode: number) {
    // F1/F3 respect the normal world's depth and add blue light to its surface.
    // F2 writes depth only for revealed fragments. No normal material is mutated.
    const overlay = mode !== 2;
    this.material.transparent = overlay;
    this.material.blending = overlay
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;
    this.material.depthWrite = !overlay;
    this.material.needsUpdate = true;
  }
  update() {
    for (let i = 0; i < MAX_SONIC_WAVES; i++) {
      const w = this.waves.slots[i],
        v = this.waveVectors[i];
      if (w?.active) {
        v.set(w.origin.x, w.origin.y, w.origin.z, this.waves.radius(w));
        this.ages[i] = this.waves.time - w.bornAt;
      } else {
        v.w = -1;
        this.ages[i] = 0;
      }
    }
    this.group.visible = this.waves.count > 0;
  }
  dispose() {
    this.group.removeFromParent();
    for (const proxy of this.proxies)
      if (proxy instanceof THREE.InstancedMesh) proxy.dispose();
    this.group.clear();
    this.proxies.length = 0;
    this.sources.length = 0;
    this.material.dispose();
    // Shared geometries and source materials remain owned by Phase 1.
  }
}
