import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon, FunnelIcon, MagnifyingGlassIcon, TruckIcon } from '@heroicons/react/24/outline';
import { fahrzeugeApi } from '../utils/api';
import useAuthStore from '../store/authStore';
import clsx from 'clsx';

const STATUSES = [
  { value: '', label: 'Alle' },
  { value: 'eingang', label: 'Eingang' },
  { value: 'inspektion', label: 'Inspektion' },
  { value: 'werkstatt', label: 'Werkstatt' },
  { value: 'aufbereitung', label: 'Aufbereitung' },
  { value: 'bereit', label: 'Bereit' },
  { value: 'aktiv_angebot', label: 'Im Angebot' },
  { value: 'verkauft', label: 'Verkauft' },
];

const STATUS_COLORS = {
  eingang: 'badge-blue', inspektion: 'badge-purple', werkstatt: 'badge-yellow',
  aufbereitung: 'badge bg-orange-100 text-orange-800', bereit: 'badge-green',
  aktiv_angebot: 'badge bg-teal-100 text-teal-800', verkauft: 'badge-gray', archiv: 'badge-gray',
};

export default function FahrzeugeListPage() {
  const { hasPermission } = useAuthStore();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({ status: '', suche: '', page: 1 });
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery(
    ['fahrzeuge', filters],
    () => fahrzeugeApi.list(filters).then(r => r.data),
    { keepPreviousData: true }
  );

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters(f => ({ ...f, suche: search, page: 1 }));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Fahrzeugverwaltung</h2>
          <p className="text-sm text-gray-500">{data?.total ?? 0} Fahrzeuge</p>
        </div>
        {hasPermission('perm_fahrzeug_anlegen') && (
          <Link to="/fahrzeuge/neu" className="btn-primary">
            <PlusIcon className="w-4 h-4" />
            Fahrzeug anlegen
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-48">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Marke, Modell, VIN, Kennzeichen..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-secondary">Suchen</button>
          </form>

          {/* Status tabs */}
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
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Laden...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Fahrzeug</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">VIN / Nr.</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">km / PS</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Standort</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Standzeit</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Preis</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.data || []).map(fz => (
                    <tr
                      key={fz.id}
                      onClick={() => navigate(`/fahrzeuge/${fz.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-8 bg-gray-200 rounded flex-shrink-0 overflow-hidden">
                            {fz.titelbild
                              ? <img src={`/uploads/${fz.titelbild}`} className="w-full h-full object-cover" alt="" />
                              : <TruckIcon className="w-4 h-4 text-gray-400 m-2" />
                            }
                          </div>
                          <div>
                            <div className="font-medium">{fz.marke} {fz.modell}</div>
                            <div className="text-gray-500 text-xs">{fz.baujahr} · {fz.farbe}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="font-mono text-xs">{fz.vin || '—'}</div>
                        <div className="text-xs text-gray-400">{fz.intern_nummer}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{fz.kilometer?.toLocaleString('de-DE')} km</div>
                        <div className="text-xs text-gray-400">{fz.leistung_ps} PS</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{fz.standort_name || '—'}</div>
                        {fz.stellplatz && <div className="text-xs text-gray-400">Pl. {fz.stellplatz}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {fz.standzeit_tage != null ? (
                          <span className={clsx('font-medium', fz.standzeit_tage > 80 ? 'text-red-600' : fz.standzeit_tage > 60 ? 'text-amber-600' : 'text-green-600')}>
                            {fz.standzeit_tage} Tage
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {fz.zielverkaufspreis
                          ? `${fz.zielverkaufspreis.toLocaleString('de-DE', { minimumFractionDigits: 0 })} €`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={STATUS_COLORS[fz.status] || 'badge-gray'}>
                          {STATUSES.find(s => s.value === fz.status)?.label || fz.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!data?.data?.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                        Keine Fahrzeuge gefunden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data?.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <span className="text-sm text-gray-500">
                  Seite {data.page} von {data.pages} ({data.total} Einträge)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={filters.page <= 1}
                    onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                    className="btn-secondary text-xs"
                  >
                    Zurück
                  </button>
                  <button
                    disabled={filters.page >= data.pages}
                    onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                    className="btn-secondary text-xs"
                  >
                    Weiter
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
