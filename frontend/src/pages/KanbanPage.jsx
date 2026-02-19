import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  TruckIcon, ClockIcon, CameraIcon, ExclamationTriangleIcon,
  ArrowPathIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { standorteApi } from '../utils/api';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import clsx from 'clsx';

// ─── API helpers ──────────────────────────────────────────────────────────────
const kanbanApi = {
  board:  (standort_id) => api.get(`/kanban/board/${standort_id}`).then(r => r.data),
  move:   (data)        => api.put('/kanban/move', data),
  lanes:  ()            => api.get('/kanban/lanes').then(r => r.data),
  patch:  (id, data)    => api.patch(`/kanban/cards/${id}`, data),
};

// ─── Standzeit colour ─────────────────────────────────────────────────────────
function ampelColor(tage) {
  if (!tage || tage < 30) return 'bg-emerald-400';
  if (tage < 60)           return 'bg-yellow-400';
  if (tage < 90)           return 'bg-orange-400';
  return 'bg-red-500';
}

function ampelText(tage) {
  if (!tage || tage < 30) return 'text-emerald-700';
  if (tage < 60)           return 'text-yellow-700';
  if (tage < 90)           return 'text-orange-700';
  return 'text-red-700 font-bold';
}

const PRIORITAET_STYLES = {
  normal:   'border-l-gray-300',
  hoch:     'border-l-amber-400',
  dringend: 'border-l-red-500',
};

