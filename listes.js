/* Kaz An Nou — favoris rangés en listes nommées (« Vacances de Noël », « À visiter »…). Les listes ne sont proposées que si kaz/kaz_listes.sql est installé dans la base
   (tant qu'il ne l'est pas, la page Favoris reste telle qu'elle était). Les droits sont décidés par la base : une personne ne voit que ses listes.
   Chargé avant kaz.js ; n'utilise ses outils qu'à l'appel. Une seule variable globale : KazListes. */
'use strict';
const KazListes = (() => {
  let dispoPour = null, dispoP = null;
  // les tables existent-elles ? (une lecture ; une réponse par compte connecté)
  const installees = () => {
    if (!PRET || !moi) return Promise.resolve(false);
    if (dispoPour !== moi.id) { dispoPour = moi.id; dispoP = sb.from('favoris_listes').select('id').limit(1).then(r => !r.error, () => false); }
    return dispoP;
  };
  async function lire() {
    const [listes, liens] = await Promise.all([q(sb.from('favoris_listes').select('id, nom').order('created_at')), q(sb.from('favoris_listes_logements').select('liste_id, logement_id'))]);
    const dans = new Map(listes.map(l => [l.id, new Set()])); liens.forEach(x => dans.get(x.liste_id)?.add(x.logement_id));
    return { listes, dans };
  }
  const nomValide = t => { const n = String(t || '').trim().replace(/\s+/g, ' ').slice(0, 40); return n; };
  // barre « Toutes · Vacances (3) · À visiter (1) · + Nouvelle liste »
  const barre = (L, active, total) => `<div class="listes-barre" role="group" aria-label="Listes de favoris">
    <a class="puce" href="#/compte/favoris" aria-pressed="${!active}">Tous · ${total}</a>
    ${L.listes.map(l => `<a class="puce" href="#/compte/favoris?liste=${l.id}" aria-pressed="${active === l.id}">${esc(l.nom)} · ${L.dans.get(l.id).size}</a>`).join('')}
    <button type="button" class="puce" data-nouvelle-liste>${ico('plus')} Nouvelle liste</button>
    ${active ? `<button type="button" class="lien" data-renommer-liste="${active}">Renommer</button><button type="button" class="lien" data-suppr-liste="${active}">Supprimer la liste</button>` : ''}</div>`;
  const ajouterRanger = c => c.querySelectorAll('.carte').forEach(a => {
    const id = a.querySelector('[data-comparer]')?.dataset.comparer; if (!id || a.querySelector('[data-ranger]')) return;
    a.querySelector('.corps')?.insertAdjacentHTML('beforeend', `<button type="button" class="lien liste-ranger" data-ranger="${id}">${ico('liste')} Ranger dans une liste</button>`);
  });
  // feuille « Ranger dans une liste » : cocher = ajouter, décocher = retirer, tout de suite
  function feuille(id, L, apres) {
    const d = document.createElement('dialog'); d.className = 'feuille'; d.setAttribute('aria-labelledby', 'tListes');
    const dessiner = () => {
      d.innerHTML = `<form method="dialog"><div class="feuille-tete"><h2 id="tListes" tabindex="-1" autofocus>Ranger dans une liste</h2><button type="button" class="rond" data-fermer aria-label="Fermer">${ico('fermer')}</button></div>
        <div class="feuille-corps">${L.listes.length ? `<div class="liste-choix">${L.listes.map(l => `<label><input type="checkbox" data-liste="${l.id}" ${L.dans.get(l.id).has(id) ? 'checked' : ''}> ${esc(l.nom)}</label>`).join('')}</div>` : '<p class="muted">Vous n’avez pas encore de liste. Créez la première :</p>'}
          <div class="f"><label>Nouvelle liste<input name="nom" maxlength="40" placeholder="Ex. Vacances de Noël" autocomplete="off"></label></div></div>
        <div class="feuille-pied"><button type="button" class="btn" data-creer>${ico('plus')} Créer et ajouter</button><button type="button" class="btn btn-p" data-fermer>Terminé</button></div></form>`;
    };
    dessiner(); document.body.appendChild(d); d.showModal();
    d.addEventListener('close', () => { d.remove(); apres(); });
    d.addEventListener('click', async e => {
      if (e.target === d || e.target.closest('[data-fermer]')) return d.close();
      if (!e.target.closest('[data-creer]')) return;
      const nom = nomValide(d.querySelector('[name=nom]').value); if (!nom) return toast('Donnez un nom à la liste.', true);
      try {
        const l = await q(sb.from('favoris_listes').insert({ nom }).select('id, nom').single());
        await q(sb.from('favoris_listes_logements').insert({ liste_id: l.id, logement_id: id }));
        L.listes.push(l); L.dans.set(l.id, new Set([id])); dessiner(); toast(`Ajouté à « ${l.nom} ».`);
      } catch (err) { toast(/duplicate|unique/i.test(String(err?.message)) ? 'Vous avez déjà une liste de ce nom.' : erreur(err), true); }
    });
    d.addEventListener('change', async e => {
      const c = e.target.closest('[data-liste]'); if (!c) return;
      try {
        if (c.checked) { await q(sb.from('favoris_listes_logements').insert({ liste_id: c.dataset.liste, logement_id: id })); L.dans.get(c.dataset.liste).add(id); }
        else { await q(sb.from('favoris_listes_logements').delete().eq('liste_id', c.dataset.liste).eq('logement_id', id)); L.dans.get(c.dataset.liste).delete(id); }
      } catch (err) { c.checked = !c.checked; toast(erreur(err), true); }
    });
  }
  // la page Favoris : appelée par ongletFavoris ; rend la main (null) si les listes ne sont pas installées
  async function ongletFavoris(c, tous, rendre) {
    if (!(await installees())) return null;
    const L = await lire(), active = L.listes.some(l => l.id === param().liste) ? param().liste : '';
    const visibles = active ? tous.filter(x => L.dans.get(active).has(x.id)) : tous;
    return { html: barre(L, active, tous.length), visibles, active, apres: () => {
      ajouterRanger(c);
      c.onclick = async e => {
        const r = e.target.closest('[data-ranger]'), n = e.target.closest('[data-nouvelle-liste]'), ren = e.target.closest('[data-renommer-liste]'), su = e.target.closest('[data-suppr-liste]');
        if (r) return feuille(r.dataset.ranger, L, rendre);
        try {
          if (n) { const nom = nomValide(prompt('Nom de la nouvelle liste (40 lettres au plus)')); if (!nom) return; const l = await q(sb.from('favoris_listes').insert({ nom }).select('id').single()); return aller('#/compte/favoris?liste=' + l.id); }
          if (ren) { const cur = L.listes.find(l => l.id === ren.dataset.renommerListe); const nom = nomValide(prompt('Nouveau nom de la liste', cur?.nom || '')); if (!nom) return; await q(sb.from('favoris_listes').update({ nom }).eq('id', ren.dataset.renommerListe)); return rendre(); }
          if (su) { if (!confirm('Supprimer cette liste ? Les logements restent dans vos favoris.')) return; await q(sb.from('favoris_listes').delete().eq('id', su.dataset.supprListe)); return aller('#/compte/favoris'); }
        } catch (err) { toast(/duplicate|unique/i.test(String(err?.message)) ? 'Vous avez déjà une liste de ce nom.' : erreur(err), true); }
      };
    } };
  }
  return { ongletFavoris };
})();
