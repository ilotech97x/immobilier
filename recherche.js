/* Kaz An Nou — recherche façon agence immobilière : les résultats d'un côté, la carte de l'autre (Leaflet + OpenStreetMap, hébergé).
   Prix posés sur la carte, carte et liste qui se répondent, « Rechercher dans cette zone », filtres, alertes et comparateur.
   Logements publiés seulement (règles de la base). Position : le point de l'hôte arrondi à ~300 m par la base (agence.sql),
   sinon la mairie de la commune (lieux.js), marquée « position approximative ». Chargé avant kaz.js : n'utilise ses outils qu'à l'appel. */
'use strict';

const EQ_RAPIDES = ['piscine', 'vue_mer', 'plage', 'citerne', 'groupe', 'clim', 'animaux', 'pmr'];
const PREPO = { Martinique: 'en Martinique', Guadeloupe: 'en Guadeloupe', Guyane: 'en Guyane', 'Saint-Martin': 'à Saint-Martin', 'Saint-Barthélemy': 'à Saint-Barthélemy',
  'La Réunion': 'à La Réunion', Mayotte: 'à Mayotte', 'Hexagone et Corse': 'dans l’Hexagone et en Corse', 'Autre pays': 'hors de France', partout: 'dans tous les territoires' };
const TRIS = { recent: 'Les plus récents', pertinence: 'Pertinence', prix: 'Prix croissant', prix_desc: 'Prix décroissant', surface: 'Plus grande surface', note: 'Mieux notés' };
const CLASSES_DPE = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
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
    voyageurs: n(p.voyageurs, 1, 40), pmin: n(p.pmin, 1, 50000), pmax: n(p.pmax, 1, 50000), ch: n(p.ch, 1, 30), lits: n(p.lits, 1, 60), sdb: n(p.sdb, 1, 30),
    types: liste(p.types).filter(t => TYPES[t]), eq: liste(p.eq).filter(e => EQUIP.some(x => x[0] === e)),
    formule: p.formule === 'location' ? 'location' : '', surf: n(p.surf, 1, 2000), dpe: CLASSES_DPE.includes(p.dpe) ? p.dpe : '', meuble: p.meuble === 'oui' || p.meuble === 'non' ? p.meuble : '',
    dispo: date(p.dispo), duree: n(p.duree, 1, 120), annul: liste(p.annul).filter(a => ANNULATION[a]),
    tri: TRIS[p.tri] ? p.tri : 'recent', zone: z.length === 4 && z.every(Number.isFinite) ? z : null,
    favoris: p.favoris === '1', alerte: /^[0-9a-f-]{36}$/.test(p.alerte || '') ? p.alerte : '', vue: p.vue === 'carte' ? 'carte' : 'liste',
  };
}
function adresseRecherche(r) {
  const p = new URLSearchParams();
  ['territoire', 'commune', 'arrivee', 'depart', 'voyageurs', 'pmin', 'pmax', 'ch', 'lits', 'sdb', 'formule', 'surf', 'dpe', 'meuble', 'dispo', 'duree'].forEach(k => r[k] && p.set(k, r[k]));
  if (r.types.length) p.set('types', r.types.join(','));
  if (r.eq.length) p.set('eq', r.eq.join(','));
  if (r.annul.length) p.set('annul', r.annul.join(','));
  if (r.tri !== 'recent') p.set('tri', r.tri);
  if (r.zone) p.set('zone', r.zone.map(x => x.toFixed(4)).join(','));
  if (r.favoris) p.set('favoris', '1');
  if (r.vue === 'carte') p.set('vue', 'carte');
  const s = p.toString(); return '#/recherche' + (s ? '?' + s : '');
}
// les filtres du panneau, remis à zéro (le lieu, les dates et la zone ont leurs propres boutons)
const filtresVides = () => ({ formule: '', pmin: null, pmax: null, types: [], ch: null, lits: null, sdb: null, eq: [], surf: null, dpe: '', meuble: '', dispo: '', duree: null, annul: [], tri: 'recent' });
const enLocation = r => r.formule === 'location';
// prix du logement pour la recherche : par nuit pour un séjour, par mois pour une location
const prixDe = (l, r) => Number(enLocation(r) ? l.loyer_mois : l.prix_nuit);
const eurCourt = n => Math.round(n).toLocaleString('fr-FR') + ' €';
// une pastille par filtre actif : { t: texte, off: retire ce filtre }
function pastilles(r) {
  const u = enLocation(r) ? '/ mois' : '/ nuit', P = [], plus = (t, off) => P.push({ t, off });
  const nomEq = k => EQUIP.find(x => x[0] === k)?.[2] || k;
  if (enLocation(r)) plus('Location', x => Object.assign(x, { formule: '', pmin: null, pmax: null, meuble: '', dpe: '', dispo: '', duree: null }));
  if (r.arrivee && r.depart) plus(`${jour(r.arrivee)} → ${jour(r.depart)}`, x => { x.arrivee = ''; x.depart = ''; });
  if (r.commune) plus(r.commune, x => { x.commune = ''; });
  if (r.pmin || r.pmax) plus(r.pmin && r.pmax ? `${eurCourt(r.pmin)} à ${eurCourt(r.pmax)} ${u}` : r.pmin ? `Dès ${eurCourt(r.pmin)} ${u}` : `Jusqu’à ${eurCourt(r.pmax)} ${u}`, x => { x.pmin = null; x.pmax = null; });
  if (r.voyageurs && !enLocation(r)) plus(`${r.voyageurs} voyageur${s_(r.voyageurs)}`, x => { x.voyageurs = null; });
  r.types.forEach(t => plus(TYPES[t], x => { x.types = x.types.filter(y => y !== t); }));
  if (r.ch) plus(`${r.ch} chambre${s_(r.ch)} ou plus`, x => { x.ch = null; });
  if (r.lits) plus(`${r.lits} lit${s_(r.lits)} ou plus`, x => { x.lits = null; });
  if (r.sdb) plus(`${r.sdb} salle${s_(r.sdb)} d’eau ou plus`, x => { x.sdb = null; });
  r.eq.forEach(k => plus(nomEq(k), x => { x.eq = x.eq.filter(y => y !== k); }));
  if (r.surf) plus(`${r.surf} m² ou plus`, x => { x.surf = null; });
  if (r.dpe) plus(`DPE ${r.dpe} ou mieux`, x => { x.dpe = ''; });
  if (r.meuble) plus(r.meuble === 'oui' ? 'Meublé' : 'Vide', x => { x.meuble = ''; });
  if (r.dispo) plus(`Libre le ${jour(r.dispo)}`, x => { x.dispo = ''; });
  if (r.duree) plus(`Pour ${r.duree} mois`, x => { x.duree = null; });
  r.annul.forEach(a => plus(`Annulation ${ANNULATION[a][0].toLowerCase()}`, x => { x.annul = x.annul.filter(y => y !== a); }));
  return P;
}
const nbFiltres = r => pastilles(r).length + (r.tri !== 'recent' ? 1 : 0);

