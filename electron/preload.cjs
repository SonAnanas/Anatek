const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("masaustu", {
  httpPost: (url, body) => ipcRenderer.invoke("http-post", url, body),
  quit: () => ipcRenderer.invoke("quit"),
  updateStart: (repo) => ipcRenderer.invoke("update:start", repo),
  updateCancel: () => ipcRenderer.invoke("update:cancel"),
  onUpdateProgress: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on("update:progress", h); return () => ipcRenderer.removeListener("update:progress", h); },
});
