const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("shaki", {
  pickMusicFolder: () => ipcRenderer.invoke("library:pick"),
  searchArchive: query => ipcRenderer.invoke("search:archive", query),
  scanFolders: folders => ipcRenderer.invoke("library:scan", folders),
  chooseFolder: () => ipcRenderer.invoke("folder:choose"),
  downloadAudio: data => ipcRenderer.invoke("download:audio", data),
  openExternal: url => ipcRenderer.invoke("external:open", url)
});