/* Frankfurt RP – Formulare auf eigenen Seiten (seite.html?s=...).
   Die Fragen kommen aus seiten.json (Verwaltung, "Eigene Seiten"). Beim Absenden gehen die Antworten an ein kleines
   Relais (Cloudflare Worker, Datei discord-relais.js im Projektordner), das sie als Nachricht in einen Discord-Kanal
   schreibt. Die Adresse des Relais steht ebenfalls in seiten.json ("formular_adresse").
   - Nichts wird gespeichert, es werden keine Cookies gesetzt, es wird nur diese eine Adresse angesprochen.
   - Alle Texte aus der Verwaltung werden nur als Text eingesetzt, nie als HTML.
   - Ohne Adresse oder ohne gültige Fragen ist das Formular nicht benutzbar. */
(function () {
  'use strict';

  var TYPEN = { kurztext: true, langtext: true, auswahl: true, zahl: true, bestaetigung: true };
  var KANAL = /^[a-z0-9][a-z0-9\-]{0,29}$/;
  var ADRESSE_HTTPS = /^https:\/\/[^\s]+$/;
  var ADRESSE_LOKAL = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?\/[^\s]*$/; /* nur für Tests auf diesem Rechner */
  var MAX_FELDER = 20;
  var MAX_KURZ = 200;
  var MAX_LANG = 1000;
  var ZEITLIMIT_MS = 15000;

  function knoten(name, klasse, inhalt) {
    var k = document.createElement(name);
    if (klasse) { k.className = klasse; }
    if (inhalt) { k.textContent = inhalt; }
    return k;
  }

  function text(wert) {
    return typeof wert === 'string' ? wert.trim() : '';
  }

  function zahlOderNull(wert) {
    if (typeof wert === 'number' && isFinite(wert)) { return wert; }
    if (typeof wert === 'string' && /^-?\d{1,9}$/.test(wert.trim())) { return parseInt(wert, 10); }
    return null;
  }

  function adresseErlaubt(adresse) {
    var a = text(adresse);
    return ADRESSE_HTTPS.test(a) || ADRESSE_LOKAL.test(a) ? a : '';
  }

  function optionenLesen(wert) {
    var liste = [];
    String(typeof wert === 'string' ? wert : '').split(/\r?\n/).forEach(function (zeile) {
      var option = zeile.trim().slice(0, 100);
      if (option && liste.indexOf(option) < 0 && liste.length < 30) { liste.push(option); }
    });
    return liste;
  }

  /* Macht aus den Rohdaten saubere Fragen. Unbrauchbare Einträge werden ausgelassen. */
  function felderLesen(rohFelder) {
    var liste = Array.isArray(rohFelder) ? rohFelder : [];
    var felder = [];
    liste.forEach(function (roh) {
      if (felder.length >= MAX_FELDER || !roh || typeof roh !== 'object') { return; }
      var frage = text(roh.frage).slice(0, 200);
      var typ = text(roh.typ) || 'kurztext';
      if (!frage || !Object.prototype.hasOwnProperty.call(TYPEN, typ)) { return; }
      var feld = {
        frage: frage,
        typ: typ,
        pflicht: roh.pflicht === true,
        hinweis: text(roh.hinweis).slice(0, 300),
        optionen: [],
        min: zahlOderNull(roh.min),
        max: zahlOderNull(roh.max)
      };
      if (typ === 'auswahl') {
        feld.optionen = optionenLesen(roh.optionen);
        if (!feld.optionen.length) { return; }
      }
      felder.push(feld);
    });
    return felder;
  }

  /* Gibt den Fehlertext zurück, oder einen leeren Text, wenn alles passt. */
  function fehlerText(feld, wert) {
    if (feld.typ === 'bestaetigung') { return wert === 'Ja' || !feld.pflicht ? '' : 'Bitte bestätige das.'; }
    if (!wert) { return feld.pflicht ? 'Bitte ausfüllen.' : ''; }
    if (feld.typ === 'zahl') {
      if (!/^-?\d{1,9}$/.test(wert)) { return 'Bitte gib eine ganze Zahl an.'; }
      var zahl = parseInt(wert, 10);
      if (feld.min !== null && zahl < feld.min) { return 'Der Wert muss mindestens ' + feld.min + ' sein.'; }
      if (feld.max !== null && zahl > feld.max) { return 'Der Wert darf höchstens ' + feld.max + ' sein.'; }
    }
    if (feld.typ === 'auswahl' && feld.optionen.indexOf(wert) < 0) { return 'Bitte wähle eine Möglichkeit aus.'; }
    return '';
  }

  function fehlerNachStatus(status, daten) {
    if (status === 429) { return 'Es wurden gerade zu viele Einsendungen gesendet. Bitte versuche es in ein paar Minuten noch einmal.'; }
    if (daten && daten.fehler === 'zu_schnell') { return 'Das ging sehr schnell. Bitte nimm dir einen Moment Zeit und sende noch einmal.'; }
    if (status === 0) { return 'Es gab ein Verbindungsproblem. Bitte prüfe deine Verbindung und versuche es noch einmal.'; }
    return 'Das Formular konnte nicht gesendet werden. Bitte versuche es später noch einmal oder melde dich auf Discord.';
  }

  /* Baut das Formular. Gibt null zurück, wenn die Seite kein aktives Formular hat. */
  function erzeugen(optionen) {
    var formular = optionen && optionen.formular;
    if (!formular || typeof formular !== 'object' || formular.aktiv !== true) { return null; }

    var abschnitt = knoten('section', 'panel formular');
    var adresse = adresseErlaubt(optionen.adresse);
    var felder = felderLesen(formular.felder);
    if (!adresse || !felder.length) {
      abschnitt.appendChild(knoten('p', 'hinweis', 'Dieses Formular ist noch nicht eingerichtet.'));
      return abschnitt;
    }

    var kanal = KANAL.test(text(formular.kanal)) ? text(formular.kanal) : 'bewerbung';
    var kennung = text(optionen.kennung);
    var seitenTitel = text(optionen.titel) || kennung;
    var start = Date.now();
    var sendet = false;

    var form = knoten('form', 'formular-form');
    form.noValidate = true;
    form.setAttribute('aria-label', seitenTitel + ' – Formular');

    var eingaben = [];

    function fehlerAnzeigen(eingabe, meldung) {
      eingabe.fehlerBox.textContent = meldung;
      eingabe.fehlerBox.hidden = !meldung;
      if (meldung) { eingabe.steuerung.setAttribute('aria-invalid', 'true'); } else { eingabe.steuerung.removeAttribute('aria-invalid'); }
    }

    function wertLesen(eingabe) {
      var steuerung = eingabe.steuerung;
      if (eingabe.feld.typ === 'bestaetigung') { return steuerung.checked ? 'Ja' : 'Nein'; }
      return String(steuerung.value || '').trim();
    }

    function feldBauen(feld, nummer) {
      var id = 'f-' + (kennung || 'seite') + '-' + nummer;
      var zeile = knoten('div', 'feld');
      var hinweisId = id + '-hinweis';
      var fehlerId = id + '-fehler';
      var steuerung;
      var beschriftung;

      if (feld.typ === 'bestaetigung') {
        steuerung = document.createElement('input');
        steuerung.type = 'checkbox';
        beschriftung = knoten('label', 'haken');
        beschriftung.appendChild(steuerung);
        var satz = knoten('span', '', feld.frage);
        if (feld.pflicht) { satz.appendChild(knoten('span', 'pflicht', ' *')); }
        beschriftung.appendChild(satz);
        zeile.appendChild(beschriftung);
      } else {
        beschriftung = knoten('label', 'frage', feld.frage);
        beschriftung.setAttribute('for', id);
        if (feld.pflicht) { beschriftung.appendChild(knoten('span', 'pflicht', ' *')); }
        zeile.appendChild(beschriftung);
      }

      if (feld.hinweis) {
        var hinweis = knoten('p', 'hinweis', feld.hinweis);
        hinweis.id = hinweisId;
        zeile.appendChild(hinweis);
      }

      if (feld.typ === 'langtext') {
        steuerung = document.createElement('textarea');
        steuerung.rows = 5;
        steuerung.maxLength = MAX_LANG;
      } else if (feld.typ === 'auswahl') {
        steuerung = document.createElement('select');
        var leer = document.createElement('option');
        leer.value = '';
        leer.textContent = 'Bitte wählen …';
        steuerung.appendChild(leer);
        feld.optionen.forEach(function (option) {
          var eintrag = document.createElement('option');
          eintrag.value = option;
          eintrag.textContent = option;
          steuerung.appendChild(eintrag);
        });
      } else if (feld.typ === 'zahl') {
        steuerung = document.createElement('input');
        steuerung.type = 'number';
        steuerung.step = '1';
        steuerung.inputMode = 'numeric';
        if (feld.min !== null) { steuerung.min = String(feld.min); }
        if (feld.max !== null) { steuerung.max = String(feld.max); }
      } else if (feld.typ === 'kurztext') {
        steuerung = document.createElement('input');
        steuerung.type = 'text';
        steuerung.maxLength = MAX_KURZ;
        steuerung.autocomplete = 'off';
      }

      steuerung.id = id;
      steuerung.name = id;
      if (feld.pflicht) { steuerung.setAttribute('aria-required', 'true'); }
      var fehlerBox = knoten('p', 'fehler');
      fehlerBox.id = fehlerId;
      fehlerBox.hidden = true;
      steuerung.setAttribute('aria-describedby', (feld.hinweis ? hinweisId + ' ' : '') + fehlerId);
      if (feld.typ !== 'bestaetigung') { zeile.appendChild(steuerung); }
      zeile.appendChild(fehlerBox);
      form.appendChild(zeile);
      eingaben.push({ feld: feld, steuerung: steuerung, fehlerBox: fehlerBox });
    }

    felder.forEach(feldBauen);

    /* Einwilligung: immer Pflicht, mit Link zur Datenschutzerklärung */
    var einwilligungText = text(formular.einwilligung) ||
      'Ich bin damit einverstanden, dass meine Angaben an das Team von Frankfurt RP übermittelt werden.';
    var einwilligungZeile = knoten('div', 'feld');
    var einwilligungEtikett = knoten('label', 'haken');
    var einwilligungBox = document.createElement('input');
    einwilligungBox.type = 'checkbox';
    einwilligungBox.id = 'f-' + (kennung || 'seite') + '-einwilligung';
    einwilligungBox.setAttribute('aria-required', 'true');
    einwilligungEtikett.appendChild(einwilligungBox);
    var einwilligungSatz = knoten('span', '', einwilligungText + ' ');
    var datenschutzLink = knoten('a', '', 'Datenschutzerklärung');
    datenschutzLink.href = 'datenschutz.html';
    datenschutzLink.target = '_blank';
    datenschutzLink.rel = 'noopener';
    einwilligungSatz.appendChild(datenschutzLink);
    einwilligungSatz.appendChild(knoten('span', 'pflicht', ' *'));
    einwilligungEtikett.appendChild(einwilligungSatz);
    var einwilligungFehler = knoten('p', 'fehler');
    einwilligungFehler.id = einwilligungBox.id + '-fehler';
    einwilligungFehler.hidden = true;
    einwilligungBox.setAttribute('aria-describedby', einwilligungFehler.id);
    einwilligungZeile.appendChild(einwilligungEtikett);
    einwilligungZeile.appendChild(einwilligungFehler);
    form.appendChild(einwilligungZeile);

    /* Honigtopf gegen automatische Ausfüll-Programme: Menschen sehen das Feld nicht. */
    var falle = knoten('div', 'hp');
    falle.setAttribute('aria-hidden', 'true');
    var falleEtikett = knoten('label', '', 'Dieses Feld bitte leer lassen');
    var falleFeld = document.createElement('input');
    falleFeld.type = 'text';
    falleFeld.name = 'website';
    falleFeld.tabIndex = -1;
    falleFeld.autocomplete = 'off';
    falleEtikett.appendChild(falleFeld);
    falle.appendChild(falleEtikett);
    form.appendChild(falle);

    var knopf = knoten('button', 'knopf', text(formular.knopf) || 'Absenden');
    knopf.type = 'submit';
    var status = knoten('p', 'status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var aktionen = knoten('div', 'aktionen');
    aktionen.appendChild(knopf);
    form.appendChild(aktionen);
    form.appendChild(status);
    abschnitt.appendChild(form);

    function fertig() {
      abschnitt.textContent = '';
      var kasten = knoten('div', 'formular-erfolg');
      kasten.setAttribute('role', 'status');
      kasten.tabIndex = -1;
      var nachricht = text(formular.erfolg) || 'Danke! Deine Angaben sind angekommen.';
      if (window.frankfurtRegeln && window.frankfurtRegeln.markdownZuKnoten) {
        kasten.appendChild(window.frankfurtRegeln.markdownZuKnoten(nachricht));
      } else {
        kasten.appendChild(knoten('p', '', nachricht));
      }
      abschnitt.appendChild(kasten);
      kasten.focus();
    }

    function fehlschlag(status_, daten) {
      sendet = false;
      knopf.disabled = false;
      status.textContent = fehlerNachStatus(status_, daten);
    }

    form.addEventListener('submit', function (ereignis) {
      ereignis.preventDefault();
      if (sendet) { return; }

      var ersterFehler = null;
      eingaben.forEach(function (eingabe) {
        var meldung = fehlerText(eingabe.feld, wertLesen(eingabe));
        fehlerAnzeigen(eingabe, meldung);
        if (meldung && !ersterFehler) { ersterFehler = eingabe.steuerung; }
      });
      if (!einwilligungBox.checked) {
        einwilligungFehler.textContent = 'Bitte stimme zu, damit wir deine Angaben bekommen.';
        einwilligungFehler.hidden = false;
        einwilligungBox.setAttribute('aria-invalid', 'true');
        if (!ersterFehler) { ersterFehler = einwilligungBox; }
      } else {
        einwilligungFehler.hidden = true;
        einwilligungBox.removeAttribute('aria-invalid');
      }
      if (ersterFehler) {
        status.textContent = 'Bitte prüfe die markierten Felder.';
        ersterFehler.focus();
        return;
      }

      /* Ein ausgefüllter Honigtopf ist ein Programm: scheinbar erfolgreich, aber nichts wird gesendet. */
      if (falleFeld.value) { fertig(); return; }

      sendet = true;
      knopf.disabled = true;
      status.textContent = 'Wird gesendet …';

      var nutzlast = {
        v: 1,
        kanal: kanal,
        seite: kennung,
        titel: seitenTitel,
        antworten: eingaben.map(function (eingabe) { return { frage: eingabe.feld.frage, antwort: wertLesen(eingabe) }; }),
        einwilligung: true,
        hp: '',
        t: Date.now() - start
      };
      var abbruch = typeof AbortController === 'function' ? new AbortController() : null;
      var zeitgeber = setTimeout(function () { if (abbruch) { abbruch.abort(); } }, ZEITLIMIT_MS);

      fetch(adresse, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nutzlast),
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: abbruch ? abbruch.signal : undefined
      }).then(function (antwort) {
        clearTimeout(zeitgeber);
        return antwort.json().catch(function () { return null; }).then(function (daten) {
          return { status: antwort.status, ok: antwort.ok, daten: daten };
        });
      }).then(function (ergebnis) {
        if (ergebnis.ok && ergebnis.daten && ergebnis.daten.ok === true) { fertig(); } else { fehlschlag(ergebnis.status, ergebnis.daten); }
      }).catch(function () {
        clearTimeout(zeitgeber);
        fehlschlag(0, null);
      });
    });

    return abschnitt;
  }

  window.frankfurtFormular = { erzeugen: erzeugen, felderLesen: felderLesen, fehlerText: fehlerText };
})();
