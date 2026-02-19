import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  HomeIcon,
  TruckIcon,
  MapPinIcon,
  UserGroupIcon,
  CurrencyEuroIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  UsersIcon,
  EnvelopeIcon,
  ArrowRightStartOnRectangleIcon,
  ViewColumnsIcon,
  DevicePhoneMobileIcon,
  DocumentMagnifyingGlassIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';

const navGroups = [
  {
    label: 'Hauptmenü',
    items: [
      { to: '/',           label: 'Dashboard',    icon: HomeIcon,         exact: true },
      { to: '/fahrzeuge',  label: 'Fahrzeuge',    icon: TruckIcon },
      { to: '/logistik',   label: 'Logistik',     icon: MapPinIcon },
    ],
  },
  {
    label: 'Workflow',
    items: [
      { to: '/kanban',     label: 'Kanban-Board', icon: ViewColumnsIcon },
      { to: '/checkin',    label: 'Check-in',     icon: DevicePhoneMobileIcon },
      { to: '/gutachten',  label: 'Gutachten',    icon: DocumentMagnifyingGlassIcon },
      { to: '/reporting',  label: 'Reporting',    icon: ChartBarIcon },
    ],
  },
  {
    label: 'CRM',
    items: [
      { to: '/leads',      label: 'Leads',        icon: EnvelopeIcon },
      { to: '/kunden',     label: 'Kunden',       icon: UserGroupIcon },
      { to: '/provisionen',label: 'Provisionen',  icon: CurrencyEuroIcon, perm: 'perm_provision_sehen' },
    ],
  },
  {
    label: 'Verwaltung',
    items: [
      { to: '/nutzer',     label: 'Nutzer',       icon: UsersIcon,        perm: 'perm_admin' },
      { to: '/admin',      label: 'Admin',        icon: Cog6ToothIcon,    perm: 'perm_admin' },
    ],
  },
];

export default function Sidebar({ onClose }) {
  const { user, logout, hasPermission } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-8 h-8 bg-blue-400 rounded-lg flex items-center justify-center font-bold text-sm">
          DMS
        </div>
        <div>
          <div className="font-bold text-sm">Autohaus DMS</div>
          <div className="text-xs text-white/60">{user?.standort_name || 'System'}</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item => !item.perm || hasPermission(item.perm));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <div className="px-3 mb-1 text-xs font-semibold text-white/40 uppercase tracking-wider">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    onClick={onClose}
                    className={({ isActive }) => clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-3 pb-4 border-t border-white/10 pt-4">
        <div className="px-3 mb-3">
          <div className="text-sm font-medium">{user?.vorname} {user?.nachname}</div>
          <div className="text-xs text-white/60 capitalize">{user?.rolle}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowRightStartOnRectangleIcon className="w-5 h-5" />
          Abmelden
        </button>
      </div>
    </div>
  );
}
