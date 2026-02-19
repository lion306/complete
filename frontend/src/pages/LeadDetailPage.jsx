import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline';
import { leadsApi, nutzerApi } from '../utils/api';
import clsx from 'clsx';

const STATUS_OPTIONS = [
  'neu', 'zugewiesen', 'kontaktiert', 'nachfassen', 'angebot', 'probefahrt', 'gewonnen', 'verloren'
];

const AKTIVITAET_TYPEN = [
  { value: 'notiz', label: 'Notiz' },
  { value: 'anruf', label: 'Anruf' },
  { value: 'email', label: 'E-Mail' },
  { value: 'probefahrt', label: 'Probefahrt' },
  { value: 'angebot', label: 'Angebot' },
];

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [aktBeschreibung, setAktBeschreibung] = useState('');
  const [aktTyp, setAktTyp] = useState('notiz');

  const { data: lead, isLoading } = useQuery(
    ['lead', id],
    () => leadsApi.get(id).then(r => r.data)
  );

  const { data: nutzer } = useQuery('nutzer', () => nutzerApi.list().then(r => r.data));

  const updateMut = useMutation(
    (data) => leadsApi.update(id, data),
    { onSuccess: () => { toast.success('Lead aktualisiert'); queryClient.invalidateQueries(['lead', id]); } }
  );

  const aktMut = useMutation(
    () => leadsApi.addActivity(id, { typ: aktTyp, beschreibung: aktBeschreibung }),
    {
      onSuccess: () => {
        toast.success('Aktivität hinzugefügt');
        setAktBeschreibung('');
        queryClient.invalidateQueries(['lead', id]);
      },
    }
  );

  const convertMut = useMutation(
    () => leadsApi.convert(id),
    {
      onSuccess: (res) => {
        toast.success('Lead zu Kunde konvertiert');
        navigate(`/kunden/${res.data.kunden_id}`);
      },
    }
  );

  if (isLoading) return <div className="p-8 text-center text-gray-400">Laden...</div>;
  if (!lead) return <div className="p-8 text-center text-red-500">Lead nicht gefunden</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{lead.vorname} {lead.nachname}</h2>
          <p className="text-sm text-gray-500 capitalize">{lead.herkunft} · {new Date(lead.erstellt_am).toLocaleDateString('de-DE')}</p>
        </div>
        {lead.status !== 'gewonnen' && (
          <button onClick={() => convertMut.mutate()} className="btn-success">
            <CheckIcon className="w-4 h-4" />
            Zu Kunde konvertieren
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lead Info */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-3">Kontaktdaten</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Name', `${lead.vorname || ''} ${lead.nachname || ''}`.trim()],
                ['E-Mail', lead.email || '—'],
                ['Telefon', lead.telefon || '—'],
                ['Herkunft', lead.herkunft || '—'],
                ['Fahrzeug', lead.intern_nummer ? `${lead.intern_nummer} – ${lead.marke} ${lead.modell}` : '—'],
                ['Zugewiesen an', lead.zugewiesen_an_name || '—'],
              ].map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </React.Fragment>
              ))}
            </dl>

            {lead.notizen && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Nachricht des Interessenten:</div>
                <p className="text-sm">{lead.notizen}</p>
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="card">
            <h3 className="font-semibold mb-3">Aktivitäten</h3>

            {/* Add Activity */}
            <div className="mb-4 space-y-2">
              <div className="flex gap-2">
                {AKTIVITAET_TYPEN.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setAktTyp(t.value)}
                    className={clsx(
                      'text-xs px-2 py-1 rounded transition-colors',
                      aktTyp === t.value ? 'bg-primary-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Aktivität beschreiben..."
                value={aktBeschreibung}
                onChange={e => setAktBeschreibung(e.target.value)}
              />
              <button
                onClick={() => aktMut.mutate()}
                disabled={!aktBeschreibung.trim()}
                className="btn-primary"
              >
                Hinzufügen
              </button>
            </div>

            {/* Activity list */}
            <div className="space-y-3">
              {(lead.aktivitaeten || []).map(a => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div className="text-gray-400 text-xs min-w-[90px]">
                    {new Date(a.erstellt_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium capitalize">[{a.typ}]</span>{' '}
                    <span className="text-gray-600">{a.beschreibung}</span>
                    {a.nutzer_name && <div className="text-xs text-gray-400">{a.nutzer_name}</div>}
                  </div>
                </div>
              ))}
              {!lead.aktivitaeten?.length && (
                <div className="text-center text-gray-400 py-4">Keine Aktivitäten</div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Status + Assignment */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-3">Status</h3>
            <div className="space-y-1">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => updateMut.mutate({ status: s })}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors capitalize',
                    lead.status === s
                      ? 'bg-primary-700 text-white font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Zuweisung</h3>
            <select
              className="input"
              value={lead.zugewiesen_an || ''}
              onChange={e => updateMut.mutate({ zugewiesen_an: e.target.value })}
            >
              <option value="">— kein Verkäufer —</option>
              {(nutzer || []).map(n => (
                <option key={n.id} value={n.id}>{n.vorname} {n.nachname}</option>
              ))}
            </select>
          </div>

          {lead.naechste_aktion && (
            <div className="card">
              <h3 className="font-semibold mb-1">Nächste Aktion</h3>
              <p className="text-sm text-gray-600">{new Date(lead.naechste_aktion).toLocaleDateString('de-DE')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
