/* Visite 3D d'une villa (démo « Illustration ») : on se déplace de pièce en pièce, on regarde autour,
   et on ouvre le carnet du logement en touchant les équipements. Three.js est chargé seulement au clic. */
(function () {
  'use strict';
  const boite = document.getElementById('visite3d');
  if (!boite) return;
  const H = 2.7, T = 0.12;                       // hauteur et épaisseur des murs (m)

  // pièces : point de vue (x, z), direction du regard (yaw, en radians) et centre pour la maquette
  const PIECES = [
    { id: 'salon', nom: 'Salon', x: 5.2, z: 3.9, yaw: 1.2, cx: 3, cz: 2.5 },
    { id: 'cuisine', nom: 'Cuisine', x: 10.1, z: 4.3, yaw: 1.25, cx: 8.5, cz: 2.5 },
    { id: 'chambre', nom: 'Chambre', x: 5.3, z: 7.3, yaw: 1.2, cx: 3, cz: 6.5 },
    { id: 'eau', nom: 'Salle d’eau', x: 10.3, z: 7.4, yaw: 1.4, cx: 8.5, cz: 6.5 },
    { id: 'terrasse', nom: 'Terrasse et piscine', x: 12.2, z: 5.3, yaw: -0.75, cx: 13.5, cz: 3 },
  ];
  // carnet du logement : exemples de fiches (illustration)
  const FICHES = {
    clim: ['Climatisation du salon', [['Posée', 'mars 2024'], ['Garantie', 'jusqu’en mars 2027'], ['Dernier nettoyage', 'mai 2026'], ['Prochain conseillé', 'novembre 2026']], 'Rappel envoyé au propriétaire un mois avant.'],
    wifi: ['Box et Wi-Fi mesh', [['Installés par', 'IloTech'], ['Réseau voyageurs', 'séparé du vôtre'], ['Secours', '4G automatique'], ['Dernier contrôle', 'à distance, chaque semaine']], 'Une coupure ? Vous êtes prévenu avant le voyageur.'],
    eau: ['Chauffe-eau', [['Type', 'électrique 150 L'], ['Posé', '2021'], ['Anode à vérifier', 'tous les 2 ans environ, selon le fabricant'], ['Facture', 'rangée dans le carnet']], 'Les factures et garanties suivent le logement, même s’il est vendu.'],
    fumee: ['Détecteur de fumée', [['Obligatoire', 'oui'], ['Pile changée', 'janvier 2026'], ['Test', 'à chaque ménage entre deux séjours']], 'Coché sur la liste de contrôle de la conciergerie.'],
    piscine: ['Piscine', [['Entretien', 'chaque semaine'], ['Dernier passage', 'avec photos datées'], ['Avant un cyclone', 'mobilier rangé, pompe protégée']], 'Le propriétaire voit les photos depuis son téléphone, où qu’il soit.'],
    serrure: ['Serrure connectée', [['Code voyageur', 'un par séjour, envoyé la veille'], ['Code ménage', 'valable le jour du ménage'], ['Historique', 'qui est entré et quand']], 'Plus besoin de remettre les clés en main propre.'],
  };

  boite.innerHTML = `
    <div class="v3d-poster">
      <span class="v3d-badge">Illustration · démo, pas un vrai logement</span>
      <b>Visitez la villa en 3D</b>
      <p>Déplacez-vous de pièce en pièce, regardez tout autour, ouvrez le carnet du logement en touchant les équipements.</p>
      <button type="button" class="btn btn-p v3d-go">▶ Lancer la visite 3D</button>
    </div>`;
  boite.querySelector('.v3d-go').addEventListener('click', demarrer, { once: true });
  // lien direct immo.ilo-tech.com/#visite : la visite démarre seule
  if (location.hash === '#visite' || location.hash === '#maquette') { boite.scrollIntoView(); demarrer(); }

  function demarrer() {
    boite.querySelector('.v3d-poster').innerHTML = '<b>Chargement de la visite…</b>';
    if (window.THREE) return construire();
    const s = document.createElement('script');
    s.src = 'js/three.min.js';
    s.onload = construire;
    s.onerror = () => { boite.querySelector('.v3d-poster').innerHTML = '<b>La visite n’a pas pu se charger.</b><p>Vérifiez votre connexion et rechargez la page.</p>'; };
    document.head.appendChild(s);
  }

  function construire() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    let rendu;
    try { rendu = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) {
      boite.querySelector('.v3d-poster').innerHTML = '<b>Votre appareil ne permet pas la 3D.</b><p>Essayez sur un autre navigateur ou un ordinateur.</p>'; return;
    }
    rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendu.outputEncoding = THREE.sRGBEncoding;
    rendu.toneMapping = THREE.ACESFilmicToneMapping; rendu.toneMappingExposure = .78;
    boite.innerHTML = `
      <div class="v3d-haut"><span class="v3d-badge">Illustration · démo</span><b>Villa Kaz · 3 pièces · piscine</b></div>
      <div class="v3d-pieces" role="toolbar" aria-label="Pièces de la villa">
        ${PIECES.map(p => `<button type="button" data-p="${p.id}">${p.nom}</button>`).join('')}
        <button type="button" data-p="maquette" class="v3d-maq">⬚ Maquette 3D</button>
      </div>
      <p class="v3d-aide">Glissez pour regarder · touchez un cercle pour avancer · touchez <span class="v3d-i">i</span> pour le carnet du logement</p>
      <div class="v3d-fiche" hidden role="dialog" aria-live="polite"></div>
      <button type="button" class="v3d-plein" aria-label="Plein écran" title="Plein écran">⛶</button>`;
    boite.prepend(canvas);
    boite.classList.add('actif');

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbfe3f5, 60, 260);
    const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 600);
    cam.rotation.order = 'YXZ';

    // ---------- textures dessinées (pas d'image à télécharger)
    const tex = (w, h, dessin, rx = 1, ry = 1) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      dessin(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
    };
    const carrelage = (a, b) => (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.strokeStyle = b; g.lineWidth = 3; g.strokeRect(0, 0, w, h); };
    const parquet = (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = ['#b7834f', '#a8743f', '#c08d58', '#ad7a47'][i % 4]; g.fillRect(0, i * h / 8, w, h / 8); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, i * h / 8, w, 2); g.fillRect((i * 37) % w, i * h / 8, 2, h / 8); } };
    const ciel = tex(16, 512, (g, w, h) => { const d = g.createLinearGradient(0, 0, 0, h); d.addColorStop(0, '#1d6fb8'); d.addColorStop(.42, '#7cc4ec'); d.addColorStop(.5, '#d9f0fa'); d.addColorStop(.52, '#2a8fc0'); d.addColorStop(1, '#0d4f7a'); g.fillStyle = d; g.fillRect(0, 0, w, h); });
    const eau = tex(256, 256, (g, w, h) => { g.fillStyle = '#27b5d8'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { const x = (i * 71) % w, y = (i * 113) % h; g.beginPath(); g.arc(x, y, 12 + i % 9, .2, 1.4); g.stroke(); } }, 2, 2);

    const mat = {};
    const M = (k, o) => mat[k] || (mat[k] = new THREE.MeshStandardMaterial(Object.assign({ roughness: .85 }, o)));
    M('mur', { color: 0xeee4d2 }); M('murTurquoise', { color: 0x4fb7b3 }); M('plafond', { color: 0xffffff });
    M('sol', { map: tex(128, 128, carrelage('#e6d8c0', '#c9b896'), 14, 10), roughness: .5 });
    M('bois', { map: tex(256, 256, parquet, 4, 4), roughness: .6 });
    M('deck', { map: tex(256, 256, parquet, 6, 6), roughness: .8 });
    M('blanc', { color: 0xffffff, roughness: .4 }); M('noir', { color: 0x1d1f24, roughness: .3 });
    M('tissu', { color: 0x2f5d73 }); M('coussin', { color: 0xf2a65a }); M('tapis', { color: 0xd9c7a7 });
    M('plan', { color: 0x3a3f47, roughness: .3 }); M('meuble', { color: 0xe9e1d3, roughness: .6 }); M('inox', { color: 0xc9ccd1, metalness: .6, roughness: .3 });
    M('verre', { color: 0xbfe6f5, transparent: true, opacity: .18, roughness: .05 });
    M('eau', { map: eau, color: 0xffffff, roughness: .1, transparent: true, opacity: .92 });
    M('herbe', { color: 0x4f9a45 }); M('morne', { color: 0x2f7a3a }); M('tronc', { color: 0x8a6a46 }); M('palme', { color: 0x2e8b3e, side: THREE.DoubleSide });
    M('mer', { color: 0x1f86b9, roughness: .15, metalness: .1 }); M('drap', { color: 0xfafafa }); M('rouge', { color: 0xd9534f }); M('jaune', { color: 0xf4c542 });

    const groupeMaison = new THREE.Group(), plafonds = new THREE.Group(), cliquables = [];
    scene.add(groupeMaison, plafonds);
    const bloc = (w, h, d, m, x, y, z, parent = groupeMaison) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat[m]); o.position.set(x, y, z); parent.add(o); return o; };
    const cyl = (r1, r2, h, m, x, y, z, n = 20) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, n), mat[m]); o.position.set(x, y, z); groupeMaison.add(o); return o; };

    // mur avec ouvertures : ouvertures = [[début, fin, bas, haut]] le long du mur
    function mur(x1, z1, x2, z2, ouvertures = [], m = 'mur') {
      const L = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1);
      const morceau = (a, b, bas, haut) => {
        if (b - a < .01 || haut - bas < .01) return;
        const o = new THREE.Mesh(new THREE.BoxGeometry(b - a, haut - bas, T), mat[m]);
        const c = (a + b) / 2; o.position.set(x1 + Math.cos(ang) * c, (bas + haut) / 2, z1 + Math.sin(ang) * c); o.rotation.y = -ang; groupeMaison.add(o);
      };
      let p = 0;
      ouvertures.sort((a, b) => a[0] - b[0]).forEach(([a, b, bas, haut]) => {
        morceau(p, a, 0, H); morceau(a, b, 0, bas); morceau(a, b, haut, H);
        if (bas > 0) { const v = new THREE.Mesh(new THREE.BoxGeometry(b - a, haut - bas, .02), mat.verre); const c = (a + b) / 2; v.position.set(x1 + Math.cos(ang) * c, (bas + haut) / 2, z1 + Math.sin(ang) * c); v.rotation.y = -ang; groupeMaison.add(v); }
        p = b;
      });
      morceau(p, L, 0, H);
    }

    // ---------- extérieur : ciel, mer, île, mornes
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: ciel, side: THREE.BackSide, fog: false }));
    sphere.position.y = -40; scene.add(sphere);
    const mer = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mat.mer); mer.rotation.x = -Math.PI / 2; mer.position.y = -3; scene.add(mer);
    const ile = new THREE.Mesh(new THREE.CylinderGeometry(34, 46, 6, 40), mat.herbe); ile.position.set(6, -3.02, 0); scene.add(ile);
    [[-30, -55, 22, 26], [10, -70, 30, 34], [45, -60, 18, 22], [-60, -20, 16, 20]].forEach(([x, z, r, h]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 18), mat.morne); c.position.set(x, h / 2 - 3, z); scene.add(c); });

    // ---------- sols et plafonds
    bloc(11, .1, 8, 'sol', 5.5, -.05, 4);
    bloc(5.9, .02, 2.9, 'bois', 3, .01, 6.5);
    [[3, 2.5, 6, 5], [8.5, 2.5, 5, 5], [3, 6.5, 6, 3], [8.5, 6.5, 5, 3]].forEach(([x, z, w, d]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.plafond); p.rotation.x = Math.PI / 2; p.position.set(x, H, z); plafonds.add(p); });

    // ---------- murs (nord z=0, sud z=8, ouest x=0, est x=11, intérieurs z=5 et x=6)
    mur(0, 0, 11, 0, [[1.4, 3.6, .9, 2.2], [7, 9.6, 1.05, 2.2]]);
    mur(0, 8, 11, 8, [[1.8, 3.9, .9, 2.2], [8.2, 9.2, 1.5, 2.1]]);
    mur(0, 0, 0, 8, [[1.2, 3.8, .9, 2.2], [5.8, 7.2, .9, 2.2]], 'murTurquoise');
    mur(11, 0, 11, 8, [[.7, 4.3, .02, 2.3]]);
    mur(0, 5, 6, 5, [[4.6, 5.5, 0, 2.1]]);
    mur(6, 5, 11, 5, [[6.4, 7.3, 0, 2.1]]);
    mur(6, 5, 6, 8);
    // baie vitrée coulissante vers la terrasse
    [[.7, 2.5], [2.5, 4.3]].forEach(([a, b]) => { const v = bloc(.03, 2.28, b - a, 'verre', 11, 1.15, (a + b) / 2); v.renderOrder = 2; });

    // ---------- salon
    bloc(3.2, .02, 2.2, 'tapis', 2.6, .02, 2.4);
    bloc(2.6, .45, .9, 'tissu', 2.6, .3, 3.5); bloc(2.6, .5, .2, 'tissu', 2.6, .7, 3.9); bloc(.9, .45, 1.6, 'tissu', 1.15, .3, 2.75);
    [1.7, 2.6, 3.5].forEach(x => bloc(.5, .35, .12, 'coussin', x, .7, 3.75));
    bloc(1.1, .35, .6, 'bois', 2.6, .2, 2.3);
    bloc(2.2, .5, .45, 'meuble', 2.6, .25, .35); bloc(1.6, .9, .05, 'noir', 2.6, 1.15, .3);
    const box = bloc(.3, .06, .2, 'blanc', 3.55, .53, .35); box.userData.fiche = 'wifi';
    const clim = bloc(1, .3, .25, 'blanc', 4.7, 2.3, .2); clim.userData.fiche = 'clim';
    // ventilateur de plafond (il tourne)
    const ventilos = [];
    [[3, 2.5], [3, 6.5]].forEach(([x, z]) => { const g = new THREE.Group(); g.position.set(x, H - .35, z); groupeMaison.add(g); cyl(.02, .02, .35, 'blanc', x, H - .17, z);
      for (let i = 0; i < 4; i++) { const pale = new THREE.Mesh(new THREE.BoxGeometry(.75, .02, .14), mat.bois); pale.position.x = .42; const bras = new THREE.Group(); bras.rotation.y = i * Math.PI / 2; bras.add(pale); g.add(bras); }
      ventilos.push(g); });
    // plantes
    [[.5, .5], [5.5, 4.5]].forEach(([x, z]) => { cyl(.2, .16, .4, 'meuble', x, .2, z); const f = new THREE.Mesh(new THREE.SphereGeometry(.45, 12, 10), mat.palme); f.position.set(x, .9, z); groupeMaison.add(f); });

    // ---------- cuisine
    bloc(3.4, .9, .65, 'meuble', 8.3, .45, .35); bloc(3.4, .05, .67, 'plan', 8.3, .92, .35);
    bloc(.8, 2, .7, 'inox', 10.5, 1, .4);
    bloc(2.2, .9, .9, 'meuble', 8.4, .45, 2.6); bloc(2.4, .05, 1.05, 'plan', 8.4, .92, 2.6);
    [7.6, 8.4, 9.2].forEach(x => { cyl(.18, .18, .05, 'bois', x, .75, 3.4); cyl(.03, .03, .72, 'inox', x, .37, 3.4, 8); });
    [7.6, 8.4, 9.2].forEach(x => { cyl(.02, .02, .7, 'noir', x, H - .35, 2.6, 6); const l = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), mat.jaune); l.position.set(x, H - .75, 2.6); groupeMaison.add(l); });
    bloc(.9, .5, .02, 'noir', 8.3, 1.45, .05);

    // ---------- chambre
    bloc(1.7, .45, 2.1, 'meuble', 2.2, .25, 6.85); bloc(1.65, .15, 2, 'drap', 2.2, .55, 6.85); bloc(1.7, .9, .08, 'bois', 2.2, .7, 7.9);
    [1.8, 2.6].forEach(x => bloc(.6, .14, .35, 'blanc', x, .68, 7.6)); bloc(1.66, .04, .8, 'tissu', 2.2, .64, 6.1);
    [.95, 3.45].forEach(x => bloc(.45, .5, .4, 'bois', x, .25, 7.7));
    bloc(1.8, 2.2, .6, 'meuble', 4.9, 1.1, 7.65);
    const fumee = cyl(.09, .09, .04, 'blanc', 3, H - .03, 6.5, 16); fumee.userData.fiche = 'fumee'; plafonds.add(fumee);

    // ---------- salle d'eau
    bloc(1.6, .02, 1.3, 'blanc', 10.1, .02, 7.25); bloc(.02, 2.1, 1.3, 'verre', 9.3, 1.05, 7.25); cyl(.03, .03, .4, 'inox', 10.7, 2.05, 7.8, 8);
    bloc(1.2, .8, .5, 'bois', 7.1, .4, 7.7); bloc(.5, .1, .4, 'blanc', 7.1, .85, 7.7); bloc(.9, .7, .03, 'verre', 7.1, 1.5, 7.93);
    const chauffe = cyl(.3, .3, 1.1, 'blanc', 6.45, 1.55, 5.45); chauffe.userData.fiche = 'eau';

    // ---------- terrasse, piscine, palmiers
    bloc(6, .1, 7, 'deck', 14, -.05, 3.2);
    const piscine = bloc(3, .02, 2.4, 'eau', 14.2, .02, 2.2); piscine.userData.fiche = 'piscine';
    bloc(3.2, .08, .15, 'blanc', 14.2, .04, .93); bloc(3.2, .08, .15, 'blanc', 14.2, .04, 3.47);
    [[12.6, 4.6], [13.6, 4.6]].forEach(([x, z]) => { bloc(.65, .3, 1.8, 'blanc', x, .2, z); bloc(.6, .1, 1.6, 'coussin', x, .4, z); });
    cyl(.03, .03, 2.2, 'blanc', 15.6, 1.1, 5); const parasol = new THREE.Mesh(new THREE.ConeGeometry(1.3, .5, 8, 1, true), mat.rouge); parasol.position.set(15.6, 2.3, 5); groupeMaison.add(parasol);
    const serrure = bloc(.08, .2, .06, 'noir', 11.08, 1.05, 2.5); serrure.userData.fiche = 'serrure';
    function palmier(x, z, h) {
      const tr = cyl(.12, .18, h, 'tronc', x, h / 2, z, 8); tr.rotation.z = .08;
      for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .5), mat.palme); f.position.set(x + Math.cos(i) * .9, h - .1, z + Math.sin(i) * .9); f.rotation.set(-.5, -i, .2); groupeMaison.add(f); }
    }
    palmier(17.5, -.8, 5.5); palmier(17.8, 6.5, 4.6); palmier(-2, -2, 5);

    // ---------- lumière
    scene.add(new THREE.HemisphereLight(0xfff8ee, 0x9c8a6a, .7));
    const soleil = new THREE.DirectionalLight(0xfff1d6, .9); soleil.position.set(30, 40, 10); scene.add(soleil);
    [[3, 2.5], [8.5, 2.5], [3, 6.5], [8.5, 6.5]].forEach(([x, z]) => { const l = new THREE.PointLight(0xfff3e0, .35, 7); l.position.set(x, 2.3, z); scene.add(l); });

    // ---------- cercles pour avancer et pastilles « i » du carnet
    const anneauGeo = new THREE.RingGeometry(.22, .3, 32), anneauMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, side: THREE.DoubleSide });
    PIECES.forEach(p => { const a = new THREE.Mesh(anneauGeo, anneauMat); a.rotation.x = -Math.PI / 2; a.position.set(p.x, .03, p.z); a.userData.aller = p.id; scene.add(a); cliquables.push(a); p.anneau = a; });
    const pastille = tex(128, 128, (g) => { g.fillStyle = '#f97316'; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 76px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('i', 64, 70); });
    const pastilles = [];
    groupeMaison.traverse(o => { if (o.userData.fiche) cliquables.push(o); });
    [clim, box, chauffe, fumee, piscine, serrure].forEach(o => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pastille, depthTest: true }));
      const w = new THREE.Vector3(); o.getWorldPosition(w); s.position.copy(w).add(new THREE.Vector3(0, o === fumee ? -.3 : .35, 0)); s.scale.set(.32, .32, .32);
      s.userData.fiche = o.userData.fiche; scene.add(s); cliquables.push(s); pastilles.push(s);
    });
    // étiquettes des pièces (vue maquette)
    const etiquettes = PIECES.map(p => {
      const t = tex(512, 128, (g, w, h) => { g.fillStyle = 'rgba(10,11,20,.78)'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, 40) : g.rect(4, 4, w - 8, h - 8); g.fill(); g.fillStyle = '#fff'; g.font = '600 54px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.nom, w / 2, h / 2 + 4); });
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(4, 1, 1); s.position.set(p.cx, 3.6, p.cz); s.userData.aller = p.id; s.visible = false; scene.add(s); cliquables.push(s); return s;
    });

    // ---------- navigation
    const etat = { mode: 'piece', piece: 'salon', yaw: 0, pitch: -.05, orbite: .7, elev: .95, dist: 17, anim: null };
    const ui = q => boite.querySelector(q);
    const fiche = ui('.v3d-fiche');
    function montrerFiche(k) {
      const [titre, lignes, note] = FICHES[k];
      fiche.innerHTML = `<button type="button" class="v3d-x" aria-label="Fermer">×</button><small>Carnet du logement · exemple</small><b>${titre}</b>
        <dl>${lignes.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl><p>${note}</p>`;
      fiche.hidden = false; fiche.querySelector('.v3d-x').onclick = () => { fiche.hidden = true; };
    }
    function boutons() { boite.querySelectorAll('.v3d-pieces button').forEach(b => b.classList.toggle('on', etat.mode === 'maquette' ? b.dataset.p === 'maquette' : b.dataset.p === etat.piece)); }
    const lisse = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    function allerA(id) {
      const p = PIECES.find(x => x.id === id); if (!p) return;
      const depuis = cam.position.clone(), yaw0 = etat.mode === 'maquette' ? p.yaw : etat.yaw, pitch0 = etat.mode === 'maquette' ? -1.2 : etat.pitch;
      let dy = p.yaw - yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      etat.mode = 'piece'; etat.piece = id; fiche.hidden = true;
      plafonds.visible = true; etiquettes.forEach(s => { s.visible = false; }); PIECES.forEach(q => { q.anneau.visible = true; });
      etat.anim = { t0: performance.now(), duree: 1100, maj: k => { cam.position.lerpVectors(depuis, new THREE.Vector3(p.x, 1.6, p.z), k); etat.yaw = yaw0 + dy * k; etat.pitch = pitch0 + (-.05 - pitch0) * k; } };
      boutons();
    }
    function maquette() {
      etat.mode = 'maquette'; fiche.hidden = true; plafonds.visible = false;
      etiquettes.forEach(s => { s.visible = true; }); PIECES.forEach(q => { q.anneau.visible = false; });
      const depuis = cam.position.clone();
      etat.anim = { t0: performance.now(), duree: 1200, maj: k => { cam.position.lerpVectors(depuis, posOrbite(), k); cam.lookAt(7, 0, 4); } };
      boutons();
    }
    const posOrbite = () => new THREE.Vector3(7 + Math.sin(etat.orbite) * Math.cos(etat.elev) * etat.dist, Math.sin(etat.elev) * etat.dist, 4 + Math.cos(etat.orbite) * Math.cos(etat.elev) * etat.dist);

    boite.querySelector('.v3d-pieces').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; b.dataset.p === 'maquette' ? maquette() : allerA(b.dataset.p); });
    ui('.v3d-plein').addEventListener('click', () => { try { document.fullscreenElement ? document.exitFullscreen() : boite.requestFullscreen(); } catch (e) {} });

    // glisser pour regarder / tourner autour ; toucher pour avancer ou ouvrir une fiche
    let appui = null; const souris = new THREE.Vector2(), rayon = new THREE.Raycaster();
    canvas.addEventListener('pointerdown', ev => { appui = { x: ev.clientX, y: ev.clientY, d: 0 }; canvas.setPointerCapture(ev.pointerId); });
    canvas.addEventListener('pointermove', ev => {
      if (!appui) return; const dx = ev.clientX - appui.x, dy = ev.clientY - appui.y; appui.x = ev.clientX; appui.y = ev.clientY; appui.d += Math.abs(dx) + Math.abs(dy);
      if (etat.mode === 'maquette') { etat.orbite -= dx * .006; etat.elev = Math.min(1.45, Math.max(.25, etat.elev + dy * .005)); }
      else { etat.yaw += dx * .005; etat.pitch = Math.min(1.1, Math.max(-1.1, etat.pitch + dy * .005)); }
    });
    canvas.addEventListener('pointerup', ev => {
      const clic = appui && appui.d < 8; appui = null; if (!clic) return;
      const r = canvas.getBoundingClientRect(); souris.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
      rayon.setFromCamera(souris, cam);
      // premier objet visible touché : un mur devant un cercle bloque le clic
      const vu = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
      const touche = rayon.intersectObjects(scene.children, true).find(h => vu(h.object) && h.object !== sphere);
      if (!touche) return; const u = touche.object.userData;
      if (u.aller) allerA(u.aller); else if (u.fiche) montrerFiche(u.fiche);
    });
    canvas.addEventListener('wheel', ev => { ev.preventDefault(); if (etat.mode === 'maquette') etat.dist = Math.min(40, Math.max(12, etat.dist + ev.deltaY * .02)); else { cam.fov = Math.min(85, Math.max(40, cam.fov + ev.deltaY * .03)); cam.updateProjectionMatrix(); } }, { passive: false });
    boite.tabIndex = 0;
    boite.addEventListener('keydown', ev => { const k = { ArrowLeft: [.12, 0], ArrowRight: [-.12, 0], ArrowUp: [0, .08], ArrowDown: [0, -.08] }[ev.key]; if (!k) return; ev.preventDefault(); if (etat.mode === 'maquette') etat.orbite -= k[0]; else { etat.yaw += k[0]; etat.pitch = Math.min(1.1, Math.max(-1.1, etat.pitch + k[1])); } });

    function taille() { const w = boite.clientWidth, h = boite.clientHeight; rendu.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    window.addEventListener('resize', taille); document.addEventListener('fullscreenchange', () => setTimeout(taille, 50));
    let visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(boite);

    const p0 = PIECES[0]; cam.position.set(p0.x, 1.6, p0.z); etat.yaw = p0.yaw; boutons(); taille();
    if (location.hash === '#maquette') maquette();
    let avant = performance.now();
    (function boucle(t) {
      requestAnimationFrame(boucle);
      if (!visible) return;
      const dt = Math.min(.05, (t - avant) / 1000); avant = t;
      ventilos.forEach(v => { v.rotation.y += dt * 4; });
      eau.offset.x += dt * .02; eau.offset.y += dt * .01;
      pastilles.forEach((s, i) => { const k = .3 + Math.sin(t / 400 + i) * .03; s.scale.set(k, k, k); });
      if (etat.anim) { const k = Math.min(1, (t - etat.anim.t0) / etat.anim.duree); etat.anim.maj(lisse(k)); if (k >= 1) etat.anim = null; }
      else if (etat.mode === 'maquette') { if (!appui) etat.orbite += dt * .08; cam.position.copy(posOrbite()); cam.lookAt(7, 0, 4); }
      if (etat.mode === 'piece') cam.rotation.set(etat.pitch, etat.yaw, 0, 'YXZ');
      rendu.render(scene, cam);
    })(avant);
  }
})();
