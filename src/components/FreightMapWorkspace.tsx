import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Activity,
  BrainCircuit,
  Compass,
  ExternalLink,
  Fuel,
  Leaf,
  Navigation,
  Radio,
  Route as RouteIcon,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type {
  FleetVehicle,
  LatLngLiteral,
  ReforestationProject,
  Shipment,
  UserRole,
} from '../types/logistics';
import {
  calculateCarbonFootprint,
  computePredictiveEta,
  evaluateMaintenanceStatus,
} from '../utils/logisticsEngine';

interface FreightMapWorkspaceProps {
  shipments: Shipment[];
  fleet: FleetVehicle[];
  projects: ReforestationProject[];
  userRole: UserRole;
  mapsAvailable: boolean;
  onSimulateTelemetryPulse: (vehicleId: string) => void;
  onQuickOffsetShipment: (shipmentId: string, projectId: string) => void;
  onNavigateTab: (tab: 'marketplace' | 'fleet' | 'carbon') => void;
}

interface EcoRouteComparison {
  fastestDistanceKm: number;
  fastestDurationMin: number;
  ecoDistanceKm: number;
  ecoDurationMin: number;
  ecoFuelLiters?: number;
  tollCostLabel?: string;
  source: 'routes_api' | 'telemetry_model';
}

interface GroundingLink {
  title: string;
  uri: string;
  snippets?: string[];
}

function TrafficLayerController({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.TrafficLayer) {
      return;
    }
    if (!trafficLayerRef.current) {
      trafficLayerRef.current = new google.maps.TrafficLayer();
    }
    trafficLayerRef.current.setMap(enabled ? map : null);
    return () => {
      trafficLayerRef.current?.setMap(null);
    };
  }, [map, enabled]);

  return null;
}

function ActiveRoutePolyline({
  origin,
  destination,
  ecoMode,
  onRouteComputed,
}: {
  origin: LatLngLiteral;
  destination: LatLngLiteral;
  ecoMode: boolean;
  onRouteComputed: (summary: Partial<EcoRouteComparison>, notice?: string) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    let cancelled = false;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const drawFallbackLine = () => {
      if (cancelled) return;
      const fallback = new google.maps.Polyline({
        path: [origin, destination],
        geodesic: true,
        strokeColor: ecoMode ? '#16A34A' : '#2563EB',
        strokeOpacity: 0.85,
        strokeWeight: 4,
        map,
      });
      polylinesRef.current = [fallback];
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      map.fitBounds(bounds, 56);
    };

    const run = async () => {
      if (routesLib?.Route && typeof (routesLib.Route as any).computeRoutes === 'function') {
        try {
          const { routes } = await (routesLib.Route as any).computeRoutes({
            origin,
            destination,
            travelMode: 'DRIVING',
            routingPreference: ecoMode ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE',
            fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
          });

          if (!cancelled && routes && routes.length > 0) {
            const primary = routes[0];
            const created: google.maps.Polyline[] = primary.createPolylines();
            created.forEach((p) => {
              p.setOptions({
                strokeColor: ecoMode ? '#16A34A' : '#2563EB',
                strokeWeight: 5,
                strokeOpacity: 0.92,
              });
              p.setMap(map);
            });
            polylinesRef.current = created;
            if (primary.viewport) {
              map.fitBounds(primary.viewport, 56);
            }
            const distKm = Number(((primary.distanceMeters ?? 0) / 1000).toFixed(1));
            const durMin = Math.round((primary.durationMillis ?? 0) / 60000);
            onRouteComputed({
              fastestDistanceKm: distKm,
              fastestDurationMin: durMin,
              ecoDistanceKm: distKm,
              ecoDurationMin: durMin,
              source: 'routes_api',
            });
            return;
          }
        } catch {
          // Fall back to direct corridor polyline if Routes JS API isn't activated on project
        }
      }
      drawFallbackLine();
    };

    void run();

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, origin, destination, ecoMode, onRouteComputed]);

  return null;
}

