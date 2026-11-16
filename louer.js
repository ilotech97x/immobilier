/* Kaz An Nou — la location (meublée ou vide, au mois ou à l'année), à côté des séjours.
   Tout est caché tant que la colonne « formule » n'existe pas dans la base (kaz/location.sql pas encore installé) : LOC_ON.
   Prix, dépôt de garantie, statuts et droits sont décidés par la base ; ici on affiche et on prévient avant l'envoi.
   Tous les fichiers JS partagent la même portée : les noms de ce fichier commencent par loc / LOC / ST_LOC. */
let LOC_ON = false, locP = null;
const locInstallee = () => locP || (locP = PRET ? sb.from('logements').select('formule').limit(1).then(r => (LOC_ON = !r.error), () => false) : Promise.resolve(false));
const ST_LOC = { demande: ['att', 'En attente'], acceptee: ['ok', 'Acceptée'], refusee: ['ko', 'Refusée'], annulee: ['gris', 'Annulée'] };
const LOC_FORMULES = { sejour: 'Séjours (à la nuit)', location: 'Location (au mois ou à l’année)', les_deux: 'Séjours et location' };
const LOC_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const locEstLocation = l => LOC_ON && !!l && !!l.formule && l.formule !== 'sejour';
const locSeule = l => LOC_ON && !!l && l.formule === 'location';
const locSejour = l => !locSeule(l);

// loyer d'une annonce : « 850 € / mois charges comprises » ou « 850 € / mois + 60 € de charges »
const locPrix = l => `<b>${eur(l.loyer_mois)}</b> <span class="muted">/ mois ${Number(l.charges_mois) > 0 ? '+ ' + eur(l.charges_mois) + ' de charges' : 'charges comprises'}</span>`;
const locTexteClasse = c => c === 'nc' ? 'Non soumis' : c;
const locPastille = (nom, c) => c ? `<span class="dpe dpe-${c === 'nc' ? 'nc' : c}" title="${nom} : ${locTexteClasse(c)}">${nom} ${locTexteClasse(c)}</span>` : '';
const locDuree = l => l.duree_min_mois && l.duree_max_mois ? `de ${l.duree_min_mois} à ${l.duree_max_mois} mois` : l.duree_min_mois ? `${l.duree_min_mois} mois minimum` : l.duree_max_mois ? `${l.duree_max_mois} mois maximum` : 'à convenir avec le propriétaire';
const locDispo = l => !l.dispo_le || j10(l.dispo_le) <= auj() ? 'Disponible maintenant' : 'Disponible le ' + jourLong(l.dispo_le);
// résumé d'une ligne (liste du propriétaire, validation par l'administration)
const locResume = l => locEstLocation(l) ? `${l.loyer_mois ? eur(l.loyer_mois) + ' / mois' : 'loyer à préciser'}${l.formule === 'les_deux' && l.prix_nuit ? ' · ' + eur(l.prix_nuit) + ' / nuit' : ''}` : `${eur(l.prix_nuit)} / nuit`;

// partie prix et détails d'une carte de logement (liste, accueil, favoris). ctx = 'location' : la page Location montre le loyer d'abord.
function locCartePrix(l, ctx) {
  if (!locEstLocation(l)) return null;
  const loc = `<div class="prix loc-prix">${locPrix(l)}</div>`;
  const surf = [l.surface_m2 ? `${String(l.surface_m2).replace('.', ',').replace(/,0$/, '')} m²` : '', l.meuble === true ? 'Meublé' : l.meuble === false ? 'Vide' : ''].filter(Boolean).join(' · ');
  const det = `<div class="muted petit">${esc(TYPES[l.type] || '')} · ${l.chambres} ch.${surf ? ' · ' + surf : ''}</div><div class="loc-dpe">${locPastille('DPE', l.dpe)}</div>`;
  if (l.formule === 'location') return { det, prix: loc };
  if (ctx === 'location') return { det, prix: loc };
  return { det: null, prix: `<div class="prix"><b>${eur(l.prix_nuit)}</b> <span class="muted">/ nuit</span> <span class="tag loc-aussi">Aussi en location</span></div>` };
}

