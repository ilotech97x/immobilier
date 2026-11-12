/* Kaz An Nou — recherche façon agence immobilière : les résultats d'un côté, la carte de l'autre (Leaflet + OpenStreetMap, hébergé).
   Prix posés sur la carte, carte et liste qui se répondent, « Rechercher dans cette zone », filtres, alertes et comparateur.
   Logements publiés seulement (règles de la base). Position : le point de l'hôte arrondi à ~300 m par la base (agence.sql),
   sinon la mairie de la commune (lieux.js), marquée « position approximative ». Chargé avant kaz.js : n'utilise ses outils qu'à l'appel. */
'use strict';

const EQ_RAPIDES = ['piscine', 'vue_mer', 'plage', 'clim', 'animaux', 'pmr'];
const PREPO = { Martinique: 'en Martinique', Guadeloupe: 'en Guadeloupe', Guyane: 'en Guyane', 'Saint-Martin': 'à Saint-Martin', 'Saint-Barthélemy': 'à Saint-Barthélemy',
  'La Réunion': 'à La Réunion', Mayotte: 'à Mayotte', 'Hexagone et Corse': 'dans l’Hexagone et en Corse', 'Autre pays': 'hors de France', partout: 'dans tous les territoires' };
const TRIS = { recent: 'Les plus récents', prix: 'Prix croissant', prix_desc: 'Prix décroissant', note: 'Mieux notés' };
const PAR_PAGE = 30;
let RCH = null;   // la recherche ouverte : critères, logements, carte

// ---------------------------------------------------------------- critères (dans l'adresse : une recherche se partage et se retrouve)
function lireRecherche() {
  const p = param(), liste = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const n = (s, a, b) => { const v = Math.round(Number(s)); return s !== undefined && s !== '' && Number.isFinite(v) && v >= a && v <= b ? v : null; };
  const date = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '';
  const z = String(p.zone || '').split(',').map(Number);
  return {
    territoire: NOMS_TERRITOIRES.includes(p.territoire) || p.territoire === 'partout' ? p.territoire : '',
    commune: String(p.commune || '').trim().slice(0, 60), arrivee: date(p.arrivee), depart: date(p.depart),
    voyageurs: n(p.voyageurs, 1, 40), pmin: n(p.pmin, 1, 20000), pmax: n(p.pmax, 1, 20000), ch: n(p.ch, 1, 30),
    types: liste(p.types).filter(t => TYPES[t]), eq: liste(p.eq).filter(e => EQUIP.some(x => x[0] === e)),
    tri: TRIS[p.tri] ? p.tri : 'recent', zone: z.length === 4 && z.every(Number.isFinite) ? z : null,
    favoris: p.favoris === '1', alerte: /^[0-9a-f-]{36}$/.test(p.alerte || '') ? p.alerte : '', vue: p.vue === 'carte' ? 'carte' : 'liste',
  };
}
function adresseRecherche(r) {
  const p = new URLSearchParams();
  ['territoire', 'commune', 'arrivee', 'depart', 'voyageurs', 'pmin', 'pmax', 'ch'].forEach(k => r[k] && p.set(k, r[k]));
  if (r.types.length) p.set('types', r.types.join(','));
  if (r.eq.length) p.set('eq', r.eq.join(','));
  if (r.tri !== 'recent') p.set('tri', r.tri);
  if (r.zone) p.set('zone', r.zone.map(x => x.toFixed(4)).join(','));
  if (r.favoris) p.set('favoris', '1');
  if (r.vue === 'carte') p.set('vue', 'carte');
  const s = p.toString(); return '#/recherche' + (s ? '?' + s : '');
}
const nbFiltres = r => (r.pmin || r.pmax ? 1 : 0) + r.types.length + (r.ch ? 1 : 0) + r.eq.length + (r.tri !== 'recent' ? 1 : 0);

// ---------------------------------------------------------------- données : tous les logements publiés (300 au plus), filtrés sur l'appareil
async function donneesRecherche(r) {
  const avecPoint = await agenceInstallee();
  const cols = 'id, owner, titre, type, territoire, commune, quartier, chambres, lits, sdb, voyageurs, prix_nuit, menage, min_nuits, equipements, photos, created_at, updated_at' + (avecPoint ? ', lat, lng' : '');
  const [liste, notes, libres] = await Promise.all([
    memoK('publies', () => q(sb.from('logements').select(cols).eq('statut', 'publie').order('created_at', { ascending: false }).limit(300)), 60000),
    memoK('notes', () => q(sb.from('notes').select('cible, moyenne, nombre').limit(5000)).then(n => Object.fromEntries(n.map(x => [x.cible, x]))), 60000),
    r.arrivee && r.depart && r.depart > r.arrivee ? memoK(`libres-${r.arrivee}-${r.depart}`, () => q(sb.rpc('logements_libres', { d1: r.arrivee, d2: r.depart })).then(l => new Set(l)), 60000) : null]);
  return { liste: liste.map(l => ({ ...l, pos: positionDe(l) })), notes, libres };
}
function filtrer(r, d, terr) {
  const nc = normCommune(r.commune), nn = r.arrivee && r.depart ? nuits(r.arrivee, r.depart) : 0;
  return d.liste.filter(l =>
    (!terr || terr === 'partout' || l.territoire === terr) && (!nc || normCommune(l.commune).includes(nc)) &&
    (!d.libres || d.libres.has(l.id)) && (!nn || nn >= l.min_nuits) && (!r.voyageurs || l.voyageurs >= r.voyageurs) &&
    (!r.pmin || Number(l.prix_nuit) >= r.pmin) && (!r.pmax || Number(l.prix_nuit) <= r.pmax) && (!r.ch || l.chambres >= r.ch) &&
    (!r.types.length || r.types.includes(l.type)) && r.eq.every(e => (l.equipements || []).includes(e)) && (!r.favoris || favoris.has(l.id)) &&
    (!r.zone || (l.pos && l.pos.lat >= r.zone[0] && l.pos.lat <= r.zone[2] && l.pos.lng >= r.zone[1] && l.pos.lng <= r.zone[3])));
}
// territoire affiché : celui demandé, sinon la Martinique si elle a des logements, sinon le territoire qui en a le plus
function territoireDe(r, tous) {
  if (r.territoire) return r.territoire;
  const n = {}; tous.forEach(l => { n[l.territoire] = (n[l.territoire] || 0) + 1; });
  if (n.Martinique || !tous.length) return 'Martinique';
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
}
function trier(l, tri, notes) {
  const t = [...l];
  if (tri === 'prix') t.sort((a, b) => a.prix_nuit - b.prix_nuit);
  else if (tri === 'prix_desc') t.sort((a, b) => b.prix_nuit - a.prix_nuit);
  else if (tri === 'note') t.sort((a, b) => (notes[b.id]?.moyenne || 0) - (notes[a.id]?.moyenne || 0) || (notes[b.id]?.nombre || 0) - (notes[a.id]?.nombre || 0));
  else t.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return t;
}

