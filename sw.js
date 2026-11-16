const CACHE='local-app-host-shell-v7';
const LEGACY_CACHES=['local-app-host-shell-v1','local-app-host-shell-v2','local-app-host-shell-v3','local-app-host-shell-v4','local-app-host-shell-v5','local-app-host-shell-v6'];
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

self.addEventListener('push',event=>{
  let message={};
  try{message=event.data?event.data.json():{}}catch{}
  const appName=String(message.appName||'Local App Host').slice(0,80);
  const title=String(message.title||'Reminder').slice(0,120);
  const body=String(message.body||'').slice(0,300);
  const tag=`local-app-host:${message.appId||'app'}:${message.reminderId||Date.now()}`;
  const target=new URL('./',self.registration.scope);
  if(message.appId)target.searchParams.set('openApp',message.appId);
  event.waitUntil(self.registration.showNotification(title,{body:body?`${appName}: ${body}`:appName,icon:new URL('./icon.svg',self.registration.scope).href,badge:new URL('./icon.svg',self.registration.scope).href,tag,data:{url:target.href}}));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||new URL('./',self.registration.scope).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin===self.location.origin){await client.navigate(target);return client.focus()}
    }
    return self.clients.openWindow(target);
  })());
});
