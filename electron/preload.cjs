const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("shaki", {
  getLibrary: () => ipcRenderer.invoke("library:get"),
  addMusicFolder: () => ipcRenderer.invoke("library:addFolder"),
  rescanLibrary: () => ipcRenderer.invoke("library:rescan"),
  chooseMusicFiles: () => ipcRenderer.invoke("library:chooseFiles"),
  addFilesFromPaths: paths => ipcRenderer.invoke("library:paths", paths),
  searchArchive: query => ipcRenderer.invoke("search:archive", query),
  downloadAudio: data => ipcRenderer.invoke("download:audio", data),
  openExternal: url => ipcRenderer.invoke("external:open", url),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized")
});