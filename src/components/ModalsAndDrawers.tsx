import React, { useMemo, useState } from 'react';
import {
  BellRing,
  Check,
  Headphones,
  Leaf,
  Send,
  X,
} from 'lucide-react';
import type {
  FuelType,
  LatLngLiteral,
  PaymentTerms,
  PushNotificationItem,
  ShipmentMode,
  SupportTicket,
} from '../types/logistics';
import {
  calculateCarbonFootprint,
  calculateSpotFreightPrice,
} from '../utils/logisticsEngine';
import { PlaceAutocompleteInput } from './PlaceAutocompleteInput';

function haversineKm(a: LatLngLiteral, b: LatLngLiteral): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return Math.max(15, Math.round(2 * R * Math.atan2(Math.sqrt(s1), Math.sqrt(1 - s1)) * 1.24));
}

interface NewLoadModalProps {
  open: boolean;
  mapsAvailable: boolean;
  defaultShipperName?: string;
  onClose: () => void;
  onCreateLoad: (payload: {
    title: string;
    cargoType: string;
    mode: ShipmentMode;
    paymentTerms: PaymentTerms;
    shipperName: string;
    originName: string;
    originCoords: LatLngLiteral;
    destinationName: string;
    destinationCoords: LatLngLiteral;
    distanceKm: number;
    payloadTons: number;
    fuelType: FuelType;
    priceUsd: number;
    backhaulDiscountPct: number;
    co2Kg: number;
    ecoRouteSavedCo2Kg: number;
    estimatedFuelLiters: number;
    scheduledDateIso: string;
  }) => void;
}

