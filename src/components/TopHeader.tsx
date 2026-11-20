import React from 'react';
import { Bell, Menu, Plus } from 'lucide-react';
import type { UserRole, WorkspaceTab } from '../types/logistics';

interface TopHeaderProps {
  activeTab: WorkspaceTab;
  userRole: UserRole;
  esgBudgetUsd: number;
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenNewLoad: () => void;
  onOpenMobileNav: () => void;
}

const TAB_TITLES: Record<WorkspaceTab, string> = {
  dispatch: 'Despacho y Enrutamiento Google Maps',
  marketplace: 'Mercado Spot y Cargas en Ruta Vacía',
  fleet: 'Flota, Telemetría Teltonika y Mantenciones',
  carbon: 'Huella de Carbono, Reforestación y Blockchain',
  wallet: 'Liquidaciones Externas, Plazos y Analítica ESG',
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Torre de Control',
  carrier: 'Transportista / Flota',
  shipper: 'Generador de Carga',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  userRole,
  esgBudgetUsd,
  unreadCount,
  onOpenNotifications,
  onOpenNewLoad,
  onOpenMobileNav,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Abrir menú de navegación"
            className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
              <span className="truncate">TerraCarga</span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{ROLE_LABELS[userRole]}</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span className="hidden sm:inline font-mono tabular-nums text-slate-700 font-medium">
                Fondo ESG ${esgBudgetUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
            </div>
            <h1 className="font-display text-sm sm:text-lg font-semibold text-slate-900 truncate">
              {TAB_TITLES[activeTab]}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label={`Notificaciones en tiempo real (${unreadCount} sin leer)`}
            className="relative inline-flex items-center justify-center p-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-semibold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNewLoad}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Publicar Carga
          </button>
        </div>
      </div>
    </header>
  );
};
