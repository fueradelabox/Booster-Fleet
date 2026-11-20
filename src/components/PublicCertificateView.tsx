import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Leaf,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import type { BlockchainCertificate } from '../types/logistics';
import { fetchPublicCertificateByCode } from '../services/firestoreSync';

interface PublicCertificateViewProps {
  certCode: string;
  onBackToApp: () => void;
}

export const PublicCertificateView: React.FC<PublicCertificateViewProps> = ({
  certCode,
  onBackToApp,
}) => {
  const [loading, setLoading] = useState(true);
  const [cert, setCert] = useState<BlockchainCertificate | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPublicCertificateByCode(certCode)
      .then((found) => {
        if (active) setCert(found);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [certCode]);

  const handleVerifyCryptographicProof = async () => {
    if (!cert) return;
    setVerifyResult('Verificando integridad...');
    try {
      const res = await fetch('/api/blockchain/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: cert.txHash,
          signature: cert.signature,
          signerAddress: cert.signerAddress,
          digest: cert.txHash,
        }),
      });
      const data = await res.json();
      setVerifyResult(
        data.verified
          ? `Verificación criptográfica válida (${data.mode}${data.recoveredAddress ? ` · Firmante ${data.recoveredAddress.slice(0, 10)}...` : ''})`
          : 'No fue posible validar la firma en este nodo.'
      );
    } catch {
      setVerifyResult('Error de red al verificar.');
    }
  };

  const handleDownloadJson = () => {
    if (!cert) return;
    const blob = new Blob([JSON.stringify(cert, null, 2)], {
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
    <div className="min-h-screen bg-[#F5F7F6] text-slate-900 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={onBackToApp}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a TerraCarga
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <Leaf className="h-4 w-4" />
            Registro Público Verificable ESG
          </span>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            Consultando certificado {certCode} en Firestore...
          </div>
        ) : !cert ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-10 text-center">
            <p className="text-base font-bold text-slate-900">
              Certificado no encontrado ({certCode})
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Verifica el código o solicita al emisor el enlace actualizado.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="bg-[#0D1F1B] text-white p-6 sm:p-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  Certificado de Compensación de Carbono
                </div>
                <h1 className="text-2xl font-bold font-mono mt-1">
                  {cert.certificateCode}
                </h1>
                <p className="text-xs text-slate-300 mt-1">
                  Embarque {cert.shipmentCode} · Emitido{' '}
                  {new Date(cert.issuedAtIso).toLocaleString('es-MX')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400">Huella Compensada</p>
                <p className="text-3xl font-bold font-mono tabular-nums text-emerald-400">
                  {cert.co2CompensatedKg.toFixed(1)} kg CO₂e
                </p>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-slate-500">Proyecto de Reforestación</p>
                  <p className="font-semibold text-slate-950 mt-0.5">
                    {cert.projectName}
                  </p>
                  <p className="text-slate-600 mt-0.5">{cert.standard}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-slate-500 inline-flex items-center gap-1">
                    <Radio className="h-3.5 w-3.5 text-emerald-700" />
                    Evidencia Telemetría Teltonika
                  </p>
                  <p className="font-mono font-semibold text-slate-950 mt-0.5">
                    IMEI {cert.teltonikaImei}
                  </p>
                  <p className="text-slate-600 mt-0.5">
                    Placa {cert.vehiclePlate} · {cert.distanceKm} km ·{' '}
                    {cert.fuelConsumedLiters} L
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    Prueba Blockchain y Registro de Carbono
                  </span>
                  <span className="font-semibold text-emerald-700">
                    {cert.networkName}
                  </span>
                </div>
                <div className="font-mono text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2.5 break-all text-slate-700">
                  Hash / Tx: {cert.txHash}
                </div>
                {cert.signerAddress && (
                  <p className="text-[11px] text-slate-500 font-mono break-all">
                    Firmante ECDSA: {cert.signerAddress}
                  </p>
                )}
                {cert.registryProvider && (
                  <p className="text-[11px] text-slate-600">
                    Registro: {cert.registryProvider}
                    {cert.registryOrderId ? ` · Orden ${cert.registryOrderId}` : ''} ·{' '}
                    <span className="font-semibold">
                      {cert.registryStatus === 'retired_verified'
                        ? 'Retiro Verificado'
                        : 'Reserva Corporativa Pendiente de API'}
                    </span>
                  </p>
                )}
              </div>

              {verifyResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{verifyResult}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleVerifyCryptographicProof}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verificar Prueba Criptográfica
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar JSON ESG
                </button>
                {cert.explorerUrl && (
                  <a
                    href={cert.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Ver en Explorador EVM
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
