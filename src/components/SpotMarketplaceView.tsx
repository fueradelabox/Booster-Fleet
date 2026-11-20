import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Leaf,
  PackagePlus,
  Search,
  Sparkles,
  Truck,
} from 'lucide-react';
import type {
  FleetVehicle,
  Shipment,
  ShipmentMode,
  UserRole,
} from '../types/logistics';

interface SpotMarketplaceViewProps {
  shipments: Shipment[];
  fleet: FleetVehicle[];
  userRole: UserRole;
  onAssignShipment: (shipmentId: string, vehicleId: string) => void;
  onOpenNewLoad: () => void;
}

export const SpotMarketplaceView: React.FC<SpotMarketplaceViewProps> = ({
  shipments,
  fleet,
  userRole,
  onAssignShipment,
  onOpenNewLoad,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | ShipmentMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicleByLoad, setSelectedVehicleByLoad] = useState<
    Record<string, string>
  >({});

  const assignableVehicles = useMemo(
    () =>
      fleet.filter(
        (v) => v.status === 'disponible' || v.status === 'ruta_vacia'
      ),
    [fleet]
  );

  const availableLoads = useMemo(() => {
    return shipments.filter((s) => {
      if (filterMode !== 'all' && s.mode !== filterMode) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${s.code} ${s.title} ${s.originName} ${s.destinationName} ${s.cargoType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, filterMode, searchQuery]);

  const emptyReturnVehicles = useMemo(
    () => fleet.filter((v) => v.status === 'ruta_vacia'),
    [fleet]
  );

  return (
    <div className="space-y-6">
      {/* Empty Backhaul Highlight for Carriers / Control Tower */}
      {emptyReturnVehicles.length > 0 && (
        <section className="bg-emerald-950 text-white rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-emerald-300 font-medium">
              <Sparkles className="w-4 h-4" />
              <span>Emparejamiento Inteligente de Retorno Vacío</span>
            </div>
            <h2 className="font-display text-base sm:text-lg font-semibold">
              {emptyReturnVehicles[0].unitName} regresa sin carga hacia{' '}
              {emptyReturnVehicles[0].emptyBackhaulTo || 'Ciudad de México'}
            </h2>
            <p className="text-xs text-emerald-100/80 max-w-2xl">
              Asigna una carga compatible en ruta vacía para monetizar el retorno, reducir kilómetros en vacío y disminuir la intensidad de carbono por tonelada-kilómetro.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilterMode('ruta_vacia')}
            className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Ver Cargas para Ruta Vacía
          </button>
        </section>
      )}

      {/* Filter Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
          role="tablist"
          aria-label="Filtrar cargas por modalidad"
        >
          {(
            [
              { id: 'all', label: 'Todas las cargas' },
              { id: 'spot', label: 'Spot Inmediata' },
              { id: 'programada', label: 'Programada' },
              { id: 'ruta_vacia', label: 'Ruta Vacía' },
            ] as const
          ).map((tab) => {
            const active = filterMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar origen, destino o código..."
              aria-label="Buscar cargas por origen, destino o código"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          {userRole !== 'carrier' && (
            <button
              type="button"
              onClick={onOpenNewLoad}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              Nueva Solicitud
            </button>
          )}
        </div>
      </section>

      {/* Loads Grid */}
      {availableLoads.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="font-display text-sm font-semibold text-slate-900">
            No hay cargas que coincidan con el filtro actual
          </p>
          <p className="text-xs text-slate-500">
            Cambia la modalidad o publica una nueva carga spot o programada.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilterMode('all');
              setSearchQuery('');
            }}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            Restablecer filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {availableLoads.map((load) => {
            const chosenVehicleId =
              selectedVehicleByLoad[load.id] ??
              assignableVehicles[0]?.id ??
              fleet[0]?.id ??
              '';
            const modeLabel =
              load.mode === 'spot'
                ? 'Carga Spot Inmediata'
                : load.mode === 'ruta_vacia'
                  ? 'Retorno Ruta Vacía'
                  : 'Programada';

            return (
              <article
                key={load.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-slate-800">
                          {load.code}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{modeLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{load.shipperName}</span>
                      </div>
                      <h3 className="font-display text-base font-semibold text-slate-900 mt-1">
                        {load.title}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                        ${load.priceUsd.toLocaleString('en-US')} USD
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                        ${(load.priceUsd / Math.max(1, load.distanceKm)).toFixed(2)}/km
                        {load.backhaulDiscountPct > 0
                          ? ` · -${load.backhaulDiscountPct}% retorno`
                          : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="truncate">{load.originName}</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{load.destinationName}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Distancia / Tiempo</span>
                      <span className="font-mono font-medium text-slate-900 tabular-nums">
                        {load.distanceKm} km · {Math.round(load.estimatedDurationMin / 60)}h
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Carga / Modalidad</span>
                      <span className="font-medium text-slate-900 flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                        {load.payloadTons} t
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Huella Estimada</span>
                      <span className="font-mono font-medium text-emerald-700 tabular-nums flex items-center gap-1">
                        <Leaf className="w-3.5 h-3.5" />
                        {load.co2Kg} kg CO₂e
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  {load.status === 'disponible' ? (
                    <>
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                        <select
                          aria-label={`Seleccionar unidad para ${load.code}`}
                          value={chosenVehicleId}
                          onChange={(e) =>
                            setSelectedVehicleByLoad((prev) => ({
                              ...prev,
                              [load.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                        >
                          {fleet.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.unitName} ({v.plate}) · {v.status.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAssignShipment(load.id, chosenVehicleId)}
                        disabled={!chosenVehicleId}
                        className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Aceptar y Despachar
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" />
                        Estado: {load.status.replace('_', ' ')} ·{' '}
                        {load.status === 'entregado'
                          ? 'Liquidación completada'
                          : 'Custodia activa en billetera'}
                      </span>
                      <span className="font-mono text-slate-500">
                        {new Date(load.scheduledDateIso).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
