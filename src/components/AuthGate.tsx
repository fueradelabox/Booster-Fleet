import React, { useState } from 'react';
import {
  Leaf,
  LogIn,
  Radio,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import type { UserRole } from '../types/logistics';

interface AuthGateProps {
  loading: boolean;
  authError: string | null;
  onGoogleSignIn: (preferredRole: UserRole, companyName: string) => Promise<void>;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  loading,
  authError,
  onGoogleSignIn,
}) => {
  const [preferredRole, setPreferredRole] = useState<'carrier' | 'shipper'>('carrier');
  const [companyName, setCompanyName] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const handleLogin = async () => {
    setSigningIn(true);
    try {
      await onGoogleSignIn(preferredRole, companyName);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1F1B] text-white flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 rounded-2xl border border-emerald-900/60 bg-[#0F2621] shadow-2xl overflow-hidden">
        {/* Left column: Value proposition */}
        <div className="lg:col-span-6 p-7 sm:p-9 flex flex-col justify-between bg-gradient-to-br from-[#0F2621] via-[#102E27] to-[#0B1D19] border-b lg:border-b-0 lg:border-r border-emerald-900/50">
          <div>
            <div className="flex items-center gap-3 mb-7">
              <div className="h-10 w-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">TerraCarga</h1>
                <p className="text-xs text-emerald-300/80">
                  Logística Inteligente y Carbono Neutral
                </p>
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight text-white">
              Despacho de carga, telemetría Teltonika y compensación ESG verificada
            </h2>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Plataforma operativa con datos persistentes en tiempo real, enrutamiento eco-eficiente Google Maps, acuerdos comerciales a plazo fuera de plataforma y certificación criptográfica en Blockchain.
            </p>
          </div>

          <div className="mt-8 space-y-3 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <Truck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Desde 1 vehículo independiente hasta flotas empresariales</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Radio className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Ingesta HTTP / WebSocket para hardware GPS Teltonika CAN-bus</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Certificados públicos verificables de huella de carbono</span>
            </div>
          </div>
        </div>

        {/* Right column: Sign-in & role profile setup */}
        <div className="lg:col-span-6 p-7 sm:p-9 bg-white text-slate-900 flex flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Acceso Operativo Seguro
          </p>
          <h3 className="text-xl font-bold text-slate-950 mt-1">
            Ingresar a la plataforma MVP
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Selecciona tu perfil operativo inicial. Tus datos, flota y embarques quedan sincronizados en tu cuenta.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-2">
                Perfil de operación
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPreferredRole('carrier')}
                  className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                    preferredRole === 'carrier'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold">Transportista</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Flota 1+, Teltonika y retorno vacío
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPreferredRole('shipper')}
                  className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                    preferredRole === 'shipper'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold">Generador de Carga</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Cargas spot, plazos y reportes ESG
                  </p>
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-company-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Empresa o Razón Social (opcional)
              </label>
              <input
                id="auth-company-input"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ej. Transportes Bajío S.A. de C.V."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            {authError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {authError}
              </div>
            )}

            <button
              type="button"
              disabled={loading || signingIn}
              onClick={handleLogin}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              {loading || signingIn
                ? 'Conectando sesión segura...'
                : 'Continuar con Google'}
            </button>

            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Los acuerdos económicos entre generador y transportista se liquidan externamente (transferencia bancaria / crédito a plazo).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
