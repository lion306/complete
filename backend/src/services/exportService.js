/**
 * Börsen-Export Service
 * Exports vehicle listings to Mobile.de and AutoScout24
 * Formats: CSV / XML per portal specification
 */
const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Builder } = require('xml2js');
const { createObjectCsvWriter } = require('csv-writer');
const logger = require('../utils/logger');

const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// ---- MOBILE.DE XML Export ----
async function buildMobileDeXml(fahrzeuge) {
  const vehicles = fahrzeuge.map(f => {
    const fotos = f.fotos || [];
    const images = fotos.slice(0, 20).map(foto => ({
      URL: `${process.env.APP_URL}/uploads/${foto.pfad}`,
    }));

    return {
      Ad: {
        $: { action: f.mobilede_ad_id ? 'UPDATE' : 'INSERT' },
        'Seller.id': f.intern_nummer,
        'Ad.id': f.mobilede_ad_id || '',
        Category: { $: { id: '001' } }, // PKW
        Make: { $: { key: f.marke?.toUpperCase().replace(/\s/g, '_') || '' } },
        Model: { $: { key: f.modell?.toUpperCase().replace(/\s/g, '_') || '' } },
        Descriptiontext: f.notizen || '',
        Price: {
          ConsumerPriceAmount: f.zielverkaufspreis || 0,
          PriceRating: 'FIXED',
          Currency: 'EUR',
        },
        BodyStyle: { $: { key: 'SALOON' } },
        FirstRegistration: f.erstzulassung
          ? new Date(f.erstzulassung).toISOString().slice(0, 7)
          : '',
        Mileage: f.kilometer || 0,
        PowerKW: f.leistung_kw || 0,
        Fuel: { $: { key: f.kraftstoff?.toUpperCase().replace(/\s/g, '_') || 'PETROL' } },
        Gearbox: { $: { key: f.getriebe === 'Automatik' ? 'AUTOMATIC' : 'MANUAL' } },
        Exterior: { $: { key: f.farbe?.toUpperCase().replace(/\s/g, '_') || '' } },
        NumberofDoors: f.tueren || 4,
        NumberofSeats: f.sitze || 5,
        HU: '',
        Images: { Image: images },
        'VehicleIdentificationNumber': f.vin || '',
      },
    };
  });

  const builder = new Builder({ rootName: 'Ads', xmldec: { version: '1.0', encoding: 'UTF-8' } });
  return builder.buildObject({ Ad: vehicles.map(v => v.Ad) });
}

// ---- AUTOSCOUT24 CSV Export ----
async function buildAutoScoutCsv(fahrzeuge, outputPath) {
  const records = fahrzeuge.map(f => ({
    'Typ': 'Gebrauchtwagen',
    'Marke': f.marke || '',
    'Modell': f.modell || '',
    'Ausstattungslinie': f.variante || '',
    'Baujahr': f.baujahr || '',
    'Erstzulassung': f.erstzulassung
      ? new Date(f.erstzulassung).toLocaleDateString('de-DE') : '',
    'Kilometerstand': f.kilometer || 0,
    'Leistung_KW': f.leistung_kw || 0,
    'Leistung_PS': f.leistung_ps || 0,
    'Kraftstoff': f.kraftstoff || '',
    'Getriebe': f.getriebe || '',
    'Farbe': f.farbe || '',
    'Tueren': f.tueren || 4,
    'Sitze': f.sitze || 5,
    'FIN': f.vin || '',
    'Preis': f.zielverkaufspreis || 0,
    'Beschreibung': f.notizen || '',
    'Bild1': f.fotos?.[0] ? `${process.env.APP_URL}/uploads/${f.fotos[0].pfad}` : '',
    'Bild2': f.fotos?.[1] ? `${process.env.APP_URL}/uploads/${f.fotos[1].pfad}` : '',
    'Bild3': f.fotos?.[2] ? `${process.env.APP_URL}/uploads/${f.fotos[2].pfad}` : '',
    'Haendler_ID': f.intern_nummer || '',
  }));

  const writer = createObjectCsvWriter({
    path: outputPath,
    header: Object.keys(records[0] || {}).map(id => ({ id, title: id })),
    fieldDelimiter: ';',
    encoding: 'utf8',
  });

  await writer.writeRecords(records);
}

async function loadFahrzeugeForExport(fahrzeug_ids) {
  const fahrzeuge = await db('fahrzeuge as f')
    .leftJoin('standorte as s', 's.id', 'f.standort_id')
    .select('f.*', 's.name as standort_name', 's.telefon as standort_telefon', 's.email as standort_email')
    .whereIn('f.id', fahrzeug_ids)
    .whereIn('f.status', ['aktiv_angebot', 'bereit']);

  // Attach photos
  for (const fz of fahrzeuge) {
    fz.fotos = await db('fahrzeug_fotos')
      .where({ fahrzeug_id: fz.id })
      .orderBy('position')
      .limit(20);
  }

  return fahrzeuge;
}

async function exportToMobileDe(fahrzeug_ids) {
  const fahrzeuge = await loadFahrzeugeForExport(fahrzeug_ids);
  if (!fahrzeuge.length) throw new Error('Keine exportierbaren Fahrzeuge gefunden');

  const xml = await buildMobileDeXml(fahrzeuge);
  const dir = path.join(UPLOAD_DIR, 'exports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `mobilede_export_${Date.now()}.xml`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  // Mark vehicles
  await db('fahrzeuge')
    .whereIn('id', fahrzeug_ids)
    .update({ bei_mobilede: true, letzter_export: new Date() });

  logger.info(`Mobile.de export: ${fahrzeuge.length} vehicles`, { file: filename });
  return { filename, filepath, count: fahrzeuge.length, xml };
}

async function exportToAutoScout(fahrzeug_ids) {
  const fahrzeuge = await loadFahrzeugeForExport(fahrzeug_ids);
  if (!fahrzeuge.length) throw new Error('Keine exportierbaren Fahrzeuge gefunden');

  const dir = path.join(UPLOAD_DIR, 'exports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `autoscout_export_${Date.now()}.csv`;
  const filepath = path.join(dir, filename);
  await buildAutoScoutCsv(fahrzeuge, filepath);

  // Mark vehicles
  await db('fahrzeuge')
    .whereIn('id', fahrzeug_ids)
    .update({ bei_autoscout: true, letzter_export: new Date() });

  logger.info(`AutoScout24 export: ${fahrzeuge.length} vehicles`, { file: filename });
  return { filename, filepath, count: fahrzeuge.length };
}

module.exports = { exportToMobileDe, exportToAutoScout };
