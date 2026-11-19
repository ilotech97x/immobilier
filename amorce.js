/* Kaz An Nou — amorce : tout petit fichier lu avant l'affichage, après la feuille de style.
   1. Il dit au CSS si l'on arrive sur l'accueil (la coquille du haut de page, écrite dans index.html, s'affiche alors sans attendre le JavaScript)
      et si la location est connue pour absente (visite précédente).
   2. Il lance les fichiers de l'appli (balises <script type="x-kaz"> de index.html, déjà téléchargés par <link rel="preload">) APRÈS le premier affichage :
      le navigateur dessine la coquille d'abord, puis exécute le JavaScript, dans l'ordre. Sans JavaScript, la page <noscript> reste lisible.
   Aucune donnée, aucun réseau. */
(function () {
  var h = location.hash, e = document.documentElement;
  if (!h || h === '#' || h === '#/') e.className += ' p-accueil';
  try { if (localStorage.getItem('kazLoc') === '0') e.className += ' sans-loc'; } catch (x) { /* stockage indisponible */ }
  function lancer() {
    Array.prototype.forEach.call(document.querySelectorAll('script[type="x-kaz"]'), function (v) {
      var s = document.createElement('script'); s.src = v.getAttribute('src'); s.async = false; document.head.appendChild(s);   // async = false : l'ordre est gardé
    });
  }
  function apresAffichage() { requestAnimationFrame(function () { setTimeout(lancer, 0); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apresAffichage); else apresAffichage();
})();
