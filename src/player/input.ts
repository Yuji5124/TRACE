import type { PerspectiveCamera } from "three";
export function createInput(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  onPause: () => void,
) {
  const keys = new Set<string>();
  let yaw = 0,
    pitch = -0.04,
    drag: number | null = null,
    lx = 0,
    ly = 0;
  let touchX = 0,
    touchY = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  const clear = () => {
    keys.clear();
    touchX = touchY = 0;
    pointers.clear();
    drag = null;
  };
  addEventListener("keydown", (e) => {
    if (!e.repeat) keys.add(e.code);
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        e.code,
      )
    )
      e.preventDefault();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => {
    clear();
    onPause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clear();
      onPause();
    }
  });
  const look = (dx: number, dy: number) => {
    yaw -= dx * 0.0025;
    pitch = Math.max(-1.45, Math.min(1.45, pitch - dy * 0.0025));
  };
  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    drag = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    if (!document.pointerLockElement)
      canvas.requestPointerLock?.()?.catch(() => {});
  });
  canvas.addEventListener("pointermove", (e) => {
    const start = pointers.get(e.pointerId);
    if (start) {
      if (start.x < innerWidth * 0.45) {
        touchX = Math.max(-1, Math.min(1, (e.clientX - start.x) / 55));
        touchY = Math.max(-1, Math.min(1, (e.clientY - start.y) / 55));
      } else {
        look(e.clientX - start.x, e.clientY - start.y);
        start.x = e.clientX;
        start.y = e.clientY;
      }
      return;
    }
    if (drag === e.pointerId && !document.pointerLockElement) {
      look(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    }
  });
  for (const event of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const)
    canvas.addEventListener(event, (e) => {
      const p = pointers.get(e.pointerId);
      if (p && p.x < innerWidth * 0.45) touchX = touchY = 0;
      pointers.delete(e.pointerId);
      if (drag === e.pointerId) drag = null;
    });
  return {
    keys,
    clear,
    update(dt: number) {
      if (keys.has("ArrowLeft")) yaw += dt * 1.5;
      if (keys.has("ArrowRight")) yaw -= dt * 1.5;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      let x = Number(keys.has("KeyD")) - Number(keys.has("KeyA")) + touchX;
      let z =
        Number(keys.has("KeyS") || keys.has("ArrowDown")) -
        Number(keys.has("KeyW") || keys.has("ArrowUp")) +
        touchY;
      const length = Math.max(1, Math.hypot(x, z));
      x /= length;
      z /= length;
      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 6.2 : 3.6;
      return {
        x: (x * Math.cos(yaw) + z * Math.sin(yaw)) * speed * dt,
        z: (-x * Math.sin(yaw) + z * Math.cos(yaw)) * speed * dt,
      };
    },
    setLook(y: number, p: number) {
      yaw = y;
      pitch = p;
    },
    get yaw() {
      return yaw;
    },
  };
}
