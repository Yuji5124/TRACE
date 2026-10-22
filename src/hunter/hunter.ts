import type { Physics } from "../physics/world";
import type {
  SonicWaveSystem,
  SonicEvent,
  SonicOrigin as Point,
} from "../sonic/waves";
import { random } from "../world/random";
import { HUNTER_CONFIG as C, HEARING } from "./config";
import { HunterNavigation } from "./navigation";
import { HunterMotor } from "./motor";
import { inViewCone, turnToward } from "./perception";
export type HunterState =
  | "IDLE"
  | "INVESTIGATE"
  | "SEARCH"
  | "CHASE"
  | "RETURN";
const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const horizontal = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export class EchoHunter {
  readonly navigation: HunterNavigation;
  readonly motor: HunterMotor;
  readonly home: Point;
  state: HunterState = "IDLE";
  target: Point | null = null;
  lastHeard: {
    kind: SonicEvent["kind"];
    origin: Point;
    distance: number;
    heardAt: number;
    priority: number;
    strength: number;
  } | null = null;
  lastSeen: Point | null = null;
  readonly logs: Record<string, unknown>[] = [];
  readonly pending: SonicEvent[] = [];
  time = 0;
  captures = 0;
  capturePending = false;
  immunityUntil = 0;
  reactionUntil = 0;
  pauseUntil = 0;
  playerDistance = Infinity;
  brainMs = 0;
  maxBrainMs = 0;
  brainTicks = 0;
  routeStatus = "idle";
  route: Point[] = [];
  pathIndex = 0;
  facing = 0;
  visibility = "unchecked";
  get sightRange() {
    return this.state === "IDLE" || this.state === "RETURN"
      ? C.idleSight : C.alertSight;
  }
  get fieldOfView() {
    return this.state === "IDLE" || this.state === "RETURN"
      ? C.idleFov : C.alertFov;
  }
  speed = 0;
  private accumulator = 0;
  private stateSince = 0;
  private lastVisibleAt = -Infinity;
  private nextPlan = 0;
  private nextPatrol = 4;
  private memoryUntil = 0;
  private stuck = 0;
  private progress: Point;
  private failures = 0;
  private readonly avoid = new Set<number>();
  private readonly rng: () => number;
  private readonly unsubscribe: () => void;
  private readonly beforeStep: (dt: number) => void;
  constructor(
    readonly physics: Physics,
    readonly waves: SonicWaveSystem,
    seed: number,
  ) {
    this.rng = random(seed ^ 0xec403a);
    this.navigation = new HunterNavigation(physics);
    const cell = this.navigation.nearest({ x: 12, y: 0.81, z: 8 });
    if (cell < 0) throw Error("No hunter spawn support");
    this.home = this.navigation.point(cell);
    this.motor = new HunterMotor(physics, this.home);
    this.progress = { ...this.home };
    this.unsubscribe = waves.subscribe((e) => {
      if (this.pending.length >= 64) this.pending.shift();
      this.pending.push(e);
      this.log("sound-emitted", {
        serial: e.serial,
        kind: e.kind,
        origin: e.origin,
      });
    });
    this.beforeStep = (dt) => this.update(dt, physics.body.translation());
    physics.beforeStep.add(this.beforeStep);
    physics.world.step();
    this.immunityUntil = C.immunitySeconds;
  }
  get position() {
    return this.motor.position;
  }
  get immune() {
    return this.time < this.immunityUntil;
  }
  private log(event: string, details: Record<string, unknown> = {}) {
    if (this.logs.length >= 128) this.logs.shift();
    this.logs.push({
      time: +this.time.toFixed(3),
      event,
      state: this.state,
      ...details,
    });
  }
  private transition(state: HunterState, target: Point | null) {
    const changed = this.state !== state;
    if (changed) {
      this.log("transition", { from: this.state, to: state });
      this.state = state;
      this.stateSince = this.time;
    }
    this.target = target ? { ...target } : null;
    if (changed || !target) {
      this.route = [];
      this.pathIndex = 0;
      this.stuck = 0;
    }
  }
  private sounds() {
    for (let i = 0; i < this.pending.length; ) {
      const e = this.pending[i],
        h = HEARING[e.kind],
        age = this.waves.time - e.bornAt,
        d = distance(this.position, e.origin);
      if (age > h.radius / this.waves.config.speed + 0.25) {
        this.log("sound-expired", { serial: e.serial, kind: e.kind });
        this.pending.splice(i, 1);
        continue;
      }
      if (d > h.radius || age < d / this.waves.config.speed) {
        i++;
        continue;
      }
      this.pending.splice(i, 1);
      if (
        this.lastHeard &&
        this.time - this.lastHeard.heardAt < 2 &&
        h.priority < this.lastHeard.priority
      ) {
        this.log("sound-lower-priority", { kind: e.kind });
        continue;
      }
      this.lastHeard = {
        kind: e.kind,
        origin: { ...e.origin },
        distance: d,
        heardAt: this.time,
        priority: h.priority,
        strength: 1 - d / h.radius,
      };
      this.memoryUntil = this.time + C.memorySeconds;
      this.reactionUntil = this.time + 0.18 + (0.16 * d) / h.radius;
      if (this.state === "IDLE" || this.state === "RETURN")
        this.pauseUntil = this.reactionUntil;
      this.log("heard", {
        serial: e.serial,
        kind: e.kind,
        distance: +d.toFixed(2),
        origin: e.origin,
      });
      if (
        this.state !== "CHASE" ||
        this.time - this.lastVisibleAt > C.lostSightSeconds
      ) {
        this.lastSeen = null;
        this.transition("INVESTIGATE", e.origin);
      }
    }
  }
  update(dt: number, player: Point) {
    this.time += dt;
    this.playerDistance = distance(this.position, player);
    if (this.capturePending) {
      this.motor.prepare(null, 0, dt);
      return;
    }
    this.accumulator += dt;
    if (this.accumulator + 1e-8 >= 1 / C.brainHz) {
      const elapsed = this.accumulator;
      this.accumulator = 0;
      const begin = performance.now();
      this.decide(player, elapsed);
      this.brainTicks++;
      this.brainMs = performance.now() - begin;
      this.maxBrainMs = Math.max(this.maxBrainMs, this.brainMs);
    }
    const p = this.position;
    while (
      this.pathIndex < this.route.length &&
      horizontal(p, this.route[this.pathIndex]) < 0.22
    )
      this.pathIndex++;
    const next = this.route[this.pathIndex] ?? null;
    this.speed =
      this.state === "CHASE"
        ? C.chaseSpeed
        : this.state === "IDLE" || this.state === "RETURN"
          ? C.patrolSpeed
          : C.investigateSpeed *
            (0.9 + 0.2 * (this.lastHeard?.strength ?? 0.5));
    if (this.time < this.pauseUntil) this.speed = 0;
    // Hearing turns toward the remembered source during the initial pause;
    // otherwise follow the route, never the unseen live player position.
    const look = this.time < this.pauseUntil ? this.lastHeard?.origin : next;
    if (look && horizontal(p, look) > 0.01) {
      this.facing = turnToward(
        this.facing, Math.atan2(look.x - p.x, look.z - p.z),
        dt * (this.state === "CHASE" ? C.chaseTurnSpeed : C.turnSpeed),
      );
    } else if (this.state === "SEARCH") {
      this.facing += dt * C.turnSpeed * 0.4;
    }
    this.motor.prepare(next, this.speed, dt);
  }
  private decide(player: Point, dt: number) {
    this.sounds();
    this.visibility = this.playerDistance > this.sightRange ? "out-of-range"
      : !inViewCone(this.position, player, this.facing, this.fieldOfView) ? "outside-cone"
      : !this.motor.canSee(player, this.sightRange) ? "occluded" : "visible";
    const visible = this.visibility === "visible";
    if (visible) {
      this.lastSeen = { ...player };
      this.lastVisibleAt = this.time;
      if (this.state !== "CHASE") this.transition("CHASE", player);
      else this.target = { ...player };
    } else if (
      this.state === "CHASE" &&
      this.time - this.lastVisibleAt >= C.lostSightSeconds
    ) {
      this.transition("SEARCH", this.lastSeen);
      this.log("lost-sight");
    }
    // Physical contact can be felt from behind; it must still not cross a wall.
    if (
      !this.immune && this.playerDistance < C.captureDistance &&
      this.motor.canSee(player, C.captureDistance)
    ) {
      this.captures++;
      this.capturePending = true;
      this.log("capture", { count: this.captures });
      return;
    }
    if (
      this.state === "INVESTIGATE" &&
      (this.time > this.memoryUntil ||
        (this.target && horizontal(this.position, this.target) < 1))
    ) {
      this.transition("SEARCH", this.target);
    }
    if (this.state === "SEARCH") {
      if (this.time - this.stateSince > C.searchSeconds)
        this.transition("RETURN", this.home);
      else if (!this.target || horizontal(this.position, this.target) < 0.8) {
        const anchor = this.lastSeen ?? this.lastHeard?.origin ?? this.position;
        const angle = this.rng() * Math.PI * 2,
          r = 1.5 + this.rng() * 2.5;
        this.target = {
          x: anchor.x + Math.sin(angle) * r,
          y: anchor.y,
          z: anchor.z + Math.cos(angle) * r,
        };
      }
    }
    if (
      this.state === "RETURN" &&
      (horizontal(this.position, this.home) < 1 ||
        this.time - this.stateSince > 12)
    ) {
      this.lastHeard = null;
      this.lastSeen = null;
      this.transition("IDLE", null);
      this.nextPatrol = this.time + 3;
    }
    if (this.state === "IDLE" && this.time >= this.nextPatrol) {
      const angle = this.rng() * Math.PI * 2;
      this.target = {
        x: this.home.x + Math.sin(angle) * 5,
        y: this.home.y,
        z: this.home.z + Math.cos(angle) * 5,
      };
      this.nextPatrol = this.time + 6;
    }
    if (this.target && this.time >= this.nextPlan) {
      const moved = horizontal(this.progress, this.position);
      this.stuck =
        moved < 0.15 && this.route.length > 0
          ? this.stuck + C.replanSeconds
          : 0;
      this.progress = { ...this.position };
      if (this.stuck >= C.stuckSeconds) {
        const waypoint = this.route[this.pathIndex];
        if (waypoint) this.avoid.add(this.navigation.cell(waypoint));
        this.log("stuck-replan");
        this.stuck = 0;
      }
      this.route =
        this.navigation.route(this.position, this.target, this.avoid) ?? [];
      this.pathIndex = 0;
      this.routeStatus = this.route.length ? "following" : "no-route";
      this.nextPlan = this.time + C.replanSeconds;
      if (!this.route.length && horizontal(this.position, this.target) > 1) {
        this.failures++;
        this.log("route-failed");
        if (this.failures >= 3) {
          this.avoid.clear();
          this.failures = 0;
          this.transition(this.state === "RETURN" ? "IDLE" : "SEARCH", null);
          this.nextPatrol = this.time + 3;
        }
      } else this.failures = 0;
    }
    if (this.avoid.size > 32) this.avoid.clear();
  }
  reset() {
    this.capturePending = false;
    this.facing = 0;
    this.visibility = "unchecked";
    this.speed = 0;
    this.pending.length = 0;
    this.lastHeard = null;
    this.lastSeen = null;
    this.route = [];
    this.target = null;
    this.pathIndex = 0;
    this.avoid.clear();
    this.failures = 0;
    this.stuck = 0;
    this.state = "IDLE";
    this.stateSince = this.time;
    this.accumulator = 0;
    this.lastVisibleAt = -Infinity;
    this.nextPlan = this.time;
    this.nextPatrol = this.time + 4;
    this.immunityUntil = this.time + C.immunitySeconds;
    this.reactionUntil = 0;
    this.pauseUntil = 0;
    this.motor.reset(this.home);
    this.progress = { ...this.home };
    this.routeStatus = "idle";
    this.log("reset");
  }
  debugText() {
    const h = this.lastHeard,
      t = this.target;
    return `\nHUNTER ${this.state} · captures ${this.captures} · ${this.immune ? "grace" : "active"}\nvision ${this.fieldOfView}deg / ${this.sightRange}m · facing ${(this.facing * 180 / Math.PI % 360).toFixed(0)}deg · ${this.visibility}\nheard ${h?.kind ?? "none"} · source distance ${h ? distance(this.position, h.origin).toFixed(1) : "-"}m\ntarget ${t ? `${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)}` : "none"}\nplayer ${this.playerDistance.toFixed(1)}m · path ${this.routeStatus} ${this.pathIndex}/${this.route.length}\nAI ${C.brainHz}Hz ${this.brainMs.toFixed(2)}ms max ${this.maxBrainMs.toFixed(2)}ms · path ${this.navigation.lastMs.toFixed(2)}ms #${this.navigation.searches}\n${this.logs
      .slice(-5)
      .map((e) => `${e.time}s ${e.event} ${e.kind ?? ""} ${e.to ?? ""}`)
      .join("\n")}`;
  }
  dispose() {
    this.unsubscribe();
    this.physics.beforeStep.delete(this.beforeStep);
    this.motor.dispose();
  }
}
