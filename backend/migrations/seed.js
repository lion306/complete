#!/usr/bin/env node
/**
 * Database Seed Script
 * Creates initial data: superadmin, demo standort, and test data
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../src/config/database');

async function seed() {
  console.log('Seeding database...');

  // Standort
  const standortId = uuidv4();
  const [existingStandort] = await db('standorte').where({ name: 'Hauptbetrieb Pfaffenhofen' });
  if (!existingStandort) {
    await db('standorte').insert({
      id: standortId,
      name: 'Hauptbetrieb Pfaffenhofen',
      adresse: 'Hauptstraße 1',
      plz: '85276',
      ort: 'Pfaffenhofen a.d.Ilm',
      telefon: '08441 12345',
      email: 'info@autohaus-pfaffenhofen.de',
      raster_zeilen: 8,
      raster_spalten: 15,
    });
    console.log('  Standort created');
  }

  const standort = await db('standorte').where({ name: 'Hauptbetrieb Pfaffenhofen' }).first();

  // Second location
  const standort2Id = uuidv4();
  const [existingStandort2] = await db('standorte').where({ name: 'Niederlassung Schrobenhausen' });
  if (!existingStandort2) {
    await db('standorte').insert({
      id: standort2Id,
      name: 'Niederlassung Schrobenhausen',
      adresse: 'Gewerbestraße 5',
      plz: '86529',
      ort: 'Schrobenhausen',
      telefon: '08252 98765',
      email: 'schrobenhausen@autohaus.de',
      raster_zeilen: 5,
      raster_spalten: 10,
    });
    console.log('  Standort 2 created');
  }

  // Admin user
  const [existingAdmin] = await db('nutzer').where({ email: 'admin@autohaus.de' });
  if (!existingAdmin) {
    const hash = await bcrypt.hash('Admin2024!', 12);
    await db('nutzer').insert({
      id: uuidv4(),
      email: 'admin@autohaus.de',
      passwort_hash: hash,
      vorname: 'System',
      nachname: 'Administrator',
      rolle: 'superadmin',
      standort_id: standort.id,
      sichtbarkeit_alle_standorte: true,
      perm_fahrzeug_anlegen: true,
      perm_fahrzeug_bearbeiten: true,
      perm_fahrzeug_loeschen: true,
      perm_fahrzeug_einkaufspreis_sehen: true,
      perm_fahrzeug_verkaufen: true,
      perm_kunde_anlegen: true,
      perm_kunde_bearbeiten: true,
      perm_lead_zuweisen: true,
      perm_provision_sehen: true,
      perm_provision_alle_sehen: true,
      perm_dokument_generieren: true,
      perm_schaden_bearbeiten: true,
      perm_stellplatz_verwalten: true,
      perm_finanzen_sehen: true,
      perm_export_boersen: true,
      perm_admin: true,
    });
    console.log('  Admin created: admin@autohaus.de / Admin2024!');
  }

  // Demo Verkäufer
  const [existingVK] = await db('nutzer').where({ email: 'mueller@autohaus.de' });
  if (!existingVK) {
    const hash = await bcrypt.hash('Autohaus2024!', 12);
    await db('nutzer').insert({
      id: uuidv4(),
      email: 'mueller@autohaus.de',
      passwort_hash: hash,
      vorname: 'Max',
      nachname: 'Müller',
      rolle: 'verkaefer',
      standort_id: standort.id,
      perm_fahrzeug_bearbeiten: true,
      perm_fahrzeug_verkaufen: true,
      perm_kunde_anlegen: true,
      perm_kunde_bearbeiten: true,
      perm_provision_sehen: true,
      perm_dokument_generieren: true,
      perm_schaden_bearbeiten: true,
    });
    console.log('  Verkäufer created: mueller@autohaus.de / Autohaus2024!');
  }

  // Demo Fahrzeuge
  const fahrzeuge = [
    {
      marke: 'BMW', modell: '5er', variante: '520d xDrive Touring', baujahr: 2021,
      erstzulassung: '2021-03-15', vin: 'WBA53AG0X0CP12345', kilometer: 48000,
      leistung_kw: 140, leistung_ps: 190, kraftstoff: 'Diesel', getriebe: 'Automatik',
      antrieb: 'AWD', farbe: 'Alpinweiß', innenfarbe: 'Schwarz', hubraum_ccm: 1995,
      tueren: 5, sitze: 5, einkaufspreis: 28500, aufbereitungskosten: 850,
      zielverkaufspreis: 34900, einkaufsdatum: '2024-01-15', status: 'aktiv_angebot',
    },
    {
      marke: 'Mercedes-Benz', modell: 'C-Klasse', variante: 'C 220 d AMG Line', baujahr: 2022,
      erstzulassung: '2022-07-01', vin: 'WDD2052391R123456', kilometer: 32000,
      leistung_kw: 143, leistung_ps: 194, kraftstoff: 'Diesel', getriebe: 'Automatik',
      antrieb: 'RWD', farbe: 'Obsidianschwarz', innenfarbe: 'Beige', hubraum_ccm: 1993,
      tueren: 4, sitze: 5, einkaufspreis: 32000, aufbereitungskosten: 600,
      zielverkaufspreis: 39500, einkaufsdatum: '2024-02-10', status: 'bereit',
    },
    {
      marke: 'Volkswagen', modell: 'Golf', variante: 'GTI 2.0 TSI DSG', baujahr: 2023,
      vin: 'WVWZZZE18ND123456', kilometer: 12000,
      leistung_kw: 180, leistung_ps: 245, kraftstoff: 'Benzin', getriebe: 'Automatik',
      antrieb: 'FWD', farbe: 'Tornadorot', innenfarbe: 'Schwarz', hubraum_ccm: 1984,
      tueren: 5, sitze: 5, einkaufspreis: 38000, aufbereitungskosten: 200,
      zielverkaufspreis: 44900, einkaufsdatum: '2024-03-01', status: 'aufbereitung',
    },
    {
      marke: 'Audi', modell: 'A4', variante: '35 TDI S-Line Avant', baujahr: 2020,
      vin: 'WAUZZZ8V5LA123456', kilometer: 78000,
      leistung_kw: 110, leistung_ps: 150, kraftstoff: 'Diesel', getriebe: 'Manuell',
      antrieb: 'FWD', farbe: 'Florettsilber', innenfarbe: 'Grau', hubraum_ccm: 1968,
      tueren: 5, sitze: 5, einkaufspreis: 19500, aufbereitungskosten: 1200, reparaturkosten: 800,
      zielverkaufspreis: 26900, einkaufsdatum: '2023-11-20', status: 'werkstatt',
    },
  ];

  for (const fzData of fahrzeuge) {
    const [existing] = await db('fahrzeuge').where({ vin: fzData.vin });
    if (!existing) {
      const lastNr = await db('fahrzeuge').max('intern_nummer as max').first();
      const nextNr = lastNr?.max
        ? String(parseInt(lastNr.max.replace(/\D/g, '')) + 1).padStart(5, '0')
        : '00001';

      const id = uuidv4();
      await db('fahrzeuge').insert({
        id,
        intern_nummer: `FZ-${nextNr}`,
        standort_id: standort.id,
        erstellt_von: (await db('nutzer').where({ email: 'admin@autohaus.de' }).first())?.id,
        ...fzData,
      });
      console.log(`  Fahrzeug: ${fzData.marke} ${fzData.modell}`);
    }
  }

  // Demo Stellplätze (5x10 grid for main location)
  const existingSpots = await db('stellplaetze').where({ standort_id: standort.id }).count('id as c').first();
  if (parseInt(existingSpots.c) === 0) {
    const spots = [];
    for (let z = 0; z < 8; z++) {
      for (let s = 0; s < 15; s++) {
        const bezeichnung = `${String.fromCharCode(65 + z)}${String(s + 1).padStart(2, '0')}`;
        spots.push({
          id: uuidv4(),
          standort_id: standort.id,
          bezeichnung,
          zeile: z,
          spalte: s,
          bereich: z < 4 ? 'Halle' : 'Außengelände',
          qr_code_token: uuidv4(),
        });
      }
    }
    await db('stellplaetze').insert(spots);
    console.log(`  ${spots.length} Stellplätze für Hauptbetrieb erstellt`);
  }

  console.log('\nSeed complete!');
  console.log('Login: admin@autohaus.de / Admin2024!');
  console.log('       mueller@autohaus.de / Autohaus2024!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
}).finally(() => db.destroy());
