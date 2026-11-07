/* Frankfurt RP – Server-Status (server-status.html).
   Liest serverstatus.json (Verwaltung unter Website, Server-Status) und holt die Werte des Spielservers bei unserem Statusdienst (Cloudflare),
   sobald die Seite offen ist, danach etwa jede Minute, solange die Seite sichtbar ist. Es wird nichts gespeichert und kein Cookie gesetzt.

   Schutz:
   - Alles, was der Statusdienst liefert, wird nur als Text eingesetzt, nie als HTML.
   - Der Link zum Verbinden wird nur übernommen, wenn er genau so aussieht: https://cfx.re/join/CODE.
   - Die Adresse des Statusdienstes muss auf .workers.dev enden (nur beim Testen auf dem eigenen Rechner auch http://127.0.0.1:PORT).
     Zusätzlich erlaubt die Sicherheitsregel in server-status.html Verbindungen nur zu den workers.dev-Adressen unseres Kontos.
   - Ist die Seite in der Verwaltung ausgeschaltet oder die Adresse leer, wird nichts abgerufen. */
(function () {
  'use strict';

  var karte = document.getElementById('status-karte');
  var meldung = document.getElementById('status-meldung');
  var einleitung = document.getElementById('status-text');
  var ueberschrift = document.getElementById('status-titel');
  if (!karte || !meldung || !einleitung) { return; }

  var el = {
    name: document.getElementById('status-name'),
    pille: document.getElementById('status-pille'),
    pilleText: document.getElementById('status-pille-text'),
    beschreibung: document.getElementById('status-beschreibung'),
    spieler: document.getElementById('status-spieler'),
    fuellung: document.getElementById('status-fuellung'),
    neustart: document.getElementById('status-neustart'),
    laufzeit: document.getElementById('status-laufzeit'),
    weitere: document.getElementById('status-weitere'),
    verbinden: document.getElementById('status-verbinden'),
    befehl: document.getElementById('status-befehl'),
    kopieren: document.getElementById('status-kopieren'),
    link: document.getElementById('status-link'),
    rueckmeldung: document.getElementById('status-rueckmeldung'),
    fuss: document.getElementById('status-fuss'),
    aktualisieren: document.getElementById('status-aktualisieren'),
    vorlesen: document.getElementById('status-vorlesen')
  };

  var ZUSTAENDE = ['online', 'offline', 'eingeschraenkt', 'unbekannt'];
  var NAMEN = { online: 'Online', offline: 'Offline', eingeschraenkt: 'Eingeschränkt', unbekannt: 'Status unbekannt' };
  var lokal = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);

  var adresse = '';
  var intervall = 60;
  var timer = null;
  var takt = null;
  var laeuft = false;
  var letzterAbruf = 0;
  var letzterFehler = false;
  var letzte = null; /* { daten, empfangen } */
  var letzteVorlesung = '';
  var kopierTimer = null;

  function jetzt() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }

  function text(wert, max) {
    return typeof wert === 'string' ? wert.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }

  function zahl(wert) {
    var n = Number(wert);
    return typeof wert === 'number' && isFinite(n) && n >= 0 && n <= 100000 ? Math.floor(n) : null;
  }

  /* Nur https://cfx.re/join/CODE, nichts anderes. */
  function verbindungsLink(wert) {
    return typeof wert === 'string' && /^https:\/\/cfx\.re\/join\/[A-Za-z0-9]{3,16}$/.test(wert) ? wert : '';
  }

  function adresseSauber(wert) {
    var a = text(wert, 200).replace(/\/+$/, '');
    if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/i.test(a)) { return a; }
    if (lokal && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(a)) { return a; }
    return '';
  }

  function vorZeit(sekunden) {
    if (sekunden < 45) { return 'wenigen Sekunden'; }
    if (sekunden < 3600) { return Math.max(1, Math.round(sekunden / 60)) + ' Min.'; }
    return Math.floor(sekunden / 3600) + ' Std. ' + Math.floor((sekunden % 3600) / 60) + ' Min.';
  }

  function leeren(knoten) { while (knoten.firstChild) { knoten.removeChild(knoten.firstChild); } }

  function weitereZeigen(liste) {
    var eintraege = Array.isArray(liste) ? liste.slice(0, 6) : [];
    var sichtbar = 0;
    leeren(el.weitere);
    eintraege.forEach(function (eintrag) {
      var name = eintrag && typeof eintrag === 'object' ? text(eintrag.name, 40) : '';
      var wert = eintrag && typeof eintrag === 'object' ? text(eintrag.wert, 160) : '';
      var feld;
      var dt;
      var dd;
      if (!name || !wert) { return; }
      feld = document.createElement('div');
      dt = document.createElement('dt');
      dd = document.createElement('dd');
      feld.className = 'status-feld';
      dt.textContent = name;
      dd.textContent = wert;
      feld.appendChild(dt);
      feld.appendChild(dd);
      el.weitere.appendChild(feld);
      sichtbar += 1;
    });
    el.weitere.hidden = sichtbar === 0;
  }

  /* Setzt alles aus dem zuletzt empfangenen Stand zusammen. abrufFehler: Der letzte Abruf ist fehlgeschlagen. */
  function darstellen() {
    var daten = letzte ? letzte.daten : null;
    var alter = daten ? Math.max(0, (zahl(daten.alterSekunden) || 0) + Math.floor((jetzt() - letzte.empfangen) / 1000)) : 0;
    var veraltet = !!daten && (daten.veraltet === true || alter > 300);
    var zustand = 'laden';
    var spieler = null;
    var verbinden = daten && daten.verbinden && typeof daten.verbinden === 'object' ? daten.verbinden : null;
    var befehl = verbinden ? text(verbinden.befehl, 120) : '';
    var link = verbinden ? verbindungsLink(verbinden.link) : '';
    var vorlesen;
    var anteil = 0;

    if (!daten) {
      zustand = letzterFehler ? 'unbekannt' : 'laden';
    } else if (veraltet) {
      zustand = 'unbekannt';
    } else {
      zustand = ZUSTAENDE.indexOf(daten.status) >= 0 ? daten.status : 'unbekannt';
      spieler = daten.spieler && typeof daten.spieler === 'object' && zahl(daten.spieler.aktuell) !== null && zahl(daten.spieler.max) !== null ? { aktuell: zahl(daten.spieler.aktuell), max: zahl(daten.spieler.max) } : null;
    }

    el.pille.setAttribute('data-zustand', zustand);
    el.pilleText.textContent = !daten && !letzterFehler ? 'Wird geladen …' : (!daten ? 'Nicht abrufbar' : NAMEN[zustand]);
    el.name.textContent = (daten && text(daten.titel, 80)) || 'Frankfurt RP';
    el.beschreibung.textContent = daten ? text(daten.beschreibung, 200) : '';

    el.spieler.textContent = spieler ? spieler.aktuell + ' / ' + spieler.max : '–';
    if (spieler && spieler.max > 0) { anteil = Math.min(100, Math.round(spieler.aktuell / spieler.max * 100)); }
    el.fuellung.style.width = anteil + '%';
    el.neustart.textContent = daten && !veraltet && text(daten.neustart, 160) ? text(daten.neustart, 160) : '–';
    el.laufzeit.textContent = daten && !veraltet && text(daten.laufzeit, 160) ? text(daten.laufzeit, 160) : '–';
    weitereZeigen(daten && !veraltet ? daten.weitere : []);

    el.befehl.textContent = befehl;
    el.verbinden.hidden = !befehl;
    if (link) {
      el.link.href = link;
      el.link.hidden = false;
    } else {
      el.link.removeAttribute('href');
      el.link.hidden = true;
    }

    if (!daten) {
      el.fuss.textContent = letzterFehler ? 'Der Status kann gerade nicht abgerufen werden. Es wird automatisch erneut versucht.' : 'Der Status wird geholt …';
    } else if (veraltet) {
      el.fuss.textContent = 'Die letzte Meldung des Servers ist ' + (alter < 120 ? 'etwa eine Minute' : vorZeit(alter)) + ' alt. Möglicherweise ist der Server gerade nicht erreichbar.';
    } else if (letzterFehler) {
      el.fuss.textContent = 'Der Status konnte gerade nicht aktualisiert werden. Letzter Stand von vor ' + vorZeit(alter) + '. Es wird automatisch erneut versucht.';
    } else {
      el.fuss.textContent = alter < 45 ? 'Gerade aktualisiert. Die Anzeige erneuert sich automatisch.' : 'Zuletzt aktualisiert vor ' + vorZeit(alter) + '. Die Anzeige erneuert sich automatisch.';
    }
    karte.classList.toggle('status-dunkel', !!daten && (veraltet || letzterFehler));
    karte.setAttribute('aria-busy', !daten && !letzterFehler ? 'true' : 'false');

    vorlesen = !daten ? (letzterFehler ? 'Der Status kann gerade nicht abgerufen werden.' : '') : NAMEN[zustand] + (spieler ? ', ' + spieler.aktuell + ' von ' + spieler.max + ' Spielern' : '');
    if (vorlesen !== letzteVorlesung) {
      letzteVorlesung = vorlesen;
      el.vorlesen.textContent = vorlesen;
    }
  }

  function planen() {
    clearTimeout(timer);
    timer = null;
    if (document.hidden) { return; }
    timer = setTimeout(abrufen, intervall * 1000);
  }

  function abrufen() {
    var abbruch;
    var frist;
    var optionen;
    if (laeuft) { return; }
    laeuft = true;
    letzterAbruf = jetzt();
    abbruch = typeof AbortController === 'function' ? new AbortController() : null;
    frist = setTimeout(function () { if (abbruch) { abbruch.abort(); } }, 10000);
    optionen = { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } };
    if (abbruch) { optionen.signal = abbruch.signal; }
    fetch(adresse + '/status', optionen).then(function (antwort) {
      return antwort.json().then(function (daten) { return { ok: antwort.ok, daten: daten }; });
    }).then(function (ergebnis) {
      var gut = !!ergebnis.ok && !!ergebnis.daten && typeof ergebnis.daten === 'object' && ergebnis.daten.ok === true;
      if (gut) { letzte = { daten: ergebnis.daten, empfangen: jetzt() }; }
      return gut;
    }).catch(function () {
      return false;
    }).then(function (gut) {
      clearTimeout(frist);
      laeuft = false;
      letzterFehler = !gut;
      darstellen();
      planen();
    });
  }

  /* ---------- Befehl kopieren ---------- */

  function kopiert(erfolg) {
    el.rueckmeldung.textContent = erfolg ? 'Kopiert. Jetzt im Spiel F8 drücken und einfügen.' : 'Kopieren hat nicht geklappt. Bitte den Befehl markieren und mit Strg+C kopieren.';
    clearTimeout(kopierTimer);
    kopierTimer = setTimeout(function () { el.rueckmeldung.textContent = ''; }, 4000);
  }

  function ersatzKopieren(wert) {
    var feld = document.createElement('textarea');
    var erfolg = false;
    feld.value = wert;
    feld.setAttribute('readonly', '');
    feld.style.position = 'fixed';
    feld.style.left = '-9999px';
    document.body.appendChild(feld);
    feld.select();
    try { erfolg = document.execCommand('copy'); } catch (fehler) { erfolg = false; }
    document.body.removeChild(feld);
    kopiert(erfolg);
  }

  el.kopieren.addEventListener('click', function () {
    var wert = el.befehl.textContent;
    if (!wert) { return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(wert).then(function () { kopiert(true); }, function () { ersatzKopieren(wert); });
    } else {
      ersatzKopieren(wert);
    }
  });

  el.aktualisieren.addEventListener('click', function () {
    if (laeuft) { return; }
    el.aktualisieren.disabled = true;
    setTimeout(function () { el.aktualisieren.disabled = false; }, 5000);
    clearTimeout(timer);
    abrufen();
  });

  document.addEventListener('visibilitychange', function () {
    if (!adresse) { return; }
    if (document.hidden) {
      clearTimeout(timer);
      timer = null;
      return;
    }
    if (!letzte || jetzt() - letzterAbruf > 20000) {
      clearTimeout(timer);
      abrufen();
    } else {
      darstellen();
      planen();
    }
  });

  /* ---------- Start ---------- */

  function starten(daten) {
    var gewuenscht;
    if (!daten || typeof daten !== 'object' || daten.an !== true) {
      meldung.textContent = 'Der Server-Status ist noch nicht freigeschaltet. Schau bald wieder vorbei!';
      return;
    }
    if (text(daten.titel, 80)) {
      ueberschrift.textContent = text(daten.titel, 80);
      document.title = text(daten.titel, 80) + ' – Frankfurt RP';
    }
    einleitung.textContent = text(daten.einleitung, 600);
    adresse = adresseSauber(daten.adresse);
    if (!adresse) {
      meldung.textContent = text(daten.adresse, 10) ? 'Die Adresse des Statusdienstes ist ungültig. Bitte in der Verwaltung prüfen.' : 'Der Server-Status ist noch nicht eingerichtet.';
      return;
    }
    gewuenscht = zahl(daten.intervall);
    intervall = gewuenscht ? Math.min(300, Math.max(lokal ? 1 : 30, gewuenscht)) : 60;
    karte.hidden = false;
    darstellen();
    abrufen();
    takt = setInterval(function () { if (!document.hidden) { darstellen(); } }, 15000);
  }

  fetch('serverstatus.json', { cache: 'no-store' }).then(function (antwort) {
    if (!antwort.ok) { throw new Error('serverstatus.json: ' + antwort.status); }
    return antwort.json();
  }).then(starten).catch(function () {
    meldung.textContent = 'Der Server-Status ist gerade nicht erreichbar. Bitte versuche es später noch einmal.';
  });
})();