// ---------------------------------------------------------------- page « Location » : liste et filtres
function locFiltres(p) {
  const v = k => esc(p[k] || '');
  return `<form class="loc-filtres" id="fLocFiltres" role="search" aria-label="Rechercher une location">
    <label><span>Territoire</span><select name="territoire" aria-label="Territoire">${optsTerritoires(p.territoire ?? 'Martinique', 'Tous les territoires')}</select></label>
    <label><span>Commune</span><input name="commune" list="villesLoc" placeholder="Toutes" value="${v('commune')}" autocomplete="off"></label>${listeVilles('villesLoc', p.territoire ?? 'Martinique')}
    <label><span>Loyer maximum (€ / mois)</span><input type="number" name="loyer" min="1" max="50000" inputmode="numeric" placeholder="Aucun" value="${v('loyer')}"></label>
    <label><span>Surface minimum (m²)</span><input type="number" name="surface" min="1" max="2000" inputmode="numeric" placeholder="Aucune" value="${v('surface')}"></label>
    <label><span>Meublé ou vide</span><select name="meuble"><option value="">Indifférent</option><option value="oui" ${p.meuble === 'oui' ? 'selected' : ''}>Meublé</option><option value="non" ${p.meuble === 'non' ? 'selected' : ''}>Vide</option></select></label>
    <label><span>Disponible au plus tard le</span><input type="date" name="dispo" value="${v('dispo')}"></label>
    <button class="btn btn-p">${ico('explorer')} Rechercher</button></form>`;
}
async function pageLocation() {
  if (!PRET) return vue(fermePourLeMoment());
  const p = param();
  vue(`<section class="hero hero-loc"><div class="wrap">${ONGLETS('#/location')}
      <h1>Louer un logement, <em>meublé ou vide</em>.</h1>
      <p>Des locations au mois ou à l’année, déposées directement par leurs propriétaires. Aucun frais d’agence ni de dossier : Kaz An Nou met en relation, gratuitement.</p>
      ${locFiltres(p)}</div></section>
    <div class="wrap"><section class="section" aria-labelledby="tLocRes"><div class="titre-s"><h2 id="tLocRes">Locations disponibles</h2></div>
      <div id="liste" class="grille" aria-busy="true">${'<i class="sq" style="height:300px"></i>'.repeat(4)}</div></section>
      <p class="muted petit loc-mention">Annonces gratuites, comme des petites annonces : IloTech ne gère pas les biens, ne perçoit ni commission ni honoraires sur la location et ne demande aucun frais au locataire. Méfiez-vous de toute demande d’argent avant la visite.</p></div>`);
  const f = $('#fLocFiltres'); brancherVilles(f.territoire, 'villesLoc');
  f.addEventListener('submit', e => {
    e.preventDefault(); const u = new URLSearchParams();
    Object.entries(Object.fromEntries(new FormData(f))).forEach(([k, x]) => x && u.set(k, x));
    if (!u.has('territoire')) u.set('territoire', '');   // « tous les territoires » doit rester choisi
    aller('#/location?' + u);
  });
  try {
    let r = sb.from('logements').select('*').eq('statut', 'publie').in('formule', ['location', 'les_deux']).order('created_at', { ascending: false }).limit(200);
    const terr = p.territoire ?? 'Martinique';
    if (terr) r = r.eq('territoire', terr);
    if (Number(p.loyer) > 0) r = r.lte('loyer_mois', Number(p.loyer));
    if (Number(p.surface) > 0) r = r.gte('surface_m2', Number(p.surface));
    if (p.meuble === 'oui' || p.meuble === 'non') r = r.eq('meuble', p.meuble === 'oui');
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.dispo || '')) r = r.or(`dispo_le.is.null,dispo_le.lte.${p.dispo}`);
    let l = await q(r);
    const nc = normCommune(p.commune); if (nc) l = l.filter(x => normCommune(x.commune).includes(nc));
    const el = $('#liste'); if (!el) return;
    el.removeAttribute('aria-busy');
    if (!l.length) { el.className = ''; el.innerHTML = `<div class="vide-etat"><div class="ico">🔑</div><h3>Aucune location pour ces critères</h3><p class="muted">Élargissez la recherche, ou revenez bientôt : les propriétaires publient chaque semaine. Vous avez un logement à louer ? Déposez votre annonce gratuitement.</p><a class="btn btn-p" href="${moi ? '#/compte/logements/nouveau' : '#/inscription?partenaire=1'}">Déposer une annonce</a></div>`; return; }
    const n = await notesDe(l.map(x => x.id));
    el.className = 'grille'; el.innerHTML = l.map(x => carteLogement(x, n, false, 'location')).join('');
  } catch (e) { if ($('#liste')) { $('#liste').className = ''; $('#liste').innerHTML = erreurEtat(e); } }
}

