import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { Tab } from '@headlessui/react';
import { standorteApi, exportApi, fahrzeugeApi, provisionenApi } from '../utils/api';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Administration</h2>
      <Tab.Group>
        <Tab.List className="flex gap-1 bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          {['Standorte', 'Stellplatz-Raster', 'PLZ-Regionen', 'Börsen-Export'].map(t => (
            <Tab key={t} className={({ selected }) => clsx(
              'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              selected ? 'bg-primary-700 text-white' : 'text-gray-600 hover:bg-gray-100'
            )}>{t}</Tab>
          ))}
        </Tab.List>
        <Tab.Panels>
          <Tab.Panel><StandortePanel /></Tab.Panel>
          <Tab.Panel><RasterPanel /></Tab.Panel>
          <Tab.Panel><PlzRegionenPanel /></Tab.Panel>
          <Tab.Panel><ExportPanel /></Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}

function StandortePanel() {
  const queryClient = useQueryClient();
  const { data: standorte } = useQuery('standorte', () => standorteApi.list().then(r => r.data));
  const [form, setForm] = useState({ name: '', adresse: '', plz: '', ort: '', telefon: '', email: '' });
  const createMut = useMutation(
    () => standorteApi.create(form),
    { onSuccess: () => { toast.success('Standort angelegt'); queryClient.invalidateQueries('standorte'); setForm({ name: '', adresse: '', plz: '', ort: '', telefon: '', email: '' }); } }
  );

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-semibold mb-4">Neuer Standort</h3>
        <div className="grid grid-cols-2 gap-3">
          {[['name', 'Name *'], ['adresse', 'Adresse'], ['plz', 'PLZ'], ['ort', 'Ort'], ['telefon', 'Telefon'], ['email', 'E-Mail']].map(([k, l]) => (
            <div key={k}>
              <label className="label">{l}</label>
              <input className="input" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <button onClick={() => createMut.mutate()} className="btn-primary mt-3">Anlegen</button>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b"><th className="px-4 py-3 text-left font-medium text-gray-600">Name</th><th className="px-4 py-3 text-left font-medium text-gray-600">Adresse</th><th className="px-4 py-3 text-left font-medium text-gray-600">Kontakt</th></tr></thead>
          <tbody className="divide-y">
            {(standorte || []).map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.plz} {s.ort}</td>
                <td className="px-4 py-3 text-gray-600">{s.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RasterPanel() {
  const { data: standorte } = useQuery('standorte', () => standorteApi.list().then(r => r.data));
  const [form, setForm] = useState({ standort_id: '', zeilen: 10, spalten: 20, prefix: '', bereich: 'Standard' });
  const { stellplaetzeApi } = require('../utils/api');
  const genMut = useMutation(
    () => stellplaetzeApi.generateRaster(form),
    { onSuccess: (res) => toast.success(`${res.data.created?.length} Stellplätze erstellt`) }
  );

  return (
    <div className="card max-w-md space-y-4">
      <h3 className="font-semibold">Stellplatz-Raster generieren</h3>
      <p className="text-sm text-gray-600">Generiert ein Raster von Stellplätzen für einen Standort (überspringt bereits vorhandene).</p>
      <div className="space-y-3">
        <div><label className="label">Standort</label>
          <select className="input" value={form.standort_id} onChange={e => setForm(f => ({ ...f, standort_id: e.target.value }))}>
            <option value="">— wählen —</option>
            {(standorte || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Zeilen</label><input type="number" className="input" value={form.zeilen} onChange={e => setForm(f => ({ ...f, zeilen: parseInt(e.target.value) }))} /></div>
          <div><label className="label">Spalten</label><input type="number" className="input" value={form.spalten} onChange={e => setForm(f => ({ ...f, spalten: parseInt(e.target.value) }))} /></div>
        </div>
        <div><label className="label">Prefix</label><input className="input" value={form.prefix} onChange={e => setForm(f => ({ ...f, prefix: e.target.value }))} placeholder="z.B. H für Halle" /></div>
        <div><label className="label">Bereich</label><input className="input" value={form.bereich} onChange={e => setForm(f => ({ ...f, bereich: e.target.value }))} /></div>
        <button onClick={() => genMut.mutate()} disabled={!form.standort_id || genMut.isLoading} className="btn-primary w-full">
          {genMut.isLoading ? 'Generiere...' : 'Raster generieren'}
        </button>
      </div>
    </div>
  );
}

function PlzRegionenPanel() {
  const queryClient = useQueryClient();
  const { data: regionen } = useQuery('plz-regionen', () => provisionenApi.plzRegionen().then(r => r.data));
  const [form, setForm] = useState({ region_name: '', plz_von: '', plz_bis: '', bonus_prozent: 0.002 });
  const createMut = useMutation(
    () => provisionenApi.berechnen(form), // reuse endpoint for adding region
    { onSuccess: () => { toast.success('Region angelegt'); queryClient.invalidateQueries('plz-regionen'); } }
  );

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-semibold mb-3">PLZ-Regionen (Regional-Bonus)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div><label className="label">Region</label><input className="input" value={form.region_name} onChange={e => setForm(f => ({ ...f, region_name: e.target.value }))} /></div>
          <div><label className="label">PLZ von</label><input className="input" value={form.plz_von} onChange={e => setForm(f => ({ ...f, plz_von: e.target.value }))} /></div>
          <div><label className="label">PLZ bis</label><input className="input" value={form.plz_bis} onChange={e => setForm(f => ({ ...f, plz_bis: e.target.value }))} /></div>
          <div><label className="label">Bonus %</label><input type="number" step="0.001" className="input" value={form.bonus_prozent} onChange={e => setForm(f => ({ ...f, bonus_prozent: parseFloat(e.target.value) }))} /></div>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b"><th className="px-4 py-3 text-left font-medium text-gray-600">Region</th><th className="px-4 py-3 text-left font-medium text-gray-600">PLZ</th><th className="px-4 py-3 text-right font-medium text-gray-600">Bonus</th></tr></thead>
          <tbody className="divide-y">
            {(regionen || []).map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{r.region_name}</td>
                <td className="px-4 py-3 text-gray-600">{r.plz_von} – {r.plz_bis}</td>
                <td className="px-4 py-3 text-right">{(parseFloat(r.bonus_prozent) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExportPanel() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState([]);
  const { data: fahrzeuge } = useQuery(
    ['fahrzeuge-export'],
    () => fahrzeugeApi.list({ status: 'bereit', limit: 100 }).then(r => r.data)
  );

  const mobileMut = useMutation(() => exportApi.toMobileDe({ fahrzeug_ids: selected }), {
    onSuccess: (res) => toast.success(`${res.data.count} Fahrzeuge zu Mobile.de exportiert`)
  });
  const scoutMut = useMutation(() => exportApi.toAutoScout({ fahrzeug_ids: selected }), {
    onSuccess: (res) => toast.success(`${res.data.count} Fahrzeuge zu AutoScout24 exportiert`)
  });

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => mobileMut.mutate()} disabled={!selected.length || mobileMut.isLoading} className="btn-primary">
          Mobile.de Export ({selected.length})
        </button>
        <button onClick={() => scoutMut.mutate()} disabled={!selected.length || scoutMut.isLoading} className="btn-secondary">
          AutoScout24 Export ({selected.length})
        </button>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b"><th className="px-4 py-3 w-10"><input type="checkbox" onChange={e => setSelected(e.target.checked ? (fahrzeuge?.data || []).map(f => f.id) : [])} /></th><th className="px-4 py-3 text-left font-medium text-gray-600">Fahrzeug</th><th className="px-4 py-3 text-left font-medium text-gray-600">Preis</th><th className="px-4 py-3 text-left font-medium text-gray-600">Börsen</th></tr></thead>
          <tbody className="divide-y">
            {(fahrzeuge?.data || []).map(f => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggleSelect(f.id)} /></td>
                <td className="px-4 py-3"><div className="font-medium">{f.marke} {f.modell}</div><div className="text-xs text-gray-400">{f.intern_nummer}</div></td>
                <td className="px-4 py-3">{f.zielverkaufspreis?.toLocaleString('de-DE', { minimumFractionDigits: 0 })} €</td>
                <td className="px-4 py-3">
                  {f.bei_mobilede && <span className="badge-blue text-xs mr-1">M.de</span>}
                  {f.bei_autoscout && <span className="badge bg-orange-100 text-orange-800 text-xs">AS24</span>}
                </td>
              </tr>
            ))}
            {!fahrzeuge?.data?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Keine exportierbaren Fahrzeuge (Status: Bereit)</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
