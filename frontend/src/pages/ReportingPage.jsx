import React, { useState } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { reportingApi } from '../utils/api';
import useAuthStore from '../store/authStore';

const AMPEL_COLORS = {
  gruen:   { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Frisch (< 30 Tage)' },
  gelb:    { bg: 'bg-yellow-100',  text: 'text-yellow-700',  dot: 'bg-yellow-400',  label: 'Normal (30–60 Tage)' },
  orange:  { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500',  label: 'Aufmerksamkeit (60–90 Tage)' },
  rot:     { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Kritisch (> 90 Tage)' },
};

const PIE_COLORS = ['#10b981', '#eab308', '#f97316', '#ef4444'];

function AmpelBadge({ ampel }) {
  const cfg = AMPEL_COLORS[ampel] || AMPEL_COLORS.gruen;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'from-blue-500 to-blue-600',
    green:  'from-emerald-500 to-emerald-600',
    amber:  'from-amber-500 to-amber-600',
    red:    'from-red-500 to-red-600',
  };
  return (
    <div className={`rounded-xl p-5 text-white bg-gradient-to-br ${colors[color]}`}>
      <div className="text-3xl font-bold">{value ?? '–'}</div>
      <div className="mt-1 text-sm font-medium opacity-90">{label}</div>
      {sub && <div className="mt-1 text-xs opacity-75">{sub}</div>}
    </div>
  );
}

// ── Standzeiten Tab ───────────────────────────────────────────────────────────
function StandzeitenTab({ standort_id }) {
  const { data, isLoading } = useQuery(
    ['reporting-standzeiten', standort_id],
    () => reportingApi.standzeiten({ standort_id }).then(r => r.data),
    { refetchInterval: 120000 }
  );
  const { data: ampelData, isLoading: ampelLoading } = useQuery(
    ['reporting-ampel', standort_id],
    () => reportingApi.standzeitenAmpel({ standort_id }).then(r => r.data),
    { refetchInterval: 120000 }
  );

  if (isLoading || ampelLoading) return <div className="p-8 text-center text-gray-500">Lade Daten…</div>;

  const overview = data?.overview || {};
  const ampelDist = data?.ampel_distribution || {};
  const pieData = [
    { name: 'Frisch',       value: parseInt(ampelDist.gruen  || 0) },
    { name: 'Normal',       value: parseInt(ampelDist.gelb   || 0) },
    { name: 'Aufmerksamkeit', value: parseInt(ampelDist.orange || 0) },
    { name: 'Kritisch',     value: parseInt(ampelDist.rot    || 0) },
  ].filter(d => d.value > 0);

  const vehicles = ampelData?.vehicles || [];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Ø Standtage gesamt" value={Math.round(overview.avg_standtage || 0)} color="blue" />
        <StatCard label="Fahrzeuge aktiv" value={overview.total_fahrzeuge || 0} color="green" />
        <StatCard label="Frisch (< 30d)" value={ampelDist.gruen || 0} color="green" />
        <StatCard label="Kritisch (> 90d)" value={ampelDist.rot || 0} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ampel Pie */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Standzeit-Verteilung</h3>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Keine Daten</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Ampel Legend */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Ampel-Zonen</h3>
          <div className="space-y-3">
            {Object.entries(AMPEL_COLORS).map(([key, cfg]) => (
              <div key={key} className={`flex items-center justify-between px-4 py-3 rounded-lg ${cfg.bg}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                  <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
                </div>
                <span className={`text-2xl font-bold ${cfg.text}`}>{ampelDist[key] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vehicle table */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Fahrzeug-Standzeiten</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 font-medium">Fahrzeug</th>
                <th className="pb-2 font-medium">Intern-Nr.</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Standtage</th>
                <th className="pb-2 font-medium">Ampel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vehicles.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">Keine Fahrzeuge</td></tr>
              ) : vehicles.map(v => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-900">{v.marke} {v.modell}</td>
                  <td className="py-2.5 text-gray-500">{v.intern_nummer}</td>
                  <td className="py-2.5 text-gray-600 capitalize">{(v.status || '').replace(/_/g, ' ')}</td>
                  <td className="py-2.5 text-right font-mono font-semibold">{v.standtage}</td>
                  <td className="py-2.5"><AmpelBadge ampel={v.ampel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Kanban Analyse Tab ────────────────────────────────────────────────────────
function KanbanAnalyseTab({ standort_id }) {
  const { data, isLoading } = useQuery(
    ['reporting-kanban', standort_id],
    () => reportingApi.kanbanAnalyse({ standort_id }).then(r => r.data),
    { refetchInterval: 120000 }
  );

  if (isLoading) return <div className="p-8 text-center text-gray-500">Lade Daten…</div>;

  const lanes = data?.lane_analysis || [];
  const movements = data?.movements_per_day || [];
  const bottleneck = lanes.reduce((a, b) =>
    (parseFloat(a.avg_dauer_std) || 0) > (parseFloat(b.avg_dauer_std) || 0) ? a : b, {});

  return (
    <div className="space-y-6">
      {/* Bottleneck card */}
      {bottleneck?.lane_name && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-orange-200 rounded-full flex items-center justify-center text-orange-700 font-bold flex-shrink-0">!</div>
          <div>
            <div className="font-semibold text-orange-800">Engpass erkannt</div>
            <div className="text-sm text-orange-700 mt-0.5">
              <strong>{bottleneck.lane_name}</strong> hat die längste Ø Verweildauer von {Math.round(parseFloat(bottleneck.avg_dauer_std) || 0)} Stunden ({Math.round((parseFloat(bottleneck.avg_dauer_std) || 0) / 24)} Tage).
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Avg hours per lane */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Ø Verweildauer je Lane (Stunden)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={lanes} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v}h`} />
              <YAxis type="category" dataKey="lane_name" width={130} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => [`${Math.round(v)}h`, 'Ø Dauer']} />
              <Bar dataKey="avg_dauer_std" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Movements per day */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Bewegungen pro Tag (letzte 30 Tage)</h3>
          {movements.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Keine Bewegungen erfasst</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={movements}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="tag" tickFormatter={v => v?.slice(5)} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={v => `Datum: ${v}`} formatter={v => [v, 'Bewegungen']} />
                <Bar dataKey="anzahl" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Lane table */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Lane-Übersicht</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 font-medium">Lane</th>
                <th className="pb-2 font-medium text-right">Fahrzeuge</th>
                <th className="pb-2 font-medium text-right">Ø Stunden</th>
                <th className="pb-2 font-medium text-right">Ø Tage</th>
                <th className="pb-2 font-medium text-right">Bewegungen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lanes.map((l, i) => (
                <tr key={i} className={`hover:bg-gray-50 ${l.lane_name === bottleneck?.lane_name ? 'bg-orange-50' : ''}`}>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: l.farbe || '#94a3b8' }} />
                      <span className="font-medium text-gray-900">{l.lane_name}</span>
                      {l.lane_name === bottleneck?.lane_name && <span className="text-xs text-orange-600 font-medium">Engpass</span>}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono">{l.fahrzeuge_aktuell || 0}</td>
                  <td className="py-2.5 text-right font-mono">{Math.round(parseFloat(l.avg_dauer_std) || 0)}</td>
                  <td className="py-2.5 text-right font-mono">{Math.round((parseFloat(l.avg_dauer_std) || 0) / 24)}</td>
                  <td className="py-2.5 text-right font-mono">{l.total_bewegungen || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Kosten Tab ────────────────────────────────────────────────────────────────
function KostenTab({ standort_id }) {
  const { hasPermission } = useAuthStore();
  const { data, isLoading } = useQuery(
    ['reporting-kosten', standort_id],
    () => reportingApi.kosten({ standort_id }).then(r => r.data),
    { enabled: hasPermission('perm_finanzen_sehen') }
  );

  if (!hasPermission('perm_finanzen_sehen')) {
    return (
      <div className="p-12 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <div className="text-gray-600">Keine Berechtigung für Finanzdaten.</div>
      </div>
    );
  }
  if (isLoading) return <div className="p-8 text-center text-gray-500">Lade Daten…</div>;

  const totals = data?.totals || {};
  const byStatus = data?.by_status || [];
  const formatEur = (v) => `${parseFloat(v || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Gesamte Einkaufskosten" value={formatEur(totals.einkaufspreis_sum)} color="blue" />
        <StatCard label="Aufbereitungskosten" value={formatEur(totals.aufbereitungskosten_sum)} color="amber" />
        <StatCard label="Reparaturkosten" value={formatEur(totals.reparaturkosten_sum)} color="red" />
        <StatCard label="Ø Gesamtkosten/Fzg." value={formatEur(totals.avg_gesamtkosten)} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Kosten nach Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byStatus}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="status" tick={{ fontSize: 11 }} tickFormatter={v => v?.replace(/_/g, ' ')} />
              <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => [formatEur(v)]} />
              <Bar dataKey="einkaufspreis_sum" name="Einkauf" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="aufbereitungskosten_sum" name="Aufbereitung" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="reparaturkosten_sum" name="Reparatur" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Kostenaufstellung</h3>
          <div className="space-y-3">
            {[
              { label: 'Einkaufspreise gesamt', value: totals.einkaufspreis_sum, color: 'bg-indigo-500' },
              { label: 'Aufbereitungskosten', value: totals.aufbereitungskosten_sum, color: 'bg-amber-500' },
              { label: 'Reparaturkosten', value: totals.reparaturkosten_sum, color: 'bg-red-500' },
              { label: 'Zielverkaufspreise gesamt', value: totals.zielverkaufspreis_sum, color: 'bg-emerald-500' },
            ].map((item, i) => {
              const total = parseFloat(totals.zielverkaufspreis_sum || 1);
              const pct = Math.round((parseFloat(item.value || 0) / total) * 100);
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-semibold">{formatEur(item.value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Schaden-Entscheidungen Tab ────────────────────────────────────────────────
function SchadenEntscheidungenTab({ standort_id }) {
  const { data, isLoading } = useQuery(
    ['reporting-schaden', standort_id],
    () => reportingApi.schadenEntscheidungen({ standort_id }).then(r => r.data),
    { refetchInterval: 120000 }
  );

  if (isLoading) return <div className="p-8 text-center text-gray-500">Lade Daten…</div>;

  const stats = data?.stats || {};
  const byVehicle = data?.by_vehicle || [];
  const formatEur = (v) => `${parseFloat(v || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

  const pieData = [
    { name: 'Reparieren',    value: parseInt(stats.reparieren    || 0), color: '#ef4444' },
    { name: 'Ignorieren',    value: parseInt(stats.ignorieren    || 0), color: '#94a3b8' },
    { name: 'Kd.-Abzug',    value: parseInt(stats.kundenabzug   || 0), color: '#f59e0b' },
    { name: 'Ausstehend',   value: parseInt(stats.ausstehend    || 0), color: '#d1d5db' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Positionen gesamt" value={stats.total || 0} color="blue" />
        <StatCard label="Zu reparieren" value={stats.reparieren || 0} color="red" />
        <StatCard label="Kunden-Abzüge" value={formatEur(stats.kundenabzug_sum)} color="amber" sub={`${stats.kundenabzug || 0} Positionen`} />
        <StatCard label="Ausstehend" value={stats.ausstehend || 0} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Entscheidungs-Verteilung</h3>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Keine Daten</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Zusammenfassung</h3>
          <div className="space-y-2">
            {[
              { label: 'Ausstehende Entscheidungen', value: stats.ausstehend || 0, color: 'text-gray-600' },
              { label: 'Zu reparierende Positionen', value: stats.reparieren || 0, color: 'text-red-600' },
              { label: 'Ignorierte Positionen', value: stats.ignorieren || 0, color: 'text-gray-500' },
              { label: 'Kundenabzug-Positionen', value: stats.kundenabzug || 0, color: 'text-amber-600' },
              { label: 'Gesamter Kundenabzug', value: formatEur(stats.kundenabzug_sum), color: 'text-amber-700' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">{row.label}</span>
                <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-vehicle breakdown */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Fahrzeug-Details</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 font-medium">Fahrzeug</th>
                <th className="pb-2 font-medium text-right">Gesamt</th>
                <th className="pb-2 font-medium text-right">Ausstehend</th>
                <th className="pb-2 font-medium text-right">Reparieren</th>
                <th className="pb-2 font-medium text-right">Ignorieren</th>
                <th className="pb-2 font-medium text-right">Kd.-Abzug</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byVehicle.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">Keine Gutachten vorhanden</td></tr>
              ) : byVehicle.map((v, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-2.5">
                    <span className="font-medium text-gray-900">{v.marke} {v.modell}</span>
                    <span className="ml-2 text-gray-400 text-xs">{v.intern_nummer}</span>
                  </td>
                  <td className="py-2.5 text-right font-mono">{v.total}</td>
                  <td className="py-2.5 text-right font-mono text-gray-500">{v.ausstehend}</td>
                  <td className="py-2.5 text-right font-mono text-red-600 font-medium">{v.reparieren}</td>
                  <td className="py-2.5 text-right font-mono text-gray-400">{v.ignorieren}</td>
                  <td className="py-2.5 text-right font-mono text-amber-600 font-medium">{formatEur(v.kundenabzug_sum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'standzeiten', label: 'Standzeiten' },
  { id: 'kanban',      label: 'Kanban-Analyse' },
  { id: 'kosten',      label: 'Kosten' },
  { id: 'schaden',     label: 'Schaden-Entscheidungen' },
];

export default function ReportingPage() {
  const [activeTab, setActiveTab] = useState('standzeiten');
  const { user } = useAuthStore();
  const { data: standorteData } = useQuery('standorte', () =>
    import('../utils/api').then(m => m.standorteApi.list()).then(r => r.data)
  );
  const [standortId, setStandortId] = useState(user?.standort_id || '');

  const standorte = standorteData?.standorte || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reporting</h1>
          <p className="text-sm text-gray-500 mt-0.5">Standzeiten, Kosten und Workflow-Analysen</p>
        </div>
        {user?.sichtbarkeit_alle_standorte && standorte.length > 1 && (
          <select
            value={standortId}
            onChange={e => setStandortId(e.target.value)}
            className="input w-auto"
          >
            <option value="">Alle Standorte</option>
            {standorte.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'standzeiten' && <StandzeitenTab standort_id={standortId} />}
      {activeTab === 'kanban'      && <KanbanAnalyseTab standort_id={standortId} />}
      {activeTab === 'kosten'      && <KostenTab standort_id={standortId} />}
      {activeTab === 'schaden'     && <SchadenEntscheidungenTab standort_id={standortId} />}
    </div>
  );
}