// ---------------------------------------------------------------- fiche : bloc « Location », colonne de droite, formulaire du bas
function locBloc(l) {
  const ligne = (t, v) => `<div><dt>${t}</dt><dd>${v}</dd></div>`;
  return `<section id="location" class="bloc loc-bloc"><h2>Location ${l.meuble === true ? 'meublée' : l.meuble === false ? 'vide' : ''}</h2>
    <dl class="loc-grille">
      ${ligne('Loyer mensuel', `<b>${eur(l.loyer_mois)}</b>`)}
      ${ligne('Charges', Number(l.charges_mois) > 0 ? `${eur(l.charges_mois)} / mois` : 'Comprises dans le loyer')}
      ${ligne('Dépôt de garantie', Number(l.depot_garantie) > 0 ? eur(l.depot_garantie) : 'Aucun')}
      ${ligne('Surface habitable', `${String(l.surface_m2).replace('.', ',').replace(/,0$/, '')} m²`)}
      ${ligne('Logement', l.meuble === true ? 'Meublé' : l.meuble === false ? 'Vide (non meublé)' : '—')}
      ${ligne('Performance énergétique', `${locPastille('DPE', l.dpe)} ${locPastille('GES', l.ges)}`)}
      ${ligne('Durée de location', locDuree(l))}
      ${ligne('Disponibilité', locDispo(l))}
      ${ligne('Honoraires', '<b>Aucun</b>')}
    </dl>
    <p class="petit muted">Annonce gratuite : IloTech met en relation et ne gère pas le bien. Aucune commission, aucun frais pour le locataire. Ne versez jamais d’argent avant d’avoir visité.</p>
    <p><button type="button" class="btn btn-p" data-loc-visite>Demander une visite</button> <span id="locEtat" class="petit"></span></p></section>`;
}
// colonne de droite d'une location seule (à la place de la réservation à la nuit)
const locAside = l => `<aside class="loc-aside" id="locAside" aria-labelledby="locAsideT"><div class="resa-tete"><div><span class="p">${eur(l.loyer_mois)}</span> <span class="muted">/ mois</span></div></div>
  <h2 id="locAsideT" class="sr">Demander une visite</h2>
  <p class="petit muted" style="margin:6px 0 12px">${Number(l.charges_mois) > 0 ? '+ ' + eur(l.charges_mois) + ' de charges' : 'Charges comprises'} · ${l.meuble ? 'meublé' : 'vide'} · ${locDispo(l).toLowerCase()}</p>
  <button type="button" class="btn btn-p" style="width:100%" data-loc-visite>Demander une visite</button>
  <ul class="rassure"><li>${ico('check')} Gratuit : aucun frais pour le locataire, aucun honoraire.</li><li>${ico('check')} Le propriétaire vous répond ; votre téléphone ne lui est transmis que s’il accepte.</li></ul></aside>`;
const locBarre = l => `<div class="barre-resa"><div><b>${eur(l.loyer_mois)}</b> <span class="muted">/ mois</span><small>${Number(l.charges_mois) > 0 ? '+ ' + eur(l.charges_mois) + ' de charges' : 'Charges comprises'}</small></div><button type="button" class="btn btn-p" data-loc-visite>Demander une visite</button></div>`;

