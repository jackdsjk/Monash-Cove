const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

let service = null;
let mainWindow = null;
let quitting = false;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function getPaths() {
  if (app.isPackaged) {
    return {
      serviceDir: path.join(process.resourcesPath, "local-service"),
      webappDir: path.join(process.resourcesPath, "webapp"),
    };
  }
  return {
    serviceDir: path.resolve(__dirname, "../local-service"),
    webappDir: path.resolve(__dirname, "../webapp/dist"),
  };
}

function waitForHealth(port, child) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let settled = false;
    const tick = () => {
      if (settled) return;
      if (child.exitCode !== null) {
        settled = true;
        reject(new Error(`Local service exited with code ${child.exitCode}.`));
        return;
      }
      attempts += 1;
      const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          settled = true;
          resolve();
        } else {
          retry();
        }
      });
      request.on("error", retry);
      request.setTimeout(700, () => request.destroy());
    };
    const retry = () => {
      if (settled) return;
      if (attempts >= 100) {
        settled = true;
        reject(new Error("Local service did not become ready."));
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}

async function startService() {
  const requestedPort = process.env.COVE_PORT === undefined ? 4317 : Number(process.env.COVE_PORT);
  const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : await getFreePort();
  const paths = getPaths();
  const dataDir = app.getPath("userData");
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    COVE_DESKTOP: "1",
    COVE_PORT: String(port),
    COVE_DATA_DIR: dataDir,
    COVE_SECRET_FILE: path.join(dataDir, "secrets.json"),
    COVE_STATIC_DIR: paths.webappDir,
  };
  const child = spawn(process.execPath, [path.join(paths.serviceDir, "dist/index.js")], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => console.log(`[service] ${chunk}`));
  child.stderr.on("data", (chunk) => console.error(`[service] ${chunk}`));
  child.on("exit", (code, signal) => {
    if (!quitting) {
      console.error(`Cove local service stopped: code=${code} signal=${signal}`);
      dialog.showErrorBox("Cove 本地服务已停止", "请重新打开 Cove；如果问题持续存在，请查看日志。");
      app.quit();
    }
  });
  await waitForHealth(port, child);
  return { child, port };
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: "Cove",
    backgroundColor: "#f5f5f5",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  if (process.env.COVE_DEVTOOLS === "1") mainWindow.webContents.openDevTools({ mode: "detach" });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function boot() {
  try {
    const { child, port } = await startService();
    service = child;
    createWindow(port);
  } catch (error) {
    console.error(error);
    dialog.showErrorBox("Cove 启动失败", error instanceof Error ? error.message : String(error));
    app.quit();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    app.setAppUserModelId("com.cove.local");
    if (process.platform !== "darwin") Menu.setApplicationMenu(null);
    void boot();
    app.on("activate", () => {
      if (mainWindow) mainWindow.focus();
    });
  });
}

app.on("before-quit", () => {
  quitting = true;
  if (service && service.exitCode === null) service.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
