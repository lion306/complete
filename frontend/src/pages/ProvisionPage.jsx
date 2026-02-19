import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { provisionenApi } from '../utils/api';
import useAuthStore from '../store/authStore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

export default function ProvisionPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ page: 1, limit: 20 });

  const { data: dashboard } = useQuery(
    'prov-dashboard',
    () => provisionenApi.dashboard({}).then(r => r.data)
  );

  const { data: provisionen, isLoading } = useQuery(
    ['provisionen', filters],
    () => provisionenApi.list(filters).then(r => r.data),
    { keepPreviousData: true }
  );

  const genMut = useMutation(
    (id) => provisionenApi.genehmigen(id),
    { onSuccess: () => { toast.success('Genehmigt'); queryClient.invalidateQueries('provisionen'); } }
  );

  const zahlMut = useMutation(
    (id) => provisionenApi.ausbezahlt(id),
    { onSuccess: () => { toast.success('Als ausbezahlt markiert'); queryClient.invalidateQueries('provisionen'); } }
  );

  // Provision Kalkulator
  const [kalkForm, setKalkForm] = useState({ bruttoertrag: 3000, standzeit_tage: 45, kunden_plz_in_region: false, finanzierung: false, rsv: false, rsv_ertrag: 0, versicherung: false, versicherung_typ: 'basis' });
  const { data: kalkResult } = useQuery(
    ['prov-kalk', kalkForm],
    () => provisionenApi.berechnen(kalkForm).then(r => r.data),
    { enabled: kalkForm.bruttoertrag > 0 }
  );

  const STATUS_COLORS = {
    offen: 'badge-yellow', genehmigt: 'badge-blue', ausbezahlt: 'badge-green', storniert: 'badge-red',
  };

  // Chart data
  const chartData = (dashboard?.rows || []).reduce((acc, r) => {
    const month = r.monat ? new Date(r.monat).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }) : '?';
    const existing = acc.find(a => a.monat === month);
    if (existing) {
      existing.provision += parseFloat(r.gesamt_provision || 0);
    } else {
      acc.push({ monat: month, provision: parseFloat(r.gesamt_provision || 0) });
    }
    return acc;
  }, []).slice(-6);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary-700">
            {dashboard?.gesamt_provision?.toLocaleString('de-DE', { minimumFractionDigits: 2 }) || '0,00'} €
          </div>
          <div className="text-sm text-gray-500 mt-1">Gesamtprovision (aktuell)</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-emerald-600">
            {(dashboard?.rows || []).reduce((a, r) => a + parseInt(r.anzahl_verkauefe || 0), 0)}
          </div>
          <div className="text-sm text-gray-500 mt-1">Verkäufe</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-amber-600">
            {(dashboard?.rows || []).reduce((a, r) => a + parseFloat(r.regional_bonus || 0), 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
          </div>
          <div className="text-sm text-gray-500 mt-1">Regionalbonus gesamt</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <div className="card">
          <h3 className="font-semibold mb-4">Provisionsverlauf (6 Monate)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ left: -10 }}>
              <XAxis dataKey="monat" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
              <Tooltip formatter={v => [`${parseFloat(v).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`, 'Provision']} />
              <Bar dataKey="provision" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Kalkulator */}
        <div className="card">
          <h3 className="font-semibold mb-4">Provisions-Kalkulator</h3>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bruttoertrag (€)</label>
                <input type="number" className="input" value={kalkForm.bruttoertrag} onChange={e => setKalkForm(f => ({ ...f, bruttoertrag: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">Standzeit (Tage)</label>
                <input type="number" className="input" value={kalkForm.standzeit_tage} onChange={e => setKalkForm(f => ({ ...f, standzeit_tage: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { key: 'kunden_plz_in_region', label: 'Regional-Bonus' },
                { key: 'finanzierung', label: 'Finanzierung (+50€)' },
                { key: 'rsv', label: 'RSV' },
                { key: 'versicherung', label: 'Versicherung' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={kalkForm[key]} onChange={e => setKalkForm(f => ({ ...f, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
            {kalkResult && (
              <div className="bg-primary-50 rounded-xl p-4 space-y-2">
                {[
                  ['Staffel', `${(kalkResult.staffel_prozent * 100).toFixed(0)}%`],
                  ['Basis-Provision', `${kalkResult.basis_provision.toFixed(2)} €`],
                  ['Regional-Bonus', `${kalkResult.regional_bonus.toFixed(2)} €`],
                  ['Finanzierung', `${kalkResult.finanzierung.toFixed(2)} €`],
                  ['RSV', `${kalkResult.rsv_provision.toFixed(2)} €`],
                  ['Versicherung', `${kalkResult.versicherung.toFixed(2)} €`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-600">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-primary-900 pt-2 border-t border-primary-200">
                  <span>GESAMT</span>
                  <span>{kalkResult.gesamt.toFixed(2)} €</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Provision List */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold">Provisionsübersicht</h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Laden...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fahrzeug</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Verkäufer</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Bruttoertrag</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Standzeit</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Provision</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  {hasPermission('perm_finanzen_sehen') && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(provisionen?.data || []).map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.marke} {p.modell}</div>
                      <div className="text-xs text-gray-400">{p.intern_nummer}</div>
                    </td>
                    <td className="px-4 py-3">{p.verkaefer}</td>
                    <td className="px-4 py-3 text-right">{parseFloat(p.bruttoertrag).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
                    <td className="px-4 py-3 text-right">{p.standzeit_tage} Tage</td>
                    <td className="px-4 py-3 text-right font-bold text-primary-700">
                      {parseFloat(p.gesamt_provision).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="px-4 py-3">
                      <span className={STATUS_COLORS[p.status] || 'badge-gray'}>{p.status}</span>
                    </td>
                    {hasPermission('perm_finanzen_sehen') && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {p.status === 'offen' && (
                            <button onClick={() => genMut.mutate(p.id)} className="btn-secondary text-xs py-1">
                              Genehmigen
                            </button>
                          )}
                          {p.status === 'genehmigt' && (
                            <button onClick={() => zahlMut.mutate(p.id)} className="btn-success text-xs py-1">
                              Ausbezahlt
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {!provisionen?.data?.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">Keine Provisionen</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