// ---------------------------------------------------------------- données : tous les logements publiés (300 au plus), filtrés sur l'appareil
async function donneesRecherche(r) {
  const [avecPoint] = await Promise.all([agenceInstallee(), locInstallee()]);
  const cols = 'id, owner, titre, type, territoire, commune, quartier, chambres, lits, sdb, voyageurs, prix_nuit, menage, min_nuits, equipements, photos, created_at, updated_at' + (avecPoint ? ', lat, lng, annulation' : '')
    + (LOC_ON ? ', formule, loyer_mois, charges_mois, surface_m2, dpe, meuble, duree_min_mois, duree_max_mois, dispo_le' : '');
  const [liste, notes, libres] = await Promise.all([
    memoK('publies', () => q(sb.from('logements').select(cols).eq('statut', 'publie').order('created_at', { ascending: false }).limit(300)), 60000),   // séjours et locations ; la page filtre selon la formule
    memoK('notes', () => q(sb.from('notes').select('cible, moyenne, nombre').limit(5000)).then(n => Object.fromEntries(n.map(x => [x.cible, x]))), 60000),
    r.arrivee && r.depart && r.depart > r.arrivee ? memoK(`libres-${r.arrivee}-${r.depart}`, () => q(sb.rpc('logements_libres', { d1: r.arrivee, d2: r.depart })).then(l => new Set(l)), 60000) : null]);
  return { liste: liste.map(l => ({ ...l, pos: positionDe(l) })), notes, libres, agence: avecPoint };
}
function filtrer(r, d, terr) {
  const nc = normCommune(r.commune), loc = enLocation(r), nn = !loc && r.arrivee && r.depart ? nuits(r.arrivee, r.depart) : 0, rang = r.dpe ? CLASSES_DPE.indexOf(r.dpe) : -1;
  return d.liste.filter(l => {
    const f = l.formule || 'sejour';
    return (loc ? f !== 'sejour' && Number(l.loyer_mois) > 0 : f !== 'location') &&   // séjours : tout sauf la location seule (elle n'a pas de prix à la nuit)
      (!terr || terr === 'partout' || l.territoire === terr) && (!nc || normCommune(l.commune).includes(nc)) &&
      (loc || ((!d.libres || d.libres.has(l.id)) && (!nn || nn >= l.min_nuits) && (!r.voyageurs || l.voyageurs >= r.voyageurs) && (!r.annul.length || r.annul.includes(l.annulation)))) &&
      (!r.pmin || prixDe(l, r) >= r.pmin) && (!r.pmax || prixDe(l, r) <= r.pmax) && (!r.ch || l.chambres >= r.ch) && (!r.lits || l.lits >= r.lits) && (!r.sdb || l.sdb >= r.sdb) &&
      (!r.surf || Number(l.surface_m2) >= r.surf) && (!r.dpe || (CLASSES_DPE.indexOf(l.dpe) >= 0 && CLASSES_DPE.indexOf(l.dpe) <= rang)) &&
      (!r.meuble || l.meuble === (r.meuble === 'oui')) && (!r.dispo || !l.dispo_le || j10(l.dispo_le) <= r.dispo) &&
      (!r.duree || ((!l.duree_min_mois || l.duree_min_mois <= r.duree) && (!l.duree_max_mois || l.duree_max_mois >= r.duree))) &&
      (!r.types.length || r.types.includes(l.type)) && r.eq.every(e => (l.equipements || []).includes(e)) && (!r.favoris || favoris.has(l.id)) &&
      (!r.zone || (l.pos && l.pos.lat >= r.zone[0] && l.pos.lat <= r.zone[2] && l.pos.lng >= r.zone[1] && l.pos.lng <= r.zone[3]));
  });
}
// territoire affiché : celui demandé, sinon la Martinique si elle a des logements, sinon le territoire qui en a le plus
function territoireDe(r, tous) {
  if (r.territoire) return r.territoire;
  const n = {}; tous.forEach(l => { n[l.territoire] = (n[l.territoire] || 0) + 1; });
  if (n.Martinique || !tous.length) return 'Martinique';
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
}
// « Pertinence » : les annonces les plus complètes d'abord (photos, point précis sur la carte, équipements, avis réels), puis les plus récentes. Rien n'est payé.
const completude = (l, notes) => Math.min((l.photos || []).length, 6) + (l.pos && !l.pos.approx ? 3 : 0) + Math.min((l.equipements || []).length, 6) * 0.5 + (notes[l.id] ? 2 : 0);
function trier(l, r, notes) {
  const t = [...l], tri = r.tri, prix = x => { const p = prixDe(x, r); return Number.isFinite(p) ? p : Infinity; }, recent = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
  if (tri === 'prix') t.sort((a, b) => prix(a) - prix(b));
  else if (tri === 'prix_desc') t.sort((a, b) => (Number.isFinite(prix(b)) ? prix(b) : -1) - (Number.isFinite(prix(a)) ? prix(a) : -1));
  else if (tri === 'surface') t.sort((a, b) => (Number(b.surface_m2) || 0) - (Number(a.surface_m2) || 0) || recent(a, b));
  else if (tri === 'pertinence') t.sort((a, b) => completude(b, notes) - completude(a, notes) || recent(a, b));
  else if (tri === 'note') t.sort((a, b) => (notes[b.id]?.moyenne || 0) - (notes[a.id]?.moyenne || 0) || (notes[b.id]?.nombre || 0) - (notes[a.id]?.nombre || 0));
  else t.sort(recent);
  return t;
}
// tris proposés : « mieux notés » seulement s'il existe de vrais avis
const trisDispo = d => Object.fromEntries(Object.entries(TRIS).filter(([k]) => k !== 'note' || Object.keys(d?.notes || {}).length));
const compteurAvec = (r, d) => { const t = filtrer(r, d, ''), tt = territoireDe(r, t); return tt === 'partout' ? t.length : t.filter(l => l.territoire === tt).length; };

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
    <div class="rech-corps">${dialogueFiltres(r)}
      <section class="rech-liste" aria-labelledby="rechTitre"><div id="rechListe" aria-busy="true"><h1 class="sr" id="rechTitre">Recherche de logements</h1><i class="sq sq-t"></i>${'<i class="sq sq-carte"></i>'.repeat(4)}</div></section>
      <section class="rech-carte" aria-label="Carte des résultats"><div id="carteRech"></div><div class="carte-attente" id="carteAttente">Carte en préparation…</div>
        ${choix3d('choix3d')}<button type="button" class="recentrer" id="recentrer" aria-label="Recentrer la carte sur les résultats" title="Recentrer sur les résultats">${ico('zone')}</button>
        <button type="button" class="zone-btn" id="zoneBtn" hidden>${ico('zone')} Rechercher dans cette zone</button><div class="apercu" id="apercu" hidden></div></section>
    </div>
    <button type="button" class="bascule" id="bascule"></button></div>`);
  barreRapide(); mesurerBarre(); brancherPage();
  const mq = matchMedia('(min-width: 1024px)'), mqCol = matchMedia(COLONNE_FILTRES), auChangement = () => { placerFiltres(); mesurerBarre(); preparerCarte(); RCH?.carte?.taille(); };
  mq.addEventListener('change', auChangement); mqCol.addEventListener('change', auChangement); addEventListener('resize', mesurerBarre);
  surDepart(() => { mq.removeEventListener('change', auChangement); mqCol.removeEventListener('change', auChangement); removeEventListener('resize', mesurerBarre); RCH?.carte?.detruire(); RCH = null; document.documentElement.style.removeProperty('--barre'); delete window.__carteKaz; });
  await chargerResultats();
}
async function chargerResultats() {
  const el = $('#rechListe'); if (!RCH || !el) return;
  if (!PRET) { el.innerHTML = videLogements(); return; }
  try {
    RCH.d = await donneesRecherche(RCH.r);
    if (!RCH || !$('#rechListe')) return;
    el.removeAttribute('aria-busy');
    if (!LOC_ON) RCH.r.formule = '';   // la location n'est pas encore installée dans la base
    if (RCH.r.tri === 'note' && !Object.keys(RCH.d.notes).length) RCH.r.tri = 'recent';   // pas d'avis : pas de tri par note
    barreRapide(); rendreListe(); majPanneau(); preparerCarte(); majCarte(true);
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
    ${LOC_ON ? `<button type="button" class="puce" data-formule="" aria-pressed="${!enLocation(r)}">🏝️ Séjours</button><button type="button" class="puce" data-formule="location" aria-pressed="${enLocation(r)}">🔑 Location</button><span class="sep" aria-hidden="true"></span>` : ''}
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
  const res = trier(terr === 'partout' ? tous : tous.filter(l => l.territoire === terr), r, d.notes);
  RCH.res = res; RCH.terr = terr; RCH.sel = []; RCH.allumes = new Set();
  const sel = document.querySelector('#fRech [name=territoire]'); if (sel) sel.value = terr;   // le territoire affiché, même choisi pour vous
  const compte = {}; tous.forEach(l => { compte[l.territoire] = (compte[l.territoire] || 0) + 1; });
  const terrs = NOMS_TERRITOIRES.filter(t => compte[t]);   // ordre fixe : Martinique, Guadeloupe… puis Hexagone et autres pays
  const dates = r.arrivee && r.depart;
  const titre = `${res.length} ${enLocation(r) ? 'location' : 'logement'}${s_(res.length)} ${r.commune ? esc(aLieu(r.commune)) : r.zone ? 'dans cette zone' : PREPO[terr] || ''}${dates && !enLocation(r) ? ` libre${s_(res.length)} du ${jour(r.arrivee)} au ${jour(r.depart)}` : ''}${r.favoris ? ' dans vos favoris' : ''}`;
  const sansPoint = res.filter(l => !l.pos).length, approx = res.filter(l => l.pos?.approx).length;
  const el = $('#rechListe');
  el.innerHTML = `<div class="rech-tete"><h1 id="rechTitre" aria-live="polite">${titre}</h1><div class="actions">
      <label class="sr" for="triRech">Trier</label><select id="triRech" class="btn btn-s">${opts(trisDispo(d), r.tri)}</select>
      <button type="button" class="btn btn-s" data-alerte hidden>${ico('cloche')} Créer une alerte</button></div></div>
    ${pastillesHtml(r)}
    <div class="terr">${terrs.length > 1 || (terrs.length === 1 && terrs[0] !== terr) ? `<span role="group" aria-label="Territoires" class="terr-g">${terrs.map(t => `<button type="button" class="puce" data-terr="${esc(t)}" aria-pressed="${t === terr}">${esc(t)} · ${compte[t]}</button>`).join('')}${terrs.length > 1 ? `<button type="button" class="puce" data-terr="partout" aria-pressed="${terr === 'partout'}">Partout · ${tous.length}</button>` : ''}</span>` : ''}
      <details class="classement"><summary>Comment les annonces sont classées</summary><p>Par date de mise en ligne, les plus récentes d’abord, ou selon le tri choisi. « Pertinence » met en tête les annonces les plus complètes (photos, point précis sur la carte, équipements, avis réels). Aucun logement n’est mis en avant contre paiement. Toutes les annonces sont vérifiées par notre équipe avant d’être publiées.</p></details></div>
    ${res.length ? `<div class="res-liste" id="resListe">${res.slice(0, RCH.page).map(carteResultat).join('')}</div>
      ${res.length > RCH.page ? `<div class="plus-res"><button type="button" class="btn" id="plusRes">Afficher ${Math.min(PAR_PAGE, res.length - RCH.page)} logements de plus</button></div>` : ''}
      ${sansPoint || approx ? `<p class="hors-carte">${approx ? `${approx} logement${s_(approx)} placé${s_(approx)} au centre de la commune (point dessiné en pointillé). ` : ''}${sansPoint ? `${sansPoint} logement${s_(sansPoint)} sans position ne figure${sansPoint > 1 ? 'nt' : ''} pas sur la carte.` : ''}</p>` : ''}`
      : videRecherche(r, tous.length)}
    ${vusRecemment(d)}
    <div class="alerte-bloc" data-alerte-bloc hidden><p><b>Rien ne vous convient encore ?</b> Créez une alerte : nous vous prévenons dans votre espace dès qu’un logement correspond.</p><button type="button" class="btn btn-v" data-alerte>${ico('cloche')} Créer une alerte</button></div>`;
  agenceInstallee().then(ok => { if (ok && !enLocation(r)) document.querySelectorAll('#rechListe [data-alerte], #rechListe [data-alerte-bloc]').forEach(b => { b.hidden = false; }); });
  libelleBascule();
}
function videRecherche(r, ailleurs) {
  if (!RCH.d.liste.length) return videLogements();
  const nf = nbFiltres(r);
  // ce qui donnerait des résultats si on retirait un seul filtre
  const pistes = pastilles(r).map((p, i) => { const x = structuredClone(r); p.off(x); return { i, p, n: compteurAvec(x, RCH.d) }; }).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
  return `<div class="vide-etat"><div class="ico">🔎</div><h3>Aucun logement ne correspond</h3>
    <p class="muted">${ailleurs ? 'Il y en a dans un autre territoire : choisissez-le ci-dessus.' : 'Élargissez la recherche : moins de filtres, d’autres dates ou toute la carte.'}</p>
    ${pistes.length ? `<p class="muted petit">En retirant un seul filtre :</p><div class="actions">${pistes.map(x => `<button type="button" class="btn" data-off="${x.i}">Retirer « ${esc(x.p.t)} » : ${x.n} logement${s_(x.n)}</button>`).join('')}</div>` : ''}
    <div class="actions">${nf ? '<button type="button" class="btn" data-act="filtres">Effacer les filtres</button>' : ''}${r.zone ? '<button type="button" class="btn" data-act="zone">Toute la carte</button>' : ''}
      ${r.arrivee ? '<button type="button" class="btn" data-act="dates">Sans dates</button>' : ''}${r.commune ? '<button type="button" class="btn" data-act="commune">Toutes les villes</button>' : ''}</div></div>`;
}
// pastilles des filtres actifs (un toucher retire le filtre) et « Tout effacer »
function pastillesHtml(r) {
  const P = pastilles(r); if (!P.length) return '';
  return `<div class="pastilles" id="pastilles" role="group" aria-label="Filtres actifs">${P.map((p, i) => `<button type="button" class="puce on" data-off="${i}" aria-label="Retirer le filtre : ${esc(p.t)}">${esc(p.t)} ${ico('fermer')}</button>`).join('')}
    <button type="button" class="lien" id="toutEffacer">Tout effacer</button></div>`;
}
// logements vus récemment sur cet appareil (la liste est gardée ici, pas dans la base) ; seulement ceux qui sont encore publiés
function vusRecemment(d) {
  const ids = vusListe(), ls = ids.map(id => d.liste.find(l => l.id === id)).filter(Boolean).slice(0, 8); if (!ls.length) return '';
  return `<section class="vus" aria-labelledby="tVus"><div class="vus-t"><h2 id="tVus">Vus récemment</h2><button type="button" class="lien" id="effVus">Effacer</button></div>
    <div class="vus-l">${ls.map(l => `<a class="vu" href="#/logement/${l.id}"><span class="vu-ph">${l.photos?.[0] ? `<img src="${esc(photo(l.photos[0]))}" alt="" loading="lazy">` : '🏝️'}</span><b>${esc(l.titre)}</b><span class="muted petit">${esc(l.commune)} · ${l.formule === 'location' ? (l.loyer_mois ? eur(l.loyer_mois) + ' / mois' : '') : eur(l.prix_nuit) + ' / nuit'}</span></a>`).join('')}</div></section>`;
}
function carteResultat(l) {
  const n = RCH.d.notes[l.id], r = RCH.r, loc = enLocation(r), nn = !loc && r.arrivee && r.depart ? nuits(r.arrivee, r.depart) : 0, lien = `#/logement/${l.id}${loc ? '' : qsDates(r)}`;
  const eq = EQUIP.filter(e => (l.equipements || []).includes(e[0])).slice(0, 4), phs = (l.photos || []).slice(0, 6).map(photo).filter(Boolean);
  return `<article class="res" data-id="${l.id}">
    <div class="res-ph" data-photos="${esc(JSON.stringify(phs))}" data-i="0"><a href="${lien}" tabindex="-1" aria-hidden="true">${phs[0] ? `<img src="${esc(phs[0])}" alt="" loading="lazy">` : '<span class="vide">🏝️</span>'}</a>
      ${phs.length > 1 ? `<button type="button" class="ph-nav prec" data-ph="-1" aria-label="Photo précédente : ${esc(l.titre)}">${ico('gauche')}</button><button type="button" class="ph-nav suiv" data-ph="1" aria-label="Photo suivante : ${esc(l.titre)}">${ico('droite')}</button><span class="ph-n" aria-hidden="true">1/${phs.length}</span>` : ''}</div>
    <div class="res-corps">
      <div class="res-l1"><span>${esc(l.commune)}${l.quartier ? ' · ' + esc(l.quartier) : ''}</span>${n ? `<span class="etoile">★ ${noteFr(n.moyenne)} (${n.nombre})</span>` : '<span class="tag">Nouveau</span>'}</div>
      <h3 class="res-titre"><a href="${lien}">${esc(l.titre)}</a></h3>
      <p class="res-specs">${esc(TYPES[l.type] || '')} · ${loc ? '' : `${l.voyageurs} voyageur${s_(l.voyageurs)} · `}${l.chambres ? `${l.chambres} chambre${s_(l.chambres)}` : 'pièce unique'} · ${l.sdb} salle${s_(l.sdb)} d’eau${loc && l.surface_m2 ? ` · ${String(l.surface_m2).replace('.', ',').replace(/,0$/, '')} m²` : ''}${loc && l.meuble !== null && l.meuble !== undefined ? ` · ${l.meuble ? 'meublé' : 'vide'}` : ''}</p>
      ${eq.length ? `<p class="res-eq">${eq.map(e => `<span aria-hidden="true">${e[1]}</span> ${esc(e[2])}`).join(' · ')}</p>` : ''}
      <p class="res-prix">${loc ? `${locPrix(l)} ${locPastille('DPE', l.dpe)}` : `<b>${eur(l.prix_nuit)}</b> / nuit`}${!loc && nn > 0 ? ` <span class="muted">· ${nn} nuit${s_(nn)} : ${eur(l.prix_nuit * nn + Number(l.menage || 0))}${Number(l.menage) > 0 ? ', ménage compris' : ''}</span>` : ''}</p>
      <p class="res-pied">${l.pos?.approx ? '<span class="approx">Position approximative (commune)</span>' : !l.pos ? '<span class="approx">Pas encore sur la carte</span>' : '<span></span>'}
        <button type="button" class="lien comp-l" data-comparer="${l.id}" aria-pressed="${compares().includes(l.id)}">${ico('comparer')} Comparer</button></p>
    </div>${coeurBtn(l.id)}</article>`;
}

