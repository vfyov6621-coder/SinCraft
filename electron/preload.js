// ==========================================
// Electron Preload Script
// ==========================================
// Exposes a safe, minimal IPC bridge from main → renderer
// using contextBridge so the renderer has no direct Node access.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  isElectron: true,
  platform: process.platform,

  // Tailscale IPC
  tailscale: {
    isInstalled: () => ipcRenderer.invoke('tailscale:is-installed'),
    getStatus: () => ipcRenderer.invoke('tailscale:status'),
    getIP: () => ipcRenderer.invoke('tailscale:get-ip'),
    getPeers: () => ipcRenderer.invoke('tailscale:get-peers'),
  },

  // Game Server IPC
  server: {
    start: (port) => ipcRenderer.invoke('server:start', port),
    stop: () => ipcRenderer.invoke('server:stop'),
    getStatus: () => ipcRenderer.invoke('server:get-status'),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
});
