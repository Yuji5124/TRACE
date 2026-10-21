import type { WebGLRenderer } from "three";
export function createPerformance(renderer: WebGLRenderer) {
  let frames = 0,
    seconds = 0,
    sum = 0,
    max = 0;
  let snapshot = {
    fps: 0,
    frameMs: 0,
    maxFrameMs: 0,
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  };
  return {
    sample(dt: number, frameMs: number) {
      frames++;
      seconds += dt;
      sum += frameMs;
      max = Math.max(max, frameMs);
      if (seconds >= 1) {
        snapshot = {
          fps: Math.round(frames / seconds),
          frameMs: +(sum / frames).toFixed(2),
          maxFrameMs: +max.toFixed(2),
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        };
        frames = seconds = sum = max = 0;
      }
      return snapshot;
    },
    get snapshot() {
      return snapshot;
    },
  };
}
