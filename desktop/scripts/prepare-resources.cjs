const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const desktopDir = path.resolve(__dirname, "..");
const workspace = path.resolve(desktopDir, "..");
const source = path.join(workspace, "local-service");
const target = path.join(desktopDir, "resources", "local-service");

if (!existsSync(path.join(source, "dist", "index.js"))) {
  console.error("local-service/dist is missing; run npm run build in local-service first.");
  process.exit(1);
}
if (!existsSync(path.join(workspace, "webapp", "dist", "index.html"))) {
  console.error("webapp/dist is missing; run npm run build in webapp first.");
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of ["package.json", "package-lock.json"]) {
  cpSync(path.join(source, file), path.join(target, file));
}
cpSync(path.join(source, "dist"), path.join(target, "dist"), { recursive: true });
cpSync(path.join(source, "fixtures"), path.join(target, "fixtures"), { recursive: true });
const localEnv = path.join(source, ".env.local");
if (existsSync(localEnv)) {
  cpSync(localEnv, path.join(target, ".env.local"));
  require("node:fs").chmodSync(path.join(target, ".env.local"), 0o600);
  console.log("Bundled local OAuth configuration (not committed).");
}

console.log("Installing production backend dependencies for the desktop bundle…");
const result = spawnSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
  cwd: target,
  stdio: "inherit",
  env: process.env,
});
if (result.status !== 0) process.exit(result.status ?? 1);
