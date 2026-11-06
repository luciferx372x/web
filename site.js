/* Frankfurt RP – trägt Daten aus den JSON-Dateien in die Seite ein.
   Die Dateien werden in der Verwaltung (/admin) geändert:
   - einstellungen.json   rote Leiste, Links der Symbole, Stand-Angabe
   - team.json            Teammitglieder
   - seiteninhalte.json   Name der Website, Menü, Regelwerk-Liste, Fußzeile, Disclaimer
   - seitentitel.json     Überschrift, Browsertitel und Beschreibung jeder Seite
   - startseite.json      Texte der Startseite
   Ohne JavaScript oder wenn eine Datei fehlt, bleibt der feste Inhalt der Seite stehen.
   Es werden nur Dateien von dieser Domain geladen, keine externen Dienste. */
(function () {
  'use strict';

  var SEITENZIEL = /^[A-Za-z0-9][A-Za-z0-9._\-]*\.html(\?[A-Za-z0-9=&_.\-]*)?(#[A-Za-z0-9_\-]+)?$/;

  function laden(datei) {
    return fetch(datei, { cache: 'no-cache' }).then(function (antwort) {
      if (!antwort.ok) { throw new Error(datei + ': ' + antwort.status); }
      return antwort.json();
    });
  }

  function sauber(wert) {
    return typeof wert === 'string' ? wert.trim() : '';
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
      return normPfad(adresse.pathname) === normPfad(location.pathname) &&
        (adresse.search === '' || adresse.search === location.search);
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
      var knopf = leiste.querySelector('a');
      var leistenText = sauber(daten.status_text);
      var knopfText = sauber(daten.status_button_text);
      var knopfLink = sichererLink(daten.status_link);
      var knopfSichtbar = Boolean(knopfText && knopfLink);

      if (absatz) { absatz.textContent = leistenText; absatz.hidden = !leistenText; }
      if (knopf) {
        knopf.hidden = !knopfSichtbar;
        if (knopfSichtbar) { knopf.textContent = knopfText; knopf.href = knopfLink; }
      }
      leiste.hidden = !leistenText && !knopfSichtbar;
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

    var stand = document.querySelector('.disclaimer .stand');
    var standText = sauber(daten.stand);
    if (stand && standText) { stand.textContent = standText; }
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

  function seiteninhalteAnwenden(inhalte) {
    if (!inhalte || typeof inhalte !== 'object') { return; }

    var marke = document.querySelector('.brand span');
    if (marke && sauber(inhalte.markenname)) { marke.textContent = sauber(inhalte.markenname); }

    var regelwerke = Array.isArray(inhalte.regelwerke) ? inhalte.regelwerke : [];
    var regelZiele = regelwerke.map(function (eintrag) { return eintrag && eintrag.ziel; });
    var imRegelwerk = regelZiele.some(function (ziel) { return ziel && istAktuell(ziel); });

    /* Hauptmenü: Der Punkt, der auf das erste Regelwerk zeigt, bleibt auf allen Regelwerk-Seiten markiert. */
    linksErsetzen(document.querySelector('.site-header .nav'), inhalte.navigation, function (eintrag) {
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

  function ohneFehler(versprechen) {
    return versprechen.catch(function () { return null; });
  }

  /* Ein Fehler in einem Teil darf die anderen Teile nicht stoppen. */
  function sicher(arbeit) {
    try { arbeit(); } catch (fehler) { /* fester Inhalt bleibt */ }
  }

  laden('einstellungen.json').then(einstellungenAnwenden).catch(function () { /* fester Inhalt bleibt */ });
  if (document.querySelector('dl.team')) {
    laden('team.json').then(teamAnwenden).catch(function () { /* fester Inhalt bleibt */ });
  }

  Promise.all([
    ohneFehler(laden('seiteninhalte.json')),
    ohneFehler(laden('seitentitel.json')),
    ohneFehler(laden('startseite.json'))
  ]).then(function (ergebnis) {
    sicher(function () { seiteninhalteAnwenden(ergebnis[0]); });
    sicher(function () { seitentitelAnwenden(ergebnis[1]); });
    sicher(function () { startseiteAnwenden(ergebnis[2], ergebnis[0]); });
  });
})();
