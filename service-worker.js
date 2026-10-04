const CACHE='furusato-manager-20261004-v43';
const STATIC_ASSETS=['./style.css','./calculator.js','./data-model.js','./integration.js','./manifest.json'];
const NETWORK_FIRST=['./','./index.html','./details.html','./donations.html','./settings.html','./app.js','./service-worker.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request; if(req.method!=='GET')return;
 const url=new URL(req.url); if(url.origin!==location.origin)return;
 const path=url.pathname.split('/').pop()||'index.html';
 const networkFirst=NETWORK_FIRST.some(x=>x.endsWith('/'+path)||x==='./'+path||x===path);
 if(networkFirst){
  event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{if(res.ok&&path!=='service-worker.js'){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}return res;}).catch(()=>caches.match(req)));
  return;
 }
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});return res;})));
});