export const NewLoadModal: React.FC<NewLoadModalProps> = ({
  open,
  mapsAvailable,
  defaultShipperName,
  onClose,
  onCreateLoad,
}) => {
  const [title, setTitle] = useState('');
  const [cargoType, setCargoType] = useState('');
  const [shipperName, setShipperName] = useState(
    defaultShipperName || 'Distribuidora Centro'
  );
  const [mode, setMode] = useState<ShipmentMode>('spot');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('credito_30');
  const [originName, setOriginName] = useState('Ciudad de México, CDMX');
  const [originCoords, setOriginCoords] = useState<LatLngLiteral>({
    lat: 19.4326,
    lng: -99.1332,
  });
  const [destinationName, setDestinationName] = useState('Querétaro, QRO');
  const [destinationCoords, setDestinationCoords] = useState<LatLngLiteral>({
    lat: 20.5888,
    lng: -100.3899,
  });
  const [payloadTons, setPayloadTons] = useState('16');
  const [fuelType, setFuelType] = useState<FuelType>('DIESEL');
  const [scheduledDate, setScheduledDate] = useState('2026-11-21');
  const [error, setError] = useState<string | null>(null);

  const distanceKm = useMemo(
    () => haversineKm(originCoords, destinationCoords),
    [originCoords, destinationCoords]
  );

  const tonsNum = Math.max(1, Number(payloadTons) || 1);
  const backhaulDiscountPct = mode === 'ruta_vacia' ? 22 : 0;

  const pricePreview = useMemo(
    () =>
      calculateSpotFreightPrice({
        distanceKm,
        payloadTons: tonsNum,
        urgency: mode === 'programada' ? 'programada' : 'inmediata',
        backhaulDiscountPct,
      }),
    [distanceKm, tonsNum, mode, backhaulDiscountPct]
  );

  const carbonPreview = useMemo(
    () =>
      calculateCarbonFootprint({
        distanceKm,
        fuelType,
        payloadTons: tonsNum,
        trafficDelayPct: 12,
      }),
    [distanceKm, fuelType, tonsNum]
  );

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !cargoType.trim() || !originName.trim() || !destinationName.trim()) {
      setError('Completa el título, tipo de carga, origen y destino.');
      return;
    }
    const parsedTons = Number(payloadTons);
    if (Number.isNaN(parsedTons) || parsedTons <= 0 || parsedTons > 45) {
      setError('El peso útil debe estar entre 1 y 45 toneladas.');
      return;
    }

    setError(null);
    onCreateLoad({
      title: title.trim(),
      cargoType: `${cargoType.trim()} · ${parsedTons} t`,
      mode,
      paymentTerms,
      shipperName: shipperName.trim() || 'Cliente Corporativo',
      originName: originName.trim(),
      originCoords,
      destinationName: destinationName.trim(),
      destinationCoords,
      distanceKm,
      payloadTons: parsedTons,
      fuelType,
      priceUsd: pricePreview.totalPriceUsd,
      backhaulDiscountPct,
      co2Kg: carbonPreview.co2Kg,
      ecoRouteSavedCo2Kg: carbonPreview.ecoRouteSavedCo2Kg,
      estimatedFuelLiters: carbonPreview.fuelConsumedLiters,
      scheduledDateIso: new Date(`${scheduledDate}T10:00:00Z`).toISOString(),
    });
    setTitle('');
    setCargoType('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-load-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="new-load-modal-title" className="font-display text-base font-semibold text-slate-900">
              Publicar Nueva Solicitud de Carga
            </h2>
            <p className="text-xs text-slate-500">
              Tarifa referencial, plazos de pago externo y cálculo de huella CO₂e
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="load-title" className="block text-xs font-medium text-slate-700 mb-1">
                Título del envío
              </label>
              <input
                id="load-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Carga Industrial Paletizada"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="load-cargo" className="block text-xs font-medium text-slate-700 mb-1">
                Tipo de mercancía
              </label>
              <input
                id="load-cargo"
                type="text"
                value={cargoType}
                onChange={(e) => setCargoType(e.target.value)}
                placeholder="Ej. Insumos eléctricos"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PlaceAutocompleteInput
              id="load-origin"
              label="Origen (Google Places)"
              value={originName}
              mapsAvailable={mapsAvailable}
              placeholder="Ciudad o parque industrial..."
              onChangeText={setOriginName}
              onSelectPlace={(p) => {
                setOriginName(p.name);
                setOriginCoords(p.coords);
              }}
            />
            <PlaceAutocompleteInput
              id="load-dest"
              label="Destino (Google Places)"
              value={destinationName}
              mapsAvailable={mapsAvailable}
              placeholder="Ciudad o centro de distribución..."
              onChangeText={setDestinationName}
              onSelectPlace={(p) => {
                setDestinationName(p.name);
                setDestinationCoords(p.coords);
              }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="load-mode" className="block text-xs font-medium text-slate-700 mb-1">
                Modalidad
              </label>
              <select
                id="load-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ShipmentMode)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
              >
                <option value="spot">Spot Inmediata</option>
                <option value="programada">Programada</option>
                <option value="ruta_vacia">Ruta Vacía (-22%)</option>
              </select>
            </div>
            <div>
              <label htmlFor="load-tons" className="block text-xs font-medium text-slate-700 mb-1">
                Peso (ton)
              </label>
              <input
                id="load-tons"
                type="number"
                value={payloadTons}
                onChange={(e) => setPayloadTons(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label htmlFor="load-fuel" className="block text-xs font-medium text-slate-700 mb-1">
                Tren motriz
              </label>
              <select
                id="load-fuel"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as FuelType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
              >
                <option value="DIESEL">Diésel</option>
                <option value="HYBRID">Híbrido</option>
                <option value="LNG">LNG</option>
                <option value="ELECTRIC">Eléctrico</option>
              </select>
            </div>
            <div>
              <label htmlFor="load-date" className="block text-xs font-medium text-slate-700 mb-1">
                Fecha salida
              </label>
              <input
                id="load-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="load-shipper" className="block text-xs font-medium text-slate-700 mb-1">
                Generador de carga
              </label>
              <input
                id="load-shipper"
                type="text"
                value={shipperName}
                onChange={(e) => setShipperName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="load-terms" className="block text-xs font-medium text-slate-700 mb-1">
                Condición de pago (externo)
              </label>
              <select
                id="load-terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
              >
                <option value="contado_entrega">Contado contra entrega</option>
                <option value="credito_15">Crédito 15 días</option>
                <option value="credito_30">Crédito 30 días</option>
                <option value="credito_60">Crédito 60 días</option>
                <option value="factoraje">Factoraje corporativo</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">Distancia estimada</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {distanceKm} km
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Tarifa acordada</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                ${pricePreview.totalPriceUsd.toFixed(2)} USD
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Huella proyectada</span>
              <span className="font-mono font-semibold text-emerald-700 tabular-nums inline-flex items-center gap-1">
                <Leaf className="w-3.5 h-3.5" />
                {carbonPreview.co2Kg} kg CO₂e
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              Publicar en Mercado
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface NotificationsDrawerProps {
  open: boolean;
  notifications: PushNotificationItem[];
  onClose: () => void;
  onMarkAllRead: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  open,
  notifications,
  onClose,
  onMarkAllRead,
}) => {
  const [pushStatus, setPushStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  if (!open) return null;

  const enableBrowserPush = async () => {
    if (typeof Notification === 'undefined') {
      setPushStatus('unsupported');
      return;
    }
    const perm = await Notification.requestPermission();
    setPushStatus(perm);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
      role="dialog"
      aria-modal="true"
      aria-label="Centro de notificaciones push"
    >
      <div className="bg-white w-full max-w-md h-full border-l border-slate-200 flex flex-col shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
              <BellRing className="w-4 h-4 text-emerald-700" />
              Notificaciones Críticas en Tiempo Real
            </h2>
            <p className="text-xs text-slate-500">
              Tráfico, mantenciones Teltonika, rutas vacías y Blockchain
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar notificaciones"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={enableBrowserPush}
            className="font-medium text-slate-700 underline hover:text-emerald-700 cursor-pointer"
          >
            {pushStatus === 'granted'
              ? 'Push del navegador activado'
              : 'Activar alertas push del navegador'}
          </button>
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Marcar leídas
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-4 space-y-2">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg p-3 border ${
                item.read
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-semibold uppercase text-slate-700">
                  {item.category.replace('_', ' ')} · {item.severity}
                </span>
                <span className="font-mono tabular-nums">
                  {new Date(item.timestampIso).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-900 mt-1">
                {item.title}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{item.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface SupportDrawerProps {
  open: boolean;
  tickets: SupportTicket[];
  onClose: () => void;
  onAddTicket: (ticket: SupportTicket) => void;
}

export const SupportDrawer: React.FC<SupportDrawerProps> = ({
  open,
  tickets,
  onClose,
  onAddTicket,
}) => {
  const [subject, setSubject] = useState('');
  const [category, setCategory] =
    useState<SupportTicket['category']>('Teltonika GPS');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !details.trim()) {
      setError('Describe el asunto y detalle técnico del incidente.');
      return;
    }
    setSubmitting(true);
    setError(null);

    let aiSummary: string | undefined;
    try {
      const res = await fetch('/api/ai/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, category, details }),
      });
      const data = await res.json();
      if (res.ok && data.diagnostic) {
        aiSummary = data.diagnostic;
      }
    } catch {
      // Ticket still registers even if AI pre-diagnostic is unavailable
    }

    onAddTicket({
      id: `SUP-${Math.floor(310 + Math.random() * 680)}`,
      createdAtIso: new Date().toISOString(),
      subject: subject.trim(),
      category,
      priority: 'alta',
      status: 'abierto',
      aiDiagnosticSummary:
        aiSummary ??
        'Ticket escalado a mesa de ingeniería 24/7. Tiempo estimado de respuesta: < 10 minutos.',
    });

    setSubject('');
    setDetails('');
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
      role="dialog"
      aria-modal="true"
      aria-label="Soporte técnico 24/7"
    >
      <div className="bg-white w-full max-w-md h-full border-l border-slate-200 flex flex-col shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Headphones className="w-4 h-4 text-emerald-700" />
              Mesa de Soporte Técnico 24/7
            </h2>
            <p className="text-xs text-slate-500">
              Diagnóstico Teltonika, enrutamiento y liquidaciones
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar soporte"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-900">
              Abrir Ticket con Diagnóstico Inmediato
            </h3>
            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="sup-cat" className="block text-xs font-medium text-slate-700 mb-1">
                Área técnica
              </label>
              <select
                id="sup-cat"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as SupportTicket['category'])
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
              >
                <option value="Teltonika GPS">Teltonika GPS / CAN-bus</option>
                <option value="Enrutamiento Maps">Enrutamiento Google Maps</option>
                <option value="Liquidación y Facturas">Liquidación y Facturas</option>
                <option value="Certificado Blockchain">Certificado Blockchain</option>
              </select>
            </div>
            <div>
              <label htmlFor="sup-subj" className="block text-xs font-medium text-slate-700 mb-1">
                Asunto
              </label>
              <input
                id="sup-subj"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ej. Pérdida temporal de señal en tramo montaña"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="sup-det" className="block text-xs font-medium text-slate-700 mb-1">
                Descripción
              </label>
              <textarea
                id="sup-det"
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Incluye placa, IMEI o código de embarque..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {submitting ? 'Generando diagnóstico...' : 'Enviar Ticket 24/7'}
            </button>
          </form>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-700">
              Historial de Casos ({tickets.length})
            </h3>
            {tickets.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-slate-200 p-3.5 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-mono font-semibold text-slate-800">
                    {t.id} · {t.category}
                  </span>
                  <span className="capitalize font-medium text-emerald-700">
                    {t.status}
                  </span>
                </div>
                <div className="font-semibold text-slate-900">{t.subject}</div>
                {t.aiDiagnosticSummary && (
                  <p className="text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2 border border-slate-100">
                    {t.aiDiagnosticSummary}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