function locFeuilleVisite(l, hote) {
  document.getElementById('dLocVisite')?.remove();
  const d = document.createElement('dialog'); d.className = 'feuille'; d.id = 'dLocVisite'; d.setAttribute('aria-labelledby', 'tLocVisite');
  const prenom = esc(hote?.prenom || 'le propriétaire');
  d.innerHTML = `<form method="dialog" id="fLocVisite" class="f" novalidate>
    <div class="feuille-tete"><h2 id="tLocVisite" tabindex="-1">Demander une visite</h2><button type="button" class="rond" id="fermerLocVisite" aria-label="Fermer">${ico('fermer')}</button></div>
    <div class="feuille-corps"><p class="muted petit" style="margin:8px 0 12px">${esc(l.titre)} · ${locPrix(l)}</p>
      <div class="ligne2"><label>Entrée souhaitée<input type="date" name="entree" min="${auj()}"></label>
        <label>Durée souhaitée (mois)<input type="number" name="duree" min="${l.duree_min_mois || 1}" max="${l.duree_max_mois || 120}" inputmode="numeric" placeholder="${esc(locDuree(l))}"></label></div>
      <label>Votre message pour ${prenom}<textarea name="message" maxlength="1000" placeholder="Qui vous êtes, quand vous pouvez visiter, votre situation…"></textarea></label>
      <p class="petit muted" id="locErr" role="alert" style="color:var(--ko)" hidden></p>
      <p class="petit muted">Seuls votre prénom et ce message sont transmis à ${prenom} ; votre téléphone ne l’est qu’à l’acceptation. Demande gratuite, conservée 2 ans après sa clôture puis effacée. Vous pouvez l’annuler à tout moment depuis votre compte.</p></div>
    <div class="feuille-pied"><button type="button" class="lien" id="annulerLocVisite">Annuler</button><button type="submit" class="btn btn-p">Envoyer ma demande</button></div></form>`;
  document.body.appendChild(d);
  surDepart(() => d.remove());
  const f = $('#fLocVisite'), err = $('#locErr');
  const fermer = () => d.close();
  $('#fermerLocVisite').addEventListener('click', fermer); $('#annulerLocVisite').addEventListener('click', fermer);
  d.addEventListener('click', e => { if (e.target === d) fermer(); });
  f.addEventListener('submit', async e => {
    e.preventDefault(); err.hidden = true;
    const x = Object.fromEntries(new FormData(f)), b = f.querySelector('[type=submit]'); b.disabled = true;
    try {
      await q(sb.rpc('demander_location', { lid: l.id, msg: (x.message || '').trim(), entree: x.entree || null, duree: x.duree ? Number(x.duree) : null }));
      d.close(); toast('Demande envoyée : le propriétaire va vous répondre.'); compter(); aller('#/compte/location');
    } catch (ex) { err.textContent = erreur(ex); err.hidden = false; b.disabled = false; }
  });
  d.showModal(); setTimeout(() => f.entree.focus(), 60);
}
async function locBrancher(l, hote) {
  const boutons = [...document.querySelectorAll('[data-loc-visite]')];
  if (!boutons.length) return;
  const etat = async () => {
    if (!moi) return;
    const r = await sb.from('demandes_location').select('id, statut').eq('logement_id', l.id).eq('demandeur', moi.id).in('statut', ['demande', 'acceptee']).limit(1);
    const x = r.data?.[0]; if (!x) return;
    boutons.forEach(b => { b.disabled = true; b.textContent = x.statut === 'acceptee' ? 'Demande acceptée' : 'Demande envoyée'; });
    const e = $('#locEtat'); if (e) e.innerHTML = `<a href="#/compte/location">Voir ma demande</a>`;
  };
  boutons.forEach(b => b.addEventListener('click', () => {
    if (!exigeCompte()) return;
    if (moi.id === l.owner) return toast('C’est votre propre annonce.', true);
    locFeuilleVisite(l, hote);
  }));
  etat().catch(() => {});
}

