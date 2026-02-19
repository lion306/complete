/**
 * Lead Email Parser Service
 * Parses incoming leads from Mobile.de and AutoScout24 emails via IMAP
 * Extracts: Name, Telefon, Email, Fahrzeug-ID/VIN
 * Assigns to correct seller pool based on vehicle / location
 */
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ---- Regex-Patterns for each portal ----
const PATTERNS = {
  mobilede: {
    detect: /mobile\.de/i,
    name: /(?:Interessent|Name|Von):\s*([^\n<]+)/i,
    email: /(?:E-Mail|Email):\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    phone: /(?:Telefon|Tel\.?|Mobil):\s*([\d\s\+\-\/\(\)]+)/i,
    vehicle: /(?:Fahrzeug-ID|Ins.-Nr|Anzeigen-ID):\s*(\d+)/i,
    vin: /(?:FIN|VIN|Fahrgestellnummer):\s*([A-HJ-NPR-Z0-9]{17})/i,
    message: /(?:Nachricht|Anfrage):\s*([\s\S]+?)(?:\n--|$)/i,
  },
  autoscout: {
    detect: /autoscout24\.de|autoscout24\.com/i,
    name: /(?:Von|Anfrage von|Kontakt):\s*([^\n<]+)/i,
    email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    phone: /(?:Telefon|Tel|Mobil|Phone):\s*([\d\s\+\-\/\(\)]+)/i,
    vehicle: /(?:Anzeigen-ID|ID|Fahrzeug-Nr)\.?:\s*(\d+)/i,
    vin: /([A-HJ-NPR-Z0-9]{17})/,
    message: /(?:Nachricht|Kommentar|Message):\s*([\s\S]+?)(?:\n\n|$)/i,
  },
  generic: {
    detect: /.*/,
    name: /(?:Vor- und Nachname|Name|Sender):\s*([^\n<]+)/i,
    email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    phone: /(?:Telefon|Tel|Handy|Mobil):\s*([\d\s\+\-\/\(\)]+)/i,
    vehicle: /(?:Fahrzeug|VIN|FIN).*?([A-HJ-NPR-Z0-9]{17}|\d{6,})/i,
    vin: /([A-HJ-NPR-Z0-9]{17})/,
    message: /([\s\S]+)/,
  },
};

function extract(text, pattern) {
  const m = text.match(pattern);
  return m ? m[1].trim() : null;
}

function detectPortal(from, subject, body) {
  if (PATTERNS.mobilede.detect.test(from + subject + body)) return 'mobilede';
  if (PATTERNS.autoscout.detect.test(from + subject + body)) return 'autoscout';
  return 'email';
}

function parseLeadFromEmail(parsed) {
  const body = parsed.text || parsed.html || '';
  const from = parsed.from?.text || '';
  const subject = parsed.subject || '';

  const portal = detectPortal(from, subject, body);
  const p = PATTERNS[portal === 'email' ? 'generic' : portal];

  let nameParts = (extract(body, p.name) || '').split(/\s+/).filter(Boolean);
  const vorname = nameParts.slice(0, -1).join(' ') || nameParts[0] || null;
  const nachname = nameParts.slice(-1)[0] || null;

  const email = extract(body, p.email) || parsed.from?.value?.[0]?.address || null;
  const telefon = extract(body, p.phone)?.replace(/[^\d\+\-\s]/g, '').trim() || null;
  const portal_vehicle_id = extract(body, p.vehicle);
  const vin = extract(body, p.vin);
  const nachricht = extract(body, p.message);

  return {
    vorname,
    nachname,
    email,
    telefon,
    herkunft: portal,
    portal_vehicle_id,
    vin,
    nachricht,
    roh_email: body,
    email_betreff: subject,
    email_empfangen_am: parsed.date || new Date(),
    email_absender: from,
  };
}

async function findFahrzeugByPortalId(portal, portalId, vin) {
  if (vin) {
    const fz = await db('fahrzeuge').where({ vin }).first();
    if (fz) return fz;
  }
  if (portalId && portal === 'mobilede') {
    const fz = await db('fahrzeuge').where({ mobilede_ad_id: portalId }).first();
    if (fz) return fz;
  }
  if (portalId && portal === 'autoscout') {
    const fz = await db('fahrzeuge').where({ autoscout_ad_id: portalId }).first();
    if (fz) return fz;
  }
  return null;
}

