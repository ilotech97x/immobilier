/* Kaz An Nou — application de séjours et de services pour la maison (IloTech Immobilier).
   Données : Supabase (comptes, logements, réservations, prestations, messages) ; règles de sécurité côté base (schema.sql). */
'use strict';
// la page ne s'affiche pas dans le cadre d'un autre site (anti-hameçonnage)
if (window.top !== window.self) { try { window.top.location = window.location.href; } catch (e) { document.documentElement.style.display = 'none'; } }

const CFG = window.KAZ_CONFIG || {};
const PRET = !!(CFG.url && CFG.cle && window.supabase);
const sb = PRET ? window.supabase.createClient(CFG.url, CFG.cle, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } }) : null;
const WA = '596696482678';

// ---------------------------------------------------------------- référentiels
// territoires, villes, fuseaux et indicatifs : commun/territoires.js (chargé avant ce fichier)
const TYPES = { villa: 'Villa', maison: 'Maison créole', appartement: 'Appartement', studio: 'Studio', gite: 'Gîte', bungalow: 'Bungalow' };
const EQUIP = [['wifi', '📶', 'Wi-Fi'], ['clim', '❄️', 'Climatisation'], ['piscine', '🏊', 'Piscine'], ['vue_mer', '🌊', 'Vue mer'], ['plage', '🏖️', 'Plage à pied'],
  ['parking', '🚗', 'Parking'], ['cuisine', '🍳', 'Cuisine équipée'], ['lave_linge', '🧺', 'Lave-linge'], ['jardin', '🌴', 'Jardin'], ['terrasse', '☀️', 'Terrasse'],
  ['starlink', '🛰️', 'Internet Starlink'], ['serrure', '🔐', 'Arrivée autonome'], ['citerne', '💧', 'Citerne d’eau'], ['groupe', '⚡', 'Groupe électrogène'],
  ['bebe', '👶', 'Équipement bébé'], ['pmr', '♿', 'Accessible PMR'], ['animaux', '🐾', 'Animaux acceptés'], ['travail', '💻', 'Espace de travail']];
const CATS = { menage: ['🧹', 'Ménage'], accueil: ['🔑', 'Accueil voyageurs'], linge: ['🧺', 'Linge et blanchisserie'], controle: ['🏠', 'Logement contrôlé'],
  jardin: ['🌴', 'Jardin'], piscine: ['🏊', 'Piscine'], travaux: ['🛠️', 'Petits travaux'], cyclone: ['🌀', 'Mode cyclone'], retour: ['✈️', 'Retour au pays'], technique: ['📡', 'Wi-Fi, caméras, serrures'],
  plomberie: ['🚰', 'Plomberie'], electricite: ['⚡', 'Électricité'], clim: ['❄️', 'Climatisation'], informatique: ['💻', 'Informatique'], mecanique: ['🚗', 'Mécanique auto et moto'],
  electromenager: ['🔧', 'Réparation électroménager'], demenagement: ['📦', 'Déménagement'], beaute: ['💇', 'Coiffure et beauté à domicile'], cours: ['📚', 'Cours et soutien scolaire'],
  garde: ['👶', 'Garde d’enfants et d’animaux'], autre: ['✨', 'Autres services'] };
const UNITES = { prestation: 'la prestation', heure: 'de l’heure', passage: 'le passage', mois: 'par mois' };
const CRENEAUX = { matin: 'Matin', 'apres-midi': 'Après-midi', soir: 'Soir', journee: 'Journée' };
const ST_RESA = { demande: ['att', 'En attente'], acceptee: ['ok', 'Confirmée'], refusee: ['ko', 'Refusée'], annulee: ['gris', 'Annulée'], blocage: ['gris', 'Dates bloquées'] };
const ST_DEM = { demande: ['att', 'En attente'], acceptee: ['ok', 'Acceptée'], refusee: ['ko', 'Refusée'], faite: ['ok', 'Faite'], annulee: ['gris', 'Annulée'] };
const ST_ANN = { brouillon: ['gris', 'Brouillon'], en_attente: ['att', 'En validation'], publie: ['ok', 'En ligne'], refuse: ['ko', 'Refusée'], archive: ['gris', 'Archivée'] };

// ---------------------------------------------------------------- outils
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => (Math.round(Number(n) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: Number(n) % 1 ? 2 : 0 }) + ' €';
const j10 = d => String(d).slice(0, 10);   // « 2026-11-13 » même si une date complète arrive
const jour = d => new Date(j10(d) + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const jourLong = d => new Date(j10(d) + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const auj = () => iso(new Date());
const plus = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); };
const nuits = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const photo = p => !p ? '' : /^https:\/\//.test(p) ? p : PRET ? sb.storage.from('photos').getPublicUrl(p).data.publicUrl : '';
const tag = ([c, t]) => `<span class="tag ${c}">${esc(t)}</span>`;
const initiale = p => esc(((p?.prenom || '?')[0] || '?').toUpperCase());
const wa = (tel, txt) => `https://wa.me/${telInternational(tel || WA) || WA}?text=${encodeURIComponent(txt)}`;
const opts = (o, v) => Object.entries(o).map(([k, t]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('');
const lieu = x => esc(x.commune) + (x.territoire && x.territoire !== 'Autre pays' ? ', ' + esc(x.territoire) : '');
// champ « territoire + ville » (ville libre avec suggestions)
const champsLieu = (t, v, id, req = true, vide = '') => `<label>Territoire<select name="territoire" ${req ? 'required' : ''} data-villes="${id}">${optsTerritoires(t, vide)}</select></label><label>Ville<input name="commune" ${req ? 'required' : ''} maxlength="60" list="${id}" value="${esc(v || '')}" autocomplete="address-level2"></label>${listeVilles(id, t)}`;
const brancherLieux = () => document.querySelectorAll('select[data-villes]').forEach(s => brancherVilles(s, s.dataset.villes));
const param = () => Object.fromEntries(new URLSearchParams((location.hash.split('?')[1] || '')));
const aller = h => { if (location.hash === h) rendre(); else location.hash = h; };

function toast(m, ko = false) {
  const t = document.createElement('div'); t.className = 'toast' + (ko ? ' ko' : ''); t.textContent = m; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), ko ? 6000 : 3500);
}
// messages d'erreur compréhensibles (les règles de la base renvoient déjà du français)
function erreur(e) {
  const m = String(e?.message || e || '');
  if (/row-level security|permission denied/i.test(m)) return 'Action non autorisée pour votre compte.';
  if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Confirmez d’abord votre adresse email (lien reçu par email).';
  if (/already registered|already exists/i.test(m)) return 'Un compte existe déjà avec cet email.';
  if (/Password should be/i.test(m)) return 'Mot de passe trop court (8 caractères minimum).';
  if (/conflicting key|exclusion/i.test(m)) return 'Ces dates ne sont plus disponibles.';
  if (/rate limit|too many/i.test(m)) return 'Trop d’essais, réessayez dans quelques minutes.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion impossible. Vérifiez votre internet.';
  return m.replace(/^.*?: /, '') || 'Une erreur est survenue.';
}
async function q(promesse) {
  const { data, error } = await promesse;
  if (error) throw error;
  return data;
}