// ---------------------------------------------------------------- espace propriétaire : champs de l'annonce
const locOptsClasse = v => `<option value="">Choisir</option>${LOC_CLASSES.map(c => `<option value="${c}" ${v === c ? 'selected' : ''}>${c}</option>`).join('')}<option value="nc" ${v === 'nc' ? 'selected' : ''}>Non soumis</option>`;
function locChampsForm(l) {
  const n = k => l[k] ?? '';
  return `<fieldset class="f encadre loc-form" id="blocFormule"><legend style="font-weight:700">Séjours ou location</legend>
    <label>Ce logement est proposé en<select name="formule" id="selFormule">${opts(LOC_FORMULES, l.formule || 'sejour')}</select></label>
    <div id="champsLoc" hidden>
      <p class="aide" style="margin:0 0 10px">Annonce de location gratuite. Les mentions ci-dessous sont obligatoires avant l’envoi en validation. Aucun honoraire ni frais ne peut être demandé au locataire.</p>
      <div class="ligne3"><label>Loyer mensuel (€)<input type="number" name="loyer_mois" min="1" max="50000" step="1" inputmode="numeric" value="${esc(n('loyer_mois'))}"></label>
        <label>Charges mensuelles (€) <span class="aide">(0 si comprises)</span><input type="number" name="charges_mois" min="0" max="5000" step="1" inputmode="numeric" value="${esc(n('charges_mois'))}"></label>
        <label>Dépôt de garantie (€) <span class="aide">(0 si aucun)</span><input type="number" name="depot_garantie" min="0" max="100000" step="1" inputmode="numeric" value="${esc(n('depot_garantie'))}"></label></div>
      <div class="ligne3"><label>Surface habitable (m²)<input type="number" name="surface_m2" min="9" max="2000" step="0.5" inputmode="decimal" value="${esc(n('surface_m2'))}"></label>
        <label>Meublé ou vide<select name="meuble"><option value="">Choisir</option><option value="oui" ${l.meuble === true ? 'selected' : ''}>Meublé</option><option value="non" ${l.meuble === false ? 'selected' : ''}>Vide</option></select></label>
        <label>Disponible à partir du<input type="date" name="dispo_le" value="${esc(n('dispo_le') ? j10(l.dispo_le) : '')}"></label></div>
      <div class="ligne3"><label>Classe énergie (DPE)<select name="dpe">${locOptsClasse(l.dpe)}</select></label>
        <label>Classe climat (GES)<select name="ges">${locOptsClasse(l.ges)}</select></label>
        <label>Honoraires<input value="Aucun" disabled aria-label="Honoraires : aucun"></label></div>
      <div class="ligne2"><label>Durée minimale (mois) <span class="aide">(facultatif)</span><input type="number" name="duree_min_mois" min="1" max="120" inputmode="numeric" value="${esc(n('duree_min_mois'))}"></label>
        <label>Durée maximale (mois) <span class="aide">(facultatif)</span><input type="number" name="duree_max_mois" min="1" max="120" inputmode="numeric" value="${esc(n('duree_max_mois'))}"></label></div>
      <p class="aide" style="margin:6px 0 0">Dépôt de garantie : 2 mois de loyer au plus pour un meublé, 1 mois pour un logement vide.</p>
    </div></fieldset>`;
}
// montre ou cache les champs de séjour et de location selon la formule
function locBrancherForm(f) {
  const sel = f.formule; if (!sel) return;
  const maj = () => {
    const v = sel.value;
    $('#champsLoc').hidden = v === 'sejour';
    f.querySelectorAll('.sej').forEach(e => { e.hidden = v === 'location'; });
    f.prix_nuit.required = v !== 'location';
  };
  sel.addEventListener('change', maj); maj();
}
// ce que la base exige à l'envoi en validation, dit avant l'envoi
function locErreurs(d) {
  if (!d.formule || d.formule === 'sejour') return [];
  const e = [], n = k => d[k] !== '' && d[k] != null && !isNaN(Number(d[k])) ? Number(d[k]) : null;
  const loyer = n('loyer_mois');
  if (loyer == null || loyer <= 0) e.push('le loyer mensuel');
  if (n('charges_mois') == null) e.push('les charges mensuelles (0 si elles sont comprises)');
  if (n('depot_garantie') == null) e.push('le dépôt de garantie (0 s’il n’y en a pas)');
  if (!d.meuble) e.push('meublé ou vide');
  if (n('surface_m2') == null) e.push('la surface habitable en m²');
  else if (n('surface_m2') < 9) e.push('une surface habitable d’au moins 9 m²');
  if (!d.commune || d.commune.trim().length < 2) e.push('la commune');
  if (!d.dpe) e.push('la classe énergie (DPE)');
  if (!d.ges) e.push('la classe climat (GES)');
  const r = e.length ? ['Pour une annonce de location, indiquez : ' + e.join(', ') + '.'] : [];
  if (loyer > 0 && n('depot_garantie') != null && d.meuble) {
    const m = d.meuble === 'oui' ? 2 : 1;
    if (n('depot_garantie') > loyer * m) r.push(`Le dépôt de garantie ne peut pas dépasser ${m} mois de loyer (${eur(loyer * m)}) pour un logement ${m === 2 ? 'meublé' : 'vide'}.`);
  }
  if (n('duree_min_mois') != null && n('duree_max_mois') != null && n('duree_max_mois') < n('duree_min_mois')) r.push('La durée maximale doit être au moins égale à la durée minimale.');
  if (d.formule !== 'location' && (d.prix_nuit === '' || d.prix_nuit == null)) r.push('Indiquez le prix par nuit pour les séjours.');
  return r;
}
function locLigne(d) {
  const n = k => d[k] === '' || d[k] == null ? null : Number(d[k]);
  const loc = d.formule !== 'sejour';
  return { formule: d.formule, loyer_mois: loc ? n('loyer_mois') : null, charges_mois: loc ? n('charges_mois') : null, depot_garantie: loc ? n('depot_garantie') : null, surface_m2: loc ? n('surface_m2') : null,
    dpe: loc ? d.dpe || null : null, ges: loc ? d.ges || null : null, meuble: loc && d.meuble ? d.meuble === 'oui' : null,
    duree_min_mois: loc ? n('duree_min_mois') : null, duree_max_mois: loc ? n('duree_max_mois') : null, dispo_le: loc ? d.dispo_le || null : null };
}

