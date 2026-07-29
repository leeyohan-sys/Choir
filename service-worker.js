/* eslint-disable no-restricted-globals */
const CACHE_NAME = "choir-part-cache-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./main.js",
  "./styles.css",
  "./mapping.json",
  "./manifest.json",
  "./icon-192.svg",
  "./icon-512.svg"
];

self.addEventListener("install", (event) => {
  // 설치 단계에서 핵심 리소스를 캐싱
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {
        // 일부 리소스 실패가 있어도 앱 동작은 우선되도록 무시
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve();
        })
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy).catch(() => {});
          });
          return networkResponse;
        })
        .catch(() => {
          // 네트워크 실패 시 기본 페이지를 fallback
          return caches.match("./index.html");
        });
    })
  );
});

