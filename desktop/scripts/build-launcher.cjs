const { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

if (process.platform !== "darwin") {
  console.error("The quick launcher is macOS-only.");
  process.exit(1);
}
const desktopDir = path.resolve(__dirname, "..");
const workspace = path.resolve(desktopDir, "..");
const resources = path.join(desktopDir, "resources");
const packageVersion = require(path.join(desktopDir, "package.json")).version;
const service = path.join(resources, "local-service");
if (!existsSync(path.join(service, "dist", "index.js"))) {
  console.error("Run npm run prepare:resources first.");
  process.exit(1);
}

const arch = process.arch === "arm64" ? "arm64" : "x64";
const nodeVersion = "26.0.0";
const cache = path.join(desktopDir, ".cache");
const nodeDir = path.join(cache, `node-v${nodeVersion}-darwin-${arch}`);
const nodeBinary = path.join(nodeDir, "bin", "node");
if (!existsSync(nodeBinary)) {
  mkdirSync(cache, { recursive: true });
  const archive = path.join(cache, `node-v${nodeVersion}-darwin-${arch}.tar.gz`);
  const url = `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-darwin-${arch}.tar.gz`;
  console.log(`Downloading standalone Node ${nodeVersion} (${arch})…`);
  execFileSync("curl", ["-fsSL", url, "-o", archive], { stdio: "inherit" });
  execFileSync("tar", ["-xzf", archive, "-C", cache], { stdio: "inherit" });
}

const output = path.join(desktopDir, "release");
const app = path.join(output, `CoveLauncher-${packageVersion}-${arch}.app`);
rmSync(app, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const script = path.join(cache, "launcher.applescript");
writeFileSync(script, `on run
  set appPath to POSIX path of (path to me)
  if appPath starts with "/Volumes/" then
    display dialog "请先把 CoveLauncher 拖进 Applications，再推出 DMG。不要在 DMG 里直接运行。" buttons {"好"} default button 1 with title "Cove Launcher"
    return
  end if
  set nodePath to appPath & "Contents/Resources/runtime/node"
  set servicePath to appPath & "Contents/Resources/local-service/dist/index.js"
  set webappPath to appPath & "Contents/Resources/webapp"
  set homePath to POSIX path of (path to home folder)
  set dataPath to homePath & "Library/Application Support/CoveLauncher"
  set logPath to homePath & "Library/Logs/CoveLauncher.log"
  do shell script "mkdir -p " & quoted form of dataPath & " " & quoted form of (POSIX path of (path to home folder)) & "Library/Logs"
  try
    do shell script "/usr/bin/curl -fsS --max-time 2 http://127.0.0.1:4317/api/health >/dev/null 2>&1 || true"
    do shell script "COVE_PORT=4317 COVE_DATA_DIR=" & quoted form of dataPath & " COVE_STATIC_DIR=" & quoted form of webappPath & " COVE_DESKTOP=1 " & quoted form of nodePath & " " & quoted form of servicePath & " >> " & quoted form of logPath & " 2>&1 &"
    delay 2
    do shell script "/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:4317/api/health >/dev/null"
    open location "http://127.0.0.1:4317"
  on error errMsg number errNum
    display dialog "Cove 启动失败：" & return & errMsg & return & return & "日志：" & logPath buttons {"好"} default button 1 with title "Cove Launcher"
  end try
end run
`);
execFileSync("osacompile", ["-o", app, script], { stdio: "inherit" });
mkdirSync(path.join(app, "Contents", "Resources", "runtime"), { recursive: true });
cpSync(nodeBinary, path.join(app, "Contents", "Resources", "runtime", "node"));
chmodSync(path.join(app, "Contents", "Resources", "runtime", "node"), 0o755);
cpSync(service, path.join(app, "Contents", "Resources", "local-service"), { recursive: true });
cpSync(path.join(workspace, "webapp", "dist"), path.join(app, "Contents", "Resources", "webapp"), { recursive: true });
const archive = path.join(output, `CoveLauncher-${packageVersion}-${arch}.zip`);
rmSync(archive, { force: true });
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, archive], { stdio: "inherit" });
const dmg = path.join(output, `CoveLauncher-${packageVersion}-${arch}.dmg`);
rmSync(dmg, { force: true });
execFileSync("hdiutil", ["create", "-volname", "Cove", "-srcfolder", app, "-ov", "-format", "UDZO", dmg], { stdio: "inherit" });
console.log(`Built ${app}`);
console.log(`Built ${archive}`);
console.log(`Built ${dmg}`);
