import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = new URL(
  process.env.TRACE_URL || "https://yuji5124.github.io/TRACE/",
);
if (!url.pathname.endsWith("/")) url.pathname += "/";
const out = process.env.TRACE_PAGES_OUTPUT || "artifacts/pages";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  proxy: process.env.TRACE_PROXY
    ? { server: process.env.TRACE_PROXY }
    : undefined,
  args: [
    "--no-sandbox",
    "--no-zygote",
    "--single-process",
    "--in-process-gpu",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const proxyCertificateWorkaround = process.env.TRACE_PROXY_INSECURE === "1";
const page = await browser.newPage({
  viewport: { width: 960, height: 640 },
  ignoreHTTPSErrors: proxyCertificateWorkaround,
});
const errors = [],
  failures = [],
  resources = [],
  warnings = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if (m.type() === "warning") warnings.push(m.text());
});
page.on("requestfailed", (r) =>
  failures.push({ url: r.url(), error: r.failure()?.errorText }),
);
page.on("response", (r) => {
  if (r.url().startsWith(url.origin))
    resources.push({
      url: r.url(),
      status: r.status(),
      type: r.request().resourceType(),
    });
});
await page.addInitScript(() => {
  window.traceWasmInstantiations = 0;
  const original = WebAssembly.instantiate;
  WebAssembly.instantiate = async function (...args) {
    const result = await original.apply(WebAssembly, args);
    window.traceWasmInstantiations++;
    return result;
  };
});
async function capture(name) {
  if (process.env.TRACE_CAPTURE === "0") return;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const c = await page.context().newCDPSession(page);
  const r = await c.send("Page.captureScreenshot", {
    format: "jpeg",
    quality: 86,
    fromSurface: true,
  });
  await writeFile(`${out}/${name}.jpg`, Buffer.from(r.data, "base64"));
  await c.detach();
}
try {
  const response = await page.goto(url.href, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  assert.equal(response.status(), 200);
  await page.waitForFunction(
    () => {
      const b = document.querySelector("#enter");
      return b && !b.disabled;
    },
    undefined,
    { timeout: 90000 },
  );
  assert.equal(await page.locator("canvas").count(), 1);
  const publicBoot = {
    status: response.status(),
    wasmInstantiations: await page.evaluate(
      () => window.traceWasmInstantiations,
    ),
    title: await page.title(),
  };
  assert.ok(publicBoot.wasmInstantiations >= 1);
  await page.locator("#enter").click();
  await capture("public-game");

  const qa = new URL(url);
  qa.searchParams.set("test", "1");
  await page.goto(qa.href, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !!window.traceTest, undefined, {
    timeout: 90000,
  });
  await page.locator("#enter").click();
  await page.evaluate(() => {
    const t = window.traceTest;
    t.freeze(true);
    t.resetRound();
    t.input.clear();
    t.input.setLook(0, -0.04);
    for (let i = 0; i < 120; i++) t.motionTick();
  });
  const before = await page.evaluate(() =>
    window.traceTest.physics.body.translation(),
  );
  await page.keyboard.down("KeyW");
  await page.evaluate(() => {
    for (let i = 0; i < 90; i++) window.traceTest.motionTick();
  });
  await page.keyboard.up("KeyW");
  const motion = await page.evaluate(() => ({
    position: window.traceTest.physics.body.translation(),
    footfalls: window.traceTest.waves.emissions.FOOTSTEP,
  }));
  assert.ok(motion.position.z < before.z - 1);
  assert.ok(motion.footfalls > 0);
  await page.keyboard.press("KeyQ");
  assert.ok(
    await page.evaluate(() =>
      window.traceTest.waves.slots.some((w) => w.active && w.kind === "TEST"),
    ),
  );
  const modes = [];
  for (const mode of [1, 2, 3]) {
    await page.keyboard.press(`F${mode}`);
    modes.push(
      await page.evaluate(() => {
        const t = window.traceTest;
        t.input.setLook(0, -0.04);
        t.input.update(0);
        t.render();
        return {
          mode: t.mode,
          worldVisible: t.view.group.visible,
          colliders: t.physics.world.colliders.len(),
          position: t.physics.body.translation(),
        };
      }),
    );
    assert.equal(modes.at(-1).mode, mode);
    assert.equal(modes.at(-1).worldVisible, mode !== 2);
    if (mode === 1) await capture("public-game");
  }
  assert.deepEqual(modes[0].position, modes[1].position);
  assert.deepEqual(modes[1].position, modes[2].position);
  await page.keyboard.press("F2");
  const shotBefore = await page.evaluate(() => window.traceTest.actions.shots);
  await page.mouse.click(480, 300);
  const gun = await page.evaluate(() => {
    const t = window.traceTest;
    t.render();
    return {
      shots: t.actions.shots,
      flash: t.weapon.flashVisible,
      kinds: t.waves.slots.filter((w) => w.active).map((w) => w.kind),
      audio: t.audio.state,
    };
  });
  assert.equal(gun.shots, shotBefore + 1);
  assert.equal(gun.flash, true);
  assert.ok(gun.kinds.includes("GUNSHOT"));
  await page.evaluate(() => {
    const t = window.traceTest;
    t.waves.update(0.45);
    t.render();
  });
  await capture("public-sonic");
  const runtime = await page.evaluate(() => {
    const t = window.traceTest;
    const gl = t.renderer.getContext(),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      seed: t.definition.seed,
      colliders: t.physics.world.colliders.len(),
      wasmInstantiations: window.traceWasmInstantiations,
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      webgl2: gl instanceof WebGL2RenderingContext,
    };
  });
  assert.ok(runtime.wasmInstantiations >= 1);
  assert.equal(runtime.webgl2, true);
  assert.ok(resources.some((r) => r.type === "stylesheet" && r.status === 200));
  assert.ok(
    resources.some((r) => r.url.includes("/assets/three-") && r.status === 200),
  );
  assert.ok(
    resources.some(
      (r) => r.url.includes("/assets/physics-") && r.status === 200,
    ),
  );
  assert.ok(resources.every((r) => r.status < 400));
  assert.deepEqual(failures, []);
  assert.deepEqual(errors, []);
  const report = {
    proxyCertificateWorkaround,
    url: url.href,
    browser: await browser.version(),
    publicBoot,
    motion,
    modes,
    gun,
    runtime,
    resources,
    errors,
    failures,
    warnings,
    notes:
      "Linux headless Chromium with forced ANGLE SwiftShader software rendering. Not Windows Chrome or iPhone/iPad Safari hardware acceptance. WASM is embedded in Rapier compat JS; no standalone .wasm request is expected.",
  };
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
