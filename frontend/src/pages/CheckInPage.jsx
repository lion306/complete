/**
 * Mobile Check-in PWA Page
 * ──────────────────────────────────────────────────────────────────────
 * Optimized for smartphone use (large tap targets, camera access).
 * Flow:
 *   Step 1 → Enter / scan VIN  (camera or keyboard)
 *   Step 2 → Vehicle confirmed + basic inspection data
 *   Step 3 → Photo capture     (direct camera, no gallery save)
 *   Step 4 → Signature + complete
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation } from 'react-query';
import toast from 'react-hot-toast';
import {
  QrCodeIcon, CameraIcon, CheckCircleIcon, ArrowLeftIcon,
  TruckIcon, PhotoIcon, PencilIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import clsx from 'clsx';

const checkinApi = {
  findByVin: (vin) => api.get(`/checkin/vin/${vin}`).then(r => r.data),
  start:     (data) => api.post('/checkin/start', data),
  uploadFotos: (id, fd, onProgress) => api.post(`/checkin/${id}/fotos`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  }),
  complete: (id, data) => api.post(`/checkin/${id}/abschliessen`, data),
};

const ZUSTAND_OPTIONS = [
  { value: 'sehr_gut', label: 'Sehr gut' },
  { value: 'gut',      label: 'Gut' },
  { value: 'mittel',   label: 'Mittel' },
  { value: 'schlecht', label: 'Schlecht' },
];

const FOTO_KATEGORIEN = [
  { value: 'aussen_vorne',  label: 'Außen vorne',  emoji: '🚗' },
  { value: 'aussen_hinten', label: 'Außen hinten',  emoji: '🔙' },
  { value: 'aussen_links',  label: 'Seite links',   emoji: '◀️' },
  { value: 'aussen_rechts', label: 'Seite rechts',  emoji: '▶️' },
  { value: 'innen',         label: 'Innenraum',     emoji: '🪑' },
  { value: 'cockpit',       label: 'Cockpit',       emoji: '🎛️' },
  { value: 'schaden',       label: 'Schäden',       emoji: '⚠️' },
  { value: 'tacho',         label: 'Tacho / KM',    emoji: '🔢' },
];

// ─── Step indicator ───────────────────────────────────────────────────────────
function Steps({ current, total }) {
  return (
    <div className="flex gap-1.5 justify-center my-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={clsx(
          'h-2 rounded-full transition-all',
          i < current  ? 'bg-primary-600 w-6' :
          i === current ? 'bg-primary-700 w-8' : 'bg-gray-200 w-6'
        )} />
      ))}
    </div>
  );
}

// ─── Step 1: VIN lookup ───────────────────────────────────────────────────────
function StepVIN({ onFound }) {
  const [vin, setVin]       = useState('');
  const [loading, setLoad]  = useState(false);

  const handleSearch = async () => {
    if (vin.trim().length < 5) return;
    setLoad(true);
    try {
      const fz = await checkinApi.findByVin(vin.trim());
      onFound(fz);
    } catch {
      toast.error('Fahrzeug nicht gefunden. Bitte VIN prüfen.');
    } finally {
      setLoad(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <TruckIcon className="w-8 h-8 text-primary-700" />
        </div>
        <h2 className="text-xl font-bold">Fahrzeug finden</h2>
        <p className="text-gray-500 text-sm mt-1">VIN eingeben oder QR-Code scannen</p>
      </div>

      <div className="space-y-3">
        <input
          className="input text-lg tracking-widest uppercase text-center py-4"
          placeholder="VIN / Fahrgestellnummer"
          value={vin}
          onChange={e => setVin(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          maxLength={17}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          onClick={handleSearch}
          disabled={vin.trim().length < 5 || loading}
          className="btn-primary w-full py-4 text-base justify-center"
        >
          {loading ? 'Suche...' : 'Fahrzeug suchen →'}
        </button>
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-400">
          Die VIN findet sich auf der Windschutzscheibe (unten links) oder im Fahrzeugschein
        </p>
      </div>
    </div>
  );
}

// ─── Step 2: Inspection form ──────────────────────────────────────────────────
function StepInspection({ fahrzeug, onComplete }) {
  const [form, setForm] = useState({
    typ:            'anlieferung',
    kilometerstand: '',
    tankfuellung:   50,
    zustand_extern: 'gut',
    zustand_intern: 'gut',
    ort:            '',
  });

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Try to get geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => setForm(f => ({
          ...f,
          ort: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        })),
        () => {}
      );
    }
  }, []);

  const startMut = useMutation(
    () => checkinApi.start({ fahrzeug_id: fahrzeug.id, ...form }),
    {
      onSuccess: (res) => {
        toast.success('Check-in gestartet');
        onComplete(res.data.id);
      },
    }
  );

  return (
    <div className="space-y-5">
      {/* Vehicle confirmed */}
      <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircleIcon className="w-6 h-6 text-primary-600 flex-shrink-0" />
        <div>
          <div className="font-bold">{fahrzeug.marke} {fahrzeug.modell}</div>
          <div className="text-sm text-gray-500">{fahrzeug.intern_nummer} · {fahrzeug.vin}</div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label">Kilometerstand</label>
          <input
            type="number"
            className="input text-lg py-3"
            value={form.kilometerstand}
            onChange={e => setF('kilometerstand', e.target.value)}
            placeholder={fahrzeug.kilometer?.toLocaleString('de-DE') || '0'}
            inputMode="numeric"
          />
        </div>

        <div>
          <label className="label">Tankfüllung: {form.tankfuellung}%</label>
          <input
            type="range" min={0} max={100} step={5}
            className="w-full accent-primary-700"
            value={form.tankfuellung}
            onChange={e => setF('tankfuellung', parseInt(e.target.value))}
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Leer</span><span>1/4</span><span>1/2</span><span>3/4</span><span>Voll</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Zustand außen</label>
            <select className="input py-3" value={form.zustand_extern} onChange={e => setF('zustand_extern', e.target.value)}>
              {ZUSTAND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Zustand innen</label>
            <select className="input py-3" value={form.zustand_intern} onChange={e => setF('zustand_intern', e.target.value)}>
              {ZUSTAND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Typ</label>
          <select className="input py-3" value={form.typ} onChange={e => setF('typ', e.target.value)}>
            <option value="anlieferung">Anlieferung / Ankauf</option>
            <option value="abholung">Abholung / Verkauf</option>
            <option value="inspektion">Inspektion</option>
            <option value="standort_wechsel">Standort-Wechsel</option>
          </select>
        </div>
      </div>

      <button
        onClick={() => startMut.mutate()}
        disabled={startMut.isLoading}
        className="btn-primary w-full py-4 text-base justify-center"
      >
        {startMut.isLoading ? 'Starte...' : 'Fotos aufnehmen →'}
      </button>
    </div>
  );
}

