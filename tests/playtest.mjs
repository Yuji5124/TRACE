import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const args = [
  "--no-sandbox",
  "--no-zygote",
  "--single-process",
  "--in-process-gpu",
  "--ignore-gpu-blocklist",
  "--disable-dev-shm-usage",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const outputDir = process.env.TRACE_ARTIFACT_DIR || "artifacts";
await mkdir(outputDir, { recursive: true });
await page.goto(
  (process.env.TRACE_URL || "http://127.0.0.1:32803") + "/?test=1",
);
await page.waitForFunction(() => !!window.traceTest, undefined, {
  timeout: 60000,
});
await page.evaluate(() => window.traceTest.start());
await page.waitForTimeout(2000);
async function shot(path) {
  if (process.env.TRACE_CAPTURE === "0") return;
  if (process.env.TRACE_CAPTURE === "street" && !path.includes("06-street"))
    return;
  path = path.replace(/^artifacts/, outputDir);
  const cdp = await page.context().newCDPSession(page);
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
  await cdp.detach();
}
await shot("artifacts/01-visible.png");
const modes = [];
for (const mode of [1, 2, 3]) {
  await page.keyboard.press(`F${mode}`);
  const result = await page.evaluate((mode) => {
    const t = window.traceTest;
    t.stop();
    t.physics.reset();
    for (let i = 0; i < 120; i++) t.physics.move(0, 0, 1 / 60);
    for (let i = 0; i < 600; i++) t.physics.move(0, -0.06, 1 / 60);
    const p = t.physics.body.translation();
    return {
      mode: t.mode,
      visible: t.view.group.visible,
      position: { x: p.x, y: p.y, z: p.z },
      colliders: t.physics.world.colliders.len(),
      ground: t.view.groundAt(-25, -25),
    };
  }, mode);
  assert.equal(result.mode, mode);
  assert.equal(result.visible, mode !== 2);
  assert.ok(result.position.z > 3.5 && result.position.z < 3.8);
  assert.ok(result.ground > 1);
  modes.push(result);
  await page.waitForTimeout(200);
  await shot(`artifacts/0${mode + 1}-mode-${mode}.png`);
}
assert.deepEqual(modes[0].position, modes[1].position);
assert.deepEqual(modes[1].position, modes[2].position);
await page.keyboard.press("F1");
await page.evaluate(() => {
  const t = window.traceTest;
  t.physics.body.setTranslation({ x: 20, y: 2, z: -7 }, true);
  t.input.setLook(0.15, -0.05);
  t.start();
});
await page.waitForTimeout(400);
await shot("artifacts/05-playground.png");
await page.evaluate(() => {
  const t = window.traceTest;
  t.physics.body.setTranslation({ x: 10, y: 2, z: 50 }, true);
  t.input.setLook(Math.PI, -0.07);
});
await page.waitForTimeout(400);
await shot("artifacts/06-street.png");
// Actual keyboard movement, key release on blur, and reset.
await page.bringToFront();
await page.evaluate(() => {
  const t = window.traceTest;
  t.physics.reset();
  t.input.setLook(0, 0);
  t.start();
});
await page.keyboard.down("KeyW");
await page.waitForFunction(
  () => window.traceTest.physics.body.translation().z < 29,
  undefined,
  { timeout: 15000 },
);
await page.keyboard.up("KeyW");
assert.ok(
  (await page.evaluate(() => window.traceTest.physics.body.translation().z)) <
    29,
);
await page.keyboard.down("KeyW");
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await page.keyboard.up("KeyW");
assert.equal(await page.evaluate(() => window.traceTest.input.keys.size), 0);
await page.keyboard.press("KeyR");
assert.equal(
  await page.evaluate(() => window.traceTest.physics.body.translation().z),
  30,
);
await page.evaluate(() => {
  window.traceTest.start();
  window.traceTest.setMode(1);
});
await page.waitForTimeout(1500);
const metrics = await page.evaluate(() => window.traceTest.metrics);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await shot("artifacts/07-mobile.png");
assert.ok(await page.locator('[data-mode="2"]').isVisible());
assert.deepEqual(errors, []);
const report = {
  browser: await browser.version(),
  errors,
  modes,
  metrics,
  notes:
    "Headless SwiftShader software rendering; FPS is not representative of device GPU performance.",
};
await writeFile(`${outputDir}/playtest.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
