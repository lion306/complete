import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { kundenApi } from '../utils/api';

export default function KundenPage() {
  const [suche, setSuche] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery(
    ['kunden', { suche: search, page }],
    () => kundenApi.list({ suche: search, page, limit: 25 }).then(r => r.data),
    { keepPreviousData: true }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Kundenverwaltung</h2>
          <p className="text-sm text-gray-500">{data?.total ?? 0} Kunden</p>
        </div>
        <Link to="/kunden/neu" className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Kunde anlegen
        </Link>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Name, E-Mail, Telefon..."
            value={suche}
            onChange={e => setSuche(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(suche); setPage(1); } }}
          />
        </div>
        <button onClick={() => { setSearch(suche); setPage(1); }} className="btn-secondary">Suchen</button>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Laden...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kontakt</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ort</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Herkunft</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Zuständig</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.data || []).map(k => (
                <tr key={k.id} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3">
                    <Link to={`/kunden/${k.id}`} className="font-medium hover:text-primary-700">
                      {k.vorname} {k.nachname}
                      {k.firmenname && <span className="text-gray-500 ml-1 text-xs">({k.firmenname})</span>}
                    </Link>
                    {k.plz_region_bonus && <span className="ml-2 badge-blue text-xs">Regional</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{k.email || '—'}</div>
                    <div className="text-xs text-gray-400">{k.telefon || k.mobil || ''}</div>
                  </td>
                  <td className="px-4 py-3">{k.plz} {k.ort}</td>
                  <td className="px-4 py-3 capitalize">{k.herkunft || '—'}</td>
                  <td className="px-4 py-3">{k.zustaendiger || '—'}</td>
                </tr>
              ))}
              {!data?.data?.length && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Keine Kunden</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
