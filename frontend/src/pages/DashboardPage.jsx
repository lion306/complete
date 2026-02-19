import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import {
  TruckIcon, UserGroupIcon, EnvelopeIcon, CurrencyEuroIcon,
  ArrowTrendingUpIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import { fahrzeugeApi, leadsApi, provisionenApi } from '../utils/api';
import useAuthStore from '../store/authStore';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

const STATUS_COLORS = {
  eingang:       '#3b82f6',
  inspektion:    '#8b5cf6',
  werkstatt:     '#f59e0b',
  aufbereitung:  '#f97316',
  bereit:        '#10b981',
  aktiv_angebot: '#14b8a6',
  verkauft:      '#6b7280',
  archiv:        '#9ca3af',
};

const STATUS_LABELS = {
  eingang:       'Eingang',
  inspektion:    'Inspektion',
  werkstatt:     'Werkstatt',
  aufbereitung:  'Aufbereitung',
  bereit:        'Bereit',
  aktiv_angebot: 'Im Angebot',
  verkauft:      'Verkauft',
  archiv:        'Archiv',
};

function StatCard({ icon: Icon, label, value, sub, color = 'blue', to }) {
  const content = (
    <div className="card flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className={`p-3 rounded-xl bg-${color}-100`}>
        <Icon className={`w-6 h-6 text-${color}-600`} />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-600">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuthStore();

  const { data: statsData } = useQuery('fahrzeug-stats', () => fahrzeugeApi.stats().then(r => r.data));
  const { data: leadsData } = useQuery('leads-dashboard', () => leadsApi.list({ limit: 5 }).then(r => r.data));
  const { data: provData } = useQuery(
    'prov-dashboard',
    () => provisionenApi.dashboard({}).then(r => r.data),
    { enabled: hasPermission('perm_provision_sehen') }
  );
  const { data: fahrzeugeData } = useQuery(
    'fahrzeuge-recent',
    () => fahrzeugeApi.list({ limit: 5, sort: 'erstellt_am', dir: 'desc' }).then(r => r.data)
  );

  const statusStats = statsData?.nach_status || [];
  const totalFahrzeuge = statusStats.reduce((a, s) => a + parseInt(s.anzahl), 0);
  const offeneLeads = leadsData?.data?.filter(l => !['gewonnen', 'verloren'].includes(l.status)).length ?? 0;

  const pieData = statusStats.map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: parseInt(s.anzahl),
    fill: STATUS_COLORS[s.status] || '#6b7280',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Guten {getGreeting()}, {user?.vorname}!
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Hier ist Ihre aktuelle Übersicht.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TruckIcon} label="Fahrzeuge gesamt" value={totalFahrzeuge}
          color="blue" to="/fahrzeuge"
          sub={`${statusStats.find(s => s.status === 'aktiv_angebot')?.anzahl || 0} im Angebot`}
        />
        <StatCard
          icon={EnvelopeIcon} label="Offene Leads" value={leadsData?.total || 0}
          color="amber" to="/leads"
        />
        <StatCard
          icon={UserGroupIcon} label="Verkaufte heute" color="green"
          value={statusStats.find(s => s.status === 'verkauft')?.anzahl || 0}
          to="/fahrzeuge?status=verkauft"
        />
        {hasPermission('perm_provision_sehen') && (
          <StatCard
            icon={CurrencyEuroIcon} label="Ø Provision" color="purple"
            value={provData?.gesamt_provision
              ? `${provData.gesamt_provision.toLocaleString('de-DE', { minimumFractionDigits: 0 })} €`
              : '—'}
            to="/provisionen"
            sub="aktueller Monat"
          />
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fahrzeug Status Pie */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Fahrzeuge nach Status</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-400">Keine Daten</div>
          )}
        </div>

        {/* Standort Bar Chart */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Fahrzeuge nach Standort</h3>
          {(statsData?.nach_standort || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statsData.nach_standort} margin={{ left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="anzahl" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-400">Keine Daten</div>
          )}
        </div>
      </div>

      {/* Recent vehicles + leads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Vehicles */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Zuletzt hinzugefügt</h3>
            <Link to="/fahrzeuge" className="text-sm text-primary-700 hover:underline">Alle ansehen</Link>
          </div>
          <div className="space-y-3">
            {(fahrzeugeData?.data || []).map(fz => (
              <Link
                key={fz.id}
                to={`/fahrzeuge/${fz.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                  {fz.titelbild
                    ? <img src={`/uploads/${fz.titelbild}`} className="w-full h-full object-cover" alt="" />
                    : <TruckIcon className="w-5 h-5 text-gray-400 m-2.5" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{fz.marke} {fz.modell}</div>
                  <div className="text-xs text-gray-500">{fz.intern_nummer} · {fz.standort_name}</div>
                </div>
                <StatusBadge status={fz.status} />
              </Link>
            ))}
            {!fahrzeugeData?.data?.length && (
              <div className="text-center text-gray-400 py-6 text-sm">Keine Fahrzeuge</div>
            )}
          </div>
        </div>

        {/* Recent Leads */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Neue Leads</h3>
            <Link to="/leads" className="text-sm text-primary-700 hover:underline">Alle ansehen</Link>
          </div>
          <div className="space-y-3">
            {(leadsData?.data || []).map(lead => (
              <Link
                key={lead.id}
                to={`/leads/${lead.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 bg-primary-100 rounded-full flex-shrink-0 flex items-center justify-center">
                  <span className="text-primary-700 text-sm font-medium">
                    {lead.vorname?.[0]}{lead.nachname?.[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{lead.vorname} {lead.nachname}</div>
                  <div className="text-xs text-gray-500 capitalize">{lead.herkunft} · {lead.intern_nummer}</div>
                </div>
                <LeadStatusBadge status={lead.status} />
              </Link>
            ))}
            {!leadsData?.data?.length && (
              <div className="text-center text-gray-400 py-6 text-sm">Keine Leads</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morgen';
  if (h < 17) return 'Tag';
  return 'Abend';
}

function StatusBadge({ status }) {
  const labels = {
    eingang: 'Eingang', werkstatt: 'Werkstatt', aufbereitung: 'Aufbereitung',
    bereit: 'Bereit', aktiv_angebot: 'Im Angebot', verkauft: 'Verkauft',
  };
  const colors = {
    eingang: 'badge-blue', werkstatt: 'badge-yellow', aufbereitung: 'badge bg-orange-100 text-orange-800',
    bereit: 'badge-green', aktiv_angebot: 'badge bg-teal-100 text-teal-800', verkauft: 'badge-gray',
  };
  return <span className={colors[status] || 'badge-gray'}>{labels[status] || status}</span>;
}

function LeadStatusBadge({ status }) {
  const labels = { neu: 'Neu', zugewiesen: 'Zugewiesen', kontaktiert: 'Kontaktiert', gewonnen: 'Gewonnen', verloren: 'Verloren' };
  const colors = { neu: 'badge-blue', zugewiesen: 'badge-yellow', kontaktiert: 'badge bg-orange-100 text-orange-800', gewonnen: 'badge-green', verloren: 'badge-red' };
  return <span className={colors[status] || 'badge-gray'}>{labels[status] || status}</span>;
}