// réduit une photo avant l'envoi (1600 px, JPEG) : rapide sur les réseaux mobiles
async function reduire(fichier) {
  if (!/^image\//.test(fichier.type)) throw new Error('Choisissez une image (JPEG, PNG ou WebP).');
  const img = await createImageBitmap(fichier);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .82));
}
async function envoyerPhotos(fichiers) {
  const chemins = [];
  for (const f of fichiers) {
    const blob = await reduire(f);
    const chemin = `${moi.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await q(sb.storage.from('photos').upload(chemin, blob, { contentType: 'image/jpeg', upsert: false }));
    chemins.push(chemin);
  }
  return chemins;
}

// ---------------------------------------------------------------- session
let moi = null, profil = null, contact = null, favoris = new Set(), compteurs = { resa: 0, msgs: 0 };
async function chargerMoi() {
  moi = null; profil = null; contact = null; favoris = new Set();
  if (!PRET) return;
  const { data } = await sb.auth.getSession();
  moi = data.session?.user || null;
  if (!moi) return;
  [profil, contact] = await Promise.all([
    q(sb.from('profiles').select('*').eq('id', moi.id).maybeSingle()),
    q(sb.from('contacts').select('*').eq('id', moi.id).maybeSingle())]);
  const f = await q(sb.from('favoris').select('logement_id'));
  favoris = new Set(f.map(x => x.logement_id));
  compter();
}
const role = r => profil && (profil.role === 'admin' || (profil.role === r && profil.valide));
async function compter() {
  if (!moi) return;
  try {
    const [r, d] = await Promise.all([
      role('proprietaire') ? q(sb.from('reservations').select('id, logements!inner(owner)').eq('statut', 'demande').eq('logements.owner', moi.id)) : [],
      role('prestataire') ? q(sb.from('demandes').select('id').eq('statut', 'demande').eq('prestataire_id', moi.id)) : []]);
    compteurs.resa = r.length + d.length;
    const m = await q(sb.from('messages').select('id').eq('lu', false).neq('de', moi.id));
    compteurs.msgs = m.length;
    nav();
  } catch (e) { /* compteurs facultatifs */ }
}

// ---------------------------------------------------------------- mise en page
function nav() {
  const h = location.hash || '#/';
  const b = n => n ? `<span class="badge">${n}</span>` : '';
  const on = p => h.startsWith(p) ? 'on' : '';
  $('#nav').innerHTML = `
    <a href="#/" class="${h === '#/' || h === '' ? 'on' : ''}">Séjours</a>
    <a href="#/services" class="${on('#/services')}">Services maison</a>
    <a href="#/retour">Retour au pays</a>
    ${moi ? `<a href="#/compte" class="${on('#/compte')}">Mon espace${b(compteurs.resa + compteurs.msgs)}</a>`
          : `<a href="#/connexion" class="${on('#/connexion')}">Connexion</a><a class="btn btn-p btn-s" href="#/inscription">Créer un compte</a>`}`;
  $('#bas').innerHTML = `
    <a href="#/" class="${h === '#/' || h === '' ? 'on' : ''}"><span>🔎</span>Explorer</a>
    <a href="#/services" class="${on('#/services')}"><span>🧹</span>Services</a>
    <a href="#/compte/favoris" class="${on('#/compte/favoris')}"><span>♡</span>Favoris</a>
    <a href="#/compte/messages" class="${on('#/compte/messages')}"><span>💬</span>Messages${b(compteurs.msgs)}</a>
    <a href="${moi ? '#/compte' : '#/connexion'}" class="${h === '#/compte' || on('#/connexion')}"><span>👤</span>${moi ? 'Compte' : 'Connexion'}${b(compteurs.resa)}</a>`;
}
const vue = html => { $('#app').innerHTML = html; };
const chargement = () => vue('<div class="chargement">Chargement…</div>');
const exigeCompte = () => { if (moi) return true; aller('#/connexion?retour=' + encodeURIComponent(location.hash)); return false; };

// carte d'un logement dans une grille
function carteLogement(l, notes) {
  const n = notes?.[l.id];
  return `<a class="carte" href="#/logement/${l.id}">
    <div class="ph">${l.photos?.[0] ? `<img src="${esc(photo(l.photos[0]))}" alt="${esc(l.titre)}" loading="lazy">` : '<span class="vide">🏝️</span>'}</div>
    ${moi ? `<button class="coeur ${favoris.has(l.id) ? 'on' : ''}" data-fav="${l.id}" aria-label="Favori">${favoris.has(l.id) ? '♥' : '♡'}</button>` : ''}
    <div class="corps"><div class="l1"><span>${lieu(l)}</span>${n ? `<span class="etoile">★ ${n.moyenne} (${n.nombre})</span>` : '<span class="tag">Nouveau</span>'}</div>
      <div class="muted">${esc(l.titre)}</div>
      <div class="muted petit">${esc(TYPES[l.type] || '')} · ${l.chambres} ch. · ${l.voyageurs} voyageurs</div>
      <div class="prix"><b>${eur(l.prix_nuit)}</b> <span class="muted">/ nuit</span></div></div></a>`;
}
async function notesDe(ids) {
  if (!ids.length) return {};
  const n = await q(sb.from('notes').select('*').in('cible', ids));
  return Object.fromEntries(n.map(x => [x.cible, x]));
}
document.addEventListener('click', async ev => {
  const f = ev.target.closest('[data-fav]');
  if (!f) return;
  ev.preventDefault(); ev.stopPropagation();
  const id = f.dataset.fav;
  try {
    if (favoris.has(id)) { await q(sb.from('favoris').delete().eq('logement_id', id)); favoris.delete(id); }
    else { await q(sb.from('favoris').insert({ logement_id: id })); favoris.add(id); }
    f.classList.toggle('on', favoris.has(id)); f.textContent = favoris.has(id) ? '♥' : '♡';
  } catch (e) { toast(erreur(e), true); }
});

// ---------------------------------------------------------------- accueil et recherche
function barreRecherche(p = {}) {
  return `<form class="recherche" id="fRech">
    <label><span>Où</span><select name="territoire" aria-label="Territoire">${optsTerritoires(p.territoire || '', 'Tous les territoires')}</select><input name="commune" list="villesR" placeholder="Ville (facultatif)" value="${esc(p.commune || '')}" aria-label="Ville" style="font-size:13px">${listeVilles('villesR', p.territoire)}</label>
    <label><span>Arrivée</span><input type="date" name="arrivee" min="${auj()}" value="${esc(p.arrivee || '')}"></label>
    <label><span>Départ</span><input type="date" name="depart" min="${auj()}" value="${esc(p.depart || '')}"></label>
    <label><span>Voyageurs</span><input type="number" name="voyageurs" min="1" max="40" value="${esc(p.voyageurs || 2)}"></label>
    <button class="btn btn-p">🔎 Rechercher</button></form>`;
}
function brancherRecherche() {
  const t = document.querySelector('#fRech [name=territoire]'); if (t) brancherVilles(t, 'villesR');
  $('#fRech')?.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); const p = new URLSearchParams();
    Object.entries(d).forEach(([k, v]) => v && p.set(k, v));
    if (d.arrivee && d.depart && d.depart <= d.arrivee) return toast('Le départ doit être après l’arrivée.', true);
    aller('#/recherche?' + p);
  });
}

async function pageAccueil() {
  vue(`
    <section class="hero"><div class="wrap">
      <div class="onglets"><a class="on" href="#/">🏝️ Séjours</a><a href="#/services">🧹 Services pour la maison</a><a href="#/retour">✈️ Retour au pays</a></div>
      <h1>Votre kaz, <em>réservée en confiance</em>.</h1>
      <p>Martinique, Guadeloupe, Guyane, La Réunion, Hexagone et ailleurs : villas, gîtes et appartements de propriétaires vérifiés, et des prestataires de confiance pour le ménage, l’accueil, le jardin ou la piscine.</p>
      ${barreRecherche()}
    </div></section>
    <div class="wrap">
      <div class="puces" id="puces">${[['', '✨', 'Tout'], ['vue_mer', '🌊', 'Vue mer'], ['piscine', '🏊', 'Piscine'], ['plage', '🏖️', 'Plage à pied'], ['villa', '🏡', 'Villas'], ['gite', '🌿', 'Gîtes'], ['appartement', '🏢', 'Appartements'], ['bungalow', '🛖', 'Bungalows'], ['starlink', '🛰️', 'Starlink'], ['animaux', '🐾', 'Animaux acceptés']]
        .map(([k, i, t]) => `<button data-filtre="${k}" class="${k ? '' : 'on'}">${i} ${t}</button>`).join('')}</div>
      <section class="section"><div class="titre-s"><h2>Logements à découvrir</h2><a href="#/recherche">Tout voir →</a></div><div id="liste" class="chargement">Chargement…</div></section>
      <section class="section"><div class="titre-s"><h2>Des services pour votre maison</h2><a href="#/services">Tous les services →</a></div>
        <div class="cats">${Object.entries(CATS).map(([k, [i, t]]) => `<a class="cat" href="#/services/${k}"><span class="ico">${i}</span><b>${esc(t)}</b></a>`).join('')}</div></section>
      <section class="section"><div class="appel"><div><h2>Propriétaire ou prestataire ?</h2><p>Publiez votre logement ou vos services gratuitement. Nous vérifions chaque partenaire avant sa mise en ligne.</p></div>
        <a class="btn btn-p" href="${moi ? '#/compte/partenaire' : '#/inscription?partenaire=1'}">Devenir partenaire</a></div></section>
      <section class="section"><div class="appel" style="background:linear-gradient(135deg,#1e3a5f,#4f46e5)"><div><h2>Visite virtuelle 3D, photos, drone</h2><p>Faites visiter votre bien depuis un téléphone, avant même le premier déplacement. Par IloTech.</p></div>
        <a class="btn btn-p" href="offres.html#visite-3d">Essayer la visite 3D</a></div></section>
    </div>`);
  brancherRecherche();
  let filtre = '';
  const charger = async () => {
    try {
      let r = sb.from('logements').select('*').eq('statut', 'publie').order('created_at', { ascending: false }).limit(24);
      if (filtre && TYPES[filtre]) r = r.eq('type', filtre); else if (filtre) r = r.contains('equipements', [filtre]);
      const l = await q(r), n = await notesDe(l.map(x => x.id));
      $('#liste').className = l.length ? 'grille' : '';
      $('#liste').innerHTML = l.length ? l.map(x => carteLogement(x, n)).join('') : videLogements();
    } catch (e) { $('#liste').innerHTML = `<p class="muted">${esc(erreur(e))}</p>`; }
  };
  $('#puces').addEventListener('click', e => {
    const b = e.target.closest('[data-filtre]'); if (!b) return;
    document.querySelectorAll('#puces button').forEach(x => x.classList.toggle('on', x === b)); filtre = b.dataset.filtre; charger();
  });
  if (PRET) charger(); else $('#liste').innerHTML = videLogements();
}
const videLogements = () => `<div class="vide-etat"><div class="ico">🏝️</div><h3>Les premiers logements arrivent</h3>
  <p class="muted">Nous vérifions les premières annonces des propriétaires. Vous avez un logement, aux Antilles ou ailleurs ? Publiez-le gratuitement.</p>
  <a class="btn btn-p" href="${moi ? '#/compte/partenaire' : '#/inscription?partenaire=1'}">Publier mon logement</a></div>`;

async function pageRecherche() {
  const p = param();
  vue(`<div class="wrap" style="padding-top:22px">${barreRecherche(p)}
    <div class="puces"><label class="petit">Trier : <select id="tri"><option value="recent">Plus récents</option><option value="prix">Prix croissant</option><option value="prix_desc">Prix décroissant</option></select></label>
      <label class="petit">Type : <select id="type"><option value="">Tous</option>${opts(TYPES, p.type)}</select></label>
      <label class="petit">Prix max / nuit : <input id="pmax" type="number" min="0" step="10" style="width:90px" value="${esc(p.pmax || '')}"></label></div>
    <div id="liste" class="chargement" style="margin-top:14px">Recherche…</div></div>`);
  brancherRecherche();
  const charger = async () => {
    try {
      let r = sb.from('logements').select('*').eq('statut', 'publie');
      if (p.territoire) r = r.eq('territoire', p.territoire);
      if (p.commune) r = r.ilike('commune', `%${p.commune.replace(/[%_*,()]/g, '')}%`);
      if (p.voyageurs) r = r.gte('voyageurs', Number(p.voyageurs));
      const type = $('#type').value, pmax = Number($('#pmax').value), tri = $('#tri').value;
      if (type) r = r.eq('type', type);
      if (pmax) r = r.lte('prix_nuit', pmax);
      r = tri === 'recent' ? r.order('created_at', { ascending: false }) : r.order('prix_nuit', { ascending: tri === 'prix' });
      let l = await q(r.limit(60));
      if (p.arrivee && p.depart) { const libres = new Set(await q(sb.rpc('logements_libres', { d1: p.arrivee, d2: p.depart }))); l = l.filter(x => libres.has(x.id)); }
      const n = await notesDe(l.map(x => x.id));
      $('#liste').className = l.length ? 'grille' : '';
      $('#liste').innerHTML = `<p class="muted" style="grid-column:1/-1">${l.length} logement${l.length > 1 ? 's' : ''}${p.commune ? ' à ' + esc(p.commune) : p.territoire ? ' · ' + esc(p.territoire) : ''}${p.arrivee && p.depart ? ' libres du ' + jour(p.arrivee) + ' au ' + jour(p.depart) : ''}</p>` +
        (l.length ? l.map(x => carteLogement(x, n)).join('') : '<div class="vide-etat" style="grid-column:1/-1"><div class="ico">🔎</div><h3>Aucun logement pour ces critères</h3><p class="muted">Essayez d’autres dates ou un autre territoire.</p></div>');
    } catch (e) { $('#liste').innerHTML = `<p class="muted">${esc(erreur(e))}</p>`; }
  };
  ['#tri', '#type', '#pmax'].forEach(s => $(s).addEventListener('change', charger));
  if (PRET) charger(); else $('#liste').innerHTML = videLogements();
}

// ---------------------------------------------------------------- fiche logement
function calendrier(prises, debut, fin) {
  const occupe = d => prises.some(p => d >= p.debut && d < p.fin);
  const mois = k => {
    const m = new Date(); m.setDate(1); m.setMonth(m.getMonth() + k);
    const an = m.getFullYear(), mo = m.getMonth(), n = new Date(an, mo + 1, 0).getDate(), dec = (new Date(an, mo, 1).getDay() + 6) % 7;
    let h = '<i>L</i><i>M</i><i>M</i><i>J</i><i>V</i><i>S</i><i>D</i>' + '<span></span>'.repeat(dec);
    for (let j = 1; j <= n; j++) {
      const d = `${an}-${String(mo + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
      const c = d < auj() ? 'passe' : occupe(d) ? 'pris' : debut && fin && d >= debut && d < fin ? 'choisi' : '';
      h += `<span class="${c}" title="${occupe(d) ? 'Indisponible' : ''}">${j}</span>`;
    }
    return `<div class="mois"><b>${m.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b><div class="jours">${h}</div></div>`;
  };
  return `<div class="cal">${mois(0)}${mois(1)}</div>`;
}

async function pageLogement(id) {
  chargement();
  try {
    const l = await q(sb.from('logements').select('*').eq('id', id).maybeSingle());
    if (!l) return vue('<div class="wrap vide-etat" style="margin-top:30px"><h3>Logement introuvable</h3><a href="#/">Retour à l’accueil</a></div>');
    const [hote, prises, avis, n] = await Promise.all([
      q(sb.from('profiles').select('id, prenom, created_at, avatar, valide, bio').eq('id', l.owner).maybeSingle()),
      q(sb.rpc('dates_prises', { lid: id })),
      q(sb.from('avis').select('note, texte, created_at').eq('logement_id', id).order('created_at', { ascending: false }).limit(20)),
      notesDe([id])]);
    const p = param(), ph = l.photos || [];
    const note = n[id];
    document.title = `${l.titre} — ${l.commune} | Kaz An Nou`;
    vue(`<div class="wrap" style="padding-top:20px">
      <a href="javascript:history.back()" class="petit">← Retour</a>
      <h1 style="margin-top:8px">${esc(l.titre)}</h1>
      <div class="specs"><span>📍 ${l.quartier ? esc(l.quartier) + ', ' : ''}${lieu(l)}</span>${note ? `<span class="etoile">★ ${note.moyenne} · ${note.nombre} avis</span>` : '<span class="tag">Nouveau</span>'}
        ${moi ? `<button class="lien" data-fav="${l.id}">${favoris.has(l.id) ? '♥ Dans vos favoris' : '♡ Ajouter aux favoris'}</button>` : ''}
        ${l.statut !== 'publie' ? tag(ST_ANN[l.statut]) : ''}</div>
      <div class="galerie g${Math.max(1, Math.min(ph.length, 5))}">${(ph.length ? ph.slice(0, 5) : [null]).map((p, i) => `<div>${p ? `<img src="${esc(photo(p))}" alt="Photo ${i + 1} : ${esc(l.titre)}" data-zoom="${i}" ${i ? 'loading="lazy"' : ''}>` : ''}</div>`).join('')}${ph.length > 5 ? `<button class="btn btn-s" data-zoom="0" style="position:absolute;right:14px;bottom:14px">Voir les ${ph.length} photos</button>` : ''}</div>
      <div class="fiche"><div>
        <h2 style="font-size:22px">${esc(TYPES[l.type])} · ${lieu(l)}</h2>
        <div class="specs"><span>👥 ${l.voyageurs} voyageurs</span><span>🛏️ ${l.chambres} chambre${l.chambres > 1 ? 's' : ''} · ${l.lits} lit${l.lits > 1 ? 's' : ''}</span><span>🛁 ${l.sdb} salle${l.sdb > 1 ? 's' : ''} d’eau</span></div>
        ${l.video ? (/\.mp4(\?|$)/i.test(l.video) ? `<div class="bloc"><h3>🎬 Visite en vidéo</h3><video class="video-log" src="${esc(l.video)}" controls playsinline preload="metadata" ${ph[0] ? `poster="${esc(photo(ph[0]))}"` : ''}></video></div>`
          : `<p><a class="btn btn-v" href="${esc(l.video)}" target="_blank" rel="noopener">🎬 Voir la vidéo</a></p>`) : ''}
        ${l.visite3d ? `<p><a class="btn btn-v" href="${esc(l.visite3d)}" target="_blank" rel="noopener">🧊 Visite virtuelle 3D</a></p>` : ''}
        <div class="bloc hote"><div class="avatar">${hote?.avatar ? `<img src="${esc(photo(hote.avatar))}" alt="">` : initiale(hote)}</div>
          <div><b>Proposé par ${esc(hote?.prenom || 'un propriétaire')}</b> ${hote?.valide ? '<span class="tag ok">✓ Vérifié par Kaz An Nou</span>' : ''}<div class="muted petit">Membre depuis ${hote ? new Date(hote.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—'}</div></div></div>
        <div class="bloc"><p style="white-space:pre-line">${esc(l.description) || '<span class="muted">Pas encore de description.</span>'}</p></div>
        <div class="bloc"><h3>Équipements</h3><div class="equip">${EQUIP.filter(e => l.equipements.includes(e[0])).map(e => `<span>${e[1]} ${esc(e[2])}</span>`).join('') || '<span class="muted">Non renseignés</span>'}</div></div>
        <div class="bloc"><h3>Bon à savoir</h3><div class="specs" style="color:var(--texte)"><span>🕒 Arrivée ${esc(l.arrivee || 'à convenir')}</span><span>🕚 Départ ${esc(l.depart || 'à convenir')}</span><span>🌙 ${l.min_nuits} nuit${l.min_nuits > 1 ? 's' : ''} minimum</span></div>
          ${l.regles ? `<p style="white-space:pre-line">${esc(l.regles)}</p>` : ''}</div>
        <div class="bloc"><h3>Disponibilités</h3><div id="cal">${calendrier(prises, p.arrivee, p.depart)}</div><p class="muted petit">Les dates barrées sont déjà réservées.</p></div>
        <div class="bloc"><h3>${avis.length ? `★ ${note.moyenne} · ${avis.length} avis` : 'Avis'}</h3>
          ${avis.length ? avis.map(a => `<div class="avis1"><b>${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}</b><span>${esc(a.texte)}</span><small class="muted">${jourLong(a.created_at.slice(0, 10))}</small></div>`).join('')
            : '<p class="muted">Pas encore d’avis. Seuls les voyageurs qui ont séjourné peuvent en laisser un.</p>'}</div>
      </div>
      <aside class="resa"><div><span class="p">${eur(l.prix_nuit)}</span> <span class="muted">/ nuit</span></div>
        <form id="fResa"><div class="champs2">
          <label><span>Arrivée</span><input type="date" name="debut" required min="${auj()}" value="${esc(p.arrivee || '')}"></label>
          <label><span>Départ</span><input type="date" name="fin" required min="${plus(auj(), 1)}" value="${esc(p.depart || '')}"></label>
          <label class="plein"><span>Voyageurs</span><select name="voyageurs">${Array.from({ length: l.voyageurs }, (_, i) => `<option ${i + 1 === Number(p.voyageurs || 2) ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label></div>
          <label class="f" style="display:block"><textarea name="message" maxlength="2000" placeholder="Un mot pour ${esc(hote?.prenom || 'le propriétaire')} (heure d’arrivée, motif du séjour…)" style="min-height:70px"></textarea></label>
          <div class="calcul" id="calcul"></div>
          <button class="btn btn-p" style="width:100%;margin-top:14px" ${moi?.id === l.owner ? 'disabled' : ''}>Demander à réserver</button>
          <p class="muted petit" style="text-align:center;margin:10px 0 0">Aucun paiement maintenant : ${esc(hote?.prenom || 'le propriétaire')} confirme d’abord, puis vous convenez du règlement ensemble.</p></form></aside>
      </div></div>`);
    const f = $('#fResa');
    const maj = () => {
      const d = Object.fromEntries(new FormData(f));
      if (d.debut) f.fin.min = plus(d.debut, l.min_nuits);
      const n = d.debut && d.fin ? nuits(d.debut, d.fin) : 0;
      $('#calcul').innerHTML = n > 0 ? `<div><span>${eur(l.prix_nuit)} × ${n} nuit${n > 1 ? 's' : ''}</span><span>${eur(l.prix_nuit * n)}</span></div>
        ${l.menage > 0 ? `<div><span>Ménage</span><span>${eur(l.menage)}</span></div>` : ''}<div class="tot"><span>Total</span><span>${eur(l.prix_nuit * n + Number(l.menage))}</span></div>
        ${n < l.min_nuits ? `<div style="color:var(--ko)">Séjour minimum : ${l.min_nuits} nuits</div>` : ''}` : '';
      $('#cal').innerHTML = calendrier(prises, d.debut, d.fin);
    };
    f.addEventListener('input', maj); maj();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!exigeCompte()) return;
      const d = Object.fromEntries(new FormData(f));
      if (!d.debut || !d.fin || d.fin <= d.debut) return toast('Choisissez vos dates d’arrivée et de départ.', true);
      if (prises.some(p => d.debut < p.fin && d.fin > p.debut)) return toast('Ces dates ne sont plus disponibles.', true);
      const b = f.querySelector('button'); b.disabled = true;
      try {
        const r = await q(sb.from('reservations').insert({ logement_id: id, debut: d.debut, fin: d.fin, voyageurs: Number(d.voyageurs), message: d.message || null }).select().single());
        toast('Demande envoyée ! Le propriétaire va vous répondre.');
        aller('#/compte/voyages?nouvelle=' + r.id);
      } catch (err) { toast(erreur(err), true); b.disabled = false; }
    });
    document.querySelectorAll('[data-zoom]').forEach(im => im.addEventListener('click', () => visionneuse(ph.map(photo), Number(im.dataset.zoom))));
  } catch (e) { vue(`<div class="wrap"><p>${esc(erreur(e))}</p></div>`); }
}
function visionneuse(urls, i) {
  const v = document.createElement('div'); v.className = 'visionneuse';
  const montrer = () => { v.innerHTML = `<img src="${esc(urls[i])}" alt="Photo ${i + 1}"><button aria-label="Fermer">×</button>`; };
  montrer();
  v.addEventListener('click', e => { if (e.target.tagName === 'IMG') { i = (i + 1) % urls.length; montrer(); } else v.remove(); });
  document.body.appendChild(v);
}

// ---------------------------------------------------------------- services pour la maison
async function pageServices(cat) {
  vue(`<div class="wrap" style="padding-top:24px">
    <h1>${cat && CATS[cat] ? CATS[cat][0] + ' ' + esc(CATS[cat][1]) : 'Trouvez le bon pro, près de chez vous'}</h1>
    <p class="muted">Plombier, électricien, informaticien, mécanicien, jardinier, ménage, conciergerie, cours, garde d’enfants : des prestataires vérifiés (SIRET et assurance), avec le prix affiché avant et les avis des clients.</p>
    <label class="petit">Territoire : <select id="terrSv">${optsTerritoires(param().territoire || '', 'Tous')}</select></label>
    <div class="puces">${['', ...Object.keys(CATS)].map(k => `<a class="btn btn-s ${k === (cat || '') ? 'btn-v' : ''}" href="#/services${k ? '/' + k : ''}${param().territoire ? '?territoire=' + encodeURIComponent(param().territoire) : ''}">${k ? CATS[k][0] + ' ' + esc(CATS[k][1]) : 'Tous'}</a>`).join('')}</div>
    <div id="liste" class="chargement">Chargement…</div></div>`);
  $('#terrSv').addEventListener('change', e => aller(`#/services${cat ? '/' + cat : ''}${e.target.value ? '?territoire=' + encodeURIComponent(e.target.value) : ''}`));
  if (!PRET) return ($('#liste').innerHTML = videServices());
  try {
    let r = sb.from('prestations').select('*, profiles!prestations_prestataire_id_fkey(prenom, avatar)').eq('statut', 'publie').eq('actif', true).order('created_at', { ascending: false });
    if (cat) r = r.eq('categorie', cat);
    if (param().territoire) r = r.eq('territoire', param().territoire);
    const s = await q(r), n = await notesDe(s.map(x => x.id));
    $('#liste').className = s.length ? 'grille' : '';
    $('#liste').innerHTML = s.length ? s.map(x => `<a class="carte" href="#/prestation/${x.id}">
      <div class="ph" style="aspect-ratio:16/9">${x.photos?.[0] ? `<img src="${esc(photo(x.photos[0]))}" alt="" loading="lazy">` : `<span class="vide">${CATS[x.categorie][0]}</span>`}</div>
      <div class="corps"><div class="l1"><span>${esc(x.titre)}</span>${n[x.id] ? `<span class="etoile">★ ${n[x.id].moyenne}</span>` : ''}</div>
        <div class="muted petit">${CATS[x.categorie][0]} ${esc(CATS[x.categorie][1])} · par ${esc(x.profiles?.prenom || 'un prestataire')}</div>
        <div class="muted petit">📍 ${x.communes.length ? esc(x.communes.slice(0, 3).join(', ')) + (x.communes.length > 3 ? '…' : '') + ' · ' : 'Tout le territoire · '}${esc(x.territoire)}</div>
        <div class="prix"><span class="muted">À partir de</span> <b>${eur(x.prix)}</b> <span class="muted">${esc(UNITES[x.unite])}</span></div></div></a>`).join('') : videServices();
  } catch (e) { $('#liste').innerHTML = `<p>${esc(erreur(e))}</p>`; }
}
const videServices = () => `<div class="vide-etat"><div class="ico">🧹</div><h3>Nos premiers prestataires arrivent</h3>
  <p class="muted">Nous vérifions chaque prestataire (SIRET, assurance) avant de l’afficher. Besoin d’un service maintenant ? Écrivez-nous, on vous trouve quelqu’un.</p>
  <div class="actions" style="justify-content:center"><a class="btn btn-wa" href="${wa(WA, 'Bonjour Kaz An Nou, je cherche un service pour ma maison : ')}" target="_blank" rel="noopener">Demander sur WhatsApp</a>
  <a class="btn" href="${moi ? '#/compte/partenaire' : '#/inscription?partenaire=1'}">Je suis prestataire</a></div></div>`;

async function pagePrestation(id) {
  chargement();
  try {
    const s = await q(sb.from('prestations').select('*').eq('id', id).maybeSingle());
    if (!s) return vue('<div class="wrap vide-etat" style="margin-top:30px"><h3>Prestation introuvable</h3><a href="#/services">Tous les services</a></div>');
    const [pr, avis, mesLog] = await Promise.all([
      q(sb.from('profiles').select('prenom, avatar, bio, valide, created_at, metiers').eq('id', s.prestataire_id).maybeSingle()),
      q(sb.from('avis').select('note, texte, created_at').eq('prestation_id', id).order('created_at', { ascending: false }).limit(20)),
      moi ? q(sb.from('logements').select('id, titre, commune').eq('owner', moi.id)) : []]);
    vue(`<div class="wrap" style="padding-top:20px"><a href="#/services/${s.categorie}" class="petit">← ${esc(CATS[s.categorie][1])}</a>
      <div class="fiche" style="margin-top:12px"><div>
        <span class="tag">${CATS[s.categorie][0]} ${esc(CATS[s.categorie][1])}</span>
        <h1 style="margin-top:10px">${esc(s.titre)}</h1>
        ${s.photos?.length ? `<div class="galerie" style="grid-template-rows:180px 180px">${[0, 1, 2].map(i => `<div>${s.photos[i] ? `<img src="${esc(photo(s.photos[i]))}" alt="">` : ''}</div>`).join('')}</div>` : ''}
        <div class="bloc hote"><div class="avatar">${pr?.avatar ? `<img src="${esc(photo(pr.avatar))}" alt="">` : initiale(pr)}</div>
          <div><b>${esc(pr?.prenom || 'Prestataire')}</b> ${pr?.valide ? '<span class="tag ok">✓ SIRET et assurance vérifiés</span>' : ''}<div class="muted petit">${esc((pr?.metiers || []).join(' · '))}</div></div></div>
        ${pr?.bio ? `<div class="bloc"><p style="white-space:pre-line">${esc(pr.bio)}</p></div>` : ''}
        <div class="bloc"><h3>La prestation</h3><p style="white-space:pre-line">${esc(s.description) || '<span class="muted">—</span>'}</p>
          <p>📍 ${s.communes.length ? esc(s.communes.join(', ')) + ' · ' : 'Tout le territoire · '}${esc(s.territoire)}</p></div>
        <div class="bloc"><h3>Avis</h3>${avis.length ? avis.map(a => `<div class="avis1"><b>${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}</b><span>${esc(a.texte)}</span></div>`).join('') : '<p class="muted">Pas encore d’avis.</p>'}</div>
      </div>
      <aside class="resa"><div><span class="muted">À partir de</span> <span class="p">${eur(s.prix)}</span> <span class="muted">${esc(UNITES[s.unite])}</span></div>
        <form id="fDem" class="f" style="margin-top:14px">
          <div class="ligne2"><label>Date<input type="date" name="jour" required min="${auj()}"></label><label>Créneau<select name="creneau">${opts(CRENEAUX, 'matin')}</select></label></div>
          ${mesLog.length ? `<label>Pour quel logement ?<select name="logement_id"><option value="">Autre adresse</option>${mesLog.map(x => `<option value="${x.id}">${esc(x.titre)} (${esc(x.commune)})</option>`).join('')}</select></label>` : ''}
          <div class="ligne2">${champsLieu(s.territoire, profil?.territoire === s.territoire ? profil?.commune : '', 'villesD')}</div>
          <label>Adresse <span class="aide">(visible seulement par le prestataire)</span><input name="adresse" maxlength="300" autocomplete="street-address"></label>
          <label>Votre besoin<textarea name="message" maxlength="2000" placeholder="Surface, nombre de chambres, accès, clés…"></textarea></label>
          <button class="btn btn-p" ${moi?.id === s.prestataire_id ? 'disabled' : ''}>Envoyer la demande</button>
          <p class="muted petit" style="margin:0">Le prestataire confirme le prix exact avant de venir. Aucun paiement en ligne.</p></form></aside></div></div>`);
    brancherLieux();
    $('#fDem').addEventListener('submit', async e => {
      e.preventDefault(); if (!exigeCompte()) return;
      const d = Object.fromEntries(new FormData(e.target));
      if (!d.commune.trim()) return toast('Indiquez la ville.', true);
      const b = e.target.querySelector('button'); b.disabled = true;
      try {
        await q(sb.from('demandes').insert({ prestation_id: id, jour: d.jour, creneau: d.creneau, territoire: d.territoire, commune: d.commune.trim(), adresse: d.adresse || null, message: d.message || null, logement_id: d.logement_id || null }));
        toast('Demande envoyée au prestataire !'); aller('#/compte/services');
      } catch (err) { toast(erreur(err), true); b.disabled = false; }
    });
  } catch (e) { vue(`<div class="wrap"><p>${esc(erreur(e))}</p></div>`); }
}

function pageRetour() {
  const txt = 'Bonjour Kaz An Nou, je prépare mon retour au pays. Territoire : … · Ville : … · Date d’arrivée : … · Mes besoins : …';
  vue(`<section class="hero"><div class="wrap"><h1>Retour au pays : <em>on prépare votre arrivée</em>.</h1>
    <p>Vous revenez vivre aux Antilles, en Guyane, à La Réunion ou à Mayotte, ou vous y êtes muté ? Sur place, on s’occupe de ce qui ne peut pas se faire à distance.</p>
    <a class="btn btn-p" href="${wa(WA, txt)}" target="_blank" rel="noopener">Parler de mon projet sur WhatsApp</a></div></section>
    <div class="wrap section"><div class="cats">${[['📹', 'Visite vidéo en direct', 'd’un logement que vous avez trouvé, avant de signer'], ['🛰️', 'Internet prêt', 'box ou Starlink installé avant votre arrivée'],
      ['🧹', 'Logement prêt', 'ménage fait, premières courses'], ['📝', 'Démarches', 'aide pour les compteurs, contrats et inscriptions en ligne'], ['🚚', 'Déménagement', 'déménageurs et artisans partenaires'], ['📱', 'Appareils prêts', 'téléphone, ordinateur et Wi-Fi réglés']]
      .map(([i, t, d]) => `<div class="cat"><span class="ico">${i}</span><b>${t}</b><p class="muted petit">${d}</p></div>`).join('')}</div>
      <p class="muted" style="margin-top:20px">Sur devis selon vos besoins. Nous ne faisons ni transaction ni recherche de logement rémunérée : pour cela, nous vous mettons en relation avec des agences immobilières.</p></div>`);
}

// ---------------------------------------------------------------- comptes
function pageConnexion() {
  if (moi) return aller('#/compte');
  if (!PRET) return vue(fermePourLeMoment());
  vue(`<div class="wrap"><div class="carte-f"><h1>Connexion</h1>
    <form class="f" id="fCo"><label>Email<input type="email" name="email" required autocomplete="email"></label>
      <label>Mot de passe<input type="password" name="mdp" required autocomplete="current-password"></label>
      <button class="btn btn-p">Se connecter</button></form>
    <p><button class="lien" id="oubli">Mot de passe oublié ?</button></p>
    <p class="muted">Pas encore de compte ? <a href="#/inscription">Créer un compte</a></p></div></div>`);
  $('#fCo').addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); const b = e.target.querySelector('button'); b.disabled = true;
    try {
      await q(sb.auth.signInWithPassword({ email: d.email.trim(), password: d.mdp }));
      await chargerMoi(); toast('Bienvenue ' + (profil?.prenom || '') + ' !');
      aller(decodeURIComponent(param().retour || '') || '#/compte');
    } catch (err) { toast(erreur(err), true); b.disabled = false; }
  });
  $('#oubli').addEventListener('click', async () => {
    const email = $('#fCo').email.value.trim();
    if (!email) return toast('Écrivez d’abord votre email ci-dessus.', true);
    try { await q(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '?nouveau-mdp=1' })); toast('Si un compte existe, un email de réinitialisation est envoyé.'); }
    catch (err) { toast(erreur(err), true); }
  });
}
function pageInscription() {
  if (moi) return aller('#/compte');
  if (!PRET) return vue(fermePourLeMoment());
  const partenaire = param().partenaire;
  vue(`<div class="wrap"><div class="carte-f"><h1>Créer un compte</h1>
    ${partenaire ? '<p class="muted">Créez d’abord votre compte, puis choisissez « Devenir partenaire » dans votre espace.</p>' : ''}
    <form class="f" id="fIns"><div class="ligne2"><label>Prénom<input name="prenom" required maxlength="60" autocomplete="given-name"></label><label>Nom<input name="nom" maxlength="60" autocomplete="family-name"></label></div>
      <label>Email<input type="email" name="email" required autocomplete="email"></label>
      <label>Téléphone <span class="aide">(partagé seulement avec vos hôtes ou prestataires)</span><input type="tel" name="telephone" pattern="[0-9 +]{6,20}" autocomplete="tel"></label>
      <label>Mot de passe <span class="aide">(8 caractères minimum)</span><input type="password" name="mdp" required minlength="8" autocomplete="new-password"></label>
      <label style="display:flex;gap:8px;font-weight:400"><input type="checkbox" required style="width:auto"> <span>J’accepte les <a href="cgu.html" target="_blank">conditions d’utilisation</a> et la <a href="confidentialite.html" target="_blank">politique de confidentialité</a>.</span></label>
      <button class="btn btn-p">Créer mon compte</button></form>
    <p class="muted">Déjà inscrit ? <a href="#/connexion">Se connecter</a></p></div></div>`);
  $('#fIns').addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); const b = e.target.querySelector('button'); b.disabled = true;
    try {
      const r = await q(sb.auth.signUp({ email: d.email.trim(), password: d.mdp, options: { data: { prenom: d.prenom.trim(), nom: d.nom.trim(), telephone: d.telephone.trim() }, emailRedirectTo: location.origin + location.pathname } }));
      if (r.session) { await chargerMoi(); toast('Compte créé, bienvenue !'); aller(partenaire ? '#/compte/partenaire' : '#/compte'); }
      else vue(`<div class="wrap"><div class="carte-f"><h1>Vérifiez vos emails 📩</h1><p>Un lien de confirmation a été envoyé à <b>${esc(d.email)}</b>. Cliquez dessus pour activer votre compte, puis connectez-vous.</p><a class="btn" href="#/connexion">Se connecter</a></div></div>`);
    } catch (err) { toast(erreur(err), true); b.disabled = false; }
  });
}
function pageNouveauMdp() {
  vue(`<div class="wrap"><div class="carte-f"><h1>Nouveau mot de passe</h1><form class="f" id="fMdp"><label>Nouveau mot de passe<input type="password" name="mdp" minlength="8" required autocomplete="new-password"></label><button class="btn btn-p">Enregistrer</button></form></div></div>`);
  $('#fMdp').addEventListener('submit', async e => {
    e.preventDefault();
    try { await q(sb.auth.updateUser({ password: e.target.mdp.value })); toast('Mot de passe changé.'); history.replaceState(null, '', location.pathname + '#/compte'); rendre(); }
    catch (err) { toast(erreur(err), true); }
  });
}
const fermePourLeMoment = () => `<div class="wrap"><div class="carte-f"><h1>Ouverture très bientôt</h1><p>Les comptes Kaz An Nou ouvrent dans quelques jours. En attendant, écrivez-nous :</p>
  <a class="btn btn-wa" href="${wa(WA, 'Bonjour Kaz An Nou, ')}" target="_blank" rel="noopener">WhatsApp</a></div></div>`;