// ─── Step 3: Photo capture ─────────────────────────────────────────────────────
function StepFotos({ checkinId, onComplete }) {
  const [captured, setCaptured]   = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [activeKat, setActiveKat] = useState('aussen_vorne');

  const handleCapture = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading(true);
    setProgress(0);

    const fd = new FormData();
    files.forEach(f => fd.append('fotos', f));
    fd.append('kategorie', activeKat);

    try {
      await checkinApi.uploadFotos(
        checkinId,
        fd,
        (pe) => setProgress(Math.round(pe.loaded / pe.total * 100))
      );

      // Preview
      const previews = await Promise.all(
        files.map(f => new Promise(res => {
          const reader = new FileReader();
          reader.onload = e => res({ src: e.target.result, kategorie: activeKat });
          reader.readAsDataURL(f);
        }))
      );
      setCaptured(prev => [...prev, ...previews]);
      toast.success(`${files.length} Foto(s) hochgeladen`);
    } catch {
      toast.error('Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      setProgress(0);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-bold text-lg">Fotos aufnehmen</h3>
        <p className="text-sm text-gray-500">{captured.length} Fotos aufgenommen</p>
      </div>

      {/* Category selector */}
      <div className="grid grid-cols-4 gap-1.5">
        {FOTO_KATEGORIEN.map(k => (
          <button
            key={k.value}
            onClick={() => setActiveKat(k.value)}
            className={clsx(
              'flex flex-col items-center gap-0.5 p-2 rounded-lg text-xs font-medium transition-colors border',
              activeKat === k.value
                ? 'bg-primary-700 text-white border-primary-700'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            )}
          >
            <span className="text-lg">{k.emoji}</span>
            <span className="text-[10px] leading-tight text-center">{k.label}</span>
            {captured.filter(c => c.kategorie === k.value).length > 0 && (
              <span className="bg-green-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {captured.filter(c => c.kategorie === k.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Camera button */}
      <label className={clsx(
        'flex flex-col items-center justify-center gap-3 w-full rounded-2xl border-2 border-dashed',
        'py-10 cursor-pointer transition-colors',
        uploading ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50'
      )}>
        {uploading ? (
          <>
            <div className="w-12 h-12 rounded-full border-4 border-primary-200 border-t-primary-700 animate-spin" />
            <span className="text-primary-700 font-medium">{progress}% hochgeladen...</span>
          </>
        ) : (
          <>
            <CameraIcon className="w-12 h-12 text-gray-400" />
            <div className="text-center">
              <div className="font-semibold text-gray-700">Foto aufnehmen</div>
              <div className="text-sm text-gray-400">
                Kategorie: {FOTO_KATEGORIEN.find(k => k.value === activeKat)?.label}
              </div>
            </div>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleCapture}
          disabled={uploading}
        />
      </label>

      {/* Preview grid */}
      {captured.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {captured.map((img, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img src={img.src} className="w-full h-full object-cover" alt="" />
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5 truncate px-1">
                {FOTO_KATEGORIEN.find(k => k.value === img.kategorie)?.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onComplete}
        className={clsx(
          'btn-primary w-full py-4 text-base justify-center',
          captured.length === 0 && 'opacity-50'
        )}
      >
        {captured.length === 0 ? 'Weiter ohne Fotos →' : `Weiter mit ${captured.length} Fotos →`}
      </button>
    </div>
  );
}

// ─── Step 4: Complete ─────────────────────────────────────────────────────────
function StepAbschluss({ checkinId, fahrzeug, onDone }) {
  const [notizen, setNotizen]       = useState('');
  const [name, setName]             = useState('');
  const canvasRef                   = useRef(null);
  const [drawing, setDrawing]       = useState(false);
  const [hasSig, setHasSig]         = useState(false);

  const getCanvasPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const { x, y } = getCanvasPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };

  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const { x, y } = getCanvasPos(e, canvas);
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSig(true);
  };

  const stopDraw = () => setDrawing(false);

  const clearSig = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  const completeMut = useMutation(
    () => {
      const unterschrift = hasSig ? canvasRef.current.toDataURL('image/svg+xml') : null;
      return checkinApi.complete(checkinId, { unterschrift, unterschrift_name: name, notizen });
    },
    {
      onSuccess: () => {
        toast.success('Check-in abgeschlossen ✓');
        onDone();
      },
    }
  );

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h3 className="font-bold text-lg">Abschluss</h3>
        <p className="text-sm text-gray-500">{fahrzeug.marke} {fahrzeug.modell} · {fahrzeug.intern_nummer}</p>
      </div>

      <div>
        <label className="label">Notizen / Anmerkungen</label>
        <textarea
          className="input resize-none"
          rows={3}
          value={notizen}
          onChange={e => setNotizen(e.target.value)}
          placeholder="Besonderheiten, Mängel, etc."
        />
      </div>

      <div>
        <label className="label">Name des Abgebenden</label>
        <input
          className="input py-3 text-base"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Vor- und Nachname"
        />
      </div>

      {/* Signature pad */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label">Unterschrift (optional)</label>
          {hasSig && (
            <button onClick={clearSig} className="text-xs text-red-500 hover:underline">
              Löschen
            </button>
          )}
        </div>
        <canvas
          ref={canvasRef}
          width={340} height={120}
          className="w-full border-2 border-gray-300 rounded-xl bg-gray-50 touch-none"
          style={{ touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!hasSig && (
          <p className="text-xs text-gray-400 text-center mt-1">Hier unterschreiben</p>
        )}
      </div>

      <button
        onClick={() => completeMut.mutate()}
        disabled={completeMut.isLoading}
        className="btn-success w-full py-4 text-base justify-center"
      >
        <CheckCircleIcon className="w-5 h-5" />
        {completeMut.isLoading ? 'Wird abgeschlossen...' : 'Check-in abschließen'}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CheckInPage() {
  const [step, setStep]           = useState(0);
  const [fahrzeug, setFahrzeug]   = useState(null);
  const [checkinId, setCheckinId] = useState(null);
  const [done, setDone]           = useState(false);

  if (done) {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircleIcon className="w-12 h-12 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-emerald-900">Check-in abgeschlossen!</h2>
          <p className="text-emerald-700 mt-1">
            {fahrzeug?.marke} {fahrzeug?.modell} wurde erfolgreich eingecheckt.
          </p>
        </div>
        <button
          onClick={() => { setStep(0); setFahrzeug(null); setCheckinId(null); setDone(false); }}
          className="btn-primary py-3 px-8"
        >
          Neues Fahrzeug einchecken
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 pt-4 mb-2">
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
        )}
        <h1 className="font-bold text-lg">Mobiler Check-in</h1>
      </div>
      <Steps current={step} total={4} />

      {step === 0 && (
        <StepVIN
          onFound={fz => { setFahrzeug(fz); setStep(1); }}
        />
      )}
      {step === 1 && fahrzeug && (
        <StepInspection
          fahrzeug={fahrzeug}
          onComplete={id => { setCheckinId(id); setStep(2); }}
        />
      )}
      {step === 2 && checkinId && (
        <StepFotos
          checkinId={checkinId}
          onComplete={() => setStep(3)}
        />
      )}
      {step === 3 && checkinId && fahrzeug && (
        <StepAbschluss
          checkinId={checkinId}
          fahrzeug={fahrzeug}
          onDone={() => setDone(true)}
        />
      )}
    </div>
  );
}
