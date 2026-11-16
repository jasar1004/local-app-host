const CACHE='local-app-host-shell-v3';
const LEGACY_CACHES=['local-app-host-shell-v1','local-app-host-shell-v2'];
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE)
    .then(cache=>cache.addAll(SHELL))
    .then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all(LEGACY_CACHES.map(name=>caches.delete(name)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  event.respondWith((async()=>{
    try{
      const response=await fetch(req);
      if(response.ok){
        const cache=await caches.open(CACHE);
        await cache.put(req,response.clone());
      }
      return response;
    }catch(error){
      const cached=await caches.match(req);
      if(cached)return cached;
      if(req.mode==='navigate'){
        const shell=await caches.match('./index.html');
        if(shell)return shell;
      }
      throw error;
    }
  })());
});