// ---------------------------------------------------------------- espace compte
const MENUS = () => [
  ['', 'Tableau de bord'], ['voyages', 'Mes séjours'], ['services', 'Mes demandes de services'], ['favoris', 'Favoris'], ['messages', 'Messages', compteurs.msgs], ['profil', 'Mon profil'],
  ...(role('proprietaire') ? [['sep', 'Propriétaire'], ['logements', 'Mes logements'], ['recues', 'Réservations reçues'], ['carnet', 'Carnet du logement']] : []),
  ...(role('prestataire') ? [['sep', 'Prestataire'], ['prestations', 'Mes prestations'], ['demandes', 'Demandes reçues']] : []),
  ...(!role('proprietaire') || !role('prestataire') ? [['partenaire', 'Devenir partenaire']] : []),
  ...(profil?.role === 'admin' ? [['sep', 'Administration'], ['admin', 'Validation et suivi']] : [])];

async function pageCompte(onglet, sous) {
  if (!PRET) return vue(fermePourLeMoment());
  if (!exigeCompte()) return;
  await chargerMoi();               // rôle à jour (ex. partenaire validé pendant la session)
  if (!moi) return aller('#/connexion');
  vue(`<div class="wrap compte"><nav class="menu-c" aria-label="Mon espace">
    ${MENUS().map(([k, t, n]) => k === 'sep' ? `<span class="sep">${esc(t)}</span>` : `<a href="#/compte${k ? '/' + k : ''}" class="${k === (onglet || '') ? 'on' : ''}">${esc(t)}${n ? `<span class="badge">${n}</span>` : ''}</a>`).join('')}
    <a href="#/deconnexion">Se déconnecter</a></nav><div id="contenu" class="chargement">Chargement…</div></div>`);
  const c = $('#contenu'); c.className = '';
  const pages = { '': ongletAccueil, voyages: ongletVoyages, services: ongletMesDemandes, favoris: ongletFavoris, messages: ongletMessages, profil: ongletProfil, partenaire: ongletPartenaire,
    logements: ongletLogements, recues: ongletRecues, carnet: ongletCarnet, prestations: ongletPrestations, demandes: ongletDemandesRecues, admin: ongletAdmin };
  try { await (pages[onglet || ''] || ongletAccueil)(c, sous); } catch (e) { c.innerHTML = `<p>${esc(erreur(e))}</p>`; }
}

