'use strict';
/* Broen til adminbordet, og bare det.

   main.js legger denne på en webview bare når adressen har adminbordets opphav, og sjekker
   opphavet på nytt ved hvert kall. Fanen kjører i sandkasse, så her finnes bare electron.

   Adminbordet viser Hurtighjelp-knappen bare når window.hmApp.hurtighjelp finnes, altså bare
   inne i appen. I en vanlig nettleser kan ingen side starte programmer på PC-en.
     hurtighjelp.start() -> 'app' | 'gammel' | 'butikk', eller { ok: false, feil } */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hmApp', {
  hurtighjelp: {
    start: () => ipcRenderer.invoke('adminbord-bro:hurtighjelp'),
  },
});
