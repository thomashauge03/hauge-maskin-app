const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hm', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  pickImage: () => ipcRenderer.invoke('image:pick'),
  syncShared: () => ipcRenderer.invoke('shared:sync'),
  listLogins: () => ipcRenderer.invoke('login:list'),
  setLogin: (payload) => ipcRenderer.invoke('login:set', payload),
  setSharedLogin: (payload) => ipcRenderer.invoke('login:setShared', payload),
  clearLogin: (id) => ipcRenderer.invoke('login:clear', id),
  fillLogin: (payload) => ipcRenderer.invoke('login:fill', payload),

  adminStatus: () => ipcRenderer.invoke('admin:status'),
  setAdminToken: (token) => ipcRenderer.invoke('admin:setToken', token),
  publishShared: (payload) => ipcRenderer.invoke('shared:publish', payload),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  onWindowState: (cb) => ipcRenderer.on('window:state', (_e, s) => cb(s)),

  appVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (cb) => {
    ipcRenderer.on('update:available', (_e, d) => cb('available', d));
    ipcRenderer.on('update:progress', (_e, d) => cb('progress', d));
    ipcRenderer.on('update:ready', (_e, d) => cb('ready', d));
    ipcRenderer.on('update:error', (_e, d) => cb('error', d));
  }
});
