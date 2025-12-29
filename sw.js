const CACHE_VERSION = 'traveltalk-v1.0.0';
const CACHE_NAME = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// App Shell - 需要預快取的資源
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// CDN 資源 patterns
const CDN_PATTERNS = [
  /^https:\/\/cdn\.tailwindcss\.com\//,
  /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\//,
  /^https:\/\/fonts\.googleapis\.com\//,
  /^https:\/\/fonts\.gstatic\.com\//
];

// Google Analytics patterns
const ANALYTICS_PATTERNS = [
  /^https:\/\/www\.google-analytics\.com\//,
  /^https:\/\/www\.googletagmanager\.com\//
];

// === 安裝階段：預快取 App Shell ===
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching App Shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// === 激活階段：清理舊快取 ===
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('traveltalk-') && name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// === Fetch 策略 ===
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1. Google Analytics: Network Only
  if (ANALYTICS_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(fetch(request).catch(() => new Response()));
    return;
  }

  // 2. HTML: Network First
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 3. CDN 資源: Stale-While-Revalidate
  if (CDN_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 4. 本地資源: Cache First
  if (new URL(request.url).origin === location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 5. 其他: Network First
  event.respondWith(networkFirst(request));
});

// Network First 策略
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response('Offline', { status: 503 });
  }
}

// Cache First 策略
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Resource not available', { status: 503 });
  }
}

// Stale-While-Revalidate 策略
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// 接收訊息（用於更新）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
