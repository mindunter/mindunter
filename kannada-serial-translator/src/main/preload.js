'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  testKeys: () => ipcRenderer.invoke('keys:test'),
  transcribe: (wav, withTimestamps) => ipcRenderer.invoke('stt:transcribe', { wav, withTimestamps }),
  translate: (lines, context, live) => ipcRenderer.invoke('translate:lines', { lines, context, live }),
  speak: (text, gender) => ipcRenderer.invoke('tts:speak', { text, gender }),
  openMedia: () => ipcRenderer.invoke('file:open-media'),
  openPath: (p) => ipcRenderer.invoke('file:open-path', p),
  pathForFile: (file) => webUtils.getPathForFile(file),
  relinkMedia: (p) => ipcRenderer.invoke('file:relink', p),
  decodeAudio: (p) => ipcRenderer.invoke('file:decode-audio', p),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  reveal: (p) => ipcRenderer.invoke('file:reveal', p),
  saveProject: (p) => ipcRenderer.invoke('project:save', p),
  saveProjectNow: (p) => ipcRenderer.sendSync('project:save-sync', p),
  listProjects: () => ipcRenderer.invoke('project:list'),
  loadProject: (id) => ipcRenderer.invoke('project:load', id),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  ensureMic: () => ipcRenderer.invoke('mic:ensure'),
  appInfo: () => ipcRenderer.invoke('app:info'),
});
