const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let mainWindow = null;
let serverProcess = null;

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

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
