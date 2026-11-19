/* Kaz An Nou — recherche intelligente. Une phrase devient des filtres, avec des règles écrites ici : aucune API, rien n'est envoyé hors de l'appareil.
   « villa 6 personnes piscine au Diamant moins de 200 € » → type, voyageurs, équipement, commune, budget. Fautes et accents tolérés.
   Aussi : suggestions pendant la frappe, recherches récentes (gardées sur l'appareil), nombre de résultats sur chaque filtre (grisé s'il n'y en a aucun),
   copie des dernières annonces sur l'appareil pour un premier affichage immédiat.
   Chargé avant kaz.js ; n'utilise les outils de kaz.js et de recherche.js (RCH, pastilles, filtrer…) qu'à l'appel. Une seule variable globale : KazIntel. */
'use strict';
const KazIntel = (() => {
  // ---------------------------------------------------------------- texte comparable : sans accents ni majuscules, ponctuation en espaces
  const nt = s => String(s || '').replace(/[œŒ]/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/²/g, '2')
    .replace(/(\d)[.,](\d)/g, '$1§$2').replace(/[’'`´"«»()!?;:.,_\-/]+/g, ' ').replace(/§/g, '.').replace(/\s+/g, ' ').trim();
  const dist = (a, b, max) => {   // distance de Levenshtein, arrêtée au-delà de max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let mini = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < mini) mini = cur[j]; }
      if (mini > max) return max + 1; prec = cur;
    }
    return prec[b.length];
  };
  const seuil = n => n >= 8 ? 2 : n >= 5 ? 1 : 0;
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12 };
  const mn = s => /^\d+$/.test(s) ? Number(s) : NOMBRES[s];
  const MN = '(\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze)', MN2 = '(\\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze)';
  const NUM = '(\\d+(?:\\.\\d+)?)(?!\\d)', EUR = '\\s*(?:€|(?:euros?|eur)\\b)', re = s => new RegExp(s);
  const pad = n => String(n).padStart(2, '0');

  // ---------------------------------------------------------------- vocabulaire : ce que la phrase peut dire
  const TYPES_RE = [['villa', 'villas?'], ['maison', 'maisons?(?: creoles?)?'], ['appartement', 'appartements?|apparts?|appts?'], ['studio', 'studios?'], ['gite', 'gites?'], ['bungalow', 'bungalows?']];
  const EQ_RE = [['piscine', 'piscines?'], ['vue_mer', 'vue (?:sur )?(?:la |l )?(?:mer|ocean)|face (?:a )?(?:la )?mer'], ['plage', 'plages?|pieds dans l eau'],
    ['citerne', 'citernes?|reserve d eau'], ['groupe', 'groupe electrogene|groupe elec|generateur'], ['clim', 'clim|climatisation|climatise(?:e)?s?'],
    ['animaux', 'animaux|animal|chiens?|chats?'], ['pmr', 'pmr|handicap(?:e|es)?|fauteuil roulant|mobilite reduite|accessible'], ['wifi', 'wifi|wi fi|internet'],
    ['parking', 'parking|garage|stationnement'], ['cuisine', 'cuisine equipee|cuisine'], ['lave_linge', 'lave linge|machine a laver'], ['jardin', 'jardin'], ['terrasse', 'terrasses?|veranda'],
    ['starlink', 'starlink'], ['serrure', 'arrivee autonome|autonome|serrure|boite a cles?'], ['bebe', 'lit bebe|equipement bebe|bebe'], ['travail', 'teletravail|espace de travail|bureau|travail']];
  const TERR_RE = [['Saint-Martin', 'saint martin|st martin|sxm'], ['Saint-Barthélemy', 'saint barthelemy|st barthelemy|saint barth|st barth|saint barts|st barts'], ['Martinique', 'martinique|mq|972'],
    ['Guadeloupe', 'guadeloupe|gp|971'], ['Guyane', 'guyane|gf|973'], ['La Réunion', 'la reunion|reunion|974'], ['Mayotte', 'mayotte|976'], ['Hexagone et Corse', 'hexagone|metropole|corse']];
  // mots seuls qu'on sait corriger quand ils sont mal écrits (≥ 5 lettres)
  const VOCAB = ['piscine', 'appartement', 'bungalow', 'climatisation', 'climatise', 'jardin', 'terrasse', 'parking', 'starlink', 'citerne', 'electrogene', 'generateur', 'animaux',
    'meuble', 'meublee', 'location', 'personnes', 'voyageurs', 'chambres', 'chambre', 'maison', 'studio', 'handicap', 'accessible', 'cuisine', 'teletravail', 'martinique', 'guadeloupe',
    'guyane', 'reunion', 'mayotte', 'hexagone', 'janvier', 'fevrier', 'avril', 'juillet', 'septembre', 'octobre', 'novembre', 'decembre', 'euros', 'weekend', 'saisonniere', 'autonome',
    'louer', 'plage', 'vacances', 'mensuel', 'sejour', 'adultes', 'couple', 'moins', 'maximum', 'minimum', 'budget', 'serrure', 'fauteuil', 'bureau', 'veranda', 'metropole'];
  const STOP = new Set('a au aux en de du des d la le les l un une et ou dans sur pour avec par pres vers chez qui que je cherche cherchons veux voudrais recherche logement logements annonce annonces sejour accepte acceptes acceptee admis admise ayant avec ce cet cette mon ma mes nous on est il y a plus nuit nuits personne max maximum min minimum euro euros eur'.split(' '));

  // ---------------------------------------------------------------- communes : lieux.js (officielles) + villes proposées + communes des annonces publiées
  let INDEX = null;   // [{nom, cle, terr, n}]
  const donneesCommunes = new Map();   // cle → {nom, terr, n} : communes des annonces
  const indexer = () => {
    if (INDEX) return INDEX;
    const vus = new Set(); INDEX = [];
    const ajoute = (nom, terr) => { const cle = normCommune(nom), k = cle + '|' + terr; if (cle.length >= 3 && !vus.has(k)) { vus.add(k); INDEX.push({ nom, cle, terr }); } };
    NOMS_TERRITOIRES.forEach(t => {
      ((typeof COMMUNES !== 'undefined' && COMMUNES[t]) || []).forEach(c => ajoute(c[0], t));
      (TERRITOIRES[t]?.villes || []).forEach(v => ajoute(v, t));
    });
    return INDEX;
  };
  const motsCommunes = () => { if (!motsCommunes.m) motsCommunes.m = new Set(indexer().flatMap(c => nt(c.nom).split(' ')).filter(x => x.length >= 4)); return motsCommunes.m; };
  const trouverCommune = (cle, terrVoulu) => {
    const l = indexer().filter(c => c.cle === cle); if (!l.length) return null;
    return (terrVoulu && l.find(c => c.terr === terrVoulu)) || l[0];
  };
  const comptesCommunes = () => { const m = new Map(); donneesCommunes.forEach(v => m.set(v.cle, v)); return m; };

  // ---------------------------------------------------------------- l'analyse de la phrase
  const aujourdhui = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); };
  const isoD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // prochaine occurrence d'un jour et d'un mois (l'année suivante si la date est passée)
  const prochaineDate = (j, m0, annee) => {
    const t = aujourdhui(); let a = annee || t.getFullYear(), d = new Date(a, m0, j, 12);
    if (!annee && d < t) d = new Date(a + 1, m0, j, 12);
    return d;
  };
  function analyser(texte, ctx = {}) {
    const crit = {}, reste = [], sans = [], loc = ctx.location !== false;
    let w = ' ' + nt(texte).slice(0, 200) + ' ', sej = false;
    const prendre = (rx, f) => { w = w.replace(new RegExp(rx.source, 'g'), (...m) => { f(m); return ' '; }); };
    const g = s => new RegExp(s, 'g');
    // « sans piscine » : on ne sait pas chercher ce qui manque, on le dit
    prendre(g('\\bsans (?:de |d |la |le |les |l |un |une )?([a-z]+)'), m => sans.push('sans ' + m[1]));
    // fautes : un mot proche d'un mot connu est remplacé (sauf nom de commune exact)
    const mc = motsCommunes();
    w = w.replace(/\b[a-z]{5,}\b/g, mot => {
      if (VOCAB.includes(mot) || mc.has(mot) || STOP.has(mot) || MOIS.includes(mot)) return mot;
      let meilleur = null, md = 9; const s = seuil(mot.length);
      for (const v of VOCAB) { const d = dist(mot, v, s); if (d <= s && d < md) { meilleur = v; md = d; } }
      return meilleur || mot;
    });
    // dates : « du 10 au 17 mars », « 28 février au 3 mars », « ce week-end »
    const MO = MOIS.join('|');
    prendre(re(`(?:du |le |des )?(\\d{1,2})(?: (${MO}))? (?:au|a|jusqu au|jusqu a) (\\d{1,2}) (${MO})(?: (20\\d\\d))?`), m => {
      const m2 = MOIS.indexOf(m[4]), m1 = m[2] ? MOIS.indexOf(m[2]) : m2, an = m[5] ? Number(m[5]) : 0;
      const a = prochaineDate(Number(m[1]), m1, an); let d = new Date(a.getFullYear(), m2, Number(m[3]), 12); if (d <= a) d = new Date(a.getFullYear() + 1, m2, Number(m[3]), 12);
      crit.arrivee = isoD(a); crit.depart = isoD(d);
    });
    prendre(re('\\b(?:ce |un )?week ?end\\b'), () => { const d = aujourdhui(); while (d.getDay() !== 5) d.setDate(d.getDate() + 1); const f = new Date(d); f.setDate(f.getDate() + 2); crit.arrivee = isoD(d); crit.depart = isoD(f); });
    prendre(re(`(?:(?:au )?mois d(?:e |u )|en |pour |fin |debut |mi |a partir d(?:e |u )|des |disponible (?:en |des )?)?\\b(${MO})\\b(?: (20\\d\\d))?`), m => {
      const m0 = MOIS.indexOf(m[1]), t = aujourdhui(); let a = m[2] ? Number(m[2]) : t.getFullYear(); if (!m[2] && m0 < t.getMonth()) a += 1;
      crit.mois = `${a}-${pad(m0 + 1)}`;
    });
    // budget
    prendre(re(`\\b(?:de |entre )?${NUM}(?:${EUR})? ?(?:a|et) ?${NUM}${EUR}`), m => { crit.pmin = Math.round(m[1]); crit.pmax = Math.round(m[2]); });
    prendre(re(`(?:\\b(?:moins de|moins que|max(?:imum)?(?: de)?|jusqu a|jusqu au|sous|pas plus de|au plus|budget(?: de| max(?:imum)?)?|inferieur(?:e)? a)|[<≤]=?) ?${NUM}(?:${EUR})?(?! ?(?:personnes?|pers|voyageurs?|chambres?|nuits?|m2|km|lits?|ch|ans)\\b)`), m => { crit.pmax = Math.round(m[1]); });
    prendre(re(`(?:\\b(?:plus de|a partir de|des|au moins|minimum|min|superieur(?:e)? a)|[>≥]=?) ?${NUM}${EUR}`), m => { crit.pmin = Math.round(m[1]); });
    prendre(re(`\\b${NUM}${EUR}`), m => { if (!crit.pmax) crit.pmax = Math.round(m[1]); });
    if (crit.pmin && crit.pmax && crit.pmin > crit.pmax) [crit.pmin, crit.pmax] = [crit.pmax, crit.pmin];
    // séjour ou location
    prendre(re('\\b(?:location saisonniere|saisonniere?|vacances|sejours?|par nuit|la nuit|nuit)\\b'), () => { sej = true; });
    let veutLoc = false;
    prendre(re('\\b(?:a louer|en location|location|louer|louable|loyer|(?:au|par) mois|mensuel(?:le)?s?|a l annee|longue duree|bail|locatif)\\b'), () => { veutLoc = true; });
    // taille
    prendre(re(`\\b${MN} (?:chambres?|ch)\\b`), m => { crit.ch = mn(m[1]); });
    prendre(re('\\b[tf]([2-9])\\b'), m => { crit.ch = Number(m[1]) - 1; crit.tn = m[0].trim().toUpperCase(); });
    prendre(re(`\\b${MN} lits?\\b`), m => { crit.lits = mn(m[1]); });
    prendre(re(`\\b${MN} (?:salles? de bains?|salles? d eau|sdb|sde)\\b`), m => { crit.sdb = mn(m[1]); });
    prendre(re('\\b(\\d+) ?(?:m2|metres? carres?)\\b'), m => { crit.surf = Number(m[1]); });
    prendre(re('\\b(?:dpe ?|classe (?:energie |energetique )?)([a-g])\\b'), m => { crit.dpe = m[1].toUpperCase(); });
    // voyageurs
    prendre(re(`\\b${MN} (?:personnes?|pers|voyageurs?|adultes?|invites?|couchages?|places?|pax)\\b`), m => { crit.voyageurs = mn(m[1]); });
    prendre(re(`\\bpour ${MN2}\\b(?! ?(?:nuits?|mois|jours?|semaines?|euros?|€|m2|ans|chambres?|lits?))`), m => { crit.voyageurs = mn(m[1]); });
    prendre(re('\\b(?:en )?couple\\b'), () => { crit.voyageurs = crit.voyageurs || 2; });
    // meublé ou vide : seulement pour une location (un séjour est toujours meublé)
    prendre(re('\\b(?:non meubles?|vides?|vierges?)\\b'), () => { crit.meuble = 'non'; });
    prendre(re('\\bmeubl(?:e|ee|es|ees)\\b'), () => { crit.meuble = crit.meuble || 'oui'; });
    if (crit.meuble && !sej) veutLoc = true;
    if (veutLoc && !sej) { if (loc) crit.formule = 'location'; else reste.push('location (pas encore ouverte)'); }
    if (crit.formule !== 'location') { delete crit.meuble; delete crit.dpe; }   // ces deux filtres n'existent qu'en location
    prendre(re('\\b(?:pas cher|moins cher|economique|petit prix|bon marche)\\b'), () => { crit.tri = 'prix'; });
    // types et équipements
    crit.types = []; crit.eq = [];
    TYPES_RE.forEach(([k, rx]) => prendre(re(`\\b(?:${rx})\\b`), () => { if (!crit.types.includes(k)) crit.types.push(k); }));
    EQ_RE.forEach(([k, rx]) => prendre(re(`\\b(?:${rx})\\b`), () => { if (!crit.eq.includes(k)) crit.eq.push(k); }));
    // territoire
    TERR_RE.forEach(([t, rx]) => prendre(re(`\\b(?:${rx})\\b`), () => { crit.territoire = t; crit.terrDit = true; }));
    // commune : exacte d'abord (la plus longue), puis avec une faute
    const mots = w.trim().split(' ').filter(Boolean), pris = mots.map(() => false), index = indexer();
    const dejaPris = (i, k) => pris.slice(i, i + k).some(Boolean) || mots.slice(i, i + k).every(x => STOP.has(x));
    const poser = (i, k, c) => { for (let x = i; x < i + k; x++) pris[x] = true; if (!crit.commune) { crit.commune = c.nom; crit.communeTerr = c.terr; } };
    for (let k = 4; k >= 1 && !crit.commune; k--) for (let i = 0; i + k <= mots.length && !crit.commune; i++) {
      if (dejaPris(i, k)) continue;
      const c = trouverCommune(normCommune(mots.slice(i, i + k).join(' ')), crit.territoire); if (c) poser(i, k, c);
    }
    if (!crit.commune) for (let k = 3; k >= 1 && !crit.commune; k--) for (let i = 0; i + k <= mots.length && !crit.commune; i++) {
      if (dejaPris(i, k)) continue;
      const cle = normCommune(mots.slice(i, i + k).join(' ')), s = seuil(cle.length); if (!s || /^\d/.test(cle) || VOCAB.includes(cle) || STOP.has(cle)) continue;
      let b = null, bd = 9;
      for (const c of index) { const d = dist(cle, c.cle, s); if (d <= s && (d < bd || (d === bd && c.terr === crit.territoire))) { b = c; bd = d; } }
      if (b) poser(i, k, b);
    }
    if (crit.commune && !crit.territoire) crit.territoire = crit.communeTerr;   // commune commune à plusieurs territoires : la première (Martinique d'abord)
    delete crit.communeTerr;
    // ce qui reste et n'a pas été compris
    mots.forEach((x, i) => { if (!pris[i] && !STOP.has(x) && !/^\d+$/.test(x) && x.length > 1) reste.push(x); });
    reste.push(...sans);
    if (!crit.types.length) delete crit.types; if (!crit.eq.length) delete crit.eq;
    if (crit.arrivee) delete crit.mois;
    return { crit, reste, vide: !Object.keys(crit).length };
  }

  // ---------------------------------------------------------------- mettre la phrase dans la recherche ouverte
  const RECENTES = 'kazRecherches';
  const recentes = () => { try { const l = JSON.parse(localStorage.getItem(RECENTES) || '[]'); return Array.isArray(l) ? l.filter(x => typeof x === 'string').slice(0, 6) : []; } catch (e) { return []; } };
  const retenir = t => { try { localStorage.setItem(RECENTES, JSON.stringify([t, ...recentes().filter(x => x !== t)].slice(0, 6))); } catch (e) { /* stockage indisponible */ } };
  function critDansRecherche(r, a, texte) {
    const c = a.crit;
    Object.assign(r, filtresVides(), { territoire: '', commune: '', arrivee: '', depart: '', voyageurs: null, zone: null, favoris: false, mois: '' });   // la phrase remplace tout
    if (c.territoire) r.territoire = c.territoire;
    ['commune', 'arrivee', 'depart', 'mois', 'voyageurs', 'pmin', 'pmax', 'ch', 'lits', 'sdb', 'surf', 'dpe', 'meuble', 'formule', 'tri'].forEach(k => { if (c[k] !== undefined) r[k] = c[k]; });
    if (c.types) r.types = c.types.filter(t => TYPES[t]); if (c.eq) r.eq = c.eq;
    if (c.formule === 'location' && c.mois) { const [an, mo] = c.mois.split('-').map(Number); r.dispo = isoD(new Date(an, mo, 0, 12)); r.mois = ''; }   // location : libre au plus tard à la fin du mois
    RCH.compris = { texte, reste: a.reste, tn: c.tn || '', terr: c.terrDit ? c.territoire : '' };   // le territoire n'a sa pastille que s'il est dit dans la phrase
  }
  // la recherche ouverte reprend la phrase (appelé par le champ de la page de recherche et par l'adresse « ?q= »)
  async function appliquerPhrase(texte, depuisAdresse) {
    if (!RCH) return;
    const t = String(texte || '').trim().slice(0, 160); if (!t) return;
    const a = analyser(t, { location: LOC_ON });
    critDansRecherche(RCH.r, a, t);
    if (!a.vide) retenir(t);
    syncForm();
    if (RCH.d) await rafraichirLibres();
    if (depuisAdresse) { RCH.page = PAR_PAGE; return; }
    appliquer({ phrase: true });
    const n = document.querySelector('#intelQ'); if (n) n.value = t;
    annoncer(a);
  }
  // le lecteur d'écran entend ce qui a été compris
  function annoncer(a) {
    const z = document.getElementById('intelEtat'); if (!z) return;
    z.textContent = a.vide ? 'Rien de précis n’a été compris : essayez un type, un lieu ou un budget.' : `${RCH.res.length} résultat${RCH.res.length > 1 ? 's' : ''}.`;
  }

  // ---------------------------------------------------------------- suggestions pendant la frappe
  const ICO = { commune: '📍', type: '🏠', terr: '🌴', mois: '📅', formule: '🔑', recent: '🕘', eq: '✨' };
  const FORMULES = [['À louer au mois', 'a louer au mois'], ['Séjour de vacances', 'sejour vacances'], ['Meublé', 'meuble'], ['Pas cher', 'pas cher']];
  function suggerer(brut) {
    const txt = String(brut || ''), mots = txt.trim().split(/\s+/).filter(Boolean), fin = /\s$/.test(txt);
    const cm = comptesCommunes(), sortie = [];
    const item = (genre, t, d, insert, drop) => ({ genre, t, d: d || '', ic: ICO[genre] || '•', insert, drop });
    const communesTop = n => [...cm.values()].sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr')).slice(0, n).map(c => item('commune', c.nom, `${c.n} annonce${s_(c.n)}`, c.nom, 0));
    if (!mots.length) {
      recentes().slice(0, 4).forEach(p => sortie.push({ ...item('recent', p, 'Recherche récente', p, 0), phrase: p }));
      sortie.push(...communesTop(4)); return { titre: sortie.some(x => x.genre === 'recent') ? '' : 'Communes avec des annonces', items: sortie.slice(0, 8) };
    }
    const dernier = fin ? '' : nt(mots[mots.length - 1]);
    if (fin || dernier.length < 1) {
      const ph = analyser(txt, { location: LOC_ON }).crit;
      if (!ph.types) Object.entries(TYPES).slice(0, 3).forEach(([k, t]) => sortie.push(item('type', t, '', t, 0)));
      if (!ph.commune) sortie.push(...communesTop(3));
      if (!ph.eq) EQ_RAPIDES.slice(0, 3).forEach(k => { const e = EQUIP.find(x => x[0] === k); sortie.push({ ...item('eq', e[2], '', e[2], 0), ic: e[1] }); });
      return { titre: 'Pour préciser', items: sortie.slice(0, 7) };
    }
    if (/^\d+$/.test(dernier)) {
      const n = Number(dernier);
      sortie.push(item('type', `${n} personne${s_(n)}`, 'voyageurs', `${n} personnes`, 1), item('type', `${n} chambre${s_(n)}`, '', `${n} chambres`, 1));
      if (n >= 30) sortie.push(item('type', `moins de ${n} €`, 'budget', `moins de ${n} €`, 1)); else sortie.push(item('type', `${n} m²`, 'surface', `${n} m²`, 1));
      return { titre: '', items: sortie };
    }
    const debute = (lib, p) => { const l = nt(lib); return l.startsWith(p) ? 2 : l.split(' ').some(x => x.startsWith(p)) ? 1 : 0; };
    // communes : on essaie les 3, 2 puis 1 derniers mots (« fort de fr »)
    const vus = new Set();
    for (let k = Math.min(3, mots.length); k >= 1 && sortie.length < 4; k--) {
      const p = normCommune(mots.slice(-k).join(' ')); if (p.length < 2) continue;
      const cands = [...indexer()].filter(c => c.cle.startsWith(p) && !vus.has(c.cle)).sort((a, b) => ((cm.get(b.cle)?.n || 0) - (cm.get(a.cle)?.n || 0)) || a.nom.localeCompare(b.nom, 'fr')).slice(0, 4);
      cands.forEach(c => { if (!vus.has(c.cle) && sortie.length < 4) { vus.add(c.cle); const n = cm.get(c.cle)?.n; sortie.push(item('commune', c.nom, n ? `${n} annonce${s_(n)} · ${c.terr}` : c.terr, c.nom, k)); } });
    }
    const p1 = dernier;
    Object.entries(TYPES).forEach(([, t]) => { if (debute(t, p1) && sortie.length < 8) sortie.push(item('type', t, '', t, 1)); });
    EQUIP.forEach(([, i, t]) => { if (debute(t, p1) && sortie.length < 8) sortie.push({ ...item('eq', t, '', t, 1), ic: i }); });
    NOMS_TERRITOIRES.forEach(t => { if (debute(t, p1) && sortie.length < 8) sortie.push(item('terr', t, 'Territoire', t, 1)); });
    MOIS_FR.forEach((m, i) => { if (debute(m, p1) && sortie.length < 8) sortie.push(item('mois', m, 'Mois', 'en ' + m, 1)); });
    FORMULES.forEach(([t, ins]) => { if (debute(t, p1) && sortie.length < 8) sortie.push(item('formule', t, '', ins, 1)); });
    if (!sortie.length && p1.length >= 4) {   // une faute de frappe : « Vouliez-vous dire »
      let b = null, bd = 9; const s = Math.max(seuil(p1.length), 1);
      for (const c of indexer()) { const d = dist(normCommune(p1), c.cle, s); if (d <= s && d < bd) { b = c; bd = d; } }
      if (b) sortie.push(item('commune', b.nom, 'Vouliez-vous dire…', b.nom, 1));
      else for (const v of VOCAB) { if (dist(p1, v, 1) <= 1) { sortie.push(item('type', v, 'Vouliez-vous dire…', v, 1)); break; } }
    }
    return { titre: '', items: sortie.slice(0, 8) };
  }

  // ---------------------------------------------------------------- le champ (page de recherche et accueil)
  const formulaire = ctx => `<form class="intel intel-${ctx}" id="fIntel${ctx}" role="search" aria-label="Recherche en une phrase" autocomplete="off">
    <div class="intel-champ">${ico('explorer')}<input id="intelQ${ctx === 'rech' ? '' : 'A'}" name="q" type="search" role="combobox" aria-expanded="false" aria-controls="intelListe${ctx}" aria-autocomplete="list"
      enterkeyhint="search" maxlength="160" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Décrivez ce que vous cherchez" placeholder="${ctx === 'rech' ? 'Villa 6 personnes piscine au Diamant moins de 200 €' : 'Décrivez : villa 6 personnes piscine au Diamant, moins de 200 €'}">
      <button type="button" class="intel-eff" hidden aria-label="Effacer la phrase">${ico('fermer')}</button></div>
    <button class="btn btn-p intel-ok">Chercher</button>
    <ul class="intel-liste" id="intelListe${ctx}" role="listbox" aria-label="Suggestions" hidden></ul><p class="sr" id="intelEtat${ctx === 'rech' ? '' : 'A'}" role="status" aria-live="polite"></p></form>`;
  function brancher(ctx) {
    const f = document.getElementById('fIntel' + ctx); if (!f) return;
    const champ = f.querySelector('input'), liste = f.querySelector('.intel-liste'), eff = f.querySelector('.intel-eff');
    let items = [], actif = -1, minuterie = null;
    const fermer = () => { liste.hidden = true; champ.setAttribute('aria-expanded', 'false'); champ.removeAttribute('aria-activedescendant'); actif = -1; };
    const marquerActif = () => {
      liste.querySelectorAll('[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === actif)));
      if (actif >= 0) champ.setAttribute('aria-activedescendant', `${liste.id}-${actif}`); else champ.removeAttribute('aria-activedescendant');
    };
    const montrer = () => {
      eff.hidden = !champ.value;
      const s = suggerer(champ.value); items = s.items; actif = -1;
      if (!items.length) return fermer();
      liste.innerHTML = (s.titre ? `<li role="presentation" class="intel-t">${esc(s.titre)}</li>` : '') + items.map((x, i) => `<li role="option" id="${liste.id}-${i}" data-i="${i}" aria-selected="false"><span class="s-ic" aria-hidden="true">${x.ic}</span><span class="s-t">${esc(x.t)}</span>${x.d ? `<small>${esc(x.d)}</small>` : ''}</li>`).join('');
      liste.hidden = false; champ.setAttribute('aria-expanded', 'true');
    };
    const valider = () => {
      const t = champ.value.trim(); if (!t) return; fermer(); champ.blur();
      if (ctx === 'rech') appliquerPhrase(t); else { const a = analyser(t, { location: LOC_ON }); if (!a.vide) retenir(t); aller('#/recherche?q=' + encodeURIComponent(t)); }
    };
    const choisir = x => {
      if (x.phrase) { champ.value = x.phrase; return valider(); }
      const brut = champ.value.split(/\s+/).filter(Boolean); if (x.drop) brut.splice(brut.length - x.drop, x.drop);
      champ.value = [...brut, x.insert].join(' ') + ' '; champ.focus(); montrer();
    };
    champ.addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(montrer, 60); });
    champ.addEventListener('focus', montrer);
    champ.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== champ) fermer(); }, 180));
    champ.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (liste.hidden) montrer(); if (!items.length) return; e.preventDefault(); actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; marquerActif(); }
      else if (e.key === 'Enter' && actif >= 0) { e.preventDefault(); choisir(items[actif]); }
      else if (e.key === 'Escape' && !liste.hidden) { e.preventDefault(); fermer(); }
    });
    liste.addEventListener('mousedown', e => e.preventDefault());
    liste.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) choisir(items[Number(li.dataset.i)]); });
    eff.addEventListener('click', () => { champ.value = ''; eff.hidden = true; champ.focus(); montrer(); });
    f.addEventListener('submit', e => { e.preventDefault(); valider(); });
  }

  // ---------------------------------------------------------------- « Compris : … » devant les pastilles
  const enTete = () => RCH?.compris ? '<span class="compris-t">Compris :</span>' : '';
  const enPied = () => {
    const c = RCH?.compris; if (!c) return '';
    const m = [...(c.reste || [])]; if (!m.length) return '';
    return `<p class="compris-non" role="note">Non compris, donc ignoré : ${m.map(x => `« ${esc(x)} »`).join(' ')}</p>`;
  };

  // ---------------------------------------------------------------- mois : logements libres 7 nuits d'affilée dans le mois (une série de lectures « logements_libres », gardées 1 minute)
  async function libresDuMois(mois) {
    const [a, m] = mois.split('-').map(Number), fin = new Date(a, m, 0).getDate(), t = aujourdhui();
    const debut = isoD(t).startsWith(mois) ? t.getDate() : 1, jours = [];
    for (let j = debut; j <= Math.max(debut, fin - 6) && jours.length < 14; j += 2) jours.push(j);
    const ens = await Promise.all(jours.map(j => { const d1 = `${mois}-${pad(j)}`; return memoK(`libres-${d1}-7`, () => q(sb.rpc('logements_libres', { d1, d2: plus(d1, 7) })), 60000); }));
    return new Set(ens.flat());
  }
  async function rafraichirLibres() {
    const r = RCH.r, d = RCH.d; if (!d) return;
    d.libres = r.arrivee && r.depart && r.depart > r.arrivee ? await memoK(`libres-${r.arrivee}-${r.depart}`, () => q(sb.rpc('logements_libres', { d1: r.arrivee, d2: r.depart })).then(l => new Set(l)), 60000).catch(() => null) : null;
    d.moisLibres = r.mois && !enLocation(r) ? await libresDuMois(r.mois).catch(() => null) : null;
  }
  const nomMois = mois => { const [a, m] = mois.split('-').map(Number); return `${MOIS_FR[m - 1]}${a !== aujourdhui().getFullYear() ? ' ' + a : ''}`; };

  // ---------------------------------------------------------------- filtres qui s'adaptent : nombre de résultats sur chaque choix, grisé s'il n'y en a aucun
  const combien = mod => { const x = structuredClone(RCH.r); mod(x); return compteurAvec(x, RCH.d); };
  const poserCompte = (el, n, bloquer) => {
    let c = el.querySelector(':scope > .cnt, :scope > span > .cnt'); if (!c) { c = document.createElement('em'); c.className = 'cnt'; (el.tagName === 'LABEL' ? el.querySelector('span') : el).appendChild(c); }
    c.textContent = String(n); c.setAttribute('aria-label', `${n} résultat${s_(n)}`);
    el.classList.toggle('vide', bloquer);
  };
  function marquerBarre() {
    if (!RCH?.d) return;
    const r = RCH.r, b = document.getElementById('rechL2'); if (!b) return;
    b.querySelectorAll('[data-eq]').forEach(el => { const k = el.dataset.eq, on = r.eq.includes(k), n = combien(x => { if (!on) x.eq = [...x.eq, k]; }); poserCompte(el, n, false); el.disabled = !on && n === 0; });
    b.querySelectorAll('[data-type]').forEach(el => { const k = el.dataset.type, on = r.types.includes(k), n = combien(x => { if (!on) x.types = [...x.types, k]; }); poserCompte(el, n, false); el.disabled = !on && n === 0; });
    b.querySelectorAll('[data-formule]').forEach(el => { const f = el.dataset.formule, n = combien(x => { if (x.formule !== f) Object.assign(x, { formule: f, pmin: null, pmax: null, annul: [], meuble: '', dpe: '', dispo: '', duree: null }); }); poserCompte(el, n, false); el.disabled = n === 0 && r.formule !== f; });
    b.querySelectorAll('[data-meuble]').forEach(el => { const v = el.dataset.meuble, n = combien(x => { x.meuble = v; }); poserCompte(el, n, false); el.disabled = n === 0 && r.meuble !== v; });
    b.querySelectorAll('[data-annul]').forEach(el => { const k = el.dataset.annul, on = r.annul.includes(k), n = combien(x => { if (!on) x.annul = [...x.annul, k]; }); poserCompte(el, n, false); el.disabled = !on && n === 0; });
  }
  function marquerPanneau() {
    const f = document.getElementById('fFiltres'); if (!f || !RCH?.d) return;
    const r = RCH.r;
    f.querySelectorAll('[name=types],[name=eq],[name=annul]').forEach(i => {
      const k = i.value, liste = i.name === 'types' ? 'types' : i.name, deja = r[liste].includes(k);
      const n = combien(x => { if (!deja) x[liste] = [...x[liste], k]; });
      poserCompte(i.closest('label'), n, !deja && n === 0); i.disabled = !deja && n === 0;
    });
    ['ch', 'lits', 'sdb', 'dpe', 'meuble'].forEach(nom => f.querySelectorAll(`[name=${nom}]`).forEach(i => {
      if (!i.value) return; const v = ['dpe', 'meuble'].includes(nom) ? i.value : Number(i.value);
      const n = combien(x => { x[nom] = v; }); poserCompte(i.closest('label'), n, n === 0 && !i.checked); i.disabled = n === 0 && !i.checked;
    }));
    f.querySelectorAll('[name=formule]').forEach(i => {
      const n = combien(x => { if (x.formule !== i.value) Object.assign(x, { formule: i.value, pmin: null, pmax: null, annul: [], meuble: '', dpe: '', dispo: '', duree: null }); });
      poserCompte(i.closest('label'), n, n === 0 && !i.checked); i.disabled = n === 0 && !i.checked;
    });
  }

  // ---------------------------------------------------------------- copie sur l'appareil : les dernières annonces s'affichent tout de suite, puis la base les met à jour
  const COPIE = 'kazCopie:';
  const copieLire = cle => { try { const o = JSON.parse(localStorage.getItem(COPIE + cle) || 'null'); return o && Date.now() - o.t < 7 * 864e5 ? o.v : null; } catch (e) { return null; } };
  const copieEcrire = (cle, v) => { try { localStorage.setItem(COPIE + cle, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* stockage plein ou indisponible */ } };
  // une annonce allégée (sans description) : de quoi dessiner une carte
  const allegee = l => ({ id: l.id, owner: l.owner, titre: l.titre, type: l.type, territoire: l.territoire, commune: l.commune, quartier: l.quartier, chambres: l.chambres, lits: l.lits, sdb: l.sdb, voyageurs: l.voyageurs,
    prix_nuit: l.prix_nuit, menage: l.menage, min_nuits: l.min_nuits, equipements: l.equipements, photos: (l.photos || []).slice(0, 6), created_at: l.created_at, updated_at: l.updated_at, lat: l.lat, lng: l.lng,
    annulation: l.annulation, formule: l.formule, loyer_mois: l.loyer_mois, charges_mois: l.charges_mois, surface_m2: l.surface_m2, dpe: l.dpe, meuble: l.meuble, duree_min_mois: l.duree_min_mois, duree_max_mois: l.duree_max_mois, dispo_le: l.dispo_le });

  return { analyser, appliquerPhrase, formulaire, brancher, enTete, enPied, marquerBarre, marquerPanneau, rafraichirLibres, libresDuMois, nomMois, allegee, copieLire, copieEcrire,
    donnees(liste) {
      donneesCommunes.clear();
      (liste || []).forEach(l => { const cle = normCommune(l.commune); if (!cle || /preciser|communiqu/.test(cle)) return; const k = cle + '|' + l.territoire; const o = donneesCommunes.get(k) || { cle, nom: l.commune, terr: l.territoire, n: 0 }; o.n++; donneesCommunes.set(k, o); });
    } };
})();
