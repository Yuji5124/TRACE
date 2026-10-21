export type Vec3 = [number, number, number];
export type Shape = "box" | "sphere" | "cylinder" | "cone";
export interface WorldObject {
  id: string;
  kind: string;
  shape: Shape;
  position: Vec3;
  scale: Vec3;
  color: string;
  rotation?: Vec3;
  collider: boolean;
  material?: "stone" | "wood" | "metal" | "glass" | "leaf" | "water";
}
export interface WorldDefinition {
  version: 1;
  seed: number;
  size: number;
  spawn: Vec3;
  objects: WorldObject[];
}
