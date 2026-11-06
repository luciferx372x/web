/* Frankfurt RP – Overlays: Schnee, Konfetti, Feuerwerk und mehr.
   Dieses Skript wird von site.js nachgeladen, wenn laut overlays.json (Verwaltung unter Website, Overlays) heute ein
   Overlay gilt, oder wenn die Adresse ?overlay=NAME enthält (Vorschau, zum Beispiel ?overlay=schnee).
   - Es werden keine Bilder und keine fremden Dienste geladen. Alles wird auf einer durchsichtigen Fläche gezeichnet.
   - Die Fläche fängt keine Klicks ab (pointer-events: none) und wird nicht gedruckt.
   - Ist im Betriebssystem "weniger Bewegung" eingestellt, wird nichts gezeigt.
   - Bewegst du die Maus über die Seite, werden die Teilchen leicht weggeschubst (je schneller die Maus, desto stärker). */
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

  /* ---------- Effekt "fallende Teilchen": Schnee, Konfetti, Laub, Herzen, Ostern, Halloween ---------- */

  function fallEffekt(konfig) {
    return function (umgebung) {
      var sprites = konfig.sprites();
      var teile = [];

      function anzahlBerechnen() {
        var flaeche = begrenzen((umgebung.breite * umgebung.hoehe) / (1600 * 900), 0.45, 1.6);
        return Math.max(6, Math.round(konfig.anzahl * flaeche * umgebung.staerke));
      }

      function neuesTeil(teil, anfang) {
        teil.sx = 0;
        teil.sy = 0;
        teil.flip = zufall(0, 6.28);
        teil.flipV = 0;
        teil.wellenY = 0;
        teil.spiegeln = 1;
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
            p.rot += p.rotV * dt;
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

  /* Mehrere Effekte übereinander, zum Beispiel Schnee und Sterne. */
  function kombi(fabriken) {
    return function (umgebung) {
      var teile = fabriken.map(function (fabrik) { return fabrik(umgebung); });
      return {
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
    sterne: sterneEffekt(28),
    weihnachten: kombi([fallEffekt(schneeKonfig(72)), sterneEffekt(16)]),
    konfetti: fallEffekt(konfettiKonfig),
    feuerwerk: feuerwerkEffekt,
    laub: fallEffekt(laubKonfig),
    halloween: fallEffekt(halloweenKonfig),
    herzen: fallEffekt(herzenKonfig),
    ostern: fallEffekt(osternKonfig)
  };

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