// ---------------------------------------------------------------- la page
async function pageRecherche() {
  const r = lireRecherche();
  if (r.favoris && !exigeCompte()) return;
  document.body.classList.add('page-rech'); document.body.classList.toggle('vue-carte', r.vue === 'carte');
  RCH = { r, d: null, res: [], terr: r.territoire || 'Martinique', carte: null, L: null, calque: null, marqueurs: new Map(), page: PAR_PAGE, prog: false, sel: [], allumes: new Set() };
  vue(`<div class="rech">
    <div class="rech-barre" id="rechBarre"><div class="wrap">
      <div class="rech-l1"><button type="button" class="resume" id="resume" aria-expanded="false" aria-controls="fRech">${ico('explorer')}<span><b id="resumeL1"></b><small id="resumeL2"></small></span></button>
        <form class="rech-form" id="fRech" role="search" aria-label="Où et quand">
          <label><span>Où</span><select name="territoire"><option value="partout">Tous les territoires</option>${NOMS_TERRITOIRES.map(x => `<option ${x === (r.territoire || 'Martinique') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label><span>Ville</span><input name="commune" list="villesR" placeholder="Toutes" value="${esc(r.commune)}" autocomplete="off">${listeVilles('villesR', r.territoire || 'Martinique')}</label>
          <label><span>Arrivée</span><input type="date" name="arrivee" min="${auj()}" value="${esc(r.arrivee)}"></label>
          <label><span>Départ</span><input type="date" name="depart" min="${auj()}" value="${esc(r.depart)}"></label>
          <label><span>Voyageurs</span><input type="number" name="voyageurs" min="1" max="40" inputmode="numeric" placeholder="Tous" value="${esc(r.voyageurs || '')}"></label>
        </form></div>
      <div class="rech-l2" id="rechL2" role="toolbar" aria-label="Filtres rapides"></div></div></div>
    <div class="rech-corps">
      <section class="rech-liste" aria-labelledby="rechTitre"><div id="rechListe" aria-busy="true"><h1 class="sr" id="rechTitre">Recherche de logements</h1><i class="sq sq-t"></i>${'<i class="sq sq-carte"></i>'.repeat(4)}</div></section>
      <section class="rech-carte" aria-label="Carte des résultats"><div id="carteRech"></div><div class="carte-attente" id="carteAttente">Carte en préparation…</div>
        <button type="button" class="zone-btn" id="zoneBtn" hidden>${ico('zone')} Rechercher dans cette zone</button><div class="apercu" id="apercu" hidden></div></section>
    </div>
    <button type="button" class="bascule" id="bascule"></button>
    ${dialogueFiltres(r)}</div>`);
  barreRapide(); mesurerBarre(); brancherPage();
  const mq = matchMedia('(min-width: 1024px)'), auChangement = () => { mesurerBarre(); preparerCarte(); RCH?.carte?.invalidateSize(); };
  mq.addEventListener('change', auChangement); addEventListener('resize', mesurerBarre);
  surDepart(() => { mq.removeEventListener('change', auChangement); removeEventListener('resize', mesurerBarre); RCH?.carte?.remove(); RCH = null; document.documentElement.style.removeProperty('--barre'); delete window.__carteKaz; });
  await chargerResultats();
}
async function chargerResultats() {
  const el = $('#rechListe'); if (!RCH || !el) return;
  if (!PRET) { el.innerHTML = videLogements(); return; }
  try {
    RCH.d = await donneesRecherche(RCH.r);
    if (!RCH || !$('#rechListe')) return;
    el.removeAttribute('aria-busy');
    rendreListe(); preparerCarte(); majCarte(true);
    if (RCH.r.alerte) sb.from('alertes_logement').update({ vu_le: new Date().toISOString() }).eq('id', RCH.r.alerte).then(() => {});   // nouveautés vues
  } catch (e) {
    if ($('#rechListe')) $('#rechListe').innerHTML = `<h1 class="sr" id="rechTitre">Recherche de logements</h1><div class="vide-etat erreur-etat" role="alert"><div class="ico">📡</div><h3>Les logements n’ont pas pu être chargés</h3>
      <p class="muted">${esc(erreur(e))}</p><button type="button" class="btn btn-p" id="reessayerRech">Réessayer</button></div>`;
    $('#reessayerRech')?.addEventListener('click', () => { oublierK('publies'); oublierK('notes'); oublierK('libres'); $('#rechListe').innerHTML = '<i class="sq sq-t"></i>' + '<i class="sq sq-carte"></i>'.repeat(4); chargerResultats(); });
  }
}
// hauteur de la barre des filtres : la carte se cale juste en dessous
function mesurerBarre() { const b = $('#rechBarre'); if (b) document.documentElement.style.setProperty('--barre', b.offsetHeight + 'px'); }

function barreRapide() {
  const r = RCH.r, nf = nbFiltres(r), nc = compares().length;
  $('#rechL2').innerHTML = `<button type="button" class="puce ${nf ? 'on' : ''}" id="ouvrirFiltres" aria-haspopup="dialog">${ico('filtre')} Filtres${nf ? ` <span class="n">${nf}</span>` : ''}</button>
    ${EQ_RAPIDES.map(k => { const e = EQUIP.find(x => x[0] === k); return `<button type="button" class="puce" data-eq="${k}" aria-pressed="${r.eq.includes(k)}"><span aria-hidden="true">${e[1]}</span> ${esc(e[2])}</button>`; }).join('')}
    <span class="sep" aria-hidden="true"></span>
    ${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="puce" data-type="${k}" aria-pressed="${r.types.includes(k)}">${esc(t)}</button>`).join('')}
    ${r.zone ? `<button type="button" class="puce on" id="effZone" aria-label="Retirer la zone de la carte">${ico('zone')} Zone de la carte ${ico('fermer')}</button>` : ''}
    ${r.favoris ? `<button type="button" class="puce on" id="effFav" aria-label="Voir tous les logements, pas seulement les favoris">${ico('coeur')} Mes favoris ${ico('fermer')}</button>` : ''}
    ${nc ? `<a class="puce" href="#/comparer">${ico('comparer')} Comparer <span class="n">${nc}</span></a>` : ''}`;
  const lieuTxt = r.commune || (r.zone ? 'Zone de la carte' : r.territoire && r.territoire !== 'partout' ? r.territoire : 'Où partir ?');
  $('#resumeL1').textContent = lieuTxt;
  $('#resumeL2').textContent = [r.arrivee && r.depart ? `${jour(r.arrivee)} → ${jour(r.depart)}` : 'Dates libres', r.voyageurs ? `${r.voyageurs} voyageur${s_(r.voyageurs)}` : 'Voyageurs'].join(' · ');
}

// ---------------------------------------------------------------- liste des résultats
function rendreListe() {
  const { r, d } = RCH;
  const tous = filtrer(r, d, ''), terr = territoireDe(r, tous);
  const res = trier(terr === 'partout' ? tous : tous.filter(l => l.territoire === terr), r.tri, d.notes);
  RCH.res = res; RCH.terr = terr; RCH.sel = []; RCH.allumes = new Set();
  const sel = document.querySelector('#fRech [name=territoire]'); if (sel) sel.value = terr;   // le territoire affiché, même choisi pour vous
  const compte = {}; tous.forEach(l => { compte[l.territoire] = (compte[l.territoire] || 0) + 1; });
  const terrs = NOMS_TERRITOIRES.filter(t => compte[t]);   // ordre fixe : Martinique, Guadeloupe… puis Hexagone et autres pays
  const dates = r.arrivee && r.depart;
  const titre = `${res.length} logement${s_(res.length)} ${r.commune ? esc(aLieu(r.commune)) : r.zone ? 'dans cette zone' : PREPO[terr] || ''}${dates ? ` libre${s_(res.length)} du ${jour(r.arrivee)} au ${jour(r.depart)}` : ''}${r.favoris ? ' dans vos favoris' : ''}`;
  const sansPoint = res.filter(l => !l.pos).length, approx = res.filter(l => l.pos?.approx).length;
  const el = $('#rechListe');
  el.innerHTML = `<div class="rech-tete"><h1 id="rechTitre" aria-live="polite">${titre}</h1><div class="actions">
      <label class="sr" for="triRech">Trier</label><select id="triRech" class="btn btn-s">${opts(TRIS, r.tri)}</select>
      <button type="button" class="btn btn-s" data-alerte hidden>${ico('cloche')} Créer une alerte</button></div></div>
    <div class="terr">${terrs.length > 1 || (terrs.length === 1 && terrs[0] !== terr) ? `<span role="group" aria-label="Territoires" class="terr-g">${terrs.map(t => `<button type="button" class="puce" data-terr="${esc(t)}" aria-pressed="${t === terr}">${esc(t)} · ${compte[t]}</button>`).join('')}${terrs.length > 1 ? `<button type="button" class="puce" data-terr="partout" aria-pressed="${terr === 'partout'}">Partout · ${tous.length}</button>` : ''}</span>` : ''}
      <details class="classement"><summary>Comment les annonces sont classées</summary><p>Par date de mise en ligne, les plus récentes d’abord, ou selon le tri choisi. Aucun logement n’est mis en avant contre paiement. Toutes les annonces sont vérifiées par notre équipe avant d’être publiées.</p></details></div>
    ${res.length ? `<div class="res-liste" id="resListe">${res.slice(0, RCH.page).map(carteResultat).join('')}</div>
      ${res.length > RCH.page ? `<div class="plus-res"><button type="button" class="btn" id="plusRes">Afficher ${Math.min(PAR_PAGE, res.length - RCH.page)} logements de plus</button></div>` : ''}
      ${sansPoint || approx ? `<p class="hors-carte">${approx ? `${approx} logement${s_(approx)} placé${s_(approx)} au centre de la commune (point dessiné en pointillé). ` : ''}${sansPoint ? `${sansPoint} logement${s_(sansPoint)} sans position ne figure${sansPoint > 1 ? 'nt' : ''} pas sur la carte.` : ''}</p>` : ''}`
      : videRecherche(r, tous.length)}
    <div class="alerte-bloc" data-alerte-bloc hidden><p><b>Rien ne vous convient encore ?</b> Créez une alerte : nous vous prévenons dans votre espace dès qu’un logement correspond.</p><button type="button" class="btn btn-v" data-alerte>${ico('cloche')} Créer une alerte</button></div>`;
  agenceInstallee().then(ok => { if (ok) document.querySelectorAll('#rechListe [data-alerte], #rechListe [data-alerte-bloc]').forEach(b => { b.hidden = false; }); });
}
function videRecherche(r, ailleurs) {
  if (!RCH.d.liste.length) return videLogements();
  const nf = nbFiltres(r);
  return `<div class="vide-etat"><div class="ico">🔎</div><h3>Aucun logement ne correspond</h3>
    <p class="muted">${ailleurs ? 'Il y en a dans un autre territoire : choisissez-le ci-dessus.' : 'Élargissez la recherche : moins de filtres, d’autres dates ou toute la carte.'}</p>
    <div class="actions">${nf ? '<button type="button" class="btn" data-act="filtres">Effacer les filtres</button>' : ''}${r.zone ? '<button type="button" class="btn" data-act="zone">Toute la carte</button>' : ''}
      ${r.arrivee ? '<button type="button" class="btn" data-act="dates">Sans dates</button>' : ''}${r.commune ? '<button type="button" class="btn" data-act="commune">Toutes les villes</button>' : ''}</div></div>`;
}
function carteResultat(l) {
  const n = RCH.d.notes[l.id], r = RCH.r, nn = r.arrivee && r.depart ? nuits(r.arrivee, r.depart) : 0, lien = `#/logement/${l.id}${qsDates(r)}`;
  const eq = EQUIP.filter(e => (l.equipements || []).includes(e[0])).slice(0, 4);
  return `<article class="res" data-id="${l.id}">
    <a class="res-ph" href="${lien}" tabindex="-1" aria-hidden="true">${l.photos?.[0] ? `<img src="${esc(photo(l.photos[0]))}" alt="" loading="lazy">` : '<span class="vide">🏝️</span>'}</a>
    <div class="res-corps">
      <div class="res-l1"><span>${esc(l.commune)}${l.quartier ? ' · ' + esc(l.quartier) : ''}</span>${n ? `<span class="etoile">★ ${noteFr(n.moyenne)} (${n.nombre})</span>` : '<span class="tag">Nouveau</span>'}</div>
      <h3 class="res-titre"><a href="${lien}">${esc(l.titre)}</a></h3>
      <p class="res-specs">${esc(TYPES[l.type] || '')} · ${l.voyageurs} voyageur${s_(l.voyageurs)} · ${l.chambres ? `${l.chambres} chambre${s_(l.chambres)}` : 'pièce unique'} · ${l.sdb} salle${s_(l.sdb)} d’eau</p>
      ${eq.length ? `<p class="res-eq">${eq.map(e => `<span aria-hidden="true">${e[1]}</span> ${esc(e[2])}`).join(' · ')}</p>` : ''}
      <p class="res-prix"><b>${eur(l.prix_nuit)}</b> / nuit${nn > 0 ? ` <span class="muted">· ${nn} nuit${s_(nn)} : ${eur(l.prix_nuit * nn + Number(l.menage || 0))}${Number(l.menage) > 0 ? ', ménage compris' : ''}</span>` : ''}</p>
      <p class="res-pied">${l.pos?.approx ? '<span class="approx">Position approximative (commune)</span>' : !l.pos ? '<span class="approx">Pas encore sur la carte</span>' : '<span></span>'}
        <button type="button" class="lien comp-l" data-comparer="${l.id}" aria-pressed="${compares().includes(l.id)}">${ico('comparer')} Comparer</button></p>
    </div>${coeurBtn(l.id)}</article>`;
}

// ---------------------------------------------------------------- carte
async function preparerCarte() {
  if (!RCH || RCH.carte || RCH.prepare) return;
  const el = $('#carteRech'); if (!el || !el.offsetWidth) return;   // carte cachée (téléphone, vue « Liste ») : créée au premier affichage
  RCH.prepare = true;
  try {
    const L = await chargerCarte(); if (!RCH || !document.body.contains(el)) return;
    const c = CENTRES[RCH.terr] || CENTRES.Martinique;
    const m = fondCarte(L, el, [c[0], c[1]], c[2], { scrollWheelZoom: true, zoomControl: true });
    Object.assign(RCH, { L, carte: m, calque: L.layerGroup().addTo(m) });
    $('#carteAttente')?.remove();
    m.on('moveend', () => { if (RCH && !RCH.prog) $('#zoneBtn').hidden = false; });
    // fenêtre redimensionnée (ou barre d'adresse du téléphone) : la carte bouge sans que la personne l'ait déplacée
    m.on('resize', () => { if (!RCH) return; RCH.prog = true; clearTimeout(RCH.progT); RCH.progT = setTimeout(() => { if (RCH) RCH.prog = false; }, 450); });
    m.on('click', fermerApercu);
    window.__carteKaz = m;   // tests
    majCarte(true);
  } catch (e) { const a = $('#carteAttente'); if (a) a.textContent = 'Carte indisponible pour le moment : la liste reste à jour.'; }
  finally { if (RCH) RCH.prepare = false; }
}
function ajusterCarte() {
  if (!RCH?.carte) return;
  const pts = RCH.res.filter(l => l.pos).map(l => [l.pos.lat, l.pos.lng]);
  RCH.prog = true; clearTimeout(RCH.progT);
  if (pts.length) RCH.carte.fitBounds(pts, { padding: [56, 56], maxZoom: 13, animate: false });
  else { const c = CENTRES[RCH.terr] || CENTRES.Martinique; RCH.carte.setView([c[0], c[1]], c[2], { animate: false }); }
  RCH.progT = setTimeout(() => { if (RCH) RCH.prog = false; }, 350);
}
const prixCourt = n => Math.round(Number(n)).toLocaleString('fr-FR') + ' €';
// un point par emplacement : plusieurs logements au même endroit (même commune sans point précis) = « dès … » et leur nombre
function majCarte(ajuster) {
  if (!RCH?.carte) return;
  const L = RCH.L; RCH.calque.clearLayers(); RCH.marqueurs = new Map();
  const groupes = new Map();
  RCH.res.forEach(l => { if (!l.pos) return; const k = l.pos.lat.toFixed(4) + ',' + l.pos.lng.toFixed(4); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(l); });
  for (const ls of groupes.values()) {
    const min = Math.min(...ls.map(x => Number(x.prix_nuit))), approx = ls.every(x => x.pos.approx);
    const texte = ls.length > 1 ? `dès ${prixCourt(min)} <i>${ls.length}</i>` : prixCourt(min);
    const nom = ls.length > 1 ? `${ls.length} logements ${aLieu(ls[0].commune)}, dès ${eur(min)} la nuit` : `${ls[0].titre}, ${eur(min)} la nuit${approx ? ', position approximative' : ''}`;
    const m = L.marker([ls[0].pos.lat, ls[0].pos.lng], { icon: L.divIcon({ className: 'pm-ic', html: `<span class="pm${approx ? ' approx' : ''}">${texte}</span>`, iconSize: null }), title: nom, keyboard: true, riseOnHover: true });
    m.on('add', () => { const e = m.getElement(); if (e) { e.setAttribute('aria-label', nom); e.dataset.ids = ls.map(x => x.id).join(','); } });
    m.on('click', () => selectionner(ls.map(x => x.id), true));
    m.on('keydown', e => { if (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ') { e.originalEvent.preventDefault(); selectionner(ls.map(x => x.id), true); } });   // Leaflet ne le fait que pour les marqueurs à bulle
    m.on('mouseover', () => allumer(ls.map(x => x.id)));
    m.on('mouseout', () => allumer([]));
    m.addTo(RCH.calque);
    ls.forEach(x => RCH.marqueurs.set(x.id, m));
  }
  if (ajuster && !RCH.r.zone) ajusterCarte();
}
// une carte de la liste et son prix sur la carte s'éclairent ensemble (survol, focus clavier, sélection)
function surligner(id) {
  if (!RCH) return;
  const etat = x => RCH.allumes.has(x) || RCH.sel.includes(x);
  document.querySelector(`.res[data-id="${id}"]`)?.classList.toggle('actif', etat(id));
  const m = RCH.marqueurs.get(id), el = m?.getElement(); if (!el) return;
  const on = (el.dataset.ids || id).split(',').some(etat);
  el.querySelector('.pm')?.classList.toggle('actif', on); m.setZIndexOffset(on ? 1000 : 0);
}
function allumer(ids) {
  if (!RCH) return;
  const avant = [...RCH.allumes]; if (avant.join() === ids.join()) return;
  RCH.allumes = new Set(ids); [...avant, ...ids].forEach(surligner);
}
function selectionner(ids, depuisCarte) {
  const avant = RCH.sel; RCH.sel = ids; [...avant, ...ids].forEach(surligner);
  const ls = ids.map(id => RCH.res.find(x => x.id === id)).filter(Boolean); if (!ls.length) return;
  const ap = $('#apercu');
  ap.innerHTML = `${ls.length > 1 ? `<div class="ap-tete">${ls.length} logements ${esc(aLieu(ls[0].commune))}</div>` : ''}<div class="${ls.length > 1 ? 'ap-liste' : ''}">${ls.map(l => `<a class="ap-l" href="#/logement/${l.id}${qsDates(RCH.r)}">
      ${l.photos?.[0] ? `<img src="${esc(photo(l.photos[0]))}" alt="">` : '<span class="ap-vide"></span>'}<span class="ap-c"><b>${esc(l.titre)}</b><span>${esc(TYPES[l.type] || '')} · ${l.voyageurs} voy. · ${l.chambres} ch.</span>
      <span class="p"><b>${eur(l.prix_nuit)}</b> / nuit</span>${l.pos?.approx ? '<span>Position approximative</span>' : ''}</span></a>`).join('')}</div>
    <button type="button" class="ap-fermer" id="apFermer" aria-label="Fermer l’aperçu">${ico('fermer')}</button>`;
  ap.hidden = false;
  $('#apFermer').addEventListener('click', fermerApercu);
  if (depuisCarte && matchMedia('(min-width: 1024px)').matches) document.querySelector(`.res[data-id="${ids[0]}"]`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function fermerApercu() { if (!RCH) return; const s = RCH.sel; RCH.sel = []; s.forEach(surligner); const ap = $('#apercu'); if (ap) { ap.hidden = true; ap.innerHTML = ''; } }

// ---------------------------------------------------------------- changer les critères (sans recharger la page ni ajouter d'étape à l'historique)
function appliquer(o = {}) {
  if (!RCH) return;
  history.replaceState(history.state, '', adresseRecherche(RCH.r));
  pageEnCours = location.hash;
  RCH.page = PAR_PAGE; fermerApercu(); barreRapide(); rendreListe(); majCarte(!o.garderVue); mesurerBarre();
}
function basculerVue(v) {
  RCH.r.vue = v; document.body.classList.toggle('vue-carte', v === 'carte');
  history.replaceState(history.state, '', adresseRecherche(RCH.r)); pageEnCours = location.hash;
  const b = $('#bascule'); b.innerHTML = v === 'carte' ? `${ico('liste')} Liste` : `${ico('carte')} Carte`; b.setAttribute('aria-label', v === 'carte' ? 'Voir la liste des logements' : 'Voir la carte des logements');
  if (v === 'carte') { if (!RCH.carte) preparerCarte(); else { RCH.prog = true; RCH.carte.invalidateSize(); if (!RCH.r.zone) ajusterCarte(); else setTimeout(() => { RCH.prog = false; }, 350); } }
  else { fermerApercu(); window.scrollTo(0, 0); }
}
function brancherPage() {
  const f = $('#fRech'), r = RCH.r;
  brancherVilles(f.territoire, 'villesR');
  basculerVue(r.vue);
  let minuterie = null;
  const lireForm = () => {
    const d = Object.fromEntries(new FormData(f));
    if (d.arrivee && d.depart && d.depart <= d.arrivee) { toast('Le départ doit être après l’arrivée.', true); return false; }
    const lieuChange = d.territoire !== (r.territoire || RCH.terr) || d.commune.trim() !== r.commune;
    Object.assign(r, { territoire: d.territoire || '', commune: d.commune.trim().slice(0, 60), arrivee: d.arrivee, depart: d.depart, voyageurs: Number(d.voyageurs) > 0 ? Math.min(40, Math.round(Number(d.voyageurs))) : null });
    if (lieuChange) r.zone = null;
    if (d.depart) f.depart.min = d.arrivee ? plus(d.arrivee, 1) : auj();
    return true;
  };
  const relancer = async () => {
    if (!lireForm()) return;
    if (RCH?.d) RCH.d.libres = r.arrivee && r.depart ? await memoK(`libres-${r.arrivee}-${r.depart}`, () => q(sb.rpc('logements_libres', { d1: r.arrivee, d2: r.depart })).then(l => new Set(l)), 60000).catch(() => null) : null;
    if (RCH) appliquer();
  };
  f.addEventListener('change', relancer);
  f.commune.addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(relancer, 450); });
  f.addEventListener('submit', e => { e.preventDefault(); relancer(); });
  $('#resume').addEventListener('click', () => { const o = document.querySelector('.rech').classList.toggle('rech-ouvert'); $('#resume').setAttribute('aria-expanded', String(o)); mesurerBarre(); if (o) f.territoire.focus(); });
  $('#bascule').addEventListener('click', () => basculerVue(RCH.r.vue === 'carte' ? 'liste' : 'carte'));
  $('#zoneBtn').addEventListener('click', () => {
    const b = RCH.carte.getBounds(); r.zone = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]; r.commune = ''; f.commune.value = '';
    $('#zoneBtn').hidden = true; appliquer({ garderVue: true });
  });
  // barre rapide : équipements, types, zone, favoris, filtres
  $('#rechL2').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'ouvrirFiltres') return ouvrirFiltres();
    if (b.id === 'effZone') { r.zone = null; return appliquer(); }
    if (b.id === 'effFav') { r.favoris = false; return appliquer(); }
    if (b.dataset.eq) r.eq = r.eq.includes(b.dataset.eq) ? r.eq.filter(x => x !== b.dataset.eq) : [...r.eq, b.dataset.eq];
    if (b.dataset.type) r.types = r.types.includes(b.dataset.type) ? r.types.filter(x => x !== b.dataset.type) : [...r.types, b.dataset.type];
    appliquer(); $(`#rechL2 [data-eq="${b.dataset.eq}"], #rechL2 [data-type="${b.dataset.type}"]`)?.focus();
  });
  // liste : tri, territoires, plus de résultats, alertes, états vides ; survol et focus éclairent le prix sur la carte
  const liste = $('#rechListe');
  liste.addEventListener('change', e => { if (e.target.id === 'triRech') { r.tri = e.target.value; appliquer({ garderVue: true }); $('#triRech')?.focus(); } });
  liste.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.terr) { r.territoire = b.dataset.terr; r.zone = null; r.commune = ''; f.commune.value = ''; return appliquer(); }
    if (b.id === 'plusRes') { const avant = RCH.page; RCH.page += PAR_PAGE; $('#resListe').insertAdjacentHTML('beforeend', RCH.res.slice(avant, RCH.page).map(carteResultat).join('')); if (RCH.page >= RCH.res.length) b.parentElement.remove(); else b.textContent = `Afficher ${Math.min(PAR_PAGE, RCH.res.length - RCH.page)} logements de plus`; return; }
    if (b.hasAttribute('data-alerte')) return creerAlerte();
    const a = b.dataset.act;
    if (a === 'filtres') Object.assign(r, { pmin: null, pmax: null, types: [], ch: null, eq: [], tri: 'recent' });
    else if (a === 'zone') r.zone = null;
    else if (a === 'dates') { r.arrivee = ''; r.depart = ''; f.arrivee.value = ''; f.depart.value = ''; if (RCH.d) RCH.d.libres = null; }
    else if (a === 'commune') { r.commune = ''; f.commune.value = ''; }
    else return;
    appliquer();
  });
  const survol = id => allumer(id ? [id] : []);
  liste.addEventListener('mouseover', e => survol(e.target.closest('.res')?.dataset.id || null));
  liste.addEventListener('mouseleave', () => survol(null));
  liste.addEventListener('focusin', e => survol(e.target.closest('.res')?.dataset.id || null));
}

