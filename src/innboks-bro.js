'use strict';
/* Broen til Innboks-fanen, og bare den.

   main.js legger denne på en webview bare når adressen har Innboksens opphav, og sjekker
   opphavet på nytt ved hvert kall, så en fane som har navigert bort, ikke kan bruke den. Fanen
   kjører i sandkasse, så her finnes bare electron, ingen andre moduler.

   Kontrakten er låst av Innboks (public/js/ui-innstillinger.js og app.js):
     status()       -> { koblet, enhetId }
     koble(svar)    -> { ok, enhetId } eller { ok: false, feil }
     frakoble()     -> { ok, enhetId }
     aapne(lenke)   -> { ok: true } eller { ok: false, feil } */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hmApp', {
  innboks: {
    status: () => ipcRenderer.invoke('innboks-bro:status'),
    koble: (svar) => ipcRenderer.invoke('innboks-bro:koble', svar),
    frakoble: () => ipcRenderer.invoke('innboks-bro:frakoble'),
    aapne: (lenke) => ipcRenderer.invoke('innboks-bro:aapne', lenke),
  },
});
