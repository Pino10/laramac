import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Events, LaramacApi } from '../shared/types'

const api: LaramacApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: <K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) => {
    const handler = (_: unknown, payload: Events[K]): void => cb(payload)
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  },
  platform: process.platform,
  pathsOf: (files) => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean)
}

contextBridge.exposeInMainWorld('laramac', api)
