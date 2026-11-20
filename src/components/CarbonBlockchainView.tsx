import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Leaf,
  Lock,
  ShieldCheck,
  Trees,
} from 'lucide-react';
import type {
  BlockchainCertificate,
  ReforestationProject,
  Shipment,
} from '../types/logistics';
import { CARBON_PRICE_PER_TON_USD } from '../utils/logisticsEngine';

interface CarbonBlockchainViewProps {
  shipments: Shipment[];
  projects: ReforestationProject[];
  certificates: BlockchainCertificate[];
  walletBalanceUsd: number;
  onOffsetShipment: (shipmentId: string, projectId: string) => void;
}

export const CarbonBlockchainView: React.FC<CarbonBlockchainViewProps> = ({
  shipments,
  projects,
  certificates,
  walletBalanceUsd,
  onOffsetShipment,
}) => {
  const uncompensatedShipments = useMemo(
    () => shipments.filter((s) => !s.offsetCompleted),
    [shipments]
  );

  const [selectedShipmentId, setSelectedShipmentId] = useState<string>(
    uncompensatedShipments[0]?.id ?? shipments[0]?.id ?? ''
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ''
  );
  const [previewCert, setPreviewCert] = useState<BlockchainCertificate | null>(
    certificates[0] ?? null
  );

  const selectedShipment = useMemo(
    () =>
      uncompensatedShipments.find((s) => s.id === selectedShipmentId) ??
      uncompensatedShipments[0] ??
      null,
    [uncompensatedShipments, selectedShipmentId]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId]
  );

  const totalCo2Kg = useMemo(
    () => shipments.reduce((acc, s) => acc + s.co2Kg, 0),
    [shipments]
  );
  const compensatedCo2Kg = useMemo(
    () =>
      certificates.reduce((acc, c) => acc + c.co2CompensatedKg, 0),
    [certificates]
  );

  const offsetCostUsd = useMemo(() => {
    if (!selectedShipment || !selectedProject) return 0;
    const tons = selectedShipment.co2Kg / 1000;
    return Number(
      Math.max(0.5, tons * (selectedProject.pricePerTonUsd || CARBON_PRICE_PER_TON_USD)).toFixed(2)
    );
  }, [selectedShipment, selectedProject]);

  const downloadCertificateJson = (cert: BlockchainCertificate) => {
    const payload = {
      plataforma: 'TerraCarga Logística Carbono Neutral',
      certificado: cert.certificateCode,
      estandar: cert.standard,
      envio: cert.shipmentCode,
      vehiculo: cert.vehiclePlate,
      telemetriaTeltonikaIMEI: cert.teltonikaImei,
      distanciaKm: cert.distanceKm,
      combustibleLitros: cert.fuelConsumedLiters,
      co2CompensadoKg: cert.co2CompensatedKg,
      proyectoReforestacion: cert.projectName,
      montoCompensadoUSD: cert.offsetCostUsd,
      blockchainBlock: cert.blockNumber,
      blockchainTxHash: cert.txHash,
      fechaEmision: cert.issuedAtIso,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cert.certificateCode}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* GHG KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Emisiones Brutas Medidas (Scope 1/3)</div>
          <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {totalCo2Kg.toFixed(1)} kg CO₂e
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Calculado con kilometraje Teltonika y flujo CAN-bus
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">CO₂e Compensado en Blockchain</div>
          <div className="font-mono text-2xl font-semibold text-emerald-700 tabular-nums mt-1">
            {compensatedCo2Kg.toFixed(1)} kg CO₂e
          </div>
          <div className="text-xs text-emerald-700 mt-1">
            {certificates.length} certificados inmutables emitidos
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Saldo Disponible en Billetera</div>
          <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            ${walletBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Debitado automáticamente al confirmar compensación
          </div>
        </div>
      </section>

      {/* Interactive Carbon Offset & Reforestation Selector */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 flex items-center gap-2">
              <Trees className="w-4 h-4 text-emerald-700" />
              Compensar Emisiones con Proyectos de Reforestación Certificados
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Selecciona un embarque auditado por GPS Teltonika y un proyecto Verra VCS / Gold Standard para emitir un certificado ESG verificable.
            </p>
          </div>

          {uncompensatedShipments.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-1.5">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 mx-auto" />
              <div className="text-sm font-semibold text-emerald-950">
                100% de los embarques actuales han sido compensados
              </div>
              <p className="text-xs text-emerald-800">
                Tu operación logística actual cuenta con trazabilidad carbono neutral completa en Blockchain.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="offset-shipment-select"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Embarque a compensar
                </label>
                <select
                  id="offset-shipment-select"
                  value={selectedShipment?.id ?? ''}
                  onChange={(e) => setSelectedShipmentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {uncompensatedShipments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.originName} → {s.destinationName} ({s.co2Kg} kg CO₂e)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2.5">
                <span className="block text-xs font-medium text-slate-700">
                  Proyecto forestal certificado
                </span>
                <div className="grid grid-cols-1 gap-2.5">
                  {projects.map((proj) => {
                    const active = proj.id === selectedProject?.id;
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => setSelectedProjectId(proj.id)}
                        className={`w-full text-left rounded-lg border p-3.5 transition-colors cursor-pointer ${
                          active
                            ? 'border-emerald-700 bg-emerald-50/70'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs text-slate-500">
                              {proj.standard} · {proj.registryCode} · {proj.region}, {proj.country}
                            </div>
                            <div className="font-display text-sm font-semibold text-slate-900 mt-0.5">
                              {proj.name}
                            </div>
                          </div>
                          <span className="font-mono text-xs font-semibold text-emerald-800 tabular-nums shrink-0">
                            ${proj.pricePerTonUsd.toFixed(2)}/t CO₂e
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {proj.species} · {proj.coBenefit}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedShipment && selectedProject && (
                <div className="rounded-lg bg-slate-900 text-white p-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-300">
                      Compensación total ({selectedShipment.co2Kg} kg CO₂e)
                    </div>
                    <div className="font-mono text-xl font-bold tabular-nums">
                      ${offsetCostUsd.toFixed(2)} USD
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOffsetShipment(selectedShipment.id, selectedProject.id)
                    }
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Leaf className="w-4 h-4" />
                    Compensar y Emitir Certificado Blockchain
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Certificate Inspector */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-700" />
              Certificado Verificable en Blockchain
            </h3>
            {previewCert && (
              <button
                type="button"
                onClick={() => downloadCertificateJson(previewCert)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar ESG
              </button>
            )}
          </div>

          {previewCert ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div>
                  <div className="text-[11px] text-slate-500">Código Certificado</div>
                  <div className="font-mono text-sm font-bold text-slate-900">
                    {previewCert.certificateCode}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  Auditado
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="text-slate-500 block">Embarque / Placa</span>
                  <span className="font-mono font-medium text-slate-900">
                    {previewCert.shipmentCode} · {previewCert.vehiclePlate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">IMEI Teltonika</span>
                  <span className="font-mono font-medium text-slate-900">
                    {previewCert.teltonikaImei}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Distancia / Combustible</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {previewCert.distanceKm} km · {previewCert.fuelConsumedLiters} L
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">CO₂e Compensado</span>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    {previewCert.co2CompensatedKg} kg CO₂e
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1">
                <div className="text-slate-500">Proyecto de Reforestación</div>
                <div className="font-medium text-slate-900">
                  {previewCert.projectName} ({previewCert.standard})
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1">
                <div className="flex justify-between text-slate-500">
                  <span>Bloque #{previewCert.blockNumber}</span>
                  <span className="font-mono">
                    {new Date(previewCert.issuedAtIso).toLocaleDateString('es-MX')}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-700 break-all bg-white border border-slate-200 rounded p-2">
                  {previewCert.txHash}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
              Aún no hay certificados emitidos.
            </div>
          )}
        </div>
      </section>

      {/* Immutable Ledger Table */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="font-display text-sm font-semibold text-slate-900">
          Registro Público de Trazabilidad Blockchain ({certificates.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Certificado</th>
                <th className="py-2 pr-3 font-medium">Envío / Unidad</th>
                <th className="py-2 pr-3 font-medium">Proyecto</th>
                <th className="py-2 pr-3 font-medium text-right">CO₂e (kg)</th>
                <th className="py-2 pr-3 font-medium">Tx Hash</th>
                <th className="py-2 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {certificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                    {cert.certificateCode}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <span className="font-mono">{cert.shipmentCode}</span> · {cert.vehiclePlate}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-700">{cert.projectName}</td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                    {cert.co2CompensatedKg.toFixed(1)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-slate-500">
                    {cert.txHash.slice(0, 14)}...{cert.txHash.slice(-6)}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setPreviewCert(cert)}
                      className="text-xs font-semibold text-slate-900 underline hover:text-emerald-700 cursor-pointer"
                    >
                      Inspeccionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
