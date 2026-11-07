/* Frankfurt RP – trägt Daten aus den JSON-Dateien in die Seite ein.
   Die Dateien werden in der Verwaltung (/admin) geändert:
   - einstellungen.json   rote Leiste, Links der Symbole, Stand-Angabe
   - team.json            Teammitglieder
   - seiteninhalte.json   Name der Website, Menü, Regelwerk-Liste, Fußzeile, Disclaimer
   - seitentitel.json     Überschrift, Browsertitel und Beschreibung jeder Seite
   - startseite.json      Texte der Startseite
   - seiten.json          Eigene Seiten (seite.html?s=...), die im Hauptmenü erscheinen sollen
   - design.json          Farben und Bilder (Verwaltung unter Website, Design)
   - overlays.json        Zeitplan für Overlays wie Schnee oder Feuerwerk (Verwaltung unter Website, Overlays), siehe overlay.js
   Stand-Angaben: Steht {monat} im Text, setzt die Seite den Monat der letzten Änderung ein
   (aus "Stand: {monat}" wird zum Beispiel "Stand: 11.2026"). Den Monat liefert der Server
   mit dem Änderungsdatum der Datei (Last-Modified), niemand muss ihn von Hand pflegen.
   Ohne JavaScript oder wenn eine Datei fehlt, bleibt der feste Inhalt der Seite stehen.
   Es werden nur Dateien von dieser Domain geladen, keine externen Dienste. */
