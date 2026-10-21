import type { WebGLRenderer } from "three";
/** Optional asynchronous GPU timing; absence never blocks WebGL2/Safari rendering. */
export function createGpuTimer(renderer: WebGLRenderer) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const free: WebGLQuery[] = [],
    pending: WebGLQuery[] = [];
  let current: WebGLQuery | null = null,
    lastMs: number | null = null,
    frame = 0;
  if (ext)
    for (let i = 0; i < 4; i++) {
      const q = gl.createQuery();
      if (q) free.push(q);
    }
  return {
    get supported() {
      return !!ext;
    },
    get milliseconds() {
      return lastMs;
    },
    begin() {
      if (!ext || gl.isContextLost()) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (
        pending.length &&
        gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)
      ) {
        const q = pending.shift()!;
        if (!disjoint) lastMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        free.push(q);
      }
      if (disjoint) lastMs = null;
      // Sample every 10 frames, bounded at four pooled query objects.
      if (++frame % 10 === 0 && free.length) {
        current = free.pop()!;
        gl.beginQuery(ext.TIME_ELAPSED_EXT, current);
      }
    },
    end() {
      if (ext && current) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push(current);
        current = null;
      }
    },
    dispose() {
      if (current) this.end();
      for (const q of [...free, ...pending]) gl.deleteQuery(q);
      free.length = pending.length = 0;
    },
  };
}
