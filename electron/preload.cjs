const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("masaustu", {
  httpPost: (url, body) => ipcRenderer.invoke("http-post", url, body),
});
