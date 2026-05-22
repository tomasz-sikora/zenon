import {
  app,
  BrowserWindow,
  protocol,
  session,
  shell,
} from "electron";
import path from "path";
import { autoUpdater } from "electron-updater";

// ─── Custom protocol registration ─────────────────────────────────────────────
// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: "zenon",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// ─── Globals ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged;
const WEB_DIST = isDev
  ? null // In dev mode, we load from the Vite dev server
  : path.join(__dirname, "..", "web");

// ─── Deep link handling ───────────────────────────────────────────────────────

function getRouteFromUrl(url: string): string {
  // zenon://chat/abc → /chat/abc
  // web+zenon://chat/abc → /chat/abc
  const cleaned = url
    .replace(/^zenon:\/\//, "/")
    .replace(/^web\+zenon:\/\//, "/");
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

function handleDeepLink(url: string): void {
  const route = getRouteFromUrl(url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    if (isDev) {
      mainWindow.loadURL(`http://localhost:5173${route}`);
    } else {
      // Navigate within the SPA by loading the index with a hash/path
      mainWindow.webContents.executeJavaScript(
        `window.location.hash = ''; window.history.pushState({}, '', '${route}'); window.dispatchEvent(new PopStateEvent('popstate'));`
      );
    }
  }
}

// ─── Single instance lock ─────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // On Windows/Linux, protocol URLs come via command line args
    const url = commandLine.find(
      (arg) => arg.startsWith("zenon://") || arg.startsWith("web+zenon://")
    );
    if (url) {
      handleDeepLink(url);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Window creation ──────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Zenon",
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webgl: true,
    },
  });

  // ─── COOP/COEP headers for SharedArrayBuffer ─────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};

    // Set COOP/COEP on all responses from our app
    headers["Cross-Origin-Opener-Policy"] = ["same-origin"];
    headers["Cross-Origin-Embedder-Policy"] = ["require-corp"];

    callback({ responseHeaders: headers });
  });

  // ─── Handle zenon:// protocol requests ────────────────────────────────────
  protocol.handle("zenon", (request) => {
    const route = getRouteFromUrl(request.url);
    handleDeepLink(route);
    return new Response(null, { status: 302 });
  });

  // ─── Open external links in system browser ────────────────────────────────
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // ─── Load the app ─────────────────────────────────────────────────────────
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(WEB_DIST!, "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  // Check for updates in production
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // Silently ignore update check errors
    });
  }

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// macOS: handle protocol URLs via open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on("window-all-closed", () => {
  // On macOS, apps typically stay open until Cmd+Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// ─── Chromium flags for WebGPU ────────────────────────────────────────────────
// These ensure WebGPU works on all platforms
app.commandLine.appendSwitch("enable-features", "Vulkan");
app.commandLine.appendSwitch("enable-unsafe-webgpu");