// ─── Kanban Card ─────────────────────────────────────────────────────────────
function KanbanCard({ card, onDragStart, onDragEnd }) {
  const [expanded, setExpanded] = useState(false);
  const standzeit = parseInt(card.standzeit_tage) || 0;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('fahrzeug_id', card.id);
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
      className={clsx(
        'bg-white rounded-lg shadow-sm border-l-4 p-3 cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-shadow select-none',
        PRIORITAET_STYLES[card.prioritaet] || PRIORITAET_STYLES.normal
      )}
    >
      {/* Titelbild + Header */}
      <div className="flex gap-2 mb-2">
        {card.titelbild ? (
          <img
            src={`/uploads/${card.titelbild}`}
            className="w-14 h-10 object-cover rounded flex-shrink-0"
            alt=""
          />
        ) : (
          <div className="w-14 h-10 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center">
            <TruckIcon className="w-5 h-5 text-gray-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate leading-tight">
            {card.marke} {card.modell}
          </div>
          <div className="text-xs text-gray-400 truncate">{card.intern_nummer}</div>
        </div>
      </div>

      {/* Standzeit pill */}
      <div className="flex items-center gap-2 mb-2">
        <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', ampelColor(standzeit))} />
        <span className={clsx('text-xs font-medium', ampelText(standzeit))}>
          {standzeit} Tage Standzeit
        </span>
        {card.faellig_am && (
          <span className="ml-auto text-xs text-red-500 font-medium">
            ⚑ {new Date(card.faellig_am).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1">
        {parseInt(card.foto_anzahl) === 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
            <CameraIcon className="w-3 h-3" /> Keine Fotos
          </span>
        )}
        {parseInt(card.schaden_ausstehend) > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5">
            <ExclamationTriangleIcon className="w-3 h-3" />
            {card.schaden_ausstehend} offen
          </span>
        )}
        {parseInt(card.gutachten_anzahl) > 0 && (
          <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
            {card.gutachten_anzahl} Gutachten
          </span>
        )}
        {card.prioritaet === 'dringend' && (
          <span className="text-[10px] bg-red-500 text-white rounded px-1.5 py-0.5 font-bold">
            DRINGEND
          </span>
        )}
      </div>

      {/* Expand link */}
      <Link
        to={`/fahrzeuge/${card.id}`}
        className="block mt-2 text-[11px] text-primary-600 hover:underline"
        onClick={e => e.stopPropagation()}
      >
        Details →
      </Link>
    </div>
  );
}

// ─── Kanban Lane ─────────────────────────────────────────────────────────────
function KanbanLane({ lane, cards, onDrop, isDragOver, onDragOver, onDragLeave, onDragStart, onDragEnd }) {
  return (
    <div className="flex-shrink-0 w-64 flex flex-col">
      {/* Lane header */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-xl font-semibold text-sm text-white"
        style={{ backgroundColor: lane.farbe || '#6b7280' }}
      >
        <span>{lane.bezeichnung}</span>
        <span className="bg-white/25 rounded-full px-2 py-0.5 text-xs font-bold">
          {cards.length}
        </span>
      </div>

      {/* Cards dropzone */}
      <div
        onDrop={(e) => { e.preventDefault(); onDrop(lane.id); }}
        onDragOver={(e) => { e.preventDefault(); onDragOver(lane.id); }}
        onDragLeave={onDragLeave}
        className={clsx(
          'flex-1 min-h-48 p-2 space-y-2 rounded-b-xl transition-colors',
          isDragOver
            ? 'bg-primary-50 border-2 border-dashed border-primary-400'
            : 'bg-gray-100 border-2 border-transparent'
        )}
      >
        {cards.map(card => (
          <KanbanCard
            key={card.id}
            card={card}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {cards.length === 0 && (
          <div className="h-20 flex items-center justify-center text-gray-300 text-sm">
            Leer
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Kanban Page ─────────────────────────────────────────────────────────
export default function KanbanPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedStandort, setSelectedStandort] = useState(user?.standort_id || '');
  const [dragOverLane, setDragOverLane] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const { data: standorte } = useQuery(
    'standorte',
    () => standorteApi.list().then(r => r.data),
    {
      onSuccess: data => {
        if (data?.length && !selectedStandort) setSelectedStandort(data[0].id);
      },
    }
  );

  const { data: boardData, isLoading, refetch } = useQuery(
    ['kanban-board', selectedStandort],
    () => kanbanApi.board(selectedStandort),
    { enabled: !!selectedStandort, refetchInterval: 60000 }
  );

  const moveMut = useMutation(
    (data) => kanbanApi.move(data),
    {
      onSuccess: (_, vars) => {
        const laneName = boardData?.lanes?.find(l => l.id === vars.lane_id)?.bezeichnung;
        toast.success(`Verschoben → ${laneName}`);
        queryClient.invalidateQueries(['kanban-board', selectedStandort]);
      },
    }
  );

  const handleDrop = useCallback((laneId) => {
    if (!draggingId || !laneId) return;
    moveMut.mutate({ fahrzeug_id: draggingId, lane_id: laneId, position: 0 });
    setDragOverLane(null);
    setDraggingId(null);
  }, [draggingId, moveMut]);

  const stats = boardData?.stats;
  const board  = boardData?.board || [];

  return (
    <div className="h-full flex flex-col space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Fahrzeug-Board (Kanban)</h2>
          {stats && (
            <p className="text-sm text-gray-500">
              {stats.gesamt} Fahrzeuge ·{' '}
              <span className="text-red-600 font-medium">{stats.kritisch} kritisch</span>
              {stats.dringend > 0 && (
                <> · <span className="text-amber-600 font-medium">{stats.dringend} dringend</span></>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <select
            className="input w-auto text-sm"
            value={selectedStandort}
            onChange={e => setSelectedStandort(e.target.value)}
          >
            {(standorte || []).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button onClick={() => refetch()} className="btn-secondary p-2" title="Aktualisieren">
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Ampel legend */}
      <div className="flex gap-3 text-xs items-center">
        <span className="text-gray-500">Standzeit:</span>
        {[
          { color: 'bg-emerald-400', label: '< 30 Tage' },
          { color: 'bg-yellow-400',  label: '30–60 Tage' },
          { color: 'bg-orange-400',  label: '60–90 Tage' },
          { color: 'bg-red-500',     label: '> 90 Tage' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={clsx('w-2.5 h-2.5 rounded-full', color)} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
        <span className="ml-4 text-gray-400">Karten per Drag &amp; Drop verschieben</span>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <ArrowPathIcon className="w-6 h-6 animate-spin mr-2" /> Lade Board...
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 h-full pb-4 min-w-max">
            {board.map(lane => (
              <KanbanLane
                key={lane.id}
                lane={lane}
                cards={lane.karten || []}
                isDragOver={dragOverLane === lane.id}
                onDrop={handleDrop}
                onDragOver={(id) => setDragOverLane(id)}
                onDragLeave={() => setDragOverLane(null)}
                onDragStart={(id) => setDraggingId(id)}
                onDragEnd={() => { setDraggingId(null); setDragOverLane(null); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
