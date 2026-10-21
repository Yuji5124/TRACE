import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: [
    "--no-sandbox",
    "--no-zygote",
    "--single-process",
    "--in-process-gpu",
    "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const out = process.env.TRACE_SONIC_OUTPUT || "artifacts/sonic";
await mkdir(out, { recursive: true });
const page = await browser.newPage({ viewport: { width: 800, height: 520 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(
    (process.env.TRACE_URL || "http://127.0.0.1:32803") + "/?test=1",
  );
  await page.waitForFunction(() => !!window.traceTest, undefined, {
    timeout: 60000,
  });
  await page.evaluate(() => {
    const t = window.traceTest;
    t.start();
    t.waves.clear();
  });
  await page.keyboard.press("KeyQ");
  assert.ok(
    (await page.evaluate(() => window.traceTest.waves.emitted)) > 0,
    "real Q handler emits",
  );
  await page.evaluate(() => {
    const t = window.traceTest;
    t.stop();
    t.freeze(true);
  });
  const contract = await page.evaluate(() => {
    const t = window.traceTest,
      v = t.sonicVision;
    return {
      sourceCount: v.sources.length,
      proxyCount: v.proxies.length,
      geometries: v.sources.every(
        (m, i) => m.geometry === v.proxies[i].geometry,
      ),
      transforms: v.sources.every((m, i) =>
        m.matrixWorld.equals(v.proxies[i].matrix),
      ),
      materials: new Set(v.proxies.map((m) => m.material)).size,
      kinds: [
        "building",
        "tree-trunk",
        "tree-crown",
        "sculpted-ground",
        "play-stair",
        "terrace-step",
        "slide",
      ].map((kind) => [kind, v.proxies.some((m) => m.name === kind)]),
    };
  });
  assert.equal(contract.geometries, true);
  assert.equal(contract.transforms, true);
  assert.equal(contract.materials, 1);
  assert.ok(contract.kinds.every((x) => x[1]));
  const gpuSamples = await page.evaluate(() => {
    const p = window.traceTest.createSonicProbe();
    const r = [0.03, 0.12, 0.45, 1.0, 2.7].map((age) => p.sample(age));
    p.dispose();
    return r;
  });
  assert.equal(gpuSamples[0].lit, 0, "no early surface");
  assert.ok(gpuSamples[1].centre > 50);
  assert.equal(gpuSamples[1].corner, 0, "same wall far corner still invisible");
  assert.ok(
    gpuSamples[1].lit > 0 && gpuSamples[1].lit < gpuSamples[2].lit,
    "GPU visible area expands",
  );
  assert.ok(gpuSamples[2].corner > 50);
  assert.ok(
    gpuSamples[3].centre < gpuSamples[1].centre,
    "GPU afterglow decays",
  );
  assert.equal(gpuSamples[4].lit, 0, "GPU fades to empty");
  const groundSamples = await page.evaluate(() => {
    const p = window.traceTest.createSonicProbe("ground");
    const result = [0.03, 0.12, 0.45, 2.7].map((age) => p.sample(age));
    p.dispose();
    return result;
  });
  assert.equal(groundSamples[0].lit, 0);
  assert.ok(
    groundSamples[1].lit > 0 && groundSamples[1].lit < groundSamples[2].lit,
    "ground reveals progressively per fragment",
  );
  assert.ok(
    groundSamples[1].lit < groundSamples[1].total / 3,
    "ground is only partially visible",
  );
  assert.equal(groundSamples[3].lit, 0);
  const modes = [];
  for (const mode of [1, 2, 3]) {
    modes.push(
      await page.evaluate((mode) => {
        const t = window.traceTest;
        t.setMode(mode);
        t.physics.reset();
        for (let i = 0; i < 120; i++) t.physics.move(0, 0, 1 / 60);
        for (let i = 0; i < 600; i++) t.physics.move(0, -0.06, 1 / 60);
        const p = t.physics.body.translation();
        return {
          mode,
          position: { x: p.x, y: p.y, z: p.z },
          colliders: t.physics.world.colliders.len(),
        };
      }, mode),
    );
  }
  assert.deepEqual(modes[0].position, modes[1].position);
  assert.deepEqual(modes[1].position, modes[2].position);
  // Screenshots use deterministic manual wave time. No rings in F1/F2.
  async function capture(name, mode, age, place = "wall", count = 1) {
    const details = await page.evaluate(
      ({ mode, age, place, count }) => {
        const t = window.traceTest;
        t.setMode(mode);
        t.waves.clear();
        let eye, look, origin;
        if (place === "wall") {
          eye = [0, 2, 49];
          look = [0, 4, 60];
          origin = { x: 0, y: 1.45, z: 49 };
        } else if (place === "playground") {
          eye = [20, 2, -7];
          look = [18, 1.7, -23];
          origin = { x: 20, y: 1.4, z: -12 };
        } else {
          eye = [-20, 2, 7];
          look = [-20, 1.8, 20];
          origin = { x: -20, y: 1.4, z: 10 };
        }
        t.camera.position.set(...eye);
        t.camera.lookAt(...look);
        for (let i = 0; i < count; i++)
          t.waves.emit({ ...origin, x: origin.x + i * 0.15 });
        t.waves.update(age);
        t.render();
        document.querySelector("#status").textContent =
          `SONIC / ${age.toFixed(2)} s / ${t.waves.count} waves`;
        document.querySelector("#stats").style.display =
          mode === 3 ? "block" : "none";
        if (mode === 3)
          document.querySelector("#stats").textContent = t.sonicDebug.text();
        return {
          age,
          count: t.waves.count,
          calls: t.renderer.info.render.calls,
          triangles: t.renderer.info.render.triangles,
          geometries: t.renderer.info.memory.geometries,
          textures: t.renderer.info.memory.textures,
        };
      },
      { mode, age, place, count },
    );
    if (process.env.TRACE_CAPTURE !== "0") {
      const cdp = await page.context().newCDPSession(page);
      const result = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      await writeFile(`${out}/${name}.png`, Buffer.from(result.data, "base64"));
      await cdp.detach();
    }
    return details;
  }
  const frames = [];
  for (const [i, age] of [0, 0.18, 0.28, 0.42, 0.75, 1.3, 2.7].entries())
    frames.push(await capture(`wave-${i}-${age.toFixed(2)}s`, 2, age));
  const comparison = [];
  for (const mode of [1, 2, 3])
    comparison.push({ mode, ...(await capture(`mode-${mode}`, mode, 0.42)) });
  await capture("playground", 2, 0.46, "playground");
  await capture("terrace-stairs", 2, 0.36, "terrace");
  const eightWaves = await capture("eight-waves", 2, 0.4, "wall", 8);
  const resources = await page.evaluate(() => {
    const t = window.traceTest;
    const before = {
      materials: new Set(t.sonicVision.proxies.map((p) => p.material)).size,
      geometries: t.renderer.info.memory.geometries,
    };
    for (let i = 0; i < 200; i++) {
      t.waves.emit({ x: 0, y: 1.5, z: 49 });
      t.waves.update(0.001);
      t.sonicVision.update();
    }
    return {
      before,
      count: t.waves.count,
      materials: new Set(t.sonicVision.proxies.map((p) => p.material)).size,
      geometries: t.renderer.info.memory.geometries,
    };
  });
  assert.equal(resources.count, 8);
  assert.equal(resources.materials, 1);
  assert.equal(resources.geometries, resources.before.geometries);
  // Real frame-loop sample; GPU query is optional, never substituted with CPU time.
  await page.evaluate(() => {
    const t = window.traceTest;
    t.waves.clear();
    t.physics.body.setTranslation({ x: 0, y: 0.81, z: 49 }, true);
    t.physics.world.step();
    t.camera.position.set(0, 2, 49);
    t.input.setLook(Math.PI, 0.15);
    t.setMode(2);
    t.start();
    t.freeze(false);
    window.sonicPulseTimer = setInterval(
      () => t.waves.emit({ x: 0, y: 1.5, z: 49 }),
      90,
    );
  });
  await page.waitForTimeout(3500);
  const performance = await page.evaluate(() => {
    clearInterval(window.sonicPulseTimer);
    const t = window.traceTest;
    const result = { metrics: t.metrics, gpu: t.gpu };
    t.stop();
    t.freeze(true);
    return result;
  });
  assert.deepEqual(errors, []);
  const report = {
    browser: await browser.version(),
    contract,
    gpuSamples,
    groundSamples,
    modes,
    frames,
    comparison,
    eightWaves,
    resources,
    performance,
    errors,
    notes:
      "800x520 headless SwiftShader; performance is software rendering, not an iPad/Windows hardware benchmark. GPU timing is unavailable if optional extension is absent.",
  };
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
