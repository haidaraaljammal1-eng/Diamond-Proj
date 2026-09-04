// Copies non-TypeScript runtime assets (fonts, etc.) from src into the compiled
// dist tree, since `tsc` only emits .js. Keeps runtime __dirname-relative asset
// resolution working after `npm run build`. Cross-platform (no shell `cp`).
const { cpSync, mkdirSync, existsSync } = require("node:fs");
const path = require("node:path");

const ASSET_DIRS = [
  // [from, to]
  ["src/modules/reports/assets", "dist/src/modules/reports/assets"],
];

for (const [from, to] of ASSET_DIRS) {
  if (!existsSync(from)) continue;
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`Copied ${from} -> ${to}`);
}
