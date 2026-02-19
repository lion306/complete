# Autohaus DMS - Dealer Management System

Ein vollständiges, responsives Web-DMS (Progressive Web App) für ein Autohaus mit 150 Nutzern und mehreren Standorten.

## Tech-Stack

| Layer    | Technologie                        |
|----------|------------------------------------|
| Frontend | React 18, Tailwind CSS, Recharts   |
| Backend  | Node.js, Express, Knex             |
| Database | PostgreSQL 15                      |
| PDF      | Puppeteer (HTML → PDF)             |
| Images   | Sharp (Optimierung & Thumbnails)   |
| Auth     | JWT + Refresh Tokens               |
| QR       | html5-qrcode, qrcode               |

## Module

### Teil 1: Datenbankschema & Architektur
- Vollständiges PostgreSQL-Schema für Fahrzeuge, Standorte, Nutzer, Kunden, Leads
- Granulare Berechtigungs-Flags pro Nutzer
- Standortübergreifende Sichtbarkeit konfigurierbar

### Teil 2: Fahrzeug & Logistik
- **QR-Scan**: Zweistufiger QR-Scan (Fahrzeug → Stellplatz) per Smartphone-Browser
- **Parkplatz-Raster**: Schematische Karte (Grün/Rot/Gelb) mit Hover-Tooltip
- **Status-Timeline**: Visueller Fortschritt (Eingang → Werkstatt → Aufbereitung → Verkauf)
- **Foto-Upload**: Automatische Thumbnail-Generierung, Titelbildverwaltung

### Teil 3: Finanzen & Provision
- **GW-Staffel**: Zeitbasierte Provisionsstaffel (< 60 Tage: 15%, 60-80: 11%, 80-110: 9%, > 110: 7%)
- **Regional-Bonus**: PLZ-Mapping (Pfaffenhofen, Schrobenhausen, etc.) → +0,2%
- **Zusatzgeschäfte**: Finanzierung (50€ fix), RSV (25% vom Ertrag), Versicherung (20-50€)
- **Provisions-Kalkulator**: Live-Berechnung im Browser
- **Dashboard**: Verkäufer-Ansicht (eigene) & Leiter-Ansicht (kumuliert)

### Teil 4: CRM & Dokumente
- **Email-Parser**: IMAP-Anbindung für Mobile.de & AutoScout24 Leads
- **Lead-Management**: Vollständiger Pipeline-Workflow mit Aktivitätslog
- **PDF-Generator**: HTML-Template-Engine mit `{{platzhalter}}`-Syntax
  - Exposé-PDF
  - Probefahrtvertrag
- **Börsen-Export**: XML für Mobile.de, CSV für AutoScout24

## Schnellstart

```bash
# 1. Repository klonen
git clone <repo>
cd dms-autohaus

# 2. Umgebungsvariablen konfigurieren
cp backend/.env.example backend/.env
# .env anpassen

# 3. Docker Compose starten
docker-compose up -d

# 4. Datenbank migrieren
docker exec dms_backend node migrations/run.js

# 5. Seed-Daten einspielen
docker exec dms_backend node migrations/seed.js
```

**Zugang nach Setup:**
- URL: http://localhost:3000
- Admin: `admin@autohaus.de` / `Admin2024!`
- Verkäufer: `mueller@autohaus.de` / `Autohaus2024!`

## Lokale Entwicklung (ohne Docker)

```bash
# PostgreSQL lokal starten
# backend/.env konfigurieren

cd backend
npm install
node migrations/run.js
node migrations/seed.js
npm run dev  # Port 3001

cd ../frontend
npm install
npm start    # Port 3000
```

## API-Endpunkte (Auszug)

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| POST | /api/auth/login | Anmelden |
| GET | /api/fahrzeuge | Fahrzeugliste |
| POST | /api/fahrzeuge | Fahrzeug anlegen |
| GET | /api/fahrzeuge/:id | Fahrzeug-Detail |
| POST | /api/fahrzeuge/:id/status | Statuswechsel |
| POST | /api/fahrzeuge/:id/verkauf | Verkauf abschließen |
| GET | /api/stellplaetze/raster/:standort_id | Parkplatz-Raster |
| POST | /api/stellplaetze/scan | QR-Scan verarbeiten |
| GET | /api/provisionen/dashboard | Provisions-Dashboard |
| POST | /api/provisionen/berechnen | Provision kalkulieren |
| POST | /api/leads/import/email | Email-Leads importieren |
| POST | /api/dokumente/generieren | PDF generieren |
| POST | /api/export/mobilede | Mobile.de Export |
| POST | /api/export/autoscout | AutoScout24 Export |

## Berechtigungssystem

Jeder Nutzer hat granulare Flags:

| Flag | Beschreibung |
|------|-------------|
| `perm_fahrzeug_anlegen` | Fahrzeuge erfassen |
| `perm_fahrzeug_einkaufspreis_sehen` | EK-Preis sichtbar |
| `perm_provision_sehen` | Eigene Provision |
| `perm_provision_alle_sehen` | Alle Provisionen |
| `perm_export_boersen` | Mobile.de / AS24 |
| `perm_admin` | Voller Zugriff |

## Provisions-Logik

```
Bruttoertrag = Verkaufspreis - (EK + Aufbereitung + Reparatur + Sonstiges)

Staffel (Standzeit):
  < 60 Tage  → 15%
  60-80 Tage → 11%
  80-110 Tage→ 9%
  >110 Tage  → 7%

Regional-Bonus (Kunden-PLZ in definierten Regionen):
  + 0,2% vom Bruttoertrag

Zusatzgeschäfte:
  Finanzierung → +50€ fix
  RSV          → +25% vom RSV-Ertrag
  Versicherung → +20/35/50€ (Basis/Standard/Premium)
```
