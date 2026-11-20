import { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  INITIAL_CERTIFICATES,
  INITIAL_FLEET,
  INITIAL_NOTIFICATIONS,
  INITIAL_SHIPMENTS,
  INITIAL_TICKETS,
  INITIAL_WALLET,
  REFORESTATION_PROJECTS,
} from './data/seedData';
import type {
  BlockchainCertificate,
  DigitalWallet,
  FleetVehicle,
  FuelType,
  LatLngLiteral,
  MaintenanceRecord,
  PushNotificationItem,
  Shipment,
  ShipmentMode,
  SupportTicket,
  UserRole,
  VehicleClass,
  WorkspaceTab,
} from './types/logistics';
import {
  CARBON_PRICE_PER_TON_USD,
  evaluateMaintenanceStatus,
  mintBlockchainCertificate,
  processWalletOffset,
} from './utils/logisticsEngine';
import { SidebarNav } from './components/SidebarNav';
import { TopHeader } from './components/TopHeader';
import { FreightMapWorkspace } from './components/FreightMapWorkspace';
import { SpotMarketplaceView } from './components/SpotMarketplaceView';
import { FleetTeltonikaView } from './components/FleetTeltonikaView';
import { CarbonBlockchainView } from './components/CarbonBlockchainView';
import { WalletAnalyticsView } from './components/WalletAnalyticsView';
import {
  NewLoadModal,
  NotificationsDrawer,
  SupportDrawer,
} from './components/ModalsAndDrawers';

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dispatch');
  const [userRole, setUserRole] = useState<UserRole>('admin');

  const [fleet, setFleet] = useState<FleetVehicle[]>(INITIAL_FLEET);
  const [shipments, setShipments] = useState<Shipment[]>(INITIAL_SHIPMENTS);
  const [certificates, setCertificates] =
    useState<BlockchainCertificate[]>(INITIAL_CERTIFICATES);
  const [wallet, setWallet] = useState<DigitalWallet>(INITIAL_WALLET);
  const [notifications, setNotifications] =
    useState<PushNotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [tickets, setTickets] = useState<SupportTicket[]>(INITIAL_TICKETS);

  const [newLoadOpen, setNewLoadOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bannerFeedback, setBannerFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/maps-config')
      .then((r) => r.json())
      .then((data) => {
        if (data?.apiKey) setMapsApiKey(data.apiKey);
      })
      .catch(() => {
        // Ignore config lookup error
      });
  }, [mapsApiKey]);

  const pushAlert = useCallback(
    (item: Omit<PushNotificationItem, 'id' | 'timestampIso' | 'read'>) => {
      const next: PushNotificationItem = {
        ...item,
        id: `notif-${Date.now()}`,
        timestampIso: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [next, ...prev]);

      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(item.title, { body: item.message });
        } catch {
          // Ignore browser notification failure in headless contexts
        }
      }
    },
    []
  );

  const handleSimulateTelemetryPulse = useCallback(
    (vehicleId: string) => {
      setFleet((prev) =>
        prev.map((v) => {
          if (v.id !== vehicleId) return v;
          const nextLat = Number((v.currentPosition.lat + 0.085).toFixed(4));
          const nextLng = Number((v.currentPosition.lng - 0.042).toFixed(4));
          const nextOdo = v.teltonika.odometerKm + 24;
          const nextFuel = Math.max(12, v.teltonika.fuelLevelPct - 1);
          return {
            ...v,
            currentPosition: { lat: nextLat, lng: nextLng },
            teltonika: {
              ...v.teltonika,
              ignitionOn: true,
              speedKmh: 84,
              odometerKm: nextOdo,
              fuelLevelPct: nextFuel,
              lastHeartbeatIso: new Date().toISOString(),
            },
          };
        })
      );
      setBannerFeedback({
        type: 'success',
        message:
          'Pulso GPS Teltonika recibido: odómetro (+24 km), posición y lectura CAN-bus actualizados.',
      });
    },
    []
  );

  const handleAssignShipment = useCallback(
    (shipmentId: string, vehicleId: string) => {
      const targetLoad = shipments.find((s) => s.id === shipmentId);
      const targetVeh = fleet.find((v) => v.id === vehicleId);
      if (!targetLoad || !targetVeh) return;

      const nowIso = new Date().toISOString();

      setShipments((prev) =>
        prev.map((s) =>
          s.id === shipmentId
            ? {
                ...s,
                status: 'en_transito',
                assignedVehicleId: vehicleId,
                traceability: [
                  {
                    id: `tr-${Date.now()}`,
                    timestampIso: nowIso,
                    title: `Despacho asignado a ${targetVeh.unitName}`,
                    detail: `Teltonika IMEI ${targetVeh.teltonika.imei} enlazado. Custodia por $${s.priceUsd.toFixed(2)} USD confirmada.`,
                    source: 'Teltonika GPS',
                  },
                  ...s.traceability,
                ],
              }
            : s
        )
      );

      setFleet((prev) =>
        prev.map((v) =>
          v.id === vehicleId ? { ...v, status: 'en_ruta', emptyBackhaulTo: undefined } : v
        )
      );

      setWallet((prev) => ({
        ...prev,
        escrowHeldUsd: Number((prev.escrowHeldUsd + targetLoad.priceUsd).toFixed(2)),
        transactions: [
          {
            id: `tx-escrow-${Date.now()}`,
            timestampIso: nowIso,
            type: 'freight_escrow',
            description: `Custodia de flete ${targetLoad.code} (${targetLoad.originName} → ${targetLoad.destinationName})`,
            amountUsd: -targetLoad.priceUsd,
            referenceId: targetLoad.code,
            status: 'en_custodia',
          },
          ...prev.transactions,
        ],
      }));

      pushAlert({
        severity: 'success',
        category: targetLoad.mode === 'ruta_vacia' ? 'ruta_vacia' : 'billetera',
        title: `Carga ${targetLoad.code} despachada`,
        message: `${targetVeh.unitName} inició ruta con monitoreo Teltonika y custodia digital de $${targetLoad.priceUsd} USD.`,
      });

      setBannerFeedback({
        type: 'success',
        message: `Envío ${targetLoad.code} asignado a ${targetVeh.unitName} y en tránsito.`,
      });
    },
    [shipments, fleet, pushAlert]
  );

  const handleOffsetShipment = useCallback(
    (shipmentId: string, projectId: string) => {
      const target = shipments.find((s) => s.id === shipmentId);
      const project = REFORESTATION_PROJECTS.find((p) => p.id === projectId);
      if (!target || !project || target.offsetCompleted) return;

      const tons = target.co2Kg / 1000;
      const costUsd = Number(
        Math.max(0.5, tons * (project.pricePerTonUsd || CARBON_PRICE_PER_TON_USD)).toFixed(2)
      );
      const nowIso = new Date().toISOString();

      const walletResult = processWalletOffset({
        wallet,
        amountUsd: costUsd,
        description: `Compensación ${target.co2Kg} kg CO₂e (${target.code}) · ${project.name}`,
        referenceId: target.code,
        timestampIso: nowIso,
      });

      if (!walletResult.ok) {
        setBannerFeedback({
          type: 'error',
          message: walletResult.error || 'No se pudo procesar la compensación.',
        });
        return;
      }

      const assignedVeh =
        fleet.find((v) => v.id === target.assignedVehicleId) ?? fleet[0];

      const cert = mintBlockchainCertificate({
        shipmentId: target.id,
        shipmentCode: target.code,
        vehiclePlate: assignedVeh?.plate ?? 'FLOTA-GEN',
        teltonikaImei: assignedVeh?.teltonika.imei ?? '352093080000000',
        distanceKm: target.distanceKm,
        fuelConsumedLiters: target.estimatedFuelLiters,
        co2CompensatedKg: target.co2Kg,
        offsetCostUsd: costUsd,
        projectId: project.id,
        projectName: project.name,
        standard: `${project.standard} · ${project.registryCode}`,
        issuedAtIso: nowIso,
        existingBlockCount: certificates.length + 1,
      });

      setWallet(walletResult.wallet);
      setCertificates((prev) => [cert, ...prev]);
      setShipments((prev) =>
        prev.map((s) =>
          s.id === target.id
            ? {
                ...s,
                offsetCompleted: true,
                offsetProjectId: project.id,
                certificateId: cert.id,
                traceability: [
                  {
                    id: `tr-cert-${Date.now()}`,
                    timestampIso: nowIso,
                    title: `Certificado Blockchain ${cert.certificateCode} emitido`,
                    detail: `${target.co2Kg} kg CO₂e compensados en ${project.name} (Tx ${cert.txHash.slice(0, 14)}...).`,
                    source: 'Blockchain',
                  },
                  ...s.traceability,
                ],
              }
            : s
        )
      );

      pushAlert({
        severity: 'success',
        category: 'carbono',
        title: `Certificado ${cert.certificateCode} registrado en Blockchain`,
        message: `Se compensaron ${target.co2Kg} kg CO₂e por $${costUsd.toFixed(2)} USD en ${project.name}.`,
      });

      setBannerFeedback({
        type: 'success',
        message: `Compensación exitosa: certificado ${cert.certificateCode} emitido en Blockchain.`,
      });
    },
    [shipments, wallet, fleet, certificates.length, pushAlert]
  );

  const handleAddMaintenance = useCallback(
    (vehicleId: string, record: Omit<MaintenanceRecord, 'id' | 'vehicleId'>) => {
      const newRecord: MaintenanceRecord = {
        ...record,
        id: `mnt-${Date.now()}`,
        vehicleId,
      };
      setFleet((prev) =>
        prev.map((v) =>
          v.id === vehicleId
            ? {
                ...v,
                nextServiceOdometerKm:
                  record.nextDueOdometerKm ?? v.teltonika.odometerKm + 20000,
                nextServiceDateIso: new Date(
                  Date.now() + 90 * 24 * 60 * 60 * 1000
                ).toISOString(),
                maintenanceHistory: [newRecord, ...v.maintenanceHistory],
              }
            : v
        )
      );
      setBannerFeedback({
        type: 'success',
        message: 'Mantención registrada en bitácora y alertas de kilometraje recalibradas.',
      });
    },
    []
  );

  const handleAddVehicle = useCallback(
    (payload: {
      unitName: string;
      plate: string;
      driverName: string;
      vehicleClass: VehicleClass;
      fuelType: FuelType;
      maxPayloadTons: number;
      imei: string;
      odometerKm: number;
    }) => {
      const nextVeh: FleetVehicle = {
        id: `veh-${Date.now()}`,
        plate: payload.plate,
        unitName: payload.unitName,
        vehicleClass: payload.vehicleClass,
        fuelType: payload.fuelType,
        maxPayloadTons: payload.maxPayloadTons,
        driverName: payload.driverName,
        status: 'disponible',
        currentPosition: { lat: 19.4326, lng: -99.1332 },
        currentLocationLabel: 'Base Operativa Central · CDMX',
        nextServiceOdometerKm: payload.odometerKm + 20000,
        nextServiceDateIso: new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString(),
        teltonika: {
          deviceModel: 'Teltonika FMC650',
          imei: payload.imei,
          ignitionOn: false,
          speedKmh: 0,
          odometerKm: payload.odometerKm,
          fuelLevelPct: 95,
          canFuelRateLPer100Km: payload.fuelType === 'ELECTRIC' ? 115 : 30.5,
          engineHours: 420,
          satellites: 15,
          lastHeartbeatIso: new Date().toISOString(),
          tamperLockActive: true,
        },
        maintenanceHistory: [],
      };
      setFleet((prev) => [nextVeh, ...prev]);
      setBannerFeedback({
        type: 'success',
        message: `Unidad ${payload.unitName} (${payload.plate}) vinculada con Teltonika IMEI ${payload.imei}.`,
      });
    },
    []
  );

  const handleCreateLoad = useCallback(
    (payload: {
      title: string;
      cargoType: string;
      mode: ShipmentMode;
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
    }) => {
      const code = `TC-${Math.floor(4900 + Math.random() * 900)}`;
      const nowIso = new Date().toISOString();
      const newShipment: Shipment = {
        id: `ship-${Date.now()}`,
        code,
        title: payload.title,
        cargoType: payload.cargoType,
        mode: payload.mode,
        status: 'disponible',
        shipperName: payload.shipperName,
        originName: payload.originName,
        originCoords: payload.originCoords,
        destinationName: payload.destinationName,
        destinationCoords: payload.destinationCoords,
        distanceKm: payload.distanceKm,
        estimatedDurationMin: Math.round((payload.distanceKm / 72) * 60),
        trafficDelayPct: 10,
        payloadTons: payload.payloadTons,
        priceUsd: payload.priceUsd,
        backhaulDiscountPct: payload.backhaulDiscountPct,
        scheduledDateIso: payload.scheduledDateIso,
        fuelType: payload.fuelType,
        estimatedFuelLiters: payload.estimatedFuelLiters,
        co2Kg: payload.co2Kg,
        ecoRouteSavedCo2Kg: payload.ecoRouteSavedCo2Kg,
        offsetCompleted: false,
        traceability: [
          {
            id: `tr-new-${Date.now()}`,
            timestampIso: nowIso,
            title: `Solicitud ${code} publicada en mercado en tiempo real`,
            detail: `${payload.originName} → ${payload.destinationName} (${payload.distanceKm} km · $${payload.priceUsd} USD).`,
            source: 'Google Maps',
          },
        ],
      };

      setShipments((prev) => [newShipment, ...prev]);
      setActiveTab('marketplace');
      pushAlert({
        severity: 'info',
        category: payload.mode === 'ruta_vacia' ? 'ruta_vacia' : 'billetera',
        title: `Nueva carga publicada: ${code}`,
        message: `${payload.title} (${payload.originName} → ${payload.destinationName}) por $${payload.priceUsd} USD.`,
      });
      setBannerFeedback({
        type: 'success',
        message: `Carga ${code} publicada exitosamente en el Mercado Spot.`,
      });
    },
    [pushAlert]
  );

  const handleTopUpWallet = useCallback((amountUsd: number) => {
    const nowIso = new Date().toISOString();
    setWallet((prev) => ({
      ...prev,
      balanceUsd: Number((prev.balanceUsd + amountUsd).toFixed(2)),
      transactions: [
        {
          id: `tx-dep-${Date.now()}`,
          timestampIso: nowIso,
          type: 'deposit',
          description: 'Recarga a Billetera Digital TerraCarga',
          amountUsd,
          referenceId: `DEP-${Math.floor(10000 + Math.random() * 89999)}`,
          status: 'confirmado',
        },
        ...prev.transactions,
      ],
    }));
    setBannerFeedback({
      type: 'success',
      message: `Depósito por $${amountUsd.toFixed(2)} USD acreditado en billetera.`,
    });
  }, []);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const criticalMaintenanceCount = useMemo(
    () =>
      fleet.filter(
        (v) =>
          evaluateMaintenanceStatus(v, '2026-11-20T15:30:00Z').level !== 'nominal'
      ).length,
    [fleet]
  );

  const appShell = (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        userRole={userRole}
        onChangeRole={(role) => {
          setUserRole(role);
          if (role === 'carrier') setActiveTab('marketplace');
          else if (role === 'shipper') setActiveTab('dispatch');
        }}
        unreadNotifications={unreadNotifications}
        criticalMaintenanceCount={criticalMaintenanceCount}
        onOpenSupport={() => setSupportOpen(true)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeTab={activeTab}
          userRole={userRole}
          walletBalanceUsd={wallet.balanceUsd}
          unreadCount={unreadNotifications}
          onOpenNotifications={() => setNotifOpen(true)}
          onOpenNewLoad={() => setNewLoadOpen(true)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        {bannerFeedback && (
          <div
            role="status"
            className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
              bannerFeedback.type === 'error'
                ? 'bg-red-50 text-red-900 border-red-200'
                : 'bg-emerald-50 text-emerald-950 border-emerald-200'
            }`}
          >
            <span>{bannerFeedback.message}</span>
            <button
              type="button"
              onClick={() => setBannerFeedback(null)}
              className="underline ml-4 cursor-pointer"
            >
              Ocultar
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dispatch' && (
            <FreightMapWorkspace
              shipments={shipments}
              fleet={fleet}
              projects={REFORESTATION_PROJECTS}
              userRole={userRole}
              mapsAvailable={Boolean(mapsApiKey)}
              onSimulateTelemetryPulse={handleSimulateTelemetryPulse}
              onQuickOffsetShipment={handleOffsetShipment}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'marketplace' && (
            <SpotMarketplaceView
              shipments={shipments}
              fleet={fleet}
              userRole={userRole}
              onAssignShipment={handleAssignShipment}
              onOpenNewLoad={() => setNewLoadOpen(true)}
            />
          )}

          {activeTab === 'fleet' && (
            <FleetTeltonikaView
              fleet={fleet}
              onAddMaintenance={handleAddMaintenance}
              onAddVehicle={handleAddVehicle}
            />
          )}

          {activeTab === 'carbon' && (
            <CarbonBlockchainView
              shipments={shipments}
              projects={REFORESTATION_PROJECTS}
              certificates={certificates}
              walletBalanceUsd={wallet.balanceUsd}
              onOffsetShipment={handleOffsetShipment}
            />
          )}

          {activeTab === 'wallet' && (
            <WalletAnalyticsView
              wallet={wallet}
              shipments={shipments}
              fleet={fleet}
              onToggleAutoOffset={() =>
                setWallet((prev) => ({
                  ...prev,
                  autoOffsetEnabled: !prev.autoOffsetEnabled,
                }))
              }
              onTopUpWallet={handleTopUpWallet}
            />
          )}
        </main>
      </div>

      <NewLoadModal
        open={newLoadOpen}
        mapsAvailable={Boolean(mapsApiKey)}
        onClose={() => setNewLoadOpen(false)}
        onCreateLoad={handleCreateLoad}
      />

      <NotificationsDrawer
        open={notifOpen}
        notifications={notifications}
        onClose={() => setNotifOpen(false)}
        onMarkAllRead={() =>
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        }
      />

      <SupportDrawer
        open={supportOpen}
        tickets={tickets}
        onClose={() => setSupportOpen(false)}
        onAddTicket={(ticket) => setTickets((prev) => [ticket, ...prev])}
      />
    </div>
  );

  if (!mapsApiKey) {
    return appShell;
  }

  return (
    <APIProvider
      apiKey={mapsApiKey}
      libraries={['routes', 'places', 'marker']}
      language="es"
      region="MX"
    >
      {appShell}
    </APIProvider>
  );
}
