import { contextBridge, ipcRenderer } from "electron";
import type { Bridge, Event } from "../shared/ipc";
const bridge: Bridge = {
  call: (name, input) => ipcRenderer.invoke("studio:" + name, input),
  onEvent: (fn) => {
    const handler = (_: unknown, event: Event) => fn(event);
    ipcRenderer.on("studio:event", handler);
    return () => ipcRenderer.removeListener("studio:event", handler);
  },
};
contextBridge.exposeInMainWorld("studio", bridge);
