/* Minuteur Totoro — service worker
 * Rôles :
 *  1. Cache de l'app shell (fonctionnement hors-ligne).
 *  2. Minuteur d'arrière-plan : tant qu'un minuteur est actif, le worker
 *     tient un Web Lock et reste vivant ; à l'heure de fin il affiche une
 *     notification (son + vibration), même si la page est en fond ou fermée.
 */
'use strict';

const CACHE = 'totoro-cache-v1';
const TAG = 'totoro-timer';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './sound/chime.wav'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations : réseau d'abord (mises à jour), cache en secours (hors-ligne).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets : cache d'abord, complété par le réseau.
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});

/* ------------------------------------------------------------------ */
/* Minuteur d'arrière-plan                                            */
/* ------------------------------------------------------------------ */

let aborter = null;

function cancelTimer() {
  if (aborter) {
    aborter.abort();
    aborter = null;
  }
}

async function closeNotifs() {
  try {
    const ns = await self.registration.getNotifications({ tag: TAG });
    ns.forEach((n) => n.close());
  } catch (e) { /* notification API indisponible */ }
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal && signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/* Minuter l'heure de fin en tenant un Web Lock : le worker n'est pas
 * suspendu tant que le lock est détenu. On attend par tranches de 20 s
 * pour rester « actif » et suivre l'heure.
 *
 * Forme à deux arguments request(name, cb) : compatible avec les moteurs
 * modernes (les options {signal} sont facultatives) et les anciens.
 * L'annulation (pause/reset) est gérée par la boucle via signal.aborted.
 */
async function schedule(endAt) {
  cancelTimer();
  aborter = new AbortController();
  const { signal } = aborter;

  const cb = async () => {
    for (;;) {
      if (signal.aborted) break;          // annulation (pause/reset)
      const left = endAt - Date.now();
      if (left <= 0) break;
      await wait(Math.min(left, 20000), signal);
    }
  };

  try {
    await navigator.locks.request('totoro-timer', cb);
  } catch (e) {
    return; // annulé avant même l'acquisition du lock
  }
  if (signal.aborted) return;

  // Signaler la fin aux pages ouvertes (synchronisation, tests).
  try {
    const cs = await self.clients.matchAll();
    cs.forEach((c) => c.postMessage({ type: 'TIMER_FIRED', endAt }));
  } catch (_) {}

  // Petite trêve : en premier plan, la page annonce elle-même la fin
  // (scène + mélodie) et envoie CANCEL ; on lui laisse 120 ms pour
  // éviter une notification redondante. En arrière-plan ou écran éteint
  // aucun CANCEL n'arrive et 120 ms sont imperceptibles.
  await wait(120, signal);
  if (signal.aborted) return;

  try {
    await self.registration.showNotification("C'est l'heure ! 🚌", {
      body: 'Le chat-bus est arrivé, Totoro est content.',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-192.png',
      sound: 'sound/chime.wav',
      vibrate: [200, 100, 200, 100, 400],
      tag: TAG,
      renotify: true,
      silent: false,
      data: { url: './' }
    });
  } catch (e) { /* permission refusée ou worker suspendu */ }
}

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'SCHEDULE' && typeof d.endAt === 'number' && d.endAt > Date.now()) {
    schedule(d.endAt);
  } else if (d.type === 'CANCEL') {
    cancelTimer();
    closeNotifs();
  }
});