// ---------------------------------------------------------------- moteurs de carte : 2D (Leaflet, OpenStreetMap) ou 3D (MapLibre GL JS 5.24, OpenFreeMap, relief)
// La 3D (vue inclinée, bâtiments en volume, relief) ne se charge que si on la choisit ; le choix est gardé sur l'appareil.
// Sans WebGL, ou si la 3D ne se charge pas, la carte 2D reste là. Zooms alignés : MapLibre (tuiles de 512 px) = Leaflet − 1.
const STYLE_3D = 'https://tiles.openfreemap.org/styles/liberty';
const RELIEF_3D = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const LANGUE_3D = { 'NavigationControl.ZoomIn': 'Zoomer', 'NavigationControl.ZoomOut': 'Dézoomer', 'NavigationControl.ResetBearing': 'Remettre le nord en haut',
  'AttributionControl.ToggleAttribution': 'Sources de la carte', 'AttributionControl.MapFeedback': 'Signaler une erreur de la carte', 'Map.Title': 'Carte',
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer', 'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer', 'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour déplacer la carte' };
let webglConnu = null;
const carte3dPossible = () => webglConnu ?? (webglConnu = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })());
function prefere3d(v) { try { if (v !== undefined) localStorage.setItem('kazCarte', v ? '3d' : '2d'); return localStorage.getItem('kazCarte') === '3d'; } catch (e) { return !!v; } }
function chargerMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return new Promise((ok, ko) => {
    if (!document.querySelector('link[href="lib/maplibre/maplibre-gl.css"]')) { const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'lib/maplibre/maplibre-gl.css'; document.head.appendChild(c); }
    const s = document.createElement('script'); s.src = 'lib/maplibre/maplibre-gl.js'; s.onload = () => window.maplibregl ? ok(window.maplibregl) : ko(new Error('MapLibre absent')); s.onerror = ko; document.head.appendChild(s);
  });
}
// une carte, quel que soit le moteur : centre [lat, lng], zoom à l'échelle Leaflet
async function creerCarte(el, o) {
  if (o.troisD && carte3dPossible()) {
    try { return await carte3D(el, o); }
    catch (e) { prefere3d(false); el.innerHTML = ''; toast('La carte 3D ne s’affiche pas sur cet appareil : voici la carte 2D.', true); }
  }
  return carte2D(el, o);
}
async function carte2D(el, o) {
  const L = await chargerCarte();
  const m = fondCarte(L, el, o.centre, o.zoom, { scrollWheelZoom: !!o.molette, dragging: o.deplacer !== false });
  const calque = L.layerGroup().addTo(m); let prog = false, t = null, deplace = null;
  const sansBouger = f => { prog = true; clearTimeout(t); f(); t = setTimeout(() => { prog = false; }, 450); };
  m.on('moveend', () => { if (!prog) deplace?.(); });
  m.on('resize', () => sansBouger(() => {}));   // fenêtre redimensionnée : la personne n'a pas déplacé la carte
  return { troisD: false,
    ajuster: (pts, max = 13) => sansBouger(() => m.fitBounds(pts, { padding: [56, 56], maxZoom: max, animate: false })),
    vue: (lat, lng, z) => sansBouger(() => m.setView([lat, lng], z, { animate: false })),
    bornes: () => { const b = m.getBounds(); return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]; },
    marqueur(lat, lng, html, nom) {
      const mk = L.marker([lat, lng], { icon: L.divIcon({ className: 'pm-ic', html, iconSize: null }), title: nom, keyboard: true, riseOnHover: true }).addTo(calque);
      const e = mk.getElement(); e.setAttribute('aria-label', nom); return { el: e, haut: on => mk.setZIndexOffset(on ? 1000 : 0) };
    },
    vider: () => calque.clearLayers(),
    cercle: (lat, lng, r) => L.circle([lat, lng], { radius: r, color: '#1b6b4a', weight: 2, fillColor: '#1b6b4a', fillOpacity: .14 }).addTo(m),
    taille: () => sansBouger(() => m.invalidateSize()),
    surDeplacement: f => { deplace = f; }, surClic: f => m.on('click', f),
    etat: () => { const c = m.getCenter(); return { centre: [c.lat, c.lng], zoom: m.getZoom() }; },
    detruire: () => m.remove(),
    setView: (ll, z) => m.setView(ll, z, { animate: false }), getCenter: () => m.getCenter(), inclinaison: () => 0 };   // tests : un déplacement « à la main »
}
async function carte3D(el, o) {
  const ml = await chargerMapLibre();
  const m = new ml.Map({ container: el, style: STYLE_3D, center: [o.centre[1], o.centre[0]], zoom: Math.max(0, o.zoom - 1), pitch: 55, bearing: -15, maxPitch: 70,
    attributionControl: { compact: true }, scrollZoom: !!o.molette, dragPan: o.deplacer !== false, cooperativeGestures: !o.molette && matchMedia('(pointer: coarse)').matches, locale: LANGUE_3D });
  let charge = false, rejeter = null, deplace = null;
  // une tuile manquante n'encombre pas la console ; un style injoignable (avant le chargement) renvoie à la carte 2D
  m.on('error', e => { if (!charge && rejeter && !e.sourceId && !e.tile) rejeter(e.error || new Error('Carte 3D indisponible')); });
  try { await new Promise((ok, ko) => { rejeter = ko; m.once('load', ok); setTimeout(() => ko(new Error('Carte 3D trop lente')), 20000); }); }
  catch (e) { m.remove(); throw e; }
  charge = true;
  m.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-left');
  try {   // relief (facultatif) : Terrain Tiles, données ouvertes ; ciel adouci vers l'horizon
    m.addSource('relief', { type: 'raster-dem', tiles: [RELIEF_3D], tileSize: 256, maxzoom: 13, encoding: 'terrarium',
      attribution: 'Relief : <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a> (SRTM et GMTED2010 : USGS ; ETOPO1 : NOAA)' });
    m.setTerrain({ source: 'relief', exaggeration: 1.4 });
    m.setSky?.({ 'sky-color': '#a9d8ec', 'horizon-color': '#f3ece1', 'fog-color': '#f3ece1', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.6 });
  } catch (e) { /* sans relief, la 3D reste utile */ }
  // seulement quand la personne déplace, incline, tourne ou zoome la carte (après un glissé, la fin du mouvement d'inertie n'a plus l'événement d'origine)
  let parGeste = false;
  ['dragstart', 'rotatestart', 'pitchstart', 'zoomstart'].forEach(t => m.on(t, e => { if (e.originalEvent) parGeste = true; }));
  m.on('moveend', e => { if (e.originalEvent || parGeste) { parGeste = false; deplace?.(); } });
  const tous = new Set();
  return { troisD: true,
    ajuster: (pts, max = 13) => { const b = new ml.LngLatBounds(); pts.forEach(([la, ln]) => b.extend([ln, la])); m.fitBounds(b, { padding: 70, maxZoom: max - 1, duration: 0, bearing: m.getBearing() }); },
    vue: (lat, lng, z) => m.jumpTo({ center: [lng, lat], zoom: z - 1 }),
    bornes: () => { const b = m.getBounds(); return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]; },
    marqueur(lat, lng, html, nom) {
      const e = document.createElement('div'); e.className = 'pm-ic'; e.innerHTML = html; e.tabIndex = 0; e.setAttribute('role', 'button'); e.setAttribute('aria-label', nom); e.title = nom;
      tous.add(new ml.Marker({ element: e, anchor: 'center' }).setLngLat([lng, lat]).addTo(m)); return { el: e, haut: on => { e.style.zIndex = on ? '5' : ''; } };
    },
    vider: () => { tous.forEach(x => x.remove()); tous.clear(); },
    cercle(lat, lng, r) {
      const pts = Array.from({ length: 65 }, (_, i) => { const a = i / 32 * Math.PI; return [lng + r / (111320 * Math.cos(lat * Math.PI / 180)) * Math.cos(a), lat + r / 110540 * Math.sin(a)]; });
      m.addSource('zone', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } } });
      m.addLayer({ id: 'zone-fond', type: 'fill', source: 'zone', paint: { 'fill-color': '#1b6b4a', 'fill-opacity': 0.2 } });
      m.addLayer({ id: 'zone-bord', type: 'line', source: 'zone', paint: { 'line-color': '#1b6b4a', 'line-width': 2 } });
    },
    taille: () => m.resize(),
    surDeplacement: f => { deplace = f; }, surClic: f => m.on('click', f),
    etat: () => { const c = m.getCenter(); return { centre: [c.lat, c.lng], zoom: m.getZoom() + 1 }; },
    detruire: () => m.remove(),
    setView: (ll, z) => m.jumpTo({ center: [ll[1], ll[0]], zoom: z - 1 }), getCenter: () => m.getCenter(), inclinaison: () => m.getPitch() };
}
// bouton 2D | 3D posé sur la carte ; absent sans WebGL
const choix3d = id => carte3dPossible() ? `<div class="vue-3d" role="group" aria-label="Type de carte" id="${id}"><button type="button" data-moteur="2d" aria-pressed="${!prefere3d()}">2D</button><button type="button" data-moteur="3d" aria-pressed="${prefere3d()}">3D</button></div>` : '';
const marquerChoix = (id, troisD) => document.querySelectorAll(`#${id} [data-moteur]`).forEach(b => b.setAttribute('aria-pressed', String((b.dataset.moteur === '3d') === troisD)));

