import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Plus,
  Radio,
  ShieldCheck,
  Truck,
  Wrench,
} from 'lucide-react';
import type {
  FleetVehicle,
  FuelType,
  MaintenanceRecord,
  VehicleClass,
} from '../types/logistics';
import { evaluateMaintenanceStatus } from '../utils/logisticsEngine';

interface FleetTeltonikaViewProps {
  fleet: FleetVehicle[];
  wsConnected: boolean;
  onAddMaintenance: (
    vehicleId: string,
    record: Omit<MaintenanceRecord, 'id' | 'vehicleId'>
  ) => void;
  onAddVehicle: (vehicle: {
    unitName: string;
    plate: string;
    driverName: string;
    vehicleClass: VehicleClass;
    fuelType: FuelType;
    maxPayloadTons: number;
    imei: string;
    odometerKm: number;
  }) => void;
  onDispatchTeltonikaWebhookTest: (vehicle: FleetVehicle) => Promise<void>;
}

export const FleetTeltonikaView: React.FC<FleetTeltonikaViewProps> = ({
  fleet,
  wsConnected,
  onAddMaintenance,
  onAddVehicle,
  onDispatchTeltonikaWebhookTest,
}) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    fleet[0]?.id ?? ''
  );
  const [webhookSending, setWebhookSending] = useState(false);

  // Maintenance form state
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [maintType, setMaintType] = useState<'preventive' | 'corrective'>('preventive');
  const [maintTitle, setMaintTitle] = useState('');
  const [maintCost, setMaintCost] = useState('420');
  const [maintNextKm, setMaintNextKm] = useState('');
  const [maintNotes, setMaintNotes] = useState('');
  const [maintError, setMaintError] = useState<string | null>(null);

  // Add vehicle form state
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [plate, setPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('tractocamion');
  const [fuelType, setFuelType] = useState<FuelType>('DIESEL');
  const [maxPayload, setMaxPayload] = useState('24');
  const [imei, setImei] = useState('352093089991234');
  const [odometerKm, setOdometerKm] = useState('45000');
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  const selectedVehicle = useMemo(
    () => fleet.find((v) => v.id === selectedVehicleId) ?? fleet[0],
    [fleet, selectedVehicleId]
  );

  const alertSummary = useMemo(() => {
    let critical = 0;
    let warning = 0;
    fleet.forEach((v) => {
      const ev = evaluateMaintenanceStatus(v, new Date().toISOString());
      if (ev.level === 'critical') critical++;
      else if (ev.level === 'warning') warning++;
    });
    return { critical, warning };
  }, [fleet]);

  const handleMaintSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) return;
    if (!maintTitle.trim()) {
      setMaintError('Ingresa el detalle o servicio realizado.');
      return;
    }
    const costNum = Number(maintCost);
    if (Number.isNaN(costNum) || costNum < 0) {
      setMaintError('Ingresa un costo válido en USD.');
      return;
    }
    const nextKmNum = maintNextKm.trim()
      ? Number(maintNextKm)
      : selectedVehicle.teltonika.odometerKm + 20000;
    if (Number.isNaN(nextKmNum) || nextKmNum <= selectedVehicle.teltonika.odometerKm) {
      setMaintError('El próximo kilometraje de servicio debe ser mayor al odómetro actual.');
      return;
    }

    setMaintError(null);
    onAddMaintenance(selectedVehicle.id, {
      type: maintType,
      title: maintTitle.trim(),
      odometerAtServiceKm: selectedVehicle.teltonika.odometerKm,
      dateIso: new Date().toISOString(),
      costUsd: costNum,
      technicianNotes:
        maintNotes.trim() || 'Validado con escaneo CAN-bus Teltonika post-servicio.',
      nextDueOdometerKm: nextKmNum,
    });
    setMaintTitle('');
    setMaintNotes('');
    setMaintNextKm('');
    setShowMaintForm(false);
  };

  const handleVehicleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName.trim() || !plate.trim() || !driverName.trim()) {
      setVehicleError('Nombre de unidad, placa y conductor son obligatorios.');
      return;
    }
    if (!/^\d{15}$/.test(imei.trim())) {
      setVehicleError('El IMEI Teltonika debe tener exactamente 15 dígitos numéricos.');
      return;
    }
    setVehicleError(null);
    onAddVehicle({
      unitName: unitName.trim(),
      plate: plate.trim().toUpperCase(),
      driverName: driverName.trim(),
      vehicleClass,
      fuelType,
      maxPayloadTons: Number(maxPayload) || 20,
      imei: imei.trim(),
      odometerKm: Number(odometerKm) || 10000,
    });
    setUnitName('');
    setPlate('');
    setDriverName('');
    setShowAddVehicle(false);
  };

  const handleSendWebhookPacket = async () => {
    if (!selectedVehicle) return;
    setWebhookSending(true);
    try {
      await onDispatchTeltonikaWebhookTest(selectedVehicle);
    } finally {
      setWebhookSending(false);
    }
  };

  const originUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://tu-dominio.app';

  return (
    <div className="space-y-6">
      {/* Top Fleet & Teltonika Overview */}
      <section className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Cpu className="w-4 h-4 text-emerald-700" />
            <span>Integración Nativa GPS Teltonika · Desde 1 vehículo hasta flota global</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Control de Unidades, CAN-Bus y Bitácora de Mantenciones
          </h2>
          <p className="text-xs text-slate-600">
            {fleet.length} vehículos vinculados · {alertSummary.critical} alertas críticas ·{' '}
            {alertSummary.warning} servicios próximos
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddVehicle((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Registrar Vehículo + Teltonika
        </button>
      </section>

      {showAddVehicle && (
        <form
          onSubmit={handleVehicleSubmit}
          className="bg-white border border-slate-300 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Alta de Vehículo y Dispositivo GPS Teltonika
            </h3>
            <button
              type="button"
              onClick={() => setShowAddVehicle(false)}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          {vehicleError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {vehicleError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="veh-name" className="block text-xs font-medium text-slate-700 mb-1">
                Unidad / Modelo
              </label>
              <input
                id="veh-name"
                type="text"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="Ej. Kenworth T680"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="veh-plate" className="block text-xs font-medium text-slate-700 mb-1">
                Placa
              </label>
              <input
                id="veh-plate"
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="Ej. 77-XY-9A"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label htmlFor="veh-driver" className="block text-xs font-medium text-slate-700 mb-1">
                Operador asignado
              </label>
              <input
                id="veh-driver"
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="veh-imei" className="block text-xs font-medium text-slate-700 mb-1">
                IMEI Teltonika (15 dígitos)
              </label>
              <input
                id="veh-imei"
                type="text"
                value={imei}
                onChange={(e) => setImei(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label htmlFor="veh-class" className="block text-xs font-medium text-slate-700 mb-1">
                Clase
              </label>
              <select
                id="veh-class"
                value={vehicleClass}
                onChange={(e) => setVehicleClass(e.target.value as VehicleClass)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="tractocamion">Tractocamión</option>
                <option value="torton">Torton</option>
                <option value="rabon">Rabón</option>
                <option value="van_electrica">Van Eléctrica</option>
              </select>
            </div>
            <div>
              <label htmlFor="veh-fuel" className="block text-xs font-medium text-slate-700 mb-1">
                Tren motriz
              </label>
              <select
                id="veh-fuel"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as FuelType)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="DIESEL">Diésel Euro VI</option>
                <option value="HYBRID">Híbrido</option>
                <option value="LNG">Gas Natural (LNG)</option>
                <option value="ELECTRIC">Eléctrico 100%</option>
              </select>
            </div>
            <div>
              <label htmlFor="veh-payload" className="block text-xs font-medium text-slate-700 mb-1">
                Capacidad (ton)
              </label>
              <input
                id="veh-payload"
                type="number"
                value={maxPayload}
                onChange={(e) => setMaxPayload(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label htmlFor="veh-odo" className="block text-xs font-medium text-slate-700 mb-1">
                Odómetro inicial (km)
              </label>
              <input
                id="veh-odo"
                type="number"
                value={odometerKm}
                onChange={(e) => setOdometerKm(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
            >
              Vincular Unidad y Activar Telemetría
            </button>
          </div>
        </form>
      )}

      {/* Fleet List + Selected Teltonika Telemetry & Maintenance Logbook */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {fleet.map((v) => {
            const maint = evaluateMaintenanceStatus(v, new Date().toISOString());
            const selected = v.id === selectedVehicle?.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVehicleId(v.id)}
                className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                  selected
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div
                      className={`text-xs font-mono ${
                        selected ? 'text-emerald-300' : 'text-slate-500'
                      }`}
                    >
                      {v.plate} · {v.fuelType} · {v.maxPayloadTons} t
                    </div>
                    <div className="font-display text-sm font-semibold mt-0.5">
                      {v.unitName}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                      maint.level === 'critical'
                        ? selected
                          ? 'text-red-300'
                          : 'text-red-700'
                        : maint.level === 'warning'
                          ? selected
                            ? 'text-amber-300'
                            : 'text-amber-700'
                          : selected
                            ? 'text-emerald-300'
                            : 'text-emerald-700'
                    }`}
                  >
                    {maint.level === 'nominal' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {maint.level === 'critical'
                      ? 'Servicio vencido'
                      : maint.level === 'warning'
                        ? 'Servicio próximo'
                        : 'Al día'}
                  </span>
                </div>

                <div
                  className={`mt-2.5 flex items-center justify-between text-xs ${
                    selected ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  <span className="truncate">{v.currentLocationLabel}</span>
                  <span className="font-mono tabular-nums shrink-0 ml-2">
                    {v.teltonika.odometerKm.toLocaleString('en-US')} km
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {selectedVehicle && (
          <div className="lg:col-span-7 space-y-5">
            {/* Teltonika Hardware Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Truck className="w-4 h-4 text-slate-700" />
                    <span>{selectedVehicle.teltonika.deviceModel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">IMEI {selectedVehicle.teltonika.imei}</span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-900 mt-1">
                    {selectedVehicle.unitName} ({selectedVehicle.driverName})
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <ShieldCheck className="w-4 h-4" />
                  Integridad GPS Hardware Activa
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500 block">Odómetro CAN-bus</span>
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {selectedVehicle.teltonika.odometerKm.toLocaleString('en-US')} km
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Nivel Combustible / Batería</span>
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {selectedVehicle.teltonika.fuelLevelPct}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Rendimiento Real</span>
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {selectedVehicle.teltonika.canFuelRateLPer100Km}{' '}
                    {selectedVehicle.fuelType === 'ELECTRIC' ? 'kWh/100km' : 'L/100km'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Satélites / Horas Motor</span>
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {selectedVehicle.teltonika.satellites} sat · {selectedVehicle.teltonika.engineHours} h
                  </span>
                </div>
              </div>
            </div>

            {/* Real HTTP / WebSocket Teltonika Gateway Panel */}
            <div className="bg-slate-900 text-slate-100 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Radio className="w-4 h-4" />
                    Gateway HTTP / WebSocket Teltonika ({wsConnected ? 'Conectado' : 'Reconectando'})
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Conecta tu servidor FOTA Web, Traccar o forwarder Codec 8E hacia este endpoint en vivo:
                  </p>
                </div>
                <button
                  type="button"
                  disabled={webhookSending}
                  onClick={handleSendWebhookPacket}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  {webhookSending ? 'Transmitiendo...' : 'Enviar Paquete HTTP Teltonika'}
                </button>
              </div>
              <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-[11px] font-mono text-slate-300 overflow-x-auto">
{`POST ${originUrl}/api/telemetry/teltonika
{ "imei": "${selectedVehicle.teltonika.imei}", "lat": ${(selectedVehicle.currentPosition.lat + 0.015).toFixed(4)}, "lng": ${(selectedVehicle.currentPosition.lng - 0.012).toFixed(4)}, "speedKmh": 78, "odometerKm": ${selectedVehicle.teltonika.odometerKm + 12}, "fuelLevelPct": ${Math.max(10, selectedVehicle.teltonika.fuelLevelPct - 1)} }`}
              </pre>
            </div>

            {/* Maintenance Logbook */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-slate-700" />
                    Bitácora de Mantenciones Preventivas y Correctivas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {evaluateMaintenanceStatus(selectedVehicle, new Date().toISOString()).reason}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMaintForm((v) => !v)}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  + Registrar Mantención
                </button>
              </div>

              {showMaintForm && (
                <form
                  onSubmit={handleMaintSubmit}
                  className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3"
                >
                  {maintError && (
                    <div className="rounded bg-red-50 border border-red-200 p-2.5 text-xs text-red-800">
                      {maintError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="mnt-type" className="block text-xs font-medium text-slate-700 mb-1">
                        Tipo
                      </label>
                      <select
                        id="mnt-type"
                        value={maintType}
                        onChange={(e) =>
                          setMaintType(e.target.value as 'preventive' | 'corrective')
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                      >
                        <option value="preventive">Preventiva</option>
                        <option value="corrective">Correctiva</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="mnt-cost" className="block text-xs font-medium text-slate-700 mb-1">
                        Costo (USD)
                      </label>
                      <input
                        id="mnt-cost"
                        type="number"
                        value={maintCost}
                        onChange={(e) => setMaintCost(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="mnt-next" className="block text-xs font-medium text-slate-700 mb-1">
                        Próximo servicio (km)
                      </label>
                      <input
                        id="mnt-next"
                        type="number"
                        value={maintNextKm}
                        onChange={(e) => setMaintNextKm(e.target.value)}
                        placeholder={String(selectedVehicle.teltonika.odometerKm + 20000)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="mnt-title" className="block text-xs font-medium text-slate-700 mb-1">
                      Descripción del servicio
                    </label>
                    <input
                      id="mnt-title"
                      type="text"
                      value={maintTitle}
                      onChange={(e) => setMaintTitle(e.target.value)}
                      placeholder="Ej. Cambio de aceite, filtros y alineación de ejes"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="mnt-notes" className="block text-xs font-medium text-slate-700 mb-1">
                      Notas técnicas
                    </label>
                    <input
                      id="mnt-notes"
                      type="text"
                      value={maintNotes}
                      onChange={(e) => setMaintNotes(e.target.value)}
                      placeholder="Observaciones de taller y diagnóstico OBD-II"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowMaintForm(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Guardar en Bitácora
                    </button>
                  </div>
                </form>
              )}

              {selectedVehicle.maintenanceHistory.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                  Sin registros históricos de taller aún. La telemetría Teltonika monitorea intervalos de servicio automáticamente.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Fecha</th>
                        <th className="py-2 pr-3 font-medium">Tipo / Servicio</th>
                        <th className="py-2 pr-3 font-medium text-right">Odómetro</th>
                        <th className="py-2 font-medium text-right">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedVehicle.maintenanceHistory.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                            {new Date(rec.dateIso).toLocaleDateString('es-MX')}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="font-medium text-slate-900">
                              {rec.type === 'preventive' ? 'Preventiva' : 'Correctiva'} · {rec.title}
                            </div>
                            <div className="text-[11px] text-slate-500">{rec.technicianNotes}</div>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                            {rec.odometerAtServiceKm.toLocaleString('en-US')} km
                          </td>
                          <td className="py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            ${rec.costUsd.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
