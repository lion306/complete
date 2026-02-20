#!/bin/bash
set -e

echo "=== DMS Deployment ==="

# Prüfen ob .env existiert
if [ ! -f .env ]; then
  echo "FEHLER: .env Datei fehlt! Kopiere .env.example und fülle die Werte aus."
  echo "  cp .env.example .env"
  exit 1
fi

# Neueste Version holen
echo "→ Git Pull..."
git pull origin claude/setup-supabase-connection-FHyJf

# Container neu bauen und starten
echo "→ Docker Compose Build & Start..."
docker compose down
docker compose build --no-cache
docker compose up -d

# Status anzeigen
echo ""
echo "=== Status ==="
docker compose ps

echo ""
echo "✓ Deployment abgeschlossen!"
echo "  App läuft auf: http://localhost:3000"