async function ongletAccueil(c) {
  const [v, d] = await Promise.all([
    q(sb.from('reservations').select('id').eq('client_id', moi.id).in('statut', ['demande', 'acceptee']).gte('fin', auj())),
    q(sb.from('demandes').select('id').eq('client_id', moi.id).in('statut', ['demande', 'acceptee']))]);
  const cm = (role('proprietaire') || role('prestataire')) ? await sb.rpc('mes_commissions').then(r => r.error || !r.data?.lignes?.length ? null : r.data) : null;
  const euros = n => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  c.innerHTML = `<h1>Bonjour ${esc(profil.prenom || '')} 👋</h1>
    <div class="stat"><div><b>${v.length}</b>séjour${v.length > 1 ? 's' : ''} à venir</div><div><b>${d.length}</b>service${d.length > 1 ? 's' : ''} en cours</div><div><b>${favoris.size}</b>favori${favoris.size > 1 ? 's' : ''}</div><div><b>${compteurs.msgs}</b>message${compteurs.msgs > 1 ? 's' : ''} non lu${compteurs.msgs > 1 ? 's' : ''}</div></div>
    ${profil.demande_role ? `<div class="vide-etat" style="text-align:left;margin-bottom:18px">⏳ Votre demande pour devenir <b>${profil.demande_role === 'proprietaire' ? 'propriétaire' : 'prestataire'}</b> est en cours de vérification. Nous vous répondons sous 48 h.</div>` : ''}
    ${compteurs.resa ? `<div class="vide-etat" style="text-align:left;margin-bottom:18px">🔔 Vous avez <b>${compteurs.resa}</b> demande${compteurs.resa > 1 ? 's' : ''} à traiter : <a href="#/compte/${role('proprietaire') ? 'recues' : 'demandes'}">voir</a></div>` : ''}
    ${cm ? `<details class="bloc" style="margin-bottom:18px"><summary><b>💶 Commission Kaz An Nou</b> · à régler : <b>${euros(cm.due)}</b> <span class="muted petit">· ce mois ${euros(cm.ventes_mois)} de ventes</span></summary>
      <p class="petit muted">8 % sur les séjours acceptés et les prestations réalisées. Vos clients vous paient directement ; la commission est réglée chaque mois.</p>
      ${cm.lignes.map(x => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0"><span>${x.source === 'reservation' ? '🏡 Séjour' : '🔧 Prestation'} · ${new Date(x.created_at).toLocaleDateString('fr-FR')}</span><b style="${x.statut === 'annulee' ? 'text-decoration:line-through;opacity:.5' : ''}">${euros(x.montant)}${x.statut === 'payee' ? ' ✓' : ''}</b></div>`).join('')}</details>` : ''}
    <div class="actions"><a class="btn btn-p" href="#/">Trouver un séjour</a><a class="btn" href="#/services">Réserver un service</a>
      ${role('proprietaire') ? '<a class="btn" href="#/compte/logements/nouveau">Ajouter un logement</a>' : ''}${role('prestataire') ? '<a class="btn" href="#/compte/prestations/nouvelle">Ajouter une prestation</a>' : ''}</div>`;
}

// ligne d'une réservation (vue client ou propriétaire)
function ligneResa(r, l, cote, contactAutre) {
  const actions = [];
  const fil = `<a class="btn btn-s" href="#/conversation/r/${r.id}">💬 Messages</a>`;
  if (r.statut !== 'blocage') actions.push(fil);
  if (cote === 'client' && ['demande', 'acceptee'].includes(r.statut) && r.debut > auj()) actions.push(`<button class="btn btn-s btn-ko" data-resa="${r.id}" data-st="annulee">Annuler</button>`);
  if (cote === 'client' && r.statut === 'acceptee' && r.fin <= auj()) actions.push(`<a class="btn btn-s btn-p" href="#/avis/r/${r.id}">★ Laisser un avis</a>`);
  if (cote === 'proprio' && r.statut === 'demande') actions.push(`<button class="btn btn-s btn-v" data-resa="${r.id}" data-st="acceptee">Accepter</button><button class="btn btn-s btn-ko" data-resa="${r.id}" data-st="refusee">Refuser</button>`);
  if (cote === 'proprio' && ['acceptee', 'blocage'].includes(r.statut) && r.debut > auj()) actions.push(`<button class="btn btn-s btn-ko" data-resa="${r.id}" data-st="annulee">${r.statut === 'blocage' ? 'Débloquer' : 'Annuler'}</button>`);
  if (contactAutre?.telephone) actions.push(`<a class="btn btn-s btn-wa" href="${wa(contactAutre.telephone, `Bonjour, à propos du séjour du ${jourLong(r.debut)} (${l?.titre || ''}) sur Kaz An Nou.`)}" target="_blank" rel="noopener">WhatsApp</a>`);
  return `<div class="ligne-l">${l?.photos?.[0] ? `<img class="mini" src="${esc(photo(l.photos[0]))}" alt="">` : '<div class="mini"></div>'}
    <div><b><a href="#/logement/${r.logement_id}">${esc(l?.titre || 'Logement')}</a></b> ${tag(ST_RESA[r.statut])}
      <div class="muted petit">${jour(r.debut)} → ${jour(r.fin)} · ${nuits(r.debut, r.fin)} nuit${nuits(r.debut, r.fin) > 1 ? 's' : ''}${r.statut !== 'blocage' ? ` · ${r.voyageurs} voyageur${r.voyageurs > 1 ? 's' : ''} · <b>${eur(r.total)}</b>` : ''}</div>
      ${r.message ? `<div class="petit">« ${esc(r.message)} »</div>` : ''}${contactAutre?.nom ? `<div class="petit">👤 ${esc(contactAutre.nom)}</div>` : ''}</div>
    <div class="actions">${actions.join('')}</div></div>`;
}
// un seul gestionnaire par écran (onclick) : un nouvel affichage remplace l'ancien, pas de double action
function brancherStatut(c, table, apres, autre) {
  c.onclick = async e => {
    if (autre && await autre(e)) return;
    const b = e.target.closest('[data-st]'); if (!b) return;
    const st = b.dataset.st;
    if (['annulee', 'refusee'].includes(st) && !confirm(st === 'annulee' ? 'Confirmer l’annulation ?' : 'Refuser cette demande ?')) return;
    b.disabled = true;
    try { await q(sb.from(table).update({ statut: st }).eq('id', b.dataset.resa || b.dataset.dem)); toast('C’est fait.'); compter(); apres(); }
    catch (err) { toast(erreur(err), true); b.disabled = false; }
  };
}

async function ongletVoyages(c) {
  const r = await q(sb.from('reservations').select('*, logements(titre, photos, owner, commune)').eq('client_id', moi.id).neq('statut', 'blocage').order('debut', { ascending: false }));
  const proprios = [...new Set(r.map(x => x.logements?.owner).filter(Boolean))];
  const [pr, ct] = proprios.length ? await Promise.all([q(sb.from('profiles').select('id, prenom').in('id', proprios)), q(sb.from('contacts').select('id, telephone').in('id', proprios))]) : [[], []];
  const info = id => ({ nom: pr.find(x => x.id === id)?.prenom, telephone: ct.find(x => x.id === id)?.telephone });
  const nouvelle = param().nouvelle;
  c.innerHTML = `<h1>Mes séjours</h1>${nouvelle ? '<div class="vide-etat" style="text-align:left;margin-bottom:16px">✅ Demande envoyée. Le propriétaire a été prévenu dans son espace ; vous pouvez aussi le prévenir par WhatsApp ci-dessous.</div>' : ''}
    ${r.length ? r.map(x => ligneResa(x, x.logements, 'client', info(x.logements?.owner))).join('') : '<div class="vide-etat"><div class="ico">🧳</div><h3>Aucun séjour pour l’instant</h3><a class="btn btn-p" href="#/">Trouver un logement</a></div>'}`;
  brancherStatut(c, 'reservations', () => ongletVoyages(c));
}

async function ongletRecues(c) {
  const r = await q(sb.from('reservations').select('*, logements!inner(titre, photos, owner)').eq('logements.owner', moi.id).order('debut', { ascending: true }));
  const clients = [...new Set(r.filter(x => x.statut !== 'blocage').map(x => x.client_id))];
  const [pr, ct] = clients.length ? await Promise.all([q(sb.from('profiles').select('id, prenom, nom').in('id', clients)), q(sb.from('contacts').select('id, telephone').in('id', clients))]) : [[], []];
  const info = id => { const p = pr.find(x => x.id === id); return { nom: p ? `${p.prenom} ${p.nom}`.trim() : '', telephone: ct.find(x => x.id === id)?.telephone }; };
  const groupes = [['À traiter', r.filter(x => x.statut === 'demande')], ['À venir', r.filter(x => ['acceptee', 'blocage'].includes(x.statut) && x.fin >= auj())], ['Historique', r.filter(x => !['demande'].includes(x.statut) && !(['acceptee', 'blocage'].includes(x.statut) && x.fin >= auj()))]];
  c.innerHTML = `<h1>Réservations reçues</h1>` + groupes.map(([t, l]) => `<h3>${t} (${l.length})</h3>${l.length ? l.map(x => ligneResa(x, x.logements, 'proprio', x.statut === 'blocage' ? null : info(x.client_id))).join('') : '<p class="muted">Rien ici.</p>'}`).join('');
  brancherStatut(c, 'reservations', () => ongletRecues(c));
}

async function ongletFavoris(c) {
  const ids = [...favoris];
  const l = ids.length ? await q(sb.from('logements').select('*').in('id', ids)) : [];
  const n = await notesDe(l.map(x => x.id));
  c.innerHTML = `<h1>Favoris</h1>${l.length ? `<div class="grille">${l.map(x => carteLogement(x, n)).join('')}</div>` : '<div class="vide-etat"><div class="ico">♡</div><h3>Pas encore de favoris</h3><p class="muted">Touchez ♡ sur un logement pour le garder ici.</p></div>'}`;
}

async function ongletProfil(c) {
  c.innerHTML = `<h1>Mon profil</h1><form class="f" id="fPro" style="max-width:560px">
    <div class="ligne2"><label>Prénom<input name="prenom" maxlength="60" value="${esc(profil.prenom)}"></label><label>Nom<input name="nom" maxlength="60" value="${esc(profil.nom)}"></label></div>
    <div class="ligne2"><label>Téléphone<input type="tel" name="telephone" pattern="[0-9 +]{6,20}" value="${esc(contact?.telephone || '')}"></label></div>
    <div class="ligne2">${champsLieu(profil.territoire || '', profil.commune, 'villesP', false, '—')}</div>
    <label>Présentation <span class="aide">(visible sur vos annonces si vous êtes partenaire)</span><textarea name="bio" maxlength="1500">${esc(profil.bio || '')}</textarea></label>
    <label>Photo de profil<input type="file" name="avatar" accept="image/*"></label>
    <button class="btn btn-p">Enregistrer</button></form>
    <div class="bloc" style="margin-top:20px"><h3>Mes données</h3><p class="muted petit">Email : ${esc(moi.email)}. Pour supprimer votre compte et vos données, écrivez à ilotech.contact@gmail.com : c’est fait sous 30 jours.</p></div>`;
  brancherLieux();
  $('#fPro').addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); const b = e.target.querySelector('button'); b.disabled = true;
    try {
      const maj = { prenom: d.prenom.trim(), nom: d.nom.trim(), territoire: d.territoire || null, commune: d.commune.trim() || null, bio: d.bio.trim() || null };
      if (e.target.avatar.files[0]) maj.avatar = (await envoyerPhotos([e.target.avatar.files[0]]))[0];
      await q(sb.from('profiles').update(maj).eq('id', moi.id));
      await q(sb.from('contacts').update({ telephone: d.telephone.trim() || null }).eq('id', moi.id));
      await chargerMoi(); toast('Profil enregistré.'); b.disabled = false;
    } catch (err) { toast(erreur(err), true); b.disabled = false; }
  });
}

async function ongletPartenaire(c) {
  const enCours = profil.demande_role;
  c.innerHTML = `<h1>Devenir partenaire</h1>
    <p class="muted">Publiez vos logements ou vos services gratuitement. Nous vérifions chaque partenaire avant sa mise en ligne (SIRET, assurance, identité), sous 48 h.</p>
    ${enCours ? `<div class="vide-etat" style="text-align:left">⏳ Demande en cours pour devenir <b>${enCours === 'proprietaire' ? 'propriétaire' : 'prestataire'}</b>. Nous vous contactons rapidement.</div>` : ''}
    <form class="f" id="fPart" style="max-width:620px;margin-top:16px">
      <label>Je veux<select name="demande_role" required>
        ${!role('proprietaire') ? '<option value="proprietaire">Proposer mon logement en location (propriétaire)</option>' : ''}
        ${!role('prestataire') ? '<option value="prestataire">Proposer mes services (ménage, jardin, piscine, travaux…)</option>' : ''}</select></label>
      <label>Métiers ou activité <span class="aide">(séparés par des virgules)</span><input name="metiers" maxlength="200" value="${esc((profil.metiers || []).join(', '))}" placeholder="ex. ménage, repassage, accueil voyageurs"></label>
      <label>SIRET <span class="aide">(obligatoire pour les prestataires ; propriétaires : facultatif)</span><input name="siret" inputmode="numeric" pattern="[0-9 ]{9,17}" value="${esc(profil.siret || '')}"></label>
      <label style="display:flex;gap:8px;font-weight:400"><input type="checkbox" name="assurance" ${profil.assurance ? 'checked' : ''} style="width:auto"> J’ai une assurance responsabilité civile (professionnelle pour les prestataires)</label>
      <label>Présentez-vous en quelques lignes<textarea name="bio" maxlength="1500">${esc(profil.bio || '')}</textarea></label>
      <label style="display:flex;gap:8px;font-weight:400"><input type="checkbox" required style="width:auto"> <span>J’accepte les <a href="cgu.html#partenaires" target="_blank">conditions partenaires</a> : prix annoncés avant, travail déclaré, respect des clients.</span></label>
      <button class="btn btn-p">Envoyer ma demande</button></form>`;
  $('#fPart').addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    if (d.demande_role === 'prestataire' && !d.siret) return toast('Le SIRET est obligatoire pour les prestataires.', true);
    try {
      await q(sb.from('profiles').update({ demande_role: d.demande_role, metiers: d.metiers.split(',').map(x => x.trim()).filter(Boolean).slice(0, 10), siret: d.siret.trim() || null, assurance: !!d.assurance, bio: d.bio.trim() || null }).eq('id', moi.id));
      await chargerMoi(); toast('Demande envoyée ! Réponse sous 48 h.'); ongletPartenaire(c);
    } catch (err) { toast(erreur(err), true); }
  });
}

// -------- propriétaire : logements
async function ongletLogements(c, sous) {
  if (sous) return formLogement(c, sous === 'nouveau' ? null : sous);
  const l = await q(sb.from('logements').select('*').eq('owner', moi.id).order('created_at', { ascending: false }));
  c.innerHTML = `<div class="titre-s"><h1>Mes logements</h1><a class="btn btn-p" href="#/compte/logements/nouveau">+ Ajouter</a></div>
    ${l.length ? l.map(x => `<div class="ligne-l">${x.photos[0] ? `<img class="mini" src="${esc(photo(x.photos[0]))}" alt="">` : '<div class="mini"></div>'}
      <div><b>${esc(x.titre)}</b> ${tag(ST_ANN[x.statut])}<div class="muted petit">${lieu(x)} · ${eur(x.prix_nuit)} / nuit · ${x.photos.length} photo${x.photos.length > 1 ? 's' : ''}</div>
        ${x.statut === 'refuse' && x.motif_refus ? `<div class="petit" style="color:var(--ko)">Motif : ${esc(x.motif_refus)}</div>` : ''}</div>
      <div class="actions"><a class="btn btn-s" href="#/compte/logements/${x.id}">Modifier</a><a class="btn btn-s" href="#/logement/${x.id}">Voir</a><a class="btn btn-s" href="#/compte/carnet/${x.id}">Carnet</a>
        ${['brouillon', 'refuse'].includes(x.statut) ? `<button class="btn btn-s btn-v" data-envoi="${x.id}">Envoyer en validation</button>` : ''}
        ${x.statut === 'publie' ? `<button class="btn btn-s" data-bloquer="${x.id}">Bloquer des dates</button>` : ''}</div></div>`).join('')
      : '<div class="vide-etat"><div class="ico">🏡</div><h3>Ajoutez votre premier logement</h3><p class="muted">Photos, description, prix : comptez 10 minutes. Nous le vérifions puis il est en ligne.</p><a class="btn btn-p" href="#/compte/logements/nouveau">Ajouter un logement</a></div>'}`;
  c.onclick = async e => {
    const env = e.target.closest('[data-envoi]'), bl = e.target.closest('[data-bloquer]');
    try {
      if (env) { await q(sb.from('logements').update({ statut: 'en_attente' }).eq('id', env.dataset.envoi)); toast('Envoyé en validation.'); ongletLogements(c); }
      if (bl) {
        const d1 = prompt('Bloquer à partir du (AAAA-MM-JJ) :', plus(auj(), 1)); if (!d1) return;
        const d2 = prompt('Jusqu’au (date de départ, AAAA-MM-JJ) :', plus(d1, 1)); if (!d2) return;
        await q(sb.from('reservations').insert({ logement_id: bl.dataset.bloquer, debut: d1, fin: d2, statut: 'blocage' })); toast('Dates bloquées.');
      }
    } catch (err) { toast(erreur(err), true); }
  };
}

async function formLogement(c, id) {
  const avecVideo = !(await sb.from('logements').select('video').limit(1)).error;   // colonne ajoutée par la mise à jour de la base
  const l = id ? await q(sb.from('logements').select('*').eq('id', id).single()) : { titre: '', description: '', type: 'villa', territoire: profil.territoire || 'Martinique', commune: profil.commune || '', chambres: 1, lits: 1, sdb: 1, voyageurs: 2, prix_nuit: '', menage: 0, min_nuits: 1, equipements: [], photos: [], arrivee: '16 h', depart: '11 h', regles: '', visite3d: '', quartier: '' };
  let photos = [...l.photos];
  const dessinerPhotos = () => { $('#ph').innerHTML = photos.map((p, i) => `<div><img src="${esc(photo(p))}" alt=""><button type="button" data-suppr="${i}" aria-label="Retirer">×</button></div>`).join(''); };
  c.innerHTML = `<a href="#/compte/logements" class="petit">← Mes logements</a><h1>${id ? 'Modifier le logement' : 'Nouveau logement'}</h1>
    <form class="f" id="fLog" style="max-width:760px">
      <label>Titre de l’annonce<input name="titre" required minlength="3" maxlength="120" value="${esc(l.titre)}" placeholder="ex. Villa créole vue mer avec piscine"></label>
      <div class="ligne2"><label>Type<select name="type">${opts(TYPES, l.type)}</select></label><label>Quartier <span class="aide">(facultatif)</span><input name="quartier" maxlength="80" value="${esc(l.quartier || '')}"></label></div>
      <div class="ligne2">${champsLieu(l.territoire, l.commune, 'villesL')}</div>
      <div class="ligne3"><label>Voyageurs max<input type="number" name="voyageurs" min="1" max="40" value="${l.voyageurs}"></label><label>Chambres<input type="number" name="chambres" min="0" max="30" value="${l.chambres}"></label><label>Lits<input type="number" name="lits" min="0" max="60" value="${l.lits}"></label></div>
      <div class="ligne3"><label>Salles d’eau<input type="number" name="sdb" min="0" max="30" value="${l.sdb}"></label><label>Prix par nuit (€)<input type="number" name="prix_nuit" required min="1" max="20000" step="1" value="${esc(l.prix_nuit)}"></label><label>Frais de ménage (€)<input type="number" name="menage" min="0" max="2000" value="${l.menage}"></label></div>
      <div class="ligne3"><label>Nuits minimum<input type="number" name="min_nuits" min="1" max="90" value="${l.min_nuits}"></label><label>Arrivée<input name="arrivee" maxlength="20" value="${esc(l.arrivee || '')}"></label><label>Départ<input name="depart" maxlength="20" value="${esc(l.depart || '')}"></label></div>
      <label>Description<textarea name="description" maxlength="5000" style="min-height:160px">${esc(l.description)}</textarea></label>
      <fieldset class="f" style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:6px">Équipements</legend><div class="cases">${EQUIP.map(([k, i, t]) => `<label><input type="checkbox" name="eq" value="${k}" ${l.equipements.includes(k) ? 'checked' : ''}> ${i} ${esc(t)}</label>`).join('')}</div></fieldset>
      <label>Règles de la maison<textarea name="regles" maxlength="2000" placeholder="Non-fumeur, fêtes interdites, animaux…">${esc(l.regles || '')}</textarea></label>
      <label>Lien de visite virtuelle 3D <span class="aide">(facultatif, https://…)</span><input name="visite3d" type="url" pattern="https://.*" value="${esc(l.visite3d || '')}"></label>
      ${avecVideo ? '' : '<!--'}<label>Lien d’une vidéo <span class="aide">(facultatif : fichier .mp4, YouTube, Facebook… en https://)</span><input name="video" type="url" pattern="https://.*" maxlength="300" value="${esc(l.video || '')}"></label>${avecVideo ? '' : '-->'}
      <div><b>Photos</b> <span class="aide">(jusqu’à 20 ; la première est la photo principale)</span><div class="photos-ed" id="ph" style="margin:8px 0"></div><input type="file" id="ajoutPh" accept="image/*" multiple></div>
      <div class="actions"><button class="btn btn-p" name="envoi" value="en_attente">${id && l.statut === 'publie' ? 'Enregistrer' : 'Enregistrer et envoyer en validation'}</button>${!id || l.statut !== 'publie' ? '<button class="btn" name="envoi" value="brouillon">Garder en brouillon</button>' : ''}
        ${id && ['brouillon', 'refuse'].includes(l.statut) ? '<button type="button" class="btn btn-ko" id="supprLog">Supprimer</button>' : ''}${id && l.statut === 'publie' ? '<button type="button" class="btn btn-ko" id="archLog">Retirer de la location</button>' : ''}</div>
      <p class="muted petit">Changer le titre, la description ou les photos d’une annonce en ligne la renvoie en validation (sous 48 h).</p></form>`;
  dessinerPhotos(); brancherLieux();
  $('#ph').addEventListener('click', e => { const b = e.target.closest('[data-suppr]'); if (b) { photos.splice(Number(b.dataset.suppr), 1); dessinerPhotos(); } });
  $('#ajoutPh').addEventListener('change', async e => {
    const f = [...e.target.files].slice(0, 20 - photos.length); if (!f.length) return;
    toast('Envoi des photos…');
    try { photos.push(...await envoyerPhotos(f)); dessinerPhotos(); } catch (err) { toast(erreur(err), true); }
    e.target.value = '';
  });
  const f = $('#fLog');
  f.addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(f)); const envoi = e.submitter?.value || 'en_attente';
    const ligne = { titre: d.titre.trim(), type: d.type, territoire: d.territoire, commune: d.commune.trim(), quartier: d.quartier.trim() || null, voyageurs: +d.voyageurs, chambres: +d.chambres, lits: +d.lits, sdb: +d.sdb,
      prix_nuit: +d.prix_nuit, menage: +d.menage || 0, min_nuits: +d.min_nuits, arrivee: d.arrivee.trim() || null, depart: d.depart.trim() || null, description: d.description.trim(),
      equipements: new FormData(f).getAll('eq'), regles: d.regles.trim() || null, visite3d: d.visite3d.trim() || null, ...(avecVideo ? { video: (d.video || '').trim() || null } : {}), photos };
    if (!(id && l.statut === 'publie')) ligne.statut = envoi;
    if (envoi === 'en_attente' && !photos.length) return toast('Ajoutez au moins une photo avant l’envoi en validation.', true);
    try {
      if (id) await q(sb.from('logements').update(ligne).eq('id', id)); else await q(sb.from('logements').insert(ligne));
      toast(envoi === 'brouillon' ? 'Brouillon enregistré.' : 'Enregistré ! Nous vérifions l’annonce sous 48 h.'); aller('#/compte/logements');
    } catch (err) { toast(erreur(err), true); }
  });
  $('#supprLog')?.addEventListener('click', async () => { if (!confirm('Supprimer définitivement ce logement ?')) return; try { await q(sb.from('logements').delete().eq('id', id)); aller('#/compte/logements'); } catch (err) { toast(erreur(err), true); } });
  $('#archLog')?.addEventListener('click', async () => { if (!confirm('Retirer ce logement de la location ? (les séjours acceptés restent valables)')) return; try { await q(sb.from('logements').update({ statut: 'archive' }).eq('id', id)); aller('#/compte/logements'); } catch (err) { toast(erreur(err), true); } });
}

// -------- propriétaire : carnet numérique du logement
async function ongletCarnet(c, lid) {
  const mes = await q(sb.from('logements').select('id, titre').eq('owner', moi.id).order('created_at'));
  if (!mes.length) return (c.innerHTML = '<h1>Carnet du logement</h1><div class="vide-etat"><p>Ajoutez d’abord un logement.</p><a class="btn btn-p" href="#/compte/logements/nouveau">Ajouter</a></div>');
  lid = lid || mes[0].id;
  const [eq, inter] = await Promise.all([
    q(sb.from('equipements').select('*').eq('logement_id', lid).order('prochain_entretien', { ascending: true, nullsFirst: false })),
    q(sb.from('demandes').select('jour, statut, compte_rendu, prestations(titre, categorie)').eq('logement_id', lid).eq('statut', 'faite').order('jour', { ascending: false }))]);
  const alerte = e => e.prochain_entretien && e.prochain_entretien <= plus(auj(), 30) ? '<span class="tag att">Entretien bientôt</span>' : e.garantie_fin && e.garantie_fin <= plus(auj(), 60) && e.garantie_fin >= auj() ? '<span class="tag att">Garantie bientôt finie</span>' : '';
  c.innerHTML = `<h1>Carnet du logement</h1><p class="muted">Équipements, garanties, entretiens et interventions : toute la vie de la maison, au même endroit. Privé : vous seul le voyez.</p>
    <label class="f" style="max-width:420px"><select id="choixLog">${mes.map(x => `<option value="${x.id}" ${x.id === lid ? 'selected' : ''}>${esc(x.titre)}</option>`).join('')}</select></label>
    <h3 style="margin-top:20px">Équipements (${eq.length})</h3>
    ${eq.length ? `<table class="t"><thead><tr><th>Équipement</th><th>Posé</th><th>Garantie</th><th>Dernier entretien</th><th>Prochain</th><th></th></tr></thead><tbody>${eq.map(e => `<tr>
      <td><b>${esc(e.nom)}</b>${e.marque ? `<br><span class="muted petit">${esc(e.marque)}</span>` : ''} ${alerte(e)}${e.notes ? `<br><span class="petit">${esc(e.notes)}</span>` : ''}</td>
      <td>${e.pose ? jourLong(e.pose) : '—'}</td><td>${e.garantie_fin ? jourLong(e.garantie_fin) : '—'}</td><td>${e.dernier_entretien ? jourLong(e.dernier_entretien) : '—'}</td><td>${e.prochain_entretien ? jourLong(e.prochain_entretien) : '—'}</td>
      <td><button class="btn btn-s btn-ko" data-suppr-eq="${e.id}" aria-label="Supprimer">×</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun équipement noté.</p>'}
    <form class="f" id="fEq" style="max-width:760px;margin-top:16px;background:#fff;padding:18px;border-radius:16px;box-shadow:var(--ombre)"><b>Ajouter un équipement</b>
      <div class="ligne2"><label>Nom<input name="nom" required minlength="2" maxlength="80" placeholder="ex. Climatisation salon"></label><label>Marque / modèle<input name="marque" maxlength="80"></label></div>
      <div class="ligne2"><label>Date de pose<input type="date" name="pose"></label><label>Fin de garantie<input type="date" name="garantie_fin"></label></div>
      <div class="ligne2"><label>Dernier entretien<input type="date" name="dernier_entretien"></label><label>Prochain entretien conseillé<input type="date" name="prochain_entretien"></label></div>
      <label>Notes<input name="notes" maxlength="1000" placeholder="Référence du filtre, numéro du technicien…"></label><button class="btn btn-p">Ajouter</button></form>
    <h3 style="margin-top:24px">Interventions faites (${inter.length})</h3>
    ${inter.length ? inter.map(i => `<div class="avis1"><b>${jourLong(i.jour)} · ${esc(i.prestations?.titre || '')}</b><span>${esc(i.compte_rendu || '')}</span></div>`).join('') : '<p class="muted">Les prestations réservées pour ce logement s’ajoutent ici automatiquement, avec le compte rendu.</p>'}`;
  $('#choixLog').addEventListener('change', e => aller('#/compte/carnet/' + e.target.value));
  $('#fEq').addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); Object.keys(d).forEach(k => { if (d[k] === '') d[k] = null; });
    try { await q(sb.from('equipements').insert({ ...d, logement_id: lid })); toast('Ajouté au carnet.'); ongletCarnet(c, lid); } catch (err) { toast(erreur(err), true); }
  });
  c.onclick = async e => { const b = e.target.closest('[data-suppr-eq]'); if (!b || !confirm('Supprimer cet équipement ?')) return; try { await q(sb.from('equipements').delete().eq('id', b.dataset.supprEq)); ongletCarnet(c, lid); } catch (err) { toast(erreur(err), true); } };
}

// -------- demandes de services (client et prestataire)
function ligneDem(d, cote, autre) {
  const a = [`<a class="btn btn-s" href="#/conversation/d/${d.id}">💬 Messages</a>`];
  if (cote === 'client' && ['demande', 'acceptee'].includes(d.statut)) a.push(`<button class="btn btn-s btn-ko" data-dem="${d.id}" data-st="annulee">Annuler</button>`);
  if (cote === 'client' && d.statut === 'faite') a.push(`<a class="btn btn-s btn-p" href="#/avis/d/${d.id}">★ Laisser un avis</a>`);
  if (cote === 'presta' && d.statut === 'demande') a.push(`<button class="btn btn-s btn-v" data-dem="${d.id}" data-st="acceptee">Accepter</button><button class="btn btn-s btn-ko" data-dem="${d.id}" data-st="refusee">Refuser</button>`);
  if (cote === 'presta' && d.statut === 'acceptee') a.push(`<button class="btn btn-s btn-v" data-finir="${d.id}">Marquer comme faite</button>`);
  if (autre?.telephone) a.push(`<a class="btn btn-s btn-wa" href="${wa(autre.telephone, `Bonjour, à propos de « ${d.prestations?.titre || 'la prestation'} » du ${jourLong(d.jour)} sur Kaz An Nou.`)}" target="_blank" rel="noopener">WhatsApp</a>`);
  return `<div class="ligne-l"><div class="mini" style="display:grid;place-items:center;font-size:30px;background:var(--sable)">${CATS[d.prestations?.categorie]?.[0] || '🧹'}</div>
    <div><b>${esc(d.prestations?.titre || 'Prestation')}</b> ${tag(ST_DEM[d.statut])}<div class="muted petit">${jour(d.jour)} · ${esc(CRENEAUX[d.creneau])} · ${esc(d.commune)} · à partir de ${eur(d.prix)}</div>
      ${cote === 'presta' && d.adresse ? `<div class="petit">📍 ${esc(d.adresse)}</div>` : ''}${d.message ? `<div class="petit">« ${esc(d.message)} »</div>` : ''}${autre?.nom ? `<div class="petit">👤 ${esc(autre.nom)}</div>` : ''}
      ${d.compte_rendu ? `<div class="petit">📝 ${esc(d.compte_rendu)}</div>` : ''}</div><div class="actions">${a.join('')}</div></div>`;
}
async function infosPersonnes(ids, avecNom) {
  if (!ids.length) return () => ({});
  const [pr, ct] = await Promise.all([q(sb.from('profiles').select('id, prenom, nom').in('id', ids)), q(sb.from('contacts').select('id, telephone').in('id', ids))]);
  return id => { const p = pr.find(x => x.id === id); return { nom: p ? (avecNom ? `${p.prenom} ${p.nom}` : p.prenom).trim() : '', telephone: ct.find(x => x.id === id)?.telephone }; };
}
async function ongletMesDemandes(c) {
  const d = await q(sb.from('demandes').select('*, prestations(titre, categorie)').eq('client_id', moi.id).order('jour', { ascending: false }));
  const info = await infosPersonnes([...new Set(d.map(x => x.prestataire_id))], false);
  c.innerHTML = `<h1>Mes demandes de services</h1>${d.length ? d.map(x => ligneDem(x, 'client', info(x.prestataire_id))).join('') : '<div class="vide-etat"><div class="ico">🧹</div><h3>Aucune demande</h3><a class="btn btn-p" href="#/services">Voir les services</a></div>'}`;
  brancherStatut(c, 'demandes', () => ongletMesDemandes(c));
}
async function ongletDemandesRecues(c) {
  const d = await q(sb.from('demandes').select('*, prestations(titre, categorie)').eq('prestataire_id', moi.id).order('jour', { ascending: true }));
  const info = await infosPersonnes([...new Set(d.map(x => x.client_id))], true);
  const g = [['À traiter', d.filter(x => x.statut === 'demande')], ['Acceptées', d.filter(x => x.statut === 'acceptee')], ['Historique', d.filter(x => !['demande', 'acceptee'].includes(x.statut))]];
  c.innerHTML = '<h1>Demandes reçues</h1>' + g.map(([t, l]) => `<h3>${t} (${l.length})</h3>${l.length ? l.map(x => ligneDem(x, 'presta', info(x.client_id))).join('') : '<p class="muted">Rien ici.</p>'}`).join('');
  brancherStatut(c, 'demandes', () => ongletDemandesRecues(c), async e => {
    const b = e.target.closest('[data-finir]'); if (!b) return false;
    const cr = prompt('Compte rendu court pour le client (ce qui a été fait) :', ''); if (cr === null) return true;
    try { await q(sb.from('demandes').update({ statut: 'faite', compte_rendu: cr.slice(0, 3000) || null }).eq('id', b.dataset.finir)); toast('Prestation terminée.'); compter(); ongletDemandesRecues(c); }
    catch (err) { toast(erreur(err), true); }
    return true;
  });
}

// -------- prestataire : prestations
async function ongletPrestations(c, sous) {
  if (sous) return formPrestation(c, sous === 'nouvelle' ? null : sous);
  const s = await q(sb.from('prestations').select('*').eq('prestataire_id', moi.id).order('created_at', { ascending: false }));
  c.innerHTML = `<div class="titre-s"><h1>Mes prestations</h1><a class="btn btn-p" href="#/compte/prestations/nouvelle">+ Ajouter</a></div>
    ${s.length ? s.map(x => `<div class="ligne-l"><div class="mini" style="display:grid;place-items:center;font-size:30px;background:var(--sable)">${CATS[x.categorie][0]}</div>
      <div><b>${esc(x.titre)}</b> ${tag(ST_ANN[x.statut] || ST_ANN.en_attente)} ${x.actif ? '' : '<span class="tag gris">En pause</span>'}<div class="muted petit">À partir de ${eur(x.prix)} ${esc(UNITES[x.unite])}</div></div>
      <div class="actions"><a class="btn btn-s" href="#/compte/prestations/${x.id}">Modifier</a><a class="btn btn-s" href="#/prestation/${x.id}">Voir</a></div></div>`).join('')
      : '<div class="vide-etat"><div class="ico">🧰</div><h3>Ajoutez votre première prestation</h3><a class="btn btn-p" href="#/compte/prestations/nouvelle">Ajouter</a></div>'}`;
}
async function formPrestation(c, id) {
  const s = id ? await q(sb.from('prestations').select('*').eq('id', id).single()) : { categorie: 'menage', titre: '', description: '', prix: '', unite: 'prestation', territoire: profil.territoire || 'Martinique', communes: [], actif: true, photos: [] };
  c.innerHTML = `<a href="#/compte/prestations" class="petit">← Mes prestations</a><h1>${id ? 'Modifier la prestation' : 'Nouvelle prestation'}</h1>
    <form class="f" id="fSv" style="max-width:720px">
      <div class="ligne2"><label>Catégorie<select name="categorie">${opts(Object.fromEntries(Object.entries(CATS).map(([k, v]) => [k, v[0] + ' ' + v[1]])), s.categorie)}</select></label><label>Titre<input name="titre" required minlength="3" maxlength="120" value="${esc(s.titre)}" placeholder="ex. Ménage complet entre deux voyageurs"></label></div>
      <div class="ligne2"><label>Prix à partir de (€)<input type="number" name="prix" required min="0" max="20000" value="${esc(s.prix)}"></label><label>Par<select name="unite">${opts(UNITES, s.unite)}</select></label></div>
      <label>Description<textarea name="description" maxlength="3000">${esc(s.description)}</textarea></label>
      <div class="ligne2"><label>Territoire<select name="territoire" required data-villes="villesS">${optsTerritoires(s.territoire)}</select></label>
        <label>Villes où vous intervenez <span class="aide">(séparées par des virgules ; vide = tout le territoire)</span><input name="zones" maxlength="400" list="villesS" value="${esc(s.communes.join(', '))}"></label>${listeVilles('villesS', s.territoire)}</div>
      <label style="display:flex;gap:8px;font-weight:400"><input type="checkbox" name="actif" ${s.actif ? 'checked' : ''} style="width:auto"> Prestation active (décochez pour la mettre en pause)</label>
      <button class="btn btn-p">Enregistrer</button>${id ? '<button type="button" class="btn btn-ko" id="supprSv">Supprimer</button>' : ''}
      <p class="muted petit">Chaque nouvelle prestation est vérifiée avant sa mise en ligne.</p></form>`;
  brancherLieux();
  $('#fSv').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
    const ligne = { categorie: d.categorie, titre: d.titre.trim(), prix: +d.prix, unite: d.unite, description: d.description.trim(), territoire: d.territoire, communes: d.zones.split(',').map(x => x.trim()).filter(Boolean).slice(0, 40), actif: !!d.actif };
    try { if (id) await q(sb.from('prestations').update(ligne).eq('id', id)); else await q(sb.from('prestations').insert(ligne)); toast('Enregistré.'); aller('#/compte/prestations'); }
    catch (err) { toast(erreur(err), true); }
  });
  $('#supprSv')?.addEventListener('click', async () => { if (!confirm('Supprimer cette prestation ?')) return; try { await q(sb.from('prestations').delete().eq('id', id)); aller('#/compte/prestations'); } catch (err) { toast(erreur(err), true); } });
}

// -------- messagerie
async function ongletMessages(c) {
  const [r, d] = await Promise.all([
    q(sb.from('reservations').select('id, debut, statut, logements(titre)').neq('statut', 'blocage').order('created_at', { ascending: false }).limit(50)),
    q(sb.from('demandes').select('id, jour, statut, prestations(titre)').order('created_at', { ascending: false }).limit(50))]);
  const nonLus = await q(sb.from('messages').select('reservation_id, demande_id').eq('lu', false).neq('de', moi.id));
  const nb = (k, id) => nonLus.filter(m => m[k] === id).length;
  const lignes = [...r.map(x => ({ h: `#/conversation/r/${x.id}`, t: x.logements?.titre || 'Séjour', s: `Séjour du ${jour(x.debut)}`, n: nb('reservation_id', x.id), st: ST_RESA[x.statut] })),
                  ...d.map(x => ({ h: `#/conversation/d/${x.id}`, t: x.prestations?.titre || 'Service', s: `Service du ${jour(x.jour)}`, n: nb('demande_id', x.id), st: ST_DEM[x.statut] }))];
  c.innerHTML = `<h1>Messages</h1>${lignes.length ? lignes.sort((a, b) => b.n - a.n).map(x => `<a class="ligne-l" style="text-decoration:none;color:inherit" href="${x.h}"><div class="mini" style="display:grid;place-items:center;font-size:26px;background:var(--sable)">💬</div>
    <div><b>${esc(x.t)}</b> ${tag(x.st)}<div class="muted petit">${x.s}</div></div><div>${x.n ? `<span class="badge">${x.n}</span>` : ''}</div></a>`).join('')
    : '<div class="vide-etat"><div class="ico">💬</div><h3>Pas encore de conversation</h3><p class="muted">Une conversation s’ouvre avec chaque séjour ou service réservé.</p></div>'}`;
}
let minuterie = null;
async function pageConversation(type, id) {
  if (!exigeCompte()) return;
  const cle = type === 'r' ? 'reservation_id' : 'demande_id';
  const sujet = type === 'r' ? await q(sb.from('reservations').select('debut, fin, logements(titre)').eq('id', id).maybeSingle()) : await q(sb.from('demandes').select('jour, prestations(titre)').eq('id', id).maybeSingle());
  if (!sujet) return vue('<div class="wrap vide-etat" style="margin-top:30px"><h3>Conversation introuvable</h3></div>');
  vue(`<div class="wrap" style="padding-top:20px;max-width:820px"><a href="#/compte/messages" class="petit">← Messages</a>
    <h1 style="font-size:24px;margin-top:8px">${esc(type === 'r' ? sujet.logements?.titre : sujet.prestations?.titre)}</h1>
    <p class="muted">${type === 'r' ? `Séjour du ${jourLong(sujet.debut)} au ${jourLong(sujet.fin)}` : `Le ${jourLong(sujet.jour)}`}</p>
    <div class="fil"><div class="msgs" id="msgs"></div><form id="fMsg"><input name="t" maxlength="2000" placeholder="Votre message…" autocomplete="off" required><button class="btn btn-p">Envoyer</button></form></div>
    <p class="muted petit">Pour votre sécurité, ne payez jamais en dehors de ce qui est convenu, et ne partagez pas vos codes bancaires.</p></div>`);
  let nbAvant = -1;
  const charger = async () => {
    const m = await q(sb.from('messages').select('*').eq(cle, id).order('created_at'));
    if (m.length !== nbAvant) {
      $('#msgs').innerHTML = m.length ? m.map(x => `<div class="bulle ${x.de === moi.id ? 'moi' : ''}">${esc(x.texte)}<small>${new Date(x.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') : '<p class="muted" style="text-align:center">Écrivez le premier message.</p>';
      $('#msgs').scrollTop = 1e9; nbAvant = m.length;
    }
    const nonLus = m.filter(x => !x.lu && x.de !== moi.id).map(x => x.id);
    if (nonLus.length) { await sb.from('messages').update({ lu: true }).in('id', nonLus); compter(); }
  };
  // envoi branché avant le premier chargement : un message tapé vite ne recharge jamais la page
  $('#fMsg').addEventListener('submit', async e => {
    e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return;
    try { await q(sb.from('messages').insert({ [cle]: id, texte: t })); e.target.reset(); charger(); } catch (err) { toast(erreur(err), true); }
  });
  await charger();
  clearInterval(minuterie); minuterie = setInterval(() => { if (location.hash.startsWith('#/conversation/')) charger().catch(() => {}); else clearInterval(minuterie); }, 8000);
}

// -------- avis
function pageAvis(type, id) {
  if (!exigeCompte()) return;
  vue(`<div class="wrap"><div class="carte-f"><h1>Votre avis</h1><form class="f" id="fAvis">
    <label>Note<select name="note">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</option>`).join('')}</select></label>
    <label>Votre expérience<textarea name="texte" maxlength="1500" required minlength="10"></textarea></label>
    <p class="muted petit">Votre avis est publié avec la date, sans votre nom de famille. Un seul avis par séjour ou prestation.</p>
    <button class="btn btn-p">Publier</button></form></div></div>`);
  $('#fAvis').addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try { await q(sb.from('avis').insert({ [type === 'r' ? 'reservation_id' : 'demande_id']: id, note: +d.note, texte: d.texte.trim() })); toast('Merci pour votre avis !'); aller(type === 'r' ? '#/compte/voyages' : '#/compte/services'); }
    catch (err) { toast(erreur(err), true); }
  });
}

// -------- administration
async function ongletAdmin(c) {
  if (profil.role !== 'admin') return (c.innerHTML = '<p>Réservé à l’administration.</p>');
  const [part, logs, svcs, nbL, nbR, nbD, nbU] = await Promise.all([
    q(sb.from('profiles').select('*').not('demande_role', 'is', null)),
    q(sb.from('logements').select('*').eq('statut', 'en_attente')),
    q(sb.from('prestations').select('*').eq('statut', 'en_attente')),
    q(sb.from('logements').select('id', { count: 'exact', head: false }).eq('statut', 'publie')),
    q(sb.from('reservations').select('id, statut').neq('statut', 'blocage')),
    q(sb.from('demandes').select('id, statut')),
    q(sb.from('profiles').select('id, role'))]);
  const ids = [...new Set([...part.map(x => x.id), ...logs.map(x => x.owner), ...svcs.map(x => x.prestataire_id)])];
  const ct = ids.length ? await q(sb.from('contacts').select('*').in('id', ids)) : [];
  const tel = id => { const x = ct.find(y => y.id === id); return x ? `${esc(x.email || '')} ${x.telephone ? '· ' + esc(x.telephone) : ''}` : ''; };
  c.innerHTML = `<h1>Administration</h1>
    <div class="stat"><div><b>${nbU.length}</b>comptes</div><div><b>${nbL.length}</b>logements en ligne</div><div><b>${nbR.length}</b>réservations (${nbR.filter(x => x.statut === 'acceptee').length} confirmées)</div><div><b>${nbD.length}</b>demandes de services</div></div>
    <h3>Partenaires à valider (${part.length})</h3>
    ${part.length ? part.map(p => `<div class="ligne-l"><div class="avatar">${initiale(p)}</div><div><b>${esc(p.prenom)} ${esc(p.nom)}</b> veut devenir <b>${p.demande_role === 'proprietaire' ? 'propriétaire' : 'prestataire'}</b>
      <div class="muted petit">${tel(p.id)} · SIRET : ${esc(p.siret || '—')} · Assurance : ${p.assurance ? 'oui' : 'non'} · ${esc((p.metiers || []).join(', '))}</div>${p.bio ? `<div class="petit">${esc(p.bio)}</div>` : ''}
      ${p.siret ? `<a class="petit" href="https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(p.siret.replace(/\s/g, ''))}" target="_blank" rel="noopener">Vérifier le SIRET ↗</a>` : ''}</div>
      <div class="actions"><button class="btn btn-s btn-v" data-valider-p="${p.id}" data-role="${p.demande_role}">Valider</button><button class="btn btn-s btn-ko" data-refuser-p="${p.id}">Refuser</button></div></div>`).join('') : '<p class="muted">Aucune demande.</p>'}
    <h3>Logements à valider (${logs.length})</h3>
    ${logs.length ? logs.map(l => `<div class="ligne-l">${l.photos[0] ? `<img class="mini" src="${esc(photo(l.photos[0]))}" alt="">` : '<div class="mini"></div>'}<div><b><a href="#/logement/${l.id}">${esc(l.titre)}</a></b><div class="muted petit">${esc(l.commune)} · ${eur(l.prix_nuit)} / nuit · ${l.photos.length} photos · ${tel(l.owner)}</div></div>
      <div class="actions"><button class="btn btn-s btn-v" data-pub-l="${l.id}">Publier</button><button class="btn btn-s btn-ko" data-ref-l="${l.id}">Refuser</button></div></div>`).join('') : '<p class="muted">Aucun.</p>'}
    <h3>Prestations à valider (${svcs.length})</h3>
    ${svcs.length ? svcs.map(s => `<div class="ligne-l"><div class="mini" style="display:grid;place-items:center;font-size:28px;background:var(--sable)">${CATS[s.categorie][0]}</div><div><b><a href="#/prestation/${s.id}">${esc(s.titre)}</a></b><div class="muted petit">À partir de ${eur(s.prix)} ${esc(UNITES[s.unite])} · ${tel(s.prestataire_id)}</div><div class="petit">${esc(s.description)}</div></div>
      <div class="actions"><button class="btn btn-s btn-v" data-pub-s="${s.id}">Publier</button><button class="btn btn-s btn-ko" data-ref-s="${s.id}">Refuser</button></div></div>`).join('') : '<p class="muted">Aucune.</p>'}`;
  c.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.validerP) await q(sb.from('profiles').update({ role: b.dataset.role, valide: true, demande_role: null }).eq('id', b.dataset.validerP));
      else if (b.dataset.refuserP) await q(sb.from('profiles').update({ demande_role: null }).eq('id', b.dataset.refuserP));
      else if (b.dataset.pubL) await q(sb.from('logements').update({ statut: 'publie', motif_refus: null }).eq('id', b.dataset.pubL));
      else if (b.dataset.refL) { const m = prompt('Motif du refus (visible par le propriétaire) :', 'Photos insuffisantes'); if (m === null) return; await q(sb.from('logements').update({ statut: 'refuse', motif_refus: m.slice(0, 500) }).eq('id', b.dataset.refL)); }
      else if (b.dataset.pubS) await q(sb.from('prestations').update({ statut: 'publie' }).eq('id', b.dataset.pubS));
      else if (b.dataset.refS) await q(sb.from('prestations').update({ statut: 'refuse' }).eq('id', b.dataset.refS));
      else return;
      toast('C’est fait.'); ongletAdmin(c);
    } catch (err) { toast(erreur(err), true); }
  };
}

// ---------------------------------------------------------------- routeur
async function rendre() {
  const h = (location.hash || '#/').split('?')[0];
  const [, a, b, c2] = h.split('/');
  nav(); window.scrollTo(0, 0);
  document.title = 'Kaz An Nou — Séjours et services pour la maison, aux Antilles et ailleurs';
  try {
    if (!a) return await pageAccueil();
    if (a === 'recherche') return await pageRecherche();
    if (a === 'logement' && b) return PRET ? await pageLogement(b) : vue(fermePourLeMoment());
    if (a === 'services') return await pageServices(b);
    if (a === 'prestation' && b) return PRET ? await pagePrestation(b) : vue(fermePourLeMoment());
    if (a === 'retour') return pageRetour();
    if (a === 'connexion') return pageConnexion();
    if (a === 'inscription') return pageInscription();
    if (a === 'compte') return await pageCompte(b, c2);
    if (a === 'conversation' && b && c2) return await pageConversation(b, c2);
    if (a === 'avis' && b && c2) return pageAvis(b, c2);
    if (a === 'deconnexion') { await sb?.auth.signOut(); await chargerMoi(); toast('À bientôt !'); return aller('#/'); }
    vue('<div class="wrap vide-etat" style="margin-top:30px"><h3>Page introuvable</h3><a href="#/">Accueil</a></div>');
  } catch (e) { vue(`<div class="wrap"><p>${esc(erreur(e))}</p></div>`); }
}

(async function demarrer() {
  if (!PRET) $('#bandeau').hidden = false;
  window.addEventListener('hashchange', rendre);
  if (PRET) {
    sb.auth.onAuthStateChange(async (ev) => {
      if (ev === 'PASSWORD_RECOVERY') { await chargerMoi(); return pageNouveauMdp(); }
      if (ev === 'SIGNED_OUT') { moi = null; profil = null; nav(); }
    });
    await chargerMoi().catch(() => {});
    if (new URLSearchParams(location.search).has('nouveau-mdp') && moi) return pageNouveauMdp();
  }
  rendre();
})();
