/**
 * Provisions-Engine (Commission Calculation Service)
 *
 * GW-Staffel (Zeit-basiert):
 *   < 60 Tage:    15%
 *   60-80 Tage:   11%
 *   80-110 Tage:   9%
 *   > 110 Tage:    7%
 *
 * Regional-Bonus: +0.2% wenn Kunden-PLZ in definierten Regionen
 *
 * Zusatzgeschäfte:
 *   Finanzierung: Fix 50€
 *   RSV:          25% vom RSV-Ertrag
 *   Versicherung: Pauschale 20-50€ je nach Typ
 */

const db = require('../config/database');

const STAFFEL = [
  { maxTage: 60,  prozent: 0.15 },
  { maxTage: 80,  prozent: 0.11 },
  { maxTage: 110, prozent: 0.09 },
  { maxTage: Infinity, prozent: 0.07 },
];

const VERSICHERUNG_PAUSCHALEN = {
  basis:    20,
  standard: 35,
  premium:  50,
};

function getStaffelProzent(standzeit) {
  for (const s of STAFFEL) {
    if (standzeit < s.maxTage) return s.prozent;
  }
  return STAFFEL[STAFFEL.length - 1].prozent;
}

async function pruefeRegionalBonus(kunden_id) {
  if (!kunden_id) return { aktiv: false, prozent: 0 };
  const kunde = await db('kunden').where({ id: kunden_id }).select('plz').first();
  if (!kunde?.plz) return { aktiv: false, prozent: 0 };

  const region = await db('plz_regionen')
    .where({ aktiv: true })
    .whereRaw('? BETWEEN plz_von AND plz_bis', [kunde.plz])
    .first();

  if (region) {
    return { aktiv: true, prozent: parseFloat(region.bonus_prozent) };
  }
  return { aktiv: false, prozent: 0 };
}

async function berechnen({ fahrzeug, verkauf_nutzer_id, kunden_id, finanzierung, rsv, versicherung, versicherung_typ, rsv_ertrag = 0 }) {
  const einkaufsdatum = fahrzeug.einkaufsdatum ? new Date(fahrzeug.einkaufsdatum) : null;
  const verkaufsdatum = fahrzeug.verkaufsdatum ? new Date(fahrzeug.verkaufsdatum) : new Date();
  const standzeit_tage = einkaufsdatum
    ? Math.floor((verkaufsdatum - einkaufsdatum) / (1000 * 60 * 60 * 24))
    : 0;

  const bruttoertrag = parseFloat(fahrzeug.bruttoertrag) || 0;
  const gesamtkosten = (parseFloat(fahrzeug.einkaufspreis) || 0)
    + (parseFloat(fahrzeug.aufbereitungskosten) || 0)
    + (parseFloat(fahrzeug.reparaturkosten) || 0)
    + (parseFloat(fahrzeug.sonstige_kosten) || 0);

  // Basis-Provision
  const staffel_prozent = getStaffelProzent(standzeit_tage);
  const basis_provision = Math.max(0, bruttoertrag * staffel_prozent);

  // Regional-Bonus
  const regional = await pruefeRegionalBonus(kunden_id);
  const regional_bonus_betrag = regional.aktiv
    ? Math.max(0, bruttoertrag * regional.prozent)
    : 0;

  // Finanzierung
  const finanzierung_betrag = finanzierung ? 50 : 0;

  // RSV
  const rsv_provision = rsv ? Math.max(0, parseFloat(rsv_ertrag) * 0.25) : 0;

  // Versicherung
  const versicherung_betrag = versicherung
    ? (VERSICHERUNG_PAUSCHALEN[versicherung_typ] || VERSICHERUNG_PAUSCHALEN.basis)
    : 0;

  const gesamt_provision = basis_provision + regional_bonus_betrag + finanzierung_betrag + rsv_provision + versicherung_betrag;

  return {
    fahrzeug_id: fahrzeug.id,
    verkauf_nutzer_id,
    kunden_id,
    standort_id: fahrzeug.standort_id,
    verkaufspreis: parseFloat(fahrzeug.verkaufspreis),
    gesamtkosten,
    bruttoertrag,
    einkaufsdatum: fahrzeug.einkaufsdatum,
    verkaufsdatum,
    standzeit_tage,
    staffel_prozent,
    basis_provision: Math.round(basis_provision * 100) / 100,
    regional_bonus_aktiv: regional.aktiv,
    regional_bonus_prozent: regional.prozent,
    regional_bonus_betrag: Math.round(regional_bonus_betrag * 100) / 100,
    finanzierung: !!finanzierung,
    finanzierung_betrag,
    rsv: !!rsv,
    rsv_ertrag: parseFloat(rsv_ertrag) || 0,
    rsv_provision: Math.round(rsv_provision * 100) / 100,
    versicherung: !!versicherung,
    versicherung_typ: versicherung_typ || null,
    versicherung_betrag,
    gesamt_provision: Math.round(gesamt_provision * 100) / 100,
    status: 'offen',
  };
}

function berechneDirekt({ bruttoertrag, standzeit_tage, kunden_plz_in_region = false,
  finanzierung = false, rsv = false, rsv_ertrag = 0, versicherung = false, versicherung_typ = 'basis' }) {
  const staffel_prozent = getStaffelProzent(standzeit_tage);
  const basis_provision = Math.max(0, bruttoertrag * staffel_prozent);
  const regional_bonus = kunden_plz_in_region ? Math.max(0, bruttoertrag * 0.002) : 0;
  const fin = finanzierung ? 50 : 0;
  const rsv_p = rsv ? Math.max(0, parseFloat(rsv_ertrag) * 0.25) : 0;
  const vers = versicherung ? (VERSICHERUNG_PAUSCHALEN[versicherung_typ] || 20) : 0;
  return {
    staffel_prozent,
    basis_provision: Math.round(basis_provision * 100) / 100,
    regional_bonus: Math.round(regional_bonus * 100) / 100,
    finanzierung: fin,
    rsv_provision: Math.round(rsv_p * 100) / 100,
    versicherung: vers,
    gesamt: Math.round((basis_provision + regional_bonus + fin + rsv_p + vers) * 100) / 100,
  };
}

module.exports = { berechnen, berechneDirekt, getStaffelProzent, STAFFEL };
