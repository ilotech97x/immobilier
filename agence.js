/* Kaz An Nou — espace « Propriétaires » de l'agence : simulateur de revenus en location saisonnière (calculé sur l'appareil, avec la vraie
   commission de Kaz An Nou), obligations du loueur en meublé de tourisme (textes de service-public.fr), demande d'estimation ou
   d'accompagnement à l'équipe (assistance commune : commun/assistance.sql, appli « kaz »), services pour la maison.
   Chargé avant kaz.js : n'utilise ses outils qu'à l'appel. */
'use strict';

const COMMISSION_KAZ = 8;   // % sur les séjours acceptés, ménage compris (commun/commissions.sql, CGU)
const SP = 'https://www.service-public.gouv.fr/particuliers/vosdroits/';

function pageProprietaires() {
  const publier = moi ? (role('proprietaire') ? '#/compte/logements/nouveau' : '#/compte/partenaire') : '#/inscription?partenaire=1';
  vue(`<section class="hero"><div class="wrap">${ONGLETS('#/proprietaires')}
      <h1>Louez votre kaz <em>en gardant la main</em>.</h1>
      <p>Publication gratuite, voyageurs et prestataires de confiance, vos prix et vos dates. Kaz An Nou ne prend que ${COMMISSION_KAZ} % des séjours que vous acceptez, et rien sur ceux que vous refusez.</p>
      <div class="actions"><a class="btn btn-p" href="${publier}">Publier mon logement</a><button type="button" class="btn" data-ancre="simulateur">Simuler mes revenus</button><button type="button" class="btn" data-ancre="estimation">Me faire accompagner</button></div>
    </div></section>
    <div class="wrap">
      <section class="section" id="simulateur" aria-labelledby="tSimu"><h2 id="tSimu">Combien peut rapporter votre logement ?</h2>
        <p class="muted">Un calcul simple, fait sur votre appareil avec vos propres chiffres : rien n’est envoyé ni enregistré. Les valeurs de départ sont un exemple, à remplacer par les vôtres.</p>
        <div class="simu"><form class="f encadre" id="fSimu">
          <div class="ligne2"><label>Prix par nuit (€)<input type="number" name="prix" min="1" max="20000" step="1" inputmode="numeric" value="120"></label>
            <label>Nuits louées par mois<input type="number" name="nuits" min="0" max="31" step="1" inputmode="numeric" value="15"></label></div>
          <div class="ligne2"><label>Durée moyenne d’un séjour (nuits)<input type="number" name="duree" min="1" max="90" step="1" inputmode="numeric" value="5"></label>
            <label>Frais de ménage par séjour (€) <span class="aide">payés par le voyageur</span><input type="number" name="menage" min="0" max="2000" step="1" inputmode="numeric" value="50"></label></div>
          <div class="ligne2"><label>Charges par mois (€) <span class="aide">eau, électricité, internet, assurance, entretien, ménage</span><input type="number" name="charges" min="0" max="50000" step="10" inputmode="numeric" value="300"></label>
            <label>Valeur du logement (€) <span class="aide">facultatif, pour le rendement</span><input type="number" name="valeur" min="0" max="20000000" step="1000" inputmode="numeric" placeholder="ex. 250000"></label></div>
          <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="principale" style="width:auto"> C’est ma résidence principale</label>
          ${moi && role('proprietaire') ? '<button type="button" class="btn btn-s" id="simuMesPrix">Reprendre le prix de mon logement</button>' : ''}
        </form><div class="simu-res" id="simuRes" aria-live="polite"></div></div></section>

      <section class="section" aria-labelledby="tOblig"><h2 id="tOblig">Louer en meublé de tourisme : vos obligations</h2>
        <ol class="oblig">
          <li><span><b>Déclarer le logement à la mairie</b> et afficher le numéro d’enregistrement qu’elle vous donne sur chaque annonce (13 caractères : le code de la commune, 6 chiffres, 2 caractères de contrôle). Sur Kaz An Nou, un champ lui est réservé et il s’affiche sur votre annonce.
            <br><a href="${SP}R14321" target="_blank" rel="noopener">Formulaire de déclaration (cerfa 14004) ↗</a></span></li>
          <li><span><b>Résidence principale : 120 nuits par an au plus</b> en location de vacances. Depuis la loi du 19 novembre 2024, la commune peut abaisser cette limite à 90 nuits : renseignez-vous auprès de votre mairie.</span></li>
          <li><span><b>Taxe de séjour</b> : Kaz An Nou n’encaisse pas les paiements, c’est donc vous qui la collectez auprès des voyageurs et la reversez à la commune.
            <br><a href="${SP}F2048" target="_blank" rel="noopener">La taxe de séjour ↗</a> · <a href="${SP}R46583" target="_blank" rel="noopener">Tarifs par commune ↗</a></span></li>
          <li><span><b>Un même voyageur : 90 jours de suite au plus</b> par année civile. Au-delà, c’est une location meublée classique, avec un bail.</span></li>
          <li><span><b>Fiche de police</b> pour les voyageurs de nationalité étrangère, à garder 6 mois. <a href="${SP}F33458" target="_blank" rel="noopener">En savoir plus ↗</a></span></li>
          <li><span><b>Déclarer vos revenus</b> de location meublée chaque année, et prévenir votre assureur que le logement est loué.</span></li>
        </ol>
        <p class="petit muted">Source : service-public.fr, <a href="${SP}F2043" target="_blank" rel="noopener">« Faire de sa résidence secondaire une location de vacances » ↗</a>. Ces règles évoluent : confirmez auprès de votre mairie et de votre comptable.</p></section>

      <section class="section" aria-labelledby="tReste"><h2 id="tReste">On s’occupe du reste, avec des pros d’ici</h2><div class="outils">
        ${[['offres.html', '📸', 'Photos, drone et visite 3D', 'Des images qui donnent envie, par IloTech.'], ['#/services/menage', '🧹', 'Ménage entre deux voyageurs', 'Des prestataires vérifiés, prix affiché avant.'],
           ['#/services/accueil', '🔑', 'Accueil des voyageurs', 'Remise des clés, état des lieux, conseils sur place.'], ['#/services/linge', '🧺', 'Linge et blanchisserie', 'Draps et serviettes propres à chaque séjour.'],
           ['#/services/cyclone', '🌀', 'Mode cyclone', 'Mise en sécurité du logement avant une alerte.'], ['#/compte/carnet', '📒', 'Carnet du logement', 'Garanties, entretiens et interventions au même endroit.']]
          .map(([h, i, t, d]) => `<a class="outil" href="${h}"><span class="ico" aria-hidden="true">${i}</span><span><b>${t}</b><span>${d}</span></span></a>`).join('')}</div></section>

      <section class="section" id="estimation" aria-labelledby="tEstim"><h2 id="tEstim">Demander une estimation ou un accompagnement</h2>
        <p class="muted">Dites-nous où est votre logement et ce dont vous avez besoin : prix de la nuit, mise en location, photos, ménage, accueil. L’équipe vous répond dans votre espace (Notifications), ou sur WhatsApp si vous préférez.</p>
        <form class="f encadre" id="fEstim" style="max-width:760px">
          <div class="ligne3"><label>Type de logement<select name="type">${opts(TYPES, 'villa')}</select></label><label>Chambres<input type="number" name="chambres" min="0" max="30" value="2" inputmode="numeric"></label>
            <label>Commune<input name="commune" maxlength="60" list="villesE" autocomplete="address-level2" required>${listeVilles('villesE', 'Martinique')}</label></div>
          <fieldset class="groupe" style="border:0;padding:0"><legend style="font-weight:600;font-size:15px">Ce qui vous intéresse</legend><div class="choix">
            ${['Estimer le prix de la nuit', 'Mettre en location sur Kaz An Nou', 'Photos, drone ou visite 3D', 'Ménage et linge', 'Accueil des voyageurs', 'Mise en sécurité cyclone'].map(t => `<label><input type="checkbox" name="besoins" value="${t}"><span>${t}</span></label>`).join('')}</div></fieldset>
          <label>Votre message<textarea name="message" maxlength="1200" placeholder="Équipements, vue, accès, période où le logement est libre…"></textarea></label>
          <div class="actions"><button class="btn btn-p">Envoyer ma demande</button><a class="btn btn-wa" id="estimWa" href="${wa(WA, 'Bonjour Kaz An Nou, je voudrais une estimation pour mon logement : ')}" target="_blank" rel="noopener">Plutôt par WhatsApp</a></div>
          <p class="petit muted" style="margin:0">Gratuit et sans engagement. Votre demande est enregistrée dans votre compte pour suivre la réponse.</p></form></section>
    </div>`);
  const f = $('#fSimu');
  f.addEventListener('input', calculerSimu); calculerSimu();
  $('#simuMesPrix')?.addEventListener('click', async () => {
    try {
      const l = await q(sb.from('logements').select('prix_nuit, menage').eq('owner', moi.id).order('created_at', { ascending: false }).limit(1));
      if (!l.length) return toast('Ajoutez d’abord un logement dans votre espace.', true);
      f.prix.value = Math.round(l[0].prix_nuit); f.menage.value = Math.round(l[0].menage); calculerSimu(); toast('Prix de votre logement repris.');
    } catch (e) { toast(erreur(e), true); }
  });
  $('#fEstim').addEventListener('submit', async e => {
    e.preventDefault();
    const d = new FormData(e.target), besoins = d.getAll('besoins');
    const texte = `Demande d’estimation ou d’accompagnement (propriétaire)\nLogement : ${TYPES[d.get('type')] || d.get('type')}, ${d.get('chambres')} chambre(s), ${String(d.get('commune')).trim()}\n`
      + `Besoins : ${besoins.length ? besoins.join(', ') : 'à préciser'}\n${String(d.get('message') || '').trim()}`;
    if (!moi) { window.open(wa(WA, texte), '_blank', 'noopener'); return; }
    const b = e.target.querySelector('.btn-p'); b.disabled = true;
    try { await q(sb.rpc('demander_aide', { app: 'kaz', sujet_a: 'pro', objet: null, texte: texte.slice(0, 2000) })); e.target.reset(); toast('Demande envoyée : l’équipe vous répond dans votre espace.'); }
    catch (err) { toast(erreur(err), true); }
    b.disabled = false;
  });
}
function calculerSimu() {
  const f = $('#fSimu'), el = $('#simuRes'); if (!f || !el) return;
  const v = n => Math.max(0, Number(f[n].value) || 0), prix = v('prix'), nuitsMois = Math.min(31, v('nuits')), duree = Math.max(1, v('duree'));
  const sejours = nuitsMois / duree, caMois = prix * nuitsMois + v('menage') * sejours, comMois = caMois * COMMISSION_KAZ / 100, netMois = caMois - comMois - v('charges');
  const an = x => Math.round(x * 12), nuitsAn = Math.round(nuitsMois * 12), valeur = v('valeur');
  const e0 = n => Math.round(n).toLocaleString('fr-FR') + ' €';
  el.innerHTML = `<h3>Votre estimation</h3><div class="petit" style="opacity:.9">Revenu net avant impôts</div>
    <div class="gros">${e0(netMois)} <span style="font-size:18px;color:#fff">/ mois</span></div><div class="petit" style="opacity:.9">soit ${e0(an(netMois))} par an pour ${nuitsAn} nuits louées</div>
    <dl><dt>Loyers et ménage encaissés</dt><dd>${e0(caMois)} / mois</dd><dt>Commission Kaz An Nou (${COMMISSION_KAZ} %)</dt><dd>− ${e0(comMois)} / mois</dd>
      <dt>Charges</dt><dd>− ${e0(v('charges'))} / mois</dd>${valeur ? `<dt>Rendement brut</dt><dd>${(an(caMois) / valeur * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</dd><dt>Rendement net de charges</dt><dd>${(an(netMois) / valeur * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</dd>` : ''}</dl>
    ${f.principale.checked && nuitsAn > 120 ? `<p class="alerte" role="alert">⚠️ Résidence principale : ${nuitsAn} nuits par an dépassent la limite de 120 nuits (90 si votre commune l’a décidé). Réduisez les nuits louées.</p>` : ''}
    ${netMois < 0 ? '<p class="alerte">Avec ces chiffres, les charges dépassent les loyers : revoyez le prix ou les nuits louées.</p>' : ''}
    <p class="alerte">Estimation indicative, hors impôts et taxe de séjour (payée par les voyageurs). Le prix et le remplissage réels dépendent du logement, de la saison et des avis.</p>
    <a class="btn btn-p" style="margin-top:12px" href="${moi ? (role('proprietaire') ? '#/compte/logements/nouveau' : '#/compte/partenaire') : '#/inscription?partenaire=1'}">Publier mon logement</a>`;
}
