/* PWA commune des applis IloTech (17/11) : enregistre le service worker dès l'affichage, lui confie les fichiers déjà chargés
   (la coquille, servie par le cache HTTP : aucun téléchargement en double) et prévient clairement quand on est hors connexion.
   Chargé en defer sur chaque appli ; ne définit aucun nom global. */
(function () {
  'use strict';
  const BANDEAU = 'hors-ligne-ilo';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(reg => {
      const envoyer = () => {
        const urls = performance.getEntriesByType('resource').map(e => e.name).filter(n => n.indexOf(location.origin) === 0);
        if (reg.active && urls.length) reg.active.postMessage({ type: 'coquille', urls });
      };
      if (document.readyState === 'complete') setTimeout(envoyer, 1500); else addEventListener('load', () => setTimeout(envoyer, 1500));
      setTimeout(envoyer, 8000);   // fichiers chargés plus tard (cartes, onglets ouverts en premier)
    }).catch(() => { /* l'appli reste utilisable sans */ });
  }
  const montrer = hors => {
    let b = document.getElementById(BANDEAU);
    if (!hors) { if (b) b.hidden = true; return; }
    if (!b) {
      b = document.createElement('div'); b.id = BANDEAU; b.setAttribute('role', 'status');
      b.textContent = 'Hors connexion : les données enregistrées restent visibles, les autres reviendront avec le réseau.';
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:calc(78px + env(safe-area-inset-bottom));margin:0 auto;width:max-content;max-width:calc(100% - 24px);z-index:9998;'
        + 'padding:10px 16px;border-radius:12px;background:#1f2937;color:#fff;font:600 14px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.3);pointer-events:none';
      document.body.appendChild(b);
    }
    b.hidden = false;
  };
  addEventListener('offline', () => montrer(true));
  addEventListener('online', () => montrer(false));
  if (navigator.onLine === false) { if (document.body) montrer(true); else addEventListener('DOMContentLoaded', () => montrer(true)); }
})();