(function () {
  'use strict';

  var SEITENZIEL = /^[A-Za-z0-9][A-Za-z0-9._\-]*\.html(\?[A-Za-z0-9=&_.\-]*)?(#[A-Za-z0-9_\-]+)?$/;

  /* Fertige Texte für den Server-Status (Auswahl in der Verwaltung unter Einstellungen). */
  var SERVER_STATUS = {
    online: 'Server online',
    wartung: 'Wartungsarbeiten, wir sind gleich wieder da',
    offline: 'Server offline',
    im_aufbau: 'Server im Aufbau'
  };

  /* Zeitpunkt der letzten Änderung jeder geladenen Datei, wie der Server ihn meldet (Last-Modified). */
  var zeiten = {};

  function zeitMerken(datei, antwort) {
    try {
      var kopf = antwort.headers.get('Last-Modified');
      var zeit = kopf ? new Date(kopf) : null;
      if (zeit && !isNaN(zeit.getTime())) { zeiten[datei] = zeit; }
    } catch (fehler) { /* kein Datum bekannt */ }
  }

  function laden(datei) {
    return fetch(datei, { cache: 'no-cache' }).then(function (antwort) {
      if (!antwort.ok) { throw new Error(datei + ': ' + antwort.status); }
      zeitMerken(datei, antwort);
      return antwort.json();
    });
  }

  function sauber(wert) {
    return typeof wert === 'string' ? wert.trim() : '';
  }

  /* ---------- Stand: Monat der letzten Änderung ---------- */

  /* Monat im Format 11.2026, gerechnet nach deutscher Zeit. */
  function monatText(datum) {
    var monat = '';
    var jahr = '';
    try {
      new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', month: '2-digit', year: 'numeric' })
        .formatToParts(datum).forEach(function (teil) {
          if (teil.type === 'month') { monat = teil.value; }
          if (teil.type === 'year') { jahr = teil.value; }
        });
    } catch (fehler) {
      monat = ('0' + (datum.getMonth() + 1)).slice(-2);
      jahr = String(datum.getFullYear());
    }
    return monat && jahr ? monat + '.' + jahr : '';
  }

  /* Monat der neuesten Änderung unter allen bisher geladenen Dateien. */
  function neuesterMonat() {
    var neueste = null;
    Object.keys(zeiten).forEach(function (datei) {
      if (!neueste || zeiten[datei] > neueste) { neueste = zeiten[datei]; }
    });
    return neueste ? monatText(neueste) : '';
  }

  /* {monat} im Text wird durch den Monat ersetzt. Ist der Monat nicht bekannt, bleibt der Text leer,
     damit nie "{monat}" auf der Seite steht. */
  function standMitMonat(text, monat) {
    var klar = sauber(text);
    if (!/\{monat\}/i.test(klar)) { return klar; }
    return monat ? klar.replace(/\{monat\}/gi, monat) : '';
  }

  /* Nur Links mit https:// zulassen, alles andere wird ignoriert. */
  function sichererLink(wert) {
    var text = sauber(wert);
    return /^https:\/\//i.test(text) ? text : '';
  }

  /* Ziele im Menü: Seiten dieser Website (zum Beispiel team.html) oder Links mit https://. */
  function sicheresZiel(wert) {
    var text = sauber(wert);
    if (/^https:\/\/\S+$/i.test(text)) { return text; }
    return SEITENZIEL.test(text) ? text : '';
  }

  function normPfad(pfad) {
    var teil = String(pfad).split('/').pop().toLowerCase();
    if (!teil) { return 'index.html'; }
    return /\.html$/.test(teil) ? teil : teil + '.html';
  }

  function istAktuell(ziel) {
    try {
      var adresse = new URL(ziel, location.href);
      if (adresse.origin !== location.origin) { return false; }
      if (normPfad(adresse.pathname) !== normPfad(location.pathname)) { return false; }
      /* Alle Parameter des Ziels müssen in der Adresse stehen. Zusätzliche Parameter (zum Beispiel utm_source) stören nicht. */
      var jetzt = new URLSearchParams(location.search);
      var passt = true;
      adresse.searchParams.forEach(function (wert, name) { if (jetzt.get(name) !== wert) { passt = false; } });
      return passt;
    } catch (fehler) {
      return false;
    }
  }

  function linkErzeugen(eintrag, aktiv, klasse) {
    if (!eintrag) { return null; }
    var ziel = sicheresZiel(eintrag.ziel);
    var text = sauber(eintrag.text);
    if (!ziel || !text) { return null; }
    var link = document.createElement('a');
    link.href = ziel;
    link.textContent = text;
    if (klasse) { link.className = klasse; }
    if (/^https:/i.test(ziel)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    if (aktiv) { link.setAttribute('aria-current', 'page'); }
    return link;
  }

  /* ---------- einstellungen.json ---------- */

  function einstellungenAnwenden(daten) {
    if (!daten || typeof daten !== 'object') { return; }

    var leiste = document.querySelector('.topbar');
    if (leiste) {
      var absatz = leiste.querySelector('p');
      var knopf = leiste.querySelector('a:not(.verbinden)');
      /* Ein fertiger Status aus der Auswahl ersetzt den eigenen Text und färbt die Leiste. */
      var status = sauber(daten.server_status);
      var fertigerStatus = Object.prototype.hasOwnProperty.call(SERVER_STATUS, status);
      var leistenText = fertigerStatus ? SERVER_STATUS[status] : sauber(daten.status_text);
      var knopfText = sauber(daten.status_button_text);
      var knopfLink = sichererLink(daten.status_link);
      var knopfSichtbar = Boolean(knopfText && knopfLink);
      var verbindenLink = sichererLink(daten.verbinden_link);
      var verbinden = leiste.querySelector('a.verbinden');

      leiste.setAttribute('data-status', fertigerStatus ? status : 'eigen');
      if (absatz) { absatz.textContent = leistenText; absatz.hidden = !leistenText; }
      if (knopf) {
        knopf.hidden = !knopfSichtbar;
        if (knopfSichtbar) { knopf.textContent = knopfText; knopf.href = knopfLink; }
      }
      /* Zweiter Knopf "Server beitreten", nur wenn in der Verwaltung ein Link eingetragen ist. */
      if (verbindenLink) {
        if (!verbinden) {
          verbinden = document.createElement('a');
          verbinden.className = 'verbinden';
          leiste.appendChild(verbinden);
        }
        verbinden.textContent = sauber(daten.verbinden_text) || 'Server beitreten';
        verbinden.href = verbindenLink;
        verbinden.target = '_blank';
        verbinden.rel = 'noopener noreferrer';
        verbinden.hidden = false;
      } else if (verbinden) {
        verbinden.hidden = true;
      }
      leiste.hidden = !leistenText && !knopfSichtbar && !verbindenLink;
    }

    var links = { tiktok: daten.tiktok_url, discord: daten.discord_url, youtube: daten.youtube_url };
    Object.keys(links).forEach(function (name) {
      var symbol = document.querySelector('.social a.' + name);
      if (!symbol) { return; }
      var ziel = sichererLink(links[name]);
      var eintrag = symbol.closest('li') || symbol;
      eintrag.hidden = !ziel;
      if (ziel) { symbol.href = ziel; }
    });
  }

  /* ---------- Stand-Angabe in der Fußzeile (aus einstellungen.json) ---------- */

  function standAnwenden(daten) {
    var stand = document.querySelector('.disclaimer .stand');
    if (!stand) { return; }
    var text = daten && typeof daten === 'object' ? standMitMonat(daten.stand, neuesterMonat()) : '';
    stand.textContent = text;
    stand.hidden = !text;
  }

  /* ---------- team.json ---------- */

  function teamAnwenden(daten) {
    var liste = document.querySelector('dl.team');
    if (!liste || !daten || !Array.isArray(daten.mitglieder)) { return; }

    var mitglieder = daten.mitglieder.filter(function (eintrag) {
      return eintrag && (sauber(eintrag.rolle) || sauber(eintrag.name));
    });

    liste.textContent = '';
    mitglieder.forEach(function (eintrag) {
      var karte = document.createElement('div');
      karte.className = 'member';
      var rolle = document.createElement('dt');
      rolle.textContent = sauber(eintrag.rolle);
      var name = document.createElement('dd');
      name.textContent = sauber(eintrag.name);
      karte.appendChild(rolle);
      karte.appendChild(name);
      liste.appendChild(karte);
    });
  }

  /* ---------- seiteninhalte.json: Name, Menü, Regelwerk-Liste, Fußzeile ---------- */

  function linksErsetzen(behaelter, eintraege, aktivFunktion, klasse, verpacken) {
    if (!behaelter || !Array.isArray(eintraege)) { return; }
    var neu = [];
    eintraege.forEach(function (eintrag) {
      if (!eintrag || typeof eintrag !== 'object') { return; }
      var link = linkErzeugen(eintrag, aktivFunktion ? aktivFunktion(eintrag) : false, klasse);
      if (link) { neu.push(link); }
    });
    if (!neu.length) { return; }
    behaelter.textContent = '';
    neu.forEach(function (link) {
      if (verpacken) {
        var punkt = document.createElement('li');
        punkt.appendChild(link);
        behaelter.appendChild(punkt);
      } else {
        behaelter.appendChild(link);
      }
    });
  }

  /* Eigene Seiten, die in der Verwaltung als sichtbar und "im Menü anzeigen" eingestellt sind, werden Menüpunkte. */
  function menuepunkteAusSeiten(seiten) {
    var liste = seiten && typeof seiten === 'object' && Array.isArray(seiten.seiten) ? seiten.seiten : [];
    var punkte = [];
    liste.forEach(function (eintrag) {
      if (!eintrag || typeof eintrag !== 'object' || eintrag.sichtbar !== true || eintrag.im_menue !== true) { return; }
      var kennung = sauber(eintrag.kennung);
      var text = sauber(eintrag.menuetext) || sauber(eintrag.titel);
      if (!/^[a-z0-9][a-z0-9\-]*$/.test(kennung) || !text) { return; }
      punkte.push({ text: text, ziel: 'seite.html?s=' + kennung });
    });
    return punkte;
  }

  function seiteninhalteAnwenden(inhalte, seiten) {
    if (!inhalte || typeof inhalte !== 'object') { return; }

    var marke = document.querySelector('.brand span');
    if (marke && sauber(inhalte.markenname)) { marke.textContent = sauber(inhalte.markenname); }

    var regelwerke = Array.isArray(inhalte.regelwerke) ? inhalte.regelwerke : [];
    var regelZiele = regelwerke.map(function (eintrag) { return eintrag && eintrag.ziel; });
    var imRegelwerk = regelZiele.some(function (ziel) { return ziel && istAktuell(ziel); });

    /* Hauptmenü: Der Punkt, der auf das erste Regelwerk zeigt, bleibt auf allen Regelwerk-Seiten markiert.
       Eigene Seiten für das Menü kommen ans Ende (nur wenn dort nicht schon derselbe Link steht). */
    var navigation = inhalte.navigation;
    if (Array.isArray(navigation)) {
      var eigene = menuepunkteAusSeiten(seiten).filter(function (punkt) {
        return !navigation.some(function (eintrag) { return eintrag && eintrag.ziel === punkt.ziel; });
      });
      navigation = navigation.concat(eigene);
    }
    linksErsetzen(document.querySelector('.site-header .nav'), navigation, function (eintrag) {
      return istAktuell(eintrag.ziel) || Boolean(imRegelwerk && regelZiele[0] && eintrag.ziel === regelZiele[0]);
    });

    linksErsetzen(document.querySelector('.footer-links'), inhalte.fusslinks, null);

    /* Auswahlleiste mit allen Regelwerken (nur auf den Regelwerk-Seiten vorhanden) */
    var auswahl = document.querySelector('ul.subnav');
    if (auswahl && regelwerke.length) {
      var kurz = regelwerke.map(function (eintrag) {
        return eintrag ? { text: sauber(eintrag.kurztext) || eintrag.text, ziel: eintrag.ziel } : null;
      });
      linksErsetzen(auswahl, kurz, function (eintrag) { return istAktuell(eintrag.ziel); }, '', true);
    }

    var zurueck = document.querySelector('.back');
    if (zurueck && sauber(inhalte.zurueck_text)) { zurueck.textContent = sauber(inhalte.zurueck_text); }

    var absaetze = document.querySelectorAll('.disclaimer .inner p');
    if (absaetze[1] && sauber(inhalte.disclaimer_titel)) {
      var fett = absaetze[1].querySelector('strong') || absaetze[1];
      fett.textContent = sauber(inhalte.disclaimer_titel);
    }
    if (absaetze[2] && sauber(inhalte.disclaimer_text)) { absaetze[2].textContent = sauber(inhalte.disclaimer_text); }
  }

  /* ---------- seitentitel.json ---------- */

  function seitentitelAnwenden(daten) {
    if (!daten || !Array.isArray(daten.seiten)) { return; }
    var aktuell = normPfad(location.pathname);
    var eintrag = null;
    daten.seiten.forEach(function (kandidat) {
      if (!eintrag && kandidat && typeof kandidat.datei === 'string' && normPfad(kandidat.datei) === aktuell) { eintrag = kandidat; }
    });
    if (!eintrag) { return; }

    var ueberschrift = document.querySelector('.hero h1') || document.querySelector('main > h1');
    if (ueberschrift && sauber(eintrag.ueberschrift)) { ueberschrift.textContent = sauber(eintrag.ueberschrift); }
    if (sauber(eintrag.browsertitel)) { document.title = sauber(eintrag.browsertitel); }
    var beschreibung = document.querySelector('meta[name="description"]');
    if (beschreibung && sauber(eintrag.beschreibung)) { beschreibung.setAttribute('content', sauber(eintrag.beschreibung)); }
  }

  /* ---------- startseite.json ---------- */

  function startseiteAnwenden(daten, inhalte) {
    if (!document.querySelector('.home')) { return; }

    if (daten && typeof daten === 'object') {
      var banner = document.querySelector('img.hero-img');
      if (banner && typeof daten.hero_alt === 'string') { banner.setAttribute('alt', daten.hero_alt.trim()); }

      var regelnTitel = document.getElementById('h-regelwerke');
      if (regelnTitel && sauber(daten.regeln_ueberschrift)) { regelnTitel.textContent = sauber(daten.regeln_ueberschrift); }
      var socialTitel = document.getElementById('h-social');
      if (socialTitel && sauber(daten.social_ueberschrift)) { socialTitel.textContent = sauber(daten.social_ueberschrift); }

      var karten = document.querySelectorAll('.home .showcase');
      if (karten[0] && karten[0].querySelector('img') && typeof daten.regeln_bild_alt === 'string') { karten[0].querySelector('img').setAttribute('alt', daten.regeln_bild_alt.trim()); }
      if (karten[1] && karten[1].querySelector('img') && typeof daten.social_bild_alt === 'string') { karten[1].querySelector('img').setAttribute('alt', daten.social_bild_alt.trim()); }
    }

    if (inhalte && Array.isArray(inhalte.regelwerke)) {
      linksErsetzen(document.querySelector('.rule-grid'), inhalte.regelwerke, null, 'btn', true);
    }
  }

  /* ---------- design.json: Farben und Bilder ---------- */

  /* Diese Werte entsprechen dem festen Aussehen in style.css. Stehen sie unverändert in design.json, bleibt alles wie es ist. */
  var STANDARD_HAUPTFARBE = '#fa3019';
  var STANDARD_LEISTENFARBE = '#ff0000';
  var FARBE = /^#[0-9a-fA-F]{6}$/;
  /* Bilder dürfen nur aus dem Ordner "bilder" kommen, den die Verwaltung beim Hochladen anlegt. Alles andere wird ignoriert. */
  var BILDPFAD = /^\/?(bilder\/[A-Za-z0-9][A-Za-z0-9._\-]{0,100}\.(?:png|jpe?g|webp|gif|svg|avif))$/i;

  function bildPfad(wert) {
    var treffer = BILDPFAD.exec(sauber(wert));
    return treffer ? treffer[1] : '';
  }

  /* Erlaubt #rgb und #rrggbb in Groß- oder Kleinschreibung und gibt immer #rrggbb in Kleinbuchstaben zurück, sonst einen leeren Text. */
  function farbeNormal(wert) {
    var text = sauber(wert).toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(text)) {
      text = '#' + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2) + text.charAt(3) + text.charAt(3);
    }
    return FARBE.test(text) ? text : '';
  }

  function farbeInZahlen(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  function zahlenInFarbe(zahlen) {
    return '#' + zahlen.map(function (teil) {
      var wert = Math.max(0, Math.min(255, Math.round(teil))).toString(16);
      return wert.length < 2 ? '0' + wert : wert;
    }).join('');
  }

  /* Mischt eine Farbe zum Anteil (0 bis 1) mit einer Zielfarbe, zum Beispiel mit Weiß für eine hellere Variante. */
  function mischen(zahlen, ziel, anteil) {
    return zahlen.map(function (teil, i) { return teil + (ziel[i] - teil) * anteil; });
  }

  function bildTauschen(bilder, wert) {
    var pfad = bildPfad(wert);
    if (!pfad) { return; }
    Array.prototype.forEach.call(bilder, function (bild) {
      bild.removeAttribute('srcset');
      bild.removeAttribute('sizes');
      bild.setAttribute('src', pfad);
    });
  }

  function designAnwenden(daten) {
    if (!daten || typeof daten !== 'object' || Array.isArray(daten)) { return; }
    var stil = document.documentElement.style;

    var haupt = farbeNormal(daten.farbe_haupt);
    if (haupt && haupt !== STANDARD_HAUPTFARBE) {
      var zahlen = farbeInZahlen(haupt);
      stil.setProperty('--red', haupt);
      stil.setProperty('--red-rgb', zahlen.join(', '));
      stil.setProperty('--red-bright', zahlenInFarbe(mischen(zahlen, [255, 255, 255], 0.3)));
      stil.setProperty('--red-deep', zahlenInFarbe(mischen(zahlen, [0, 0, 0], 0.22)));
      stil.setProperty('--red-knopf', zahlenInFarbe(mischen(zahlen, [255, 255, 255], 0.12)));
    }

    var leiste = farbeNormal(daten.farbe_leiste);
    if (leiste && leiste !== STANDARD_LEISTENFARBE) {
      stil.setProperty('--bar', leiste);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) { meta.setAttribute('content', leiste); }
    }

    var hintergrund = bildPfad(daten.bild_hintergrund);
    if (hintergrund) {
      stil.setProperty('--bild-hintergrund-klein', 'url("' + hintergrund + '")');
      stil.setProperty('--bild-hintergrund-gross', 'url("' + hintergrund + '")');
    }
    var kopf = bildPfad(daten.bild_kopf);
    if (kopf) {
      stil.setProperty('--bild-kopf-klein', 'url("' + kopf + '")');
      stil.setProperty('--bild-kopf-gross', 'url("' + kopf + '")');
    }

    bildTauschen(document.querySelectorAll('.site-header .brand img'), daten.bild_logo);

    var symbol = bildPfad(daten.bild_favicon);
    if (symbol) {
      Array.prototype.forEach.call(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'), function (eintrag) {
        eintrag.removeAttribute('sizes');
        eintrag.removeAttribute('type');
        eintrag.setAttribute('href', symbol);
      });
    }

    bildTauschen(document.querySelectorAll('img.hero-img'), daten.bild_startseite_banner);
    var karten = document.querySelectorAll('.home .showcase');
    if (karten[0]) { bildTauschen(karten[0].querySelectorAll('img'), daten.bild_startseite_regeln); }
    if (karten[1]) { bildTauschen(karten[1].querySelectorAll('img'), daten.bild_startseite_social); }
    bildTauschen(document.querySelectorAll('.showcase[aria-labelledby="h-team"] img'), daten.bild_team);
  }

  /* ---------- overlays.json: Schnee, Feuerwerk und mehr nach Zeitplan, mit Schalter "Edition | Original" ---------- */

  var OVERLAY_EFFEKTE = ['schnee', 'weihnachten', 'sterne', 'konfetti', 'feuerwerk', 'laub', 'halloween', 'herzen', 'ostern', 'nikolaus', 'jubilaeum'];
  var OVERLAY_STAERKEN = ['wenig', 'normal', 'viel'];
  var DATUMSANGABE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/;
  var TAGE_IM_MONAT = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /* Symbol und Vorgabe-Name der Edition auf dem Schalter. Im Admin kann pro Zeitraum ein eigener Name stehen. */
  var EDITION_VORGABEN = {
    schnee: ['❄️', 'Winter-Edition'],
    weihnachten: ['🎄', 'Winter-Edition'],
    sterne: ['✨', 'Sterne-Edition'],
    konfetti: ['🎉', 'Party-Edition'],
    feuerwerk: ['🎆', 'Neujahrs-Edition'],
    laub: ['🍂', 'Herbst-Edition'],
    halloween: ['🎃', 'Halloween-Edition'],
    herzen: ['❤️', 'Valentins-Edition'],
    ostern: ['🐣', 'Oster-Edition'],
    nikolaus: ['🎅', 'Nikolaus-Edition'],
    jubilaeum: ['🎈', 'Jubiläums-Edition']
  };
  var EDITION_SPEICHER = 'ffrp-edition';
  var EDITION_TAGE = 90;

  /* Heutiges Datum nach deutscher Zeit. Zum Ausprobieren: Steht ?overlaydatum=2026-12-24 in der Adresse, gilt dieses Datum. */
  function heuteTeile() {
    var parameter = null;
    try { parameter = new URLSearchParams(location.search).get('overlaydatum'); } catch (fehler) { /* kein Vorschau-Datum */ }
    var treffer = parameter ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(parameter) : null;
    if (treffer) { return { jahr: Number(treffer[1]), monat: Number(treffer[2]), tag: Number(treffer[3]) }; }
    var teile = { jahr: 0, monat: 0, tag: 0 };
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

  function tagesnummer(jahr, monat, tag) { return Date.UTC(jahr, monat - 1, tag) / 86400000; }

  /* Liest "01.12." (gilt jedes Jahr) oder "01.12.2026" (nur in diesem Jahr). Gibt bei Fehlern null zurück. */
  function datumLesen(text) {
    var treffer = DATUMSANGABE.exec(sauber(text));
    if (!treffer) { return null; }
    var tag = Number(treffer[1]);
    var monat = Number(treffer[2]);
    if (monat < 1 || monat > 12 || tag < 1 || tag > TAGE_IM_MONAT[monat - 1]) { return null; }
    return { tag: tag, monat: monat, jahr: treffer[3] ? Number(treffer[3]) : 0 };
  }

  function angabeLeer(wert) {
    return wert === undefined || wert === null || (typeof wert === 'string' && wert.trim() === '');
  }

  /* Gilt heute zwischen von und bis (beide Tage eingeschlossen)? Sind beide Angaben leer, gilt es immer. */
  function imZeitraum(von, bis, heute) {
    if (angabeLeer(von) && angabeLeer(bis)) { return true; }
    var a = datumLesen(von);
    var b = datumLesen(bis);
    if (!a || !b) { return false; }
    if (a.jahr || b.jahr) {
      var jahrA = a.jahr;
      var jahrB = b.jahr;
      if (jahrA && !jahrB) {
        jahrB = jahrA;
        if (tagesnummer(jahrB, b.monat, b.tag) < tagesnummer(jahrA, a.monat, a.tag)) { jahrB += 1; }
      } else if (!jahrA && jahrB) {
        jahrA = jahrB;
        if (tagesnummer(jahrA, a.monat, a.tag) > tagesnummer(jahrB, b.monat, b.tag)) { jahrA -= 1; }
      }
      var heuteNummer = tagesnummer(heute.jahr, heute.monat, heute.tag);
      return heuteNummer >= tagesnummer(jahrA, a.monat, a.tag) && heuteNummer <= tagesnummer(jahrB, b.monat, b.tag);
    }
    var h = heute.monat * 100 + heute.tag;
    var anfang = a.monat * 100 + a.tag;
    var ende = b.monat * 100 + b.tag;
    return anfang <= ende ? (h >= anfang && h <= ende) : (h >= anfang || h <= ende);
  }

  /* Sucht den ersten eingeschalteten Eintrag, der heute gilt. Gibt { effekt, staerke, bezeichnung, schalter } oder null zurück. */
  function overlayWaehlen(daten, heute) {
    if (!daten || typeof daten !== 'object' || daten.overlays_an === false || !Array.isArray(daten.eintraege)) { return null; }
    for (var i = 0; i < daten.eintraege.length; i++) {
      var eintrag = daten.eintraege[i];
      if (!eintrag || typeof eintrag !== 'object' || eintrag.aktiv === false) { continue; }
      var effekt = sauber(eintrag.effekt);
      if (OVERLAY_EFFEKTE.indexOf(effekt) < 0) { continue; }
      if (imZeitraum(eintrag.von, eintrag.bis, heute)) {
        var staerke = sauber(eintrag.staerke);
        return {
          effekt: effekt,
          staerke: OVERLAY_STAERKEN.indexOf(staerke) >= 0 ? staerke : 'normal',
          bezeichnung: sauber(eintrag.bezeichnung).slice(0, 40),
          schalter: daten.schalter !== false
        };
      }
    }
    return null;
  }

  /* Vorschau über die Adresse: ?overlay=schnee (zusätzlich &staerke=viel). Gilt unabhängig vom Zeitplan. */
  function overlayVorschau() {
    var name = '';
    var staerke = '';
    try {
      var parameter = new URLSearchParams(location.search);
      name = sauber(parameter.get('overlay'));
      staerke = sauber(parameter.get('staerke'));
    } catch (fehler) { return null; }
    if (OVERLAY_EFFEKTE.indexOf(name) < 0) { return null; }
    return { effekt: name, staerke: OVERLAY_STAERKEN.indexOf(staerke) >= 0 ? staerke : 'normal', bezeichnung: '', schalter: true };
  }

  /* Die Wahl "Original" merkt sich der Browser 90 Tage lang im lokalen Speicher (nur dort, nie an uns gesendet).
     Gemerkt wird nur, wenn jemand selbst "Original" anklickt, und nur für den jeweiligen Effekt. */
  function editionAbgewaehlt(effekt) {
    try {
      var roh = window.localStorage.getItem(EDITION_SPEICHER);
      if (!roh) { return false; }
      var gemerkt = JSON.parse(roh);
      if (!gemerkt || gemerkt.wahl !== 'original' || gemerkt.effekt !== effekt || typeof gemerkt.zeit !== 'number') { return false; }
      if (Date.now() - gemerkt.zeit > EDITION_TAGE * 86400000) {
        window.localStorage.removeItem(EDITION_SPEICHER);
        return false;
      }
      return true;
    } catch (fehler) { return false; }
  }

  function editionMerken(effekt, original) {
    try {
      if (original) { window.localStorage.setItem(EDITION_SPEICHER, JSON.stringify({ wahl: 'original', effekt: effekt, zeit: Date.now() })); }
      else { window.localStorage.removeItem(EDITION_SPEICHER); }
    } catch (fehler) { /* Speicher gesperrt: Die Wahl gilt dann nur für diese Seite. */ }
  }

  /* overlay.js wird erst geladen, wenn die Edition wirklich gezeigt werden soll. */
  var overlayStand = { geladen: false, laedt: false, soll: false, wahl: null };

  function overlayAn(wahl) {
    overlayStand.soll = true;
    overlayStand.wahl = wahl;
    if (overlayStand.geladen) {
      sicher(function () { window.frankfurtOverlay.start(wahl); });
      return;
    }
    if (overlayStand.laedt) { return; }
    overlayStand.laedt = true;
    var skript = document.createElement('script');
    skript.src = 'overlay.js';
    skript.async = true;
    skript.onload = function () {
      overlayStand.laedt = false;
      overlayStand.geladen = !!window.frankfurtOverlay;
      if (overlayStand.geladen && overlayStand.soll) {
        sicher(function () { window.frankfurtOverlay.start(overlayStand.wahl); });
      }
    };
    skript.onerror = function () { overlayStand.laedt = false; };
    document.head.appendChild(skript);
  }

  function overlayAus() {
    overlayStand.soll = false;
    if (overlayStand.geladen) { sicher(function () { window.frankfurtOverlay.stop(); }); }
  }

  /* Kleiner Schalter unten rechts: "Winter-Edition | Original". Man kann so immer die normale Seite wählen. */
  function editionSchalterBauen(wahl, an, vorschau) {
    var vorgabe = EDITION_VORGABEN[wahl.effekt] || ['', 'Edition'];
    var behaelter = document.createElement('div');
    behaelter.className = 'edition-schalter';
    behaelter.setAttribute('role', 'group');
    behaelter.setAttribute('aria-label', 'Ansicht der Website wählen');
    var knopfEdition = document.createElement('button');
    knopfEdition.type = 'button';
    knopfEdition.textContent = (vorgabe[0] ? vorgabe[0] + ' ' : '') + (wahl.bezeichnung || vorgabe[1]);
    var knopfOriginal = document.createElement('button');
    knopfOriginal.type = 'button';
    knopfOriginal.textContent = 'Original';
    function anzeigen(istAn) {
      knopfEdition.setAttribute('aria-pressed', istAn ? 'true' : 'false');
      knopfOriginal.setAttribute('aria-pressed', istAn ? 'false' : 'true');
    }
    knopfEdition.addEventListener('click', function () {
      anzeigen(true);
      if (!vorschau) { editionMerken(wahl.effekt, false); }
      overlayAn(wahl);
    });
    knopfOriginal.addEventListener('click', function () {
      anzeigen(false);
      if (!vorschau) { editionMerken(wahl.effekt, true); }
      overlayAus();
    });
    anzeigen(an);
    behaelter.appendChild(knopfEdition);
    behaelter.appendChild(knopfOriginal);
    document.body.appendChild(behaelter);
  }

  /* Zeigt die Edition (und den Schalter), außer bei "weniger Bewegung" im Betriebssystem. */
  function overlayStarten(wahl, vorschau) {
    if (!wahl) { return; }
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
    } catch (fehler) { /* weiter */ }
    var mitSchalter = wahl.schalter !== false;
    var abgewaehlt = mitSchalter && !vorschau && editionAbgewaehlt(wahl.effekt);
    if (mitSchalter) { editionSchalterBauen(wahl, !abgewaehlt, vorschau); }
    if (!abgewaehlt) { overlayAn(wahl); }
  }

  function ohneFehler(versprechen) {
    return versprechen.catch(function () { return null; });
  }

  /* Ein Fehler in einem Teil darf die anderen Teile nicht stoppen. */
  function sicher(arbeit) {
    try { arbeit(); } catch (fehler) { /* fester Inhalt bleibt */ }
  }

  /* Farben und Bilder (design.json) werden sofort angewendet, ohne auf die anderen Dateien zu warten, damit der Wechsel
     vom Standard-Aussehen kaum zu sehen ist. Die Datei zählt nicht für die Stand-Angabe, denn sie ändert keinen Text.
     Fehlt sie oder ist sie kaputt, bleibt das feste Aussehen aus style.css. */
  fetch('design.json', { cache: 'no-cache' }).then(function (antwort) {
    if (!antwort.ok) { throw new Error('design.json: ' + antwort.status); }
    return antwort.json();
  }).then(function (daten) {
    sicher(function () { designAnwenden(daten); });
  }).catch(function () { /* Standard-Aussehen bleibt */ });

  /* Overlays (Schnee, Feuerwerk und mehr): entweder die Vorschau aus der Adresse (?overlay=schnee) oder der Zeitplan aus
     overlays.json. Fehlt die Datei oder gilt heute nichts, wird nichts geladen und nichts verändert. */
  (function () {
    var vorschau = overlayVorschau();
    if (vorschau) { overlayStarten(vorschau, true); return; }
    fetch('overlays.json', { cache: 'no-cache' }).then(function (antwort) {
      if (!antwort.ok) { throw new Error('overlays.json: ' + antwort.status); }
      return antwort.json();
    }).then(function (daten) {
      sicher(function () { overlayStarten(overlayWaehlen(daten, heuteTeile()), false); });
    }).catch(function () { /* kein Overlay */ });
  })();

  var einstellungen = ohneFehler(laden('einstellungen.json'));
  einstellungen.then(function (daten) { sicher(function () { einstellungenAnwenden(daten); }); });
  if (document.querySelector('dl.team')) {
    laden('team.json').then(teamAnwenden).catch(function () { /* fester Inhalt bleibt */ });
  }

  Promise.all([
    einstellungen,
    ohneFehler(laden('seiteninhalte.json')),
    ohneFehler(laden('seitentitel.json')),
    ohneFehler(laden('startseite.json')),
    ohneFehler(laden('seiten.json'))
  ]).then(function (ergebnis) {
    sicher(function () { seiteninhalteAnwenden(ergebnis[1], ergebnis[4]); });
    sicher(function () { seitentitelAnwenden(ergebnis[2]); });
    sicher(function () { startseiteAnwenden(ergebnis[3], ergebnis[1]); });
    sicher(function () { standAnwenden(ergebnis[0]); });
  });
})();
