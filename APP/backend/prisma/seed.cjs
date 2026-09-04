/**
 * prisma/seed.cjs — the single entry `npx prisma db seed` invokes.
 *
 * Plain CommonJS on purpose: it is the ONE thing a CI/CD pipeline runs, so it must
 * start with nothing but `node`, in either kind of image:
 *
 *   • dev / full install  → `tsx` is present, so the TypeScript sources run
 *     directly (always current, no build step required).
 *   • production image    → no dev dependencies, but `npm run build` has emitted
 *     dist/prisma/seed.js (tsconfig already compiles prisma/**), so the compiled
 *     seed runs instead.
 *
 * Fails loudly with an actionable message when neither is available, rather than
 * a bare module-not-found.
 */
const path = require("node:path");
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const compiled = path.join(__dirname, "..", "dist", "prisma", "seed.js");

let tsxCli = null;
try {
  // The tsx CLI, not the `tsx/cjs` require-hook: the app loads its routes through
  // dynamic ESM `import()`, which only the full CLI (CJS + ESM loaders + tsconfig
  // path mapping) resolves.
  tsxCli = require.resolve("tsx/cli");
} catch {
  tsxCli = null;
}

if (tsxCli) {
  const run = spawnSync(process.execPath, [tsxCli, path.join(__dirname, "seed.ts")], { stdio: "inherit" });
  process.exit(run.status ?? 1);
} else if (existsSync(compiled)) {
  require(compiled);
} else {
  console.error(
    "[seed] cannot start: `tsx` is not installed and dist/prisma/seed.js is missing.\n" +
      "       Install dev dependencies, or run `npm run build` before `npx prisma db seed`.",
  );
  process.exit(1);
}
