import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Tab } from '@headlessui/react';
import toast from 'react-hot-toast';
import {
  PencilIcon, QrCodeIcon, DocumentTextIcon, CameraIcon, WrenchIcon,
  ArrowLeftIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { fahrzeugeApi, fotosApi, schaedenApi, dokumenteApi } from '../utils/api';
import useAuthStore from '../store/authStore';
import clsx from 'clsx';

const STATUS_SEQUENCE = [
  { key: 'eingang',       label: 'Eingang' },
  { key: 'inspektion',    label: 'Inspektion' },
  { key: 'werkstatt',     label: 'Werkstatt' },
  { key: 'aufbereitung',  label: 'Aufbereitung' },
  { key: 'bereit',        label: 'Bereit' },
  { key: 'aktiv_angebot', label: 'Im Angebot' },
  { key: 'verkauft',      label: 'Verkauft' },
];

export default function FahrzeugDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [selectedTab, setSelectedTab] = useState(0);
  const [showQR, setShowQR] = useState(false);

  const { data: fz, isLoading } = useQuery(
    ['fahrzeug', id],
    () => fahrzeugeApi.get(id).then(r => r.data)
  );

  const { data: history } = useQuery(
    ['fahrzeug-history', id],
    () => fahrzeugeApi.statusHistory(id).then(r => r.data)
  );

  const { data: qrData } = useQuery(
    ['fahrzeug-qr', id],
    () => fahrzeugeApi.qrCode(id).then(r => r.data),
    { enabled: showQR }
  );

  const statusMut = useMutation(
    ({ status, notiz }) => fahrzeugeApi.updateStatus(id, { status, notiz }),
    {
      onSuccess: () => {
        toast.success('Status aktualisiert');
        queryClient.invalidateQueries(['fahrzeug', id]);
        queryClient.invalidateQueries(['fahrzeug-history', id]);
      },
    }
  );

  const pdfMut = useMutation(
    (typ) => dokumenteApi.generieren({ fahrzeug_id: id, typ }),
    { onSuccess: () => toast.success('PDF erstellt') }
  );

  if (isLoading) return <div className="p-8 text-center text-gray-400">Laden...</div>;
  if (!fz) return <div className="p-8 text-center text-red-500">Fahrzeug nicht gefunden</div>;

  const currentStatusIdx = STATUS_SEQUENCE.findIndex(s => s.key === fz.status);

  const tabs = [
    { label: 'Übersicht', icon: null },
    { label: 'Fotos', icon: CameraIcon },
    { label: 'Schäden', icon: WrenchIcon },
    { label: 'Dokumente', icon: DocumentTextIcon },
    { label: 'Timeline', icon: null },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-secondary p-2">
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{fz.marke} {fz.modell}</h2>
            <div className="text-sm text-gray-500">{fz.intern_nummer} · {fz.variante}</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowQR(v => !v)} className="btn-secondary">
            <QrCodeIcon className="w-4 h-4" />
            QR-Code
          </button>
          {hasPermission('perm_dokument_generieren') && (
            <button onClick={() => pdfMut.mutate('expose')} className="btn-secondary">
              <DocumentTextIcon className="w-4 h-4" />
              Exposé
            </button>
          )}
        </div>
      </div>

      {/* QR Code Modal */}
      {showQR && qrData && (
        <div className="card flex flex-col items-center gap-3 p-6">
          <img src={qrData.qrCode} alt="QR Code" className="w-48 h-48" />
          <p className="text-sm text-gray-600">Fahrzeug-QR: {fz.intern_nummer}</p>
          <button onClick={() => setShowQR(false)} className="btn-secondary text-xs">Schließen</button>
        </div>
      )}

      {/* Status Timeline */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Fahrzeugstatus</h3>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {STATUS_SEQUENCE.map((s, idx) => {
            const isPast = idx < currentStatusIdx;
            const isCurrent = idx === currentStatusIdx;
            const isFuture = idx > currentStatusIdx;
            return (
              <React.Fragment key={s.key}>
                <div className="flex flex-col items-center gap-1 min-w-[80px]">
                  <button
                    onClick={() => {
                      if (!hasPermission('perm_fahrzeug_bearbeiten')) return;
                      if (!isFuture) return;
                      statusMut.mutate({ status: s.key });
                    }}
                    className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-colors border-2',
                      isPast ? 'bg-primary-700 border-primary-700 text-white' : '',
                      isCurrent ? 'bg-primary-700 border-primary-700 text-white ring-4 ring-primary-200' : '',
                      isFuture ? 'bg-white border-gray-300 text-gray-400 hover:border-primary-400' : '',
                    )}
                    title={isFuture && hasPermission('perm_fahrzeug_bearbeiten') ? `Zu "${s.label}" wechseln` : ''}
                  >
                    {isPast ? <CheckCircleIcon className="w-5 h-5" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                  </button>
                  <span className={clsx('text-xs text-center', isCurrent ? 'font-semibold text-primary-700' : 'text-gray-500')}>
                    {s.label}
                  </span>
                </div>
                {idx < STATUS_SEQUENCE.length - 1 && (
                  <div className={clsx('flex-1 h-0.5 mb-5 min-w-[20px]', idx < currentStatusIdx ? 'bg-primary-700' : 'bg-gray-200')} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
        <Tab.List className="flex gap-1 bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          {tabs.map(t => (
            <Tab
              key={t.label}
              className={({ selected }) => clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center',
                selected ? 'bg-primary-700 text-white' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {t.icon && <t.icon className="w-4 h-4" />}
              {t.label}
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels>
          {/* Overview */}
          <Tab.Panel>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card">
                <h3 className="font-semibold mb-3">Fahrzeugdaten</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {[
                    ['Marke', fz.marke],
                    ['Modell', fz.modell],
                    ['Baujahr', fz.baujahr],
                    ['Erstzulassung', fz.erstzulassung ? new Date(fz.erstzulassung).toLocaleDateString('de-DE') : '—'],
                    ['Kilometer', fz.kilometer ? `${fz.kilometer.toLocaleString('de-DE')} km` : '—'],
                    ['Leistung', fz.leistung_ps ? `${fz.leistung_ps} PS / ${fz.leistung_kw} kW` : '—'],
                    ['Kraftstoff', fz.kraftstoff],
                    ['Getriebe', fz.getriebe],
                    ['Farbe', fz.farbe],
                    ['VIN', fz.vin || '—'],
                    ['Kennzeichen', fz.kennzeichen || '—'],
                    ['Standort', fz.standort_name || '—'],
                    ['Stellplatz', fz.stellplatz_bezeichnung || '—'],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-medium">{value || '—'}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>

              <div className="card">
                <h3 className="font-semibold mb-3">Finanzdaten</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {[
                    ['Einkaufsdatum', fz.einkaufsdatum ? new Date(fz.einkaufsdatum).toLocaleDateString('de-DE') : '—'],
                    ['Standzeit', fz.standzeit_tage != null ? `${fz.standzeit_tage} Tage` : '—'],
                    ['Einkaufspreis', fz.einkaufspreis != null ? `${fz.einkaufspreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €` : 'keine Berechtigung'],
                    ['Aufbereitung', fz.aufbereitungskosten ? `${fz.aufbereitungskosten} €` : '0 €'],
                    ['Ziel-VK', fz.zielverkaufspreis ? `${fz.zielverkaufspreis.toLocaleString('de-DE', { minimumFractionDigits: 0 })} €` : '—'],
                    ['Verkaufspreis', fz.verkaufspreis ? `${fz.verkaufspreis.toLocaleString('de-DE', { minimumFractionDigits: 0 })} €` : '—'],
                    ['Verkaufsdatum', fz.verkaufsdatum ? new Date(fz.verkaufsdatum).toLocaleDateString('de-DE') : '—'],
                    ['Verkäufer', fz.verkauf_von || '—'],
                    ['Käufer', fz.kaeufer_name || '—'],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-medium">{value || '—'}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>

              {fz.notizen && (
                <div className="card lg:col-span-2">
                  <h3 className="font-semibold mb-2">Notizen</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{fz.notizen}</p>
                </div>
              )}
            </div>
          </Tab.Panel>

          {/* Photos */}
          <Tab.Panel>
            <FotoTab fahrzeug_id={id} />
          </Tab.Panel>

          {/* Damage */}
          <Tab.Panel>
            <SchadenTab fahrzeug_id={id} />
          </Tab.Panel>

          {/* Documents */}
          <Tab.Panel>
            <DokumentTab fahrzeug_id={id} />
          </Tab.Panel>

          {/* History */}
          <Tab.Panel>
            <div className="card">
              <h3 className="font-semibold mb-4">Statusverlauf</h3>
              <div className="space-y-3">
                {(history || []).map(h => (
                  <div key={h.id} className="flex gap-3 text-sm">
                    <div className="text-gray-400 min-w-[120px]">
                      {new Date(h.erstellt_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{h.nutzer_name}</span>
                      {h.status_alt && <> änderte <span className="text-gray-500">{h.status_alt}</span> →</>}
                      <span className="ml-1 font-medium text-primary-700">{h.status_neu}</span>
                      {h.notiz && <div className="text-gray-500 text-xs mt-0.5">{h.notiz}</div>}
                    </div>
                  </div>
                ))}
                {!history?.length && <div className="text-center text-gray-400 py-4">Keine Einträge</div>}
              </div>
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}

function FotoTab({ fahrzeug_id }) {
  const queryClient = useQueryClient();
  const { data: fotos } = useQuery(['fotos', fahrzeug_id], () => fotosApi.list(fahrzeug_id).then(r => r.data));
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('fotos', f));
    try {
      await fotosApi.upload(fahrzeug_id, fd);
      toast.success(`${files.length} Fotos hochgeladen`);
      queryClient.invalidateQueries(['fotos', fahrzeug_id]);
    } catch {}
    setUploading(false);
  };

  const deleteFoto = async (id) => {
    await fotosApi.remove(id);
    queryClient.invalidateQueries(['fotos', fahrzeug_id]);
    toast.success('Foto gelöscht');
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Fotos ({fotos?.length || 0})</h3>
        <label className="btn-primary cursor-pointer">
          <CameraIcon className="w-4 h-4" />
          {uploading ? 'Lädt hoch...' : 'Fotos hochladen'}
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} />
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {(fotos || []).map(foto => (
          <div key={foto.id} className="relative group aspect-video bg-gray-200 rounded-lg overflow-hidden">
            <img
              src={`/uploads/${foto.thumbnail_pfad || foto.pfad}`}
              className="w-full h-full object-cover"
              alt=""
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => fotosApi.setTitelbild(foto.id).then(() => { queryClient.invalidateQueries(['fotos', fahrzeug_id]); toast.success('Titelbild gesetzt'); })}
                className="text-white text-xs bg-white/20 px-2 py-1 rounded"
              >
                Titelbild
              </button>
              <button onClick={() => deleteFoto(foto.id)} className="text-red-300 text-xs bg-white/20 px-2 py-1 rounded">
                Löschen
              </button>
            </div>
            {foto.position === 0 && (
              <div className="absolute top-1 left-1 bg-primary-700 text-white text-xs px-1.5 py-0.5 rounded">
                Titel
              </div>
            )}
          </div>
        ))}
        {!fotos?.length && (
          <div className="col-span-full text-center text-gray-400 py-10">Keine Fotos vorhanden</div>
        )}
      </div>
    </div>
  );
}

function SchadenTab({ fahrzeug_id }) {
  const queryClient = useQueryClient();
  const { data: schaeden } = useQuery(['schaeden', fahrzeug_id], () => schaedenApi.list(fahrzeug_id).then(r => r.data));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ beschreibung: '', bereich: '', schwere: 'leicht', reparieren: false });

  const addMut = useMutation(
    () => schaedenApi.create({ ...form, fahrzeug_id }),
    {
      onSuccess: () => {
        toast.success('Schaden erfasst');
        queryClient.invalidateQueries(['schaeden', fahrzeug_id]);
        setAdding(false);
        setForm({ beschreibung: '', bereich: '', schwere: 'leicht', reparieren: false });
      },
    }
  );

  const toggleMut = useMutation(
    (id) => schaedenApi.toggleReparieren(id),
    { onSuccess: () => queryClient.invalidateQueries(['schaeden', fahrzeug_id]) }
  );

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Schadensliste ({schaeden?.length || 0})</h3>
        <button onClick={() => setAdding(v => !v)} className="btn-secondary">
          {adding ? 'Abbrechen' : '+ Schaden hinzufügen'}
        </button>
      </div>

      {adding && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bereich</label>
              <input className="input" placeholder="z.B. Vorderkotflügel links" value={form.bereich} onChange={e => setForm(f => ({ ...f, bereich: e.target.value }))} />
            </div>
            <div>
              <label className="label">Schwere</label>
              <select className="input" value={form.schwere} onChange={e => setForm(f => ({ ...f, schwere: e.target.value }))}>
                <option value="leicht">Leicht</option>
                <option value="mittel">Mittel</option>
                <option value="schwer">Schwer</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <textarea className="input resize-none" rows={3} value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="rep" checked={form.reparieren} onChange={e => setForm(f => ({ ...f, reparieren: e.target.checked }))} />
            <label htmlFor="rep" className="text-sm">Reparieren</label>
          </div>
          <button onClick={() => addMut.mutate()} className="btn-primary">Speichern</button>
        </div>
      )}

      <div className="space-y-2">
        {(schaeden || []).map(s => (
          <div key={s.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
              s.schwere === 'schwer' ? 'bg-red-500' : s.schwere === 'mittel' ? 'bg-amber-500' : 'bg-yellow-300'
            )} />
            <div className="flex-1">
              <div className="font-medium text-sm">{s.bereich}</div>
              <div className="text-sm text-gray-600">{s.beschreibung}</div>
            </div>
            <button
              onClick={() => toggleMut.mutate(s.id)}
              className={clsx('text-xs px-2 py-1 rounded font-medium transition-colors',
                s.reparieren ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
              )}
            >
              {s.reparieren ? '✓ Reparieren' : 'Belassen'}
            </button>
          </div>
        ))}
        {!schaeden?.length && <div className="text-center text-gray-400 py-6">Keine Schäden erfasst</div>}
      </div>
    </div>
  );
}

function DokumentTab({ fahrzeug_id }) {
  const queryClient = useQueryClient();
  const { data: dokumente } = useQuery(['dokumente', fahrzeug_id], () => dokumenteApi.list(fahrzeug_id).then(r => r.data));
  const { hasPermission } = useAuthStore();

  const genMut = useMutation(
    (typ) => dokumenteApi.generieren({ fahrzeug_id, typ }),
    { onSuccess: () => { toast.success('PDF erstellt'); queryClient.invalidateQueries(['dokumente', fahrzeug_id]); } }
  );

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Dokumente</h3>
        {hasPermission('perm_dokument_generieren') && (
          <div className="flex gap-2">
            <button onClick={() => genMut.mutate('expose')} className="btn-secondary text-xs">Exposé</button>
            <button onClick={() => genMut.mutate('probefahrtvertrag')} className="btn-secondary text-xs">Probefahrtvertrag</button>
          </div>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {(dokumente || []).map(d => (
          <div key={d.id} className="flex items-center gap-3 py-3">
            <DocumentTextIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium">{d.bezeichnung || d.dateiname}</div>
              <div className="text-xs text-gray-400">{d.typ} · {new Date(d.erstellt_am).toLocaleDateString('de-DE')}</div>
            </div>
            <a href={`/api/dokumente/${d.id}/download`} className="btn-secondary text-xs">Download</a>
          </div>
        ))}
        {!dokumente?.length && <div className="text-center text-gray-400 py-6">Keine Dokumente</div>}
      </div>
    </div>
  );
}
