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
const launch = () =>
  chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args,
  });
let browser = await launch();
const browserVersion = await browser.version();
const base = process.env.TRACE_URL || "http://127.0.0.1:32803",
  out = process.env.TRACE_SOUND_OUTPUT || "artifacts/sound";
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 800, height: 520 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
async function boot(p) {
  await p.goto(base + "/?test=1");
  await p.waitForFunction(() => !!window.traceTest, undefined, {
    timeout: 60000,
  });
}
async function shot(p, name) {
  if (process.env.TRACE_CAPTURE === "0") return;
  const c = await p.context().newCDPSession(p),
    r = await c.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
  await writeFile(`${out}/${name}.png`, Buffer.from(r.data, "base64"));
  await c.detach();
}
try {
  await boot(page);
  assert.equal(
    await page.evaluate(() => window.traceTest.audio.state),
    "locked",
    "no audio context before gesture",
  );
  await page.locator("#enter").click();
  await page.waitForFunction(
    () => window.traceTest.audio.state === "running",
    undefined,
    { timeout: 8000 },
  );
  const unlocked = await page.evaluate(() => {
    const t = window.traceTest;
    t.freeze(true);
    t.input.clear();
    t.input.setLook(0, -0.04);
    for (let i = 0; i < 120; i++) t.motionTick();
    return t.audio.status;
  });
  const steps = await page.evaluate(() => {
    const t = window.traceTest;
    const reset = () => {
      t.physics.reset();
      t.actions.reset();
      t.waves.clear();
      t.input.clear();
      t.input.setLook(0, -0.04);
      for (let i = 0; i < 120; i++) t.motionTick();
    };
    reset();
    let initial = t.waves.emissions.FOOTSTEP;
    t.input.keys.add("KeyW");
    for (let i = 0; i < 90; i++) t.motionTick();
    t.input.clear();
    const walk = {
      emitted: t.waves.emissions.FOOTSTEP - initial,
      position: t.physics.body.translation(),
      waves: t.waves.slots
        .filter((w) => w.active)
        .map((w) => ({ kind: w.kind, radius: w.maxRadius, y: w.origin.y })),
    };
    reset();
    initial = t.waves.emissions.RUN;
    t.input.keys.add("KeyW");
    t.input.keys.add("ShiftLeft");
    for (let i = 0; i < 90; i++) t.motionTick();
    t.input.clear();
    const run = {
      emitted: t.waves.emissions.RUN - initial,
      position: t.physics.body.translation(),
      waves: t.waves.slots
        .filter((w) => w.active)
        .map((w) => ({ kind: w.kind, radius: w.maxRadius, y: w.origin.y })),
    };
    let count = t.waves.emitted;
    for (let i = 0; i < 120; i++) t.motionTick();
    const idleExtra = t.waves.emitted - count;
    t.physics.body.setTranslation({ x: 0, y: 0.81, z: 4 }, true);
    t.physics.world.step();
    t.actions.reset();
    t.input.setLook(0, -0.04);
    t.input.keys.add("KeyW");
    for (let i = 0; i < 120; i++) t.motionTick();
    count = t.waves.emitted;
    for (let i = 0; i < 180; i++) t.motionTick();
    const blockedExtra = t.waves.emitted - count;
    t.input.clear();
    // Real gravity fall off a 1m terrace, without adding a jump control.
    t.physics.body.setTranslation({ x: -20, y: 1.82, z: 13 }, true);
    t.physics.world.step();
    t.actions.reset();
    for (let i = 0; i < 30; i++) t.motionTick();
    initial = t.waves.emissions.LANDING;
    t.input.keys.add("KeyD");
    for (let i = 0; i < 260; i++) t.motionTick();
    t.input.clear();
    return {
      walk,
      run,
      idleExtra,
      blockedExtra,
      landings: t.waves.emissions.LANDING - initial,
    };
  });
  console.log("motion", JSON.stringify(steps));
  assert.ok(steps.walk.emitted >= 3);
  assert.ok(steps.run.emitted > steps.walk.emitted);
  assert.equal(steps.idleExtra, 0);
  assert.equal(steps.blockedExtra, 0);
  assert.ok(steps.landings >= 1);
  assert.ok(
    steps.walk.waves.every(
      (w) => w.kind === "FOOTSTEP" && w.radius === 4 && w.y < 0.15,
    ),
  );
  assert.ok(steps.run.waves.every((w) => w.kind === "RUN" && w.radius === 8));
  const waveform = await page.evaluate(async () => {
    const t = window.traceTest;
    return await Promise.all(
      ["FOOTSTEP", "RUN", "LANDING", "GUNSHOT"].map((kind) =>
        t.renderSoundProbe(kind),
      ),
    );
  });
  assert.ok(
    waveform.every(
      (w) => w.rms > 0.001 && w.peak < 1 && w.lateEnergy < 0.00001,
    ),
  );
  assert.ok(waveform[1].rms > waveform[0].rms);
  assert.ok(waveform[3].rms > waveform[1].rms);
  const ground = await page.evaluate(() => {
    const t = window.traceTest,
      p = t.createSonicProbe("ground");
    const result = ["FOOTSTEP", "RUN", "GUNSHOT"].map((kind) => ({
      kind,
      ...p.sample(0.4, kind),
    }));
    p.dispose();
    return result;
  });
  assert.equal(ground[0].sixMetres, 0);
  assert.ok(ground[1].sixMetres > 0);
  assert.ok(ground[1].lit > ground[0].lit);
  assert.ok(ground[2].lit >= ground[1].lit);
  // Native mouse event route; time is frozen so the second click must be rejected.
  await page.evaluate(() => {
    const t = window.traceTest;
    t.physics.body.setTranslation({ x: 0, y: 0.81, z: 49 }, true);
    t.physics.world.step();
    t.input.setLook(Math.PI, -0.05);
    t.actions.reset();
    t.waves.clear();
    t.start();
  });
  const shotBefore = await page.evaluate(() => window.traceTest.actions.shots);
  await page.mouse.click(400, 220);
  await page.mouse.click(400, 220);
  const gun = await page.evaluate(() => {
    const t = window.traceTest;
    t.render();
    return {
      shots: t.actions.shots,
      flash: t.weapon.flashVisible,
      waves: t.waves.slots
        .filter((w) => w.active)
        .map((w) => ({ kind: w.kind, radius: w.maxRadius, bornAt: w.bornAt })),
      audio: t.audio.status,
    };
  });
  assert.equal(gun.shots, shotBefore + 1);
  assert.equal(gun.flash, true);
  assert.equal(gun.waves.length, 1);
  assert.equal(gun.waves[0].kind, "GUNSHOT");
  assert.equal(gun.waves[0].radius, 35);
  assert.ok(gun.audio.played > 0);
  await shot(page, "muzzle-flash");
  await page.evaluate(() => {
    const t = window.traceTest;
    t.waves.update(0.3);
    t.render();
  });
  assert.equal(
    await page.evaluate(() => window.traceTest.weapon.flashVisible),
    false,
  );
  await page.keyboard.press("KeyQ");
  const mix = await page.evaluate(() => {
    const t = window.traceTest;
    t.actions.emit("FOOTSTEP", { x: 0, y: 0.08, z: 49 });
    t.actions.emit("RUN", { x: 0, y: 0.08, z: 49 });
    return t.waves.slots.filter((w) => w.active).map((w) => w.kind);
  });
  assert.ok(
    ["FOOTSTEP", "RUN", "GUNSHOT", "TEST"].every((k) => mix.includes(k)),
  );
  await page.keyboard.press("KeyM");
  const mutedBefore = await page.evaluate(() => window.traceTest.audio.played);
  await page.evaluate(() => {
    const t = window.traceTest;
    t.waves.update(0.3);
  });
  await page.mouse.click(400, 220);
  assert.equal(
    await page.evaluate(() => window.traceTest.audio.played),
    mutedBefore,
  );
  assert.equal(await page.evaluate(() => window.traceTest.audio.muted), true);
  assert.equal(
    await page.evaluate(() => window.traceTest.actions.shots),
    shotBefore + 2,
  );
  await page.evaluate(() => {
    const input = document.querySelector("#volume");
    input.value = "15";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => window.traceTest.audio.volume), 0.15);
  const comparisons = [];
  for (const kind of ["FOOTSTEP", "RUN", "GUNSHOT"]) {
    const result = await page.evaluate((kind) => {
      const t = window.traceTest;
      t.setMode(2);
      t.waves.clear();
      t.actions.reset();
      t.input.clear();
      if (kind === "GUNSHOT") {
        t.physics.body.setTranslation({ x: 20, y: 0.81, z: -7 }, true);
        t.physics.world.step();
        t.input.setLook(0, -0.04);
        t.fire();
        t.render();
        t.waves.update(0.72);
        t.camera.position.set(20, 1.66, -7);
        t.camera.lookAt(18, 2, -23);
      } else {
        t.physics.reset();
        for (let i = 0; i < 120; i++) t.motionTick();
        t.input.keys.add("KeyW");
        if (kind === "RUN") t.input.keys.add("ShiftLeft");
        const before = t.waves.emissions[kind];
        for (let i = 0; i < 60 && t.waves.emissions[kind] === before; i++)
          t.motionTick();
        t.input.clear();
        t.waves.update(0.4);
        t.camera.position.set(0, 1.66, 30);
        t.camera.lookAt(0, 0, 24);
      }
      t.render();
      document.querySelector("#status").textContent =
        `${kind} / ${kind === "FOOTSTEP" ? 4 : kind === "RUN" ? 8 : 35}m`;
      return {
        kind,
        count: t.waves.count,
        calls: t.renderer.info.render.calls,
        triangles: t.renderer.info.render.triangles,
      };
    }, kind);
    comparisons.push(result);
    await shot(page, kind.toLowerCase());
  }
  const modeParity = [];
  for (const mode of [1, 2, 3]) {
    modeParity.push(
      await page.evaluate((mode) => {
        const t = window.traceTest;
        t.setMode(mode);
        t.physics.reset();
        t.actions.reset();
        t.waves.clear();
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
    await page.evaluate(() => {
      const t = window.traceTest;
      t.actions.emit("GUNSHOT", { x: 20, y: 1.45, z: -7 });
      t.waves.update(0.72);
      t.camera.position.set(20, 1.66, -7);
      t.camera.lookAt(18, 2, -23);
      t.render();
      document.querySelector("#stats").style.display =
        t.mode === 3 ? "block" : "none";
      if (t.mode === 3)
        document.querySelector("#stats").textContent = t.sonicDebug.text();
    });
    await shot(page, `mode-${mode}`);
  }
  assert.deepEqual(modeParity[0].position, modeParity[1].position);
  assert.deepEqual(modeParity[1].position, modeParity[2].position);
  const stress = await page.evaluate(() => {
    const t = window.traceTest;
    t.audio.setMuted(false);
    for (let i = 0; i < 160; i++)
      t.actions.emit(
        ["FOOTSTEP", "RUN", "GUNSHOT", "TEST", "ANIMAL", "LANDING"][i % 6],
        { x: i * 0.01, y: 0.1, z: 0 },
      );
    return {
      count: t.waves.count,
      serials: t.waves.slots.map((w) => w.serial),
      emitted: t.waves.emitted,
      voices: t.audio.status.voices,
    };
  });
  assert.equal(stress.count, 8);
  assert.ok(stress.serials.every((s) => s > stress.emitted - 8));
  assert.ok(stress.voices <= 16);
  // Software renderer sample, not hardware-device acceptance.
  await page.evaluate(() => {
    const t = window.traceTest;
    t.audio.setMuted(true);
    t.setMode(2);
    t.physics.body.setTranslation({ x: 20, y: 0.81, z: -7 }, true);
    t.physics.world.step();
    t.actions.reset();
    t.waves.clear();
    t.input.clear();
    t.input.setLook(0, -0.04);
    t.start();
    t.freeze(false);
    window.fireTimer = setInterval(() => t.fire(), 330);
  });
  await page.waitForTimeout(3500);
  const softwarePerformance = await page.evaluate(() => {
    clearInterval(window.fireTimer);
    const t = window.traceTest;
    const result = { metrics: t.metrics, gpu: t.gpu };
    t.freeze(true);
    t.stop();
    return result;
  });
  console.log("desktop sound checks passed; starting isolated touch browser");
  await browser.close();
  browser = await launch();
  // Dedicated process: single-process Chromium cannot reliably open a second context.
  // Tapping the look area does not fire; FIRE button does.
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobile = await mobileContext.newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  await boot(mobile);
  await mobile.locator("#enter").tap();
  await mobile.evaluate(() => {
    window.traceTest.freeze(true);
  });
  const mobileBefore = await mobile.evaluate(
    () => window.traceTest.actions.shots,
  );
  await mobile.touchscreen.tap(330, 230);
  assert.equal(
    await mobile.evaluate(() => window.traceTest.actions.shots),
    mobileBefore,
  );
  await mobile.locator("#fire").tap();
  assert.equal(
    await mobile.evaluate(() => window.traceTest.actions.shots),
    mobileBefore + 1,
  );
  await mobile.locator("#run-toggle").tap();
  assert.equal(
    await mobile.evaluate(() => window.traceTest.input.running),
    true,
  );
  await mobile.evaluate(() => {
    const t = window.traceTest;
    t.setMode(2);
    t.render();
    t.waves.update(0.3);
    t.render();
  });
  await shot(mobile, "mobile-controls");
  const mobileState = await mobile.evaluate(() => ({
    shots: window.traceTest.actions.shots,
    running: window.traceTest.input.running,
    audio: window.traceTest.audio.state,
  }));
  console.log(
    "touch sound checks passed; starting isolated audio-failure browser",
  );
  await browser.close();
  browser = await launch();
  const failed = await browser.newPage({
    viewport: { width: 800, height: 520 },
  });
  failed.on("pageerror", (e) => errors.push(e.message));
  await failed.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: class {
        constructor() {
          throw Error("Simulated audio denial");
        }
      },
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: undefined,
      configurable: true,
    });
  });
  await boot(failed);
  await failed.locator("#enter").click();
  await failed.evaluate(() => {
    window.traceTest.freeze(true);
  });
  await failed.locator("#fire").dispatchEvent("click");
  const audioFailure = await failed.evaluate(() => {
    const t = window.traceTest;
    t.waves.update(0.4);
    t.setMode(2);
    t.render();
    return {
      state: t.audio.state,
      count: t.waves.count,
      visible: t.sonicVision.group.visible,
      kinds: t.waves.slots.filter((w) => w.active).map((w) => w.kind),
    };
  });
  assert.equal(audioFailure.state, "unavailable");
  assert.equal(audioFailure.visible, true);
  assert.ok(audioFailure.kinds.includes("GUNSHOT"));

  assert.deepEqual(errors, []);
  const report = {
    browser: browserVersion,
    unlocked,
    steps,
    waveform,
    ground,
    gun,
    mix,
    comparisons,
    modeParity,
    stress,
    softwarePerformance,
    mobileState,
    audioFailure,
    errors,
    physicalGpuDevices: {
      tested: false,
      devices: [],
      note: "Windows/iPhone/iPad hardware FPS, Safari playback policy and audible speaker output were not tested. Touch test is Chromium emulation.",
    },
  };
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
