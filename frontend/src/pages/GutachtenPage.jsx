/**
 * Gutachten Page – PDF Upload + OCR Analysis + Schaden-Entscheidungen
 *
 * Combines:
 *   - PDF upload per vehicle
 *   - Real-time OCR status polling
 *   - Extracted damage list with per-item decisions
 *   - Cost summary
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  DocumentArrowUpIcon, ArrowPathIcon, CheckCircleIcon,
  XCircleIcon, MinusCircleIcon, ClockIcon, CurrencyEuroIcon,
  MagnifyingGlassIcon, DocumentTextIcon, TruckIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import { fahrzeugeApi } from '../utils/api';
import clsx from 'clsx';

// ─── API helpers ──────────────────────────────────────────────────────────────
const gutachtenApi = {
  list:     (fzId)     => api.get(`/gutachten/fahrzeug/${fzId}`).then(r => r.data),
  get:      (id)       => api.get(`/gutachten/${id}`).then(r => r.data),
  status:   (id)       => api.get(`/gutachten/${id}/status`).then(r => r.data),
  retry:    (id)       => api.post(`/gutachten/${id}/ocr-retry`),
  upload:   (fzId, fd, onProg) => api.post(`/gutachten/upload/${fzId}`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProg,
  }),
  entscheid: (id, data) => api.put(`/gutachten/positionen/${id}/entscheidung`, data),
  bulkEntscheid: (data) => api.put('/gutachten/positionen/bulk-entscheidung', data),
  positionenFz:  (fzId) => api.get(`/gutachten/positionen/fahrzeug/${fzId}`).then(r => r.data),
};

// ─── Entscheidung Button Group ────────────────────────────────────────────────
const ENTSCHEIDUNGEN = [
  { value: 'reparieren',   label: 'Reparieren',   icon: CheckCircleIcon,  cls: 'bg-red-600 text-white',    active: 'ring-2 ring-red-700' },
  { value: 'ignorieren',   label: 'Ignorieren',   icon: MinusCircleIcon,  cls: 'bg-gray-500 text-white',   active: 'ring-2 ring-gray-600' },
  { value: 'kundenabzug',  label: 'Kd.-Abzug',   icon: CurrencyEuroIcon, cls: 'bg-amber-500 text-white',  active: 'ring-2 ring-amber-600' },
];

function EntscheidungButtons({ positionId, current, onSave, showAbzugInput }) {
  const [loading, setLoading]    = useState(false);
  const [abzug, setAbzug]        = useState('');
  const [showAbzug, setShowAbzug] = useState(current === 'kundenabzug');

  const handleClick = async (val) => {
    if (val === 'kundenabzug') {
      setShowAbzug(true);
      return;
    }
    setLoading(true);
    await onSave(positionId, val, null);
    setLoading(false);
    setShowAbzug(false);
  };

  const handleAbzug = async () => {
    if (!abzug) return;
    setLoading(true);
    await onSave(positionId, 'kundenabzug', parseFloat(abzug));
    setLoading(false);
    setShowAbzug(false);
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {ENTSCHEIDUNGEN.map(e => (
          <button
            key={e.value}
            disabled={loading}
            onClick={() => handleClick(e.value)}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all',
              e.cls,
              current === e.value ? e.active : 'opacity-60 hover:opacity-100'
            )}
          >
            <e.icon className="w-3.5 h-3.5" />
            {e.label}
          </button>
        ))}
      </div>
      {showAbzug && (
        <div className="flex gap-1 mt-1">
          <input
            type="number"
            className="input text-sm py-1 px-2 w-24"
            placeholder="Betrag €"
            value={abzug}
            onChange={e => setAbzug(e.target.value)}
          />
          <button onClick={handleAbzug} className="btn-primary text-xs py-1 px-2">OK</button>
          <button onClick={() => setShowAbzug(false)} className="btn-secondary text-xs py-1 px-2">×</button>
        </div>
      )}
    </div>
  );
}

// ─── Confidence badge ─────────────────────────────────────────────────────────
function KonfidenzBadge({ wert }) {
  if (!wert) return null;
  const v = parseFloat(wert);
  const cls = v >= 80 ? 'bg-green-100 text-green-700'
            : v >= 50 ? 'bg-yellow-100 text-yellow-700'
            :            'bg-red-100 text-red-700';
  return (
    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-mono', cls)}>
      {Math.round(v)}%
    </span>
  );
}

// ─── OCR Status indicator ─────────────────────────────────────────────────────
function OcrStatus({ status, onRetry }) {
  const map = {
    ausstehend:  { icon: ClockIcon,        cls: 'text-gray-500',  label: 'Ausstehend' },
    verarbeitung:{ icon: ArrowPathIcon,    cls: 'text-blue-600 animate-spin', label: 'Wird verarbeitet...' },
    abgeschlossen:{ icon: CheckCircleIcon, cls: 'text-green-600', label: 'OCR abgeschlossen' },
    fehler:      { icon: XCircleIcon,      cls: 'text-red-600',   label: 'OCR Fehler' },
  };
  const { icon: Icon, cls, label } = map[status] || map.ausstehend;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={clsx('w-4 h-4', cls)} />
      <span className={cls}>{label}</span>
      {status === 'fehler' && (
        <button onClick={onRetry} className="text-xs text-primary-600 hover:underline ml-2">
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

// ─── Gutachten Detail ─────────────────────────────────────────────────────────
function GutachtenDetail({ gutachtenId, onClose }) {
  const queryClient  = useQueryClient();
  const pollRef      = useRef(null);
  const [filter, setFilter] = useState('alle');

  const { data, refetch } = useQuery(
    ['gutachten', gutachtenId],
    () => gutachtenApi.get(gutachtenId),
    { refetchOnWindowFocus: false }
  );

  // Poll while processing
  useEffect(() => {
    if (data?.ocr_status === 'verarbeitung' || data?.ocr_status === 'ausstehend') {
      pollRef.current = setInterval(() => refetch(), 3000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [data?.ocr_status]);

  const entscheidMut = useMutation(
    ({ id, entscheidung, kundenabzug_betrag }) =>
      gutachtenApi.entscheid(id, { entscheidung, kundenabzug_betrag }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['gutachten', gutachtenId]);
      },
    }
  );

  const retryMut = useMutation(
    () => gutachtenApi.retry(gutachtenId),
    {
      onSuccess: () => {
        toast.success('OCR neu gestartet');
        setTimeout(() => refetch(), 2000);
      },
    }
  );

  if (!data) return null;

  const positionen = data.positionen || [];
  const filtered   = filter === 'alle' ? positionen
    : positionen.filter(p => p.entscheidung === filter);

  const summary = {
    reparatur:   positionen.filter(p => p.entscheidung === 'reparieren').reduce((a, p) => a + (parseFloat(p.kosten_brutto) || 0), 0),
    kundenabzug: positionen.filter(p => p.entscheidung === 'kundenabzug').reduce((a, p) => a + (parseFloat(p.kundenabzug_betrag) || 0), 0),
    ausstehend:  positionen.filter(p => p.entscheidung === 'ausstehend').length,
  };

  const FILTER_TABS = [
    { value: 'alle',         label: `Alle (${positionen.length})` },
    { value: 'ausstehend',   label: `Ausstehend (${positionen.filter(p => p.entscheidung === 'ausstehend').length})` },
    { value: 'reparieren',   label: 'Reparieren' },
    { value: 'ignorieren',   label: 'Ignorieren' },
    { value: 'kundenabzug',  label: 'Kd.-Abzug' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-lg">{data.dateiname}</h3>
          <OcrStatus status={data.ocr_status} onRetry={() => retryMut.mutate()} />
        </div>
        <button onClick={onClose} className="btn-secondary text-xs py-1">← Zurück</button>
      </div>

      {/* Summary cards */}
      {data.ocr_status === 'abgeschlossen' && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-red-700">
              {summary.reparatur.toLocaleString('de-DE', { minimumFractionDigits: 0 })} €
            </div>
            <div className="text-xs text-red-600">Reparaturkosten</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-amber-700">
              {summary.kundenabzug.toLocaleString('de-DE', { minimumFractionDigits: 0 })} €
            </div>
            <div className="text-xs text-amber-600">Kundenabzug</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-gray-700">{summary.ausstehend}</div>
            <div className="text-xs text-gray-500">Ausstehend</div>
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {(data.ocr_status === 'verarbeitung' || data.ocr_status === 'ausstehend') && (
        <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-4">
          <ArrowPathIcon className="w-6 h-6 text-blue-600 animate-spin flex-shrink-0" />
          <div>
            <div className="font-medium text-blue-800">OCR läuft...</div>
            <div className="text-sm text-blue-600">
              Das Gutachten wird analysiert. Diese Seite aktualisiert sich automatisch.
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {positionen.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={clsx(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                filter === t.value
                  ? 'bg-primary-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Positions list */}
      <div className="space-y-2">
        {filtered.map(pos => (
          <div
            key={pos.id}
            className={clsx(
              'border rounded-xl p-3 transition-colors',
              pos.entscheidung === 'reparieren'  ? 'border-red-200 bg-red-50' :
              pos.entscheidung === 'ignorieren'  ? 'border-gray-200 bg-gray-50 opacity-70' :
              pos.entscheidung === 'kundenabzug' ? 'border-amber-200 bg-amber-50' :
              'border-gray-200 bg-white'
            )}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">#{pos.position_nr}</span>
                  {pos.kategorie && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                      {pos.kategorie}
                    </span>
                  )}
                  <KonfidenzBadge wert={pos.ocr_konfidenz} />
                </div>
                <p className="text-sm font-medium mt-0.5 leading-snug">{pos.beschreibung}</p>
                {pos.bereich && (
                  <p className="text-xs text-gray-500 mt-0.5">📍 {pos.bereich}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                {pos.kosten_brutto && (
                  <div className="font-bold text-sm text-gray-900">
                    {parseFloat(pos.kosten_brutto).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </div>
                )}
                {pos.entscheidung === 'kundenabzug' && pos.kundenabzug_betrag && (
                  <div className="text-xs text-amber-700 font-medium">
                    Abzug: {parseFloat(pos.kundenabzug_betrag).toFixed(2)} €
                  </div>
                )}
              </div>
            </div>

            {/* Decision buttons */}
            <EntscheidungButtons
              positionId={pos.id}
              current={pos.entscheidung}
              onSave={async (id, entscheidung, kundenabzug_betrag) => {
                await entscheidMut.mutateAsync({ id, entscheidung, kundenabzug_betrag });
              }}
            />

            {pos.entscheider_name && (
              <p className="text-[10px] text-gray-400 mt-1">
                Entschieden von {pos.entscheider_name} · {pos.entscheidung_am && new Date(pos.entscheidung_am).toLocaleDateString('de-DE')}
              </p>
            )}
          </div>
        ))}

        {positionen.length === 0 && data.ocr_status === 'abgeschlossen' && (
          <div className="text-center text-gray-400 py-8">
            Keine Schadenspositionen gefunden. Gutachten manuell prüfen.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function GutachtenPage() {
  const [searchParams]            = useSearchParams();
  const queryClient               = useQueryClient();
  const [fahrzeugId, setFahrzeugId] = useState(searchParams.get('fahrzeug_id') || '');
  const [selectedGutachten, setSelectedGutachten] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [vinSearch, setVinSearch] = useState('');

  const { data: fahrzeug } = useQuery(
    ['fahrzeug-mini', fahrzeugId],
    () => fahrzeugeApi.get(fahrzeugId).then(r => r.data),
    { enabled: !!fahrzeugId }
  );

  const { data: gutachtenList, refetch: refetchList } = useQuery(
    ['gutachten-list', fahrzeugId],
    () => gutachtenApi.list(fahrzeugId),
    { enabled: !!fahrzeugId }
  );

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !fahrzeugId) return;
    setUploading(true);
    setUploadProgress(0);

    const fd = new FormData();
    fd.append('gutachten', file);

    try {
      const res = await gutachtenApi.upload(
        fahrzeugId,
        fd,
        pe => setUploadProgress(Math.round(pe.loaded / pe.total * 100))
      );
      toast.success('Gutachten hochgeladen – OCR läuft');
      refetchList();
      setSelectedGutachten(res.data.id);
    } catch {
      toast.error('Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleVinSearch = async () => {
    if (!vinSearch.trim()) return;
    try {
      const res = await api.get(`/checkin/vin/${vinSearch.trim()}`);
      setFahrzeugId(res.data.id);
    } catch {
      toast.error('Fahrzeug nicht gefunden');
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">Gutachten & OCR-Analyse</h2>
        <p className="text-sm text-gray-500">
          PDF-Gutachten hochladen → KI extrahiert Schadenspositionen → Entscheidung treffen
        </p>
      </div>

      {/* Vehicle selector */}
      {!fahrzeugId ? (
        <div className="card space-y-3">
          <h3 className="font-semibold">Fahrzeug wählen</h3>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="VIN / Intern-Nr suchen..."
                value={vinSearch}
                onChange={e => setVinSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleVinSearch(); }}
              />
            </div>
            <button onClick={handleVinSearch} className="btn-primary">Suchen</button>
          </div>
        </div>
      ) : (
        <>
          {/* Fahrzeug header */}
          {fahrzeug && (
            <div className="flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-xl p-3">
              <TruckIcon className="w-5 h-5 text-primary-600 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">{fahrzeug.marke} {fahrzeug.modell}</div>
                <div className="text-sm text-gray-500">{fahrzeug.intern_nummer} · {fahrzeug.vin}</div>
              </div>
              <button onClick={() => { setFahrzeugId(''); setSelectedGutachten(null); }} className="text-xs text-primary-600 hover:underline">
                Wechseln
              </button>
            </div>
          )}

          {/* Detail view OR list */}
          {selectedGutachten ? (
            <GutachtenDetail
              gutachtenId={selectedGutachten}
              onClose={() => setSelectedGutachten(null)}
            />
          ) : (
            <div className="space-y-3">
              {/* Upload area */}
              <label className={clsx(
                'flex flex-col items-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors',
                uploading
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
              )}>
                {uploading ? (
                  <>
                    <ArrowPathIcon className="w-10 h-10 text-primary-600 animate-spin" />
                    <div className="text-primary-700 font-medium">{uploadProgress}% hochgeladen...</div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className="bg-primary-700 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </>
                ) : (
                  <>
                    <DocumentArrowUpIcon className="w-10 h-10 text-gray-400" />
                    <div className="text-center">
                      <div className="font-semibold text-gray-700">Gutachten hochladen</div>
                      <div className="text-sm text-gray-400">PDF-Datei klicken oder hierher ziehen</div>
                      <div className="text-xs text-gray-400 mt-1">Max. 50 MB · Nur PDF</div>
                    </div>
                  </>
                )}
                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>

              {/* Gutachten list */}
              {(gutachtenList || []).length > 0 && (
                <div className="card p-0 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="font-semibold text-sm">Vorhandene Gutachten</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {gutachtenList.map(g => (
                      <div
                        key={g.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedGutachten(g.id)}
                      >
                        <DocumentTextIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{g.dateiname}</div>
                          <div className="text-xs text-gray-400">
                            {new Date(g.erstellt_am).toLocaleDateString('de-DE')} ·{' '}
                            {g.hochgeladen_von_name}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <OcrStatus status={g.ocr_status} onRetry={() => {}} />
                          {g.ocr_kosten_gesamt > 0 && (
                            <span className="text-sm font-medium text-gray-700">
                              {parseFloat(g.ocr_kosten_gesamt).toLocaleString('de-DE', { minimumFractionDigits: 0 })} €
                            </span>
                          )}
                          <span className="text-primary-600 text-xs">→</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(gutachtenList || []).length === 0 && !uploading && (
                <div className="text-center text-gray-400 py-6 text-sm">
                  Noch kein Gutachten hochgeladen
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
