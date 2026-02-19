-- Migration 002: Kanban, OCR, Schaden-Entscheidungen, Reporting
-- ================================================================

-- ============================================================
-- KANBAN LANES (configurable per location)
-- ============================================================
CREATE TABLE kanban_lanes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  standort_id   UUID REFERENCES standorte(id) ON DELETE CASCADE,
  bezeichnung   VARCHAR(80)  NOT NULL,   -- "Eingang", "Werkstatt", "Lack", "Aufbereitung", "Fertig"
  farbe         VARCHAR(20)  DEFAULT '#6b7280',
  position      INT          NOT NULL DEFAULT 0,
  ist_endstatus BOOLEAN      DEFAULT FALSE,
  aktiv         BOOLEAN      DEFAULT TRUE,
  erstellt_am   TIMESTAMP    DEFAULT NOW()
);

INSERT INTO kanban_lanes (id, standort_id, bezeichnung, farbe, position, ist_endstatus) VALUES
  (uuid_generate_v4(), NULL, 'Eingang / Ankauf',  '#3b82f6', 0, FALSE),
  (uuid_generate_v4(), NULL, 'Inspektion',         '#8b5cf6', 1, FALSE),
  (uuid_generate_v4(), NULL, 'Werkstatt',          '#f59e0b', 2, FALSE),
  (uuid_generate_v4(), NULL, 'Lackierung',         '#f97316', 3, FALSE),
  (uuid_generate_v4(), NULL, 'Aufbereitung',       '#ec4899', 4, FALSE),
  (uuid_generate_v4(), NULL, 'Fotoshooting',       '#06b6d4', 5, FALSE),
  (uuid_generate_v4(), NULL, 'Bereit / Angebot',  '#10b981', 6, FALSE),
  (uuid_generate_v4(), NULL, 'Verkauft',           '#6b7280', 7, TRUE);

-- ============================================================
-- KANBAN CARDS (= extended vehicle view)
-- Fahrzeuge already have status; this adds Kanban-specific data
-- ============================================================
ALTER TABLE fahrzeuge
  ADD COLUMN IF NOT EXISTS kanban_lane_id UUID REFERENCES kanban_lanes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kanban_position INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prioritaet VARCHAR(20) DEFAULT 'normal',
  -- normal | hoch | dringend
  ADD COLUMN IF NOT EXISTS faellig_am DATE,
  ADD COLUMN IF NOT EXISTS checkin_nutzer_id UUID REFERENCES nutzer(id),
  ADD COLUMN IF NOT EXISTS checkin_zeitpunkt TIMESTAMP,
  ADD COLUMN IF NOT EXISTS checkin_ort VARCHAR(200);

