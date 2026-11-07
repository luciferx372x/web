/* Frankfurt RP – Overlays: Schnee, Konfetti, Feuerwerk und mehr.
   Dieses Skript wird von site.js nachgeladen, wenn laut overlays.json (Verwaltung unter Website, Overlays) heute ein
   Overlay gilt, oder wenn die Adresse ?overlay=NAME enthält (Vorschau, zum Beispiel ?overlay=schnee).
   - Es werden keine Bilder und keine fremden Dienste geladen. Alles wird auf einer durchsichtigen Fläche gezeichnet.
   - Die Fläche fängt keine Klicks ab (pointer-events: none) und wird nicht gedruckt.
   - Ist im Betriebssystem "weniger Bewegung" eingestellt, wird nichts gezeigt.
   - Bewegst du die Maus über die Seite, werden die Teilchen leicht weggeschubst (je schneller die Maus, desto stärker).
   - Die Winter-Edition (Effekt "weihnachten") zeigt zu Schnee und Sternen auch kleine Weihnachtsbäume, Kugeln, Sterne,
     Geschenke, Zuckerstangen, Glocken und mehr. Diese Motive sind selbst gezeichnet, es gibt dafür keine Bilddateien.
   - Dazu gehören Sternschnuppen, goldene Funken hinter dem Mauszeiger, eine Lichterkette oben, Schneehaufen unten, eine
     Mütze auf dem Logo und ein Adventskranz mit Countdown. Beim Wechsel auf "Original" wird alles wieder entfernt. */
