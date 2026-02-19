import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'react-query';
import toast from 'react-hot-toast';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { fahrzeugeApi, standorteApi } from '../utils/api';
import useAuthStore from '../store/authStore';

const FIELDS = [
  { key: 'marke', label: 'Marke', required: true },
  { key: 'modell', label: 'Modell', required: true },
  { key: 'variante', label: 'Variante / Ausstattungslinie' },
  { key: 'baujahr', label: 'Baujahr', type: 'number' },
  { key: 'erstzulassung', label: 'Erstzulassung', type: 'date' },
  { key: 'vin', label: 'FIN / VIN' },
  { key: 'kennzeichen', label: 'Kennzeichen' },
  { key: 'kilometer', label: 'Kilometerstand', type: 'number' },
  { key: 'leistung_ps', label: 'Leistung (PS)', type: 'number' },
  { key: 'leistung_kw', label: 'Leistung (kW)', type: 'number' },
  { key: 'hubraum_ccm', label: 'Hubraum (ccm)', type: 'number' },
  { key: 'farbe', label: 'Außenfarbe' },
  { key: 'innenfarbe', label: 'Innenfarbe' },
  { key: 'tueren', label: 'Türen', type: 'number' },
  { key: 'sitze', label: 'Sitze', type: 'number' },
];

export default function FahrzeugNeuPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    status: 'eingang',
    standort_id: user?.standort_id || '',
    kraftstoff: 'Benzin',
    getriebe: 'Manuell',
    antrieb: 'FWD',
    fahrzeugtyp: 'PKW',
    tueren: 4,
    sitze: 5,
    einkaufsdatum: new Date().toISOString().slice(0, 10),
  });

  const { data: standorte } = useQuery('standorte', () => standorteApi.list().then(r => r.data));

  const createMut = useMutation(
    () => fahrzeugeApi.create(form),
    {
      onSuccess: (res) => {
        toast.success(`Fahrzeug ${res.data.intern_nummer} angelegt`);
        navigate(`/fahrzeuge/${res.data.id}`);
      },
    }
  );

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <h2 className="text-xl font-bold">Fahrzeug anlegen</h2>
      </div>

      <div className="card space-y-6">
        {/* Standort */}
        <div>
          <label className="label">Standort *</label>
          <select className="input" value={form.standort_id} onChange={e => set('standort_id', e.target.value)}>
            {(standorte || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Basic fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="label">{f.label}{f.required && ' *'}</label>
              <input
                type={f.type || 'text'}
                className="input"
                value={form[f.key] || ''}
                onChange={e => set(f.key, f.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                required={f.required}
              />
            </div>
          ))}
        </div>

        {/* Selects */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Kraftstoff</label>
            <select className="input" value={form.kraftstoff} onChange={e => set('kraftstoff', e.target.value)}>
              {['Benzin', 'Diesel', 'Elektro', 'Hybrid (Benzin)', 'Hybrid (Diesel)', 'LPG', 'CNG', 'Wasserstoff'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Getriebe</label>
            <select className="input" value={form.getriebe} onChange={e => set('getriebe', e.target.value)}>
              {['Manuell', 'Automatik', 'Halbautomatik'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Antrieb</label>
            <select className="input" value={form.antrieb} onChange={e => set('antrieb', e.target.value)}>
              {['FWD', 'RWD', 'AWD', '4WD'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* Financial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Einkaufsdatum</label>
            <input type="date" className="input" value={form.einkaufsdatum || ''} onChange={e => set('einkaufsdatum', e.target.value)} />
          </div>
          <div>
            <label className="label">Einkaufspreis (€)</label>
            <input type="number" className="input" value={form.einkaufspreis || ''} onChange={e => set('einkaufspreis', parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="label">Ziel-Verkaufspreis (€)</label>
            <input type="number" className="input" value={form.zielverkaufspreis || ''} onChange={e => set('zielverkaufspreis', parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="label">Aufbereitungskosten (€)</label>
            <input type="number" className="input" value={form.aufbereitungskosten || ''} onChange={e => set('aufbereitungskosten', parseFloat(e.target.value))} />
          </div>
        </div>

        <div>
          <label className="label">Notizen / Beschreibung</label>
          <textarea className="input resize-none" rows={4} value={form.notizen || ''} onChange={e => set('notizen', e.target.value)} />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button onClick={() => navigate(-1)} className="btn-secondary">Abbrechen</button>
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isLoading || !form.marke || !form.modell}
            className="btn-primary"
          >
            {createMut.isLoading ? 'Speichere...' : 'Fahrzeug speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
