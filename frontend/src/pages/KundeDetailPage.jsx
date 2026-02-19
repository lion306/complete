import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { kundenApi } from '../utils/api';
import { Link } from 'react-router-dom';

export default function KundeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: kunde, isLoading } = useQuery(['kunde', id], () => kundenApi.get(id).then(r => r.data));

  if (isLoading) return <div className="p-8 text-center text-gray-400">Laden...</div>;
  if (!kunde) return <div className="p-8 text-center text-red-500">Kunde nicht gefunden</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold">{kunde.vorname} {kunde.nachname}</h2>
          <p className="text-sm text-gray-500 capitalize">{kunde.typ} · {kunde.herkunft}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-3">Kontaktdaten</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ['Anrede', kunde.anrede],
              ['Vorname', kunde.vorname],
              ['Nachname', kunde.nachname],
              ['E-Mail', kunde.email],
              ['Telefon', kunde.telefon],
              ['Mobil', kunde.mobil],
              ['Geburtsdatum', kunde.geburtsdatum ? new Date(kunde.geburtsdatum).toLocaleDateString('de-DE') : '—'],
            ].map(([l, v]) => (<React.Fragment key={l}><dt className="text-gray-500">{l}</dt><dd className="font-medium">{v || '—'}</dd></React.Fragment>))}
          </dl>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-3">Adresse</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ['Straße', kunde.strasse],
              ['PLZ', kunde.plz],
              ['Ort', kunde.ort],
              ['Land', kunde.land],
              ['Regional-Bonus', kunde.plz_region_bonus ? '✓ Ja' : 'Nein'],
            ].map(([l, v]) => (<React.Fragment key={l}><dt className="text-gray-500">{l}</dt><dd className="font-medium">{v || '—'}</dd></React.Fragment>))}
          </dl>
        </div>

        {/* Fahrzeuge */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-3">Fahrzeughistorie</h3>
          <div className="divide-y divide-gray-100">
            {(kunde.fahrzeuge || []).map(fz => (
              <div key={fz.id} className="py-3 flex items-center justify-between">
                <div>
                  <Link to={`/fahrzeuge/${fz.id}`} className="font-medium hover:text-primary-700">
                    {fz.marke} {fz.modell}
                  </Link>
                  <div className="text-xs text-gray-400">{fz.intern_nummer}</div>
                </div>
                {fz.verkaufsdatum && (
                  <span className="text-sm text-gray-500">
                    {new Date(fz.verkaufsdatum).toLocaleDateString('de-DE')}
                  </span>
                )}
              </div>
            ))}
            {!kunde.fahrzeuge?.length && <div className="py-4 text-center text-gray-400">Keine Fahrzeuge</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
