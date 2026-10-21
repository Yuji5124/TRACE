import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { generateWorld } from "./world/generate";
import { parseSeed } from "./world/random";
import { createWorldView } from "./render/world";
import { createPhysics } from "./physics/world";
import { createInput } from "./player/input";
import { createPerformance } from "./diagnostics/performance";
import { SonicWaveSystem } from "./sonic/waves";
import { SonicVisionRenderer } from "./sonic/vision";
import { SonicVisionDebug } from "./sonic/debug";
import { createGpuTimer } from "./diagnostics/gpu";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div id="hud"><div class="top"><div class="brand">TRACE<small>THE WORLD, BEFORE THE ECHO.</small></div><div class="location">FIELD 01 / <span id="seed"></span><strong>MIDORI COMMONS</strong>公園と街のあいだ</div></div><div class="bottom"><div><div class="badge" id="mode-label">01 / VISIBLE WORLD</div><nav class="modes" aria-label="表示モード"><button data-mode="1" aria-pressed="true">F1 通常</button><button data-mode="2" aria-pressed="false">F2 透明</button><button data-mode="3" aria-pressed="false">F3 DEBUG</button></nav></div><div><div class="tools"><button id="pulse">Q 音波</button><button id="perf">計測 P</button><button id="reset">入口へ R</button><button id="credit">出典</button></div><div class="hint pc-hint">WASD 移動 · マウス 視点 · SHIFT 走る · Q 音波 · ESC 解除</div><div class="hint touch-hint">左側ドラッグで移動 · 右側ドラッグで視点</div><div id="status"></div></div></div></div><div class="crosshair"></div><div id="start"><span class="eyebrow">TRACE / SONIC VISION</span><h1>街の音が、消える前に。</h1><p>木漏れ日の公園と、静かな街を歩く。<br>F2で、見えない世界へ。</p><button id="enter" disabled>ワールドを準備中…</button><p>PC：WASD＋マウス ／ タッチ：左右ドラッグ<br>Qキー／音波ボタンで、音が世界を描く</p></div><div id="stats"></div><aside id="credits">Original procedural world — TRACE Phase 1<a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener">ライセンス全文・使用ライブラリ</a><a href="https://github.com/IceCreamYou/THREE.Terrain" target="_blank" rel="noopener">THREE.Terrain — 調査参考</a><a href="https://github.com/photonlines/Procedural-City-Generator" target="_blank" rel="noopener">Procedural City Generator — 街区構成参考</a><a href="https://github.com/gkjohnson/three-mesh-bvh" target="_blank" rel="noopener">three-mesh-bvh — 地形クエリ</a><button id="close-credit">閉じる</button></aside>`;

