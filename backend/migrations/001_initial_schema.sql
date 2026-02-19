-- DMS Autohaus - Initial Database Schema
-- PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ============================================================
-- STANDORTE (Locations)
-- ============================================================
CREATE TABLE standorte (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  adresse VARCHAR(255),
  plz VARCHAR(10),
  ort VARCHAR(100),
  telefon VARCHAR(30),
  email VARCHAR(100),
  aktiv BOOLEAN DEFAULT TRUE,
  raster_zeilen INT DEFAULT 10,
  raster_spalten INT DEFAULT 20,
  erstellt_am TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- NUTZER (Users) with Granular Permission Flags
-- ============================================================
CREATE TABLE nutzer (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(150) UNIQUE NOT NULL,
  passwort_hash VARCHAR(255) NOT NULL,
  vorname VARCHAR(80) NOT NULL,
  nachname VARCHAR(80) NOT NULL,
  telefon VARCHAR(30),
  rolle VARCHAR(30) NOT NULL DEFAULT 'verkaefer',
  -- Roles: superadmin | standortleiter | verkaefer | einkauf | werkstatt | buchhaltung

  -- Standort-Zuordnung (primary + visibility flags)
  standort_id UUID REFERENCES standorte(id),
  sichtbarkeit_alle_standorte BOOLEAN DEFAULT FALSE,

  -- Permission Flags (granular)
  perm_fahrzeug_anlegen BOOLEAN DEFAULT FALSE,
  perm_fahrzeug_bearbeiten BOOLEAN DEFAULT FALSE,
  perm_fahrzeug_loeschen BOOLEAN DEFAULT FALSE,
  perm_fahrzeug_einkaufspreis_sehen BOOLEAN DEFAULT FALSE,
  perm_fahrzeug_verkaufen BOOLEAN DEFAULT FALSE,
  perm_kunde_anlegen BOOLEAN DEFAULT TRUE,
  perm_kunde_bearbeiten BOOLEAN DEFAULT TRUE,
  perm_lead_zuweisen BOOLEAN DEFAULT FALSE,
  perm_provision_sehen BOOLEAN DEFAULT FALSE, -- own
  perm_provision_alle_sehen BOOLEAN DEFAULT FALSE, -- all sellers
  perm_dokument_generieren BOOLEAN DEFAULT FALSE,
  perm_schaden_bearbeiten BOOLEAN DEFAULT FALSE,
  perm_stellplatz_verwalten BOOLEAN DEFAULT FALSE,
  perm_finanzen_sehen BOOLEAN DEFAULT FALSE,
  perm_export_boersen BOOLEAN DEFAULT FALSE,
  perm_admin BOOLEAN DEFAULT FALSE,

  -- Profile
  profilbild_pfad VARCHAR(500),
  aktiv BOOLEAN DEFAULT TRUE,
  letzter_login TIMESTAMP,
  refresh_token_hash VARCHAR(255),
  erstellt_am TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_nutzer_email ON nutzer(email);
CREATE INDEX idx_nutzer_standort ON nutzer(standort_id);

-- ============================================================
-- FAHRZEUGE (Vehicles)
-- ============================================================
CREATE TABLE fahrzeuge (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intern_nummer VARCHAR(30) UNIQUE, -- internal stock number
  vin VARCHAR(17) UNIQUE,           -- Vehicle Identification Number
  kennzeichen VARCHAR(20),

  -- Basic Info
  marke VARCHAR(80) NOT NULL,
  modell VARCHAR(100) NOT NULL,
  variante VARCHAR(150),
  baujahr INT,
  erstzulassung DATE,
  farbe VARCHAR(60),
  innenfarbe VARCHAR(60),
  getriebe VARCHAR(30),             -- Automatik | Manuell | Halbautomatik
  kraftstoff VARCHAR(30),           -- Benzin | Diesel | Elektro | Hybrid | ...
  hubraum_ccm INT,
  leistung_kw INT,
  leistung_ps INT,
  kilometer INT,
  tueren INT DEFAULT 4,
  sitze INT DEFAULT 5,
  fahrzeugtyp VARCHAR(50),          -- PKW | Transporter | LKW | ...
  antrieb VARCHAR(30),              -- FWD | RWD | AWD

  -- Financials
  einkaufspreis DECIMAL(12,2),
  einkaufsdatum DATE,
  aufbereitungskosten DECIMAL(10,2) DEFAULT 0,
  reparaturkosten DECIMAL(10,2) DEFAULT 0,
  sonstige_kosten DECIMAL(10,2) DEFAULT 0,
  zielverkaufspreis DECIMAL(12,2),
  verkaufspreis DECIMAL(12,2),
  verkaufsdatum DATE,
  bruttoertrag DECIMAL(12,2),       -- verkaufspreis - gesamtkosten

  -- Status & Lifecycle
  status VARCHAR(30) DEFAULT 'eingang',
  -- eingang | inspektion | werkstatt | aufbereitung | bereit | aktiv_angebot | verkauft | exportiert | archiv

  -- Location
  standort_id UUID REFERENCES standorte(id),
  aktueller_stellplatz_id UUID,     -- FK added after stellplaetze table

  -- Ownership & Responsibility
  einkauf_nutzer_id UUID REFERENCES nutzer(id),
  verkauf_nutzer_id UUID REFERENCES nutzer(id),
  zustaendiger_nutzer_id UUID REFERENCES nutzer(id),

  -- Customer
  kunden_id UUID,                    -- FK added after kunden table

  -- Marketplace
  bei_mobilede BOOLEAN DEFAULT FALSE,
  bei_autoscout BOOLEAN DEFAULT FALSE,
  mobilede_ad_id VARCHAR(50),
  autoscout_ad_id VARCHAR(50),
  letzter_export TIMESTAMP,

  -- Ausstattung (Equipment as JSONB for flexibility)
  ausstattung JSONB DEFAULT '{}',

  -- Notes
  notizen TEXT,
  interne_notizen TEXT,

  erstellt_am TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW(),
  erstellt_von UUID REFERENCES nutzer(id)
);

CREATE INDEX idx_fahrzeuge_status ON fahrzeuge(status);
CREATE INDEX idx_fahrzeuge_standort ON fahrzeuge(standort_id);
CREATE INDEX idx_fahrzeuge_vin ON fahrzeuge(vin);
CREATE INDEX idx_fahrzeuge_marke_modell ON fahrzeuge(marke, modell);
CREATE INDEX idx_fahrzeuge_verkaufsdatum ON fahrzeuge(verkaufsdatum);
CREATE INDEX idx_fahrzeuge_marke_trgm ON fahrzeuge USING gin(marke gin_trgm_ops);

-- ============================================================
-- STELLPLAETZE (Parking Spots)
-- ============================================================
CREATE TABLE stellplaetze (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  standort_id UUID NOT NULL REFERENCES standorte(id) ON DELETE CASCADE,
  bezeichnung VARCHAR(20) NOT NULL,  -- e.g. "A01", "B12"
  zeile INT NOT NULL,
  spalte INT NOT NULL,
  bereich VARCHAR(50),               -- e.g. "Halle", "Aussengelände Nord"
  typ VARCHAR(30) DEFAULT 'standard', -- standard | behindert | gross | reserviert
  status VARCHAR(20) DEFAULT 'frei', -- frei | belegt | reserviert | gesperrt
  qr_code_token VARCHAR(100) UNIQUE,  -- UUID embedded in QR
  notizen TEXT,
  aktiv BOOLEAN DEFAULT TRUE,
  erstellt_am TIMESTAMP DEFAULT NOW(),
  UNIQUE(standort_id, bezeichnung),
  UNIQUE(standort_id, zeile, spalte)
);

CREATE INDEX idx_stellplaetze_standort ON stellplaetze(standort_id);
CREATE INDEX idx_stellplaetze_status ON stellplaetze(status);

-- Add FK to fahrzeuge now that stellplaetze exists
ALTER TABLE fahrzeuge ADD CONSTRAINT fk_fahrzeug_stellplatz
  FOREIGN KEY (aktueller_stellplatz_id) REFERENCES stellplaetze(id) ON DELETE SET NULL;

-- ============================================================
-- FAHRZEUG STATUS TIMELINE
-- ============================================================
CREATE TABLE fahrzeug_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  status_alt VARCHAR(30),
  status_neu VARCHAR(30) NOT NULL,
  notiz TEXT,
  nutzer_id UUID REFERENCES nutzer(id),
  erstellt_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fsh_fahrzeug ON fahrzeug_status_history(fahrzeug_id);

-- ============================================================
-- FAHRZEUG POSITION HISTORY (Parking Log)
-- ============================================================
CREATE TABLE fahrzeug_position_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  stellplatz_id UUID REFERENCES stellplaetze(id) ON DELETE SET NULL,
  stellplatz_bezeichnung VARCHAR(20), -- denormalized for history
  standort_id UUID REFERENCES standorte(id),
  nutzer_id UUID REFERENCES nutzer(id),
  scan_methode VARCHAR(20) DEFAULT 'qr', -- qr | manuell
  erstellt_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fph_fahrzeug ON fahrzeug_position_history(fahrzeug_id);

-- ============================================================
-- FAHRZEUG FOTOS (Photos)
-- ============================================================
CREATE TABLE fahrzeug_fotos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  dateiname VARCHAR(255) NOT NULL,
  pfad VARCHAR(500) NOT NULL,
  thumbnail_pfad VARCHAR(500),
  kategorie VARCHAR(50) DEFAULT 'extern',
  -- extern | intern | schaden | dokument | sonstiges
  position INT DEFAULT 0,          -- sort order, position 0 = Titelbild
  groesse_bytes INT,
  breite INT,
  hoehe INT,
  hochgeladen_von UUID REFERENCES nutzer(id),
  erstellt_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fotos_fahrzeug ON fahrzeug_fotos(fahrzeug_id);

-- ============================================================
-- FAHRZEUG DOKUMENTE (Documents Safe)
-- ============================================================
CREATE TABLE fahrzeug_dokumente (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  typ VARCHAR(50) NOT NULL,
  -- brief | gutachten | rechnung | versicherung | hauptuntersuchung | sonstiges | probefahrtvertrag | expose
  bezeichnung VARCHAR(200),
  dateiname VARCHAR(255),
  pfad VARCHAR(500),
  groesse_bytes INT,
  generiert BOOLEAN DEFAULT FALSE,   -- true = system-generated PDF
  hochgeladen_von UUID REFERENCES nutzer(id),
  gueltig_bis DATE,
  erstellt_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dokumente_fahrzeug ON fahrzeug_dokumente(fahrzeug_id);

-- ============================================================
-- SCHADEN (Damage Reports)
-- ============================================================
CREATE TABLE schaeden (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  beschreibung TEXT NOT NULL,
  bereich VARCHAR(100),             -- Vorderkotflügel links, Heckstoßstange, ...
  schwere VARCHAR(20) DEFAULT 'leicht', -- leicht | mittel | schwer
  reparieren BOOLEAN DEFAULT FALSE,  -- true = reparieren, false = belassen
  reparaturkosten_geschaetzt DECIMAL(10,2),
  reparaturkosten_tatsaechlich DECIMAL(10,2),
  status VARCHAR(30) DEFAULT 'offen', -- offen | in_reparatur | erledigt | belassen
  gutachter VARCHAR(150),
  gutachten_datum DATE,
  foto_ids UUID[],                   -- references to fahrzeug_fotos
  notizen TEXT,
  erfasst_von UUID REFERENCES nutzer(id),
  erledigt_am TIMESTAMP,
  erledigt_von UUID REFERENCES nutzer(id),
  erstellt_am TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_schaeden_fahrzeug ON schaeden(fahrzeug_id);
CREATE INDEX idx_schaeden_status ON schaeden(status);

-- ============================================================
-- KUNDEN (Customers)
-- ============================================================
CREATE TABLE kunden (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  typ VARCHAR(20) DEFAULT 'privat',  -- privat | gewerblich
  anrede VARCHAR(20),
  vorname VARCHAR(80),
  nachname VARCHAR(80),
  firmenname VARCHAR(150),
  email VARCHAR(150),
  telefon VARCHAR(30),
  mobil VARCHAR(30),
  geburtsdatum DATE,

  -- Address
  strasse VARCHAR(200),
  plz VARCHAR(10),
  ort VARCHAR(100),
  land VARCHAR(60) DEFAULT 'Deutschland',

  -- Identity
  ausweis_typ VARCHAR(30),           -- personalausweis | reisepass | fuehrerschein
  ausweis_nummer VARCHAR(50),
  ausweis_gueltig_bis DATE,
  ausweis_foto_pfad VARCHAR(500),

  -- Source & CRM
  herkunft VARCHAR(50),              -- mobilede | autoscout | email | direkt | empfehlung | ...
  zustaendiger_nutzer_id UUID REFERENCES nutzer(id),
  standort_id UUID REFERENCES standorte(id),

  -- Regional flag for commission
  plz_region_bonus BOOLEAN DEFAULT FALSE,

  notizen TEXT,
  aktiv BOOLEAN DEFAULT TRUE,
  erstellt_am TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_kunden_email ON kunden(email);
CREATE INDEX idx_kunden_nachname ON kunden(nachname);
CREATE INDEX idx_kunden_plz ON kunden(plz);
CREATE INDEX idx_kunden_nachname_trgm ON kunden USING gin(nachname gin_trgm_ops);

-- Add FK from fahrzeuge to kunden
ALTER TABLE fahrzeuge ADD CONSTRAINT fk_fahrzeug_kunde
  FOREIGN KEY (kunden_id) REFERENCES kunden(id) ON DELETE SET NULL;

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status VARCHAR(30) DEFAULT 'neu',
  -- neu | zugewiesen | kontaktiert | nachfassen | angebot | probefahrt | verloren | gewonnen

  -- Contact Info
  vorname VARCHAR(80),
  nachname VARCHAR(80),
  email VARCHAR(150),
  telefon VARCHAR(30),
  herkunft VARCHAR(50),              -- mobilede | autoscout | email | web | telefon | ...

  -- Vehicle Interest
  fahrzeug_id UUID REFERENCES fahrzeuge(id) ON DELETE SET NULL,
  fahrzeug_interesse_text TEXT,     -- free text if no direct vehicle match
  angebotenes_fahrzeug_id UUID REFERENCES fahrzeuge(id) ON DELETE SET NULL,

  -- Assignment
  zugewiesen_an UUID REFERENCES nutzer(id),
  zugewiesen_von UUID REFERENCES nutzer(id),
  standort_id UUID REFERENCES standorte(id),

  -- Conversion
  kunden_id UUID REFERENCES kunden(id) ON DELETE SET NULL,

  -- Source email data
  roh_email TEXT,
  email_betreff VARCHAR(500),
  email_empfangen_am TIMESTAMP,
  email_absender VARCHAR(150),

  -- Timeline
  letzte_aktivitaet TIMESTAMP DEFAULT NOW(),
  naechste_aktion DATE,
  notizen TEXT,

  erstellt_am TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_zugewiesen ON leads(zugewiesen_an);
CREATE INDEX idx_leads_fahrzeug ON leads(fahrzeug_id);
CREATE INDEX idx_leads_erstellt ON leads(erstellt_am DESC);

-- ============================================================
-- LEAD AKTIVITAETEN (Activity Log)
-- ============================================================
CREATE TABLE lead_aktivitaeten (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  typ VARCHAR(30) NOT NULL,          -- notiz | anruf | email | probefahrt | angebot | ...
  beschreibung TEXT,
  nutzer_id UUID REFERENCES nutzer(id),
  erstellt_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_la_lead ON lead_aktivitaeten(lead_id);

-- ============================================================
-- PLZ REGIONEN (Postal Code Regions for Commission Bonus)
-- ============================================================
CREATE TABLE plz_regionen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_name VARCHAR(100) NOT NULL,
  plz_von VARCHAR(10) NOT NULL,
  plz_bis VARCHAR(10) NOT NULL,
  bonus_prozent DECIMAL(5,4) DEFAULT 0.002, -- 0.2% default
  aktiv BOOLEAN DEFAULT TRUE
);

-- Seed Pfaffenhofen/Schrobenhausen region
INSERT INTO plz_regionen (region_name, plz_von, plz_bis, bonus_prozent) VALUES
  ('Pfaffenhofen a.d.Ilm', '85276', '85276', 0.002),
  ('Schrobenhausen', '86529', '86529', 0.002),
  ('Ingolstadt', '85049', '85057', 0.002),
  ('Neuburg a.d.Donau', '86633', '86633', 0.002),
  ('Aichach', '86551', '86551', 0.002);

-- ============================================================
-- PROVISIONEN (Commissions)
-- ============================================================
CREATE TABLE provisionen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id UUID NOT NULL REFERENCES fahrzeuge(id),
  verkauf_nutzer_id UUID NOT NULL REFERENCES nutzer(id),
  kunden_id UUID REFERENCES kunden(id),
  standort_id UUID REFERENCES standorte(id),

  -- Basis
  verkaufspreis DECIMAL(12,2) NOT NULL,
  gesamtkosten DECIMAL(12,2) NOT NULL,   -- EK + Aufbereitung + Reparatur + Sonstiges
  bruttoertrag DECIMAL(12,2) NOT NULL,

  -- Standzeit
  einkaufsdatum DATE,
  verkaufsdatum DATE,
  standzeit_tage INT,
  staffel_prozent DECIMAL(5,4),          -- z.B. 0.15 für 15%
  basis_provision DECIMAL(10,2),

  -- Regional Bonus
  regional_bonus_aktiv BOOLEAN DEFAULT FALSE,
  regional_bonus_prozent DECIMAL(5,4) DEFAULT 0,
  regional_bonus_betrag DECIMAL(10,2) DEFAULT 0,

  -- Zusatzgeschäfte
  finanzierung BOOLEAN DEFAULT FALSE,
  finanzierung_betrag DECIMAL(10,2) DEFAULT 50,
  rsv BOOLEAN DEFAULT FALSE,
  rsv_prozent DECIMAL(5,4) DEFAULT 0.25,
  rsv_ertrag DECIMAL(10,2) DEFAULT 0,
  rsv_provision DECIMAL(10,2) DEFAULT 0,
  versicherung BOOLEAN DEFAULT FALSE,
  versicherung_typ VARCHAR(50),          -- basis | standard | premium
  versicherung_betrag DECIMAL(10,2) DEFAULT 0,

  -- Totals
  gesamt_provision DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'offen',    -- offen | genehmigt | ausbezahlt | storniert

  genehmigt_von UUID REFERENCES nutzer(id),
  genehmigt_am TIMESTAMP,
  ausbezahlt_am TIMESTAMP,
  notizen TEXT,

  berechnet_am TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_provisionen_verkauf_nutzer ON provisionen(verkauf_nutzer_id);
CREATE INDEX idx_provisionen_fahrzeug ON provisionen(fahrzeug_id);
CREATE INDEX idx_provisionen_standort ON provisionen(standort_id);
CREATE INDEX idx_provisionen_datum ON provisionen(verkaufsdatum DESC);

-- ============================================================
-- PDF TEMPLATES
-- ============================================================
CREATE TABLE pdf_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  typ VARCHAR(50) NOT NULL,          -- expose | probefahrtvertrag | kaufvertrag | ...
  html_inhalt TEXT NOT NULL,
  beschreibung TEXT,
  aktiv BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,
  erstellt_von UUID REFERENCES nutzer(id),
  erstellt_am TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nutzer_id UUID REFERENCES nutzer(id),
  aktion VARCHAR(100) NOT NULL,
  tabelle VARCHAR(100),
  datensatz_id UUID,
  alte_werte JSONB,
  neue_werte JSONB,
  ip_adresse VARCHAR(45),
  user_agent TEXT,
  erstellt_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_nutzer ON audit_log(nutzer_id);
CREATE INDEX idx_audit_tabelle ON audit_log(tabelle, datensatz_id);
CREATE INDEX idx_audit_erstellt ON audit_log(erstellt_am DESC);

-- ============================================================
-- VIEWS
-- ============================================================

-- Vehicle overview with location and parking spot
CREATE VIEW v_fahrzeuge_uebersicht AS
SELECT
  f.id,
  f.intern_nummer,
  f.vin,
  f.kennzeichen,
  f.marke,
  f.modell,
  f.variante,
  f.baujahr,
  f.farbe,
  f.kilometer,
  f.kraftstoff,
  f.status,
  f.einkaufspreis,
  f.verkaufspreis,
  f.zielverkaufspreis,
  f.einkaufsdatum,
  f.verkaufsdatum,
  CURRENT_DATE - f.einkaufsdatum AS standzeit_tage,
  s.name AS standort_name,
  sp.bezeichnung AS stellplatz,
  sp.bereich AS stellplatz_bereich,
  k.vorname || ' ' || k.nachname AS kaeufer_name,
  ev.vorname || ' ' || ev.nachname AS einkauf_von,
  vv.vorname || ' ' || vv.nachname AS verkauf_von,
  (SELECT pfad FROM fahrzeug_fotos ff WHERE ff.fahrzeug_id = f.id AND ff.position = 0 LIMIT 1) AS titelbild
FROM fahrzeuge f
LEFT JOIN standorte s ON s.id = f.standort_id
LEFT JOIN stellplaetze sp ON sp.id = f.aktueller_stellplatz_id
LEFT JOIN kunden k ON k.id = f.kunden_id
LEFT JOIN nutzer ev ON ev.id = f.einkauf_nutzer_id
LEFT JOIN nutzer vv ON vv.id = f.verkauf_nutzer_id;

-- Commission summary per seller
CREATE VIEW v_provision_zusammenfassung AS
SELECT
  n.id AS nutzer_id,
  n.vorname || ' ' || n.nachname AS verkaefer,
  s.name AS standort,
  DATE_TRUNC('month', p.verkaufsdatum) AS monat,
  COUNT(*) AS anzahl_verkauefe,
  SUM(p.gesamt_provision) AS gesamt_provision,
  SUM(p.basis_provision) AS basis_provision,
  SUM(p.regional_bonus_betrag) AS regional_bonus,
  SUM(CASE WHEN p.finanzierung THEN p.finanzierung_betrag ELSE 0 END) AS finanzierung_provision,
  SUM(p.rsv_provision) AS rsv_provision,
  SUM(p.versicherung_betrag) AS versicherung_provision
FROM provisionen p
JOIN nutzer n ON n.id = p.verkauf_nutzer_id
LEFT JOIN standorte s ON s.id = p.standort_id
GROUP BY n.id, n.vorname, n.nachname, s.name, DATE_TRUNC('month', p.verkaufsdatum);
