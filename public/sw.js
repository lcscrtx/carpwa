// Guarda os arquivos do painel para abrir sem internet.
// Mude VERSION a cada publicação para os celulares pegarem a versão nova.
const VERSION = 'v11';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'links.js',
  'spotify.js',
  'squircle.js',
  'youtube.js',
  'youtube-ui.js',
  'voice.js',
  'place.js',
  'assistant.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apps/waze.png',
  'icons/apps/maps.png',
  'icons/apps/gmaps.png',
  'icons/apps/music.png',
  'icons/apps/spotify.png',
  'icons/apps/ytmusic.png',
  'icons/apps/deezer.png',
  'icons/apps/phone.png',
  'icons/apps/messages.png',
  'icons/apps/home.png',
  'icons/apps/settings.png',
  'icons/apps/youtube.png',
  'icons/apps/whatsapp.png',
  'icons/apps/uber.png',
  'icons/apps/instagram.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro (pega atualizações); cache quando estiver sem internet.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
