import RAPIER from "@dimforge/rapier3d-compat";
import type { Physics } from "../physics/world";
import type { SonicOrigin as Point } from "../sonic/waves";
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
/** Static 1m support/clearance grid sampled from the actual Rapier colliders once. */
export class HunterNavigation {
  readonly size = 149;
  readonly min = -74;
  readonly heights = new Float32Array(this.size * this.size).fill(NaN);
  private readonly edges = new Uint8Array(this.size * this.size);
  readonly buildMs: number;
  searches = 0;
  lastMs = 0;
  expanded = 0;
  private readonly costs = new Float32Array(this.size * this.size);
  private readonly parents = new Int32Array(this.size * this.size);
  private readonly closed = new Uint8Array(this.size * this.size);
  constructor(readonly physics: Physics) {
    const begin = performance.now(),
      p = { x: 0, y: 0, z: 0 },
      rot = { x: 0, y: 0, z: 0, w: 1 };
    const capsule = new RAPIER.Capsule(0.5, 0.34);
    const ray = new RAPIER.Ray({ x: 0, y: 4, z: 0 }, { x: 0, y: -1, z: 0 });
    const support = (c: RAPIER.Collider) => {
      if (c.parent()) return false;
      const kind = physics.colliderObjects.get(c.handle)?.kind;
      return (
        !kind ||
        ["terrace", "terrace-step", "play-stair", "tower-deck"].includes(kind)
      );
    };
    for (let z = 0; z < this.size; z++)
      for (let x = 0; x < this.size; x++) {
        p.x = ray.origin.x = this.min + x;
        p.z = ray.origin.z = this.min + z;
        const hit = physics.world.castRay(
          ray,
          10,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          support,
        );
        if (!hit) continue;
        const y = 4 - hit.timeOfImpact;
        // Allow the controller's 26cm autostep clearance at stair noses.
        // Edge support profiles below reject un-climbable side ledges.
        p.y = y + 1.13;
        const blocked = physics.world.intersectionWithShape(
          p,
          rot,
          capsule,
          undefined,
          undefined,
          physics.player,
          undefined,
          (c) => !c.parent(),
        );
        if (!blocked) this.heights[z * this.size + x] = y;
      }
    // 25cm support samples distinguish stairs from an un-climbable side ledge.
    // Cache directed links once; no collision queries inside later A* searches.
    for (let z = 0; z < this.size; z++)
      for (let x = 0; x < this.size; x++) {
        const i = z * this.size + x;
        if (!Number.isFinite(this.heights[i])) continue;
        for (const dir of [1, 2]) {
          const [dx, dz] = DIRECTIONS[dir],
            nx = x + dx,
            nz = z + dz;
          if (nx >= this.size || nz >= this.size) continue;
          const j = nz * this.size + nx;
          if (
            !Number.isFinite(this.heights[j]) ||
            Math.abs(this.heights[i] - this.heights[j]) > 0.46
          )
            continue;
          let previous = this.heights[i],
            valid = true;
          for (let part = 1; part <= 4; part++) {
            ray.origin.x = this.min + x + (dx * part) / 4;
            ray.origin.z = this.min + z + (dz * part) / 4;
            const hit = physics.world.castRay(
              ray,
              10,
              true,
              undefined,
              undefined,
              undefined,
              undefined,
              support,
            );
            if (!hit || Math.abs(4 - hit.timeOfImpact - previous) > 0.261) {
              valid = false;
              break;
            }
            previous = 4 - hit.timeOfImpact;
          }
          if (valid) {
            this.edges[i] |= 1 << dir;
            this.edges[j] |= 1 << (dir + 2) % 4;
          }
        }
      }
    this.buildMs = performance.now() - begin;
  }
  point(i: number): Point {
    return {
      x: this.min + (i % this.size),
      y: this.heights[i] + 0.81,
      z: this.min + Math.floor(i / this.size),
    };
  }
  cell(p: Point) {
    return Math.round(p.z - this.min) * this.size + Math.round(p.x - this.min);
  }
  nearest(p: Point) {
    let best = -1,
      distance = Infinity;
    const cx = Math.round(p.x - this.min),
      cz = Math.round(p.z - this.min);
    for (let dz = -4; dz <= 4; dz++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx,
          z = cz + dz;
        if (x < 0 || z < 0 || x >= this.size || z >= this.size) continue;
        const i = z * this.size + x;
        if (!Number.isFinite(this.heights[i])) continue;
        const d = dx * dx + dz * dz + Math.abs(this.heights[i] + 0.81 - p.y);
        if (d < distance) {
          distance = d;
          best = i;
        }
      }
    return best;
  }
  route(
    from: Point,
    to: Point,
    avoid: ReadonlySet<number> = new Set(),
  ): Point[] | null {
    const start = this.nearest(from),
      goal = this.nearest(to),
      begin = performance.now();
    this.searches++;
    this.expanded = 0;
    if (start < 0 || goal < 0) {
      this.lastMs = performance.now() - begin;
      return null;
    }
    this.costs.fill(Infinity);
    this.parents.fill(-1);
    this.closed.fill(0);
    const heap: number[] = [],
      priorities: number[] = [];
    const heuristic = (i: number) =>
      Math.abs((i % this.size) - (goal % this.size)) +
      Math.abs(Math.floor(i / this.size) - Math.floor(goal / this.size));
    const push = (i: number, f: number) => {
      let k = heap.length;
      heap.push(i);
      priorities.push(f);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (priorities[p] <= f) break;
        heap[k] = heap[p];
        priorities[k] = priorities[p];
        k = p;
      }
      heap[k] = i;
      priorities[k] = f;
    };
    const pop = () => {
      const v = heap[0],
        last = heap.pop()!,
        f = priorities.pop()!;
      if (heap.length) {
        let k = 0;
        while (k * 2 + 1 < heap.length) {
          let c = k * 2 + 1;
          if (c + 1 < heap.length && priorities[c + 1] < priorities[c]) c++;
          if (priorities[c] >= f) break;
          heap[k] = heap[c];
          priorities[k] = priorities[c];
          k = c;
        }
        heap[k] = last;
        priorities[k] = f;
      }
      return v;
    };
    this.costs[start] = 0;
    push(start, heuristic(start));
    while (heap.length && this.expanded < 14000) {
      const i = pop();
      if (this.closed[i]) continue;
      this.closed[i] = 1;
      this.expanded++;
      if (i === goal) {
        const path: Point[] = [];
        for (let j = goal; j !== start; j = this.parents[j])
          path.push(this.point(j));
        path.reverse();
        this.lastMs = performance.now() - begin;
        return path;
      }
      const x = i % this.size,
        z = Math.floor(i / this.size);
      for (let dir = 0; dir < 4; dir++) {
        if (!(this.edges[i] & (1 << dir))) continue;
        const [dx, dz] = DIRECTIONS[dir];
        const nx = x + dx,
          nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) continue;
        const j = nz * this.size + nx;
        if (
          !Number.isFinite(this.heights[j]) ||
          Math.abs(this.heights[j] - this.heights[i]) > 0.46 ||
          avoid.has(j)
        )
          continue;
        const cost =
          this.costs[i] + 1 + Math.abs(this.heights[j] - this.heights[i]);
        if (cost < this.costs[j]) {
          this.costs[j] = cost;
          this.parents[j] = i;
          push(j, cost + heuristic(j));
        }
      }
    }
    this.lastMs = performance.now() - begin;
    return null;
  }
}
