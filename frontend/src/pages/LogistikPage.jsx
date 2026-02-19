import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Html5QrcodeScanner } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { QrCodeIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { stellplaetzeApi, standorteApi } from '../utils/api';
import clsx from 'clsx';

const STATUS_COLORS = {
  frei:       'bg-emerald-100 border-emerald-300 text-emerald-800',
  belegt:     'bg-red-100 border-red-300 text-red-800',
  reserviert: 'bg-amber-100 border-amber-300 text-amber-800',
  gesperrt:   'bg-gray-200 border-gray-300 text-gray-500',
};

export default function LogistikPage() {
  const [selectedStandort, setSelectedStandort] = useState('');
  const [scanStep, setScanStep] = useState(0); // 0=idle, 1=scan-vehicle, 2=scan-spot
  const [scannedFahrzeug, setScannedFahrzeug] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [hoveredSpot, setHoveredSpot] = useState(null);
  const queryClient = useQueryClient();

  const { data: standorte } = useQuery('standorte', () => standorteApi.list().then(r => r.data), {
    onSuccess: data => { if (data?.length && !selectedStandort) setSelectedStandort(data[0].id); }
  });

  const { data: rasterData, isLoading } = useQuery(
    ['raster', selectedStandort],
    () => stellplaetzeApi.raster(selectedStandort).then(r => r.data),
    { enabled: !!selectedStandort, refetchInterval: 30000 }
  );

  const scanMut = useMutation(
    (data) => stellplaetzeApi.scan(data),
    {
      onSuccess: (res) => {
        toast.success(`Fahrzeug ${res.data.fahrzeug.intern_nummer} → Stellplatz ${res.data.stellplatz.bezeichnung}`);
        queryClient.invalidateQueries(['raster', selectedStandort]);
        setScanStep(0);
        setScannedFahrzeug(null);
        setShowScanner(false);
      },
    }
  );

  const handleQrResult = (decodedText) => {
    try {
      const data = JSON.parse(decodedText);
      if (scanStep === 1 && data.type === 'fahrzeug') {
        setScannedFahrzeug(data);
        setScanStep(2);
        toast.success(`Fahrzeug: ${data.nr} erkannt. Jetzt Stellplatz scannen.`);
      } else if (scanStep === 2 && data.type === 'stellplatz') {
        scanMut.mutate({
          fahrzeug_id: scannedFahrzeug.id,
          stellplatz_token: data.token,
        });
      } else {
        toast.error('Falscher QR-Code-Typ');
      }
    } catch {
      toast.error('Ungültiger QR-Code');
    }
  };

  const stats = rasterData?.stats;

  return (
    <div className="space-y-4">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Logistik & Stellplätze</h2>
          <p className="text-sm text-gray-500">Schematisches Parkplatz-Raster</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            className="input w-auto"
            value={selectedStandort}
            onChange={e => setSelectedStandort(e.target.value)}
          >
            {(standorte || []).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={() => { setScanStep(1); setShowScanner(true); setScannedFahrzeug(null); }}
            className="btn-primary"
          >
            <QrCodeIcon className="w-4 h-4" />
            QR-Scan
          </button>
        </div>
      </div>

      {/* QR Scanner */}
      {showScanner && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold">
                Schritt {scanStep}: {scanStep === 1 ? 'Fahrzeug scannen' : 'Stellplatz scannen'}
              </h3>
              {scannedFahrzeug && (
                <p className="text-sm text-green-600">Fahrzeug: {scannedFahrzeug.nr} erkannt ✓</p>
              )}
            </div>
            <button onClick={() => { setShowScanner(false); setScanStep(0); setScannedFahrzeug(null); }} className="btn-secondary text-xs">
              Abbrechen
            </button>
          </div>
          <QrScannerComponent onResult={handleQrResult} />
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Gesamt', value: stats.gesamt, color: 'text-gray-900' },
            { label: 'Frei', value: stats.frei, color: 'text-emerald-600' },
            { label: 'Belegt', value: stats.belegt, color: 'text-red-600' },
            { label: 'Reserviert', value: stats.reserviert, color: 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card py-3 text-center">
              <div className={clsx('text-2xl font-bold', color)}>{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Grid Legend */}
      <div className="flex gap-4 text-xs flex-wrap">
        {[
          { label: 'Frei', cls: 'bg-emerald-100 border border-emerald-300' },
          { label: 'Belegt', cls: 'bg-red-100 border border-red-300' },
          { label: 'Reserviert', cls: 'bg-amber-100 border border-amber-300' },
          { label: 'Gesperrt', cls: 'bg-gray-200 border border-gray-300' },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={clsx('w-4 h-4 rounded', cls)} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>

      {/* Parking Raster */}
      {isLoading ? (
        <div className="p-8 text-center text-gray-400">Lade Raster...</div>
      ) : rasterData ? (
        <div className="card overflow-auto">
          <h3 className="font-semibold mb-3">{rasterData.standort?.name}</h3>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${rasterData.standort?.spalten || 20}, minmax(40px, 1fr))` }}
          >
            {(rasterData.raster || []).flat().map((spot, i) => (
              spot ? (
                <div
                  key={spot.id}
                  className={clsx(
                    'relative border rounded text-[10px] font-medium text-center cursor-pointer transition-all',
                    'p-1 min-h-[36px] flex flex-col items-center justify-center',
                    STATUS_COLORS[spot.status] || 'bg-gray-100 border-gray-200',
                    hoveredSpot?.id === spot.id ? 'ring-2 ring-primary-400 scale-105 z-10' : ''
                  )}
                  onMouseEnter={() => setHoveredSpot(spot)}
                  onMouseLeave={() => setHoveredSpot(null)}
                  title={spot.fahrzeug_id ? `${spot.marke} ${spot.modell} (${spot.intern_nummer}) · ${spot.standzeit_tage} Tage` : spot.bezeichnung}
                >
                  <span className="font-bold">{spot.bezeichnung}</span>
                  {spot.fahrzeug_id && (
                    <span className="truncate w-full text-center leading-tight">{spot.intern_nummer}</span>
                  )}
                </div>
              ) : (
                <div key={i} className="rounded bg-gray-50 border border-dashed border-gray-200 min-h-[36px]" />
              )
            ))}
          </div>

          {/* Tooltip */}
          {hoveredSpot?.fahrzeug_id && (
            <div className="mt-3 p-3 bg-gray-900 text-white rounded-lg text-sm max-w-xs">
              <div className="font-semibold">{hoveredSpot.marke} {hoveredSpot.modell}</div>
              <div className="text-gray-300 text-xs">{hoveredSpot.intern_nummer} · {hoveredSpot.standzeit_tage} Tage</div>
              <div className="text-gray-300 text-xs">{hoveredSpot.kennzeichen}</div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QrScannerComponent({ onResult }) {
  const divId = 'qr-scanner-div';

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(divId, {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
    }, false);

    scanner.render(
      (decodedText) => {
        scanner.clear();
        onResult(decodedText);
      },
      (err) => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, []);

  return <div id={divId} className="w-full" />;
}