(function () {
  'use strict';

  var STAERKE = { wenig: 0.5, normal: 1, viel: 1.8 };
  var ZEIGER_RADIUS = 125; /* so nah muss der Mauszeiger sein, damit ein Teilchen ausweicht */
  var MAX_SCHUB = 280;     /* größte Geschwindigkeit, die der Mauszeiger einem Teilchen mitgeben kann (Bildpunkte pro Sekunde) */
  var TAKT = 1 / 45;       /* höchstens 45 Bilder pro Sekunde, das schont den Rechner */

  var pixelDichte = 1;
  var laufend = null;

  /* ---------- Hilfsfunktionen ---------- */

  function zufall(von, bis) { return von + Math.random() * (bis - von); }
  function waehlen(liste) { return liste[Math.floor(Math.random() * liste.length)]; }
  function begrenzen(wert, klein, gross) { return Math.max(klein, Math.min(gross, wert)); }

  function wenigBewegung() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (fehler) { return false; }
  }

  /* ---------- Mauszeiger ---------- */

  var zeiger = { x: 0, y: 0, vx: 0, vy: 0, da: false, zeit: 0 };

  function jetzt() {
    return window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now();
  }

  function zeigerBewegt(ereignis) {
    var t = jetzt();
    if (zeiger.da) {
      var dt = Math.max(8, t - zeiger.zeit) / 1000;
      zeiger.vx = zeiger.vx * 0.5 + ((ereignis.clientX - zeiger.x) / dt) * 0.5;
      zeiger.vy = zeiger.vy * 0.5 + ((ereignis.clientY - zeiger.y) / dt) * 0.5;
    }
    zeiger.x = ereignis.clientX;
    zeiger.y = ereignis.clientY;
    zeiger.zeit = t;
    zeiger.da = true;
  }

  function zeigerWeg() {
    zeiger.da = false;
    zeiger.vx = 0;
    zeiger.vy = 0;
  }

  function zeigerFenster(ereignis) {
    if (!ereignis.relatedTarget) { zeigerWeg(); }
  }

  function zeigerFinger(ereignis) {
    if (ereignis.pointerType === 'touch') { zeigerWeg(); }
  }

  /* Die Mausgeschwindigkeit klingt schnell ab, wenn die Maus still steht. */
  function zeigerAbklingen(dt) {
    var faktor = Math.pow(0.02, dt);
    zeiger.vx *= faktor;
    zeiger.vy *= faktor;
  }

  /* Schubst ein Teilchen leicht weg, wenn der Mauszeiger nah ist. Danach bremst der Schub von selbst wieder ab. */
  function schubsen(teil, dt) {
    if (zeiger.da) {
      var dx = teil.x - zeiger.x;
      var dy = teil.y - zeiger.y;
      var abstand2 = dx * dx + dy * dy;
      if (abstand2 < ZEIGER_RADIUS * ZEIGER_RADIUS) {
        var abstand = Math.sqrt(abstand2) || 0.001;
        var naehe = 1 - abstand / ZEIGER_RADIUS;
        var tempo = Math.min(1, Math.sqrt(zeiger.vx * zeiger.vx + zeiger.vy * zeiger.vy) / 1000);
        var kraft = (0.25 + 0.75 * tempo) * naehe * naehe * 1300 * (teil.leicht || 1);
        teil.sx += (dx / abstand) * kraft * dt + zeiger.vx * naehe * 0.6 * dt * (teil.leicht || 1);
        teil.sy += (dy / abstand) * kraft * dt + zeiger.vy * naehe * 0.6 * dt * (teil.leicht || 1);
      }
    }
    var bremse = Math.pow(0.08, dt);
    teil.sx *= bremse;
    teil.sy *= bremse;
    var tempoSchub = Math.sqrt(teil.sx * teil.sx + teil.sy * teil.sy);
    if (tempoSchub > MAX_SCHUB) {
      teil.sx *= MAX_SCHUB / tempoSchub;
      teil.sy *= MAX_SCHUB / tempoSchub;
    }
  }

  /* ---------- Bildchen (Sprites): einmal gezeichnet, dann nur noch verschoben ---------- */

  function spriteBauen(breite, hoehe, zeichnen) {
    var flaeche = document.createElement('canvas');
    flaeche.width = Math.max(1, Math.ceil(breite * pixelDichte));
    flaeche.height = Math.max(1, Math.ceil(hoehe * pixelDichte));
    var x = flaeche.getContext('2d');
    x.scale(pixelDichte, pixelDichte);
    zeichnen(x, breite, hoehe);
    flaeche.bw = breite;
    flaeche.bh = hoehe;
    return flaeche;
  }

  function emojiSprite(zeichen, groesse) {
    var kante = Math.ceil(groesse * 1.5);
    return spriteBauen(kante, kante, function (x) {
      x.font = Math.round(groesse) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(zeichen, kante / 2, kante / 2 + groesse * 0.06);
    });
  }

  function punktSprite() {
    return spriteBauen(16, 16, function (x) {
      var verlauf = x.createRadialGradient(8, 8, 0, 8, 8, 8);
      verlauf.addColorStop(0, 'rgba(255,255,255,1)');
      verlauf.addColorStop(0.5, 'rgba(255,255,255,0.8)');
      verlauf.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = verlauf;
      x.beginPath();
      x.arc(8, 8, 8, 0, Math.PI * 2);
      x.fill();
    });
  }

  function kristallSprite() {
    return spriteBauen(32, 32, function (x) {
      x.translate(16, 16);
      x.strokeStyle = 'rgba(255,255,255,0.95)';
      x.lineWidth = 1.8;
      x.lineCap = 'round';
      for (var i = 0; i < 6; i++) {
        x.save();
        x.rotate(i * Math.PI / 3);
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(0, -14);
        x.moveTo(0, -8);
        x.lineTo(-4, -12);
        x.moveTo(0, -8);
        x.lineTo(4, -12);
        x.stroke();
        x.restore();
      }
    });
  }

  function sternSprite(farbe) {
    return spriteBauen(24, 24, function (x) {
      x.translate(12, 12);
      var verlauf = x.createRadialGradient(0, 0, 0, 0, 0, 12);
      verlauf.addColorStop(0, farbe);
      verlauf.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = verlauf;
      x.beginPath();
      for (var i = 0; i < 8; i++) {
        var radius = i % 2 === 0 ? 11.5 : 2.4;
        var winkel = i * Math.PI / 4 - Math.PI / 2;
        x.lineTo(Math.cos(winkel) * radius, Math.sin(winkel) * radius);
      }
      x.closePath();
      x.fill();
    });
  }

  function herzSprite(farbe) {
    return spriteBauen(28, 26, function (x) {
      x.translate(14, 13);
      x.fillStyle = farbe;
      x.beginPath();
      x.moveTo(0, 10);
      x.bezierCurveTo(-18, -2, -9, -14, 0, -5);
      x.bezierCurveTo(9, -14, 18, -2, 0, 10);
      x.closePath();
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.28)';
      x.beginPath();
      x.ellipse(-5.5, -4.5, 3, 1.8, -0.6, 0, Math.PI * 2);
      x.fill();
    });
  }

  function laubSprite(farbe) {
    return spriteBauen(28, 20, function (x) {
      x.translate(14, 10);
      x.fillStyle = farbe;
      x.beginPath();
      x.moveTo(-13, 0);
      x.quadraticCurveTo(-1, -12, 13, 0);
      x.quadraticCurveTo(-1, 12, -13, 0);
      x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.28)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(-13, 0);
      x.lineTo(11, 0);
      x.stroke();
    });
  }

  function eiSprite(grund, muster) {
    return spriteBauen(22, 28, function (x) {
      x.translate(11, 14);
      x.beginPath();
      x.ellipse(0, 1, 8.5, 12, 0, 0, Math.PI * 2);
      x.fillStyle = grund;
      x.fill();
      x.save();
      x.clip();
      x.fillStyle = muster;
      x.fillRect(-10, -3, 20, 4);
      x.fillRect(-10, 6, 20, 2.5);
      x.restore();
    });
  }

  function konfettiSprite(farbe, rund) {
    return spriteBauen(12, 16, function (x) {
      x.fillStyle = farbe;
      if (rund) {
        x.beginPath();
        x.arc(6, 8, 4, 0, Math.PI * 2);
        x.fill();
      } else {
        x.fillRect(2, 1, 8, 14);
      }
    });
  }

  /* ---------- Weihnachtsmotive: selbst gezeichnet, damit sie bei allen Besuchern gleich aussehen ---------- */

  var ZWEI_PI = Math.PI * 2;

  function rundesRechteck(x, links, oben, breite, hoehe, radius) {
    x.beginPath();
    x.moveTo(links + radius, oben);
    x.arcTo(links + breite, oben, links + breite, oben + hoehe, radius);
    x.arcTo(links + breite, oben + hoehe, links, oben + hoehe, radius);
    x.arcTo(links, oben + hoehe, links, oben, radius);
    x.arcTo(links, oben, links + breite, oben, radius);
    x.closePath();
  }

  function sternPfad(x, mx, my, aussen, innen, spitzen) {
    x.beginPath();
    for (var i = 0; i < spitzen * 2; i++) {
      var radius = i % 2 === 0 ? aussen : innen;
      var winkel = -Math.PI / 2 + i * Math.PI / spitzen;
      var px = mx + Math.cos(winkel) * radius;
      var py = my + Math.sin(winkel) * radius;
      if (i === 0) { x.moveTo(px, py); } else { x.lineTo(px, py); }
    }
    x.closePath();
  }

  function linearVerlauf(x, x1, y1, x2, y2, farben) {
    var v = x.createLinearGradient(x1, y1, x2, y2);
    for (var i = 0; i < farben.length; i++) { v.addColorStop(farben[i][0], farben[i][1]); }
    return v;
  }

  function tupfen(x, px, py, radius, farbe) {
    x.fillStyle = farbe;
    x.beginPath();
    x.arc(px, py, radius, 0, ZWEI_PI);
    x.fill();
  }

  function baumSprite() {
    return spriteBauen(32, 40, function (x) {
      var etagen = [[17, 34, 14], [11, 26, 11], [6.5, 18, 8]]; /* Spitze, Fuß, halbe Breite */
      var lichter = [[13.2, 15.3, '#ff6b6b'], [18.8, 14.7, '#ffd43b'], [11.6, 22.2, '#ffd43b'], [20.6, 22.4, '#ff6b6b'], [16.2, 23.4, '#74c0fc'],
        [8.2, 30.6, '#74c0fc'], [15.4, 28.9, '#ff6b6b'], [22.8, 30.2, '#ffd43b'], [19.4, 31.6, '#74c0fc']];
      var i;
      x.lineJoin = 'round';
      x.fillStyle = '#8a5a2b';
      x.fillRect(13.5, 33, 5, 5.5);
      for (i = 0; i < etagen.length; i++) {
        x.fillStyle = linearVerlauf(x, 0, etagen[i][0], 0, etagen[i][1], [[0, '#5fcf6f'], [1, '#1f8a3a']]);
        x.strokeStyle = '#2a9a45';
        x.lineWidth = 1.6;
        x.beginPath();
        x.moveTo(16, etagen[i][0] + 0.8);
        x.lineTo(16 + etagen[i][2] - 0.8, etagen[i][1] - 0.8);
        x.lineTo(16 - etagen[i][2] + 0.8, etagen[i][1] - 0.8);
        x.closePath();
        x.fill();
        x.stroke();
      }
      x.fillStyle = 'rgba(255,255,255,0.93)';
      for (i = 0; i < etagen.length; i++) {
        var spitze = etagen[i][0];
        var hoehe = (etagen[i][1] - spitze) * 0.4;
        var breite = etagen[i][2] * 0.4;
        x.beginPath();
        x.moveTo(16, spitze + 0.3);
        x.lineTo(16 + breite + 0.6, spitze + hoehe);
        x.quadraticCurveTo(16 + breite * 0.55, spitze + hoehe + 2.4, 16, spitze + hoehe - 0.3);
        x.quadraticCurveTo(16 - breite * 0.55, spitze + hoehe + 2.4, 16 - breite - 0.6, spitze + hoehe);
        x.closePath();
        x.fill();
      }
      for (i = 0; i < lichter.length; i++) { tupfen(x, lichter[i][0], lichter[i][1], 1.35, lichter[i][2]); }
      sternPfad(x, 16, 6.1, 4.8, 2.1, 5);
      x.fillStyle = linearVerlauf(x, 0, 1, 0, 10, [[0, '#fff3bf'], [1, '#fcc419']]);
      x.fill();
      x.strokeStyle = '#f08c00';
      x.lineWidth = 0.7;
      x.stroke();
    });
  }

  var KUGEL_FARBEN = {
    rot: ['#ff9a9a', '#e03131', '#8e1414'],
    gold: ['#fff0a0', '#fcc419', '#b87500'],
    blau: ['#a5d8ff', '#339af0', '#0c4a8a'],
    gruen: ['#b2f2bb', '#37b24d', '#17632a'],
    silber: ['#ffffff', '#ced4da', '#6b747d'],
    violett: ['#eebefa', '#be4bdb', '#6a1b82']
  };

  var KUGEL_MUSTER = {
    streifen: function (x, mx, my, r) {
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.fillRect(mx - r, my - 2.6, 2 * r, 2.4);
      x.fillRect(mx - r, my + 1.6, 2 * r, 1.2);
    },
    punkte: function (x, mx, my) {
      var stellen = [[-5, -3], [1, -6.5], [6, -1.5], [-2, 1], [3.5, 4.5], [-6.5, 5], [0.5, 8.3]];
      for (var i = 0; i < stellen.length; i++) { tupfen(x, mx + stellen[i][0], my + stellen[i][1], 1.2, 'rgba(255,255,255,0.6)'); }
    },
    zickzack: function (x, mx, my, r) {
      x.strokeStyle = 'rgba(255,255,255,0.65)';
      x.lineWidth = 1.2;
      x.lineJoin = 'round';
      x.beginPath();
      for (var i = 0; i < 8; i++) {
        var px = mx - r + i * 3.2;
        var py = my + (i % 2 ? 2.4 : -2.4);
        if (i) { x.lineTo(px, py); } else { x.moveTo(px, py); }
      }
      x.stroke();
    }
  };

  function kugelSprite(farben, muster) {
    return spriteBauen(26, 34, function (x) {
      var mx = 13;
      var my = 21.5;
      var r = 11;
      var v = x.createRadialGradient(mx - 3.8, my - 5, 1, mx, my, r + 1);
      x.strokeStyle = '#e0a800';
      x.lineWidth = 1.3;
      x.beginPath();
      x.arc(mx, 4.2, 2.5, 0, ZWEI_PI);
      x.stroke();
      v.addColorStop(0, farben[0]);
      v.addColorStop(0.5, farben[1]);
      v.addColorStop(1, farben[2]);
      x.fillStyle = v;
      x.beginPath();
      x.arc(mx, my, r, 0, ZWEI_PI);
      x.fill();
      if (muster) {
        x.save();
        x.beginPath();
        x.arc(mx, my, r, 0, ZWEI_PI);
        x.clip();
        muster(x, mx, my, r);
        x.restore();
      }
      x.fillStyle = linearVerlauf(x, mx - 3.4, 0, mx + 3.4, 0, [[0, '#fff0a0'], [0.5, '#f2c230'], [1, '#b8860b']]);
      x.fillRect(mx - 3.4, 6.6, 6.8, 4.6);
      x.fillStyle = 'rgba(255,255,255,0.7)';
      x.beginPath();
      x.ellipse(mx - 4.4, my - 5.6, 2.8, 1.6, -0.75, 0, ZWEI_PI);
      x.fill();
    });
  }

  function goldSternSprite() {
    return spriteBauen(28, 28, function (x) {
      var halo = x.createRadialGradient(14, 14, 0, 14, 14, 13.5);
      halo.addColorStop(0, 'rgba(255,224,102,0.55)');
      halo.addColorStop(1, 'rgba(255,224,102,0)');
      x.fillStyle = halo;
      x.fillRect(0, 0, 28, 28);
      x.lineJoin = 'round';
      sternPfad(x, 14, 14.2, 11, 4.9, 5);
      x.fillStyle = linearVerlauf(x, 4, 3, 24, 24, [[0, '#fff3bf'], [0.5, '#ffd43b'], [1, '#f59f00']]);
      x.fill();
      x.strokeStyle = '#f08c00';
      x.lineWidth = 1;
      x.stroke();
      sternPfad(x, 14, 14.2, 5.4, 2.4, 5);
      x.fillStyle = 'rgba(255,255,255,0.45)';
      x.fill();
    });
  }

  function geschenkSprite(kasten, deckel, band) {
    return spriteBauen(28, 30, function (x) {
      x.fillStyle = linearVerlauf(x, 3.5, 0, 24.5, 0, [[0, kasten[0]], [1, kasten[1]]]);
      x.fillRect(3.5, 14, 21, 14.5);
      x.fillStyle = linearVerlauf(x, 2, 0, 26, 0, [[0, deckel[0]], [1, deckel[1]]]);
      x.fillRect(2, 10.5, 24, 5.5);
      x.fillStyle = 'rgba(0,0,0,0.2)';
      x.fillRect(3.5, 16, 21, 1.3);
      x.fillStyle = band;
      x.fillRect(12, 10.5, 4, 18);
      x.strokeStyle = band;
      x.lineWidth = 2;
      x.beginPath();
      x.ellipse(9.4, 7.2, 4.4, 2.8, -0.55, 0, ZWEI_PI);
      x.stroke();
      x.beginPath();
      x.ellipse(18.6, 7.2, 4.4, 2.8, 0.55, 0, ZWEI_PI);
      x.stroke();
      tupfen(x, 14, 9.4, 2.2, band);
      x.fillStyle = 'rgba(255,255,255,0.22)';
      x.fillRect(3.5, 14, 2.6, 14.5);
    });
  }

  function zuckerstangeSprite() {
    return spriteBauen(26, 34, function (x) {
      var i;
      function weg() {
        x.beginPath();
        x.moveTo(8, 30);
        x.lineTo(8, 11);
        x.arc(14, 11, 6, Math.PI, 0, false);
        x.lineTo(20, 14.5);
      }
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.lineWidth = 5.6;
      x.strokeStyle = '#f8f9fa';
      weg();
      x.stroke();
      /* Rote Schrägstreifen, nur dort, wo die Stange schon gezeichnet ist */
      x.globalCompositeOperation = 'source-atop';
      x.strokeStyle = '#e03131';
      x.lineWidth = 2.7;
      x.lineCap = 'butt';
      for (i = -5; i <= 4; i++) {
        x.beginPath();
        x.moveTo(i * 7.4, 36);
        x.lineTo(i * 7.4 + 36, 0);
        x.stroke();
      }
      x.globalCompositeOperation = 'source-over';
      x.strokeStyle = 'rgba(255,255,255,0.5)';
      x.lineWidth = 1;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(6.6, 28);
      x.lineTo(6.6, 12);
      x.stroke();
    });
  }

  function glockeSprite() {
    return spriteBauen(28, 32, function (x) {
      x.fillStyle = '#a86d00';
      x.beginPath();
      x.ellipse(14, 24.2, 11.5, 2.1, 0, 0, ZWEI_PI);
      x.fill();
      tupfen(x, 14, 26.4, 2.6, '#e8a500');
      x.fillStyle = linearVerlauf(x, 3, 0, 25, 0, [[0, '#ffe58a'], [0.45, '#fcc419'], [1, '#d9910b']]);
      x.beginPath();
      x.moveTo(14, 6);
      x.bezierCurveTo(20.5, 6, 21.3, 12.5, 22, 17.5);
      x.quadraticCurveTo(22.6, 21, 25.5, 24.2);
      x.lineTo(2.5, 24.2);
      x.quadraticCurveTo(5.4, 21, 6, 17.5);
      x.bezierCurveTo(6.7, 12.5, 7.5, 6, 14, 6);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.55)';
      x.lineWidth = 1.4;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(10.2, 9.6);
      x.quadraticCurveTo(8.7, 14, 8.3, 19);
      x.stroke();
      x.fillStyle = '#e03131';
      x.beginPath();
      x.moveTo(14, 4.4);
      x.lineTo(8.6, 1.6);
      x.lineTo(8.6, 6.8);
      x.closePath();
      x.moveTo(14, 4.4);
      x.lineTo(19.4, 1.6);
      x.lineTo(19.4, 6.8);
      x.closePath();
      x.fill();
      tupfen(x, 14, 4.4, 1.5, '#b81d1d');
    });
  }

  function lebkuchenSprite() {
    return spriteBauen(28, 32, function (x) {
      function gestalt(zusatz, farbe) {
        x.strokeStyle = farbe;
        x.lineCap = 'round';
        x.lineWidth = 5 + zusatz;
        tupfen(x, 14, 7.4, 5.2 + zusatz / 2, farbe);
        x.beginPath();
        x.ellipse(14, 17, 5.6 + zusatz / 2, 6.6 + zusatz / 2, 0, 0, ZWEI_PI);
        x.fill();
        x.beginPath();
        x.moveTo(11, 14.5);
        x.lineTo(4.6, 12.8);
        x.moveTo(17, 14.5);
        x.lineTo(23.4, 12.8);
        x.moveTo(11.4, 21);
        x.lineTo(7.8, 27);
        x.moveTo(16.6, 21);
        x.lineTo(20.2, 27);
        x.stroke();
      }
      gestalt(1.6, '#8c4f1b');
      gestalt(0, '#cd8238');
      tupfen(x, 12.4, 6.4, 0.75, '#fff6e6');
      tupfen(x, 15.6, 6.4, 0.75, '#fff6e6');
      x.strokeStyle = '#fff6e6';
      x.lineWidth = 0.9;
      x.lineCap = 'round';
      x.beginPath();
      x.arc(14, 7.2, 2.4, 0.25 * Math.PI, 0.75 * Math.PI);
      x.stroke();
      tupfen(x, 14, 14.6, 1.05, '#e03131');
      tupfen(x, 14, 17.8, 1.05, '#40c057');
      tupfen(x, 14, 21, 1.05, '#e03131');
      tupfen(x, 4.6, 12.8, 1.1, '#fff6e6');
      tupfen(x, 23.4, 12.8, 1.1, '#fff6e6');
      tupfen(x, 7.8, 27, 1.1, '#fff6e6');
      tupfen(x, 20.2, 27, 1.1, '#fff6e6');
    });
  }

  function stechpalmeSprite() {
    return spriteBauen(32, 26, function (x) {
      function blatt(winkel) {
        x.save();
        x.translate(16, 17);
        x.rotate(winkel);
        x.beginPath();
        for (var i = 0; i <= 48; i++) {
          var t = i / 48 * ZWEI_PI;
          var zacke = 1 - 0.24 * Math.abs(Math.sin(t * 3));
          var px = 8 + Math.cos(t) * 8 * zacke;
          var py = Math.sin(t) * 4.5 * zacke;
          if (i === 0) { x.moveTo(px, py); } else { x.lineTo(px, py); }
        }
        x.closePath();
        x.fillStyle = linearVerlauf(x, 0, -4.5, 0, 4.5, [[0, '#46c75f'], [1, '#1b6b30']]);
        x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.3)';
        x.lineWidth = 0.9;
        x.beginPath();
        x.moveTo(1, 0);
        x.lineTo(14.5, 0);
        x.stroke();
        x.restore();
      }
      blatt(-2.5);
      blatt(-0.64);
      tupfen(x, 16, 17.4, 3, '#e03131');
      tupfen(x, 12.4, 19.8, 2.8, '#d32626');
      tupfen(x, 19.6, 19.8, 2.8, '#e03131');
      tupfen(x, 15.1, 16.3, 0.85, 'rgba(255,255,255,0.7)');
      tupfen(x, 11.6, 18.8, 0.8, 'rgba(255,255,255,0.6)');
      tupfen(x, 18.8, 18.8, 0.8, 'rgba(255,255,255,0.6)');
    });
  }

  function muetzeSprite() {
    return spriteBauen(30, 30, function (x) {
      var v = x.createRadialGradient(20.6, 4.8, 0.5, 21.5, 5.8, 3.8);
      x.fillStyle = linearVerlauf(x, 4, 0, 26, 0, [[0, '#ff6b6b'], [1, '#c92a2a']]);
      x.beginPath();
      x.moveTo(5, 21.5);
      x.quadraticCurveTo(6, 8.5, 20.5, 5.5);
      x.quadraticCurveTo(26, 11, 25.5, 21.5);
      x.closePath();
      x.fill();
      x.fillStyle = linearVerlauf(x, 0, 18.5, 0, 26.5, [[0, '#ffffff'], [1, '#d5dbe3']]);
      rundesRechteck(x, 2.5, 18.5, 25, 8, 4);
      x.fill();
      v.addColorStop(0, '#ffffff');
      v.addColorStop(1, '#cfd6df');
      x.fillStyle = v;
      x.beginPath();
      x.arc(21.5, 5.8, 3.8, 0, ZWEI_PI);
      x.fill();
    });
  }

  function schneemannSprite() {
    return spriteBauen(28, 38, function (x) {
      function kugel(cx, cy, r) {
        var v = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
        v.addColorStop(0, '#ffffff');
        v.addColorStop(0.65, '#eef3fb');
        v.addColorStop(1, '#b9c7dd');
        x.fillStyle = v;
        x.beginPath();
        x.arc(cx, cy, r, 0, ZWEI_PI);
        x.fill();
      }
      x.lineCap = 'round';
      x.strokeStyle = '#8a5a2b';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(6.5, 25);
      x.lineTo(2, 21);
      x.moveTo(21.5, 25);
      x.lineTo(26, 21);
      x.stroke();
      kugel(14, 27.5, 8.6);
      kugel(14, 14.6, 6.3);
      tupfen(x, 14, 24.2, 1.1, '#343a40');
      tupfen(x, 14, 28.2, 1.1, '#343a40');
      tupfen(x, 14, 32.2, 1.1, '#343a40');
      x.fillStyle = '#e03131';
      rundesRechteck(x, 7.6, 19.6, 12.8, 3.4, 1.6);
      x.fill();
      x.fillRect(16.2, 21.5, 3.4, 7);
      tupfen(x, 12, 13.1, 0.9, '#212529');
      tupfen(x, 16, 13.1, 0.9, '#212529');
      x.fillStyle = '#f76707';
      x.beginPath();
      x.moveTo(14, 14.3);
      x.lineTo(19.2, 15.6);
      x.lineTo(14, 16.7);
      x.closePath();
      x.fill();
      x.fillStyle = '#495057';
      x.fillRect(7.8, 7.4, 12.4, 1.9);
      rundesRechteck(x, 10, 0.8, 8, 7.2, 1);
      x.fill();
      x.fillStyle = '#e03131';
      x.fillRect(10, 5.4, 8, 1.5);
    });
  }

  function sockeSprite() {
    return spriteBauen(26, 32, function (x) {
      function umriss() {
        x.beginPath();
        x.moveTo(7.5, 3.5);
        x.lineTo(17.5, 3.5);
        x.lineTo(17.5, 17.2);
        x.bezierCurveTo(17.5, 19, 19, 19.5, 21, 19.8);
        x.bezierCurveTo(24.2, 20.3, 25.2, 22.6, 25.2, 25);
        x.bezierCurveTo(25.2, 27.4, 23.8, 28.6, 21.8, 28.6);
        x.lineTo(10.6, 28.6);
        x.bezierCurveTo(7.2, 28.6, 5.8, 26.2, 6.3, 23.4);
        x.closePath();
      }
      x.fillStyle = linearVerlauf(x, 6, 0, 25, 0, [[0, '#ff6b6b'], [1, '#c92a2a']]);
      umriss();
      x.fill();
      x.save();
      umriss();
      x.clip();
      x.fillStyle = '#f1f3f5';
      x.fillRect(22, 18, 6, 14);
      x.fillRect(4, 22.5, 6.4, 8);
      x.restore();
      x.fillStyle = linearVerlauf(x, 0, 2, 0, 8.6, [[0, '#ffffff'], [1, '#d5dbe3']]);
      rundesRechteck(x, 5.6, 2, 14.2, 6.6, 2.6);
      x.fill();
      tupfen(x, 11, 12.2, 1, 'rgba(255,255,255,0.8)');
      tupfen(x, 14.4, 14.6, 1, 'rgba(255,255,255,0.8)');
      tupfen(x, 11.4, 16.8, 1, 'rgba(255,255,255,0.8)');
    });
  }

  function rentierSprite() {
    return spriteBauen(34, 34, function (x) {
      var i;
      var halo = x.createRadialGradient(17, 25, 0, 17, 25, 6.5);
      var kopf = x.createRadialGradient(15, 18, 1, 17, 21, 11);
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.strokeStyle = '#d3a15e';
      x.lineWidth = 2.3;
      for (i = 0; i < 2; i++) {
        x.save();
        if (i) {
          x.translate(34, 0);
          x.scale(-1, 1);
        }
        x.beginPath();
        x.moveTo(11.2, 14.5);
        x.quadraticCurveTo(7.5, 9.5, 6.2, 3.6);
        x.moveTo(8.6, 9.8);
        x.lineTo(4.2, 9.2);
        x.moveTo(7.1, 6.4);
        x.lineTo(3.6, 4.4);
        x.moveTo(8.9, 10.2);
        x.lineTo(11.4, 6.6);
        x.stroke();
        x.restore();
      }
      for (i = 0; i < 2; i++) {
        x.save();
        x.translate(i ? 26.8 : 7.2, 16.4);
        x.rotate(i ? 0.55 : -0.55);
        x.fillStyle = '#a8652f';
        x.beginPath();
        x.ellipse(0, 0, 3.6, 2.2, 0, 0, ZWEI_PI);
        x.fill();
        x.fillStyle = '#e8b4a0';
        x.beginPath();
        x.ellipse(0, 0, 2.1, 1.1, 0, 0, ZWEI_PI);
        x.fill();
        x.restore();
      }
      kopf.addColorStop(0, '#d59a5a');
      kopf.addColorStop(1, '#9b5b27');
      x.fillStyle = kopf;
      x.beginPath();
      x.ellipse(17, 21, 9.6, 9.2, 0, 0, ZWEI_PI);
      x.fill();
      x.fillStyle = '#ecc89a';
      x.beginPath();
      x.ellipse(17, 25.6, 5.4, 4, 0, 0, ZWEI_PI);
      x.fill();
      tupfen(x, 13.2, 19.6, 1.25, '#2b1b10');
      tupfen(x, 20.8, 19.6, 1.25, '#2b1b10');
      tupfen(x, 13.6, 19.2, 0.45, '#ffffff');
      tupfen(x, 21.2, 19.2, 0.45, '#ffffff');
      halo.addColorStop(0, 'rgba(255,70,70,0.5)');
      halo.addColorStop(1, 'rgba(255,70,70,0)');
      x.fillStyle = halo;
      x.beginPath();
      x.arc(17, 25, 6.5, 0, ZWEI_PI);
      x.fill();
      tupfen(x, 17, 25, 2.7, '#ff3b3b');
      tupfen(x, 16.1, 24.1, 0.8, 'rgba(255,255,255,0.75)');
    });
  }

  function keksSternSprite() {
    return spriteBauen(28, 28, function (x) {
      x.lineJoin = 'round';
      sternPfad(x, 14, 14.8, 12.2, 6.2, 5);
      x.fillStyle = linearVerlauf(x, 4, 3, 24, 25, [[0, '#f0c27a'], [1, '#c98a3f']]);
      x.fill();
      x.lineWidth = 1;
      x.strokeStyle = '#a8692a';
      x.stroke();
      sternPfad(x, 14, 14.8, 8, 4.1, 5);
      x.strokeStyle = 'rgba(255,255,255,0.95)';
      x.lineWidth = 1.5;
      x.stroke();
      tupfen(x, 14, 14.8, 1.5, '#e03131');
    });
  }

  function keksTanneSprite() {
    return spriteBauen(28, 32, function (x) {
      var etagen = [[15, 28, 13], [8.5, 21, 10.5], [3, 14, 7.5]]; /* Spitze, Fuß, halbe Breite */
      var streusel = [[10.5, 25.2, '#ff6b6b'], [16.6, 23.6, '#ffd43b'], [20.6, 25.6, '#74c0fc'], [13.2, 16.8, '#ffd43b'], [17, 15.6, '#ff6b6b'], [14, 10.4, '#74c0fc']];
      var i;
      x.lineJoin = 'round';
      x.fillStyle = '#8a5a2b';
      x.fillRect(12, 28, 4, 3);
      for (i = 0; i < etagen.length; i++) {
        x.fillStyle = linearVerlauf(x, 0, etagen[i][0], 0, etagen[i][1], [[0, '#f0c27a'], [1, '#c98a3f']]);
        x.strokeStyle = '#a8692a';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(14, etagen[i][0]);
        x.lineTo(14 + etagen[i][2], etagen[i][1]);
        x.lineTo(14 - etagen[i][2], etagen[i][1]);
        x.closePath();
        x.fill();
        x.stroke();
      }
      x.fillStyle = 'rgba(88,194,108,0.95)';
      for (i = 0; i < etagen.length; i++) {
        x.beginPath();
        x.moveTo(14, etagen[i][0] + 2.6);
        x.lineTo(14 + etagen[i][2] - 2.6, etagen[i][1] - 2.4);
        x.lineTo(14 - etagen[i][2] + 2.6, etagen[i][1] - 2.4);
        x.closePath();
        x.fill();
      }
      for (i = 0; i < streusel.length; i++) { tupfen(x, streusel[i][0], streusel[i][1], 1.1, streusel[i][2]); }
    });
  }

  function keksHerzSprite() {
    return spriteBauen(28, 28, function (x) {
      function herz(zoom) {
        x.save();
        x.translate(14, 14.2);
        x.scale(zoom, zoom);
        x.beginPath();
        x.moveTo(0, 10);
        x.bezierCurveTo(-18, -2, -9, -14, 0, -5);
        x.bezierCurveTo(9, -14, 18, -2, 0, 10);
        x.closePath();
        x.restore();
      }
      x.lineJoin = 'round';
      herz(1.12);
      x.fillStyle = linearVerlauf(x, 3, 3, 25, 25, [[0, '#a8652f'], [1, '#6f3a16']]);
      x.fill();
      x.lineWidth = 1;
      x.strokeStyle = '#4e2810';
      x.stroke();
      herz(0.82);
      x.setLineDash([2.4, 2]);
      x.strokeStyle = 'rgba(255,255,255,0.95)';
      x.lineWidth = 1.4;
      x.stroke();
      x.setLineDash([]);
      tupfen(x, 14, 13.4, 1.4, '#ffffff');
      tupfen(x, 10.4, 11.2, 1, '#ffd43b');
      tupfen(x, 17.6, 11.2, 1, '#74c0fc');
    });
  }

  function pinguinSprite() {
    return spriteBauen(28, 38, function (x) {
      var i;
      x.fillStyle = '#ff9f1c';
      x.beginPath();
      x.ellipse(10.4, 35.4, 3.8, 1.7, -0.1, 0, ZWEI_PI);
      x.fill();
      x.beginPath();
      x.ellipse(17.6, 35.4, 3.8, 1.7, 0.1, 0, ZWEI_PI);
      x.fill();
      x.fillStyle = linearVerlauf(x, 4, 0, 24, 0, [[0, '#55627f'], [0.5, '#39445c'], [1, '#262e41']]);
      for (i = 0; i < 2; i++) {
        x.save();
        x.translate(i ? 23.6 : 4.4, 23);
        x.rotate(i ? -0.28 : 0.28);
        x.beginPath();
        x.ellipse(0, 0, 2.7, 7, 0, 0, ZWEI_PI);
        x.fill();
        x.restore();
      }
      x.beginPath();
      x.ellipse(14, 23, 9.6, 12.6, 0, 0, ZWEI_PI);
      x.fill();
      x.beginPath();
      x.arc(14, 11.8, 7.8, 0, ZWEI_PI);
      x.fill();
      x.fillStyle = '#f4f6fa';
      x.beginPath();
      x.ellipse(14, 25, 6.2, 9.4, 0, 0, ZWEI_PI);
      x.fill();
      tupfen(x, 10.9, 11, 2.6, '#f4f6fa');
      tupfen(x, 17.1, 11, 2.6, '#f4f6fa');
      tupfen(x, 11.3, 11.3, 1.2, '#10131c');
      tupfen(x, 16.7, 11.3, 1.2, '#10131c');
      tupfen(x, 11.7, 10.8, 0.4, '#ffffff');
      tupfen(x, 17.1, 10.8, 0.4, '#ffffff');
      x.fillStyle = '#ff9f1c';
      x.beginPath();
      x.moveTo(11.6, 14.2);
      x.quadraticCurveTo(14, 12.6, 16.4, 14.2);
      x.quadraticCurveTo(14, 17.4, 11.6, 14.2);
      x.fill();
      x.fillStyle = '#e03131';
      rundesRechteck(x, 6.4, 17.2, 15.2, 3.4, 1.7);
      x.fill();
      rundesRechteck(x, 16.4, 18.6, 3.8, 7.6, 1.4);
      x.fill();
    });
  }

  function kerzeSprite() {
    return spriteBauen(22, 40, function (x) {
      var halo = x.createRadialGradient(11, 10.2, 0, 11, 10.2, 9);
      halo.addColorStop(0, 'rgba(255,200,90,0.55)');
      halo.addColorStop(1, 'rgba(255,200,90,0)');
      x.fillStyle = halo;
      x.beginPath();
      x.arc(11, 10.2, 9, 0, ZWEI_PI);
      x.fill();
      x.fillStyle = linearVerlauf(x, 1.5, 0, 20.5, 0, [[0, '#ffe58a'], [0.5, '#e8a500'], [1, '#a86d00']]);
      x.beginPath();
      x.ellipse(11, 35.6, 9.4, 2.8, 0, 0, ZWEI_PI);
      x.fill();
      x.fillStyle = linearVerlauf(x, 6, 0, 16, 0, [[0, '#ff7a7a'], [0.5, '#e03131'], [1, '#9c1b1b']]);
      rundesRechteck(x, 6, 15.6, 10, 19.4, 1.5);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(7.2, 17, 1.6, 15);
      x.strokeStyle = '#2b2b2b';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(11, 15.8);
      x.lineTo(11, 13);
      x.stroke();
      x.fillStyle = linearVerlauf(x, 0, 3.2, 0, 13, [[0, '#fff3bf'], [0.5, '#ffc94d'], [1, '#ff8a1f']]);
      x.beginPath();
      x.moveTo(11, 3.2);
      x.bezierCurveTo(14.4, 7.2, 14.2, 11.8, 11, 13);
      x.bezierCurveTo(7.8, 11.8, 7.6, 7.2, 11, 3.2);
      x.closePath();
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.75)';
      x.beginPath();
      x.ellipse(11, 10.4, 1.2, 2, 0, 0, ZWEI_PI);
      x.fill();
    });
  }

  function tannenzapfenSprite() {
    return spriteBauen(22, 34, function (x) {
      var i;
      var j;
      x.strokeStyle = '#3fa055';
      x.lineWidth = 1.2;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(11, 7);
      x.lineTo(6.4, 3);
      x.moveTo(11, 7);
      x.lineTo(11, 2.2);
      x.moveTo(11, 7);
      x.lineTo(15.6, 3);
      x.stroke();
      x.save();
      x.beginPath();
      x.ellipse(11, 20, 7.8, 12.6, 0, 0, ZWEI_PI);
      x.fillStyle = linearVerlauf(x, 3, 0, 19, 0, [[0, '#b27a3e'], [1, '#6b4220']]);
      x.fill();
      x.clip();
      x.lineWidth = 0.8;
      x.strokeStyle = '#4f2f14';
      x.fillStyle = '#9a6331';
      for (i = 0; i < 7; i++) {
        var y = 9 + i * 3.7;
        var breite = 2 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 20) / 12.6, 2))) * 7.8;
        var n = Math.max(2, Math.round(breite / 4.2));
        for (j = 0; j < n; j++) {
          var cx = 11 - breite / 2 + (j + (i % 2 ? 0.75 : 0.25)) * (breite / n);
          x.beginPath();
          x.moveTo(cx - 2.8, y - 1.2);
          x.quadraticCurveTo(cx, y + 4.2, cx + 2.8, y - 1.2);
          x.closePath();
          x.fill();
          x.stroke();
        }
      }
      x.restore();
    });
  }

  function mistelzweigSprite() {
    return spriteBauen(30, 28, function (x) {
      function blatt(px, py, winkel, laenge) {
        x.save();
        x.translate(px, py);
        x.rotate(winkel);
        x.beginPath();
        x.ellipse(laenge / 2, 0, laenge / 2, 2.9, 0, 0, ZWEI_PI);
        x.fillStyle = linearVerlauf(x, 0, -3, 0, 3, [[0, '#a6dd72'], [1, '#5fa83a']]);
        x.fill();
        x.strokeStyle = 'rgba(40,90,30,0.55)';
        x.lineWidth = 0.7;
        x.beginPath();
        x.moveTo(1, 0);
        x.lineTo(laenge - 1, 0);
        x.stroke();
        x.restore();
      }
      function beere(px, py) {
        tupfen(x, px, py, 2.5, '#f4f7f0');
        x.strokeStyle = '#c3cdb8';
        x.lineWidth = 0.6;
        x.stroke();
        tupfen(x, px - 0.7, py - 0.8, 0.7, '#ffffff');
      }
      x.strokeStyle = '#7b5a2a';
      x.lineWidth = 1.5;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(15, 22);
      x.lineTo(15, 12);
      x.moveTo(15, 15);
      x.lineTo(9, 10.5);
      x.moveTo(15, 15);
      x.lineTo(21, 10.5);
      x.stroke();
      blatt(15, 12, -1.57, 8.5);
      blatt(9.4, 10.5, -2.55, 8.5);
      blatt(20.6, 10.5, -0.59, 8.5);
      blatt(15, 17, -3.0, 8);
      blatt(15, 17, -0.14, 8);
      beere(15, 14.2);
      beere(12.6, 16.6);
      beere(17.4, 16.6);
      x.fillStyle = '#e03131';
      x.beginPath();
      x.moveTo(15, 22.6);
      x.lineTo(9.6, 20);
      x.lineTo(9.6, 25.4);
      x.closePath();
      x.moveTo(15, 22.6);
      x.lineTo(20.4, 20);
      x.lineTo(20.4, 25.4);
      x.closePath();
      x.fill();
      tupfen(x, 15, 22.6, 1.7, '#b81d1d');
    });
  }

  /* ---------- Weitere Motive: Nikolaus (Stiefel, Mandarine, Nuss, Apfel, Schoko-Nikolaus) und Luftballons ---------- */

  function stiefelSprite() {
    return spriteBauen(30, 36, function (x) {
      tupfen(x, 11.2, 4.6, 3.7, '#e03131');
      tupfen(x, 10.2, 3.6, 0.9, 'rgba(255,255,255,0.6)');
      tupfen(x, 17.6, 4.2, 3.3, '#ff9f1c');
      x.fillStyle = linearVerlauf(x, 8, 0, 27.8, 0, [[0, '#7a849b'], [1, '#3b4254']]);
      x.beginPath();
      x.moveTo(8, 8);
      x.lineTo(19.4, 8);
      x.lineTo(19.4, 22);
      x.quadraticCurveTo(19.6, 23.6, 21.4, 24.1);
      x.bezierCurveTo(25.2, 25, 27.8, 26.2, 27.8, 28.6);
      x.lineTo(27.8, 31);
      x.lineTo(8, 31);
      x.closePath();
      x.fill();
      x.fillStyle = '#101216';
      x.fillRect(8, 30, 19.8, 2.8);
      x.strokeStyle = 'rgba(255,255,255,0.3)';
      x.lineWidth = 1.4;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(10.2, 12);
      x.lineTo(10.2, 26);
      x.stroke();
      x.strokeStyle = '#f2c230';
      x.lineWidth = 1.3;
      x.strokeRect(12.6, 17.6, 4.6, 3.6);
      x.fillStyle = linearVerlauf(x, 0, 5.6, 0, 11, [[0, '#ffffff'], [1, '#d9dfe8']]);
      rundesRechteck(x, 6.4, 5.6, 15.2, 5.4, 2.7);
      x.fill();
    });
  }

  function mandarineSprite() {
    return spriteBauen(24, 26, function (x) {
      var v = x.createRadialGradient(9, 11, 1.5, 12, 14.5, 10.5);
      v.addColorStop(0, '#ffcf80');
      v.addColorStop(0.55, '#ff9f1c');
      v.addColorStop(1, '#d9650a');
      x.fillStyle = v;
      x.beginPath();
      x.arc(12, 14.5, 9.6, 0, ZWEI_PI);
      x.fill();
      x.fillStyle = '#7a5a2a';
      x.fillRect(11.4, 3.8, 1.4, 2.8);
      x.save();
      x.translate(15.6, 5.2);
      x.rotate(-0.5);
      x.fillStyle = '#4cb35f';
      x.beginPath();
      x.ellipse(0, 0, 4.4, 2, 0, 0, ZWEI_PI);
      x.fill();
      x.restore();
      tupfen(x, 8.2, 10.2, 2.1, 'rgba(255,255,255,0.35)');
      tupfen(x, 14.6, 18.2, 0.5, 'rgba(150,60,0,0.45)');
      tupfen(x, 10.4, 20, 0.5, 'rgba(150,60,0,0.45)');
      tupfen(x, 16.8, 13.6, 0.5, 'rgba(150,60,0,0.45)');
    });
  }

  function nussSprite() {
    return spriteBauen(22, 24, function (x) {
      var v = x.createRadialGradient(8, 8, 1, 11, 12.5, 11);
      v.addColorStop(0, '#dcb27a');
      v.addColorStop(1, '#8a5a2a');
      x.fillStyle = v;
      x.beginPath();
      x.ellipse(11, 12.5, 8.6, 9.8, 0, 0, ZWEI_PI);
      x.fill();
      x.lineCap = 'round';
      x.strokeStyle = '#6b451f';
      x.lineWidth = 1.1;
      x.beginPath();
      x.moveTo(11, 3.4);
      x.bezierCurveTo(13, 8, 9, 15, 11, 21.6);
      x.stroke();
      x.strokeStyle = 'rgba(80,50,20,0.55)';
      x.lineWidth = 0.8;
      x.beginPath();
      x.moveTo(6.2, 7);
      x.quadraticCurveTo(4.6, 12, 6.6, 17.4);
      x.moveTo(15.8, 7);
      x.quadraticCurveTo(17.4, 12, 15.4, 17.4);
      x.stroke();
      tupfen(x, 7.8, 7.6, 1.6, 'rgba(255,255,255,0.3)');
    });
  }

  function apfelSprite() {
    return spriteBauen(24, 28, function (x) {
      var v = x.createRadialGradient(8.6, 14, 1.5, 12, 17, 11);
      v.addColorStop(0, '#ff8a8a');
      v.addColorStop(0.5, '#e03131');
      v.addColorStop(1, '#9c1b1b');
      x.fillStyle = v;
      x.beginPath();
      x.arc(8.8, 16.2, 7.6, 0, ZWEI_PI);
      x.fill();
      x.beginPath();
      x.arc(15.2, 16.2, 7.6, 0, ZWEI_PI);
      x.fill();
      x.beginPath();
      x.ellipse(12, 18.2, 8.6, 7.2, 0, 0, ZWEI_PI);
      x.fill();
      x.fillStyle = 'rgba(80,0,0,0.35)';
      x.beginPath();
      x.ellipse(12, 9.4, 2.4, 1.3, 0, 0, ZWEI_PI);
      x.fill();
      x.strokeStyle = '#7a5a2a';
      x.lineWidth = 1.5;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(12, 9.2);
      x.quadraticCurveTo(12.4, 6, 13.6, 3.6);
      x.stroke();
      x.save();
      x.translate(13.8, 4.6);
      x.rotate(-0.35);
      x.fillStyle = '#4cb35f';
      x.beginPath();
      x.ellipse(4, 0, 4.4, 2.1, 0, 0, ZWEI_PI);
      x.fill();
      x.restore();
      tupfen(x, 7.2, 13.8, 2.2, 'rgba(255,255,255,0.4)');
    });
  }

  function schokoNikolausSprite() {
    return spriteBauen(24, 40, function (x) {
      var i;
      x.translate(1.1, 0.7);
      x.lineJoin = 'round';
      tupfen(x, 7.6, 35.6, 2.8, '#1d2026');
      tupfen(x, 14.4, 35.6, 2.8, '#1d2026');
      x.fillStyle = linearVerlauf(x, 3, 0, 19, 0, [[0, '#ff7a7a'], [0.5, '#e03131'], [1, '#a51d1d']]);
      x.beginPath();
      x.moveTo(6.4, 19);
      x.lineTo(15.6, 19);
      x.lineTo(19, 34);
      x.lineTo(3, 34);
      x.closePath();
      x.fill();
      for (i = 0; i < 2; i++) {
        x.save();
        x.translate(i ? 18 : 4, 25);
        x.rotate(i ? -0.3 : 0.3);
        x.fillStyle = '#c92a2a';
        x.beginPath();
        x.ellipse(0, 0, 2.6, 6.2, 0, 0, ZWEI_PI);
        x.fill();
        tupfen(x, 0, 5.4, 2.1, '#ffffff');
        x.restore();
      }
      x.fillStyle = '#f8f9fa';
      rundesRechteck(x, 2.6, 32.2, 16.8, 3.2, 1.6);
      x.fill();
      x.fillRect(10, 19.6, 2, 13);
      x.fillStyle = '#212529';
      x.fillRect(5.2, 26, 11.6, 2.6);
      x.fillStyle = '#f2c230';
      x.fillRect(9.2, 25.8, 3.6, 3);
      tupfen(x, 11, 11.8, 4, '#f6c9b0');
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.ellipse(11, 16, 5.6, 5, 0, 0, ZWEI_PI);
      x.fill();
      tupfen(x, 11, 12.8, 1.1, '#e8998d');
      tupfen(x, 9.6, 10.6, 0.6, '#3a2a22');
      tupfen(x, 12.4, 10.6, 0.6, '#3a2a22');
      x.fillStyle = linearVerlauf(x, 5, 0, 17, 0, [[0, '#ff7a7a'], [1, '#c92a2a']]);
      x.beginPath();
      x.moveTo(5.6, 9.8);
      x.bezierCurveTo(6, 5, 9, 2.5, 14, 2);
      x.bezierCurveTo(15.5, 4, 16.2, 7, 16.4, 9.8);
      x.closePath();
      x.fill();
      x.fillStyle = '#f8f9fa';
      rundesRechteck(x, 4.6, 8.4, 12.8, 3.2, 1.6);
      x.fill();
      tupfen(x, 14.6, 2.6, 2, '#ffffff');
    });
  }

  function ballonSprite(farben) {
    return spriteBauen(22, 44, function (x) {
      var v = x.createRadialGradient(7.6, 8, 1, 11, 12, 12);
      v.addColorStop(0, farben[0]);
      v.addColorStop(0.5, farben[1]);
      v.addColorStop(1, farben[2]);
      x.strokeStyle = 'rgba(255,255,255,0.7)';
      x.lineWidth = 0.9;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(11, 25.5);
      x.bezierCurveTo(7, 30, 15, 35, 10.6, 42);
      x.stroke();
      x.fillStyle = v;
      x.beginPath();
      x.ellipse(11, 12, 9, 10.8, 0, 0, ZWEI_PI);
      x.fill();
      x.fillStyle = farben[2];
      x.beginPath();
      x.moveTo(11, 22.6);
      x.lineTo(8.8, 26);
      x.lineTo(13.2, 26);
      x.closePath();
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.beginPath();
      x.ellipse(7.2, 7, 2.1, 3.4, -0.5, 0, ZWEI_PI);
      x.fill();
    });
  }

  /* ---------- Effekt "fallende Teilchen": Schnee, Konfetti, Laub, Herzen, Ostern, Halloween ---------- */

  function fallEffekt(konfig) {
    return function (umgebung) {
      var sprites = konfig.sprites();
      var teile = [];

      function anzahlBerechnen() {
        var flaeche = begrenzen((umgebung.breite * umgebung.hoehe) / (1600 * 900), konfig.flaecheMin || 0.45, 1.6);
        return Math.max(6, Math.round(konfig.anzahl * flaeche * umgebung.staerke));
      }

      function neuesTeil(teil, anfang) {
        teil.sx = 0;
        teil.sy = 0;
        teil.flip = zufall(0, 6.28);
        teil.flipV = 0;
        teil.wellenY = 0;
        teil.spiegeln = 1;
        teil.wippe = 0;
        konfig.neu(teil, umgebung, sprites, anfang);
        return teil;
      }

      return {
        teile: function () { return teile; },
        groesse: function () {
          var n = anzahlBerechnen();
          while (teile.length < n) { teile.push(neuesTeil({}, true)); }
          if (teile.length > n) { teile.length = n; }
        },
        schritt: function (dt) {
          var rand = 40;
          for (var i = 0; i < teile.length; i++) {
            var p = teile[i];
            p.phase += p.phaseV * dt;
            if (p.wippe) { p.rot = p.wippe * Math.cos(p.phase); } else { p.rot += p.rotV * dt; } /* wippen = hin und her schwingen, sonst drehen */
            if (p.flipV) { p.flip += p.flipV * dt; }
            schubsen(p, dt);
            p.x += (p.vx + Math.sin(p.phase) * p.schwing + p.sx) * dt;
            p.y += (p.vy + Math.sin(p.phase * 1.3) * p.wellenY + p.sy) * dt;
            if (p.vy > 0 && p.y > umgebung.hoehe + rand) { neuesTeil(p, false); }
            else if (p.vy < 0 && p.y < -rand) { neuesTeil(p, false); }
            if (p.x < -rand) { p.x = umgebung.breite + rand; }
            else if (p.x > umgebung.breite + rand) { p.x = -rand; }
          }
        },
        zeichnen: function (ctx) {
          for (var i = 0; i < teile.length; i++) {
            var p = teile[i];
            var sp = p.sprite;
            var alpha = p.alpha * (konfig.alphaFaktor ? konfig.alphaFaktor(p, umgebung) : 1);
            if (alpha <= 0.01) { continue; }
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            if (p.rot) { ctx.rotate(p.rot); }
            ctx.scale(p.skala * p.spiegeln * (p.flipV ? Math.cos(p.flip) : 1), p.skala);
            ctx.drawImage(sp, -sp.bw / 2, -sp.bh / 2, sp.bw, sp.bh);
            ctx.restore();
          }
        }
      };
    };
  }

  function schneeKonfig(anzahl) {
    return {
      anzahl: anzahl,
      sprites: function () { return { punkt: punktSprite(), kristall: kristallSprite() }; },
      neu: function (p, u, s, anfang) {
        var kristall = Math.random() < 0.3;
        p.sprite = kristall ? s.kristall : s.punkt;
        p.skala = kristall ? zufall(0.45, 0.95) : zufall(0.28, 0.85);
        p.x = zufall(0, u.breite);
        p.y = anfang ? zufall(0, u.hoehe) : zufall(-40, -10);
        p.vx = zufall(-6, 6);
        p.vy = 22 + p.skala * 58 + zufall(0, 14);
        p.schwing = zufall(8, 26);
        p.phase = zufall(0, 6.28);
        p.phaseV = zufall(0.5, 1.4);
        p.rot = zufall(0, 6.28);
        p.rotV = kristall ? zufall(-0.7, 0.7) : 0;
        p.alpha = zufall(0.55, 0.95);
        p.leicht = 1 / (0.45 + p.skala);
      }
    };
  }

  var KONFETTI_FARBEN = ['#ff4d4d', '#ffd93b', '#4dd0ff', '#6bff8a', '#c77dff', '#ffffff', '#ff9f43'];

  var konfettiKonfig = {
    anzahl: 70,
    sprites: function () {
      var liste = [];
      for (var i = 0; i < KONFETTI_FARBEN.length; i++) {
        liste.push(konfettiSprite(KONFETTI_FARBEN[i], false));
        liste.push(konfettiSprite(KONFETTI_FARBEN[i], true));
      }
      return liste;
    },
    neu: function (p, u, s, anfang) {
      p.sprite = waehlen(s);
      p.skala = zufall(0.9, 1.5);
      p.x = zufall(0, u.breite);
      p.y = anfang ? zufall(0, u.hoehe) : zufall(-40, -10);
      p.vx = zufall(-14, 14);
      p.vy = zufall(55, 135);
      p.schwing = zufall(16, 46);
      p.phase = zufall(0, 6.28);
      p.phaseV = zufall(0.8, 2);
      p.rot = zufall(0, 6.28);
      p.rotV = zufall(-4, 4);
      p.flip = zufall(0, 6.28);
      p.flipV = zufall(3, 8);
      p.alpha = zufall(0.85, 1);
      p.leicht = 1 / (0.45 + p.skala * 0.6);
    }
  };

  var LAUB_FARBEN = ['#d9480f', '#f08c00', '#c92a2a', '#a0522d', '#e8b923'];

  var laubKonfig = {
    anzahl: 38,
    sprites: function () { return LAUB_FARBEN.map(laubSprite); },
    neu: function (p, u, s, anfang) {
      p.sprite = waehlen(s);
      p.skala = zufall(0.7, 1.25);
      p.x = zufall(0, u.breite);
      p.y = anfang ? zufall(0, u.hoehe) : zufall(-40, -10);
      p.vx = zufall(-10, 10);
      p.vy = zufall(36, 84);
      p.schwing = zufall(24, 54);
      p.phase = zufall(0, 6.28);
      p.phaseV = zufall(0.6, 1.3);
      p.rot = zufall(0, 6.28);
      p.rotV = zufall(-1.8, 1.8);
      p.alpha = zufall(0.8, 0.95);
      p.leicht = 1 / (0.45 + p.skala * 0.7);
    }
  };

  var HERZ_FARBEN = ['#ff4d6d', '#ff758f', '#ff8fa3', '#c9184a', '#ffb3c1'];

  var herzenKonfig = {
    anzahl: 34,
    sprites: function () { return HERZ_FARBEN.map(herzSprite); },
    neu: function (p, u, s, anfang) {
      p.sprite = waehlen(s);
      p.skala = zufall(0.55, 1.25);
      p.x = zufall(0, u.breite);
      p.y = anfang ? zufall(0, u.hoehe) : u.hoehe + zufall(10, 40);
      p.vx = zufall(-8, 8);
      p.vy = -zufall(30, 72);
      p.schwing = zufall(12, 30);
      p.phase = zufall(0, 6.28);
      p.phaseV = zufall(0.6, 1.5);
      p.rot = zufall(-0.35, 0.35);
      p.rotV = 0;
      p.alpha = zufall(0.6, 0.92);
      p.leicht = 1 / (0.45 + p.skala * 0.7);
    },
    alphaFaktor: function (p, u) { return begrenzen(p.y / (0.25 * u.hoehe), 0, 1); }
  };

  var osternKonfig = {
    anzahl: 30,
    sprites: function () {
      return [
        eiSprite('#ffd6e0', '#ff8fab'), eiSprite('#d8f3dc', '#74c69d'), eiSprite('#fff3b0', '#f6bd60'),
        eiSprite('#cfe8ff', '#6fa8ff'), eiSprite('#e9d8fd', '#b197fc'),
        emojiSprite('🌷', 24), emojiSprite('🌼', 24), emojiSprite('🐣', 24)
      ];
    },
    neu: function (p, u, s, anfang) {
      p.sprite = waehlen(s);
      p.skala = zufall(0.8, 1.25);
      p.x = zufall(0, u.breite);
      p.y = anfang ? zufall(0, u.hoehe) : zufall(-40, -10);
      p.vx = zufall(-8, 8);
      p.vy = zufall(26, 54);
      p.schwing = zufall(14, 32);
      p.phase = zufall(0, 6.28);
      p.phaseV = zufall(0.5, 1.1);
      p.rot = zufall(-0.4, 0.4);
      p.rotV = zufall(-0.5, 0.5);
      p.alpha = zufall(0.88, 1);
      p.leicht = 1 / (0.45 + p.skala * 0.7);
    }
  };

  var halloweenKonfig = {
    anzahl: 22,
    sprites: function () {
      return {
        kuerbis: emojiSprite('🎃', 26),
        geist: emojiSprite('👻', 26),
        fledermaus: emojiSprite('🦇', 26)
      };
    },
    neu: function (p, u, s, anfang) {
      var fledermaus = Math.random() < 0.28;
      p.skala = zufall(0.8, 1.3);
      p.x = zufall(0, u.breite);
      p.phase = zufall(0, 6.28);
      p.rotV = 0;
      p.alpha = zufall(0.85, 1);
      if (fledermaus) {
        p.sprite = s.fledermaus;
        p.y = zufall(0.05 * u.hoehe, 0.55 * u.hoehe);
        p.vx = (Math.random() < 0.5 ? -1 : 1) * zufall(60, 140);
        p.spiegeln = p.vx < 0 ? 1 : -1;
        p.vy = 0;
        p.wellenY = zufall(26, 60);
        p.phaseV = zufall(1.5, 3);
        p.schwing = 0;
        p.rot = 0;
      } else {
        p.sprite = Math.random() < 0.5 ? s.kuerbis : s.geist;
        p.y = anfang ? zufall(0, u.hoehe) : zufall(-40, -10);
        p.vx = zufall(-6, 6);
        p.vy = zufall(26, 56);
        p.schwing = zufall(14, 34);
        p.phaseV = zufall(0.5, 1.1);
        p.rot = zufall(-0.3, 0.3);
      }
      p.leicht = 1 / (0.45 + p.skala * 0.7);
    }
  };

  /* ---------- Weihnachtsmotive als fallende Teilchen (gehört zur Winter-Edition) ---------- */

  var GESCHENK_FARBEN = [
    [['#f55b5b', '#c92a2a'], ['#ff7b7b', '#e03131'], '#ffd43b'],
    [['#3d9df2', '#1c6fc4'], ['#63b3fa', '#2b8be0'], '#f1f3f5'],
    [['#4bc965', '#2b8a3e'], ['#74dd8a', '#3fbf58'], '#fa5252'],
    [['#b44bd1', '#862e9c'], ['#d070e8', '#b44bd1'], '#ffd43b'],
    [['#eceff2', '#aeb6bf'], ['#ffffff', '#d3d9df'], '#e03131']
  ];

  var KUGEL_ARTEN = [['rot'], ['rot', 'streifen'], ['gold'], ['gold', 'punkte'], ['blau'], ['blau', 'zickzack'], ['gruen'], ['gruen', 'punkte'],
    ['silber'], ['silber', 'streifen'], ['violett'], ['violett', 'punkte']];

  /* gewicht = wie oft das Motiv vorkommt, wippe = pendelt hin und her (Höchstausschlag in Bogenmaß), dreh = dreht sich langsam,
     groesse = kleinster und größter Maßstab */
  function weihnachtsSprites() {
    return [
      { art: 'kugel', gewicht: 11, wippe: [0.1, 0.28], groesse: [0.8, 1.15],
        liste: KUGEL_ARTEN.map(function (a) { return kugelSprite(KUGEL_FARBEN[a[0]], a[1] ? KUGEL_MUSTER[a[1]] : null); }) },
      { art: 'baum', gewicht: 7, wippe: [0.12, 0.32], groesse: [0.85, 1.2], liste: [baumSprite()] },
      { art: 'stern', gewicht: 4, dreh: [0.5, 1.1], groesse: [0.7, 1.1], liste: [goldSternSprite()] },
      { art: 'geschenk', gewicht: 3, dreh: [0.25, 0.7], groesse: [0.8, 1.1],
        liste: GESCHENK_FARBEN.map(function (f) { return geschenkSprite(f[0], f[1], f[2]); }) },
      { art: 'zuckerstange', gewicht: 3, dreh: [0.4, 0.9], groesse: [0.8, 1.15], liste: [zuckerstangeSprite()] },
      { art: 'glocke', gewicht: 2, wippe: [0.25, 0.5], groesse: [0.8, 1.1], liste: [glockeSprite()] },
      { art: 'lebkuchen', gewicht: 2, dreh: [0.3, 0.8], groesse: [0.85, 1.15], liste: [lebkuchenSprite()] },
      { art: 'stechpalme', gewicht: 2, dreh: [0.3, 0.8], groesse: [0.8, 1.1], liste: [stechpalmeSprite()] },
      { art: 'muetze', gewicht: 1.5, wippe: [0.2, 0.4], groesse: [0.8, 1.1], liste: [muetzeSprite()] },
      { art: 'schneemann', gewicht: 1.5, wippe: [0.12, 0.3], groesse: [0.8, 1.1], liste: [schneemannSprite()] },
      { art: 'socke', gewicht: 1.5, wippe: [0.15, 0.35], groesse: [0.8, 1.1], liste: [sockeSprite()] },
      { art: 'rentier', gewicht: 2, wippe: [0.15, 0.35], groesse: [0.85, 1.15], liste: [rentierSprite()] },
      { art: 'plaetzchen', gewicht: 3, dreh: [0.3, 0.8], groesse: [0.8, 1.1], liste: [keksSternSprite(), keksTanneSprite(), keksHerzSprite()] },
      { art: 'pinguin', gewicht: 1.5, wippe: [0.15, 0.3], groesse: [0.85, 1.15], liste: [pinguinSprite()] },
      { art: 'kerze', gewicht: 2, wippe: [0.1, 0.22], groesse: [0.85, 1.15], liste: [kerzeSprite()] },
      { art: 'tannenzapfen', gewicht: 1.5, dreh: [0.3, 0.8], groesse: [0.8, 1.1], liste: [tannenzapfenSprite()] },
      { art: 'mistelzweig', gewicht: 1.5, dreh: [0.3, 0.7], groesse: [0.8, 1.1], liste: [mistelzweigSprite()] }
    ];
  }

  var weihnachtsKonfig = {
    anzahl: 20,
    flaecheMin: 0.3, /* auf kleinen Bildschirmen (Handy) etwas weniger, die Motive sind größer als Schneeflocken */
    sprites: weihnachtsSprites,
    neu: function (p, u, s, anfang) {
      var summe = 0;
      var i;
      for (i = 0; i < s.length; i++) { summe += s[i].gewicht; }
      var wurf = Math.random() * summe;
      var motiv = s[s.length - 1];
      for (i = 0; i < s.length; i++) {
        wurf -= s[i].gewicht;
        if (wurf < 0) { motiv = s[i]; break; }
      }
      var tiefe = Math.random(); /* 0 = weit hinten (kleiner, langsamer, blasser), 1 = weit vorn */
      p.art = motiv.art;
      p.sprite = waehlen(motiv.liste);
      p.skala = (motiv.groesse[0] + (motiv.groesse[1] - motiv.groesse[0]) * tiefe) * begrenzen(u.breite / 1280, 0.85, 1.25); /* auf großen Bildschirmen etwas größer, auf dem Handy etwas kleiner */
      p.x = zufall(0, u.breite);
      p.y = anfang ? zufall(0, u.hoehe) : zufall(-50, -14);
      p.vx = zufall(-5, 5);
      p.vy = 24 + 34 * tiefe + zufall(0, 8);
      p.schwing = zufall(10, 26);
      p.phase = zufall(0, 6.28);
      p.phaseV = zufall(0.5, 1.2);
      if (motiv.wippe) {
        p.wippe = zufall(motiv.wippe[0], motiv.wippe[1]);
        p.rot = 0;
        p.rotV = 0;
      } else {
        p.rot = zufall(0, 6.28);
        p.rotV = zufall(motiv.dreh[0], motiv.dreh[1]) * (Math.random() < 0.5 ? -1 : 1);
      }
      p.alpha = 0.72 + 0.26 * tiefe;
      p.leicht = 1 / (0.45 + p.skala * 0.8);
    }
  };

  /* ---------- Nikolaus: Stiefel, Mandarinen, Nüsse, Äpfel und Schoko-Nikoläuse ---------- */

  function nikolausSprites() {
    return [
      { art: 'stiefel', gewicht: 5, wippe: [0.12, 0.3], groesse: [0.85, 1.2], liste: [stiefelSprite()] },
      { art: 'schokonikolaus', gewicht: 4, wippe: [0.1, 0.25], groesse: [0.85, 1.2], liste: [schokoNikolausSprite()] },
      { art: 'mandarine', gewicht: 5, dreh: [0.4, 0.9], groesse: [0.8, 1.1], liste: [mandarineSprite()] },
      { art: 'nuss', gewicht: 4, dreh: [0.4, 1], groesse: [0.8, 1.1], liste: [nussSprite()] },
      { art: 'apfel', gewicht: 3, dreh: [0.3, 0.8], groesse: [0.8, 1.1], liste: [apfelSprite()] },
      { art: 'lebkuchen', gewicht: 3, dreh: [0.3, 0.8], groesse: [0.85, 1.15], liste: [lebkuchenSprite()] },
      { art: 'zuckerstange', gewicht: 2, dreh: [0.4, 0.9], groesse: [0.8, 1.15], liste: [zuckerstangeSprite()] },
      { art: 'muetze', gewicht: 2, wippe: [0.2, 0.4], groesse: [0.8, 1.1], liste: [muetzeSprite()] },
      { art: 'stern', gewicht: 2, dreh: [0.5, 1.1], groesse: [0.7, 1.1], liste: [goldSternSprite()] },
      { art: 'plaetzchen', gewicht: 2, dreh: [0.3, 0.8], groesse: [0.8, 1.1], liste: [keksSternSprite(), keksHerzSprite()] }
    ];
  }

  /* Gleiche Auswahl nach Gewicht, gleiche Bewegung wie bei den Weihnachtsmotiven. */
  var nikolausKonfig = { anzahl: 16, flaecheMin: 0.3, sprites: nikolausSprites, neu: weihnachtsKonfig.neu };

  /* ---------- Jubiläum: Luftballons, die langsam nach oben steigen ---------- */

  var ballonKonfig = {
    anzahl: 14,
    flaecheMin: 0.3,
    sprites: function () {
      return ['rot', 'gold', 'blau', 'gruen', 'violett', 'silber'].map(function (n) { return ballonSprite(KUGEL_FARBEN[n]); });
    },
    neu: function (p, u, s, anfang) {
      p.sprite = waehlen(s);
      p.skala = zufall(0.8, 1.3) * begrenzen(u.breite / 1280, 0.85, 1.25);
      p.x = zufall(0, u.breite);
      p.y = anfang ? zufall(0, u.hoehe) : u.hoehe + zufall(40, 90);
      p.vx = zufall(-6, 6);
      p.vy = -zufall(28, 62);
      p.schwing = zufall(10, 26);
      p.phase = zufall(0, 6.28);
      p.phaseV = zufall(0.5, 1.2);
      p.wippe = zufall(0.08, 0.2);
      p.rot = 0;
      p.rotV = 0;
      p.alpha = zufall(0.8, 0.97);
      p.leicht = 1 / (0.45 + p.skala * 0.7);
    },
    alphaFaktor: function (p, u) { return begrenzen(p.y / (0.2 * u.hoehe), 0, 1); }
  };

  /* Wie konfettiKonfig, nur mit anderer Menge. */
  function mitAnzahl(konfig, anzahl) {
    var kopie = {};
    for (var schluessel in konfig) {
      if (Object.prototype.hasOwnProperty.call(konfig, schluessel)) { kopie[schluessel] = konfig[schluessel]; }
    }
    kopie.anzahl = anzahl;
    return kopie;
  }

  /* ---------- Effekt "funkelnde Sterne" ---------- */

  function sterneEffekt(anzahlBasis) {
    return function (umgebung) {
      var sprites = [sternSprite('rgba(255,232,160,1)'), sternSprite('rgba(255,255,255,1)')];
      var sterne = [];

      function neuerStern(stern) {
        stern.sprite = waehlen(sprites);
        stern.x = zufall(0, umgebung.breite);
        stern.y = zufall(0, umgebung.hoehe);
        stern.skala = zufall(0.45, 1.05);
        stern.phase = zufall(0, 6.28);
        stern.phaseV = zufall(0.8, 2.4);
        return stern;
      }

      return {
        teile: function () { return sterne; },
        groesse: function () {
          var flaeche = begrenzen((umgebung.breite * umgebung.hoehe) / (1600 * 900), 0.45, 1.6);
          var n = Math.max(5, Math.round(anzahlBasis * flaeche * umgebung.staerke));
          while (sterne.length < n) { sterne.push(neuerStern({})); }
          if (sterne.length > n) { sterne.length = n; }
          for (var i = 0; i < sterne.length; i++) {
            if (sterne[i].x > umgebung.breite || sterne[i].y > umgebung.hoehe) { neuerStern(sterne[i]); }
          }
        },
        schritt: function (dt) {
          for (var i = 0; i < sterne.length; i++) { sterne[i].phase += sterne[i].phaseV * dt; }
        },
        zeichnen: function (ctx) {
          for (var i = 0; i < sterne.length; i++) {
            var s = sterne[i];
            var glanz = 0.5 + 0.5 * Math.sin(s.phase);
            var sp = s.sprite;
            var skala = s.skala * (0.75 + 0.35 * glanz);
            ctx.globalAlpha = 0.12 + 0.78 * glanz;
            ctx.drawImage(sp, s.x - sp.bw * skala / 2, s.y - sp.bh * skala / 2, sp.bw * skala, sp.bh * skala);
          }
          ctx.globalAlpha = 1;
        }
      };
    };
  }

  /* ---------- Sternschnuppen: ab und zu zieht eine kurze Leuchtspur schräg übers Bild ---------- */

  function sternschnuppenEffekt(umgebung) {
    var liste = [];
    var zeit = 0;
    var naechste = zufall(2.5, 5);
    var kopf = punktSprite();

    function starten() {
      var richtung = Math.random() < 0.5 ? 1 : -1;
      var winkel = zufall(0.38, 0.7);
      var tempo = zufall(520, 760);
      var strecke = zufall(380, 640);
      liste.push({
        x: richtung > 0 ? zufall(-0.05, 0.6) * umgebung.breite : zufall(0.4, 1.05) * umgebung.breite,
        y: zufall(0.03, 0.4) * umgebung.hoehe,
        vx: Math.cos(winkel) * tempo * richtung,
        vy: Math.sin(winkel) * tempo,
        tempo: tempo,
        leben: strecke / tempo,
        alter: 0,
        schweif: zufall(120, 230)
      });
    }

    return {
      teile: function () { return []; },
      anzahl: function () { return liste.length; },
      groesse: function () {},
      schritt: function (dt) {
        zeit += dt;
        if (zeit >= naechste) {
          if (liste.length < 2) { starten(); }
          naechste = zeit + zufall(9, 18) / Math.sqrt(umgebung.staerke);
        }
        for (var i = liste.length - 1; i >= 0; i--) {
          var s = liste[i];
          s.alter += dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.alter >= s.leben) { liste.splice(i, 1); }
        }
      },
      zeichnen: function (ctx) {
        if (!liste.length) { return; }
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineWidth = 2;
        for (var i = 0; i < liste.length; i++) {
          var s = liste[i];
          var a = Math.sin(Math.PI * s.alter / s.leben);
          var laenge = s.schweif * (0.4 + 0.6 * a);
          var tx = s.x - s.vx / s.tempo * laenge;
          var ty = s.y - s.vy / s.tempo * laenge;
          var v = ctx.createLinearGradient(s.x, s.y, tx, ty);
          v.addColorStop(0, 'rgba(255,255,255,' + (0.9 * a).toFixed(2) + ')');
          v.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = v;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.globalAlpha = a;
          ctx.drawImage(kopf, s.x - 8, s.y - 8, 16, 16);
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  /* ---------- Funken hinter dem Mauszeiger: kleine goldene Sternchen, die langsam verglühen ---------- */

  function mausfunkenEffekt() {
    var sprites = [sternSprite('rgba(255,232,160,1)'), sternSprite('rgba(255,255,255,1)'), sternSprite('rgba(255,190,120,1)'), punktSprite()];
    var funken = [];
    var letzte = null;
    var MAX_FUNKEN = 70;

    function neuerFunke(px, py) {
      funken.push({
        x: px + zufall(-3, 3),
        y: py + zufall(-3, 3),
        vx: zufall(-26, 26) + zeiger.vx * 0.03,
        vy: zufall(-30, 14),
        leben: zufall(0.6, 1.2),
        alter: 0,
        sprite: waehlen(sprites),
        skala: zufall(0.45, 0.95),
        rot: zufall(0, 6.28),
        rotV: zufall(-3, 3)
      });
    }

    return {
      teile: function () { return []; },
      anzahl: function () { return funken.length; },
      groesse: function () {},
      schritt: function (dt) {
        var i;
        if (zeiger.da) {
          if (letzte) {
            var dx = zeiger.x - letzte.x;
            var dy = zeiger.y - letzte.y;
            var strecke = Math.sqrt(dx * dx + dy * dy);
            if (strecke > 3) {
              var anzahl = Math.min(5, Math.floor(strecke / 16) + (Math.random() < (strecke % 16) / 16 ? 1 : 0));
              for (i = 0; i < anzahl && funken.length < MAX_FUNKEN; i++) {
                var anteil = (i + 1) / (anzahl + 1);
                neuerFunke(letzte.x + dx * anteil, letzte.y + dy * anteil);
              }
              letzte = { x: zeiger.x, y: zeiger.y };
            }
          } else {
            letzte = { x: zeiger.x, y: zeiger.y };
          }
        } else {
          letzte = null;
        }
        for (i = funken.length - 1; i >= 0; i--) {
          var f = funken[i];
          f.alter += dt;
          f.vy += 40 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.rot += f.rotV * dt;
          if (f.alter >= f.leben) { funken.splice(i, 1); }
        }
      },
      zeichnen: function (ctx) {
        if (!funken.length) { return; }
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < funken.length; i++) {
          var f = funken[i];
          var sp = f.sprite;
          ctx.globalAlpha = Math.min(1, (1 - f.alter / f.leben) * 1.4) * 0.95;
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          ctx.scale(f.skala, f.skala);
          ctx.drawImage(sp, -sp.bw / 2, -sp.bh / 2, sp.bw, sp.bh);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  /* ---------- Effekt "Feuerwerk" ---------- */

  function feuerwerkEffekt(umgebung) {
    var raketen = [];
    var funken = [];
    var blitze = [];
    var zeit = 0;
    var naechste = 0.5;
    var farben = [[255, 90, 90], [255, 210, 90], [110, 220, 255], [140, 255, 150], [220, 150, 255], [255, 255, 255], [255, 150, 60]];

    function raketeStarten() {
      raketen.push({
        x: zufall(umgebung.breite * 0.12, umgebung.breite * 0.88),
        y: umgebung.hoehe + 8,
        ziel: zufall(umgebung.hoehe * 0.12, umgebung.hoehe * 0.45),
        v: zufall(380, 520),
        kurve: zufall(-18, 18),
        farbe: waehlen(farben)
      });
    }

    function explodieren(rakete) {
      blitze.push({ x: rakete.x, y: rakete.y, alter: 0, leben: 0.4, farbe: rakete.farbe });
      var n = Math.round(zufall(34, 56) * begrenzen(0.7 + umgebung.staerke * 0.3, 0.7, 1.3));
      var zweite = Math.random() < 0.35 ? waehlen(farben) : null;
      for (var i = 0; i < n; i++) {
        var winkel = (i / n) * Math.PI * 2 + zufall(-0.06, 0.06);
        var tempo = zufall(70, 230) * (Math.random() < 0.4 ? 0.55 : 1);
        funken.push({
          x: rakete.x, y: rakete.y,
          vx: Math.cos(winkel) * tempo, vy: Math.sin(winkel) * tempo,
          leben: zufall(0.9, 1.7), alter: 0,
          farbe: zweite && i % 2 ? zweite : rakete.farbe
        });
      }
    }

    return {
      ohneLoeschen: true,
      teile: function () { return funken; },
      groesse: function () {},
      schritt: function (dt) {
        zeit += dt;
        if (zeit >= naechste) {
          raketeStarten();
          naechste = zeit + zufall(0.7, 1.7) / Math.max(0.5, umgebung.staerke);
        }
        var i;
        for (i = raketen.length - 1; i >= 0; i--) {
          var r = raketen[i];
          r.y -= r.v * dt;
          r.v *= 1 - 0.35 * dt;
          r.x += r.kurve * dt;
          if (r.y <= r.ziel || r.v < 90) { explodieren(r); raketen.splice(i, 1); }
        }
        for (i = funken.length - 1; i >= 0; i--) {
          var f = funken[i];
          f.alter += dt;
          f.vy += 150 * dt;
          f.vx *= 1 - 0.9 * dt;
          f.vy *= 1 - 0.5 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.alter >= f.leben) { funken.splice(i, 1); }
        }
        for (i = blitze.length - 1; i >= 0; i--) {
          blitze[i].alter += dt;
          if (blitze[i].alter >= blitze[i].leben) { blitze.splice(i, 1); }
        }
      },
      zeichnen: function (ctx) {
        var i;
        if (!raketen.length && !funken.length && !blitze.length) {
          ctx.clearRect(0, 0, umgebung.breite, umgebung.hoehe);
          return;
        }
        /* Alles Gezeichnete verblasst langsam, das ergibt die Leuchtspur. Die Fläche bleibt dabei durchsichtig. */
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, 0, umgebung.breite, umgebung.hoehe);
        ctx.globalCompositeOperation = 'lighter';
        for (i = 0; i < raketen.length; i++) {
          var r = raketen[i];
          ctx.fillStyle = 'rgba(' + r.farbe[0] + ',' + r.farbe[1] + ',' + r.farbe[2] + ',0.9)';
          ctx.beginPath();
          ctx.arc(r.x, r.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        for (i = 0; i < funken.length; i++) {
          var f = funken[i];
          var rest = 1 - f.alter / f.leben;
          ctx.fillStyle = 'rgba(' + f.farbe[0] + ',' + f.farbe[1] + ',' + f.farbe[2] + ',' + (0.25 + 0.75 * rest).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(f.x, f.y, 1.1 + 2 * rest, 0, Math.PI * 2);
          ctx.fill();
        }
        for (i = 0; i < blitze.length; i++) {
          var b = blitze[i];
          var anteil = b.alter / b.leben;
          var radius = 18 + 80 * anteil;
          var verlauf = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius);
          var helligkeit = ((1 - anteil) * 0.5).toFixed(2);
          verlauf.addColorStop(0, 'rgba(' + b.farbe[0] + ',' + b.farbe[1] + ',' + b.farbe[2] + ',' + helligkeit + ')');
          verlauf.addColorStop(1, 'rgba(' + b.farbe[0] + ',' + b.farbe[1] + ',' + b.farbe[2] + ',0)');
          ctx.fillStyle = verlauf;
          ctx.beginPath();
          ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  /* ---------- Feuerwerk mit Leuchtspur, das mit anderen Effekten zusammen laufen kann (Jubiläum) ---------- */

  /* Beim alten Feuerwerk (oben) entsteht die Leuchtspur dadurch, dass die Fläche nie ganz gelöscht wird. Das ginge mit
     Konfetti und Luftballons zusammen nicht. Hier merkt sich deshalb jede Rakete und jeder Funke seine letzten Orte und
     zeichnet daraus den Schweif. Die Fläche wird in jedem Bild ganz neu gezeichnet. */
  function feuerwerkMitSpurEffekt(umgebung) {
    var raketen = [];
    var funken = [];
    var blitze = [];
    var zeit = 0;
    var naechste = 0.8;
    var farben = [[255, 90, 90], [255, 210, 90], [110, 220, 255], [140, 255, 150], [220, 150, 255], [255, 255, 255], [255, 150, 60]];
    var SPUR = 6;

    function spurMerken(teil) {
      teil.spur.push(teil.x, teil.y);
      if (teil.spur.length > SPUR * 2) { teil.spur.splice(0, 2); }
    }

    function schweifZeichnen(ctx, teil, farbe, deckkraft, breite) {
      ctx.strokeStyle = 'rgba(' + farbe[0] + ',' + farbe[1] + ',' + farbe[2] + ',' + deckkraft.toFixed(2) + ')';
      ctx.lineWidth = breite;
      ctx.beginPath();
      ctx.moveTo(teil.spur[0], teil.spur[1]);
      for (var k = 2; k < teil.spur.length; k += 2) { ctx.lineTo(teil.spur[k], teil.spur[k + 1]); }
      ctx.lineTo(teil.x, teil.y);
      ctx.stroke();
    }

    function raketeStarten() {
      raketen.push({
        x: zufall(umgebung.breite * 0.12, umgebung.breite * 0.88),
        y: umgebung.hoehe + 8,
        ziel: zufall(umgebung.hoehe * 0.12, umgebung.hoehe * 0.45),
        v: zufall(380, 520),
        kurve: zufall(-18, 18),
        farbe: waehlen(farben),
        spur: []
      });
    }

    function explodieren(rakete) {
      blitze.push({ x: rakete.x, y: rakete.y, alter: 0, leben: 0.4, farbe: rakete.farbe });
      var n = Math.round(zufall(34, 56) * begrenzen(0.7 + umgebung.staerke * 0.3, 0.7, 1.3));
      var zweite = Math.random() < 0.35 ? waehlen(farben) : null;
      for (var i = 0; i < n && funken.length < 600; i++) {
        var winkel = (i / n) * Math.PI * 2 + zufall(-0.06, 0.06);
        var tempo = zufall(70, 230) * (Math.random() < 0.4 ? 0.55 : 1);
        funken.push({
          x: rakete.x, y: rakete.y,
          vx: Math.cos(winkel) * tempo, vy: Math.sin(winkel) * tempo,
          leben: zufall(0.9, 1.7), alter: 0,
          farbe: zweite && i % 2 ? zweite : rakete.farbe,
          spur: []
        });
      }
    }

    return {
      teile: function () { return []; },
      anzahl: function () { return funken.length; },
      groesse: function () {},
      schritt: function (dt) {
        var i;
        zeit += dt;
        if (zeit >= naechste) {
          raketeStarten();
          naechste = zeit + zufall(0.7, 1.7) / Math.max(0.5, umgebung.staerke);
        }
        for (i = raketen.length - 1; i >= 0; i--) {
          var r = raketen[i];
          spurMerken(r);
          r.y -= r.v * dt;
          r.v *= 1 - 0.35 * dt;
          r.x += r.kurve * dt;
          if (r.y <= r.ziel || r.v < 90) { explodieren(r); raketen.splice(i, 1); }
        }
        for (i = funken.length - 1; i >= 0; i--) {
          var f = funken[i];
          spurMerken(f);
          f.alter += dt;
          f.vy += 150 * dt;
          f.vx *= 1 - 0.9 * dt;
          f.vy *= 1 - 0.5 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.alter >= f.leben) { funken.splice(i, 1); }
        }
        for (i = blitze.length - 1; i >= 0; i--) {
          blitze[i].alter += dt;
          if (blitze[i].alter >= blitze[i].leben) { blitze.splice(i, 1); }
        }
      },
      zeichnen: function (ctx) {
        var i;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (i = 0; i < raketen.length; i++) {
          var r = raketen[i];
          if (r.spur.length) { schweifZeichnen(ctx, r, r.farbe, 0.55, 2); }
          ctx.fillStyle = 'rgba(' + r.farbe[0] + ',' + r.farbe[1] + ',' + r.farbe[2] + ',0.95)';
          ctx.beginPath();
          ctx.arc(r.x, r.y, 2.6, 0, ZWEI_PI);
          ctx.fill();
        }
        for (i = 0; i < funken.length; i++) {
          var f = funken[i];
          var rest = 1 - f.alter / f.leben;
          if (f.spur.length) { schweifZeichnen(ctx, f, f.farbe, 0.5 * rest, 0.8 + 1.6 * rest); }
          ctx.fillStyle = 'rgba(' + f.farbe[0] + ',' + f.farbe[1] + ',' + f.farbe[2] + ',' + (0.25 + 0.75 * rest).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(f.x, f.y, 1.1 + 2 * rest, 0, ZWEI_PI);
          ctx.fill();
        }
        for (i = 0; i < blitze.length; i++) {
          var b = blitze[i];
          var anteil = b.alter / b.leben;
          var radius = 18 + 80 * anteil;
          var verlauf = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius);
          var helligkeit = ((1 - anteil) * 0.5).toFixed(2);
          verlauf.addColorStop(0, 'rgba(' + b.farbe[0] + ',' + b.farbe[1] + ',' + b.farbe[2] + ',' + helligkeit + ')');
          verlauf.addColorStop(1, 'rgba(' + b.farbe[0] + ',' + b.farbe[1] + ',' + b.farbe[2] + ',0)');
          ctx.fillStyle = verlauf;
          ctx.beginPath();
          ctx.arc(b.x, b.y, radius, 0, ZWEI_PI);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  /* Mehrere Effekte übereinander, zum Beispiel Schnee und Sterne. */
  function kombi(fabriken) {
    return function (umgebung) {
      var teile = fabriken.map(function (fabrik) { return fabrik(umgebung); });
      return {
        bestandteile: teile,
        ohneLoeschen: teile.some(function (t) { return t.ohneLoeschen; }),
        teile: function () {
          var alle = [];
          teile.forEach(function (t) { alle = alle.concat(t.teile ? t.teile() : []); });
          return alle;
        },
        groesse: function () { teile.forEach(function (t) { t.groesse(); }); },
        schritt: function (dt) { teile.forEach(function (t) { t.schritt(dt); }); },
        zeichnen: function (ctx) { teile.forEach(function (t) { t.zeichnen(ctx); }); }
      };
    };
  }

  var EFFEKTE = {
    schnee: fallEffekt(schneeKonfig(85)),
    sterne: kombi([sterneEffekt(28), sternschnuppenEffekt]),
    weihnachten: kombi([fallEffekt(schneeKonfig(72)), fallEffekt(weihnachtsKonfig), sterneEffekt(16), sternschnuppenEffekt, mausfunkenEffekt]),
    nikolaus: kombi([fallEffekt(schneeKonfig(40)), fallEffekt(nikolausKonfig), sterneEffekt(10)]),
    jubilaeum: kombi([fallEffekt(mitAnzahl(konfettiKonfig, 55)), fallEffekt(ballonKonfig), feuerwerkMitSpurEffekt, sterneEffekt(10)]),
    konfetti: fallEffekt(konfettiKonfig),
    feuerwerk: feuerwerkEffekt,
    laub: fallEffekt(laubKonfig),
    halloween: fallEffekt(halloweenKonfig),
    herzen: fallEffekt(herzenKonfig),
    ostern: fallEffekt(osternKonfig)
  };

  /* ---------- Schmuck für die Winter-Edition: Lichterkette, Schneehaufen, Mütze, Adventskranz ---------- */

  /* Das Aussehen steht hier, damit auch dafür keine Datei geändert werden muss. Der Block wird nur gesetzt, solange die
     Edition läuft, und beim Wechsel auf "Original" wieder entfernt. */
  var DEKO_STIL = [
    '.edition-deko{pointer-events:none}',
    '.edition-lichterkette{position:absolute;left:0;top:0;width:100%;height:34px;z-index:91}',
    'body.edition-mit-lichterkette{padding-top:22px}',
    '.edition-schneehaufen{position:fixed;left:0;bottom:0;width:100%;height:48px;z-index:91}',
    'body.edition-mit-schneehaufen{padding-bottom:44px}',
    '.edition-muetze-halter{position:relative}',
    '.edition-muetze{position:absolute;left:17px;top:-12px;width:24px;height:20px;transform:rotate(38deg);transform-origin:50% 90%;z-index:2}',
    '.edition-muetze svg{display:block;width:100%;height:100%;overflow:visible}',
    '.edition-advent{position:fixed;left:14px;bottom:20px;z-index:94;display:flex;align-items:center;gap:8px;padding:4px 14px 4px 8px;' +
      'border:1px solid var(--line-red);border-radius:16px;background:rgba(8,8,11,.84);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
      'box-shadow:0 6px 20px rgba(0,0,0,.45);font-size:.78rem;line-height:1.3;color:var(--text)}',
    '.edition-advent svg{display:block;width:60px;height:46px;flex:none}',
    '.edition-advent strong{display:block;color:#fff;font-weight:600}',
    '.edition-advent span{display:block;color:var(--muted)}',
    '.edition-advent a{display:block;margin-top:2px;color:#ffd43b;font-weight:600;text-decoration:none;pointer-events:auto}',
    '.edition-advent a:hover,.edition-advent a:focus-visible{text-decoration:underline}',
    '.edition-flamme{transform-box:fill-box;transform-origin:50% 100%;animation:edition-flackern 1.3s ease-in-out infinite}',
    '@keyframes edition-flackern{0%,100%{transform:scale(1,1)}35%{transform:scale(.9,1.12)}70%{transform:scale(1.06,.94)}}',
    '@media (max-width:480px){.edition-advent{left:8px;bottom:56px;font-size:.72rem}}',
    '@media print{.edition-deko{display:none!important}body.edition-mit-schneehaufen{padding-bottom:0}body.edition-mit-lichterkette{padding-top:0}}'
  ].join('\n');

  function zweistellig(zahl) { return (zahl < 10 ? '0' : '') + zahl; }

  /* Heutiges Datum nach deutscher Zeit, wie in site.js. Zum Ausprobieren gilt ?overlaydatum=2026-12-13 aus der Adresse. */
  function heuteDeutsch() {
    var treffer = null;
    var teile = { jahr: 0, monat: 0, tag: 0 };
    try { treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(location.search).get('overlaydatum') || ''); } catch (fehler) { treffer = null; }
    if (treffer) { return { jahr: Number(treffer[1]), monat: Number(treffer[2]), tag: Number(treffer[3]) }; }
    try {
      new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date()).forEach(function (teil) {
          if (teil.type === 'year') { teile.jahr = Number(teil.value); }
          if (teil.type === 'month') { teile.monat = Number(teil.value); }
          if (teil.type === 'day') { teile.tag = Number(teil.value); }
        });
    } catch (fehler) { /* unten der Ersatz */ }
    if (!teile.jahr) {
      var jetzt = new Date();
      teile = { jahr: jetzt.getFullYear(), monat: jetzt.getMonth() + 1, tag: jetzt.getDate() };
    }
    return teile;
  }

  function tagesNummer(jahr, monat, tag) { return Date.UTC(jahr, monat - 1, tag) / 86400000; }

  /* Wie viele Tage bis Heiligabend, und der wievielte Advent ist gerade (0 = noch keiner)? Der vierte Advent ist der Sonntag
     vor dem 25. Dezember (am 24.12. selbst, wenn das ein Sonntag ist). */
  function adventsStand(heute) {
    if (heute.monat < 11) { return null; }
    var heiligabend = tagesNummer(heute.jahr, 12, 24);
    var vierter = heiligabend - new Date(Date.UTC(heute.jahr, 11, 24)).getUTCDay();
    var erster = vierter - 21;
    var nummer = tagesNummer(heute.jahr, heute.monat, heute.tag);
    var ersterTag = new Date(erster * 86400000);
    return {
      bis: heiligabend - nummer,
      advent: nummer < erster ? 0 : Math.min(4, 1 + Math.floor((nummer - erster) / 7)),
      ersterTag: ersterTag.getUTCDate(),
      ersterMonat: ersterTag.getUTCMonth() + 1
    };
  }

  function adventsText(stand) {
    if (!stand || stand.bis < -2) { return null; }
    if (stand.bis === 0) { return { oben: 'Heiligabend', unten: 'Frohe Weihnachten!', flammen: 4 }; }
    if (stand.bis < 0) { return { oben: 'Frohe Weihnachten!', unten: 'Schöne Feiertage!', flammen: 4 }; }
    return {
      oben: stand.advent ? stand.advent + '. Advent' : '1. Advent am ' + zweistellig(stand.ersterTag) + '.' + zweistellig(stand.ersterMonat) + '.',
      unten: 'Noch ' + stand.bis + (stand.bis === 1 ? ' Tag' : ' Tage') + ' bis Weihnachten',
      flammen: stand.advent
    };
  }

  function kranzSvg(flammen) {
    var kerzen = [[12, 31], [24, 28.5], [40, 28.5], [52, 31]]; /* Mitte und Fuß jeder Kerze */
    var beeren = [[14, 41], [23, 44], [32, 45.4], [41, 44], [50, 41]];
    var s = '<svg viewBox="0 0 64 50" aria-hidden="true" focusable="false">';
    var i;
    s += '<ellipse cx="32" cy="35" rx="26" ry="8.5" fill="none" stroke="#1b6a30" stroke-width="7.5"/>';
    for (i = 0; i < kerzen.length; i++) {
      var kx = kerzen[i][0];
      var fuss = kerzen[i][1];
      s += '<rect x="' + (kx - 2.6) + '" y="' + (fuss - 16) + '" width="5.2" height="16" rx="1" fill="#e03131"/>';
      s += '<rect x="' + (kx - 2.6) + '" y="' + (fuss - 16) + '" width="1.7" height="16" fill="rgba(255,255,255,0.35)"/>';
      if (i < flammen) {
        s += '<circle cx="' + kx + '" cy="' + (fuss - 21) + '" r="6" fill="rgba(255,190,80,0.22)"/>';
        s += '<g class="edition-flamme"><path d="M' + kx + ' ' + (fuss - 24) + 'C' + (kx + 3.2) + ' ' + (fuss - 20) + ' ' + (kx + 2.8) + ' ' + (fuss - 17.4) + ' ' + kx + ' ' + (fuss - 16.4) +
          'C' + (kx - 2.8) + ' ' + (fuss - 17.4) + ' ' + (kx - 3.2) + ' ' + (fuss - 20) + ' ' + kx + ' ' + (fuss - 24) + 'Z" fill="#ffb84d"/>' +
          '<ellipse cx="' + kx + '" cy="' + (fuss - 19) + '" rx="1.1" ry="2" fill="#fff1b8"/></g>';
      } else {
        s += '<rect x="' + (kx - 0.4) + '" y="' + (fuss - 18.6) + '" width="0.8" height="2.6" fill="#40403f"/>';
      }
    }
    s += '<path d="M6 35A26 8.5 0 0 0 58 35" fill="none" stroke="#2f8f46" stroke-width="6.5"/>';
    s += '<path d="M10.5 36A21.5 6 0 0 0 53.5 36" fill="none" stroke="#52c46d" stroke-width="1.6"/>';
    for (i = 0; i < beeren.length; i++) { s += '<circle cx="' + beeren[i][0] + '" cy="' + beeren[i][1] + '" r="1.7" fill="#e03131"/>'; }
    s += '<path d="M32 43.6L24 39.6L24 47.6ZM32 43.6L40 39.6L40 47.6Z" fill="#e03131"/><circle cx="32" cy="43.6" r="2.4" fill="#b81d1d"/>';
    return s + '</svg>';
  }

  var MUETZE_SVG = '<svg viewBox="0 0 40 34" aria-hidden="true" focusable="false">' +
    '<path d="M5 28C5 15 11 6 28 4.5C32 12 34 20 35 28Z" fill="#e03131"/>' +
    '<path d="M7 26C7.6 16 12 9 26 6.2" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" stroke-linecap="round"/>' +
    '<rect x="2" y="24" width="36" height="9" rx="4.5" fill="#f8f9fa"/>' +
    '<circle cx="30" cy="5" r="4.6" fill="#f8f9fa"/></svg>';

  var LICHT_FARBEN = [[255, 92, 92], [255, 212, 59], [105, 219, 124], [77, 171, 247], [247, 131, 172], [255, 146, 43]];

  /* Bunte Lämpchen an einem durchhängenden Kabel ganz oben auf der Seite (scrollt mit). Sie funkeln langsam. Über der roten
     Leiste bleibt dafür ein schmaler Streifen frei, damit kein Text verdeckt wird. */
  function lichterketteDeko() {
    var hoehe = 34;
    var flaeche = document.createElement('canvas');
    var ctx;
    var glanz;
    var birnen;
    var bogen = [];
    var lichter = [];
    var breite = 0;
    var uhr = 0;
    var seit = 1;
    flaeche.className = 'edition-deko edition-lichterkette';
    flaeche.setAttribute('aria-hidden', 'true');
    document.body.appendChild(flaeche);
    ctx = flaeche.getContext('2d');
    if (!ctx) {
      document.body.removeChild(flaeche);
      return null;
    }
    document.body.classList.add('edition-mit-lichterkette');
    glanz = LICHT_FARBEN.map(function (f) {
      return spriteBauen(26, 26, function (x) {
        var v = x.createRadialGradient(13, 13, 0, 13, 13, 13);
        v.addColorStop(0, 'rgba(' + f.join(',') + ',0.9)');
        v.addColorStop(0.4, 'rgba(' + f.join(',') + ',0.35)');
        v.addColorStop(1, 'rgba(' + f.join(',') + ',0)');
        x.fillStyle = v;
        x.fillRect(0, 0, 26, 26);
      });
    });
    birnen = LICHT_FARBEN.map(function (f) {
      return spriteBauen(8, 13, function (x) {
        var v = x.createRadialGradient(3.1, 6.2, 0.4, 4, 7.9, 4.6);
        v.addColorStop(0, 'rgba(255,255,255,0.95)');
        v.addColorStop(0.45, 'rgb(' + f.join(',') + ')');
        v.addColorStop(1, 'rgb(' + f.map(function (c) { return Math.round(c * 0.6); }).join(',') + ')');
        x.fillStyle = '#4a5f4a';
        x.fillRect(2.5, 0, 3, 3.6);
        x.fillStyle = v;
        x.beginPath();
        x.ellipse(4, 7.9, 3.2, 4.6, 0, 0, ZWEI_PI);
        x.fill();
      });
    });

    function aufbauen() {
      var n = Math.max(3, Math.round(breite / 190));
      for (var i = 0; i < n; i++) {
        var x0 = i * breite / n;
        var x1 = (i + 1) * breite / n;
        var haengt = Math.min(8, 0.045 * (x1 - x0) + 2);
        var anzahl = Math.max(3, Math.round((x1 - x0) / 27));
        bogen.push([x0, x1, haengt]);
        for (var k = 1; k < anzahl; k++) {
          var t = k / anzahl;
          lichter.push({
            x: x0 + (x1 - x0) * t,
            y: -1 + 4 * haengt * t * (1 - t),
            farbe: lichter.length % LICHT_FARBEN.length,
            phase: zufall(0, 6.28),
            tempo: zufall(1.1, 2.6),
            winkel: zufall(-0.12, 0.12)
          });
        }
      }
    }

    function zeichnen(zeit) {
      var i;
      ctx.clearRect(0, 0, breite, hoehe);
      ctx.strokeStyle = 'rgba(54,132,80,0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (i = 0; i < bogen.length; i++) {
        ctx.moveTo(bogen[i][0], -1);
        ctx.quadraticCurveTo((bogen[i][0] + bogen[i][1]) / 2, -1 + 2 * bogen[i][2], bogen[i][1], -1);
      }
      ctx.stroke();
      for (i = 0; i < lichter.length; i++) {
        var l = lichter[i];
        var h = 0.5 + 0.5 * Math.sin(zeit * l.tempo + l.phase);
        h = h * h * (3 - 2 * h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.12 + 0.6 * h;
        ctx.drawImage(glanz[l.farbe], l.x - 13, l.y + 7 - 13, 26, 26);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.55 + 0.45 * h;
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.winkel);
        ctx.drawImage(birnen[l.farbe], -4, 0, 8, 13);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    return {
      anpassen: function () {
        breite = document.documentElement.clientWidth || window.innerWidth;
        flaeche.width = Math.max(1, Math.round(breite * pixelDichte));
        flaeche.height = Math.max(1, Math.round(hoehe * pixelDichte));
        ctx.setTransform(pixelDichte, 0, 0, pixelDichte, 0, 0);
        bogen = [];
        lichter = [];
        aufbauen();
        zeichnen(uhr);
      },
      schritt: function (dt) {
        uhr += dt;
        seit += dt;
        if (seit >= 0.066) {
          seit = 0;
          zeichnen(uhr);
        }
      },
      entfernen: function () {
        document.body.classList.remove('edition-mit-lichterkette');
        if (flaeche.parentNode) { flaeche.parentNode.removeChild(flaeche); }
      }
    };
  }

  function schneehaufenZeichnen(ctx, b, h) {
    var wellen = Math.max(3, b / 260);
    function huegel(basis, hub, phase, oben, unten) {
      var v = ctx.createLinearGradient(0, h - basis - hub, 0, h);
      v.addColorStop(0, oben);
      v.addColorStop(1, unten);
      ctx.fillStyle = v;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (var px = 0; px <= b + 4; px += 4) {
        var winkel = px / b * wellen * ZWEI_PI;
        ctx.lineTo(px, h - basis - hub * (0.6 * Math.sin(winkel + phase) + 0.4 * Math.sin(winkel * 2.3 + phase * 1.7)));
      }
      ctx.lineTo(b + 4, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.clearRect(0, 0, b, h);
    huegel(h * 0.42, h * 0.16, 1.3, 'rgba(204,221,244,0.72)', 'rgba(168,194,230,0.88)');
    huegel(h * 0.26, h * 0.15, 4.1, 'rgba(255,255,255,0.96)', 'rgba(222,233,248,0.98)');
  }

  /* Ein Streifen aus Schneehügeln am unteren Bildrand. Die Seite bekommt unten etwas Platz, damit nichts verdeckt wird. */
  function schneehaufenDeko() {
    var flaeche = document.createElement('canvas');
    var ctx;
    flaeche.className = 'edition-deko edition-schneehaufen';
    flaeche.setAttribute('aria-hidden', 'true');
    document.body.appendChild(flaeche);
    ctx = flaeche.getContext('2d');
    if (!ctx) {
      document.body.removeChild(flaeche);
      return null;
    }
    document.body.classList.add('edition-mit-schneehaufen');
    return {
      anpassen: function () {
        var b = document.documentElement.clientWidth || window.innerWidth;
        var h = b < 600 ? 38 : 48;
        flaeche.style.height = h + 'px';
        flaeche.width = Math.max(1, Math.round(b * pixelDichte));
        flaeche.height = Math.max(1, Math.round(h * pixelDichte));
        ctx.setTransform(pixelDichte, 0, 0, pixelDichte, 0, 0);
        schneehaufenZeichnen(ctx, b, h);
      },
      entfernen: function () {
        document.body.classList.remove('edition-mit-schneehaufen');
        if (flaeche.parentNode) { flaeche.parentNode.removeChild(flaeche); }
      }
    };
  }

  /* Eine Weihnachtsmütze auf dem Logo in der Kopfzeile. */
  function muetzeDeko() {
    var marke = document.querySelector('.site-header .brand');
    var huetchen;
    if (!marke) { return null; }
    huetchen = document.createElement('span');
    huetchen.className = 'edition-deko edition-muetze';
    huetchen.setAttribute('aria-hidden', 'true');
    huetchen.innerHTML = MUETZE_SVG;
    marke.classList.add('edition-muetze-halter');
    marke.appendChild(huetchen);
    return {
      entfernen: function () {
        marke.classList.remove('edition-muetze-halter');
        if (huetchen.parentNode) { huetchen.parentNode.removeChild(huetchen); }
      }
    };
  }

  /* Ab dem 1. Dezember führt ein Link zum Adventskalender, aber nur, wenn er in der Verwaltung eingeschaltet ist. */
  function kalenderLinkAnhaengen(kasten) {
    var heute = heuteDeutsch();
    var vorschau = '';
    if (heute.monat !== 12 || typeof fetch !== 'function') { return; }
    try {
      var datum = new URLSearchParams(location.search).get('overlaydatum');
      if (datum && /^\d{4}-\d{2}-\d{2}$/.test(datum)) { vorschau = datum; }
    } catch (fehler) { vorschau = ''; }
    fetch('adventskalender.json', { cache: 'no-cache' }).then(function (antwort) {
      if (!antwort.ok) { throw new Error('adventskalender.json: ' + antwort.status); }
      return antwort.json();
    }).then(function (daten) {
      var text = kasten.querySelector('div');
      var link;
      if (!daten || daten.an !== true || !kasten.parentNode || !text) { return; }
      link = document.createElement('a');
      /* Das Vorschau-Datum geht nur mit, wenn der Betreiber die Vorschau des Kalenders ausdrücklich erlaubt hat. */
      link.href = 'adventskalender.html' + (daten.vorschau_erlaubt === true && vorschau ? '?vorschaudatum=' + vorschau : '');
      link.textContent = 'Zum Adventskalender →';
      text.appendChild(link);
    }).catch(function () { /* ohne Link */ });
  }

  /* Kleiner Kasten unten links: Adventskranz mit so vielen brennenden Kerzen wie Adventssonntage vorbei sind, dazu der Countdown. */
  function adventDeko() {
    var zeilen = adventsText(adventsStand(heuteDeutsch()));
    var kasten;
    if (!zeilen) { return null; }
    kasten = document.createElement('div');
    kasten.className = 'edition-deko edition-advent';
    kasten.innerHTML = kranzSvg(zeilen.flammen) + '<div><strong></strong><span></span></div>';
    kasten.querySelector('strong').textContent = zeilen.oben;
    kasten.querySelector('span').textContent = zeilen.unten;
    document.body.appendChild(kasten);
    kalenderLinkAnhaengen(kasten);
    return { entfernen: function () { if (kasten.parentNode) { kasten.parentNode.removeChild(kasten); } } };
  }

  var DEKO_ARTEN = { lichterkette: lichterketteDeko, schneehaufen: schneehaufenDeko, muetze: muetzeDeko, advent: adventDeko };
  var DEKO_FUER = { weihnachten: ['lichterkette', 'schneehaufen', 'muetze', 'advent'], nikolaus: ['muetze'] };

  function dekoErzeugen(effektName) {
    var namen = DEKO_FUER[effektName] || [];
    var teile = [];
    var gewaehlt = [];
    var stil = null;
    if (namen.length) {
      stil = document.createElement('style');
      stil.setAttribute('data-edition-deko', '');
      stil.textContent = DEKO_STIL;
      document.head.appendChild(stil);
    }
    namen.forEach(function (name) {
      try {
        var teil = DEKO_ARTEN[name]();
        if (teil) {
          teile.push(teil);
          gewaehlt.push(name);
        }
      } catch (fehler) { /* ohne diesen Schmuck weiter */ }
    });
    return {
      namen: gewaehlt,
      anpassen: function () { teile.forEach(function (t) { if (t.anpassen) { t.anpassen(); } }); },
      schritt: function (dt) { teile.forEach(function (t) { if (t.schritt) { t.schritt(dt); } }); },
      entfernen: function () {
        teile.forEach(function (t) { t.entfernen(); });
        if (stil && stil.parentNode) { stil.parentNode.removeChild(stil); }
      }
    };
  }

  /* ---------- Start und Ende ---------- */

  function stoppen() {
    if (laufend) {
      laufend.stoppen();
      laufend = null;
    }
  }

  function starten(optionen) {
    stoppen();
    var name = optionen && typeof optionen.effekt === 'string' ? optionen.effekt : '';
    if (!Object.prototype.hasOwnProperty.call(EFFEKTE, name)) { return null; }
    if (wenigBewegung() || !document.body) { return null; }

    pixelDichte = Math.min(window.devicePixelRatio || 1, 2);
    var umgebung = { breite: 0, hoehe: 0, staerke: STAERKE[optionen.staerke] || 1 };

    var flaeche = document.createElement('canvas');
    flaeche.className = 'overlay-leinwand';
    flaeche.setAttribute('aria-hidden', 'true');
    flaeche.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:90;';
    document.body.appendChild(flaeche);
    var ctx = flaeche.getContext('2d');
    if (!ctx) { document.body.removeChild(flaeche); return null; }

    var effekt = EFFEKTE[name](umgebung);
    var deko = dekoErzeugen(name);
    var letzte = 0;
    var bild = 0;
    var beendet = false;
    var messung = { bilder: 0, summe: 0 };

    function anpassen() {
      umgebung.breite = flaeche.clientWidth || window.innerWidth;
      umgebung.hoehe = flaeche.clientHeight || window.innerHeight;
      flaeche.width = Math.max(1, Math.round(umgebung.breite * pixelDichte));
      flaeche.height = Math.max(1, Math.round(umgebung.hoehe * pixelDichte));
      ctx.setTransform(pixelDichte, 0, 0, pixelDichte, 0, 0);
      effekt.groesse();
      deko.anpassen();
    }

    function takt(zeitpunkt) {
      if (beendet) { return; }
      bild = window.requestAnimationFrame(takt);
      if (!letzte) { letzte = zeitpunkt; return; }
      var dt = (zeitpunkt - letzte) / 1000;
      if (dt < TAKT * 0.9) { return; }
      letzte = zeitpunkt;
      dt = Math.min(dt, 0.05);
      var t0 = jetzt();
      zeigerAbklingen(dt);
      effekt.schritt(dt);
      deko.schritt(dt);
      if (!effekt.ohneLoeschen) { ctx.clearRect(0, 0, umgebung.breite, umgebung.hoehe); }
      ctx.globalAlpha = 1;
      effekt.zeichnen(ctx);
      messung.bilder += 1;
      messung.summe += jetzt() - t0;
    }

    function sichtbarkeit() {
      if (document.hidden) {
        window.cancelAnimationFrame(bild);
        letzte = 0;
      } else if (!beendet) {
        window.cancelAnimationFrame(bild);
        letzte = 0;
        bild = window.requestAnimationFrame(takt);
      }
    }

    anpassen();
    window.addEventListener('resize', anpassen);
    window.addEventListener('pointermove', zeigerBewegt, { passive: true });
    window.addEventListener('pointerup', zeigerFinger, { passive: true });
    window.addEventListener('pointercancel', zeigerFinger, { passive: true });
    window.addEventListener('mouseout', zeigerFenster, { passive: true });
    window.addEventListener('blur', zeigerWeg);
    document.addEventListener('visibilitychange', sichtbarkeit);
    bild = window.requestAnimationFrame(takt);

    laufend = {
      effekt: name,
      deko: deko.namen,
      innen: effekt,
      teile: function () { return effekt.teile ? effekt.teile() : []; },
      zeiger: zeiger,
      messung: function () { return { bilder: messung.bilder, msProBild: messung.bilder ? messung.summe / messung.bilder : 0 }; },
      stoppen: function () {
        beendet = true;
        window.cancelAnimationFrame(bild);
        window.removeEventListener('resize', anpassen);
        window.removeEventListener('pointermove', zeigerBewegt);
        window.removeEventListener('pointerup', zeigerFinger);
        window.removeEventListener('pointercancel', zeigerFinger);
        window.removeEventListener('mouseout', zeigerFenster);
        window.removeEventListener('blur', zeigerWeg);
        document.removeEventListener('visibilitychange', sichtbarkeit);
        if (flaeche.parentNode) { flaeche.parentNode.removeChild(flaeche); }
        deko.entfernen();
        zeigerWeg();
      }
    };
    return laufend;
  }

  window.frankfurtOverlay = {
    start: function (optionen) { return starten(optionen); },
    stop: stoppen,
    effekte: Object.keys(EFFEKTE),
    laufend: function () { return laufend; }
  };
})();
