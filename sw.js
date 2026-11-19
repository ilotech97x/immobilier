/* Kaz An Nou — service worker (PWA) : l'appli s'installe sur l'écran d'accueil et s'ouvre même sans réseau.
   Installation : seulement la page d'accueil (rapide, le service worker est actif dès la première visite) ; les fichiers que la page a
   chargés sont rangés ensuite (message « coquille » envoyé par pwa.js, servi par le cache HTTP : aucun téléchargement en double).
   Pages (HTML) : réseau d'abord (version à jour), copie locale si le réseau échoue ou dépasse 4 s, sinon page « hors connexion ».
   Fichiers versionnés (?v=) : cache d'abord (l'adresse change avec le contenu). Autres fichiers : cache puis mise à jour en arrière-plan.
   Jamais les données (Supabase), ni les cartes, ni les vidéos. CACHE à monter à chaque publication. */
const PREFIXE = 'kaz-';
const CACHE = PREFIXE + 'v8';
const PORTEE = new URL('./', self.registration.scope).pathname;
const MAX = 220;   // nombre maximal de fichiers gardés
const API = /\/(rest|auth|storage|functions|realtime)\/v1\//;   // données : jamais gardées, même si l'API est sur la même adresse (tests locaux)
const SECOURS = '<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0d3b2e"><title>Kaz An Nou — hors connexion</title></head>'
  + '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#ffffff;color:#1f2937;font:16px/1.5 system-ui,sans-serif;text-align:center"><main style="max-width:420px;padding:24px">'
  + '<h1 style="margin:0 0 8px;font-size:24px;color:#0d3b2e">Kaz An Nou</h1><p><b>Vous êtes hors connexion.</b></p><p>Cette page n’a pas encore été enregistrée sur votre appareil. Elle s’ouvrira dès que le réseau reviendra.</p>'
  + '<p><a href="./" style="display:inline-block;margin-top:8px;padding:12px 22px;border-radius:12px;background:#0d3b2e;color:#fff;font-weight:700;text-decoration:none">Réessayer</a></p></main></body></html>';

const garder = (r, rep) => {
  if (!rep || rep.status !== 200 || rep.type === 'opaque') return Promise.resolve();
  return caches.open(CACHE).then(c => c.put(r, rep).then(() => c.keys()).then(k => { if (k.length > MAX) return c.delete(k[0]); })).catch(() => {});
};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.add('./').catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(l => Promise.all(l.filter(k => k.startsWith(PREFIXE) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'coquille' || !Array.isArray(e.data.urls)) return;
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(e.data.urls.slice(0, MAX).map(u => {
    const url = new URL(u, self.location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(PORTEE)) return null;
    return c.match(url.href).then(x => x || c.add(url.href)).catch(() => {});
  }))));
});
const apres = (e, p) => { try { e.waitUntil(p); } catch (x) { /* l'événement est terminé : la copie se fait quand même */ } };
const page = (e, r, u) => {
  const reseau = fetch(r).then(rep => { if (rep.ok) apres(e, garder(r, rep.clone())); return rep; });
  reseau.catch(() => {});
  const trop_long = new Promise((_, non) => setTimeout(non, 4000));
  const accueil = /\/(index\.html)?$/.test(u.pathname);
  return Promise.race([reseau, trop_long]).catch(() => caches.match(r, { ignoreSearch: true })
    .then(x => x || (accueil ? caches.match('./') : null))
    .then(x => x || reseau)
    .catch(() => new Response(SECOURS, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
};
const fichier = (e, r, u) => caches.match(r).then(x => {
  const reseau = () => fetch(r).then(rep => { apres(e, garder(r, rep.clone())); return rep; });
  if (x) { if (!u.search.includes('v=')) apres(e, reseau().then(() => {}, () => {})); return x; }
  return reseau().catch(() => caches.match(r, { ignoreSearch: true }).then(y => y || Response.error()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(PORTEE) || API.test(u.pathname) || r.headers.has('range')) return;
  e.respondWith(r.mode === 'navigate' ? page(e, r, u) : fichier(e, r, u));
});