// ---------------------------------------------------------------- filtres : feuille du bas sur téléphone, fenêtre sur ordinateur
function dialogueFiltres(r) {
  return `<dialog class="feuille" id="dFiltres" aria-labelledby="tFiltres"><form method="dialog" id="fFiltres">
    <div class="feuille-tete"><h2 id="tFiltres" tabindex="-1" autofocus>Filtres</h2><button type="button" class="rond" id="fermerFiltres" aria-label="Fermer les filtres">${ico('fermer')}</button></div>
    <div class="feuille-corps">
      <fieldset class="groupe"><legend>Budget par nuit</legend><div class="budget"><label>Minimum (€)<input type="number" name="pmin" min="1" max="20000" step="10" inputmode="numeric" placeholder="Aucun"></label>
        <label>Maximum (€)<input type="number" name="pmax" min="1" max="20000" step="10" inputmode="numeric" placeholder="Aucun"></label></div></fieldset>
      <fieldset class="groupe"><legend>Type de logement</legend><div class="choix">${Object.entries(TYPES).map(([k, t]) => `<label><input type="checkbox" name="types" value="${k}"><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="groupe"><legend>Chambres</legend><div class="choix">${[['', 'Indifférent'], ['1', '1 ou plus'], ['2', '2 ou plus'], ['3', '3 ou plus'], ['4', '4 ou plus'], ['5', '5 ou plus']]
        .map(([v, t]) => `<label><input type="radio" name="ch" value="${v}"><span>${t}</span></label>`).join('')}</div></fieldset>
      <fieldset class="groupe"><legend>Équipements</legend><p class="aide">Les logements proposés ont tous les équipements choisis.</p>
        <div class="choix">${EQUIP.map(([k, i, t]) => `<label><input type="checkbox" name="eq" value="${k}"><span><span aria-hidden="true">${i}</span> ${esc(t)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="groupe"><legend>Ordre des résultats</legend><label class="champ">Trier par<select name="tri">${opts(TRIS, r.tri)}</select></label>
        <p class="aide">Sans choix : les annonces les plus récentes d’abord. Aucun logement n’est mis en avant contre paiement.</p></fieldset>
    </div>
    <div class="feuille-pied"><button type="button" class="lien" id="effFiltres">Tout effacer</button><button type="submit" class="btn btn-p" id="voirRes">Voir les logements</button></div></form></dialog>`;
}
function ouvrirFiltres() {
  const d = $('#dFiltres'), f = $('#fFiltres'), r = RCH.r;
  const remplir = () => {
    f.pmin.value = r.pmin || ''; f.pmax.value = r.pmax || ''; f.tri.value = r.tri;
    f.querySelectorAll('[name=types]').forEach(c => { c.checked = r.types.includes(c.value); });
    f.querySelectorAll('[name=eq]').forEach(c => { c.checked = r.eq.includes(c.value); });
    f.querySelectorAll('[name=ch]').forEach(c => { c.checked = c.value === String(r.ch || ''); });
  };
  const compter = () => { const n = RCH.d ? filtrer(r, RCH.d, RCH.terr).length : 0; $('#voirRes').textContent = RCH.d ? `Voir ${n} logement${s_(n)}` : 'Voir les logements'; };
  const lire = () => {
    const n = v => Number(v) > 0 ? Math.round(Number(v)) : null, g = new FormData(f);
    Object.assign(r, { pmin: n(f.pmin.value), pmax: n(f.pmax.value), tri: f.tri.value, types: g.getAll('types'), eq: g.getAll('eq'), ch: n(g.get('ch')) });
    compter(); appliquer({ garderVue: true });
  };
  if (!d.dataset.branche) {
    d.dataset.branche = '1';
    f.addEventListener('change', lire);
    $('#effFiltres').addEventListener('click', () => { Object.assign(r, { pmin: null, pmax: null, types: [], ch: null, eq: [], tri: 'recent' }); remplir(); compter(); appliquer(); });
    $('#fermerFiltres').addEventListener('click', () => d.close());
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => { $('#ouvrirFiltres')?.focus(); if (!r.zone) ajusterCarte(); });
  }
  remplir(); compter(); d.showModal();
}

// ---------------------------------------------------------------- alertes de recherche (agence.sql) : nom et critères, notification dans le compte
const nomAlerte = (r, terr) => [r.types.length ? r.types.map(t => TYPES[t]).join(' ou ') : 'Logement', r.commune ? aLieu(r.commune) : PREPO[terr] || '', r.pmax ? `jusqu’à ${r.pmax} €` : '',
  r.voyageurs ? `${r.voyageurs} voyageur${s_(r.voyageurs)}` : ''].filter(Boolean).join(', ').slice(0, 80);
async function creerAlerte() {
  if (!exigeCompte() || !RCH) return;
  const r = RCH.r, terr = RCH.terr === 'partout' ? null : RCH.terr;
  try {
    await q(sb.from('alertes_logement').insert({ nom: nomAlerte(r, RCH.terr), territoire: terr, commune: r.commune || null, types: r.types, prix_max: r.pmax || null,
      voyageurs: r.voyageurs || null, chambres: r.ch || null, equipements: r.eq }));
    toast(`Alerte créée${r.zone ? ' (la zone de la carte n’est pas gardée)' : ''} : nous vous prévenons dans votre espace dès qu’un logement correspond.`);
    document.querySelectorAll('[data-alerte]').forEach(b => { b.disabled = true; b.innerHTML = `${ico('check')} Alerte créée`; });
  } catch (e) { toast(erreur(e), true); }
}
const resumeAlerte = a => [a.territoire || 'Tous les territoires', a.commune, a.types.length ? a.types.map(t => TYPES[t] || t).join(', ') : '', a.prix_max ? `jusqu’à ${eur(a.prix_max)} la nuit` : '',
  a.voyageurs ? `${a.voyageurs} voyageur${s_(a.voyageurs)}` : '', a.chambres ? `${a.chambres} chambre${s_(a.chambres)} ou plus` : '',
  a.equipements.map(e => EQUIP.find(x => x[0] === e)?.[2] || e).join(', ')].filter(Boolean).join(' · ');
const lienAlerte = a => {
  const p = new URLSearchParams(); if (a.territoire) p.set('territoire', a.territoire); if (a.commune) p.set('commune', a.commune);
  if (a.types.length) p.set('types', a.types.join(',')); if (a.prix_max) p.set('pmax', Math.round(a.prix_max)); if (a.voyageurs) p.set('voyageurs', a.voyageurs);
  if (a.chambres) p.set('ch', a.chambres); if (a.equipements.length) p.set('eq', a.equipements.join(',')); p.set('alerte', a.id); return '#/recherche?' + p;
};
async function ongletAlertes(c) {
  if (!(await agenceInstallee())) { c.innerHTML = '<h1>Mes alertes</h1><div class="vide-etat"><div class="ico">🔔</div><h3>Les alertes arrivent très bientôt</h3></div>'; return; }
  const a = await q(sb.from('alertes_logement').select('*').order('created_at', { ascending: false }));
  const nouv = await Promise.all(a.map(x => x.active ? q(sb.rpc('logements_alerte', { aid: x.id, depuis: x.vu_le })).then(l => l.length, () => 0) : 0));
  c.innerHTML = `<div class="titre-s"><h1>Mes alertes</h1><a class="btn btn-s" href="#/recherche">${ico('plus')} Nouvelle recherche</a></div>
    <p class="muted">Quand un logement qui répond à une alerte est publié, une notification arrive dans votre espace (Notifications). 10 alertes au plus.</p>
    ${a.length ? a.map((x, i) => `<div class="alerte-l"><div><b>${esc(x.nom)}</b> ${x.active ? (nouv[i] ? `<span class="tag ok">${nouv[i]} nouveauté${s_(nouv[i])}</span>` : '') : '<span class="tag gris">En pause</span>'}
        <div class="muted petit">${esc(resumeAlerte(x))}</div></div>
      <div class="actions"><a class="btn btn-s btn-p" href="${lienAlerte(x)}">Voir les logements</a><button type="button" class="btn btn-s" data-pause="${x.id}" data-actif="${x.active}">${x.active ? 'Mettre en pause' : 'Réactiver'}</button>
        <button type="button" class="btn btn-s btn-ko" data-suppr-alerte="${x.id}" aria-label="Supprimer l’alerte ${esc(x.nom)}">Supprimer</button></div></div>`).join('')
      : `<div class="vide-etat"><div class="ico">🔔</div><h3>Pas encore d’alerte</h3><p class="muted">Faites une recherche, puis touchez « Créer une alerte » : nous vous prévenons dès qu’un logement correspond.</p><a class="btn btn-p" href="#/recherche">Chercher un logement</a></div>`}`;
  c.onclick = async e => {
    const p = e.target.closest('[data-pause]'), s = e.target.closest('[data-suppr-alerte]');
    try {
      if (p) await q(sb.from('alertes_logement').update({ active: p.dataset.actif !== 'true' }).eq('id', p.dataset.pause));
      else if (s) { if (!confirm('Supprimer cette alerte ?')) return; await q(sb.from('alertes_logement').delete().eq('id', s.dataset.supprAlerte)); }
      else return;
      toast('C’est fait.'); ongletAlertes(c);
    } catch (err) { toast(erreur(err), true); }
  };
}
// notifications de Kaz An Nou (alertes) et demandes faites à l'équipe (estimation, accompagnement)
async function ongletNotifs(c) {
  const [n, a] = await Promise.all([
    q(sb.from('notifs').select('*').ilike('lien', 'https://immo.ilo-tech.com/%').order('created_at', { ascending: false }).limit(50)).catch(() => []),
    q(sb.from('assistance').select('id, sujet, message, statut, reponse, created_at, repondu_at').eq('appli', 'kaz').order('created_at', { ascending: false }).limit(20)).catch(() => [])]);
  const local = l => String(l || '').replace(/^https:\/\/immo\.ilo-tech\.com\/(#\/)?/, '#/');
  c.innerHTML = `<h1>Notifications</h1>
    ${n.length ? n.map(x => `<a class="notif-l ${x.lu ? 'lue' : ''}" href="${esc(local(x.lien))}"><span class="pt" aria-hidden="true"></span><span><span>${esc(x.texte)}</span><br><small class="muted">${new Date(x.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${x.lu ? '' : ' · nouvelle'}</small></span></a>`).join('')
      : '<div class="vide-etat"><div class="ico">🔔</div><h3>Aucune notification</h3><p class="muted">Les nouveaux logements de vos alertes arriveront ici.</p></div>'}
    ${a.length ? `<h2 style="margin-top:26px">Vos demandes à l’équipe</h2>${a.map(x => `<div class="encadre" style="margin-bottom:10px"><div class="muted petit">${jourLong(x.created_at.slice(0, 10))} · ${x.statut === 'ouverte' ? 'en attente de réponse' : 'répondu'}</div>
      <p style="white-space:pre-line;margin:6px 0">${esc(x.message)}</p>${x.reponse ? `<p style="margin:0"><b>Réponse :</b> ${esc(x.reponse)}</p>` : ''}</div>`).join('')}` : ''}`;
  const nonLues = n.filter(x => !x.lu).map(x => x.id);
  if (nonLues.length) { await sb.from('notifs').update({ lu: true }).in('id', nonLues); compteurs.notifs = 0; nav(); }
}

// ---------------------------------------------------------------- comparateur (jusqu'à 4 logements côte à côte)
async function pageComparer() {
  const ids = compares();
  if (!ids.length) return vue(`<div class="wrap" style="padding-top:24px"><h1>Comparateur</h1><div class="vide-etat"><div class="ico">⚖️</div><h3>Rien à comparer pour l’instant</h3>
    <p class="muted">Touchez « Comparer » sur 2 à 4 logements (dans la recherche, vos favoris ou une annonce) pour les voir côte à côte.</p>
    <div class="actions"><a class="btn btn-p" href="#/recherche">Chercher des logements</a><a class="btn" href="#/compte/favoris">Mes favoris</a></div></div></div>`);
  vue('<div class="wrap" style="padding-top:24px" aria-busy="true"><i class="sq sq-t"></i><i class="sq" style="height:360px"></i></div>');
  try {
    const avecPoint = await agenceInstallee();
    const l = await q(sb.from('logements').select('*').in('id', ids).eq('statut', 'publie')), n = await notesDe(l.map(x => x.id));
    const ls = ids.map(id => l.find(x => x.id === id)).filter(Boolean);
    const total7 = x => Number(x.prix_nuit) * 7 + Number(x.menage || 0), min = f => Math.min(...ls.map(f)), max = f => Math.max(...ls.map(f));
    const mieux = (x, f, sens) => ls.length > 1 && f(x) === (sens < 0 ? min(f) : max(f)) ? ' class="mieux"' : '';
    const aero = x => { const a = AEROPORTS[x.territoire], p = positionDe(x); return a && p ? Math.round(distanceKm(p, { lat: a[1], lng: a[2] })) : null; };
    const lignes = [
      ['Photo', x => x.photos?.[0] ? `<img src="${esc(photo(x.photos[0]))}" alt="">` : '—'],
      ['Logement', x => `<a href="#/logement/${x.id}"><b>${esc(x.titre)}</b></a><br><span class="muted petit">${esc(TYPES[x.type] || '')}</span>`],
      ['Lieu', x => lieu(x)],
      ['Prix par nuit', x => `<span${mieux(x, y => Number(y.prix_nuit), -1)}>${eur(x.prix_nuit)}</span>`],
      ['Ménage', x => Number(x.menage) > 0 ? eur(x.menage) : 'Compris'],
      ['Exemple : 7 nuits', x => `<span${mieux(x, total7, -1)}>${eur(total7(x))}</span>${x.min_nuits > 7 ? `<br><span class="muted petit">minimum ${x.min_nuits} nuits</span>` : ''}`],
      ['Voyageurs', x => `<span${mieux(x, y => y.voyageurs, 1)}>${x.voyageurs}</span>`],
      ['Chambres · lits', x => `${x.chambres} · ${x.lits}`], ['Salles d’eau', x => x.sdb], ['Séjour minimum', x => `${x.min_nuits} nuit${s_(x.min_nuits)}`],
      ['Note', x => n[x.id] ? `★ ${noteFr(n[x.id].moyenne)} (${n[x.id].nombre} avis)` : 'Pas encore d’avis'],
      ['Aéroport', x => aero(x) !== null ? `${aero(x)} km à vol d’oiseau` : '—'],
      ...(avecPoint ? [['Annulation', x => x.annulation ? ANNULATION[x.annulation][0] : 'À convenir'], ['N° d’enregistrement', x => x.numero_enregistrement ? esc(x.numero_enregistrement) : '—']] : []),
      ...EQUIP.filter(e => ls.some(x => (x.equipements || []).includes(e[0]))).map(e => [`${e[1]} ${esc(e[2])}`, x => (x.equipements || []).includes(e[0]) ? '✓ Oui' : '<span class="muted">—</span>']),
      ['', x => `<button type="button" class="btn btn-s" data-retirer="${x.id}">Retirer</button>`]];
    vue(`<div class="wrap" style="padding:24px 0 40px"><div class="titre-s"><h1>Comparateur</h1><a class="btn btn-s" href="#/recherche">${ico('plus')} Ajouter des logements</a></div>
      <p class="muted">${ls.length} logement${s_(ls.length)} côte à côte. En vert : le meilleur de chaque ligne (prix le plus bas, le plus de voyageurs).${ls.length < ids.length ? ' Un logement retiré de la location n’apparaît plus.' : ''}</p>
      <div class="tableau-defile"><table class="comp"><caption class="sr">Comparaison des logements</caption><tbody>
        ${lignes.map(([t, f]) => `<tr><th scope="row">${t}</th>${ls.map(x => `<td>${f(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`);
    $('#app').onclick = e => { const b = e.target.closest('[data-retirer]'); if (b) { basculerComparer(b.dataset.retirer); pageComparer(); } };
    surDepart(() => { $('#app').onclick = null; });
  } catch (e) { vue(`<div class="wrap" style="padding-top:24px">${erreurEtat(e)}</div>`); }
}
