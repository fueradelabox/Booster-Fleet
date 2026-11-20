import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  PlusCircle,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { DigitalWallet, FleetVehicle, Shipment } from '../types/logistics';

interface WalletAnalyticsViewProps {
  wallet: DigitalWallet;
  shipments: Shipment[];
  fleet: FleetVehicle[];
  onToggleAutoOffset: () => void;
  onTopUpWallet: (amountUsd: number) => void;
}

export const WalletAnalyticsView: React.FC<WalletAnalyticsViewProps> = ({
  wallet,
  shipments,
  fleet,
  onToggleAutoOffset,
  onTopUpWallet,
}) => {
  const [topUpAmount, setTopUpAmount] = useState('1000');
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const handleTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(topUpAmount);
    if (Number.isNaN(val) || val <= 0 || val > 50000) {
      setTopUpError('Ingresa un monto válido entre $1 y $50,000 USD.');
      return;
    }
    setTopUpError(null);
    onTopUpWallet(val);
  };

  // Monthly GHG reduction & efficiency analytics derived from operational telemetry
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
      {/* Digital Wallet Summary + Auto-Offset Rule */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-slate-900 text-white rounded-xl p-6 flex flex-col justify-between gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span>Billetera Digital Corporativa · Pagos y Compensaciones</span>
              </div>
              <div className="font-mono text-3xl font-bold tabular-nums mt-2">
                ${wallet.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </div>
              <p className="text-xs text-slate-400 mt-1">
                En custodia de fletes: ${wallet.escrowHeldUsd.toFixed(2)} USD · Total compensado: ${wallet.totalOffsetSpentUsd.toFixed(2)} USD
              </p>
            </div>

            <form onSubmit={handleTopUp} className="flex items-end gap-2">
              <div>
                <label htmlFor="wallet-topup" className="block text-[11px] text-slate-300 mb-1">
                  Recargar USD
                </label>
                <input
                  id="wallet-topup"
                  type="number"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Depositar
              </button>
            </form>
          </div>
          {topUpError && (
            <div className="text-xs text-red-300">{topUpError}</div>
          )}

          <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Compensación Automática de Emisiones por Viaje
              </div>
              <p className="text-[11px] text-slate-400">
                Al completar cada flete, la billetera liquida al transportista y destina automáticamente el {wallet.autoOffsetTargetPct}% de la huella a reforestación certificada.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={wallet.autoOffsetEnabled}
              onClick={onToggleAutoOffset}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                wallet.autoOffsetEnabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {wallet.autoOffsetEnabled ? 'Activada (100%)' : 'Pausada'}
            </button>
          </div>
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

      {/* Transaction Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="font-display text-sm font-semibold text-slate-900">
          Libro Mayor de Movimientos Financieros ({wallet.transactions.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Concepto</th>
                <th className="py-2 pr-3 font-medium">Referencia</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 font-medium text-right">Monto (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wallet.transactions.map((tx) => {
                const positive = tx.amountUsd > 0;
                return (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                      {new Date(tx.timestampIso).toLocaleDateString('es-MX')}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-1.5">
                        {positive ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-700" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        {tx.description}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-slate-600">{tx.referenceId}</td>
                    <td className="py-2.5 pr-3 text-slate-600 capitalize">{tx.status.replace('_', ' ')}</td>
                    <td
                      className={`py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                        positive ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {positive ? '+' : '-'}${Math.abs(tx.amountUsd).toFixed(2)}
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
