/* Frankfurt RP – zeigt die Regelwerke aus den Datendateien (regeln-*.json) an.
   Die Texte werden in der Verwaltung (/admin) bearbeitet und als Markdown gespeichert.
   Dieses Skript wandelt das Markdown sicher in Seiteninhalt um:
   - Es entstehen nur bekannte Elemente (Überschriften, Absätze, Listen, Hinweiskästen, fett, kursiv, Links).
   - Rohes HTML wird nie übernommen, Text wird immer als Text eingesetzt.
   - Links sind nur mit https://, http:// oder mailto: erlaubt.
   Es werden nur Dateien von dieser Domain geladen. */
(function () {
  'use strict';

  var SATZZEICHEN = /[\\`*_{}\[\]()#+\-.!|<>~"'&:]/;
  var BUCHSTABE_ODER_ZIFFER = /[\p{L}\p{N}]/u;
  var UEBERSCHRIFT = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
  var TRENNLINIE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  var ZITAT = /^ {0,3}>[ \t]?(.*)$/;
  var LISTENPUNKT = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
  var REGELNUMMER = /^(?:\*\*)?(\d+(?:\\?\.\d+)+\\?\.?)(?:\*\*)?[ \t]+([\s\S]*)$/;
  var ABSCHNITTSNUMMER = /^(\d+\\?\.)[ \t]+([\s\S]*)$/;

  /* ---------- Hilfsfunktionen ---------- */

  function knoten(name, klasse, text) {
    var k = document.createElement(name);
    if (klasse) { k.className = klasse; }
    if (text) { k.textContent = text; }
    return k;
  }

  /* Erlaubt sind Links nach außen (https, http, mailto) und Links auf Seiten dieser Website (zum Beispiel impressum.html). */
  var SEITENLINK = /^[A-Za-z0-9][A-Za-z0-9._\-]*\.html(\?[A-Za-z0-9=&_.\-]*)?(#[A-Za-z0-9_\-]+)?$/;

  function sichererLink(adresse) {
    var text = (adresse || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(text) || SEITENLINK.test(text) ? text : '';
  }

  function ohneMaskierung(text) {
    return text.replace(/\\/g, '');
  }

  /* ---------- Inline: **fett**, _kursiv_, [Text](Link), `Code`, Zeilenumbruch ---------- */

  function schlussmarke(text, marke, von, zeichen) {
    var suche = von;
    while (suche < text.length) {
      var k = text.indexOf(marke, suche);
      if (k < 0) { return -1; }
      var vorher = text.charAt(k - 1);
      var nachher = text.charAt(k + marke.length);
      if (marke.length === 1 && (nachher === zeichen || vorher === zeichen)) { suche = k + 1; continue; }
      var passt = k > von && vorher !== '\\' && !/\s/.test(vorher) &&
        (zeichen === '*' || nachher === '' || !BUCHSTABE_ODER_ZIFFER.test(nachher));
      if (passt) { return k; }
      suche = k + 1;
    }
    return -1;
  }

  function inlineEinfuegen(text, ziel) {
    var puffer = '';
    var i = 0;

    function leeren() {
      if (puffer) { ziel.appendChild(document.createTextNode(puffer)); puffer = ''; }
    }

    while (i < text.length) {
      var zeichen = text.charAt(i);

      if (zeichen === '\\') {
        var maskiert = text.charAt(i + 1);
        if (maskiert === '\n') { leeren(); ziel.appendChild(knoten('br')); i += 2; continue; }
        if (maskiert && SATZZEICHEN.test(maskiert)) { puffer += maskiert; i += 2; continue; }
        puffer += zeichen; i += 1; continue;
      }

      if (zeichen === '\n') {
        puffer = puffer.replace(/ +$/, '');
        leeren();
        ziel.appendChild(knoten('br'));
        i += 1;
        continue;
      }

      if (zeichen === '`') {
        var codeEnde = text.indexOf('`', i + 1);
        if (codeEnde > i + 1) {
          leeren();
          ziel.appendChild(knoten('code', '', text.slice(i + 1, codeEnde)));
          i = codeEnde + 1;
          continue;
        }
      }

      if (zeichen === '*' || zeichen === '_') {
        var laenge = 1;
        while (laenge < 3 && text.charAt(i + laenge) === zeichen) { laenge += 1; }
        var marke = new Array(laenge + 1).join(zeichen);
        var danach = text.charAt(i + laenge);
        var davor = i > 0 ? text.charAt(i - 1) : '';
        var oeffnet = danach !== '' && !/\s/.test(danach) &&
          (zeichen === '*' || davor === '' || !BUCHSTABE_ODER_ZIFFER.test(davor));
        if (oeffnet) {
          var ende = schlussmarke(text, marke, i + laenge, zeichen);
          if (ende > -1) {
            leeren();
            var aussen = knoten(laenge === 1 ? 'em' : 'strong');
            var innen = aussen;
            if (laenge === 3) { innen = knoten('em'); aussen.appendChild(innen); }
            inlineEinfuegen(text.slice(i + laenge, ende), innen);
            ziel.appendChild(aussen);
            i = ende + laenge;
            continue;
          }
        }
        puffer += marke; i += laenge; continue;
      }

      if (zeichen === '[') {
        var linkTreffer = /^\[([^\]]*)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+"[^"]*")?\s*\)/.exec(text.slice(i));
        if (linkTreffer) {
          leeren();
          var adresse = sichererLink(linkTreffer[2]);
          if (adresse) {
            var link = knoten('a');
            link.href = adresse;
            if (/^https?:/i.test(adresse)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
            inlineEinfuegen(linkTreffer[1], link);
            ziel.appendChild(link);
          } else {
            inlineEinfuegen(linkTreffer[1], ziel);
          }
          i += linkTreffer[0].length;
          continue;
        }
      }

      if (zeichen === '<') {
        var autoTreffer = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(text.slice(i));
        if (autoTreffer) {
          leeren();
          var autoLink = knoten('a', '', autoTreffer[1]);
          autoLink.href = autoTreffer[1];
          if (/^https?:/i.test(autoTreffer[1])) { autoLink.target = '_blank'; autoLink.rel = 'noopener noreferrer'; }
          ziel.appendChild(autoLink);
          i += autoTreffer[0].length;
          continue;
        }
      }

      puffer += zeichen;
      i += 1;
    }
    leeren();
  }

  /* ---------- Blöcke: Überschriften, Absätze, Listen, Hinweise, Trennlinie ---------- */

  function einzugsbreite(leerraum) {
    return leerraum.replace(/\t/g, '    ').length;
  }

  function listenpunktUnterbrichtAbsatz(zeile) {
    var m = LISTENPUNKT.exec(zeile);
    return Boolean(m) && (/^[-*+]$/.test(m[2]) || /^1[.)]$/.test(m[2]));
  }

  function blockanfang(zeile) {
    return UEBERSCHRIFT.test(zeile) || TRENNLINIE.test(zeile) || ZITAT.test(zeile) || listenpunktUnterbrichtAbsatz(zeile);
  }

  function neueListe(geordnet) {
    return { art: 'liste', geordnet: geordnet, eintraege: [] };
  }

  function listeLesen(zeilen, start) {
    var i = start;
    var wurzel = null;
    var stapel = [];

    while (i < zeilen.length) {
      var zeile = zeilen[i];

      if (/^\s*$/.test(zeile)) {
        var j = i + 1;
        while (j < zeilen.length && /^\s*$/.test(zeilen[j])) { j += 1; }
        var folgt = j < zeilen.length ? LISTENPUNKT.exec(zeilen[j]) : null;
        if (folgt && einzugsbreite(folgt[1]) >= stapel[0].einzug) { i = j; continue; }
        break;
      }

      var m = LISTENPUNKT.exec(zeile);
      if (m) {
        var einzug = einzugsbreite(m[1]);
        var geordnet = /\d/.test(m[2]);
        if (!stapel.length) {
          wurzel = neueListe(geordnet);
          stapel.push({ einzug: einzug, liste: wurzel });
        } else {
          while (stapel.length > 1 && einzug < stapel[stapel.length - 1].einzug) { stapel.pop(); }
          var oben = stapel[stapel.length - 1];
          if (einzug > oben.einzug && oben.liste.eintraege.length) {
            var tiefer = neueListe(geordnet);
            oben.liste.eintraege[oben.liste.eintraege.length - 1].kinder.push(tiefer);
            stapel.push({ einzug: einzug, liste: tiefer });
          }
        }
        stapel[stapel.length - 1].liste.eintraege.push({ text: m[3], kinder: [] });
        i += 1;
        continue;
      }

      if (blockanfang(zeile)) { break; }
      var eintraege = stapel[stapel.length - 1].liste.eintraege;
      eintraege[eintraege.length - 1].text += ' ' + zeile.trim();
      i += 1;
    }
    return { block: wurzel, naechste: i };
  }

  function bloeckeLesen(zeilen) {
    var ergebnis = [];
    var i = 0;

    while (i < zeilen.length) {
      var zeile = zeilen[i];

      if (/^\s*$/.test(zeile)) { i += 1; continue; }

      var ueberschrift = UEBERSCHRIFT.exec(zeile);
      if (ueberschrift) {
        ergebnis.push({ art: 'ueberschrift', ebene: ueberschrift[1].length, text: ueberschrift[2] });
        i += 1;
        continue;
      }

      if (TRENNLINIE.test(zeile)) { ergebnis.push({ art: 'linie' }); i += 1; continue; }

      if (ZITAT.test(zeile)) {
        var innen = [];
        while (i < zeilen.length) {
          var zitatZeile = ZITAT.exec(zeilen[i]);
          if (zitatZeile) { innen.push(zitatZeile[1]); i += 1; continue; }
          if (zeilen[i].trim() && innen.length && !blockanfang(zeilen[i])) { innen.push(zeilen[i]); i += 1; continue; }
          break;
        }
        ergebnis.push({ art: 'zitat', kinder: bloeckeLesen(innen) });
        continue;
      }

      if (LISTENPUNKT.test(zeile)) {
        var liste = listeLesen(zeilen, i);
        ergebnis.push(liste.block);
        i = liste.naechste;
        continue;
      }

      var teile = [zeile.replace(/^\s+/, '')];
      i += 1;
      while (i < zeilen.length && zeilen[i].trim() && !blockanfang(zeilen[i])) {
        teile.push(zeilen[i].replace(/^\s+/, ''));
        i += 1;
      }
      ergebnis.push({ art: 'absatz', text: teile.join('\n') });
    }
    return ergebnis;
  }

  /* ---------- Aus den Blöcken die Elemente der Seite bauen ---------- */

  function listeBauen(block, klasse) {
    var liste = knoten(block.geordnet ? 'ol' : 'ul', klasse);
    block.eintraege.forEach(function (eintrag) {
      var punkt = knoten('li');
      inlineEinfuegen(eintrag.text, punkt);
      eintrag.kinder.forEach(function (kind) { punkt.appendChild(listeBauen(kind)); });
      liste.appendChild(punkt);
    });
    return liste;
  }

  function inhaltBauen(bloecke) {
    var ergebnis = document.createDocumentFragment();
    var ziel = ergebnis;
    var letzteRegel = null;

    bloecke.forEach(function (block) {
      if (block.art === 'ueberschrift') {
        letzteRegel = null;
        var stufe = Math.min(4, Math.max(2, block.ebene));
        var ueberschrift = knoten('h' + stufe);
        var nummer = ABSCHNITTSNUMMER.exec(block.text);
        if (nummer) {
          ueberschrift.appendChild(knoten('span', 'num', ohneMaskierung(nummer[1])));
          ueberschrift.appendChild(document.createTextNode(' '));
          inlineEinfuegen(nummer[2], ueberschrift);
        } else {
          inlineEinfuegen(block.text, ueberschrift);
        }
        ziel.appendChild(ueberschrift);
        return;
      }

      if (block.art === 'linie') {
        letzteRegel = null;
        ziel = knoten('div', 'closing');
        ergebnis.appendChild(ziel);
        return;
      }

      if (block.art === 'zitat') {
        letzteRegel = null;
        var kasten = knoten('div', 'note');
        kasten.appendChild(inhaltBauen(block.kinder));
        ziel.appendChild(kasten);
        return;
      }

      if (block.art === 'liste') {
        if (letzteRegel) {
          var istBeispiel = /Beispiele:?\s*$/i.test(letzteRegel.roh);
          letzteRegel.text.appendChild(listeBauen(block, istBeispiel ? 'examples' : 'sublist'));
        } else {
          ziel.appendChild(listeBauen(block, 'plain'));
        }
        return;
      }

      var regelTreffer = REGELNUMMER.exec(block.text);
      if (regelTreffer) {
        var regel = knoten('div', 'regel');
        var regelText = knoten('div', 'regel-text');
        regel.appendChild(knoten('span', 'num', ohneMaskierung(regelTreffer[1])));
        inlineEinfuegen(regelTreffer[2], regelText);
        regel.appendChild(regelText);
        ziel.appendChild(regel);
        letzteRegel = { text: regelText, roh: regelTreffer[2] };
        return;
      }

      letzteRegel = null;
      var absatz = knoten('p');
      inlineEinfuegen(block.text, absatz);
      ziel.appendChild(absatz);
    });

    return ergebnis;
  }

  function markdownZuKnoten(markdown) {
    var text = String(markdown || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    return inhaltBauen(bloeckeLesen(text.split('\n')));
  }

  /* ---------- Stand: Monat der letzten Änderung ---------- */

  /* Monat im Format 11.2026, gerechnet nach deutscher Zeit (gleiche Funktion wie in site.js). */
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

  /* Monat der letzten Änderung der Datei laut Server (Last-Modified), leer wenn nicht bekannt. */
  function monatAusAntwort(antwort) {
    try {
      var kopf = antwort.headers.get('Last-Modified');
      var zeit = kopf ? new Date(kopf) : null;
      return zeit && !isNaN(zeit.getTime()) ? monatText(zeit) : '';
    } catch (fehler) {
      return '';
    }
  }

  /* {monat} im Text wird durch den Monat ersetzt. Ist der Monat nicht bekannt, bleibt der Text leer,
     damit nie "{monat}" auf der Seite steht. */
  function standMitMonat(text, monat) {
    var klar = String(text || '').trim();
    if (!/\{monat\}/i.test(klar)) { return klar; }
    return monat ? klar.replace(/\{monat\}/gi, monat) : '';
  }

  function dokumentZuKnoten(daten, monat) {
    var ergebnis = document.createDocumentFragment();
    var titel = daten && typeof daten.dokumenttitel === 'string' ? daten.dokumenttitel.trim() : '';
    var stand = daten && typeof daten.stand === 'string' ? standMitMonat(daten.stand, monat) : '';
    if (titel) { ergebnis.appendChild(knoten('p', 'doc-title', titel)); }
    if (stand) { ergebnis.appendChild(knoten('p', 'doc-meta', stand)); }
    ergebnis.appendChild(markdownZuKnoten(daten ? daten.inhalt : ''));
    return ergebnis;
  }

  /* ---------- Seite laden ---------- */

  function seiteLaden(behaelter) {
    var quelle = behaelter.getAttribute('data-quelle');
    if (!quelle) { return; }

    fetch(quelle, { cache: 'no-cache' }).then(function (antwort) {
      if (!antwort.ok) { throw new Error(quelle + ': ' + antwort.status); }
      var monat = monatAusAntwort(antwort);
      return antwort.json().then(function (daten) { return { daten: daten, monat: monat }; });
    }).then(function (ergebnis) {
      behaelter.textContent = '';
      behaelter.appendChild(dokumentZuKnoten(ergebnis.daten, ergebnis.monat));
      behaelter.removeAttribute('aria-busy');
    }).catch(function () {
      behaelter.textContent = '';
      behaelter.appendChild(knoten('p', '', 'Das Regelwerk konnte gerade nicht geladen werden. Bitte lade die Seite neu oder versuche es später noch einmal.'));
      behaelter.removeAttribute('aria-busy');
    });
  }

  window.frankfurtRegeln = { markdownZuKnoten: markdownZuKnoten, dokumentZuKnoten: dokumentZuKnoten };

  Array.prototype.forEach.call(document.querySelectorAll('[data-quelle]'), seiteLaden);
})();
