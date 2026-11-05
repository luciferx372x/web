/* Frankfurt RP – liest die Daten aus einstellungen.json und team.json
   (die du in der Verwaltung unter /admin änderst) und trägt sie in die Seite ein.
   Ohne JavaScript oder wenn eine Datei fehlt, bleibt der feste Inhalt der Seite stehen.
   Es werden nur Dateien von dieser Domain geladen, keine externen Dienste. */
(function () {
  'use strict';

  function laden(datei) {
    return fetch(datei, { cache: 'no-cache' }).then(function (antwort) {
      if (!antwort.ok) { throw new Error(datei + ': ' + antwort.status); }
      return antwort.json();
    });
  }

  /* Nur Links mit https:// zulassen, alles andere wird ignoriert. */
  function sichererLink(wert) {
    var text = typeof wert === 'string' ? wert.trim() : '';
    return /^https:\/\//i.test(text) ? text : '';
  }

  function sauber(wert) {
    return typeof wert === 'string' ? wert.trim() : '';
  }

  function einstellungenAnwenden(daten) {
    if (!daten || typeof daten !== 'object') { return; }

    /* Rote Leiste oben */
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

    /* Symbole bei "Sozialmedia": ohne Link wird das Symbol ausgeblendet */
    var links = { tiktok: daten.tiktok_url, discord: daten.discord_url, youtube: daten.youtube_url };
    Object.keys(links).forEach(function (name) {
      var symbol = document.querySelector('.social a.' + name);
      if (!symbol) { return; }
      var ziel = sichererLink(links[name]);
      var eintrag = symbol.closest('li') || symbol;
      eintrag.hidden = !ziel;
      if (ziel) { symbol.href = ziel; }
    });

    /* "Stand" in der Fußzeile */
    var stand = document.querySelector('.disclaimer .stand');
    var standText = sauber(daten.stand);
    if (stand && standText) { stand.textContent = standText; }
  }

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

  laden('einstellungen.json').then(einstellungenAnwenden).catch(function () { /* fester Inhalt bleibt */ });
  if (document.querySelector('dl.team')) {
    laden('team.json').then(teamAnwenden).catch(function () { /* fester Inhalt bleibt */ });
  }
})();
