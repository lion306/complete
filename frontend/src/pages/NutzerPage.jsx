import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { nutzerApi, standorteApi } from '../utils/api';

const ROLLEN = ['superadmin', 'standortleiter', 'verkaefer', 'einkauf', 'werkstatt', 'buchhaltung'];

const PERMISSIONS = [
  ['perm_fahrzeug_anlegen', 'Fahrzeug anlegen'],
  ['perm_fahrzeug_bearbeiten', 'Fahrzeug bearbeiten'],
  ['perm_fahrzeug_loeschen', 'Fahrzeug löschen'],
  ['perm_fahrzeug_einkaufspreis_sehen', 'EK-Preis sehen'],
  ['perm_fahrzeug_verkaufen', 'Fahrzeug verkaufen'],
  ['perm_kunde_anlegen', 'Kunden anlegen'],
  ['perm_kunde_bearbeiten', 'Kunden bearbeiten'],
  ['perm_lead_zuweisen', 'Leads zuweisen'],
  ['perm_provision_sehen', 'Provision sehen'],
  ['perm_provision_alle_sehen', 'Alle Provisionen sehen'],
  ['perm_dokument_generieren', 'Dokumente generieren'],
  ['perm_schaden_bearbeiten', 'Schäden bearbeiten'],
  ['perm_stellplatz_verwalten', 'Stellplätze verwalten'],
  ['perm_finanzen_sehen', 'Finanzen verwalten'],
  ['perm_export_boersen', 'Börsen exportieren'],
  ['perm_admin', 'Admin'],
];

export default function NutzerPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null | 'new' | user object
  const [form, setForm] = useState({});

  const { data: nutzer } = useQuery('nutzer', () => nutzerApi.list().then(r => r.data));
  const { data: standorte } = useQuery('standorte', () => standorteApi.list().then(r => r.data));

  const saveMut = useMutation(
    () => editing === 'new'
      ? nutzerApi.create(form)
      : nutzerApi.update(editing.id, form),
    {
      onSuccess: () => {
        toast.success(editing === 'new' ? 'Nutzer angelegt' : 'Nutzer aktualisiert');
        queryClient.invalidateQueries('nutzer');
        setEditing(null);
      },
    }
  );

  const openNew = () => {
    setForm({ rolle: 'verkaefer', aktiv: true });
    setEditing('new');
  };

  const openEdit = (u) => {
    setForm({ ...u });
    setEditing(u);
  };

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Nutzerverwaltung</h2>
        <button onClick={openNew} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Nutzer anlegen
        </button>
      </div>

      {/* Edit Form */}
      {editing && (
        <div className="card space-y-4">
          <h3 className="font-semibold">{editing === 'new' ? 'Neuer Nutzer' : `${editing.vorname} ${editing.nachname} bearbeiten`}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div><label className="label">Vorname *</label><input className="input" value={form.vorname || ''} onChange={e => setF('vorname', e.target.value)} /></div>
            <div><label className="label">Nachname *</label><input className="input" value={form.nachname || ''} onChange={e => setF('nachname', e.target.value)} /></div>
            <div><label className="label">E-Mail *</label><input className="input" type="email" value={form.email || ''} onChange={e => setF('email', e.target.value)} /></div>
            {editing === 'new' && <div><label className="label">Passwort</label><input className="input" type="password" value={form.passwort || ''} onChange={e => setF('passwort', e.target.value)} placeholder="Autohaus2024!" /></div>}
            <div>
              <label className="label">Rolle</label>
              <select className="input" value={form.rolle || 'verkaefer'} onChange={e => setF('rolle', e.target.value)}>
                {ROLLEN.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Standort</label>
              <select className="input" value={form.standort_id || ''} onChange={e => setF('standort_id', e.target.value)}>
                <option value="">— kein —</option>
                {(standorte || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label mb-2 block">Berechtigungen</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {PERMISSIONS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!form[key]} onChange={e => setF(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(null)} className="btn-secondary">Abbrechen</button>
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isLoading} className="btn-primary">Speichern</button>
          </div>
        </div>
      )}

      {/* Nutzer Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Rolle</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Standort</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Letzter Login</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(nutzer || []).map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.vorname} {u.nachname}</div>
                  <div className="text-xs text-gray-400">{u.email}</div>
                </td>
                <td className="px-4 py-3 capitalize">{u.rolle}</td>
                <td className="px-4 py-3">{u.standort_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">
                  {u.letzter_login ? new Date(u.letzter_login).toLocaleDateString('de-DE') : 'Nie'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(u)} className="btn-secondary text-xs py-1">
                    <PencilIcon className="w-3.5 h-3.5" /> Bearbeiten
                  </button>
                </td>
              </tr>
            ))}
            {!nutzer?.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Keine Nutzer</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
