import React from 'react';
import { Bars3Icon, BellIcon } from '@heroicons/react/24/outline';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/fahrzeuge': 'Fahrzeugverwaltung',
  '/logistik': 'Logistik & Stellplätze',
  '/leads': 'Lead-Management',
  '/kunden': 'Kundenverwaltung',
  '/provisionen': 'Provisionen',
  '/nutzer': 'Nutzerverwaltung',
  '/admin': 'Administration',
};

export default function TopBar({ onMenuClick }) {
  const { pathname } = useLocation();
  const { user } = useAuthStore();
  const title = PAGE_TITLES[pathname] || PAGE_TITLES[Object.keys(PAGE_TITLES).find(k => pathname.startsWith(k) && k !== '/')] || 'DMS';

  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-6 h-14 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 lg:hidden"
        >
          <Bars3Icon className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-gray-900">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100">
          <BellIcon className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center text-white text-sm font-medium">
          {user?.vorname?.[0]}{user?.nachname?.[0]}
        </div>
      </div>
    </header>
  );
}