async function boot() {
  const params = new URLSearchParams(location.search),
    seed = parseSeed(params.get("seed"));
  document.querySelector("#seed")!.textContent = `SEED ${seed}`;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  app.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color("#c5d6d4");
  scene.background = skyColor;
  scene.fog = new THREE.FogExp2("#c5d6cf", 0.0045);
  const camera = new THREE.PerspectiveCamera(
    65,
    innerWidth / innerHeight,
    0.08,
    260,
  );
  camera.position.set(0, 1.7, 30);
  const sun = new THREE.DirectionalLight("#fff0cf", 3.1);
  sun.position.set(-35, 55, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -62,
    right: 62,
    top: 62,
    bottom: -62,
    near: 1,
    far: 160,
  });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00015;
  sun.shadow.blurSamples = 8;
  scene.add(sun, new THREE.HemisphereLight("#d4e9ef", "#8d9173", 2.05));
  const sky = new Sky();
  sky.scale.setScalar(230);
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 3;
  uniforms.rayleigh.value = 1.2;
  uniforms.mieCoefficient.value = 0.004;
  uniforms.mieDirectionalG.value = 0.8;
  uniforms.sunPosition.value.copy(sun.position).normalize();
  scene.add(sky);
  const definition = generateWorld(seed),
    view = createWorldView(definition);
  scene.add(view.group);
  const waves = new SonicWaveSystem();
  const sonicVision = new SonicVisionRenderer(view.group, waves);
  const sonicDebug = new SonicVisionDebug(waves);
  scene.add(sonicVision.group, sonicDebug.group);
  let gpu = createGpuTimer(renderer);
  const physics = await createPhysics(definition, view.groundGeometry);
  let active = false,
    mode = 1,
    showStats = false,
    freezeRendering = false;
  const start = document.querySelector<HTMLDivElement>("#start")!,
    enter = document.querySelector<HTMLButtonElement>("#enter")!;
  const input = createInput(renderer.domElement, camera, () => {
    active = false;
    start.style.display = "block";
  });
  enter.disabled = false;
  enter.textContent = "公園を歩く";
  enter.onclick = () => {
    active = true;
    start.style.display = "none";
    if (matchMedia("(pointer:fine)").matches)
      renderer.domElement.requestPointerLock?.()?.catch(() => {});
  };
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement && matchMedia("(pointer:fine)").matches) {
      input.clear();
      active = false;
      start.style.display = "block";
    }
  });
  const debugGroup = new THREE.Group();
  debugGroup.name = "object-bounds";
  debugGroup.visible = false;
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    lineMat = new THREE.LineBasicMaterial({
      color: "#edc567",
      transparent: true,
      opacity: 0.55,
    });
  for (const o of definition.objects)
    if (o.collider || o.kind === "tree-crown") {
      const line = new THREE.LineSegments(edges, lineMat);
      line.position.fromArray(o.position);
      line.scale.fromArray(o.scale);
      line.rotation.set(...(o.rotation ?? [0, 0, 0]));
      debugGroup.add(line);
    }
  scene.add(debugGroup);
  const debugGeometry = new THREE.BufferGeometry(),
    debugMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    });
  const debugLines = new THREE.LineSegments(debugGeometry, debugMaterial);
  debugLines.frustumCulled = false;
  debugLines.visible = false;
  debugLines.renderOrder = 10;
  scene.add(debugLines);
  function setMode(next: number) {
    mode = next;
    sonicVision.setMode(next);
    sonicDebug.group.visible = next === 3;
    view.group.visible = next !== 2;
    sky.visible = next !== 2;
    debugGroup.visible = next === 3;
    debugLines.visible = next === 3;
    scene.background = next === 2 ? new THREE.Color("#091614") : skyColor;
    scene.fog = next === 2 ? null : new THREE.FogExp2("#c5d6cf", 0.0045);
    document.body.classList.toggle("transparent", next === 2);
    document.querySelector("#mode-label")!.textContent = [
      "",
      "01 / VISIBLE WORLD",
      "02 / SONIC VISION",
      "03 / COLLIDERS + OBJECT BOUNDS",
    ][next];
    document
      .querySelectorAll<HTMLButtonElement>("[data-mode]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(Number(b.dataset.mode) === next)),
      );
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-mode]")
    .forEach((b) => (b.onclick = () => setMode(Number(b.dataset.mode))));
  document
    .querySelector("#perf")!
    .addEventListener("click", () => (showStats = !showStats));
  document.querySelector("#reset")!.addEventListener("click", () => {
    physics.reset();
    waves.clear();
    input.clear();
    input.setLook(0, -0.04);
  });
  const credits = document.querySelector<HTMLDivElement>("#credits")!;
  document.querySelector("#credit")!.addEventListener("click", () => {
    credits.style.display = "block";
  });
  document
    .querySelector("#close-credit")!
    .addEventListener("click", () => (credits.style.display = "none"));
  const emitPulse = () => {
    if (!active) return;
    const p = physics.body.translation();
    waves.emit({ x: p.x, y: p.y + 0.65, z: p.z });
  };
  document.querySelector("#pulse")!.addEventListener("click", emitPulse);
  addEventListener("keydown", (e) => {
    if (
      e.code === "KeyQ" &&
      !e.repeat &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      emitPulse();
    }
    if (["F1", "F2", "F3"].includes(e.code)) {
      e.preventDefault();
      setMode(Number(e.code.slice(1)));
    }
    if (e.code === "KeyP" && !e.repeat) showStats = !showStats;
    if (e.code === "KeyR") {
      physics.reset();
      waves.clear();
      input.clear();
      input.setLook(0, -0.04);
    }
    if (e.code === "Escape") {
      active = false;
      input.clear();
      start.style.display = "block";
    }
  });
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  let contextLost = false;
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
    gpu.dispose();
    active = false;
    input.clear();
    start.style.display = "block";
    enter.textContent = "描画を復旧中…";
    enter.disabled = true;
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    gpu = createGpuTimer(renderer);
    enter.textContent = "公園を歩く";
    enter.disabled = false;
  });
  const perf = createPerformance(renderer),
    stats = document.querySelector<HTMLDivElement>("#stats")!;
  let last = performance.now(),
    accumulator = 0,
    elapsed = 0;
  function updateCollisionDebug() {
    if (mode === 3) {
      const debug = physics.world.debugRender();
      const positions = debugGeometry.getAttribute("position") as
        | THREE.BufferAttribute
        | undefined;
      const colors = debugGeometry.getAttribute("color") as
        | THREE.BufferAttribute
        | undefined;
      if (
        !positions ||
        !colors ||
        positions.array.length !== debug.vertices.length
      ) {
        debugGeometry.dispose();
        debugGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(debug.vertices, 3),
        );
        debugGeometry.setAttribute(
          "color",
          new THREE.BufferAttribute(debug.colors, 4),
        );
      } else {
        positions.set(debug.vertices);
        positions.needsUpdate = true;
        colors.set(debug.colors);
        colors.needsUpdate = true;
      }
    }
  }
  const STEP = 1 / 60;
  const frame = () => {
    requestAnimationFrame(frame);
    const now = performance.now(),
      rawDt = (now - last) / 1000,
      dt = Math.min(rawDt, 0.1);
    last = now;
    if (document.hidden || contextLost || freezeRendering) {
      accumulator = 0;
      return;
    }
    const begin = performance.now();
    if (active) {
      accumulator = Math.min(accumulator + dt, 0.1);
      while (accumulator >= STEP) {
        const delta = input.update(STEP);
        physics.move(delta.x, delta.z, STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      input.update(0);
    }
    const p = physics.body.translation();
    camera.position.set(p.x, p.y + 0.85, p.z);
    updateCollisionDebug();
    if (active) waves.update(rawDt);
    sonicVision.update();
    sonicDebug.update();
    gpu.begin();
    renderer.render(scene, camera);
    gpu.end();
    elapsed += dt;
    const measured = perf.sample(rawDt, performance.now() - begin);
    stats.style.display = showStats || mode === 3 ? "block" : "none";
    stats.textContent = `TRACE / FRAME PROBE\n${measured.fps} FPS · CPU ${measured.frameMs} ms\nmax CPU ${measured.maxFrameMs} ms\n${measured.calls} draw calls · ${measured.triangles.toLocaleString()} triangles\n${measured.geometries} geometries · ${measured.textures} textures\nGPU ${gpu.milliseconds === null ? "unavailable" : gpu.milliseconds.toFixed(2) + " ms"} · memory unknown\nposition ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}\n${definition.objects.length} objects · ${physics.world.colliders.len()} colliders\nseed ${seed} · mode ${mode}${sonicDebug.text()}`;
    document.querySelector("#status")!.textContent =
      `${p.x.toFixed(0)} / ${p.z.toFixed(0)} m · ${measured.fps} FPS · ${waves.count} waves`;
  };
  // Explicit QA hook only when requested. Exposes simulation, never binds modes to physics.
  if (params.has("test")) {
    const { createSonicProbe } = await import("./diagnostics/sonic-probe");
    Object.assign(window, {
      traceTest: {
        createSonicProbe: (kind?: "wall" | "ground") =>
          createSonicProbe(renderer, view.group, kind),
        definition,
        physics,
        view,
        input,
        camera,
        renderer,
        scene,
        waves,
        sonicVision,
        sonicDebug,
        get gpu() {
          return { supported: gpu.supported, milliseconds: gpu.milliseconds };
        },
        render() {
          sonicVision.update();
          sonicDebug.update();
          updateCollisionDebug();
          renderer.render(scene, camera);
        },
        setMode,
        freeze: (value: boolean) => {
          freezeRendering = value;
        },
        start: () => {
          active = true;
          start.style.display = "none";
        },
        stop: () => {
          active = false;
          input.clear();
        },
        get mode() {
          return mode;
        },
        get metrics() {
          return perf.snapshot;
        },
      },
    });
  }
  setMode(params.get("mode") === "2" ? 2 : params.get("mode") === "3" ? 3 : 1);
  frame();
}
boot().catch((error) => {
  console.error(error);
  const el = document.createElement("div");
  el.id = "error";
  el.textContent = `TRACEを起動できませんでした。WebGL2対応ブラウザで再読み込みしてください。 ${String(error)}`;
  document.body.append(el);
});
