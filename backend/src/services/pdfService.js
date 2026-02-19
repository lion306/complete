/**
 * PDF Generation Service
 * Uses Puppeteer to render HTML templates with placeholder substitution
 * Placeholders: {{feldname}} syntax
 *
 * Supported templates:
 *   - expose: Vehicle advertisement sheet
 *   - probefahrtvertrag: Test drive agreement
 *   - kaufvertrag: Purchase contract
 */
const puppeteer = require('puppeteer');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// Default templates
const DEFAULT_TEMPLATES = {
  expose: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 0; color: #333; }
  .header { background: #1a3c5e; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { margin: 0; font-size: 1.4em; }
  .logo { font-size: 1.8em; font-weight: bold; }
  .main { padding: 30px; }
  .title { font-size: 2em; font-weight: bold; color: #1a3c5e; margin-bottom: 5px; }
  .subtitle { font-size: 1.2em; color: #666; margin-bottom: 20px; }
  .foto-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 25px; }
  .foto-grid img { width: 100%; height: 200px; object-fit: cover; border-radius: 4px; }
  .main-foto img { width: 100%; height: 320px; object-fit: cover; border-radius: 6px; margin-bottom: 15px; }
  .specs { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; margin-bottom: 25px; }
  .spec-row { display: contents; }
  .spec-label { background: #f5f5f5; padding: 10px 15px; font-weight: bold; font-size: 0.9em; border-bottom: 1px solid #ddd; }
  .spec-value { padding: 10px 15px; border-bottom: 1px solid #ddd; font-size: 0.9em; }
  .preis { background: #1a3c5e; color: white; padding: 20px 30px; text-align: center; }
  .preis .betrag { font-size: 2.5em; font-weight: bold; }
  .preis small { font-size: 0.75em; opacity: 0.8; }
  .ausstattung h3 { color: #1a3c5e; }
  .ausstattung ul { columns: 2; list-style: none; padding: 0; }
  .ausstattung li::before { content: "✓ "; color: #2ecc71; font-weight: bold; }
  .footer { background: #f5f5f5; padding: 15px 30px; font-size: 0.8em; color: #999; text-align: center; margin-top: 30px; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">{{standort_name}}</div>
  <div style="text-align:right">
    <div>{{standort_adresse}}</div>
    <div>{{standort_telefon}}</div>
    <div>{{standort_email}}</div>
  </div>
</div>
<div class="main">
  <div class="title">{{fzg_marke}} {{fzg_modell}}</div>
  <div class="subtitle">{{fzg_variante}} &bull; {{fzg_baujahr}} &bull; {{fzg_kilometer}} km</div>

  <div class="main-foto">
    <img src="{{fzg_titelbild}}" alt="Fahrzeugfoto" onerror="this.style.display='none'">
  </div>

  <div class="specs">
    <div class="spec-label">Erstzulassung</div><div class="spec-value">{{fzg_erstzulassung}}</div>
    <div class="spec-label">Kilometerstand</div><div class="spec-value">{{fzg_kilometer}} km</div>
    <div class="spec-label">Leistung</div><div class="spec-value">{{fzg_leistung_ps}} PS ({{fzg_leistung_kw}} kW)</div>
    <div class="spec-label">Getriebe</div><div class="spec-value">{{fzg_getriebe}}</div>
    <div class="spec-label">Kraftstoff</div><div class="spec-value">{{fzg_kraftstoff}}</div>
    <div class="spec-label">Hubraum</div><div class="spec-value">{{fzg_hubraum}} ccm</div>
    <div class="spec-label">Farbe (außen)</div><div class="spec-value">{{fzg_farbe}}</div>
    <div class="spec-label">Farbe (innen)</div><div class="spec-value">{{fzg_innenfarbe}}</div>
    <div class="spec-label">Türen</div><div class="spec-value">{{fzg_tueren}}</div>
    <div class="spec-label">Sitze</div><div class="spec-value">{{fzg_sitze}}</div>
    <div class="spec-label">Antrieb</div><div class="spec-value">{{fzg_antrieb}}</div>
    <div class="spec-label">FIN/VIN</div><div class="spec-value">{{fzg_vin}}</div>
    <div class="spec-label">Intern-Nr.</div><div class="spec-value">{{fzg_intern_nr}}</div>
    <div class="spec-label">Hauptuntersuchung</div><div class="spec-value">{{fzg_hu}}</div>
  </div>

  <div class="ausstattung">
    <h3>Ausstattung & Extras</h3>
    <ul>{{fzg_ausstattung_liste}}</ul>
  </div>

  {{fzg_notizen_html}}
</div>
<div class="preis">
  <div>Preis</div>
  <div class="betrag">{{fzg_preis}} €</div>
  <small>inkl. MwSt. &bull; Finanzierung möglich</small>
</div>
<div class="footer">
  {{standort_name}} &bull; {{standort_adresse}} &bull; {{standort_telefon}} &bull; {{standort_email}}<br>
  Alle Angaben ohne Gewähr. Irrtümer vorbehalten. Stand: {{datum}}
</div>
</body>
</html>`,

  probefahrtvertrag: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; font-size: 0.9em; }
  h1 { text-align: center; font-size: 1.5em; margin-bottom: 5px; }
  .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  td { padding: 8px 10px; border: 1px solid #ddd; }
  .label { background: #f5f5f5; font-weight: bold; width: 35%; }
  h2 { font-size: 1em; border-bottom: 2px solid #1a3c5e; padding-bottom: 5px; color: #1a3c5e; }
  .bedingungen { font-size: 0.8em; line-height: 1.6; }
  .unterschriften { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
  .unterschrift-box { border-top: 1px solid #333; padding-top: 8px; font-size: 0.85em; text-align: center; }
  .datum-ort { margin-bottom: 30px; }
</style>
</head>
<body>
<h1>Probefahrtvertrag</h1>
<div class="subtitle">{{standort_name}}</div>

<h2>Fahrzeugdaten</h2>
<table>
  <tr><td class="label">Fahrzeug</td><td>{{fzg_marke}} {{fzg_modell}} {{fzg_variante}}</td></tr>
  <tr><td class="label">Kennzeichen</td><td>{{fzg_kennzeichen}}</td></tr>
  <tr><td class="label">FIN/VIN</td><td>{{fzg_vin}}</td></tr>
  <tr><td class="label">Kilometerstand</td><td>{{fzg_kilometer}} km</td></tr>
  <tr><td class="label">EZ</td><td>{{fzg_erstzulassung}}</td></tr>
</table>

<h2>Kundendaten</h2>
<table>
  <tr><td class="label">Name</td><td>{{kunde_name}}</td></tr>
  <tr><td class="label">Adresse</td><td>{{kunde_adresse}}</td></tr>
  <tr><td class="label">Geburtsdatum</td><td>{{kunde_geburtsdatum}}</td></tr>
  <tr><td class="label">Ausweis-Nr.</td><td>{{kunde_ausweis_nr}}</td></tr>
  <tr><td class="label">Führerschein-Nr.</td><td>{{kunde_fuehrerschein}}</td></tr>
</table>

<h2>Probefahrt</h2>
<table>
  <tr><td class="label">Datum</td><td>{{probefahrt_datum}}</td></tr>
  <tr><td class="label">Abfahrt (Km-Stand)</td><td>{{km_abfahrt}} km</td></tr>
  <tr><td class="label">Rückkehr (Km-Stand)</td><td>________________________ km</td></tr>
  <tr><td class="label">Route</td><td>{{probefahrt_route}}</td></tr>
  <tr><td class="label">Rückkehr bis</td><td>{{rueckkehr_bis}} Uhr</td></tr>
</table>

<h2>Bedingungen</h2>
<div class="bedingungen">
  Der Fahrer bestätigt, im Besitz einer gültigen Fahrerlaubnis für das o.g. Fahrzeug zu sein.
  Das Fahrzeug wird zu Probefahrtzwecken überlassen. Jegliche Haftung für Schäden, die während der Probefahrt entstehen,
  trägt der Fahrer. Das Fahrzeug ist im aktuellen Zustand zu übernehmen und zurückzubringen.
  Die Probefahrt erfolgt auf eigene Gefahr. Bei Schäden oder Unfällen ist sofort der Händler zu informieren.
  Alkohol- und Drogengenuss vor/während der Probefahrt ist untersagt.
</div>

<div class="datum-ort">
  <br><br>
  Ort, Datum: {{standort_ort}}, {{datum}}
</div>

<div class="unterschriften">
  <div class="unterschrift-box">Unterschrift Kunde<br><br>________________________________<br>{{kunde_name}}</div>
  <div class="unterschrift-box">Unterschrift Verkäufer<br><br>________________________________<br>{{verkaefer_name}}</div>
</div>
</body>
</html>`,
};

function replacePlaceholders(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = data[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });
}

function buildFahrzeugData(fahrzeug, standort, kunde, verkaefer, fotos) {
  const ausstattung = fahrzeug.ausstattung
    ? Object.entries(fahrzeug.ausstattung)
        .filter(([, v]) => v)
        .map(([k]) => `<li>${k.replace(/_/g, ' ')}</li>`)
        .join('')
    : '';

  const titelbild = fotos?.find(f => f.position === 0)?.pfad || '';
  const titelbildUrl = titelbild ? `${process.env.APP_URL}/uploads/${titelbild}` : '';

  return {
    // Fahrzeug
    fzg_marke: fahrzeug.marke || '',
    fzg_modell: fahrzeug.modell || '',
    fzg_variante: fahrzeug.variante || '',
    fzg_baujahr: fahrzeug.baujahr || '',
    fzg_erstzulassung: fahrzeug.erstzulassung
      ? new Date(fahrzeug.erstzulassung).toLocaleDateString('de-DE')
      : '',
    fzg_kilometer: fahrzeug.kilometer?.toLocaleString('de-DE') || '',
    fzg_leistung_ps: fahrzeug.leistung_ps || '',
    fzg_leistung_kw: fahrzeug.leistung_kw || '',
    fzg_getriebe: fahrzeug.getriebe || '',
    fzg_kraftstoff: fahrzeug.kraftstoff || '',
    fzg_hubraum: fahrzeug.hubraum_ccm?.toLocaleString('de-DE') || '',
    fzg_farbe: fahrzeug.farbe || '',
    fzg_innenfarbe: fahrzeug.innenfarbe || '',
    fzg_tueren: fahrzeug.tueren || '',
    fzg_sitze: fahrzeug.sitze || '',
    fzg_antrieb: fahrzeug.antrieb || '',
    fzg_vin: fahrzeug.vin || '',
    fzg_intern_nr: fahrzeug.intern_nummer || '',
    fzg_kennzeichen: fahrzeug.kennzeichen || '',
    fzg_preis: fahrzeug.zielverkaufspreis?.toLocaleString('de-DE', { minimumFractionDigits: 0 }) || '',
    fzg_hu: '',
    fzg_ausstattung_liste: ausstattung,
    fzg_titelbild: titelbildUrl,
    fzg_notizen_html: fahrzeug.notizen ? `<p><strong>Hinweise:</strong> ${fahrzeug.notizen}</p>` : '',

    // Standort
    standort_name: standort?.name || '',
    standort_adresse: standort?.adresse || '',
    standort_telefon: standort?.telefon || '',
    standort_email: standort?.email || '',
    standort_ort: standort?.ort || '',

    // Kunde
    kunde_name: kunde ? `${kunde.vorname || ''} ${kunde.nachname || ''}`.trim() : '',
    kunde_adresse: kunde ? `${kunde.strasse || ''}, ${kunde.plz || ''} ${kunde.ort || ''}`.trim() : '',
    kunde_geburtsdatum: kunde?.geburtsdatum
      ? new Date(kunde.geburtsdatum).toLocaleDateString('de-DE') : '',
    kunde_ausweis_nr: kunde?.ausweis_nummer || '',
    kunde_fuehrerschein: '',

    // Verkäufer
    verkaefer_name: verkaefer ? `${verkaefer.vorname} ${verkaefer.nachname}` : '',

    // Date
    datum: new Date().toLocaleDateString('de-DE'),
    probefahrt_datum: new Date().toLocaleDateString('de-DE'),
    probefahrt_route: '',
    km_abfahrt: fahrzeug.kilometer?.toLocaleString('de-DE') || '',
    rueckkehr_bis: '',
  };
}

async function generatePDF(typ, fahrzeug_id, extra = {}) {
  // Load vehicle data
  const [fahrzeug, fotos] = await Promise.all([
    db('fahrzeuge').where({ id: fahrzeug_id }).first(),
    db('fahrzeug_fotos').where({ fahrzeug_id }).orderBy('position'),
  ]);
  if (!fahrzeug) throw new Error('Fahrzeug nicht gefunden');

  const [standort, kunde, verkaefer] = await Promise.all([
    fahrzeug.standort_id ? db('standorte').where({ id: fahrzeug.standort_id }).first() : null,
    fahrzeug.kunden_id ? db('kunden').where({ id: fahrzeug.kunden_id }).first() : null,
    fahrzeug.verkauf_nutzer_id ? db('nutzer').where({ id: fahrzeug.verkauf_nutzer_id }).first() : null,
  ]);

  // Get or use default template
  let templateHtml = DEFAULT_TEMPLATES[typ];
  const dbTemplate = await db('pdf_templates').where({ typ, aktiv: true }).orderBy('version', 'desc').first();
  if (dbTemplate) templateHtml = dbTemplate.html_inhalt;

  // Build data context
  const data = {
    ...buildFahrzeugData(fahrzeug, standort, kunde, verkaefer, fotos),
    ...extra,
  };

  const html = replacePlaceholders(templateHtml, data);

  // Launch puppeteer
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new',
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();

  // Save to disk
  const dir = path.join(UPLOAD_DIR, 'fahrzeuge', fahrzeug_id, 'dokumente');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `${typ}_${Date.now()}.pdf`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, pdfBuffer);

  return {
    filename,
    pfad: path.relative(UPLOAD_DIR, filepath),
    pdfBuffer,
  };
}

async function generateHtmlPreview(typ, fahrzeug_id, extra = {}) {
  const fahrzeug = await db('fahrzeuge').where({ id: fahrzeug_id }).first();
  const fotos = await db('fahrzeug_fotos').where({ fahrzeug_id }).orderBy('position');
  const standort = fahrzeug.standort_id ? await db('standorte').where({ id: fahrzeug.standort_id }).first() : null;

  let templateHtml = DEFAULT_TEMPLATES[typ] || DEFAULT_TEMPLATES.expose;
  const dbTemplate = await db('pdf_templates').where({ typ, aktiv: true }).orderBy('version', 'desc').first();
  if (dbTemplate) templateHtml = dbTemplate.html_inhalt;

  const data = { ...buildFahrzeugData(fahrzeug, standort, null, null, fotos), ...extra };
  return replacePlaceholders(templateHtml, data);
}

module.exports = { generatePDF, generateHtmlPreview, replacePlaceholders, DEFAULT_TEMPLATES };
