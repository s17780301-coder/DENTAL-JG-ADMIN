/* DENTAL JG 10.8.40 — invalidación explícita de cachés antiguas */
const CACHE='dental-jg-1.0.7';
const ASSETS=['./','./index.html','./styles.css','./app.js','./config.js','./logo-dental-jg.png','./logo-dental-jg.svg','./icon-192.png','./icon-512.png','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.filter(Boolean)).catch(()=>{})).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const req=event.request; const url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 // HTML y código siempre intentan red primero; evita servir app.js/index.html viejos.
 const critical=/\.(?:html|js|css|json|webmanifest)$/.test(url.pathname)||url.pathname.endsWith('/');
 if(critical){event.respondWith(fetch(req,{cache:'no-store'}).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return response;}).catch(()=>caches.match(req).then(hit=>hit||caches.match('./index.html'))));return;}
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return response;})));
});