function VehicleAdvancedMarker({
  vehicle,
  isSelected,
  onSelect,
}: {
  vehicle: FleetVehicle;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);
  const maint = evaluateMaintenanceStatus(vehicle, '2026-11-20T15:30:00Z');

  const pinBg =
    maint.level === 'critical'
      ? '#DC2626'
      : vehicle.status === 'ruta_vacia'
        ? '#D97706'
        : '#15803D';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={vehicle.currentPosition}
        title={`${vehicle.unitName} (${vehicle.plate})`}
        onClick={() => {
          setOpen(true);
          onSelect();
        }}
      >
        <Pin
          background={pinBg}
          borderColor={isSelected ? '#0F172A' : '#FFFFFF'}
          glyphColor="#FFFFFF"
          scale={isSelected ? 1.2 : 1.0}
        />
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)} maxWidth={260}>
          <div className="p-1 text-slate-900 space-y-1.5">
            <div className="font-display text-xs font-bold">{vehicle.unitName}</div>
            <div className="text-[11px] text-slate-600">
              Placa {vehicle.plate} · {vehicle.driverName}
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-200">
              <div>Vel: {vehicle.teltonika.speedKmh} km/h</div>
              <div>Comb: {vehicle.teltonika.fuelLevelPct}%</div>
              <div className="col-span-2">IMEI: {vehicle.teltonika.imei}</div>
            </div>
            <div className="text-[11px] text-slate-700">{maint.reason}</div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export const FreightMapWorkspace: React.FC<FreightMapWorkspaceProps> = ({
  shipments,
  fleet,
  projects,
  userRole,
  mapsAvailable,
  onSimulateTelemetryPulse,
  onQuickOffsetShipment,
  onNavigateTab,
}) => {
  const activeShipments = useMemo(
    () => shipments.filter((s) => s.status !== 'entregado'),
    [shipments]
  );

  const [selectedShipmentId, setSelectedShipmentId] = useState<string>(
    activeShipments[0]?.id ?? shipments[0]?.id ?? ''
  );
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [ecoMode, setEcoMode] = useState(true);
  const [ecoComparison, setEcoComparison] = useState<EcoRouteComparison | null>(null);
  const [ecoApiError, setEcoApiError] = useState<string | null>(null);

  // Gemini 4 Carbon High Thinking state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  // Gemini 4 Hydrogen Google Maps Grounding state
  const [groundingQuery, setGroundingQuery] = useState(
    'Paradores seguros de carga pesada, estaciones diésel y carga eléctrica en la ruta'
  );
  const [groundingLoading, setGroundingLoading] = useState(false);
  const [groundingError, setGroundingError] = useState<string | null>(null);
  const [groundingResult, setGroundingResult] = useState<{
    text: string;
    groundingLinks: GroundingLink[];
  } | null>(null);

  const selectedShipment = useMemo(
    () => shipments.find((s) => s.id === selectedShipmentId) ?? shipments[0],
    [shipments, selectedShipmentId]
  );

  const assignedVehicle = useMemo(
    () => fleet.find((v) => v.id === selectedShipment?.assignedVehicleId) ?? fleet[0],
    [fleet, selectedShipment]
  );

  const backhaulSuggestion = useMemo(
    () => shipments.find((s) => s.mode === 'ruta_vacia' && s.status === 'disponible'),
    [shipments]
  );

  const carbonMetrics = useMemo(() => {
    if (!selectedShipment) return null;
    return calculateCarbonFootprint({
      distanceKm: ecoComparison?.ecoDistanceKm || selectedShipment.distanceKm,
      fuelType: selectedShipment.fuelType,
      payloadTons: selectedShipment.payloadTons,
      trafficDelayPct: selectedShipment.trafficDelayPct,
      vehicleConsumptionPer100Km: assignedVehicle?.teltonika.canFuelRateLPer100Km,
    });
  }, [selectedShipment, ecoComparison, assignedVehicle]);

  const etaMetrics = useMemo(() => {
    if (!selectedShipment) return null;
    return computePredictiveEta({
      distanceKm: ecoComparison?.ecoDistanceKm || selectedShipment.distanceKm,
      baseSpeedKmh: 76,
      trafficDelayPct: selectedShipment.trafficDelayPct,
      restStopsCount: selectedShipment.distanceKm > 350 ? 1 : 0,
    });
  }, [selectedShipment, ecoComparison]);

  const handleRouteComputed = useCallback(
    (summary: Partial<EcoRouteComparison>) => {
      if (!selectedShipment) return;
      setEcoComparison((prev) => ({
        fastestDistanceKm:
          summary.fastestDistanceKm ?? prev?.fastestDistanceKm ?? selectedShipment.distanceKm,
        fastestDurationMin:
          summary.fastestDurationMin ??
          prev?.fastestDurationMin ??
          selectedShipment.estimatedDurationMin,
        ecoDistanceKm:
          summary.ecoDistanceKm ?? prev?.ecoDistanceKm ?? selectedShipment.distanceKm,
        ecoDurationMin:
          summary.ecoDurationMin ??
          prev?.ecoDurationMin ??
          selectedShipment.estimatedDurationMin,
        ecoFuelLiters: prev?.ecoFuelLiters,
        tollCostLabel: prev?.tollCostLabel,
        source: summary.source ?? 'routes_api',
      }));
    },
    [selectedShipment]
  );

  // Server-side Eco-Friendly Routes API call for fuel & toll comparison
  useEffect(() => {
    if (!selectedShipment) return;
    let cancelled = false;
    setEcoApiError(null);

    const fetchEcoComparison = async () => {
      try {
        const emissionMap: Record<string, 'DIESEL' | 'HYBRID' | 'ELECTRIC'> = {
          DIESEL: 'DIESEL',
          LNG: 'DIESEL',
          HYBRID: 'HYBRID',
          ELECTRIC: 'ELECTRIC',
        };
        const res = await fetch('/api/routes/eco', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: selectedShipment.originCoords,
            destination: selectedShipment.destinationCoords,
            emissionType: emissionMap[selectedShipment.fuelType] ?? 'DIESEL',
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setEcoApiError(data.error || 'Routes API en modo respaldo telemétrico');
          return;
        }
        const routes = data.routes ?? [];
        if (routes.length > 0) {
          const defaultRoute =
            routes.find((r: any) => r.routeLabels?.includes('DEFAULT_ROUTE')) ?? routes[0];
          const ecoRoute =
            routes.find((r: any) => r.routeLabels?.includes('FUEL_EFFICIENT')) ??
            defaultRoute;
          const parseSec = (d?: string) =>
            d ? Math.round(Number(d.replace('s', '')) / 60) : selectedShipment.estimatedDurationMin;
          const micro = Number(ecoRoute?.travelAdvisory?.fuelConsumptionMicroliters ?? 0);
          const tollUnits = ecoRoute?.travelAdvisory?.tollInfo?.estimatedPrice?.[0];

          setEcoComparison({
            fastestDistanceKm: Number(((defaultRoute.distanceMeters ?? 0) / 1000).toFixed(1)),
            fastestDurationMin: parseSec(defaultRoute.duration),
            ecoDistanceKm: Number(((ecoRoute.distanceMeters ?? 0) / 1000).toFixed(1)),
            ecoDurationMin: parseSec(ecoRoute.duration),
            ecoFuelLiters: micro > 0 ? Number((micro / 1_000_000).toFixed(1)) : undefined,
            tollCostLabel: tollUnits
              ? `${tollUnits.units ?? '0'} ${tollUnits.currencyCode ?? 'MXN'}`
              : undefined,
            source: 'routes_api',
          });
        }
      } catch {
        if (!cancelled) {
          setEcoApiError('Enrutamiento operando con modelo telemétrico local.');
        }
      }
    };

    void fetchEcoComparison();
    return () => {
      cancelled = true;
    };
  }, [selectedShipment]);

  const runHighThinkingOptimization = async () => {
    if (!selectedShipment) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/route-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originName: selectedShipment.originName,
          destinationName: selectedShipment.destinationName,
          distanceKm: ecoComparison?.ecoDistanceKm || selectedShipment.distanceKm,
          trafficDelayPct: selectedShipment.trafficDelayPct,
          payloadTons: selectedShipment.payloadTons,
          fuelType: selectedShipment.fuelType,
          teltonikaSpeedKmh: assignedVehicle?.teltonika.speedKmh ?? 76,
          teltonikaFuelPct: assignedVehicle?.teltonika.fuelLevelPct ?? 72,
          odometerKm: assignedVehicle?.teltonika.odometerKm ?? 150000,
          nextServiceKm: assignedVehicle?.nextServiceOdometerKm ?? 170000,
          availableBackhaulTitle: backhaulSuggestion
            ? `${backhaulSuggestion.code}: ${backhaulSuggestion.originName} -> ${backhaulSuggestion.destinationName}`
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || 'No se pudo completar el análisis predictivo.');
      } else {
        setAiAnalysis(data.analysis);
      }
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Error de red al consultar optimización IA.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const runMapsGroundingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groundingQuery.trim()) return;
    setGroundingLoading(true);
    setGroundingError(null);

    const anchor = assignedVehicle?.currentPosition ?? selectedShipment?.originCoords;
    try {
      const res = await fetch('/api/ai/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: groundingQuery,
          latitude: anchor?.lat ?? 20.5888,
          longitude: anchor?.lng ?? -100.3899,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGroundingError(data.error || 'Error en búsqueda de Google Maps Grounding.');
      } else {
        setGroundingResult({
          text: data.text ?? '',
          groundingLinks: data.groundingLinks ?? [],
        });
      }
    } catch (err) {
      setGroundingError(
        err instanceof Error ? err.message : 'Error al consultar lugares en la ruta.'
      );
    } finally {
      setGroundingLoading(false);
    }
  };

  const totalActiveCo2Kg = useMemo(
    () => shipments.reduce((acc, s) => acc + s.co2Kg, 0),
    [shipments]
  );
  const totalSavedCo2Kg = useMemo(
    () => shipments.reduce((acc, s) => acc + s.ecoRouteSavedCo2Kg, 0),
    [shipments]
  );

  return (
    <div className="space-y-6">
      {/* 4-column KPI strip */}
      <section
        aria-label="Indicadores operativos en tiempo real"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Embarques en Operación</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {activeShipments.length}
            </span>
            <span className="text-xs text-emerald-700 font-medium">
              {shipments.filter((s) => s.mode === 'ruta_vacia').length} retorno vacío
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Modo {userRole === 'carrier' ? 'Transportista' : userRole === 'shipper' ? 'Generador' : 'Torre 360°'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Huella Activa Medida</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {totalActiveCo2Kg.toFixed(1)} kg
            </span>
            <span className="text-xs text-slate-600 font-mono tabular-nums">CO₂e</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Cálculo GLEC · Telemetría CAN-bus
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Ahorro por Eco-Rutas Maps</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
              -{totalSavedCo2Kg.toFixed(1)} kg
            </span>
            <span className="text-xs text-emerald-700 font-medium">-8.5% emisiones</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Tráfico en vivo y pendientes optimizadas
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Activos GPS Teltonika</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {fleet.length} / {fleet.length}
            </span>
            <span className="text-xs text-emerald-700 font-medium">Anti-manipulación</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Hardware independiente del conductor
          </div>
        </div>
      </section>

      {/* Main Map + Dispatch Intelligence Grid */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Google Map Canvas Column */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-700" />
              <span className="font-display text-sm font-semibold text-slate-900">
                Mapa de Enrutamiento y Telemetría en Tiempo Real
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTrafficEnabled((v) => !v)}
                aria-pressed={trafficEnabled}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                  trafficEnabled
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Tráfico en Vivo
              </button>
              <button
                type="button"
                onClick={() => setEcoMode((v) => !v)}
                aria-pressed={ecoMode}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                  ecoMode
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Ruta Eco-Eficiente
              </button>
              {assignedVehicle && (
                <button
                  type="button"
                  onClick={() => onSimulateTelemetryPulse(assignedVehicle.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  Pulso GPS Teltonika
                </button>
              )}
            </div>
          </div>

          <div className="relative w-full h-[460px] lg:h-[520px] bg-slate-100" data-testid="google-map-container">
            {mapsAvailable && selectedShipment ? (
              <GoogleMap
                mapId="DEMO_MAP_ID"
                defaultCenter={selectedShipment.originCoords}
                defaultZoom={6}
                gestureHandling="greedy"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                className="w-full h-full"
              >
                <TrafficLayerController enabled={trafficEnabled} />
                <ActiveRoutePolyline
                  origin={selectedShipment.originCoords}
                  destination={selectedShipment.destinationCoords}
                  ecoMode={ecoMode}
                  onRouteComputed={handleRouteComputed}
                />

                {/* Origin & Destination Markers */}
                <AdvancedMarker
                  position={selectedShipment.originCoords}
                  title={`Origen: ${selectedShipment.originName}`}
                >
                  <Pin background="#0F172A" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
                </AdvancedMarker>

                <AdvancedMarker
                  position={selectedShipment.destinationCoords}
                  title={`Destino: ${selectedShipment.destinationName}`}
                >
                  <Pin background="#2563EB" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
                </AdvancedMarker>

                {/* Fleet Teltonika Vehicle Markers */}
                {fleet.map((vehicle) => (
                  <VehicleAdvancedMarker
                    key={vehicle.id}
                    vehicle={vehicle}
                    isSelected={vehicle.id === assignedVehicle?.id}
                    onSelect={() => {
                      const match = shipments.find((s) => s.assignedVehicleId === vehicle.id);
                      if (match) setSelectedShipmentId(match.id);
                    }}
                  />
                ))}
              </GoogleMap>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-600">
                <Navigation className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-800">
                  Inicializando mapa interactivo de Google Maps Platform...
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Si el mapa no carga en unos segundos, verifica que Maps JavaScript API y Routes API estén habilitadas en el proyecto seleccionado.
                </p>
              </div>
            )}
          </div>

          {/* Route Telemetry Strip below Map */}
          {selectedShipment && carbonMetrics && etaMetrics && (
            <div className="px-4 py-3.5 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Distancia / Peajes</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {ecoComparison?.ecoDistanceKm || selectedShipment.distanceKm} km
                  {ecoComparison?.tollCostLabel ? ` · ${ecoComparison.tollCostLabel}` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">ETA Predictivo ML</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {Math.floor(etaMetrics.estimatedMinutes / 60)}h {etaMetrics.estimatedMinutes % 60}m
                  <span className="text-slate-500 font-normal">
                    {' '}
                    (±{Math.round((etaMetrics.conservativeMinutes - etaMetrics.optimisticMinutes) / 2)}m)
                  </span>
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Consumo Estimado</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {selectedShipment.fuelType === 'ELECTRIC'
                    ? `${carbonMetrics.energyKwh} kWh`
                    : `${carbonMetrics.fuelConsumedLiters} L (${selectedShipment.fuelType})`}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Impacto CO₂e / Ahorro</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  {carbonMetrics.co2Kg} kg · -{carbonMetrics.ecoRouteSavedCo2Kg} kg eco
                </span>
              </div>
            </div>
          )}
          {ecoApiError && (
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-900">
              Nota de enrutamiento: {ecoApiError}
            </div>
          )}
        </div>

        {/* Right Side Panel: Shipment Selector, Traceability & Carbon Action */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div>
              <label
                htmlFor="active-shipment-select"
                className="block text-xs font-medium text-slate-500 mb-1.5"
              >
                Envío seleccionado para monitoreo
              </label>
              <select
                id="active-shipment-select"
                value={selectedShipment?.id ?? ''}
                onChange={(e) => setSelectedShipmentId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.originName.split(',')[0]} → {s.destinationName.split(',')[0]} ({s.status.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>

            {selectedShipment && carbonMetrics && (
              <>
                <div className="border-t border-slate-100 pt-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-sm font-semibold text-slate-900">
                      {selectedShipment.title}
                    </h2>
                    <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                      ${selectedShipment.priceUsd} USD
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {selectedShipment.cargoType} · {selectedShipment.shipperName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Tráfico +{selectedShipment.trafficDelayPct}% ·{' '}
                    {assignedVehicle
                      ? `Teltonika ${assignedVehicle.teltonika.imei.slice(-6)} (${assignedVehicle.teltonika.speedKmh} km/h)`
                      : 'Pendiente de asignación'}
                  </p>
                </div>

                {/* Quick Carbon Offset CTA */}
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 flex items-center gap-1.5">
                      <Leaf className="w-3.5 h-3.5 text-emerald-700" />
                      Compensación de Huella
                    </span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      ${carbonMetrics.recommendedOffsetUsd.toFixed(2)} USD
                    </span>
                  </div>
                  {selectedShipment.offsetCompleted ? (
                    <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
                      <span>Carbono neutral verificado en Blockchain</span>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('carbon')}
                        className="underline hover:text-emerald-900 cursor-pointer"
                      >
                        Ver certificado
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onQuickOffsetShipment(selectedShipment.id, projects[0].id)
                      }
                      className="w-full py-2 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Compensar {selectedShipment.co2Kg} kg CO₂e vía Billetera
                    </button>
                  )}
                </div>

                {/* Traceability Timeline */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 mb-2">
                    Trazabilidad de punta a punta
                  </h3>
                  <ol className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
                    {selectedShipment.traceability.map((ev) => (
                      <li
                        key={ev.id}
                        className="text-xs border-b border-slate-100 pb-2 last:border-0"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-medium text-slate-700">{ev.source}</span>
                          <span className="font-mono tabular-nums">
                            {new Date(ev.timestampIso).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="font-medium text-slate-900 mt-0.5">{ev.title}</div>
                        <div className="text-slate-600 mt-0.5">{ev.detail}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}
          </div>

          {/* Empty Backhaul Opportunity Card */}
          {backhaulSuggestion && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Retorno sin Ruta Vacía Disponible
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                  -{backhaulSuggestion.backhaulDiscountPct}% spot
                </span>
              </div>
              <p className="text-xs text-slate-700">
                {backhaulSuggestion.code}: {backhaulSuggestion.originName} →{' '}
                {backhaulSuggestion.destinationName} (${backhaulSuggestion.priceUsd} USD)
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab('marketplace')}
                className="text-xs font-semibold text-slate-900 underline hover:text-emerald-700 cursor-pointer"
              >
                Asignar carga de retorno en Mercado Spot
              </button>
            </div>
          )}
        </div>
      </section>

      {/* AI Optimization (Gemini 4 Carbon High Thinking) & Maps Grounding (Gemini 4 Hydrogen) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gemini 4 Carbon High Thinking */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <BrainCircuit className="w-4 h-4 text-slate-900" />
                <span>Modelo Predictivo ML · Razonamiento Profundo</span>
              </div>
              <h2 className="font-display text-base font-semibold text-slate-900 mt-1">
                Optimización Inteligente de Ruta y Combustible
              </h2>
            </div>

            <button
              type="button"
              onClick={runHighThinkingOptimization}
              disabled={aiLoading || !selectedShipment}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              {aiLoading ? 'Analizando ruta...' : 'Optimizar Ruta con IA'}
            </button>
          </div>

          {aiError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {aiError}
            </div>
          )}

          {aiAnalysis ? (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
              {aiAnalysis}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-600 space-y-1.5">
              <p className="font-medium text-slate-800">
                Motor de decisión logística con telemetría Teltonika y tráfico en tiempo real
              </p>
              <p>
                Ejecuta un análisis de razonamiento profundo para predecir ventanas de llegada (ETA), reducir consumo de combustible en pendientes, evaluar riesgos de mantención y emparejar cargas de retorno vacío.
              </p>
            </div>
          )}
        </div>

        {/* Gemini 4 Hydrogen Maps Grounding */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <RouteIcon className="w-4 h-4 text-emerald-700" />
              <span>Google Maps Grounding en Tiempo Real</span>
            </div>
            <h2 className="font-display text-base font-semibold text-slate-900 mt-1">
              Infraestructura Vial y Puntos de Servicio en el Corredor
            </h2>
          </div>

          <form onSubmit={runMapsGroundingSearch} className="flex gap-2">
            <label htmlFor="maps-grounding-query" className="sr-only">
              Buscar infraestructura en Google Maps
            </label>
            <input
              id="maps-grounding-query"
              type="text"
              value={groundingQuery}
              onChange={(e) => setGroundingQuery(e.target.value)}
              placeholder="Ej. Estaciones diésel, básculas o paradores seguros..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <button
              type="submit"
              disabled={groundingLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              {groundingLoading ? 'Buscando...' : 'Consultar Maps'}
            </button>
          </form>

          {groundingError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {groundingError}
            </div>
          )}

          {groundingResult ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {groundingResult.text}
              </div>
              {groundingResult.groundingLinks.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                    Lugares verificados en Google Maps:
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {groundingResult.groundingLinks.map((link, idx) => (
                      <li key={idx}>
                        <a
                          href={link.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-emerald-800"
                        >
                          {link.title}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-600 space-y-1.5">
              <p className="font-medium text-slate-800 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-700" />
                Consulta lugares reales geolocalizados alrededor de la unidad activa
              </p>
              <p>
                Encuentra electrolineras de carga pesada, paradores seguros certificados, talleres diésel/LNG y zonas aduaneras con enlaces directos de Google Maps.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  'Paradores seguros de tráiler en Querétaro',
                  'Estaciones de carga eléctrica o GNL cerca de Monterrey',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGroundingQuery(preset)}
                    className="text-[11px] px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                  >
                    <Fuel className="w-3 h-3 inline mr-1" />
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
