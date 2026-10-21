# Phase 1 changed files

Original `README.md` retained and extended. No deletions.

| Paths | Purpose |
|---|---|
| `src/world/types.ts`, `random.ts`, `generate.ts` | Versioned, seeded map data and human-scale park/town generation |
| `src/render/world.ts` | Instanced background, original textures/signs, independent BVH terrain query |
| `src/physics/world.ts` | Rapier static proxies, terrain, boundary and capsule movement |
| `src/player/input.ts` | Desktop/touch input, pause/blur handling |
| `src/diagnostics/performance.ts` | Runtime rendering/CPU statistics |
| `src/main.ts`, `src/style.css`, `index.html` | App shell, lighting, modes, credits, HUD and lifecycle |
| `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore` | Reproducible toolchain and build |
| `tests/world.test.ts`, `tests/playtest.mjs` | Determinism, collision, mode parity, keyboard and layout verification |
| `public/THIRD_PARTY_NOTICES.txt`, `public/licenses/*` | Sources and full redistribution notices |
| `docs/PHASE1.md` | Initial inspection, implementation plan, architecture and compatibility audit |
| `docs/VALIDATION.md`, `docs/browser-results.json`, `docs/screenshots/*` | Verification results and visual evidence |
| `README.md` | Setup, controls, seed and test instructions |
| `.github/workflows/ci.yml` | Build and physics tests on push/PR |
