/**
 * OCR / PDF-Parser Service
 * ========================
 * Extracts damage positions and repair costs from automotive expert reports (Gutachten).
 *
 * Strategy (two-tier):
 *   1. Regex-based extraction  – fast, no external API, covers most standard formats
 *   2. AI-based extraction     – OpenAI GPT-4o (optional, requires OPENAI_API_KEY)
 *
 * Supports PDF and plain-text inputs.
 * Extracted data is stored as JSON in gutachten.ocr_ergebnis.
 */

const pdfParse  = require('pdf-parse');
const fs        = require('fs');
const path      = require('path');
const { v4: uuidv4 } = require('uuid');
const db        = require('../config/database');
const logger    = require('../utils/logger');

// ─── Keyword patterns for German automotive expert reports ───────────────────

const DAMAGE_KEYWORDS = [
  'delle', 'dellen', 'beule', 'beulen', 'kratzer', 'lackschaden', 'lackierung',
  'instandsetzung', 'instandsetzungskosten', 'reparatur', 'reparaturkosten',
  'erneuerung', 'austausch', 'beilackierung', 'smart-repair', 'smartrepair',
  'richtarbeit', 'richtarbeiten', 'karosserie', 'schwellerprofil', 'stoßstange',
  'kotflügel', 'tür', 'haube', 'heckklappe', 'scheibe', 'scheinwerfer',
  'bremsscheibe', 'reifen', 'felge', 'spiegel', 'stoßfänger', 'frontstoßfänger',
  'heckstoßfänger', 'kühlergrill', 'motorhaube', 'heckspoiler', 'seitenschweller',
];

const COST_PATTERN     = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:€|EUR|eur)/gi;
const LINE_COST_PATTERN = /^(.*?)\s{2,}(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(?:€|EUR)?\s*$/;
const SECTION_PATTERN   = /^((?:Pos(?:ition)?\.?\s*\d+|[\d]+[.)]\s+|\*\s+).+)/gm;

// German decimal → JS number  (1.234,56 → 1234.56)
function parseGermanNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── Regex-based extractor ────────────────────────────────────────────────────

function extractWithRegex(text) {
  const lines      = text.split('\n').map(l => l.trim()).filter(Boolean);
  const positions  = [];
  let   posNr      = 1;
  let   currentSection = '';

  // Detect section headers (Karosserie, Mechanik, Elektronik, etc.)
  const SECTION_HEADERS = [
    /karosserie/i, /lack(?:ierung)?/i, /mechanik/i, /elektronik/i,
    /innenraum/i, /scheibe/i, /reifen/i, /achse/i, /motor/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section header
    for (const pat of SECTION_HEADERS) {
      if (pat.test(line) && line.length < 60) {
        currentSection = line;
        break;
      }
    }

    // Check if line contains damage keyword + cost
    const lcLine      = line.toLowerCase();
    const hasDamage   = DAMAGE_KEYWORDS.some(k => lcLine.includes(k));
    const costMatches = line.match(COST_PATTERN);

    if (!hasDamage && !costMatches) continue;

    // Try structured cost extraction
    let kostBrutto = null;
    if (costMatches) {
      const last = costMatches[costMatches.length - 1];
      kostBrutto = parseGermanNumber(last.replace(/[€EUReur\s]/g, ''));
    } else {
      // Look ahead one line for cost
      const nextLine = lines[i + 1] || '';
      const nc       = nextLine.match(COST_PATTERN);
      if (nc) kostBrutto = parseGermanNumber(nc[0].replace(/[€EUReur\s]/g, ''));
    }

    if (!kostBrutto && !hasDamage) continue;

    // Determine area from line
    const bereich = extractBereich(line);

    positions.push({
      position_nr:   posNr++,
      kategorie:     currentSection || 'Allgemein',
      beschreibung:  line.replace(COST_PATTERN, '').trim().slice(0, 400),
      bereich,
      kosten_brutto: kostBrutto,
      kosten_netto:  kostBrutto ? Math.round((kostBrutto / 1.19) * 100) / 100 : null,
      mwst_satz:     19.00,
      ursprung:      'ocr',
      ocr_konfidenz: kostBrutto ? 75 : 40,
    });
  }

  const kosten_gesamt = positions.reduce((a, p) => a + (p.kosten_brutto || 0), 0);

  return {
    methode:        'regex',
    positionen:     positions,
    kosten_gesamt:  Math.round(kosten_gesamt * 100) / 100,
    rohdaten_zeilen: lines.length,
  };
}

function extractBereich(text) {
  const BEREICHE = [
    ['vorderkotflügel links',  'Vorderkotflügel links'],
    ['vorderkotflügel rechts', 'Vorderkotflügel rechts'],
    ['heckkotflügel links',    'Heckkotflügel links'],
    ['heckkotflügel rechts',   'Heckkotflügel rechts'],
    ['fahrertür',              'Fahrertür'],
    ['beifahrertür',           'Beifahrertür'],
    ['motorhaube',             'Motorhaube'],
    ['heckklappe',             'Heckklappe'],
    ['frontstoßstange',        'Frontstoßstange'],
    ['heckstoßstange',         'Heckstoßstange'],
    ['dach',                   'Dach'],
    ['schweller links',        'Schweller links'],
    ['schweller rechts',       'Schweller rechts'],
    ['stoßfänger',             'Stoßfänger'],
    ['scheinwerfer',           'Scheinwerfer'],
    ['rückleuchte',            'Rückleuchte'],
    ['felge',                  'Felge'],
    ['windschutzscheibe',      'Windschutzscheibe'],
  ];
  const lc = text.toLowerCase();
  for (const [key, label] of BEREICHE) {
    if (lc.includes(key)) return label;
  }
  return null;
}