-- ============================================================
-- KANBAN ACTIVITY LOG (Spalte-Wechsel)
-- ============================================================
CREATE TABLE kanban_bewegungen (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id   UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  lane_alt_id   UUID REFERENCES kanban_lanes(id),
  lane_neu_id   UUID NOT NULL REFERENCES kanban_lanes(id),
  lane_alt_name VARCHAR(80),
  lane_neu_name VARCHAR(80),
  dauer_std     DECIMAL(8,2),  -- hours spent in previous lane
  nutzer_id     UUID REFERENCES nutzer(id),
  notiz         TEXT,
  erstellt_am   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_kanban_bewegungen_fahrzeug ON kanban_bewegungen(fahrzeug_id);

-- ============================================================
-- GUTACHTEN / BEGUTACHTUNGS-UPLOADS
-- ============================================================
CREATE TABLE gutachten (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id    UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  dateiname      VARCHAR(300) NOT NULL,
  pfad           VARCHAR(600) NOT NULL,
  groesse_bytes  INT,
  mime_type      VARCHAR(100) DEFAULT 'application/pdf',

  -- OCR Status
  ocr_status     VARCHAR(30) DEFAULT 'ausstehend',
  -- ausstehend | verarbeitung | abgeschlossen | fehler
  ocr_rohdaten   TEXT,        -- raw extracted text
  ocr_ergebnis   JSONB,       -- structured extracted data
  ocr_modell     VARCHAR(80), -- which AI model was used
  ocr_kosten_gesamt DECIMAL(12,2), -- sum of all extracted cost items

  -- Meta
  gutachter      VARCHAR(150),
  gutachten_datum DATE,
  notizen        TEXT,
  hochgeladen_von UUID REFERENCES nutzer(id),
  erstellt_am    TIMESTAMP DEFAULT NOW(),
  aktualisiert_am TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_gutachten_fahrzeug ON gutachten(fahrzeug_id);
CREATE INDEX idx_gutachten_ocr_status ON gutachten(ocr_status);

-- ============================================================
-- SCHADEN POSITIONEN (aus OCR extrahiert oder manuell)
-- ============================================================
CREATE TABLE schaden_positionen (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id      UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  gutachten_id     UUID REFERENCES gutachten(id) ON DELETE SET NULL,
  schaden_id       UUID REFERENCES schaeden(id) ON DELETE SET NULL,

  -- Extracted / entered data
  position_nr      INT,                    -- row number in the Gutachten
  kategorie        VARCHAR(100),           -- "Karosserie", "Lackierung", "Mechanik", etc.
  beschreibung     TEXT NOT NULL,
  bereich          VARCHAR(150),           -- "Vorderkotflügel links", "Stoßstange hinten"
  kosten_brutto    DECIMAL(10,2),
  kosten_netto     DECIMAL(10,2),
  mwst_satz        DECIMAL(5,2) DEFAULT 19.00,
  ursprung         VARCHAR(30) DEFAULT 'ocr',
  -- ocr | manuell | import

  -- *** ENTSCHEIDUNG ***
  entscheidung     VARCHAR(30) DEFAULT 'ausstehend',
  -- ausstehend | reparieren | ignorieren | kundenabzug
  entscheidung_von UUID REFERENCES nutzer(id),
  entscheidung_am  TIMESTAMP,
  kundenabzug_betrag DECIMAL(10,2),        -- custom deduction amount if "kundenabzug"
  entscheidung_notiz TEXT,

  -- OCR confidence
  ocr_konfidenz    DECIMAL(5,2),           -- 0-100 %

  erstellt_am      TIMESTAMP DEFAULT NOW(),
  aktualisiert_am  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_schaden_pos_fahrzeug  ON schaden_positionen(fahrzeug_id);
CREATE INDEX idx_schaden_pos_gutachten ON schaden_positionen(gutachten_id);
CREATE INDEX idx_schaden_pos_entscheid ON schaden_positionen(entscheidung);

-- ============================================================
-- CHECK-IN PROTOKOLL (Mobile Anlieferung)
-- ============================================================
CREATE TABLE checkin_protokolle (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fahrzeug_id    UUID NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  nutzer_id      UUID REFERENCES nutzer(id),

  -- Check-in details
  typ            VARCHAR(30) DEFAULT 'anlieferung',
  -- anlieferung | abholung | standort_wechsel | inspektion
  ort            VARCHAR(200),
  kilometerstand INT,
  tankfuellung   INT,         -- percentage 0-100
  zustand_extern VARCHAR(30), -- sehr_gut | gut | mittel | schlecht
  zustand_intern VARCHAR(30),

  -- Geo
  latitude       DECIMAL(10,7),
  longitude      DECIMAL(10,7),

  -- Fotos (references to fahrzeug_fotos)
  foto_ids       UUID[],

  -- Unterschrift (Base64 SVG)
  unterschrift   TEXT,
  unterschrift_name VARCHAR(150),

  notizen        TEXT,
  abgeschlossen  BOOLEAN DEFAULT FALSE,
  erstellt_am    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_checkin_fahrzeug ON checkin_protokolle(fahrzeug_id);

-- ============================================================
-- REPORTING VIEW: Standzeiten & Kosten
-- ============================================================
CREATE OR REPLACE VIEW v_fahrzeug_reporting AS
SELECT
  f.id,
  f.intern_nummer,
  f.vin,
  f.marke,
  f.modell,
  f.variante,
  f.baujahr,
  f.kilometer,
  f.status,
  f.einkaufsdatum,
  f.verkaufsdatum,
  f.einkaufspreis,
  f.verkaufspreis,
  f.aufbereitungskosten,
  f.reparaturkosten,
  f.sonstige_kosten,
  f.bruttoertrag,
  f.kanban_lane_id,
  kl.bezeichnung AS kanban_lane,
  kl.farbe AS kanban_farbe,
  f.prioritaet,
  f.faellig_am,

  s.name AS standort_name,

  -- Standzeit-Berechnungen
  CURRENT_DATE - f.einkaufsdatum                    AS standzeit_tage,
  CASE
    WHEN f.verkaufsdatum IS NOT NULL
    THEN f.verkaufsdatum - f.einkaufsdatum
    ELSE CURRENT_DATE - f.einkaufsdatum
  END                                               AS standzeit_gesamt_tage,

  -- Kosten-Aggregationen
  COALESCE(f.einkaufspreis, 0)
    + COALESCE(f.aufbereitungskosten, 0)
    + COALESCE(f.reparaturkosten, 0)
    + COALESCE(f.sonstige_kosten, 0)               AS gesamtkosten,

  -- Schaden-Statistiken
  (SELECT COUNT(*) FROM schaden_positionen sp WHERE sp.fahrzeug_id = f.id)               AS schaden_anzahl,
  (SELECT COUNT(*) FROM schaden_positionen sp WHERE sp.fahrzeug_id = f.id AND sp.entscheidung = 'reparieren') AS schaden_reparieren,
  (SELECT COUNT(*) FROM schaden_positionen sp WHERE sp.fahrzeug_id = f.id AND sp.entscheidung = 'ignorieren') AS schaden_ignorieren,
  (SELECT COUNT(*) FROM schaden_positionen sp WHERE sp.fahrzeug_id = f.id AND sp.entscheidung = 'kundenabzug') AS schaden_kundenabzug,
  (SELECT COUNT(*) FROM schaden_positionen sp WHERE sp.fahrzeug_id = f.id AND sp.entscheidung = 'ausstehend') AS schaden_ausstehend,
  (SELECT COALESCE(SUM(sp.kosten_brutto),0) FROM schaden_positionen sp WHERE sp.fahrzeug_id = f.id AND sp.entscheidung = 'reparieren') AS reparatur_kosten_gesamt,
  (SELECT COALESCE(SUM(sp.kundenabzug_betrag),0) FROM schaden_positionen sp WHERE sp.fahrzeug_id = f.id AND sp.entscheidung = 'kundenabzug') AS kundenabzug_gesamt,

  -- Foto-Statistik
  (SELECT COUNT(*) FROM fahrzeug_fotos ff WHERE ff.fahrzeug_id = f.id)                   AS foto_anzahl,
  (SELECT pfad FROM fahrzeug_fotos ff WHERE ff.fahrzeug_id = f.id AND ff.position = 0 LIMIT 1) AS titelbild,

  -- Gutachten
  (SELECT COUNT(*) FROM gutachten g WHERE g.fahrzeug_id = f.id)                          AS gutachten_anzahl,

  -- Verkäufer / Einkäufer
  (SELECT vorname || ' ' || nachname FROM nutzer WHERE id = f.verkauf_nutzer_id)         AS verkaefer,
  (SELECT vorname || ' ' || nachname FROM nutzer WHERE id = f.einkauf_nutzer_id)         AS einkauf_von,

  f.erstellt_am,
  f.aktualisiert_am

FROM fahrzeuge f
LEFT JOIN standorte   s  ON s.id  = f.standort_id
LEFT JOIN kanban_lanes kl ON kl.id = f.kanban_lane_id;

-- ============================================================
-- Standzeit-Warnstufen VIEW
-- ============================================================
CREATE OR REPLACE VIEW v_standzeit_ampel AS
SELECT
  id, intern_nummer, marke, modell, status, standzeit_tage,
  CASE
    WHEN standzeit_tage < 30  THEN 'gruen'
    WHEN standzeit_tage < 60  THEN 'gelb'
    WHEN standzeit_tage < 90  THEN 'orange'
    ELSE                            'rot'
  END AS ampel,
  CASE
    WHEN standzeit_tage < 30  THEN 'Gut (< 30 Tage)'
    WHEN standzeit_tage < 60  THEN 'Beobachten (30-60 Tage)'
    WHEN standzeit_tage < 90  THEN 'Handlungsbedarf (60-90 Tage)'
    ELSE                            'KRITISCH (> 90 Tage)'
  END AS ampel_label
FROM v_fahrzeug_reporting
WHERE status NOT IN ('verkauft', 'archiv');