// ---------------------------------------------------------------- carte de la recherche
async function preparerCarte(depuis) {
  if (!RCH || RCH.carte || RCH.prepare) return;
  const el = $('#carteRech'); if (!el || !el.offsetWidth) return;   // carte cachée (téléphone, vue « Liste ») : créée au premier affichage
  RCH.prepare = true;
  try {
    const c = CENTRES[RCH.terr] || CENTRES.Martinique;
    const carte = await creerCarte(el, { centre: depuis?.centre || [c[0], c[1]], zoom: depuis?.zoom || c[2], troisD: prefere3d(), molette: true });
    if (!RCH || !document.body.contains(el)) return carte.detruire();
    RCH.carte = carte; $('#carteAttente')?.remove();
    carte.surDeplacement(() => { if (RCH) $('#zoneBtn').hidden = false; });
    carte.surClic(fermerApercu);
    window.__carteKaz = carte;   // tests
    marquerChoix('choix3d', carte.troisD);
    majCarte(!depuis);
  } catch (e) { const a = $('#carteAttente'); if (a) a.textContent = 'Carte indisponible pour le moment : la liste reste à jour.'; }
  finally { if (RCH) RCH.prepare = false; }
}
// 2D ↔ 3D sans perdre l'endroit regardé
async function changerMoteur(troisD) {
  if (!RCH?.carte || RCH.carte.troisD === troisD || RCH.prepare) return;
  prefere3d(troisD);
  const etat = RCH.carte.etat(); fermerApercu(); RCH.carte.detruire(); RCH.carte = null; RCH.marqueurs = new Map();
  const neuf = document.createElement('div'); neuf.id = 'carteRech'; $('#carteRech').replaceWith(neuf);
  await preparerCarte(etat);
}
function ajusterCarte() {
  if (!RCH?.carte) return;
  const pts = RCH.res.filter(l => l.pos).map(l => [l.pos.lat, l.pos.lng]);
  if (pts.length) RCH.carte.ajuster(pts); else { const c = CENTRES[RCH.terr] || CENTRES.Martinique; RCH.carte.vue(c[0], c[1], c[2]); }
}
const prixCourt = n => Math.round(Number(n)).toLocaleString('fr-FR') + ' €';
// un point par emplacement : plusieurs logements au même endroit (même commune sans point précis) = « dès … » et leur nombre
function majCarte(ajuster) {
  if (!RCH?.carte) return;
  RCH.carte.vider(); RCH.marqueurs = new Map();
  const groupes = new Map();
  RCH.res.forEach(l => { if (!l.pos) return; const k = l.pos.lat.toFixed(4) + ',' + l.pos.lng.toFixed(4); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(l); });
  for (const ls of groupes.values()) {
    const loc = enLocation(RCH.r), min = Math.min(...ls.map(x => prixDe(x, RCH.r))), approx = ls.every(x => x.pos.approx), ids = ls.map(x => x.id);
    const texte = ls.length > 1 ? `dès ${prixCourt(min)} <i>${ls.length}</i>` : prixCourt(min);
    const nom = ls.length > 1 ? `${ls.length} logements ${aLieu(ls[0].commune)}, dès ${eur(min)} ${loc ? 'par mois' : 'la nuit'}` : `${ls[0].titre}, ${eur(min)} ${loc ? 'par mois' : 'la nuit'}${approx ? ', position approximative' : ''}`;
    const h = RCH.carte.marqueur(ls[0].pos.lat, ls[0].pos.lng, `<span class="pm${approx ? ' approx' : ''}">${texte}</span>`, nom), e = h.el;
    e.dataset.ids = ids.join(',');
    e.addEventListener('click', ev => { ev.stopPropagation(); selectionner(ids, true); });
    e.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); selectionner(ids, true); } });
    e.addEventListener('mouseover', () => allumer(ids)); e.addEventListener('mouseout', () => allumer([]));
    ids.forEach(x => RCH.marqueurs.set(x, h));
  }
  if (ajuster && !RCH.r.zone) ajusterCarte();
}
// une carte de la liste et son prix sur la carte s'éclairent ensemble (survol, focus clavier, sélection)
function surligner(id) {
  if (!RCH) return;
  const etat = x => RCH.allumes.has(x) || RCH.sel.includes(x);
  document.querySelector(`.res[data-id="${id}"]`)?.classList.toggle('actif', etat(id));
  const h = RCH.marqueurs.get(id), el = h?.el; if (!el) return;
  const on = (el.dataset.ids || id).split(',').some(etat);
  el.querySelector('.pm')?.classList.toggle('actif', on); h.haut(on);
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
  ap.innerHTML = `${ls.length > 1 ? `<div class="ap-tete">${ls.length} logements ${esc(aLieu(ls[0].commune))}</div>` : ''}<div class="${ls.length > 1 ? 'ap-liste' : ''}">${ls.map(l => `<a class="ap-l" href="#/logement/${l.id}${enLocation(RCH.r) ? '' : qsDates(RCH.r)}">
      ${l.photos?.[0] ? `<img src="${esc(photo(l.photos[0]))}" alt="">` : '<span class="ap-vide"></span>'}<span class="ap-c"><b>${esc(l.titre)}</b><span>${esc(TYPES[l.type] || '')} · ${enLocation(RCH.r) ? '' : `${l.voyageurs} voy. · `}${l.chambres} ch.</span>
      <span class="p">${enLocation(RCH.r) ? `<b>${eur(l.loyer_mois)}</b> / mois` : `<b>${eur(l.prix_nuit)}</b> / nuit`}</span>${l.pos?.approx ? '<span>Position approximative</span>' : ''}</span></a>`).join('')}</div>
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
  if (o.dePanneau) majCompteur(); else majPanneau();
}
// les champs du haut (lieu, dates, voyageurs) reprennent les critères après un « retirer » ou un « tout effacer »
function syncForm() {
  const f = $('#fRech'), r = RCH.r; if (!f) return;
  f.territoire.value = r.territoire || RCH.terr; f.commune.value = r.commune; f.arrivee.value = r.arrivee; f.depart.value = r.depart; f.voyageurs.value = r.voyageurs || '';
  if (RCH.d && !(r.arrivee && r.depart)) RCH.d.libres = null;
}
function retirerPastille(i) {
  const p = pastilles(RCH.r)[i]; if (!p) return;
  p.off(RCH.r); syncForm(); appliquer({ garderVue: true });
}
function toutEffacer() {
  Object.assign(RCH.r, filtresVides(), { commune: '', arrivee: '', depart: '', voyageurs: null, zone: null, favoris: false });
  syncForm(); appliquer();
}
// bouton du téléphone : « Carte · 7 » ou « Liste · 7 »
function libelleBascule() {
  const b = $('#bascule'); if (!b || !RCH) return;
  const carte = RCH.r.vue === 'carte', n = RCH.d ? RCH.res.length : null, nb = n === null ? '' : ` · ${n}`;
  b.innerHTML = `${ico(carte ? 'liste' : 'carte')} ${carte ? 'Liste' : 'Carte'}${nb}`;
  b.setAttribute('aria-label', carte ? 'Voir la liste des logements' : 'Voir les logements sur la carte');
}
function basculerVue(v) {
  RCH.r.vue = v; document.body.classList.toggle('vue-carte', v === 'carte');
  history.replaceState(history.state, '', adresseRecherche(RCH.r)); pageEnCours = location.hash;
  libelleBascule();
  if (v === 'carte') { if (!RCH.carte) preparerCarte(); else { RCH.carte.taille(); if (!RCH.r.zone) ajusterCarte(); } }
  else { fermerApercu(); window.scrollTo(0, 0); }
}
function brancherPage() {
  const f = $('#fRech'), r = RCH.r;
  brancherVilles(f.territoire, 'villesR');
  brancherFiltres(); placerFiltres();
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
  document.querySelector('.rech-carte').addEventListener('click', e => {
    const m = e.target.closest('[data-moteur]'); if (m) return changerMoteur(m.dataset.moteur === '3d');
    if (e.target.closest('#recentrer')) { $('#zoneBtn').hidden = true; ajusterCarte(); }
  });
  $('#zoneBtn').addEventListener('click', () => {
    r.zone = RCH.carte.bornes(); r.commune = ''; f.commune.value = '';
    $('#zoneBtn').hidden = true; appliquer({ garderVue: true });
  });
  // barre rapide : équipements, types, zone, favoris, filtres
  $('#rechL2').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'ouvrirFiltres') return ouvrirFiltres();
    if (b.id === 'effZone') { r.zone = null; return appliquer(); }
    if (b.id === 'effFav') { r.favoris = false; return appliquer(); }
    if (b.dataset.formule !== undefined) { if (r.formule !== b.dataset.formule) Object.assign(r, { formule: b.dataset.formule, pmin: null, pmax: null, annul: [], meuble: '', dpe: '', dispo: '', duree: null }); return appliquer({ garderVue: true }); }
    if (b.dataset.eq) r.eq = r.eq.includes(b.dataset.eq) ? r.eq.filter(x => x !== b.dataset.eq) : [...r.eq, b.dataset.eq];
    if (b.dataset.type) r.types = r.types.includes(b.dataset.type) ? r.types.filter(x => x !== b.dataset.type) : [...r.types, b.dataset.type];
    appliquer(); $(`#rechL2 [data-eq="${b.dataset.eq}"], #rechL2 [data-type="${b.dataset.type}"]`)?.focus();
  });
  // liste : tri, territoires, plus de résultats, alertes, états vides ; survol et focus éclairent le prix sur la carte
  const liste = $('#rechListe');
  liste.addEventListener('change', e => { if (e.target.id === 'triRech') { r.tri = e.target.value; appliquer({ garderVue: true }); $('#triRech')?.focus(); } });
  liste.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ph) { const box = b.closest('.res-ph'), l = JSON.parse(box.dataset.photos), i = (Number(box.dataset.i) + Number(b.dataset.ph) + l.length) % l.length;
      box.dataset.i = i; box.querySelector('img').src = l[i]; box.querySelector('.ph-n').textContent = `${i + 1}/${l.length}`; return; }
    if (b.dataset.off !== undefined) return retirerPastille(Number(b.dataset.off));
    if (b.id === 'toutEffacer') return toutEffacer();
    if (b.id === 'effVus') { vusEffacer(); return appliquer({ garderVue: true }); }
    if (b.dataset.terr) { r.territoire = b.dataset.terr; r.zone = null; r.commune = ''; f.commune.value = ''; return appliquer(); }
    if (b.id === 'plusRes') { const avant = RCH.page; RCH.page += PAR_PAGE; $('#resListe').insertAdjacentHTML('beforeend', RCH.res.slice(avant, RCH.page).map(carteResultat).join('')); if (RCH.page >= RCH.res.length) b.parentElement.remove(); else b.textContent = `Afficher ${Math.min(PAR_PAGE, RCH.res.length - RCH.page)} logements de plus`; return; }
    if (b.hasAttribute('data-alerte')) return creerAlerte();
    const a = b.dataset.act;
    if (a === 'filtres') Object.assign(r, filtresVides());
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

