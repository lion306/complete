import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { leadsApi } from '../utils/api';
import clsx from 'clsx';

const STATUSES = [
  { value: '', label: 'Alle' },
  { value: 'neu', label: 'Neu' },
  { value: 'zugewiesen', label: 'Zugewiesen' },
  { value: 'kontaktiert', label: 'Kontaktiert' },
  { value: 'nachfassen', label: 'Nachfassen' },
  { value: 'angebot', label: 'Angebot' },
  { value: 'probefahrt', label: 'Probefahrt' },
  { value: 'gewonnen', label: 'Gewonnen' },
  { value: 'verloren', label: 'Verloren' },
];

const STATUS_COLORS = {
  neu: 'badge-blue', zugewiesen: 'badge-yellow', kontaktiert: 'badge bg-orange-100 text-orange-800',
  nachfassen: 'badge bg-purple-100 text-purple-800', angebot: 'badge bg-indigo-100 text-indigo-800',
  probefahrt: 'badge bg-pink-100 text-pink-800', gewonnen: 'badge-green', verloren: 'badge-red',
};

const HERKUNFT_COLORS = {
  mobilede: 'badge-blue', autoscout: 'badge bg-orange-100 text-orange-800',
  email: 'badge-gray', web: 'badge-green', telefon: 'badge-yellow', direkt: 'badge-gray',
};

export default function LeadsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ status: '', page: 1, limit: 25 });

  const { data, isLoading } = useQuery(
    ['leads', filters],
    () => leadsApi.list(filters).then(r => r.data),
    { keepPreviousData: true }
  );

  const importMut = useMutation(
    () => leadsApi.importEmail(),
    {
      onSuccess: (res) => {
        toast.success(`${res.data.lead_ids?.length || 0} neue Leads importiert`);
        queryClient.invalidateQueries('leads');
      },
    }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Lead-Management</h2>
          <p className="text-sm text-gray-500">{data?.total ?? 0} Leads gesamt</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => importMut.mutate()}
            disabled={importMut.isLoading}
            className="btn-secondary"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {importMut.isLoading ? 'Importiere...' : 'Email-Import'}
          </button>
          <button onClick={() => navigate('/leads/neu')} className="btn-primary">
            <PlusIcon className="w-4 h-4" />
            Lead anlegen
          </button>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-1 flex-wrap">
        {STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => setFilters(f => ({ ...f, status: s.value, page: 1 }))}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              filters.status === s.value
                ? 'bg-primary-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Lead Cards */}
      {isLoading ? (
        <div className="p-8 text-center text-gray-400">Laden...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {(data?.data || []).map(lead => (
            <Link
              key={lead.id}
              to={`/leads/${lead.id}`}
              className="card hover:shadow-md transition-shadow cursor-pointer p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-semibold">
                    {lead.vorname} {lead.nachname}
                  </div>
                  <div className="text-xs text-gray-500">{lead.email}</div>
                </div>
                <span className={STATUS_COLORS[lead.status] || 'badge-gray'}>
                  {STATUSES.find(s => s.value === lead.status)?.label || lead.status}
                </span>
              </div>

              {(lead.intern_nummer || lead.fahrzeug_interesse_text) && (
                <div className="text-sm text-gray-700 mb-2">
                  {lead.intern_nummer
                    ? `${lead.intern_nummer} – ${lead.marke} ${lead.modell}`
                    : lead.fahrzeug_interesse_text?.slice(0, 60)
                  }
                </div>
              )}

              <div className="flex items-center justify-between mt-2">
                <span className={HERKUNFT_COLORS[lead.herkunft] || 'badge-gray'}>
                  {lead.herkunft || 'Unbekannt'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(lead.erstellt_am).toLocaleDateString('de-DE')}
                </span>
              </div>

              {lead.zugewiesen_an_name && (
                <div className="text-xs text-gray-500 mt-1">
                  Zugewiesen: {lead.zugewiesen_an_name}
                </div>
              )}
            </Link>
          ))}
          {!data?.data?.length && (
            <div className="col-span-full text-center text-gray-400 py-10">Keine Leads gefunden</div>
          )}
        </div>
      )}

      {/* Pagination */}
      {data?.total > filters.limit && (
        <div className="flex justify-center gap-2">
          <button
            disabled={filters.page <= 1}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
            className="btn-secondary"
          >
            Zurück
          </button>
          <span className="py-2 px-3 text-sm text-gray-600">Seite {filters.page}</span>
          <button
            disabled={filters.page * filters.limit >= (data?.total || 0)}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            className="btn-secondary"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