// ─── AI-based extractor (OpenAI) ─────────────────────────────────────────────

async function extractWithAI(text, fahrzeugInfo = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set, falling back to regex extraction');
    return null;
  }

  const prompt = `Du bist ein Kfz-Gutachten-Analyse-Assistent.
Analysiere den folgenden deutschen Kfz-Gutachten-Text und extrahiere ALLE Schadenspositionen als strukturiertes JSON.

Fahrzeug: ${fahrzeugInfo.marke || ''} ${fahrzeugInfo.modell || ''} (${fahrzeugInfo.vin || 'unbekannt'})

Gutachten-Text:
"""
${text.slice(0, 8000)}
"""

Gib exakt dieses JSON zurück (kein Markdown, kein Erklärungstext):
{
  "positionen": [
    {
      "position_nr": 1,
      "kategorie": "Karosserie",
      "beschreibung": "Delle im Vorderkotflügel links, Smart Repair",
      "bereich": "Vorderkotflügel links",
      "kosten_brutto": 180.00,
      "kosten_netto": 151.26,
      "mwst_satz": 19.00,
      "ocr_konfidenz": 95
    }
  ],
  "kosten_gesamt": 1234.56,
  "gutachter": "Name des Gutachters falls gefunden",
  "gutachten_datum": "YYYY-MM-DD oder null",
  "fahrzeug_km": null
}

Regeln:
- Alle Beträge als Dezimalzahl (Punkt als Trennzeichen)
- Nur echte Kostenpositionen einschließen (keine Summenzeilen)
- ocr_konfidenz: 0-100, wie sicher du dir bei Betrag und Beschreibung bist`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages:    [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens:  4096,
      }),
    });

    if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status}`);
    const data = await resp.json();
    const raw  = data.choices?.[0]?.message?.content?.trim();

    // Parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');
    const result = JSON.parse(jsonMatch[0]);

    return { methode: 'ai_gpt', ...result };
  } catch (err) {
    logger.error('AI OCR extraction failed:', err);
    return null;
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Process a PDF file: extract text, run extraction, save to DB.
 * @param {string} gutachtenId  - UUID of the gutachten record
 * @param {string} filePath     - absolute path to PDF
 * @param {object} fahrzeugInfo - { marke, modell, vin }
 */
async function processPDF(gutachtenId, filePath, fahrzeugInfo = {}) {
  logger.info(`OCR: starting PDF processing for gutachten ${gutachtenId}`);

  // Mark as processing
  await db('gutachten').where({ id: gutachtenId }).update({
    ocr_status: 'verarbeitung',
    aktualisiert_am: new Date(),
  });

  try {
    // 1. Extract text from PDF
    const buffer  = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer, { max: 0 });
    const text    = pdfData.text || '';

    if (!text.trim()) {
      throw new Error('PDF enthält keinen extrahierbaren Text (gescannt/Bild-PDF)');
    }

    logger.info(`OCR: extracted ${text.length} chars from PDF`);

    // 2. Try AI first, fall back to regex
    let result = await extractWithAI(text, fahrzeugInfo);
    if (!result || !result.positionen?.length) {
      logger.info('OCR: AI extraction empty/unavailable, using regex');
      result = extractWithRegex(text);
    }

    const gutachten = await db('gutachten').where({ id: gutachtenId }).first();

    // 3. Save extracted positions to schaden_positionen
    const insertedIds = [];
    for (const pos of (result.positionen || [])) {
      const pid = uuidv4();
      await db('schaden_positionen').insert({
        id:            pid,
        fahrzeug_id:   gutachten.fahrzeug_id,
        gutachten_id:  gutachtenId,
        position_nr:   pos.position_nr,
        kategorie:     pos.kategorie || 'Allgemein',
        beschreibung:  pos.beschreibung,
        bereich:       pos.bereich,
        kosten_brutto: pos.kosten_brutto,
        kosten_netto:  pos.kosten_netto,
        mwst_satz:     pos.mwst_satz || 19.00,
        ursprung:      'ocr',
        entscheidung:  'ausstehend',
        ocr_konfidenz: pos.ocr_konfidenz,
      });
      insertedIds.push(pid);
    }

    // 4. Update gutachten record
    await db('gutachten').where({ id: gutachtenId }).update({
      ocr_status:       'abgeschlossen',
      ocr_rohdaten:     text.slice(0, 50000),  // store first 50k chars
      ocr_ergebnis:     JSON.stringify(result),
      ocr_modell:       result.methode,
      ocr_kosten_gesamt: result.kosten_gesamt || 0,
      gutachter:        result.gutachter || null,
      gutachten_datum:  result.gutachten_datum || null,
      aktualisiert_am:  new Date(),
    });

    logger.info(`OCR: completed – ${insertedIds.length} positions extracted, total ${result.kosten_gesamt} €`);
    return { success: true, positionen: insertedIds.length, kosten_gesamt: result.kosten_gesamt };

  } catch (err) {
    logger.error('OCR: processing failed:', err);
    await db('gutachten').where({ id: gutachtenId }).update({
      ocr_status:      'fehler',
      ocr_rohdaten:    err.message,
      aktualisiert_am: new Date(),
    });
    throw err;
  }
}

/**
 * Parse a raw text string (for testing / re-processing).
 */
async function parseText(text, fahrzeugInfo = {}) {
  let result = await extractWithAI(text, fahrzeugInfo);
  if (!result || !result.positionen?.length) result = extractWithRegex(text);
  return result;
}

module.exports = { processPDF, parseText, extractWithRegex, extractWithAI };
