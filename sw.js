/* English Master AI — service worker
   IMPORTANT: change VERSION every time you upload a new index.html,
   so installed apps pick up the update. */
const VERSION = 'ema-v1';
const APP_CACHE = VERSION + '-app';
const RUNTIME_CACHE = VERSION + '-runtime';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];
// GET APIs whose answers never change -> safe to keep for offline use
const CACHEABLE_APIS = ['api.dictionaryapi.dev', 'api.mymemory.translated.net'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function timeout(ms){ return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(request){
  const cache = await caches.open(APP_CACHE);
  try{
    const res = await Promise.race([fetch(request), timeout(4000)]);
    if(res && res.ok) cache.put('./index.html', res.clone());
    return res;
  }catch(e){
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}
async function cacheFirst(request, cacheName){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if(hit) return hit;
  const res = await fetch(request);
  if(res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}
async function staleWhileRevalidate(request, cacheName){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const net = fetch(request).then(res => { if(res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;                       // Gemini / backend POSTs go straight to the network
  const url = new URL(req.url);

  if(req.mode === 'navigate'){ event.respondWith(networkFirst(req)); return; }
  if(url.origin === self.location.origin){
    if(url.pathname.endsWith('/sw.js')) return;
    event.respondWith(staleWhileRevalidate(req, APP_CACHE)); return;
  }
  if(FONT_HOSTS.includes(url.hostname)){ event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE)); return; }
  if(CACHEABLE_APIS.includes(url.hostname)){ event.respondWith(cacheFirst(req, RUNTIME_CACHE).catch(() => Response.error())); return; }
});