async function assignLeadToSeller(fahrzeug) {
  if (!fahrzeug) return null;
  // Assign to responsible user or first active seller at that location
  if (fahrzeug.zustaendiger_nutzer_id) return fahrzeug.zustaendiger_nutzer_id;

  const seller = await db('nutzer')
    .where({ standort_id: fahrzeug.standort_id, rolle: 'verkaefer', aktiv: true })
    .first();
  return seller?.id || null;
}

async function saveLead(leadData) {
  const { vorname, nachname, email, telefon, herkunft, vin, portal_vehicle_id,
    nachricht, roh_email, email_betreff, email_empfangen_am, email_absender, fahrzeug } = leadData;

  // Deduplicate: check for same email + same vehicle in last 24h
  if (email && fahrzeug) {
    const existing = await db('leads')
      .where({ email, fahrzeug_id: fahrzeug.id })
      .where('erstellt_am', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .first();
    if (existing) {
      logger.info(`Duplicate lead skipped: ${email} for ${fahrzeug.intern_nummer}`);
      return null;
    }
  }

  const id = uuidv4();
  const zugewiesen_an = await assignLeadToSeller(fahrzeug);

  const lead = {
    id,
    vorname,
    nachname,
    email,
    telefon,
    herkunft,
    fahrzeug_id: fahrzeug?.id || null,
    standort_id: fahrzeug?.standort_id || null,
    zugewiesen_an,
    roh_email,
    email_betreff,
    email_empfangen_am,
    email_absender,
    notizen: nachricht,
    status: 'neu',
  };

  await db('leads').insert(lead);
  logger.info(`New lead created: ${vorname} ${nachname} (${herkunft})`, { fahrzeug: fahrzeug?.intern_nummer });
  return id;
}

function createImapConnection() {
  return new Imap({
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT) || 993,
    tls: process.env.IMAP_TLS !== 'false',
    tlsOptions: { rejectUnauthorized: false },
    keepalive: false,
  });
}

async function fetchUnseenEmails() {
  return new Promise((resolve, reject) => {
    if (!process.env.IMAP_HOST) {
      logger.warn('IMAP not configured, skipping email fetch');
      return resolve([]);
    }

    const imap = createImapConnection();
    const leads = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) { imap.end(); return reject(err); }

        imap.search(['UNSEEN', ['FROM', 'mobile.de'], ['OR', ['FROM', 'autoscout24.de'], ['FROM', 'autoscout24.com']]], (err, results) => {
          if (err || !results?.length) { imap.end(); return resolve([]); }

          const fetch = imap.fetch(results, { bodies: '', markSeen: true });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, async (err, parsed) => {
                if (err) return;
                try {
                  const leadInfo = parseLeadFromEmail(parsed);
                  const fahrzeug = await findFahrzeugByPortalId(
                    leadInfo.herkunft, leadInfo.portal_vehicle_id, leadInfo.vin
                  );
                  const leadId = await saveLead({ ...leadInfo, fahrzeug });
                  if (leadId) leads.push(leadId);
                } catch (e) {
                  logger.error('Error saving lead:', e);
                }
              });
            });
          });

          fetch.once('end', () => { imap.end(); });
          fetch.once('error', (e) => { logger.error('Fetch error:', e); imap.end(); });
        });
      });
    });

    imap.once('end', () => resolve(leads));
    imap.once('error', (err) => { logger.error('IMAP error:', err); resolve([]); });
    imap.connect();
  });
}

// Parse a raw email string (for manual upload / testing)
async function parseRawEmail(rawEmail) {
  const { simpleParser } = require('mailparser');
  const parsed = await simpleParser(rawEmail);
  const leadInfo = parseLeadFromEmail(parsed);
  const fahrzeug = await findFahrzeugByPortalId(leadInfo.herkunft, leadInfo.portal_vehicle_id, leadInfo.vin);
  return { leadInfo, fahrzeug };
}

module.exports = { fetchUnseenEmails, parseLeadFromEmail, parseRawEmail, saveLead };
