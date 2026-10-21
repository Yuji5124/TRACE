import type { Vec3, WorldDefinition, WorldObject, Shape } from "./types";
import { random, terrainHeight } from "./random";

/** Data only: no renderer, audio engine or game mode dependencies. */
export function generateWorld(seed: number): WorldDefinition {
  const rng = random(seed),
    objects: WorldObject[] = [];
  const add = (
    kind: string,
    shape: Shape,
    position: Vec3,
    scale: Vec3,
    color: string,
    collider = false,
    material: WorldObject["material"] = "stone",
    rotation?: Vec3,
  ) => {
    objects.push({
      id: `${kind}-${objects.length}`,
      kind,
      shape,
      position,
      scale,
      color,
      collider,
      material,
      rotation,
    });
  };
  const box = (
    kind: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    hit = false,
    mat: WorldObject["material"] = "stone",
  ) => add(kind, "box", [x, y, z], [w, h, d], c, hit, mat);
  const cyl = (
    kind: string,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    c: string,
    hit = false,
    mat: WorldObject["material"] = "stone",
  ) => add(kind, "cylinder", [x, y, z], [r * 2, h, r * 2], c, hit, mat);
  const beam = (
    kind: string,
    a: Vec3,
    b: Vec3,
    width: number,
    color: string,
    hit = false,
  ) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2],
      len = Math.hypot(dx, dy, dz);
    add(
      kind,
      "box",
      [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      [width, len, width],
      color,
      hit,
      "metal",
      [Math.atan2(dz, Math.hypot(dx, dy)), 0, -Math.atan2(dx, dy)],
    );
  };
  // A 78m park framed by a complete street loop and four intersections.
  box("park-border", 0, -0.07, 0, 81, 0.14, 81, "#b6b3a5");
  box("lawn", 0, -0.015, 0, 77, 0.03, 77, "#799469");
  for (const p of [-46, 46]) {
    box("road", p, -0.035, 0, 10, 0.07, 150, "#42494b");
    box("road", 0, -0.035, p, 150, 0.07, 10, "#42494b");
    for (const s of [-1, 1]) {
      box("sidewalk", p + s * 6.3, 0.065, 0, 2.6, 0.13, 150, "#c7c5b7");
      box("sidewalk", 0, 0.065, p + s * 6.3, 150, 0.13, 2.6, "#c7c5b7");
    }
    for (let t = -70; t <= 70; t += 6)
      if (Math.abs(Math.abs(t) - 46) > 8) {
        box("lane-mark", p, 0.007, t, 0.12, 0.012, 2.5, "#ede6c6");
        box("lane-mark", t, 0.007, p, 2.5, 0.012, 0.12, "#ede6c6");
      }
    for (const q of [-46, 46])
      for (let i = -3; i <= 3; i++) {
        box("crosswalk", p + i * 1.1, 0.012, q - 7, 0.6, 0.02, 3, "#eee9db");
        box("crosswalk", p - 7, 0.014, q + i * 1.1, 3, 0.02, 0.6, "#eee9db");
      }
  }
  // Perimeter walks and orthogonal avenues. Low curbs remain walkable.
  for (const p of [-37, 37]) {
    box("walk", p, 0.025, 0, 4, 0.05, 78, "#d4c7ab");
    box("walk", 0, 0.025, p, 78, 0.05, 4, "#d4c7ab");
  }
  box("avenue", 0, 0.035, 0, 6, 0.07, 78, "#d9cdb7");
  box("avenue", 0, 0.04, 0, 78, 0.08, 6, "#d9cdb7");
  cyl("plaza", 0, 0.05, 0, 11, 0.1, "#c1b8a5");
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    cyl(
      "plaza-stud",
      Math.cos(a) * 10.3,
      0.115,
      Math.sin(a) * 10.3,
      0.08,
      0.03,
      "#777d72",
    );
  }
  // Central dry fountain, accessible around all sides; solid basin and plinth.
  cyl("fountain-base", 0, 0.22, 0, 3.3, 0.44, "#9ca69c", true);
  cyl("fountain-water", 0, 0.46, 0, 2.95, 0.04, "#6b9f9c", false, "water");
  cyl("fountain-column", 0, 1.05, 0, 0.55, 1.2, "#c0c6b7", true);
  cyl("fountain-bowl", 0, 1.7, 0, 1.5, 0.18, "#d7d8c5", true);
  cyl(
    "fountain-upper-water",
    0,
    1.8,
    0,
    1.35,
    0.025,
    "#7ab2ac",
    false,
    "water",
  );
  // Benches: seats and backrests are physical, armrests are decorative.
  function bench(x: number, z: number, turn = 0, base = 0) {
    const local = (a: number, y: number, b: number): Vec3 => [
      x + a * Math.cos(turn) + b * Math.sin(turn),
      y + base,
      z - a * Math.sin(turn) + b * Math.cos(turn),
    ];
    add(
      "bench-seat",
      "box",
      local(0, 0.5, 0),
      [2.2, 0.14, 0.65],
      "#92704c",
      true,
      "wood",
      [0, turn, 0],
    );
    add(
      "bench-back",
      "box",
      local(0, 0.96, -0.28),
      [2.2, 0.7, 0.1],
      "#a38358",
      true,
      "wood",
      [0, turn, 0],
    );
    for (const a of [-0.8, 0.8]) {
      add(
        "bench-leg",
        "box",
        local(a, 0.25, 0),
        [0.12, 0.5, 0.52],
        "#344641",
        false,
        "metal",
        [0, turn, 0],
      );
    }
  }
  for (const x of [-9, 9]) {
    bench(x, 7, x < 0 ? -Math.PI / 2 : Math.PI / 2);
    bench(x, -7, x < 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  for (const z of [-27, -12, 14, 29]) {
    bench(-34, z, -Math.PI / 2);
    bench(34, z, Math.PI / 2);
  }
  // Trees use independent trunk proxies; crowns will later be acoustic surfaces.
  function tree(x: number, z: number, h: number, variant: number) {
    const y = terrainHeight(x, z),
      c = ["#4a7255", "#64865a", "#3f6752", "#7e935a"][variant % 4];
    cyl(
      "tree-trunk",
      x,
      y + h * 0.32,
      z,
      0.22,
      h * 0.64,
      "#74604c",
      true,
      "wood",
    );
    for (let j = 0; j < 5; j++) {
      const a = j * 2.4,
        rad = j === 0 ? 0 : h * 0.18;
      add(
        "tree-crown",
        "sphere",
        [
          x + Math.cos(a) * rad,
          y + h * (j === 0 ? 0.83 : 0.69),
          z + Math.sin(a) * rad,
        ],
        [h * 0.64, h * (j === 0 ? 0.55 : 0.47), h * 0.61],
        c,
        false,
        "leaf",
        [rng(), rng() * 6, 0],
      );
    }
    for (let j = 0; j < 3; j++) {
      const a = j * 2.1;
      beam(
        "tree-branch",
        [x, y + h * 0.4, z],
        [x + Math.cos(a) * h * 0.23, y + h * 0.75, z + Math.sin(a) * h * 0.23],
        0.12,
        "#74604c",
      );
    }
  }
  for (let p = -30; p <= 30; p += 10)
    for (const s of [-1, 1]) {
      tree(p, s * 32, 5.6 + rng() * 2, Math.floor(rng() * 4));
      if (Math.abs(p) > 5)
        tree(s * 30, p, 5 + rng() * 2, Math.floor(rng() * 4));
    }
  for (let i = 0; i < 26; i++) {
    const x = (rng() - 0.5) * 58,
      z = (rng() - 0.5) * 58;
    if (
      Math.abs(x) < 12 ||
      Math.abs(z) < 10 ||
      (x > 10 && z < -6) ||
      (x < -7 && z > 9)
    )
      continue;
    tree(x, z, 4.5 + rng() * 3, i);
  }
  // Flower beds, planting and low shrubs; deterministic variation.
  for (const x of [-17, 17])
    for (const z of [-7, 7]) {
      box("planter", x, 0.24, z, 6, 0.48, 2.4, "#a99b7c", true);
      box("soil", x, 0.49, z, 5.6, 0.02, 2, "#584f3c");
      for (let i = 0; i < 45; i++) {
        const px = x + (rng() - 0.5) * 5.5,
          pz = z + (rng() - 0.5) * 1.8;
        cyl("flower-stem", px, 0.7, pz, 0.025, 0.4, "#56774e");
        add(
          "flower",
          "sphere",
          [px, 0.88 + rng() * 0.15, pz],
          [0.19, 0.14, 0.19],
          ["#e6c883", "#d78e86", "#eeead3", "#ad9bb9"][i % 4],
        );
      }
    }
  for (let i = 0; i < 950; i++) {
    const x = (rng() - 0.5) * 69,
      z = (rng() - 0.5) * 69;
    if (
      Math.abs(x) < 5 ||
      Math.abs(z) < 10 ||
      Math.hypot(x, z) < 13 ||
      (x > 8 && z < -8) ||
      (x < -6 && z > 8)
    )
      continue;
    add(
      "grass",
      "cone",
      [x, terrainHeight(x, z) + 0.16, z],
      [0.15, 0.32 + rng() * 0.2, 0.15],
      ["#7a9259", "#8fa365", "#6a8558"][i % 3],
    );
  }
  // Playground: rubber pad, climbing tower, slide and swings.
  box("playground-pad", 21, 0.035, -20, 22, 0.07, 19, "#b4a28c");
  for (const x of [14, 18])
    for (const z of [-25, -21])
      box("tower-post", x, 1.7, z, 0.18, 3.4, 0.18, "#ad885c", true, "wood");
  box("tower-deck", 16, 1.52, -23, 4.3, 0.18, 4.3, "#c3a16b", true, "wood");
  add("tower-roof", "cone", [16, 4, -23], [6, 1.8, 6], "#768f8a");
  for (let i = 0; i < 8; i++)
    box(
      "play-stair",
      16,
      (0.2 + i * 0.19) / 2,
      -17 - i * 0.5,
      2,
      0.2 + i * 0.19,
      0.5,
      "#b79762",
      true,
      "wood",
    );
  // Guard rails leave the stair and slide entrances open.
  for (const x of [13.9, 18.1])
    box("tower-rail", x, 2.2, -23, 0.12, 0.12, 4.2, "#597c79", true, "metal");
  beam("slide-rail", [18, 1.8, -23], [24, 0.5, -23], 0.15, "#c6d5cf");
  add(
    "slide",
    "box",
    [21, 0.94, -23],
    [6.3, 0.12, 1.2],
    "#8ba9a3",
    true,
    "metal",
    [0, 0, -0.21],
  );
  for (const x of [24, 30]) {
    beam("swing-frame", [x, 0, -14], [x, 3.6, -16], 0.16, "#567975", true);
    beam("swing-frame", [x, 0, -18], [x, 3.6, -16], 0.16, "#567975", true);
  }
  beam("swing-bar", [24, 3.6, -16], [30, 3.6, -16], 0.2, "#567975", true);
  for (const x of [26, 28]) {
    for (const dx of [-0.35, 0.35])
      beam(
        "swing-chain",
        [x + dx, 3.6, -16],
        [x + dx, 0.7, -16],
        0.035,
        "#747f79",
      );
    box("swing-seat", x, 0.65, -16, 0.95, 0.12, 0.5, "#ad8255", true, "wood");
  }
  // Raised garden terrace with real individual stair colliders and pergola.
  box("terrace", -20, 0.5, 20, 18, 1, 16, "#beb5a1", true);
  for (let i = 0; i < 5; i++)
    box(
      "terrace-step",
      -20,
      0.1 + i * 0.1,
      9.5 + i * 0.55,
      5,
      0.2 + i * 0.2,
      0.55,
      "#c6beac",
      true,
    );
  for (const x of [-27, -13])
    for (const z of [15, 25])
      box("pergola-post", x, 2.1, z, 0.22, 3.2, 0.22, "#8d7959", true, "wood");
  for (const x of [-27, -13])
    box("pergola-beam", x, 3.75, 20, 0.28, 0.3, 12, "#8d7959", false, "wood");
  for (let x = -28; x <= -12; x += 1)
    box("pergola-slat", x, 3.95, 20, 0.2, 0.18, 12, "#a8946c", false, "wood");
  bench(-24, 22, 0, 1);
  bench(-16, 22, 0, 1);
  // Park fence: two openings on every edge, never a solid invisible perimeter.
  for (const s of [-1, 1])
    for (let p = -39; p < 39; p += 3) {
      if (Math.abs(p) < 5) continue;
      for (const orientation of [0, 1]) {
        const x = orientation ? s * 39 : p,
          z = orientation ? p : s * 39;
        box(
          "fence-post",
          x,
          0.62,
          z,
          0.11,
          1.24,
          0.11,
          "#53635b",
          true,
          "metal",
        );
        box(
          "fence-panel",
          x + (orientation ? 0 : 1.4),
          0.65,
          z + (orientation ? 1.4 : 0),
          orientation ? 0.07 : 2.8,
          0.75,
          orientation ? 2.8 : 0.07,
          "#68786b",
          true,
          "metal",
        );
      }
    }
  // Street lamps with warm emissive glass (no expensive local shadow lights).
  for (const s of [-1, 1])
    for (let p = -32; p <= 32; p += 16)
      for (const o of [0, 1]) {
        const x = o ? s * 40 : p,
          z = o ? p : s * 40;
        cyl("lamp-post", x, 2.25, z, 0.075, 4.5, "#3e514b", true, "metal");
        box("lamp-cap", x, 4.55, z, 0.7, 0.12, 0.7, "#3e514b", false, "metal");
        box(
          "lamp-glass",
          x,
          4.34,
          z,
          0.46,
          0.35,
          0.46,
          "#f1e1aa",
          false,
          "glass",
        );
      }
  // Human-scale town blocks. Independently authored modern replacement for r102 city code.
  const facades = ["#c4bbaa", "#d2c7b4", "#b2b9b3", "#c9b3a0", "#aebdc0"];
  function building(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    index: number,
    side: boolean,
  ) {
    box("building", x, h / 2 + 0.15, z, w, h, d, facades[index % 5], true);
    box(
      "building-plinth",
      x,
      0.35,
      z,
      w + 0.35,
      0.7,
      d + 0.35,
      "#8c938b",
      true,
    );
    box("roof-coping", x, h + 0.24, z, w + 0.45, 0.22, d + 0.45, "#e1d9c7");
    box("roof", x, h + 0.1, z, w, 0.15, d, "#7d8781");
    box("roof-vent", x + 2, h + 0.65, z + 1, 1.5, 1, 1, "#999d90");
    const face = z > 0 ? -1 : 1,
      fx = x > 0 ? -1 : 1;
    const floors = Math.floor(h / 3),
      columns = Math.floor((side ? d : w) / 2.4);
    for (let f = 0; f < floors; f++)
      for (let j = 0; j < columns; j++) {
        const offset = (j - (columns - 1) / 2) * 2.4;
        const px = side ? x + fx * (w / 2 + 0.02) : x + offset,
          pz = side ? z + offset : z + face * (d / 2 + 0.02);
        box(
          "window-frame",
          px,
          2 + f * 3,
          pz,
          side ? 0.1 : 1.5,
          1.65,
          side ? 1.5 : 0.1,
          "#e2dfd0",
        );
        box(
          "window",
          px + (side ? fx * 0.06 : 0),
          2 + f * 3,
          pz + (side ? 0 : face * 0.06),
          side ? 0.05 : 1.26,
          1.4,
          side ? 1.26 : 0.05,
          f === 0 ? "#738d8b" : "#688389",
          false,
          "glass",
        );
        if (f > 0 && j % 2 === 0)
          box(
            "sill",
            px,
            0.99 + f * 3,
            pz,
            side ? 0.32 : 1.7,
            0.1,
            side ? 1.7 : 0.32,
            "#dad5c5",
          );
      }
    const px = side ? x + fx * (w / 2 + 0.25) : x,
      pz = side ? z : z + face * (d / 2 + 0.25);
    box(
      "shop-door",
      px,
      1.25,
      pz,
      side ? 0.12 : 1.4,
      2.4,
      side ? 1.4 : 0.12,
      "#405f60",
    );
    box(
      "awning",
      px,
      3.15,
      pz,
      side ? 1.8 : w * 0.8,
      0.16,
      side ? d * 0.8 : 1.8,
      ["#698c7c", "#b4876e", "#788a9b"][index % 3],
    );
    box(
      "shop-sign",
      px + (side ? fx * 0.75 : 0),
      2.9,
      pz + (side ? 0 : face * 0.75),
      side ? 0.1 : 3,
      0.4,
      side ? 3 : 0.1,
      "#ece3c9",
    );
  }
  for (const s of [-1, 1])
    for (let i = 0; i < 5; i++) {
      const p = [-65, -25, 0, 25, 65][i],
        h = 6 + Math.floor(rng() * 4) * 3;
      building(p, s * 64, 18, 17, h, i + (s + 1) * 3, false);
      if (i > 0 && i < 4)
        building(s * 64, p, 17, 18, 6 + Math.floor(rng() * 3) * 3, i + 2, true);
    }
  // Bollards, bins, planters and stone cover break long sightlines.
  for (const s of [-1, 1])
    for (const p of [-5, 5]) {
      cyl("bollard", p, 0.5, s * 40, 0.14, 1, "#556961", true, "metal");
      cyl("bollard", s * 40, 0.5, p, 0.14, 1, "#556961", true, "metal");
    }
  for (const x of [-33, 33])
    for (const z of [-30, 30]) {
      cyl("bin", x, 0.6, z, 0.38, 1.2, "#4f6b62", true, "metal");
      cyl("bin-rim", x, 1.21, z, 0.41, 0.1, "#8e9b88");
    }
  for (const [x, z] of [
    [-17, -20],
    [-22, -16],
    [15, 24],
    [22, 28],
  ]) {
    add(
      "boulder",
      "sphere",
      [x, terrainHeight(x, z) + 0.6, z],
      [2.6, 1.5, 2],
      "#969b88",
      true,
      "stone",
      [0.1, 0.4, 0.15],
    );
  }
  for (const s of [-1, 1]) {
    box("garden-wall", s * 23, 0.6, 32, 12, 1.2, 0.5, "#b3b09a", true);
  }
  return { version: 1, seed, size: 150, spawn: [0, 1.8, 30], objects };
}
