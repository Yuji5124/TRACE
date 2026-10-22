import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = (process.env.TRACE_URL || "http://127.0.0.1:32803").replace(
    /\/$/,
    "",
  ),
  out = process.env.TRACE_HUNTER_OUTPUT || "artifacts/hunter";
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
const page = await browser.newPage({
    viewport: { width: 900, height: 600 },
    ignoreHTTPSErrors: process.env.TRACE_PROXY_INSECURE === "1",
  }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
async function capture(name) {
  if (process.env.TRACE_CAPTURE === "0") return;
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const c = await page.context().newCDPSession(page),
    s = await c.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 88,
      fromSurface: true,
    });
  await writeFile(`${out}/${name}.jpg`, Buffer.from(s.data, "base64"));
  await c.detach();
}
try {
  const response = await page.goto(base + "/?test=1", { timeout: 90000 });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => !!window.traceTest, undefined, {
    timeout: 90000,
  });
  await page.locator("#enter").click();
  await page.evaluate(() => {
    const t = window.traceTest;
    t.freeze(true);
    t.resetRound();
    t.input.setLook(0, -0.04);
    for (let i = 0; i < 120; i++) t.motionTick();
    t.setMode(2);
    t.render();
  });
  const initial = await page.evaluate(() => {
    const t = window.traceTest;
    return {
      state: t.hunter.state,
      position: t.hunter.position,
      sourceVisible: t.hunterView.group.visible,
      echoVisible: t.hunterView.vision.group.visible,
      normalMaterials: t.hunterView.vision.sources.map((m) => m.material.uuid),
    };
  });
  assert.equal(initial.state, "IDLE");
  assert.equal(initial.sourceVisible, false);
  assert.equal(initial.echoVisible, false);
  await page.keyboard.press("KeyQ");
  const heard = await page.evaluate(() => {
    const t = window.traceTest;
    for (let i = 0; i < 90; i++) t.motionTick();
    t.render();
    return {
      state: t.hunter.state,
      heard: t.hunter.lastHeard,
      position: t.hunter.position,
      logs: t.hunter.logs.slice(),
    };
  });
  assert.equal(heard.heard.kind, "TEST");
  assert.equal(heard.state, "INVESTIGATE");
  assert.ok(
    Math.hypot(
      heard.position.x - initial.position.x,
      heard.position.z - initial.position.z,
    ) > 0.1,
  );
  await capture("01-investigate");
  const chase = await page.evaluate(() => {
    const t = window.traceTest;
    let ticks = 0;
    while (t.hunter.state !== "CHASE" && ticks++ < 720) t.motionTick();
    t.render();
    return {
      state: t.hunter.state,
      ticks,
      enemy: t.hunter.position,
      player: t.physics.body.translation(),
      logs: t.hunter.logs.slice(),
    };
  });
  console.log("chase", JSON.stringify(chase));
  assert.equal(chase.state, "CHASE");
  await page.keyboard.down("KeyS");
  await page.keyboard.down("ShiftLeft");
  const escape = await page.evaluate(() => {
    const t = window.traceTest;
    const before = t.waves.emissions.RUN;
    for (let i = 0; i < 180; i++) t.motionTick();
    t.render();
    return {
      state: t.hunter.state,
      player: t.physics.body.translation(),
      lastSeen: t.hunter.lastSeen,
      target: t.hunter.target,
      runPulses: t.waves.emissions.RUN - before,
      logs: t.hunter.logs.slice(),
    };
  });
  await page.keyboard.up("KeyS");
  await page.keyboard.up("ShiftLeft");
  assert.ok(escape.runPulses > 0);
  assert.ok(escape.logs.some((x) => x.event === "lost-sight"));
  await capture("02-escape");
  // Real collider occlusion: view player first, then place the fountain between them.
  const hiding = await page.evaluate(() => {
    const t = window.traceTest;
    t.resetRound();
    t.hunter.motor.reset({ x: 6, y: 0.81, z: 5 });
    t.hunter.facing = Math.PI;
    t.physics.body.setTranslation({ x: 6, y: 0.81, z: 0 }, true);
    t.physics.world.step();
    for (let i = 0; i < 12; i++) t.motionTick();
    const acquired = t.hunter.state;
    t.hunter.motor.reset({ x: -4, y: 0.81, z: 0 });
    t.hunter.facing = Math.PI / 2;
    t.physics.body.setTranslation({ x: 4, y: 0.81, z: 0 }, true);
    t.physics.world.step();
    t.hunter.pauseUntil = t.hunter.time + 3;
    for (let i = 0; i < 65; i++) t.motionTick();
    t.render();
    return {
      acquired,
      state: t.hunter.state,
      lastSeen: t.hunter.lastSeen,
      target: t.hunter.target,
      logs: t.hunter.logs.slice(),
    };
  });
  assert.equal(hiding.acquired, "CHASE");
  assert.equal(hiding.state, "SEARCH");
  await page.evaluate(() => {
    const t = window.traceTest;
    t.resetRound();
    t.input.setLook(0, 0);
    t.hunter.motor.reset({ x: 6, y: 0.81, z: 5 });
    const p = { x: 6, y: 0.81, z: 0 };
    t.physics.body.setTranslation(p, true);
    t.physics.body.setNextKinematicTranslation(p);
    t.physics.world.step();
    for (let i = 0; i < 20; i++) t.motionTick();
  });
  await page.keyboard.down("KeyD");
  const sneak = await page.evaluate(() => {
    const t = window.traceTest, start = t.physics.body.translation();
    const before = t.waves.emissions.FOOTSTEP;
    for (let i = 0; i < 75; i++) t.motionTick();
    return { start, end: t.physics.body.translation(), state: t.hunter.state,
      heard: t.hunter.lastHeard, lastSeen: t.hunter.lastSeen,
      footsteps: t.waves.emissions.FOOTSTEP - before };
  });
  await page.keyboard.up("KeyD");
  assert.ok(sneak.end.x - sneak.start.x > 2);
  assert.ok(sneak.footsteps > 0);
  assert.equal(sneak.state, "IDLE");
  assert.equal(sneak.heard, null);
  assert.equal(sneak.lastSeen, null);
  // Phase 3B: same 5m position, rear silence / walking / running / bounded turn.
  const rear = await page.evaluate(() => {
    const t = window.traceTest;
    t.resetRound();
    t.hunter.motor.reset({ x: 6, y: 0.81, z: 5 });
    t.physics.body.setTranslation({ x: 6, y: 0.81, z: 0 }, true);
    t.physics.body.setNextKinematicTranslation({ x: 6, y: 0.81, z: 0 });
    t.physics.world.step();
    const snap = () => ({ state: t.hunter.state, visibility: t.hunter.visibility,
      facing: t.hunter.facing, heard: t.hunter.lastHeard?.kind ?? null,
      lastSeen: t.hunter.lastSeen });
    for (let i = 0; i < 30; i++) t.motionTick();
    const silent = snap();
    t.actions.emit("FOOTSTEP", { x: 6, y: 0.81, z: 0 });
    for (let i = 0; i < 24; i++) t.motionTick();
    const walking = snap();
    t.actions.emit("RUN", { x: 6, y: 0.81, z: 0 });
    for (let i = 0; i < 18; i++) t.motionTick();
    const reaction = snap();
    for (let i = 0; i < 90; i++) t.motionTick();
    return { silent, walking, reaction, turned: snap() };
  });
  assert.equal(rear.silent.state, "IDLE");
  assert.equal(rear.silent.visibility, "outside-cone");
  assert.equal(rear.walking.heard, null);
  assert.equal(rear.reaction.state, "INVESTIGATE");
  assert.equal(rear.reaction.heard, "RUN");
  assert.equal(rear.reaction.lastSeen, null);
  assert.ok(Math.abs(rear.reaction.facing) < 0.5);
  assert.equal(rear.turned.state, "CHASE");
  // Test actual enemy geometry, not a shell: before arrival -> partial -> full -> fade.
  const samples = await page.evaluate(() => {
    const t = window.traceTest;
    t.resetRound();
    const p = t.createHunterProbe(),
      r = [0.29, 0.32, 0.42, 2.7].map((a) => p.sample(a));
    p.dispose();
    t.waves.clear();
    return r;
  });
  console.log("samples", JSON.stringify(samples));
  assert.equal(samples[0].lit, 0);
  assert.ok(samples[1].lit > 0);
  assert.ok(samples[2].lit > samples[1].lit);
  assert.equal(samples[3].lit, 0);
  assert.ok(samples.every((s) => s.sharedGeometry && s.aligned));
  // Move model: every proxy must follow animated source transforms exactly.
  const modes = [];
  for (const mode of [1, 2, 3]) {
    modes.push(
      await page.evaluate((mode) => {
        const t = window.traceTest;
        t.setMode(mode);
        t.hunter.motor.reset({ x: 4, y: 0.81, z: 20 });
        t.physics.world.step();
        t.waves.clear();
        t.actions.emit("TEST", { x: 0, y: 1.45, z: 30 });
        t.waves.update(0.5);
        t.camera.position.set(0, 1.66, 30);
        t.camera.lookAt(4, 1.5, 20);
        t.render();
        document.querySelector("#stats").textContent = t.hunter.debugText();
        document.querySelector("#stats").style.display =
          mode === 3 ? "block" : "none";
        return {
          mode,
          sourceVisible: t.hunterView.group.visible,
          debugConeVisible: t.hunterView.debugCone.visible,
          aligned: t.hunterView.vision.proxies.every((m, i) =>
            m.matrix.equals(t.hunterView.vision.sources[i].matrixWorld),
          ),
          colliders: t.physics.world.colliders.len(),
        };
      }, mode),
    );
    await capture(`mode-${mode}`);
  }
  assert.deepEqual(
    modes.map((m) => m.sourceVisible),
    [true, false, true],
  );
  assert.ok(modes.every((m) => m.aligned));
  // Real RAF HUD update while muted: no directional marker, but danger remains visible.
  await page.evaluate(() => {
    const t = window.traceTest;
    t.resetRound();
    t.setMode(2);
    t.audio.setMuted(true);
    t.hunter.immunityUntil = 0;
    t.hunter.motor.reset({ x: 6, y: 0.81, z: 30 });
    t.physics.world.step();
    t.start();
    t.freeze(false);
  });
  await page.waitForFunction(
    () => document.querySelector("#danger").classList.contains("near"),
    undefined,
    { timeout: 10000 },
  );
  assert.deepEqual(modes.map((m) => m.debugConeVisible), [false, false, true]);
  const mutedDanger = await page.evaluate(() => {
    const t = window.traceTest;
    t.freeze(true);
    return {
      muted: t.audio.muted,
      text: document.querySelector("#danger").textContent,
      statsVisible:
        getComputedStyle(document.querySelector("#stats")).display !== "none",
    };
  });
  assert.equal(mutedDanger.muted, true);
  assert.ok(mutedDanger.text);
  assert.equal(mutedDanger.statsVisible, false);
  const captureReset = await page.evaluate(() => {
    const t = window.traceTest;
    t.resetRound();
    t.setMode(2);
    t.audio.setMuted(true);
    const p = t.hunter.position;
    t.hunter.immunityUntil = 0;
    t.physics.body.setTranslation({ x: p.x + 0.7, y: p.y, z: p.z }, true);
    t.physics.world.step();
    const count = t.hunter.captures;
    for (let i = 0; i < 12; i++) t.motionTick();
    t.render();
    return {
      captures: t.hunter.captures - count,
      state: t.hunter.state,
      player: t.physics.body.translation(),
      grace: t.hunter.immune,
      pending: t.hunter.pending.length,
      waves: t.waves.count,
      flash: document
        .querySelector("#capture-flash")
        .classList.contains("caught"),
    };
  });
  assert.equal(captureReset.captures, 1);
  assert.equal(captureReset.state, "IDLE");
  assert.equal(captureReset.grace, true);
  assert.equal(captureReset.pending, 0);
  assert.equal(captureReset.waves, 0);
  assert.equal(captureReset.flash, true);
  assert.ok(captureReset.player.z > 29);
  await capture("03-capture");
  const timing = await page.evaluate(() => {
    const t = window.traceTest;
    t.resetRound();
    const n = t.hunter.navigation.searches,
      brain = t.hunter.brainTicks;
    const begin = performance.now();
    for (let i = 0; i < 600; i++) t.motionTick();
    return {
      simulationSeconds: 10,
      totalMs: performance.now() - begin,
      brainTicks: t.hunter.brainTicks - brain,
      pathSearches: t.hunter.navigation.searches - n,
      brainLastMs: t.hunter.brainMs,
      brainMaxMs: t.hunter.maxBrainMs,
      pathLastMs: t.hunter.navigation.lastMs,
      gridBuildMs: t.hunter.navigation.buildMs,
    };
  });
  assert.equal(timing.brainTicks, 100);
  assert.ok(timing.pathSearches <= 11);
  // Actual RAF performance sample with one AI, clearly software-rendered.
  await page.evaluate(() => {
    const t = window.traceTest;
    t.setMode(2);
    t.start();
    t.freeze(false);
    t.actions.emit("TEST", t.physics.body.translation());
    window.hunterPulseTimer = setInterval(
      () => t.actions.emit("TEST", t.physics.body.translation()),
      800,
    );
  });
  await page.waitForTimeout(3500);
  const software = await page.evaluate(() => {
    const t = window.traceTest;
    clearInterval(window.hunterPulseTimer);
    t.freeze(true);
    t.stop();
    return { metrics: t.metrics, gpu: t.gpu };
  });
  assert.deepEqual(errors, []);
  const report = {
    browser: await browser.version(),
    url: base,
    initial,
    heard,
    chase,
    escape,
    hiding,
    rear,
    sneak,
    samples,
    modes,
    captureReset,
    mutedDanger,
    timing,
    software,
    errors,
    physicalDevices: {
      tested: false,
      note: "Linux Chromium / SwiftShader; Windows Chrome and iPhone/iPad Safari hardware, audible speakers and input feel not tested.",
    },
  };
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
