const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let serverProcess = null;

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

// Configure autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function isServerRunning(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      })
      .on("error", () => {
        resolve(false);
      });
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const running = await isServerRunning(url);
    if (running) return true;
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

function startNextServer() {
  const isDev = process.env.NODE_ENV !== "production";
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const script = isDev ? "dev" : "start";

  serverProcess = spawn(npmCmd, ["run", script], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    shell: true,
  });

  serverProcess.on("error", (err) => {
    console.error("Failed to start local Next.js server:", err);
  });
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
  }, 5000);
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

  // Ensure server is up
  const serverAlreadyRunning = await isServerRunning(SERVER_URL);
  if (!serverAlreadyRunning) {
    startNextServer();
    await waitForServer(SERVER_URL);
  }

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  setupAutoUpdater();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
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
