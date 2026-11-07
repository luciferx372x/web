/* Frankfurt RP – Adventskalender (adventskalender.html).
   Liest adventskalender.json (Verwaltung unter Website, Adventskalender). Jedes Türchen öffnet sich an seinem Tag im Dezember
   (nach deutscher Zeit). Es wird nichts gespeichert, kein Cookie gesetzt und nichts an andere Dienste gesendet.

   Schutz gegen Tricks:
   - Die Uhrzeit kommt vom Server (Kopfzeilen Date und Age der Antwort), nicht von der Uhr im Rechner des Besuchers.
     Wer die Uhr am PC umstellt, öffnet damit also keine Türchen früher.
   - Es gibt keinen Vorschau-Trick in der Adresse, außer der Betreiber schaltet in der Verwaltung ausdrücklich "Vorschau erlauben" ein.
   - Gesperrte Türchen bekommen den Inhalt gar nicht erst mitgegeben, auch nicht, wenn jemand in den Entwicklerwerkzeugen
     Klassen oder Attribute ändert.
   Wichtig: Die Datei adventskalender.json selbst ist öffentlich. Was darin steht, kann jeder lesen, auch zu geschlossenen Türchen.
   Wirklich Geheimes gehört deshalb erst am jeweiligen Tag hinein. */
