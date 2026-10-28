'use strict';

// Bump this version whenever any precached file changes; deploy the bundle together.
const VERSION = '2026-10-19-v3';
const PREFIX = 'miyan-pwa-' + encodeURIComponent(new URL(self.registration.scope).pathname) + '-';
const CACHE = PREFIX + VERSION;
const FILES = [
  'index.html', 'styles.css', 'app.js', 'bank-expanded.js', 'platform.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/apple-touch-icon.png', '安装与使用.html'
];
const URLS = FILES.map(file => new URL(file, self.registration.scope).href);
const INDEX = URLS[0];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
    // Deliberately wait for all old clients to close. Never skipWaiting mid-exam.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;
  const resource = url.href === self.registration.scope ? INDEX : url.href;
  if (!URLS.includes(resource)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Only serve explicitly cached application resources; preserve other page routes.
    // Never repair a missing asset from the network: that could mix releases.
    const cached = await cache.match(resource);
    return cached || new Response('离线资源缺失。请先保存记录，关闭所有应用窗口后联网重开并重试离线检查。', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'CHECK_OFFLINE' || !event.ports[0]) return;
  event.waitUntil((async () => {
    let ready = false;
    try {
      const cache = await caches.open(CACHE);
      const entries = await Promise.all(URLS.map(url => cache.match(url)));
      ready = entries.every(response => response && response.ok);
    } catch (_) {
      ready = false;
    }
    event.ports[0].postMessage({ type: 'OFFLINE_STATUS', version: VERSION, ready });
  })());
});
