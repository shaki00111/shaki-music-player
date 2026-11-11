const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const https = require("https");
const http = require("http");

const AUDIO_EXT = new Set([".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wma"]);
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1050, minHeight: 680,
    backgroundColor: "#09090d",
    title: "SHAKI MUSIC",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  if (app.isPackaged) win.loadFile(path.join(__dirname, "../dist/index.html"));
  else win.loadURL("http://127.0.0.1:5173");
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

function walk(dir, out = [], depth = 0) {
  if (depth > 5 || out.length > 2500) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!["System Volume Information", "$RECYCLE.BIN", "Windows", "Program Files", "node_modules"].includes(e.name)) walk(full, out, depth + 1);
    } else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
      try {
        const s = fs.statSync(full);
        out.push({ id: full, title: path.basename(full, path.extname(full)), artist: "فایل محلی", album: path.basename(path.dirname(full)), path: full, size: s.size, url: pathToFileURL(full).href });
      } catch {}
    }
  }
  return out;
}


function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "SHAKI-MUSIC/1.0", "Accept": "application/json" } }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => body += chunk);
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error("HTTP " + response.statusCode));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

ipcMain.handle("search:archive", async (_, query) => {
  const q = String(query || "").trim().slice(0, 160);
  if (!q) return [];
  const endpoint = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent(q + " AND mediatype:audio") +
    "&fl[]=identifier,title,creator,year&rows=24&page=1&output=json";
  const data = await getJson(endpoint);
  const docs = data.response?.docs || [];
  const results = await Promise.all(docs.map(async d => {
    try {
      const meta = await getJson("https://archive.org/metadata/" + encodeURIComponent(d.identifier));
      const audioFile = (meta.files || []).find(f =>
        /\.(mp3|ogg|flac|m4a|wav|aac)$/i.test(f.name || "") && f.size && !f.source && !f.name.includes("/")
      );
      if (!audioFile) return null;
      return {
        id: "ia-" + d.identifier,
        title: d.title || d.identifier,
        artist: Array.isArray(d.creator) ? d.creator[0] : (d.creator || "Internet Archive"),
        album: d.year ? String(d.year) : "Internet Archive",
        url: "https://archive.org/download/" + encodeURIComponent(d.identifier) + "/" + encodeURIComponent(audioFile.name),
        source: "Internet Archive",
        pageUrl: "https://archive.org/details/" + encodeURIComponent(d.identifier),
        cover: "https://picsum.photos/seed/" + encodeURIComponent(d.identifier) + "/600/600",
        canDownload: true
      };
    } catch { return null; }
  }));
  return results.filter(Boolean);
});

ipcMain.handle("library:pick", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return [];
  return walk(r.filePaths[0]);
});

ipcMain.handle("library:scan", async (_, folders) => {
  const all = [];
  for (const folder of (Array.isArray(folders) ? folders : [])) walk(folder, all);
  return all;
});

ipcMain.handle("folder:choose", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("download:audio", async (_, { url, filename }) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("آدرس دانلود معتبر نیست.");
  const safe = String(filename || "audio.mp3").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 150);
  const r = await dialog.showSaveDialog(win, { defaultPath: safe });
  if (r.canceled || !r.filePath) return { canceled: true };
  await new Promise((resolve, reject) => {
    const request = (url.startsWith("https:") ? https : http).get(url, { headers: { "User-Agent": "SHAKI-MUSIC/1.0" } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadRedirect(response.headers.location, r.filePath, resolve, reject);
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error("سرور فایل را ارائه نکرد.")); return; }
      const stream = fs.createWriteStream(r.filePath);
      response.pipe(stream);
      stream.on("finish", () => stream.close(resolve));
      stream.on("error", reject);
    });
    request.on("error", reject);
  });
  return { canceled: false, path: r.filePath };
});

function downloadRedirect(url, dest, resolve, reject) {
  const lib = url.startsWith("https:") ? https : http;
  const req = lib.get(url, response => {
    if (response.statusCode !== 200) { response.resume(); reject(new Error("دانلود ناموفق بود.")); return; }
    const stream = fs.createWriteStream(dest);
    response.pipe(stream);
    stream.on("finish", () => stream.close(resolve));
    stream.on("error", reject);
  });
  req.on("error", reject);
}

ipcMain.handle("external:open", async (_, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) await shell.openExternal(url);
  return true;
});