(function () {
  'use strict';

  var liste = document.getElementById('kalender');
  var statusZeile = document.getElementById('kalender-status');
  var einleitung = document.getElementById('kalender-text');
  var ueberschrift = document.getElementById('kalender-titel');
  var fenster = document.getElementById('kalender-fenster');
  if (!liste || !statusZeile || !einleitung || !fenster) { return; }

  var fTag = fenster.querySelector('.kalender-tag');
  var fTitel = fenster.querySelector('h2');
  var fBild = fenster.querySelector('.kalender-bild');
  var fText = fenster.querySelector('.kalender-text');
  var fLink = fenster.querySelector('.kalender-link');
  var fZu = fenster.querySelector('.kalender-schliessen');
  var geoeffnetVon = null;
  var praefix = '';

  function sauber(wert) { return typeof wert === 'string' ? wert.trim() : ''; }

  /* Der Zeitpunkt "jetzt" laut Server (Millisekunden seit 1970). Fehlt die Kopfzeile, gilt notgedrungen die Uhr des Besuchers. */
  function serverMoment(antwort) {
    var datum = antwort.headers.get('Date');
    var alter = Number(antwort.headers.get('Age'));
    var zeit = datum ? Date.parse(datum) : NaN;
    if (isNaN(zeit)) { return Date.now(); }
    return zeit + (isFinite(alter) && alter > 0 ? alter * 1000 : 0);
  }

  /* Datum nach deutscher Zeit aus einem Zeitpunkt. */
  function deutschesDatum(moment) {
    var teile = { jahr: 0, monat: 0, tag: 0 };
    try {
      new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date(moment)).forEach(function (teil) {
          if (teil.type === 'year') { teile.jahr = Number(teil.value); }
          if (teil.type === 'month') { teile.monat = Number(teil.value); }
          if (teil.type === 'day') { teile.tag = Number(teil.value); }
        });
    } catch (fehler) { /* unten der Ersatz */ }
    if (!teile.jahr) {
      var datum = new Date(moment);
      teile = { jahr: datum.getFullYear(), monat: datum.getMonth() + 1, tag: datum.getDate() };
    }
    return teile;
  }

  /* Vorschau: nur wenn der Betreiber sie in der Verwaltung ausdrücklich erlaubt hat, mit ?vorschaudatum=2026-12-13 in der Adresse. */
  function vorschauDatum(daten) {
    var treffer = null;
    if (!daten || daten.vorschau_erlaubt !== true) { return null; }
    try { treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(location.search).get('vorschaudatum') || ''); } catch (fehler) { treffer = null; }
    if (!treffer) { return null; }
    var datum = { jahr: Number(treffer[1]), monat: Number(treffer[2]), tag: Number(treffer[3]) };
    return datum.monat >= 1 && datum.monat <= 12 && datum.tag >= 1 && datum.tag <= 31 ? datum : null;
  }

  function tagesNummer(jahr, monat, tag) { return Date.UTC(jahr, monat - 1, tag) / 86400000; }

  /* Bilder dürfen nur aus dem Ordner bilder kommen (so lädt sie die Verwaltung hoch), nie von fremden Seiten. */
  function bildPfad(wert) {
    var pfad = sauber(wert);
    if (!/^\/?bilder\/[A-Za-z0-9._\-]+\.(png|jpe?g|webp|gif|svg|avif)$/i.test(pfad)) { return ''; }
    return pfad.replace(/^\//, '');
  }

  function httpsLink(wert) {
    var link = sauber(wert);
    return /^https:\/\/[^\s]+$/.test(link) ? link : '';
  }

  function meldung(text) { statusZeile.textContent = praefix + text; }

  function tageText(anzahl) { return anzahl + (anzahl === 1 ? ' Tag' : ' Tage'); }
  function tagenText(anzahl) { return anzahl + (anzahl === 1 ? ' Tag' : ' Tagen'); } /* nach "in" */

  /* ---------- Fenster mit dem Inhalt eines Türchens ---------- */

  function fensterOeffnen(nummer, inhalt, ausloeser) {
    var titel = inhalt ? sauber(inhalt.titel) : '';
    var text = inhalt ? sauber(inhalt.text) : '';
    var bild = inhalt ? bildPfad(inhalt.bild) : '';
    var link = inhalt ? httpsLink(inhalt.link) : '';
    var absaetze = text ? text.split(/\n\s*\n/) : ['Für dieses Türchen gibt es noch keinen Inhalt. Schau morgen wieder vorbei!'];
    fTag.textContent = nummer + '. Dezember';
    fTitel.textContent = titel || 'Türchen ' + nummer;
    if (bild) {
      fBild.src = bild;
      fBild.alt = titel;
      fBild.hidden = false;
    } else {
      fBild.removeAttribute('src');
      fBild.alt = '';
      fBild.hidden = true;
    }
    while (fText.firstChild) { fText.removeChild(fText.firstChild); }
    absaetze.forEach(function (absatz) {
      var p = document.createElement('p');
      p.textContent = absatz.trim();
      fText.appendChild(p);
    });
    if (link) {
      fLink.href = link;
      fLink.textContent = sauber(inhalt.link_text) || 'Mehr erfahren';
      fLink.hidden = false;
    } else {
      fLink.removeAttribute('href');
      fLink.hidden = true;
    }
    geoeffnetVon = ausloeser;
    fenster.hidden = false;
    document.body.classList.add('kalender-offen');
    fZu.focus();
  }

  function fensterSchliessen() {
    fenster.hidden = true;
    document.body.classList.remove('kalender-offen');
    if (geoeffnetVon && typeof geoeffnetVon.focus === 'function') { geoeffnetVon.focus(); }
    geoeffnetVon = null;
  }

  fZu.addEventListener('click', fensterSchliessen);
  fenster.addEventListener('click', function (ereignis) { if (ereignis.target === fenster) { fensterSchliessen(); } });
  document.addEventListener('keydown', function (ereignis) {
    if (fenster.hidden) { return; }
    if (ereignis.key === 'Escape') {
      ereignis.preventDefault();
      fensterSchliessen();
      return;
    }
    if (ereignis.key === 'Tab') {
      /* Der Fokus bleibt im Fenster: zwischen dem Schließen-Knopf und dem Link (falls da). */
      var stellen = [fZu];
      if (!fLink.hidden) { stellen.push(fLink); }
      var aktuell = stellen.indexOf(document.activeElement);
      var naechste = ereignis.shiftKey ? aktuell - 1 : aktuell + 1;
      if (aktuell < 0) { naechste = 0; }
      if (naechste < 0) { naechste = stellen.length - 1; }
      if (naechste >= stellen.length) { naechste = 0; }
      ereignis.preventDefault();
      stellen[naechste].focus();
    }
  });

  /* ---------- Türchen ---------- */

  function gesperrt(nummer, knopf, jahr, nummerHeute) {
    var bis = tagesNummer(jahr, 12, nummer) - nummerHeute;
    meldung('Türchen ' + nummer + ' öffnet sich am ' + nummer + '. Dezember' + (bis > 0 ? ', also in ' + tagenText(bis) : '') + '.');
    knopf.classList.remove('wackeln');
    void knopf.offsetWidth; /* damit das Wackeln auch beim zweiten Klick neu startet */
    knopf.classList.add('wackeln');
  }

  /* Der Inhalt wird nur an offene Türchen weitergegeben. Ein gesperrtes Türchen kennt ihn nicht und kann ihn deshalb auch dann
     nicht zeigen, wenn jemand seine Klasse oder seine Attribute im Browser ändert. */
  function tuerBauen(nummer, offen, istHeute, inhalt, jahr, nummerHeute) {
    var eintrag = document.createElement('li');
    var knopf = document.createElement('button');
    var zahl = document.createElement('span');
    knopf.type = 'button';
    knopf.className = 'tuer ' + (offen ? 'offen' : 'zu') + (istHeute ? ' heute' : '');
    knopf.setAttribute('data-farbe', String((nummer + Math.floor((nummer - 1) / 6)) % 3));
    zahl.className = 'nr';
    zahl.textContent = String(nummer);
    knopf.appendChild(zahl);
    if (offen) {
      knopf.setAttribute('aria-label', 'Türchen ' + nummer + ' öffnen' + (istHeute ? ', heute' : ''));
      knopf.addEventListener('click', function () { fensterOeffnen(nummer, inhalt, knopf); });
    } else {
      knopf.setAttribute('aria-label', 'Türchen ' + nummer + ', öffnet sich am ' + nummer + '. Dezember');
      knopf.setAttribute('aria-disabled', 'true');
      knopf.addEventListener('click', function () { gesperrt(nummer, knopf, jahr, nummerHeute); });
    }
    eintrag.appendChild(knopf);
    return eintrag;
  }

  function zeigen(daten, moment) {
    var inhalte = {};
    var vorschau;
    var h;
    var nummerHeute;
    var offenBis;
    var nummer;
    if (!daten || typeof daten !== 'object' || daten.an !== true) {
      meldung('Der Adventskalender ist noch nicht freigeschaltet. Schau bald wieder vorbei!');
      return;
    }
    if (sauber(daten.titel)) {
      ueberschrift.textContent = sauber(daten.titel);
      document.title = sauber(daten.titel) + ' – Frankfurt RP';
    }
    einleitung.textContent = sauber(daten.einleitung);
    (Array.isArray(daten.tuerchen) ? daten.tuerchen : []).forEach(function (t) {
      var tag = t && typeof t === 'object' ? Number(t.tag) : 0;
      if (tag >= 1 && tag <= 24 && Math.floor(tag) === tag && !inhalte[tag]) { inhalte[tag] = t; }
    });
    vorschau = vorschauDatum(daten);
    h = vorschau || deutschesDatum(moment);
    if (vorschau) { praefix = 'Vorschau für den ' + h.tag + '.' + h.monat + '.' + h.jahr + ': '; }
    nummerHeute = tagesNummer(h.jahr, h.monat, h.tag);
    offenBis = h.monat === 12 ? Math.min(24, h.tag) : 0;
    if (h.monat !== 12) {
      meldung('Der Adventskalender öffnet am 1. Dezember. Noch ' + tageText(tagesNummer(h.jahr, 12, 1) - nummerHeute) + '.');
    } else if (h.tag < 24) {
      meldung('Heute ist der ' + h.tag + '. Dezember. Du kannst die Türchen 1 bis ' + h.tag + ' öffnen.');
    } else if (h.tag === 24) {
      meldung('Heute ist Heiligabend. Das letzte Türchen ist offen!');
    } else {
      meldung('Frohe Weihnachten! Alle 24 Türchen sind offen.');
    }
    for (nummer = 1; nummer <= 24; nummer++) {
      liste.appendChild(tuerBauen(nummer, nummer <= offenBis, h.monat === 12 && nummer === h.tag, nummer <= offenBis ? inhalte[nummer] || null : null, h.jahr, nummerHeute));
    }
    inhalte = null;
  }

  var momentVomServer = Date.now();
  fetch('adventskalender.json', { cache: 'no-store' }).then(function (antwort) {
    if (!antwort.ok) { throw new Error('adventskalender.json: ' + antwort.status); }
    momentVomServer = serverMoment(antwort);
    return antwort.json();
  }).then(function (daten) {
    zeigen(daten, momentVomServer);
  }).catch(function () {
    meldung('Der Adventskalender ist gerade nicht erreichbar. Bitte versuche es später noch einmal.');
  });
})();
