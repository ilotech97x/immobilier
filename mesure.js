/* Mesure d'audience pour ILO CONTROL (commun/mesures.sql) : une vue par page affichée (adresse sans identifiant) et les clics sur
   les boutons et liens principaux. Sans cookie, sans stockage, sans identifiant : seulement des compteurs par jour. Respecte
   « Ne pas me suivre » et le Global Privacy Control du navigateur. L'appli se nomme par <html data-app="…">. */
(function () {
  'use strict';
  const cfg = window.KAZ_CONFIG || {}, app = document.documentElement.dataset.app;
  if (!cfg.url || !cfg.cle || !app || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  const envoyer = (type, page, cible) => {
    try {
      fetch(cfg.url + '/rest/v1/rpc/mesurer', { method: 'POST', keepalive: true, headers: { apikey: cfg.cle, Authorization: 'Bearer ' + cfg.cle, 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_c: app, type_c: type, page_c: page, cible_c: cible || '', appareil_c: innerWidth < 800 ? 'mobile' : 'ordinateur' }) }).catch(() => {});
    } catch (e) { /* jamais bloquant */ }
  };
  const page = () => (location.pathname.replace(/index\.html$/, '') + (location.hash.split('?')[0] || '')).slice(0, 80);
  let derniere = '';
  const vue = () => { const p = page(); if (p !== derniere) { derniere = p; envoyer('vue', p); } };
  addEventListener('hashchange', vue);
  vue();
  document.addEventListener('click', e => {
    const el = e.target.closest?.('[data-mesure], a.btn, button.btn, .btn-primary, .btn-p, #bas a, nav a');
    if (!el || el.closest('form input, form textarea')) return;
    envoyer('clic', page(), (el.dataset.mesure || el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40));
  }, { capture: true, passive: true });
})();
