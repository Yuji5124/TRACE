import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { terrainHeight, random } from "../world/random";
import type { WorldDefinition, WorldObject } from "../world/types";

export function terrainGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(150, 150, 150, 150);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) - 0.005);
  g.computeVertexNormals();
  return g;
}
/** Rendering is disposable; the map and physics are not children of this group. */
export function createWorldView(def: WorldDefinition) {
  const group = new THREE.Group();
  group.name = "world-visuals";
  const geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 10, 7),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    cone: new THREE.ConeGeometry(0.5, 1, 7),
  };
  // Canvas textures are original procedural assets; no remote fetches or image licenses.
  const rng = random(def.seed ^ 7123),
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#aab391";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 5500; i++) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? "40,55,25" : "220,218,165"},.12)`;
    ctx.fillRect(rng() * 128, rng() * 128, 1 + rng() * 2, 1 + rng() * 3);
  }
  const grass = new THREE.CanvasTexture(canvas);
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(65, 65);
  grass.colorSpace = THREE.SRGBColorSpace;
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  const material = (o: WorldObject) => {
    const key = o.color + o.material + o.kind;
    let m = materialCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: o.color,
        roughness:
          o.material === "metal" ? 0.56 : o.material === "water" ? 0.2 : 0.88,
        metalness:
          o.material === "metal" ? 0.35 : o.material === "water" ? 0.15 : 0,
      });
      if (o.kind === "lamp-glass") {
        m.emissive.set(o.color);
        m.emissiveIntensity = 0.5;
      }
      if (o.material === "glass") {
        m.roughness = 0.24;
        m.metalness = 0.25;
      }
      if (o.kind === "lawn") m.map = grass;
      materialCache.set(key, m);
    }
    return m;
  };
  const buckets = new Map<string, WorldObject[]>();
  for (const o of def.objects) {
    const key = o.shape + "/" + o.color + "/" + o.material + "/" + o.kind;
    const list = buckets.get(key) ?? [];
    list.push(o);
    buckets.set(key, list);
  }
  const dummy = new THREE.Object3D();
  for (const list of buckets.values()) {
    const o = list[0],
      mesh = new THREE.InstancedMesh(geo[o.shape], material(o), list.length);
    mesh.name = o.kind;
    list.forEach((p, i) => {
      dummy.position.fromArray(p.position);
      dummy.scale.fromArray(p.scale);
      dummy.rotation.set(...(p.rotation ?? [0, 0, 0]));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = ![
      "grass",
      "flower",
      "flower-stem",
      "window",
      "crosswalk",
      "lane-mark",
      "soil",
      "lawn",
      "road",
      "sidewalk",
      "avenue",
      "walk",
    ].includes(o.kind);
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  // Original canvas lettering gives the street frontage a human scale.
  const names = [
    "MORI COFFEE",
    "BOOKS & THINGS",
    "FLOWER SHOP",
    "COMMONS MARKET",
  ];
  const signMaterials = names.map((name) => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 80;
    const pen = c.getContext("2d")!;
    pen.fillStyle = "#ece3c9";
    pen.fillRect(0, 0, 512, 80);
    pen.fillStyle = "#3c554b";
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.font = "500 32px Arial";
    pen.fillText(name, 256, 43);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  });
  const signGeometry = new THREE.PlaneGeometry(2.95, 0.38);
  let signIndex = 0;
  for (const o of def.objects)
    if (o.kind === "shop-sign") {
      const sign = new THREE.Mesh(
        signGeometry,
        signMaterials[signIndex++ % names.length],
      );
      sign.position.fromArray(o.position);
      if (o.scale[0] < 0.2) {
        sign.rotation.y = o.position[0] > 0 ? -Math.PI / 2 : Math.PI / 2;
        sign.position.x += o.position[0] > 0 ? -0.056 : 0.056;
      } else {
        sign.rotation.y = o.position[2] > 0 ? Math.PI : 0;
        sign.position.z += o.position[2] > 0 ? -0.056 : 0.056;
      }
      group.add(sign);
    }
  const groundGeometry = terrainGeometry();
  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshStandardMaterial({
      color: "#82966b",
      map: grass,
      roughness: 1,
    }),
  );
  ground.receiveShadow = true;
  ground.name = "sculpted-ground";
  group.add(ground);
  // Separate query mesh: remains queryable when F2 hides visual group.
  const queryGeometry = groundGeometry.clone();
  queryGeometry.boundsTree = new MeshBVH(queryGeometry);
  const queryMesh = new THREE.Mesh(queryGeometry);
  queryMesh.raycast = acceleratedRaycast;
  const ray = new THREE.Raycaster();
  const groundAt = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
    return ray.intersectObject(queryMesh)[0]?.point.y ?? 0;
  };
  return { group, groundGeometry, queryMesh, groundAt };
}
