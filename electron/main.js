const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const { autoUpdater } = require("electron-updater");

// Use overlay scrollbars (thin, modern) in Electron's Chromium
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar");
app.commandLine.appendSwitch("enable-blink-features", "OverlayScrollbars");

let mainWindow = null;
let httpServer = null;

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

// Configure autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function isServerRunning(url) {
  return new Promise((resolve) => {
    const req = http
      .get(url, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      })
      .on("error", () => {
        resolve(false);
      });
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startServer() {
  const running = await isServerRunning(SERVER_URL);
  if (running) {
    console.log(`Using existing server at ${SERVER_URL}`);
    return;
  }

  const rootDir = app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..");

  console.log(`Starting embedded Next.js server from: ${rootDir}`);

  // Load .env if present
  try {
    const dotenv = require("dotenv");
    dotenv.config({ path: path.join(rootDir, ".env") });
  } catch {}

  try {
    const next = require("next");
    const nextApp = next({ dev: false, dir: rootDir });
    const handle = nextApp.getRequestHandler();
    await nextApp.prepare();

    httpServer = http.createServer((req, res) => handle(req, res));
    await new Promise((resolve, reject) => {
      httpServer.listen(PORT, "localhost", (err) => {
        if (err) return reject(err);
        console.log(`SayWith server ready on ${SERVER_URL}`);
        resolve();
      });
    });
  } catch (err) {
    console.error("Embedded Next.js server error:", err);
    // Development fallback
    if (!app.isPackaged) {
      const { spawn } = require("child_process");
      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      spawn(npmCmd, ["run", "dev"], {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
      });
      for (let i = 0; i < 20; i++) {
        if (await isServerRunning(SERVER_URL)) break;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }
}

function setupAutoUpdater() {
  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-available", info);
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("Update not available:", info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-not-available", info);
    }
  });

  autoUpdater.on("download-progress", (progressObj) => {
    console.log(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-progress", progressObj);
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("Update downloaded:", info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-downloaded", info);
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto updater error:", err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-error", err ? err.message : "Update check failed");
    }
  });

  // Check for updates shortly after launch (in production)
  setTimeout(() => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn("Auto update check failed:", err.message);
      });
    }
  }, 4000);
}

// IPC Handlers for Auto-Update
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged) {
    return { status: "dev", message: "Auto-updater is active in packaged app." };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: "ok", updateInfo: result ? result.updateInfo : null };
  } catch (err) {
    return { status: "error", error: err.message };
  }
});

ipcMain.handle("restart-and-install", () => {
  autoUpdater.quitAndInstall();
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#121212",
    title: "SayWith Studio",
    show: false, // Smooth launch: reveal window once content is ready
    icon: path.join(__dirname, "..", "public", "icons", "icon-512x512.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Start internal server if needed
  try {
    await startServer();
  } catch (err) {
    console.error("Server init error:", err);
  }

  // Load the app URL
  await mainWindow.loadURL(SERVER_URL);
  mainWindow.show();

  setupAutoUpdater();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (httpServer) {
    try {
      httpServer.close();
    } catch {}
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
