/* Territoires couverts par Kaz An Nou et EventPass (commun aux deux applications) :
   fuseau horaire, indicatif téléphonique et villes proposées (la ville reste libre). */
'use strict';
const TERRITOIRES = {
  Martinique: { fuseau: 'America/Martinique', indicatif: '596', villes: ['Fort-de-France', 'Le Lamentin', 'Le Robert', 'Ducos', 'Schœlcher', 'Sainte-Luce', 'Le François', 'Les Trois-Îlets', 'Le Diamant', 'Sainte-Anne', 'Le Marin', 'Le Vauclin', 'Saint-Pierre', 'La Trinité', 'Sainte-Marie', 'Le Carbet', 'Les Anses-d’Arlet', 'Rivière-Pilote', 'Rivière-Salée', 'Saint-Esprit', 'Saint-Joseph', 'Le Lorrain', 'Basse-Pointe', 'Le Morne-Rouge', 'Gros-Morne', 'Case-Pilote', 'Bellefontaine', 'Le Prêcheur', 'Grand’Rivière', 'Macouba', 'Ajoupa-Bouillon', 'Le Marigot', 'Le Morne-Vert', 'Fonds-Saint-Denis'] },
  Guadeloupe: { fuseau: 'America/Guadeloupe', indicatif: '590', villes: ['Pointe-à-Pitre', 'Les Abymes', 'Baie-Mahault', 'Le Gosier', 'Sainte-Anne', 'Saint-François', 'Le Moule', 'Basse-Terre', 'Deshaies', 'Bouillante', 'Sainte-Rose', 'Petit-Bourg', 'Capesterre-Belle-Eau', 'Lamentin', 'Morne-à-l’Eau', 'Port-Louis', 'Trois-Rivières', 'Saint-Claude', 'Vieux-Habitants', 'Grand-Bourg (Marie-Galante)', 'Terre-de-Haut (Les Saintes)', 'La Désirade'] },
  Guyane: { fuseau: 'America/Cayenne', indicatif: '594', villes: ['Cayenne', 'Rémire-Montjoly', 'Matoury', 'Kourou', 'Macouria', 'Saint-Laurent-du-Maroni', 'Mana', 'Sinnamary', 'Saint-Georges', 'Maripasoula'] },
  'Saint-Martin': { fuseau: 'America/Marigot', indicatif: '590', villes: ['Marigot', 'Grand-Case', 'Quartier-d’Orléans', 'Baie-Nettlé', 'Sandy Ground'] },
  'Saint-Barthélemy': { fuseau: 'America/St_Barthelemy', indicatif: '590', villes: ['Gustavia', 'Saint-Jean', 'Lorient', 'Flamands'] },
  'La Réunion': { fuseau: 'Indian/Reunion', indicatif: '262', villes: ['Saint-Denis', 'Saint-Paul', 'Saint-Pierre', 'Le Tampon', 'Saint-André', 'Saint-Louis', 'Saint-Leu', 'Le Port', 'La Possession', 'Sainte-Marie', 'Saint-Benoît', 'Saint-Gilles-les-Bains', 'Cilaos', 'Salazie', 'L’Étang-Salé'] },
  Mayotte: { fuseau: 'Indian/Mayotte', indicatif: '262', villes: ['Mamoudzou', 'Dzaoudzi', 'Pamandzi', 'Koungou', 'Dembéni', 'Sada', 'Chirongui'] },
  'Hexagone et Corse': { fuseau: 'Europe/Paris', indicatif: '33', villes: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Bordeaux', 'Nantes', 'Lille', 'Nice', 'Montpellier', 'Strasbourg', 'Rennes', 'Ajaccio', 'Bastia'] },
  'Autre pays': { fuseau: '', indicatif: '', villes: [] },
};
const NOMS_TERRITOIRES = Object.keys(TERRITOIRES);
const fuseauDe = t => (TERRITOIRES[t] && TERRITOIRES[t].fuseau) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Martinique';

// numéro → format international WhatsApp (0696… → 596696…, 0690… → 590690…, 0692… → 262692…, 06… → 336…)
function telInternational(tel) {
  const brut = String(tel || '').trim(), c = brut.replace(/\D/g, '');
  if (!c) return '';
  if (brut.startsWith('+') || brut.startsWith('00')) return c.replace(/^00/, '');
  if (!c.startsWith('0')) return c;
  const pref = [['0696', '596'], ['0596', '596'], ['0697', '596'], ['0690', '590'], ['0691', '590'], ['0590', '590'], ['0694', '594'], ['0594', '594'],
    ['0692', '262'], ['0693', '262'], ['0262', '262'], ['0639', '262'], ['0269', '262']].find(([p]) => c.startsWith(p));
  return (pref ? pref[1] : '33') + c.slice(1);
}

// heure « locale » d'un fuseau ↔ UTC, heure d'été comprise (Hexagone)
function decalageMinutes(fuseau, date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000) / 6e4;
}
function localVersUTC(local, fuseau) {
  if (!local) return null;
  const [d, h] = local.split('T'), [a, m, j] = d.split('-').map(Number), [hh, mm] = (h || '00:00').split(':').map(Number);
  const brut = Date.UTC(a, m - 1, j, hh, mm);
  let utc = brut - decalageMinutes(fuseau, new Date(brut)) * 6e4;
  const corr = brut - decalageMinutes(fuseau, new Date(utc)) * 6e4;
  if (corr !== utc) utc = corr;
  return new Date(utc).toISOString();
}
function utcVersLocal(iso, fuseau) {
  if (!iso) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`;
}

// listes de formulaire
const optsTerritoires = (v, vide) => (vide ? `<option value="">${vide}</option>` : '') + NOMS_TERRITOIRES.map(t => `<option ${t === v ? 'selected' : ''}>${t}</option>`).join('');
const listeVilles = (id, t) => `<datalist id="${id}">${(TERRITOIRES[t]?.villes || []).map(v => `<option value="${v.replace(/"/g, '&quot;')}">`).join('')}</datalist>`;
// met à jour les suggestions de ville quand le territoire change
function brancherVilles(selectTerritoire, idListe) {
  const maj = () => { const l = document.getElementById(idListe); if (l) l.outerHTML = listeVilles(idListe, selectTerritoire.value); };
  selectTerritoire.addEventListener('change', maj);
}