// ---------------------------------------------------------------- compte : mes demandes, demandes reçues
const locLigneDemande = (x, l, cote, p) => {
  const actions = [];
  if (cote === 'moi' && ['demande', 'acceptee'].includes(x.statut)) actions.push(`<button class="btn btn-s btn-ko" data-loc-annuler="${x.id}">Annuler</button>`);
  if (cote === 'proprio' && x.statut === 'demande') actions.push(`<button class="btn btn-s btn-v" data-loc-accepter="${x.id}">Accepter</button><button class="btn btn-s btn-ko" data-loc-refuser="${x.id}">Refuser</button>`);
  if (p?.telephone && x.statut === 'acceptee') actions.push(`<a class="btn btn-s btn-wa" href="${wa(p.telephone, `Bonjour, à propos de la location « ${l?.titre || ''} » sur Kaz An Nou.`)}" target="_blank" rel="noopener">WhatsApp</a>`);
  return `<div class="ligne-l" data-loc-demande="${x.id}">${l?.photos?.[0] ? `<img class="mini" src="${esc(photo(l.photos[0]))}" alt="">` : '<div class="mini"></div>'}
    <div><b><a href="#/logement/${x.logement_id}">${esc(l?.titre || 'Logement')}</a></b> ${tag(ST_LOC[x.statut])}
      <div class="muted petit">Demandée le ${jourLong(x.created_at.slice(0, 10))}${x.entree_le ? ` · entrée souhaitée le ${jourLong(x.entree_le)}` : ''}${x.duree_mois ? ` · ${x.duree_mois} mois` : ''}</div>
      ${cote === 'proprio' && p?.nom ? `<div class="petit">👤 ${esc(p.nom)}${x.statut === 'acceptee' && p.telephone ? ' · ' + esc(p.telephone) : ''}</div>` : ''}
      ${x.message ? `<div class="petit">« ${esc(x.message)} »</div>` : ''}
      ${x.statut === 'refusee' && x.motif_refus ? `<div class="petit" style="color:var(--ko)">Motif : ${esc(x.motif_refus)}</div>` : ''}</div>
    <div class="actions">${actions.join('')}</div></div>`;
};
const locNote = '<p class="muted petit">Demandes gratuites. Elles sont effacées 2 ans après leur clôture. Le propriétaire ne reçoit votre téléphone que s’il accepte.</p>';
async function ongletLocMesDemandes(c) {
  const d = await q(sb.from('demandes_location').select('*, logements(titre, photos, owner)').eq('demandeur', moi.id).order('created_at', { ascending: false }));
  const info = await infosPersonnes([...new Set(d.map(x => x.logements?.owner).filter(Boolean))], false);
  c.innerHTML = `<h1>Mes demandes de location</h1>${d.length ? d.map(x => locLigneDemande(x, x.logements, 'moi', info(x.logements?.owner))).join('') + locNote
    : '<div class="vide-etat"><div class="ico">🔑</div><h3>Aucune demande</h3><p class="muted">Trouvez une location et demandez une visite : c’est gratuit.</p><a class="btn btn-p" href="#/location">Voir les locations</a></div>'}`;
  c.onclick = async e => {
    const b = e.target.closest('[data-loc-annuler]'); if (!b || !confirm('Annuler cette demande ?')) return;
    b.disabled = true;
    try { await q(sb.rpc('annuler_demande_location', { did: b.dataset.locAnnuler })); toast('Demande annulée.'); compter(); ongletLocMesDemandes(c); } catch (err) { toast(erreur(err), true); b.disabled = false; }
  };
}
async function ongletLocRecues(c) {
  const d = await q(sb.from('demandes_location').select('*, logements!inner(titre, photos, owner)').eq('logements.owner', moi.id).order('created_at', { ascending: false }));
  const info = await infosPersonnes([...new Set(d.map(x => x.demandeur))], true);
  const groupes = [['À traiter', d.filter(x => x.statut === 'demande')], ['Historique', d.filter(x => x.statut !== 'demande')]];
  c.innerHTML = `<h1>Demandes de location</h1>` + groupes.map(([t, l]) => `<h3>${t} (${l.length})</h3>${l.length ? l.map(x => locLigneDemande(x, x.logements, 'proprio', info(x.demandeur))).join('') : '<p class="muted">Rien ici.</p>'}`).join('') + locNote;
  c.onclick = async e => {
    const ac = e.target.closest('[data-loc-accepter]'), re = e.target.closest('[data-loc-refuser]');
    try {
      if (ac) { ac.disabled = true; await q(sb.rpc('repondre_demande_location', { did: ac.dataset.locAccepter, accepter: true, motif: null })); toast('Demande acceptée : le locataire est prévenu.'); compter(); ongletLocRecues(c); }
      if (re) locFeuilleRefus(re.dataset.locRefuser, () => { compter(); ongletLocRecues(c); });
    } catch (err) { toast(erreur(err), true); ac && (ac.disabled = false); }
  };
}
function locFeuilleRefus(id, apres) {
  document.getElementById('dLocRefus')?.remove();
  const d = document.createElement('dialog'); d.className = 'feuille'; d.id = 'dLocRefus'; d.setAttribute('aria-labelledby', 'tLocRefus');
  d.innerHTML = `<form method="dialog" id="fLocRefus" class="f"><div class="feuille-tete"><h2 id="tLocRefus" tabindex="-1">Refuser la demande</h2><button type="button" class="rond" id="fermerLocRefus" aria-label="Fermer">${ico('fermer')}</button></div>
    <div class="feuille-corps"><label style="margin-top:10px">Motif du refus (envoyé au locataire)<textarea name="motif" required minlength="3" maxlength="500" placeholder="ex. Le logement est déjà loué."></textarea></label>
      <p class="petit" id="locRefusErr" role="alert" style="color:var(--ko)" hidden></p></div>
    <div class="feuille-pied"><button type="button" class="lien" id="annulerLocRefus">Retour</button><button type="submit" class="btn btn-ko">Refuser la demande</button></div></form>`;
  document.body.appendChild(d); surDepart(() => d.remove());
  const fermer = () => d.close();
  $('#fermerLocRefus').addEventListener('click', fermer); $('#annulerLocRefus').addEventListener('click', fermer);
  d.addEventListener('click', e => { if (e.target === d) fermer(); });
  $('#fLocRefus').addEventListener('submit', async e => {
    e.preventDefault(); const m = e.target.motif.value.trim(), er = $('#locRefusErr');
    if (m.length < 3) { er.textContent = 'Indiquez le motif du refus (3 caractères au moins).'; er.hidden = false; return; }
    try { await q(sb.rpc('repondre_demande_location', { did: id, accepter: false, motif: m })); d.close(); toast('Demande refusée : le locataire est prévenu.'); apres(); }
    catch (err) { er.textContent = erreur(err); er.hidden = false; }
  });
  d.showModal(); setTimeout(() => $('#fLocRefus').motif.focus(), 60);
}
// nombre de demandes de location à traiter (pastille du compte)
async function locCompter() {
  if (!LOC_ON || !moi || !role('proprietaire')) return 0;
  const r = await sb.from('demandes_location').select('id, logements!inner(owner)').eq('statut', 'demande').eq('logements.owner', moi.id);
  return r.data?.length || 0;
}
