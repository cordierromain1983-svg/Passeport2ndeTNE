/* Appli « Mon passeport » : fonctionne hors connexion pour consulter son passeport.
   La page est toujours prise sur internet quand c'est possible (badges à jour), sinon dans le cache. */
const CACHE_NAME = "passeport-2tne1-appli-v2";
const APP_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Polices Google : servies depuis le cache, mises à jour en arrière-plan
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(CACHE_NAME).then((cache) => cache.match(req).then((cached) => {
      const reseau = fetch(req).then((rep) => { if (rep.ok || rep.type === "opaque") cache.put(req, rep.clone()); return rep; }).catch(() => cached);
      return cached || reseau;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/audio/")) return; // les enregistrements se lisent en ligne
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
