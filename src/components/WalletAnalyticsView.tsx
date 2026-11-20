import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  FileCheck2,
  PlusCircle,
  ShieldCheck,
} from 'lucide-react';
import type {
  FleetVehicle,
  SettlementLedger,
  SettlementStatus,
  Shipment,
} from '../types/logistics';
import { formatPaymentTermsLabel } from '../utils/logisticsEngine';

interface WalletAnalyticsViewProps {
  ledger: SettlementLedger;
  shipments: Shipment[];
  fleet: FleetVehicle[];
  onToggleAutoOffset: () => void;
  onAllocateEsgBudget: (amountUsd: number, reference: string) => void;
  onRecordExternalSettlement: (params: {
    shipment: Shipment;
    settlementStatus: SettlementStatus;
    invoiceFolio: string;
    externalPaymentRef: string;
  }) => Promise<void>;
}

export const WalletAnalyticsView: React.FC<WalletAnalyticsViewProps> = ({
  ledger,
  shipments,
  fleet,
  onToggleAutoOffset,
  onAllocateEsgBudget,
  onRecordExternalSettlement,
}) => {
  const [budgetAmount, setBudgetAmount] = useState('500');
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const [selectedShipId, setSelectedShipId] = useState<string>(
    shipments[0]?.id ?? ''
  );
  const [invoiceFolio, setInvoiceFolio] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [nextSettlementStatus, setNextSettlementStatus] =
    useState<SettlementStatus>('facturado_por_cobrar');
  const [submittingSettlement, setSubmittingSettlement] = useState(false);

  const handleAllocateBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(budgetAmount);
    if (Number.isNaN(val) || val <= 0 || val > 50000) {
      setBudgetError('Ingresa un monto válido entre $1 y $50,000 USD.');
      return;
    }
    setBudgetError(null);
    onAllocateEsgBudget(val, `ESG-${Date.now().toString().slice(-6)}`);
  };

  const handleSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = shipments.find((s) => s.id === selectedShipId) ?? shipments[0];
    if (!target) return;
    setSubmittingSettlement(true);
    try {
      await onRecordExternalSettlement({
        shipment: target,
        settlementStatus: nextSettlementStatus,
        invoiceFolio: invoiceFolio.trim(),
        externalPaymentRef: externalRef.trim(),
      });
      setInvoiceFolio('');
      setExternalRef('');
    } finally {
      setSubmittingSettlement(false);
    }
  };

  const monthlySeries = useMemo(
    () => [
      { month: 'Jul', emittedKg: 1420, savedKg: 185 },
      { month: 'Ago', emittedKg: 1310, savedKg: 240 },
      { month: 'Sep', emittedKg: 1180, savedKg: 310 },
      { month: 'Oct', emittedKg: 1050, savedKg: 390 },
      {
        month: 'Nov',
        emittedKg: Math.round(shipments.reduce((a, s) => a + s.co2Kg, 0)),
        savedKg: Math.round(
          shipments.reduce((a, s) => a + s.ecoRouteSavedCo2Kg, 0) +
            shipments
              .filter((s) => s.offsetCompleted)
              .reduce((a, s) => a + s.co2Kg, 0)
        ),
      },
    ],
    [shipments]
  );

  const maxBarValue = Math.max(
    ...monthlySeries.map((m) => Math.max(m.emittedKg, m.savedKg)),
    100
  );

  const backhaulSharePct = useMemo(() => {
    if (shipments.length === 0) return 0;
    const count = shipments.filter((s) => s.mode === 'ruta_vacia').length;
    return Math.round((count / shipments.length) * 100);
  }, [shipments]);

  return (
    <div className="space-y-6">
      {/* Off-Platform Commercial Terms Clarification */}
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Liquidación Comercial Fuera de Plataforma (Crédito a Plazo y Transferencia Directa)
          </h2>
          <p className="text-xs text-slate-600">
            Los pagos de fletes se realizan directamente entre Generador y Transportista según sus plazos acordados (15–60 días / Carta Porte / SPEI). TerraCarga registra trazabilidad de facturas y gestiona el presupuesto ESG de carbono.
          </p>
        </div>
        <div className="flex items-center gap-5 text-xs shrink-0">
          <div>
            <span className="text-slate-500 block">Por cobrar / plazo</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              ${ledger.pendingReceivablesUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Liquidado externo</span>
            <span className="font-mono font-semibold text-emerald-700 tabular-nums">
              ${ledger.settledExternalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </span>
          </div>
        </div>
      </section>

      {/* ESG Budget + Off-Platform Settlement Recording + Analytics */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-5">
          {/* Corporate ESG Carbon Budget Card */}
          <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col justify-between gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Fondo Corporativo para Bonos de Carbono (ESG)</span>
                </div>
                <div className="font-mono text-3xl font-bold tabular-nums mt-2">
                  ${ledger.esgBudgetUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Total compensado acumulado: ${ledger.totalOffsetSpentUsd.toFixed(2)} USD
                </p>
              </div>

              <form onSubmit={handleAllocateBudget} className="flex items-end gap-2">
                <div>
                  <label htmlFor="esg-budget-add" className="block text-[11px] text-slate-300 mb-1">
                    Asignar Presupuesto ESG
                  </label>
                  <input
                    id="esg-budget-add"
                    type="number"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Asignar
                </button>
              </form>
            </div>
            {budgetError && (
              <div className="text-xs text-red-300">{budgetError}</div>
            )}

            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-white">
                  Compensación ESG Automática por Embarque
                </div>
                <p className="text-[11px] text-slate-400">
                  Reserva automáticamente el {ledger.autoOffsetTargetPct}% de la huella verificada para retiro en proyectos Verra VCS / Gold Standard.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={ledger.autoOffsetEnabled}
                onClick={onToggleAutoOffset}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  ledger.autoOffsetEnabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                {ledger.autoOffsetEnabled ? 'Activada (100%)' : 'Pausada'}
              </button>
            </div>
          </div>

          {/* Record External Invoice / SPEI Transfer */}
          <form
            onSubmit={handleSettlementSubmit}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-700" />
                Registrar Factura / Liquidación Externa (Fuera de Plataforma)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="stl-ship" className="block text-xs font-medium text-slate-700 mb-1">
                  Embarque
                </label>
                <select
                  id="stl-ship"
                  value={selectedShipId}
                  onChange={(e) => setSelectedShipId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  {shipments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · ${s.priceUsd} USD ({formatPaymentTermsLabel(s.paymentTerms)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="stl-status" className="block text-xs font-medium text-slate-700 mb-1">
                  Estado comercial
                </label>
                <select
                  id="stl-status"
                  value={nextSettlementStatus}
                  onChange={(e) =>
                    setNextSettlementStatus(e.target.value as SettlementStatus)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="facturado_por_cobrar">Facturado / Por cobrar a plazo</option>
                  <option value="liquidado_externo">Liquidado por transferencia externa</option>
                </select>
              </div>
              <div>
                <label htmlFor="stl-folio" className="block text-xs font-medium text-slate-700 mb-1">
                  Folio Factura / Carta Porte
                </label>
                <input
                  id="stl-folio"
                  type="text"
                  value={invoiceFolio}
                  onChange={(e) => setInvoiceFolio(e.target.value)}
                  placeholder="Ej. CFDI-2026-8410"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label htmlFor="stl-ref" className="block text-xs font-medium text-slate-700 mb-1">
                  Referencia Transferencia / SPEI
                </label>
                <input
                  id="stl-ref"
                  type="text"
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                  placeholder="Ej. SPEI-9920144"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submittingSettlement}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {submittingSettlement ? 'Guardando...' : 'Registrar Comprobante Externo'}
              </button>
            </div>
          </form>
        </div>

        {/* Operational & ESG Analytics Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Reducción de Gases Efecto Invernadero (GEI)</span>
            </h2>
            <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0">
              kg CO₂e / mes
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {monthlySeries.map((row) => {
              const emittedW = Math.max(8, Math.round((row.emittedKg / maxBarValue) * 100));
              const savedW = Math.max(6, Math.round((row.savedKg / maxBarValue) * 100));
              return (
                <div key={row.month} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{row.month} 2026</span>
                    <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                      Bruto {row.emittedKg} kg · Mitigado {row.savedKg} kg
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 rounded bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-slate-800 rounded"
                        style={{ width: `${emittedW}%` }}
                      />
                    </div>
                    <div className="h-2 rounded bg-emerald-50 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded"
                        style={{ width: `${savedW}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">Aprovechamiento Retorno</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {backhaulSharePct}% rutas vacías cubiertas
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Flota Baja Emisión</span>
              <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                {fleet.filter((v) => v.fuelType !== 'DIESEL').length} / {fleet.length} unidades
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Settlement & ESG Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="font-display text-sm font-semibold text-slate-900">
          Registro de Acuerdos Comerciales, Facturas y Retiros ESG ({ledger.records.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Concepto</th>
                <th className="py-2 pr-3 font-medium">Plazo / Referencia</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 font-medium text-right">Monto (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.records.map((rec) => {
                const positive = rec.amountUsd > 0;
                return (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                      {new Date(rec.timestampIso).toLocaleDateString('es-MX')}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-1.5">
                        {positive ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-700" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        {rec.description}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">
                      <span>{formatPaymentTermsLabel(rec.paymentTerms)}</span>
                      {(rec.invoiceFolio || rec.externalRef) && (
                        <span className="block font-mono text-[11px] text-slate-500">
                          {[rec.invoiceFolio, rec.externalRef].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 capitalize">
                      {rec.status.replace(/_/g, ' ')}
                    </td>
                    <td
                      className={`py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                        positive ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {positive ? '+' : '-'}${Math.abs(rec.amountUsd).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
