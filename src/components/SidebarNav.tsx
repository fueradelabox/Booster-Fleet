import React from 'react';
import {
  MapPin,
  PackageSearch,
  Truck,
  Leaf,
  Wallet,
  Headphones,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { UserRole, WorkspaceTab } from '../types/logistics';

interface SidebarNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  userRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  unreadNotifications: number;
  criticalMaintenanceCount: number;
  onOpenSupport: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dispatch', label: 'Despacho y Mapa', icon: MapPin },
  { id: 'marketplace', label: 'Mercado Spot', icon: PackageSearch },
  { id: 'fleet', label: 'Flota y Teltonika', icon: Truck },
  { id: 'carbon', label: 'Carbono y Blockchain', icon: Leaf },
  { id: 'wallet', label: 'Billetera y Analítica', icon: Wallet },
];

const ROLE_OPTIONS: { id: UserRole; label: string; subtitle: string }[] = [
  { id: 'admin', label: 'Torre de Control', subtitle: 'Vista integral 360°' },
  { id: 'carrier', label: 'Transportista', subtitle: 'Flota 1+ y rutas vacías' },
  { id: 'shipper', label: 'Generador Carga', subtitle: 'Spot, programada y ESG' },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  userRole,
  onChangeRole,
  criticalMaintenanceCount,
  onOpenSupport,
  mobileOpen,
  onCloseMobile,
}) => {
  const content = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100 w-64 shrink-0 border-r border-slate-800">
      <div className="flex items-center justify-between px-5 py-5 border-b border-slate-800">
        <div>
          <span className="font-display text-lg font-bold tracking-tight text-white">
            TerraCarga
          </span>
          <p className="text-xs text-slate-400 mt-0.5">Logística Carbono Neutral</p>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Cerrar menú lateral"
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-4 border-b border-slate-800">
        <p className="text-xs font-medium text-slate-400 mb-2 px-1">
          Perfil operativo
        </p>
        <div className="space-y-1" role="group" aria-label="Selector de rol">
          {ROLE_OPTIONS.map((role) => {
            const active = userRole === role.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => onChangeRole(role.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                }`}
              >
                <div className="text-xs font-semibold whitespace-nowrap">{role.label}</div>
                <div className="text-[11px] text-slate-400 truncate">{role.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
                <Icon
                  className={`w-4 h-4 ${active ? 'text-emerald-700' : 'text-slate-400'}`}
                />
                {item.label}
              </span>
              {item.id === 'fleet' && criticalMaintenanceCount > 0 && (
                <span
                  className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                    active
                      ? 'bg-red-100 text-red-700'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {criticalMaintenanceCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-2.5">
        <div className="flex items-center gap-2 text-xs text-slate-300 px-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">Teltonika CAN-Bus · Blockchain</span>
        </div>
        <button
          type="button"
          onClick={onOpenSupport}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          <Headphones className="w-4 h-4 text-emerald-400" />
          Soporte Técnico 24/7
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-screen sticky top-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