// ---------------------------------------------------------------- filtres : feuille du bas sur téléphone, colonne à gauche sur grand écran
const COLONNE_FILTRES = '(min-width: 1100px)';
const choixRadio = (nom, vals) => `<div class="choix">${vals.map(([v, t]) => `<label><input type="radio" name="${nom}" value="${v}"><span>${t}</span></label>`).join('')}</div>`;
const plusDe = max => [['', 'Indifférent'], ...Array.from({ length: max }, (_, i) => [String(i + 1), `${i + 1} ou plus`])];
function dialogueFiltres(r) {
  return `<dialog class="feuille feuille-filtres" id="dFiltres" aria-labelledby="tFiltres"><form method="dialog" id="fFiltres">
    <div class="feuille-tete"><h2 id="tFiltres" tabindex="-1" autofocus>Filtres</h2><button type="button" class="rond" id="fermerFiltres" aria-label="Fermer les filtres">${ico('fermer')}</button></div>
    <div class="feuille-corps">
      ${LOC_ON ? `<fieldset class="groupe"><legend>Formule</legend>${choixRadio('formule', [['', '🏝️ Séjours à la nuit'], ['location', '🔑 Location au mois ou à l’année']])}</fieldset>` : ''}
      <fieldset class="groupe"><legend>Où</legend><div class="budget"><label>Territoire<select name="territoire"><option value="partout">Tous</option>${NOMS_TERRITOIRES.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
        <label>Commune<input name="commune" list="villesF" placeholder="Toutes" autocomplete="off" maxlength="60"></label></div>${listeVilles('villesF', r.territoire || 'Martinique')}</fieldset>
      <fieldset class="groupe"><legend id="lgBudget">Budget par nuit</legend><div class="budget"><label>Minimum (€)<input type="number" name="pmin" min="1" max="50000" step="10" inputmode="numeric" placeholder="Aucun"></label>
        <label>Maximum (€)<input type="number" name="pmax" min="1" max="50000" step="10" inputmode="numeric" placeholder="Aucun"></label></div><p class="aide" id="totalSejour" aria-live="polite"></p></fieldset>
      <fieldset class="groupe" data-pour="sejour"><legend>Voyageurs</legend><label class="champ"><span class="sr">Nombre de voyageurs</span><input type="number" name="voyageurs" min="1" max="40" inputmode="numeric" placeholder="Indifférent"></label></fieldset>
      <fieldset class="groupe"><legend>Type de logement</legend><div class="choix">${Object.entries(TYPES).map(([k, t]) => `<label><input type="checkbox" name="types" value="${k}"><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="groupe"><legend>Chambres</legend>${choixRadio('ch', plusDe(5))}</fieldset>
      <fieldset class="groupe" data-pour="sejour"><legend>Lits</legend>${choixRadio('lits', plusDe(6))}</fieldset>
      <fieldset class="groupe"><legend>Salles d’eau</legend>${choixRadio('sdb', plusDe(4))}</fieldset>
      <fieldset class="groupe"><legend>Équipements</legend><p class="aide">Les logements proposés ont tous les équipements choisis.</p>
        <div class="choix">${EQUIP.map(([k, i, t]) => `<label><input type="checkbox" name="eq" value="${k}"><span><span aria-hidden="true">${i}</span> ${esc(t)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="groupe"><legend>Surface minimum</legend><label class="champ"><span class="sr">Surface minimum en mètres carrés</span><input type="number" name="surf" min="1" max="2000" inputmode="numeric" placeholder="Aucune (m²)"></label></fieldset>
      <div data-pour="location"><fieldset class="groupe"><legend>Meublé ou vide</legend>${choixRadio('meuble', [['', 'Indifférent'], ['oui', 'Meublé'], ['non', 'Vide']])}</fieldset>
        <fieldset class="groupe"><legend>Diagnostic énergétique (DPE)</legend><p class="aide">Cette classe ou mieux.</p>${choixRadio('dpe', [['', 'Indifférent'], ...CLASSES_DPE.map(c => [c, c])])}</fieldset>
        <fieldset class="groupe"><legend>Disponibilité et durée</legend><div class="budget"><label>Disponible au plus tard le<input type="date" name="dispo"></label>
          <label>Durée souhaitée (mois)<input type="number" name="duree" min="1" max="120" inputmode="numeric" placeholder="Indifférent"></label></div></fieldset></div>
      <fieldset class="groupe" data-pour="sejour" data-agence><legend>Annulation</legend><p class="aide">Choisie par l’hôte. Les annonces sans condition indiquée ne sont pas proposées si vous en choisissez une.</p>
        <div class="choix">${Object.entries(ANNULATION).map(([k, [t]]) => `<label><input type="checkbox" name="annul" value="${k}"><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="groupe"><legend>Ordre des résultats</legend><label class="champ">Trier par<select name="tri">${opts(TRIS, r.tri)}</select></label>
        <p class="aide">Sans choix : les annonces les plus récentes d’abord. Aucun logement n’est mis en avant contre paiement.</p></fieldset>
    </div>
    <div class="feuille-pied"><button type="button" class="lien" id="effFiltres">Tout effacer</button><button type="submit" class="btn btn-p" id="voirRes">Voir les logements</button></div></form></dialog>`;
}
const colonneFiltres = () => matchMedia(COLONNE_FILTRES).matches;
// remplit le panneau avec les critères, montre les rubriques de la formule choisie, met à jour le nombre
function majPanneau() {
  const f = $('#fFiltres'); if (!f || !RCH) return;
  const r = RCH.r, loc = enLocation(r);
  f.pmin.value = r.pmin || ''; f.pmax.value = r.pmax || ''; f.surf.value = r.surf || ''; f.voyageurs.value = r.voyageurs || '';
  f.dispo.value = r.dispo; f.duree.value = r.duree || ''; f.commune.value = r.commune; f.territoire.value = r.territoire || RCH.terr;
  f.tri.innerHTML = opts(trisDispo(RCH.d), r.tri); f.tri.value = r.tri;
  f.querySelectorAll('[name=types]').forEach(c => { c.checked = r.types.includes(c.value); });
  f.querySelectorAll('[name=eq]').forEach(c => { c.checked = r.eq.includes(c.value); });
  f.querySelectorAll('[name=annul]').forEach(c => { c.checked = r.annul.includes(c.value); });
  [['ch', r.ch], ['lits', r.lits], ['sdb', r.sdb], ['meuble', r.meuble], ['dpe', r.dpe], ['formule', r.formule]].forEach(([n, v]) => f.querySelectorAll(`[name=${n}]`).forEach(c => { c.checked = c.value === String(v || ''); }));
  f.querySelectorAll('[data-pour]').forEach(g => { g.hidden = (g.dataset.pour === 'sejour' && loc) || (g.dataset.pour === 'location' && !loc) || (g.hasAttribute('data-agence') && !RCH.d?.agence); });
  $('#lgBudget').textContent = loc ? 'Loyer par mois' : 'Budget par nuit';
  majCompteur();
}
// « Voir 12 logements » en direct, et le total d'un séjour quand les dates sont choisies
function majCompteur() {
  const r = RCH?.r, b = $('#voirRes'); if (!b) return;
  const n = RCH.res.length, mot = enLocation(r) ? 'location' : 'logement';
  b.textContent = RCH.d ? `Voir ${n} ${mot}${s_(n)}` : 'Voir les logements';
  const nn = !enLocation(r) && r.arrivee && r.depart ? nuits(r.arrivee, r.depart) : 0, t = $('#totalSejour');
  if (t) t.textContent = nn > 0 && (r.pmin || r.pmax) ? `Pour ${nn} nuit${s_(nn)} : ${r.pmin ? 'dès ' + eurCourt(r.pmin * nn) : ''}${r.pmin && r.pmax ? ', ' : ''}${r.pmax ? 'jusqu’à ' + eurCourt(r.pmax * nn) : ''} (ménage en plus).`
    : nn > 0 ? `Dates choisies : ${nn} nuit${s_(nn)}. Le total de chaque logement est affiché dans la liste.` : '';
}
// grand écran : le panneau reste ouvert à gauche ; téléphone et tablette : feuille qu'on ouvre avec « Filtres »
function placerFiltres() {
  const d = $('#dFiltres'); if (!d) return;
  if (colonneFiltres()) { if (d.open && d.matches(':modal')) d.close(); if (!d.open) d.show(); }
  else if (d.open) d.close();
}
function brancherFiltres() {
  const d = $('#dFiltres'), f = $('#fFiltres'), r = RCH.r, n = v => Number(v) > 0 ? Math.round(Number(v)) : null;
  const lire = () => {
    const g = new FormData(f), tc = f.territoire.value, cm = f.commune.value.trim().slice(0, 60), formule = g.get('formule') ?? r.formule, change = formule !== r.formule;
    if (change) Object.assign(r, { formule, pmin: null, pmax: null, annul: [], meuble: '', dpe: '', dispo: '', duree: null });   // un loyer n'est pas un prix à la nuit
    if (tc !== (r.territoire || RCH.terr) || cm !== r.commune) r.zone = null;
    Object.assign(r, { ...(tc !== (r.territoire || RCH.terr) ? { territoire: tc } : {}), commune: cm, tri: f.tri.value, types: g.getAll('types'), eq: g.getAll('eq'), ch: n(g.get('ch')), lits: n(g.get('lits')), sdb: n(g.get('sdb')),
      surf: n(f.surf.value), voyageurs: n(f.voyageurs.value), ...(change ? {} : { pmin: n(f.pmin.value), pmax: n(f.pmax.value), annul: g.getAll('annul'), duree: n(f.duree.value),
        dpe: g.get('dpe') || '', meuble: g.get('meuble') || '', dispo: /^\d{4}-\d{2}-\d{2}$/.test(f.dispo.value) ? f.dispo.value : '' }) });
    if (r.pmin && r.pmax && r.pmin > r.pmax) [r.pmin, r.pmax] = [r.pmax, r.pmin];
    syncForm(); appliquer({ garderVue: true, dePanneau: !change });
  };
  let minuterie = null;
  f.addEventListener('change', lire);
  f.addEventListener('input', e => { if (e.target.matches('input[type=number], input[name=commune]')) { clearTimeout(minuterie); minuterie = setTimeout(lire, 450); } });
  f.addEventListener('submit', e => { e.preventDefault(); if (!colonneFiltres()) d.close(); });
  $('#effFiltres').addEventListener('click', () => { Object.assign(r, filtresVides()); appliquer(); });
  $('#fermerFiltres').addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d && !colonneFiltres()) d.close(); });
  d.addEventListener('close', () => { if (!colonneFiltres()) { $('#ouvrirFiltres')?.focus(); if (!r.zone) ajusterCarte(); } });
  brancherVilles(f.territoire, 'villesF');
}
function ouvrirFiltres() {
  const d = $('#dFiltres'); majPanneau();
  if (colonneFiltres()) { if (!d.open) d.show(); $('#tFiltres').focus(); } else if (!d.open) d.showModal();
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
