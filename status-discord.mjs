/* Frankfurt RP – meldet Änderungen des Server-Status an Discord.
   Dieses Skript läuft bei GitHub als Aktion (siehe status-discord.yml), sobald sich einstellungen.json geändert hat,
   also zum Beispiel, wenn im Admin der Server-Status umgestellt und gespeichert wird.

   Es vergleicht den Stand vor und nach der Änderung:
   - Hat sich der Server-Status auf Online, Wartung, Offline oder Im Aufbau geändert, geht eine Nachricht an Discord.
   - Hat sich der "Zusatztext für Discord" geändert und ist nicht leer, geht ebenfalls eine Nachricht an Discord.
   - Alles andere (zum Beispiel ein geänderter Link) löst nichts aus.
   Der Webhook-Link steht als Geheimnis bei GitHub (DISCORD_STATUS_WEBHOOK), nie in dieser Datei und nie auf der Website. */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const STATUS = {
  online: { titel: 'Server online', farbe: 0x22c55e, text: 'Der Server ist wieder erreichbar.' },
  wartung: { titel: 'Wartungsarbeiten', farbe: 0xf59e0b, text: 'Wir führen gerade Wartungsarbeiten durch. Der Server ist bald wieder da.' },
  offline: { titel: 'Server offline', farbe: 0xef4444, text: 'Der Server ist gerade nicht erreichbar.' },
  im_aufbau: { titel: 'Server im Aufbau', farbe: 0xfa3019, text: 'Der Server befindet sich noch im Aufbau.' }
};
const WEBHOOK_MUSTER = /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,120}$/;
const MAX_TEXT = 1500;

function kuerzen(text, max) {
  const zeichen = Array.from(String(text || ''));
  return zeichen.length > max ? zeichen.slice(0, Math.max(1, max - 1)).join('').trimEnd() + '…' : zeichen.join('');
}

/* Liest aus einstellungen.json, was für die Meldung wichtig ist. Fehlende oder falsche Werte werden ignoriert. */
export function zustand(daten) {
  const d = daten && typeof daten === 'object' && !Array.isArray(daten) ? daten : {};
  const roh = typeof d.server_status === 'string' ? d.server_status.trim() : '';
  const status = Object.prototype.hasOwnProperty.call(STATUS, roh) ? roh : 'eigener_text';
  const text = typeof d.status_discord_text === 'string'
    ? d.status_discord_text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
    : '';
  const link = typeof d.verbinden_link === 'string' && /^https:\/\/\S+$/.test(d.verbinden_link.trim()) ? d.verbinden_link.trim() : '';
  return { status, text: kuerzen(text, MAX_TEXT), link };
}

/* Entscheidet, ob eine Nachricht gesendet wird. Gibt null zurück, wenn nicht. */
export function plan(alt, neu) {
  const vorher = zustand(alt);
  const jetzt = zustand(neu);
  const statusNeu = jetzt.status !== 'eigener_text' && jetzt.status !== vorher.status;
  const textNeu = jetzt.text !== '' && jetzt.text !== vorher.text;
  if (!statusNeu && !textNeu) { return null; }
  return { statusNeu, textNeu, status: jetzt.status, text: jetzt.text, link: jetzt.link };
}

function pingEinstellung(ping) {
  const wert = typeof ping === 'string' ? ping.trim() : '';
  if (wert === 'everyone') { return { content: '@everyone', allowed_mentions: { parse: ['everyone'] } }; }
  if (wert === 'here') { return { content: '@here', allowed_mentions: { parse: ['everyone'] } }; }
  if (/^\d{5,25}$/.test(wert)) { return { content: '<@&' + wert + '>', allowed_mentions: { roles: [wert] } }; }
  return { allowed_mentions: { parse: [] } };
}

/* Baut die Discord-Nachricht. */
export function nachricht(geplant, ping) {
  const vorgabe = STATUS[geplant.status];
  const teile = [];
  if (geplant.statusNeu && vorgabe) { teile.push(vorgabe.text); }
  if (geplant.text) { teile.push(geplant.text); }
  const embed = {
    title: geplant.statusNeu && vorgabe ? vorgabe.titel : 'Mitteilung',
    color: geplant.statusNeu && vorgabe ? vorgabe.farbe : 0x5865f2,
    description: kuerzen(teile.join('\n\n'), 3500),
    footer: { text: 'frankfurt-rp.xyz' },
    timestamp: new Date().toISOString()
  };
  if (geplant.status === 'online' && geplant.link) { embed.fields = [{ name: 'Direkt verbinden', value: geplant.link }]; }
  return { username: 'Frankfurt RP Server-Status', embeds: [embed], ...pingEinstellung(ping) };
}

export async function ausfuehren({ webhook, ping, alt, neu, holen = fetch }) {
  const adresse = typeof webhook === 'string' ? webhook.trim() : '';
  if (!WEBHOOK_MUSTER.test(adresse)) { throw new Error('Das Geheimnis DISCORD_STATUS_WEBHOOK ist kein gültiger Discord-Webhook-Link.'); }
  const geplant = plan(alt, neu);
  if (!geplant) { return { gesendet: false }; }
  const antwort = await holen(adresse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nachricht(geplant, ping))
  });
  if (!antwort.ok) { throw new Error('Discord hat mit Status ' + antwort.status + ' geantwortet.'); }
  return { gesendet: true };
}

function dateiAus(commit) {
  try {
    return JSON.parse(execFileSync('git', ['show', commit + ':einstellungen.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch (fehler) {
    return null;
  }
}

/* Start durch die GitHub-Aktion */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const webhook = (process.env.DISCORD_STATUS_WEBHOOK || '').trim();
  const vor = (process.env.VOR_COMMIT || '').trim();
  const nach = (process.env.NACH_COMMIT || 'HEAD').trim();
  if (!webhook) {
    console.log('Das Geheimnis DISCORD_STATUS_WEBHOOK ist nicht eingerichtet. Es wird nichts gesendet.');
  } else if (!vor || /^0+$/.test(vor)) {
    console.log('Kein früherer Stand vorhanden. Es wird nichts gesendet.');
  } else {
    const neu = dateiAus(nach);
    if (!neu) {
      console.log('einstellungen.json ist nicht lesbar. Es wird nichts gesendet.');
    } else {
      try {
        const ergebnis = await ausfuehren({ webhook, ping: process.env.DISCORD_STATUS_PING, alt: dateiAus(vor), neu });
        console.log(ergebnis.gesendet ? 'Nachricht an Discord gesendet.' : 'Keine Änderung beim Status, es wird nichts gesendet.');
      } catch (fehler) {
        console.error('Fehler: ' + fehler.message);
        process.exit(1);
      }
    }
  }
}
