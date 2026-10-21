export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function parseSeed(raw: string | null): number {
  const n = raw === null ? 104729 : Number(raw);
  return Number.isFinite(n) ? n >>> 0 : 104729;
}
// Flat circulation routes, gentle planted mounds. 1 unit = 1 metre.
export function terrainHeight(x: number, z: number): number {
  if (
    Math.abs(x) > 38 ||
    Math.abs(z) > 38 ||
    Math.abs(x) < 4 ||
    Math.abs(z) < 4
  )
    return 0;
  const mound = (cx: number, cz: number, h: number, s: number) =>
    h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);
  const edge = Math.min(
    1,
    (38 - Math.abs(x)) / 5,
    (38 - Math.abs(z)) / 5,
    (Math.abs(x) - 4) / 5,
    (Math.abs(z) - 4) / 5,
  );
  return (
    Math.max(0, edge) * (mound(-25, -25, 1.6, 100) + mound(25, 26, 1.1, 110))
  );
}
