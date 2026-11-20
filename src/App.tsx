import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { REFORESTATION_PROJECTS } from './data/seedData';
import type {
  BlockchainCertificate,
  FleetVehicle,
  FuelType,
  LatLngLiteral,
  MaintenanceRecord,
  PaymentTerms,
  PushNotificationItem,
  SettlementLedger,
  SettlementRecord,
  SettlementStatus,
  Shipment,
  ShipmentMode,
  SupportTicket,
  TeltonikaPacket,
  UserProfile,
  UserRole,
  VehicleClass,
  WorkspaceTab,
} from './types/logistics';
import {
  CARBON_PRICE_PER_TON_USD,
  computeDueDateIso,
  evaluateMaintenanceStatus,
  mintBlockchainCertificate,
  processEsgBudgetOffset,
} from './utils/logisticsEngine';
import {
  acceptAndDispatchShipmentInFirestore,
  advanceShipmentStatusInFirestore,
  allocateEsgBudgetInFirestore,
  createNotificationInFirestore,
  createShipmentInFirestore,
  createSupportTicketInFirestore,
  createVehicleInFirestore,
  ensureUserProfile,
  fetchShipmentEvents,
  fetchVehicleMaintenanceHistory,
  isBootstrapAdminUser,
  logMaintenanceInFirestore,
  markAllNotificationsReadInFirestore,
  mintCertificateAtomicallyInFirestore,
  recordOffPlatformSettlementInFirestore,
  seedInitialWorkspaceForUser,
  subscribeToCertificates,
  subscribeToNotifications,
  subscribeToSettlements,
  subscribeToShipments,
  subscribeToSupportTickets,
  subscribeToVehicles,
  updateVehicleTelemetryInFirestore,
} from './services/firestoreSync';
import { AuthGate } from './components/AuthGate';
import { PublicCertificateView } from './components/PublicCertificateView';
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

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const raw = error instanceof Error ? error.message : String(error);
    let friendly = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string; path?: string };
      if (parsed?.error) {
        friendly = `Error de sincronización (${parsed.path || 'Firestore'}): ${parsed.error}`;
      }
    } catch {
      // Keep raw error string
    }
    return { hasError: true, message: friendly };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-bold text-slate-950">
              Incidencia detectada en la sesión
            </h1>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              Recargar Plataforma
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function getCertCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const cert = params.get('cert');
  return cert && cert.trim() ? cert.trim() : null;
}

function TerraCargaApp() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [publicCertCode, setPublicCertCode] = useState<string | null>(() =>
    getCertCodeFromUrl()
  );

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const pendingSignupRef = useRef<{
    role?: UserRole;
    companyName?: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dispatch');
  const [userRole, setUserRole] = useState<UserRole>('carrier');

  const [rawFleet, setRawFleet] = useState<FleetVehicle[]>([]);
  const [maintByVehicle, setMaintByVehicle] = useState<
    Record<string, MaintenanceRecord[]>
  >({});
  const [livePacketsByImei, setLivePacketsByImei] = useState<
    Record<string, TeltonikaPacket>
  >({});
  const [rawShipments, setRawShipments] = useState<Shipment[]>([]);
  const [eventsByShipment, setEventsByShipment] = useState<
    Record<string, Shipment['traceability']>
  >({});
  const [certificates, setCertificates] = useState<BlockchainCertificate[]>([]);
  const [settlementRecords, setSettlementRecords] = useState<SettlementRecord[]>(
    []
  );
  const [autoOffsetEnabled, setAutoOffsetEnabled] = useState(true);
  const [notifications, setNotifications] = useState<PushNotificationItem[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const [wsConnected, setWsConnected] = useState(false);
  const [newLoadOpen, setNewLoadOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bannerFeedback, setBannerFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const isAdminUser = useMemo(
    () => isBootstrapAdminUser(firebaseUser),
    [firebaseUser]
  );

  // Sync ?cert=... URL navigation on browser back/forward
  useEffect(() => {
    const onPopState = () => {
      setPublicCertCode(getCertCodeFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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

  // Firebase Auth listener + initial workspace seeding & profile sync
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setFirebaseUser(user);

      if (!user) {
        setUserProfile(null);
        setRawFleet([]);
        setRawShipments([]);
        setCertificates([]);
        setSettlementRecords([]);
        setNotifications([]);
        setTickets([]);
        setAuthLoading(false);
        return;
      }

      try {
        const overrides = pendingSignupRef.current ?? undefined;
        pendingSignupRef.current = null;
        const profile = await ensureUserProfile(user, overrides);
        if (!active) return;
        setUserProfile(profile);
        setUserRole(profile.role);
        await seedInitialWorkspaceForUser(user.uid, profile.companyName);
      } catch (err) {
        if (active) {
          setAuthError(
            err instanceof Error
              ? err.message
              : 'No se pudo inicializar el perfil operativo.'
          );
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Firestore real-time listeners for signed-in user
  useEffect(() => {
    if (!firebaseUser) return;
    const unsubs = [
      subscribeToVehicles(firebaseUser, setRawFleet),
      subscribeToShipments(firebaseUser, setRawShipments),
      subscribeToCertificates(firebaseUser, setCertificates),
      subscribeToSettlements(firebaseUser, setSettlementRecords),
      subscribeToNotifications(firebaseUser, setNotifications),
      subscribeToSupportTickets(firebaseUser, setTickets),
    ];
    return () => unsubs.forEach((u) => u());
  }, [firebaseUser]);

  // Hydrate subcollection maintenance logs when vehicle IDs change
  const vehicleIdsKey = useMemo(
    () => rawFleet.map((v) => v.id).sort().join(','),
    [rawFleet]
  );

  useEffect(() => {
    if (!firebaseUser || !vehicleIdsKey) return;
    let active = true;
    Promise.all(
      rawFleet.map(async (v) => ({
        id: v.id,
        records: await fetchVehicleMaintenanceHistory(firebaseUser, v.id),
      }))
    ).then((results) => {
      if (!active) return;
      const nextMap: Record<string, MaintenanceRecord[]> = {};
      results.forEach((r) => {
        nextMap[r.id] = r.records;
      });
      setMaintByVehicle(nextMap);
    });
    return () => {
      active = false;
    };
  }, [firebaseUser, vehicleIdsKey, rawFleet]);

  // Hydrate subcollection traceability events when shipment IDs change
  const shipmentIdsKey = useMemo(
    () => rawShipments.map((s) => s.id).sort().join(','),
    [rawShipments]
  );

  useEffect(() => {
    if (!firebaseUser || !shipmentIdsKey) return;
    let active = true;
    Promise.all(
      rawShipments.map(async (s) => ({
        id: s.id,
        events: await fetchShipmentEvents(firebaseUser, s.id),
      }))
    ).then((results) => {
      if (!active) return;
      const nextMap: Record<string, Shipment['traceability']> = {};
      results.forEach((r) => {
        nextMap[r.id] = r.events;
      });
      setEventsByShipment(nextMap);
    });
    return () => {
      active = false;
    };
  }, [firebaseUser, shipmentIdsKey, rawShipments]);

  // Live WebSocket client for Teltonika GPS gateway (/ws/telemetry)
  useEffect(() => {
    if (!firebaseUser) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        if (!disposed) setWsConnected(true);
      };
      ws.onclose = () => {
        if (disposed) return;
        setWsConnected(false);
        reconnectTimer = window.setTimeout(connect, 4000);
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as {
            event: string;
            payload: TeltonikaPacket | TeltonikaPacket[];
          };
          if (msg.event === 'telemetry:init' && Array.isArray(msg.payload)) {
            const updates: Record<string, TeltonikaPacket> = {};
            msg.payload.forEach((p) => {
              if (p?.imei) updates[p.imei] = p;
            });
            if (Object.keys(updates).length > 0) {
              setLivePacketsByImei((prev) => ({ ...prev, ...updates }));
            }
          } else if (
            msg.event === 'telemetry:update' &&
            msg.payload &&
            !Array.isArray(msg.payload)
          ) {
            const pkt = msg.payload;
            setLivePacketsByImei((prev) => ({ ...prev, [pkt.imei]: pkt }));
          }
        } catch {
          // Ignore malformed WS message
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
      setWsConnected(false);
    };
  }, [firebaseUser]);

  // Merge Firestore fleet + maintenance subcollections + live Teltonika WS telemetry packets
  const fleet = useMemo<FleetVehicle[]>(() => {
    return rawFleet.map((v) => {
      const livePkt = livePacketsByImei[v.teltonika.imei];
      const mergedTelemetry = livePkt
        ? {
            ...v.teltonika,
            ignitionOn: livePkt.ignitionOn,
            speedKmh: livePkt.speedKmh,
            odometerKm: livePkt.odometerKm ?? v.teltonika.odometerKm,
            fuelLevelPct: livePkt.fuelLevelPct ?? v.teltonika.fuelLevelPct,
            canFuelRateLPer100Km:
              livePkt.canFuelRateLPer100Km ?? v.teltonika.canFuelRateLPer100Km,
            satellites: livePkt.satellites,
            lastHeartbeatIso: livePkt.timestampIso,
          }
        : v.teltonika;

      return {
        ...v,
        currentPosition: livePkt
          ? { lat: livePkt.lat, lng: livePkt.lng }
          : v.currentPosition,
        currentLocationLabel:
          livePkt?.locationLabel ?? v.currentLocationLabel,
        teltonika: mergedTelemetry,
        maintenanceHistory: maintByVehicle[v.id] ?? v.maintenanceHistory,
      };
    });
  }, [rawFleet, maintByVehicle, livePacketsByImei]);

  // Merge Firestore shipments + events subcollections
  const shipments = useMemo<Shipment[]>(() => {
    return rawShipments.map((s) => ({
      ...s,
      traceability: eventsByShipment[s.id] ?? s.traceability,
    }));
  }, [rawShipments, eventsByShipment]);

  // Compute commercial settlement ledger + corporate ESG budget from Firestore records
  const ledger = useMemo<SettlementLedger>(() => {
    let allocated = 0;
    let offsetSpent = 0;
    settlementRecords.forEach((r) => {
      if (r.type === 'esg_budget_allocation') {
        allocated += Math.max(0, r.amountUsd);
      } else if (r.type === 'carbon_retirement') {
        offsetSpent += Math.abs(r.amountUsd);
      }
    });
    const esgBudgetUsd = Number(Math.max(0, allocated - offsetSpent).toFixed(2));
    const totalOffsetSpentUsd = Number(offsetSpent.toFixed(2));

    let pendingReceivablesUsd = 0;
    let settledExternalUsd = 0;
    shipments.forEach((s) => {
      if (s.settlementStatus === 'liquidado_externo') {
        settledExternalUsd += s.priceUsd;
      } else if (s.status !== 'disponible') {
        pendingReceivablesUsd += s.priceUsd;
      }
    });

    return {
      esgBudgetUsd,
      totalOffsetSpentUsd,
      pendingReceivablesUsd: Number(pendingReceivablesUsd.toFixed(2)),
      settledExternalUsd: Number(settledExternalUsd.toFixed(2)),
      autoOffsetEnabled,
      autoOffsetTargetPct: 100,
      records: settlementRecords,
    };
  }, [settlementRecords, shipments, autoOffsetEnabled]);

  const handleGoogleSignIn = useCallback(
    async (preferredRole: UserRole, companyName: string) => {
      setAuthError(null);
      pendingSignupRef.current = {
        role: preferredRole,
        companyName: companyName.trim() || undefined,
      };
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        pendingSignupRef.current = null;
        setAuthError(
          err instanceof Error
            ? err.message
            : 'No fue posible iniciar sesión con Google.'
        );
      }
    },
    []
  );

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  const handleChangeRole = useCallback(
    async (role: UserRole) => {
      if (role === 'admin' && !isAdminUser) return;
      setUserRole(role);
      if (role === 'carrier') setActiveTab('marketplace');
      else if (role === 'shipper') setActiveTab('dispatch');
      if (firebaseUser) {
        await ensureUserProfile(firebaseUser, { role });
      }
    },
    [firebaseUser, isAdminUser]
  );

  const sendTelemetryPacketToServer = useCallback(
    async (vehicle: FleetVehicle) => {
      const nextLat = Number((vehicle.currentPosition.lat + 0.048).toFixed(5));
      const nextLng = Number((vehicle.currentPosition.lng - 0.025).toFixed(5));
      const nextOdo = vehicle.teltonika.odometerKm + 18;
      const nextFuel = Math.max(10, vehicle.teltonika.fuelLevelPct - 1);

      const res = await fetch('/api/telemetry/teltonika', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imei: vehicle.teltonika.imei,
          lat: nextLat,
          lng: nextLng,
          speedKmh: 84,
          odometerKm: nextOdo,
          fuelLevelPct: nextFuel,
          canFuelRateLPer100Km: vehicle.teltonika.canFuelRateLPer100Km,
          ignitionOn: true,
          satellites: 16,
          locationLabel: `${vehicle.currentLocationLabel.split('·')[0].trim()} · Pulso en Ruta`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Error enviando paquete Teltonika.');
      }

      if (
        firebaseUser &&
        (vehicle.ownerId === firebaseUser.uid || isAdminUser)
      ) {
        const pkt = data.packet as TeltonikaPacket;
        await updateVehicleTelemetryInFirestore({
          ...vehicle,
          currentPosition: { lat: pkt.lat, lng: pkt.lng },
          currentLocationLabel:
            pkt.locationLabel ?? vehicle.currentLocationLabel,
          teltonika: {
            ...vehicle.teltonika,
            ignitionOn: pkt.ignitionOn,
            speedKmh: pkt.speedKmh,
            odometerKm: pkt.odometerKm ?? nextOdo,
            fuelLevelPct: pkt.fuelLevelPct ?? nextFuel,
            lastHeartbeatIso: pkt.timestampIso,
          },
        });
      }

      setBannerFeedback({
        type: 'success',
        message: `Paquete Teltonika HTTP/WS procesado para ${vehicle.plate} (IMEI ${vehicle.teltonika.imei}): +18 km registrados.`,
      });
    },
    [firebaseUser, isAdminUser]
  );

  const handleSimulateTelemetryPulse = useCallback(
    async (vehicleId: string) => {
      const target = fleet.find((v) => v.id === vehicleId);
      if (!target) return;
      try {
        await sendTelemetryPacketToServer(target);
      } catch (err) {
        setBannerFeedback({
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'No se pudo procesar el pulso Teltonika.',
        });
      }
    },
    [fleet, sendTelemetryPacketToServer]
  );

  const handleDispatchTeltonikaWebhookTest = useCallback(
    async (vehicle: FleetVehicle) => {
      try {
        await sendTelemetryPacketToServer(vehicle);
      } catch (err) {
        setBannerFeedback({
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Error probando gateway HTTP Teltonika.',
        });
      }
    },
    [sendTelemetryPacketToServer]
  );

  const handleAssignShipment = useCallback(
    async (shipmentId: string, vehicleId: string) => {
      if (!firebaseUser) return;
      const targetLoad = shipments.find((s) => s.id === shipmentId);
      const targetVeh = fleet.find((v) => v.id === vehicleId);
      if (!targetLoad || !targetVeh) return;

      const dueDateIso = computeDueDateIso(
        new Date().toISOString(),
        targetLoad.paymentTerms
      );

      await acceptAndDispatchShipmentInFirestore({
        uid: firebaseUser.uid,
        shipment: targetLoad,
        vehicle: targetVeh,
        dueDateIso,
      });

      await createNotificationInFirestore(firebaseUser.uid, {
        severity: 'success',
        category: targetLoad.mode === 'ruta_vacia' ? 'ruta_vacia' : 'liquidacion',
        title: `Carga ${targetLoad.code} despachada`,
        message: `${targetVeh.unitName} inició ruta con monitoreo Teltonika. Acuerdo comercial externo por $${targetLoad.priceUsd} USD.`,
      });

      setBannerFeedback({
        type: 'success',
        message: `Envío ${targetLoad.code} asignado a ${targetVeh.unitName} y en tránsito.`,
      });
    },
    [firebaseUser, shipments, fleet]
  );

  const handleAdvanceShipmentStatus = useCallback(
    async (shipmentId: string, nextStatus: 'entregado') => {
      if (!firebaseUser) return;
      await advanceShipmentStatusInFirestore({
        uid: firebaseUser.uid,
        shipmentId,
        nextStatus,
      });
      setBannerFeedback({
        type: 'success',
        message:
          'Entrega confirmada en destino. Listo para facturación y liquidación externa.',
      });
    },
    [firebaseUser]
  );

  const handleOffsetShipment = useCallback(
    async (shipmentId: string, projectId: string) => {
      if (!firebaseUser) return;
      const target = shipments.find((s) => s.id === shipmentId);
      const project = REFORESTATION_PROJECTS.find((p) => p.id === projectId);
      if (!target || !project || target.offsetCompleted) return;

      const tons = target.co2Kg / 1000;
      const costUsd = Number(
        Math.max(
          0.5,
          tons * (project.pricePerTonUsd || CARBON_PRICE_PER_TON_USD)
        ).toFixed(2)
      );
      const nowIso = new Date().toISOString();

      const budgetCheck = processEsgBudgetOffset({
        ledger,
        amountUsd: costUsd,
        description: `Compensación ${target.co2Kg} kg CO₂e (${target.code}) · ${project.name}`,
        shipmentId: target.id,
        timestampIso: nowIso,
      });

      if (!budgetCheck.ok) {
        setBannerFeedback({
          type: 'error',
          message:
            budgetCheck.error ||
            'Presupuesto ESG insuficiente para ejecutar compensación.',
        });
        return;
      }

      const assignedVeh =
        fleet.find((v) => v.id === target.assignedVehicleId) ?? fleet[0];

      try {
        const [retireRes, anchorRes] = await Promise.all([
          fetch('/api/carbon/retire', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              co2Kg: target.co2Kg,
              projectId: project.id,
              patchProjectId: project.patchProjectId,
              registryCode: project.registryCode,
              shipmentCode: target.code,
            }),
          }),
          fetch('/api/blockchain/anchor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shipmentId: target.id,
              shipmentCode: target.code,
              teltonikaImei: assignedVeh?.teltonika.imei ?? '352093080000000',
              distanceKm: target.distanceKm,
              fuelConsumedLiters: target.estimatedFuelLiters,
              co2CompensatedKg: target.co2Kg,
              projectId: project.id,
              registryCode: project.registryCode,
              issuedAtIso: nowIso,
            }),
          }),
        ]);

        const retireData = await retireRes.json();
        const anchorData = await anchorRes.json();

        if (!retireRes.ok) {
          throw new Error(
            retireData?.error || 'Error registrando retiro de carbono.'
          );
        }
        if (!anchorRes.ok) {
          throw new Error(
            anchorData?.error || 'Error anclando certificado en Blockchain.'
          );
        }

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
          anchorProof: {
            txHash: anchorData.txHash,
            blockNumber: anchorData.blockNumber ?? 0,
            anchorMode: anchorData.anchorMode,
            networkName: anchorData.networkName,
            explorerUrl: anchorData.explorerUrl,
            signature: anchorData.signature,
            signerAddress: anchorData.signerAddress,
          },
          registryProof: {
            registryProvider: retireData.registryProvider,
            registryOrderId: retireData.registryOrderId,
            registryStatus: retireData.registryStatus,
          },
        });

        await mintCertificateAtomicallyInFirestore({
          uid: firebaseUser.uid,
          shipment: target,
          certificate: cert,
          projectId: project.id,
        });

        await createNotificationInFirestore(firebaseUser.uid, {
          severity: 'success',
          category: 'carbono',
          title: `Certificado ${cert.certificateCode} emitido`,
          message: `${target.co2Kg} kg CO₂e compensados en ${project.name} (${cert.networkName}).`,
        });

        setBannerFeedback({
          type: 'success',
          message: `Certificado público ${cert.certificateCode} emitido (${cert.networkName}).`,
        });
      } catch (err) {
        setBannerFeedback({
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'No se pudo emitir el certificado ESG.',
        });
      }
    },
    [firebaseUser, shipments, ledger, fleet, certificates.length]
  );

  const handleAddMaintenance = useCallback(
    async (
      vehicleId: string,
      record: Omit<MaintenanceRecord, 'id' | 'vehicleId'>
    ) => {
      if (!firebaseUser) return;
      const veh = fleet.find((v) => v.id === vehicleId);
      if (!veh) return;
      const newRecord: MaintenanceRecord = {
        ...record,
        id: `mnt-${Date.now()}`,
        ownerId: firebaseUser.uid,
        vehicleId,
      };
      const nextDueKm =
        record.nextDueOdometerKm ?? veh.teltonika.odometerKm + 20000;
      const nextDateIso = new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000
      ).toISOString();

      await logMaintenanceInFirestore(
        firebaseUser.uid,
        veh,
        newRecord,
        nextDueKm,
        nextDateIso
      );

      setMaintByVehicle((prev) => ({
        ...prev,
        [vehicleId]: [newRecord, ...(prev[vehicleId] ?? [])],
      }));

      setBannerFeedback({
        type: 'success',
        message:
          'Mantención registrada en Firestore y alertas de kilometraje recalibradas.',
      });
    },
    [firebaseUser, fleet]
  );

  const handleAddVehicle = useCallback(
    async (payload: {
      unitName: string;
      plate: string;
      driverName: string;
      vehicleClass: VehicleClass;
      fuelType: FuelType;
      maxPayloadTons: number;
      imei: string;
      odometerKm: number;
    }) => {
      if (!firebaseUser) return;
      const nextVeh: FleetVehicle = {
        id: `veh-${Date.now()}`,
        ownerId: firebaseUser.uid,
        visibility: 'shared_dispatch',
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
      await createVehicleInFirestore(firebaseUser.uid, nextVeh);
      setBannerFeedback({
        type: 'success',
        message: `Unidad ${payload.unitName} (${payload.plate}) vinculada en Firestore con Teltonika IMEI ${payload.imei}.`,
      });
    },
    [firebaseUser]
  );

  const handleCreateLoad = useCallback(
    async (payload: {
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
    }) => {
      if (!firebaseUser) return;
      const code = `TC-${Math.floor(4900 + Math.random() * 900)}`;
      const nowIso = new Date().toISOString();
      const newShipment: Shipment = {
        id: `ship-${Date.now()}`,
        code,
        title: payload.title,
        cargoType: payload.cargoType,
        mode: payload.mode,
        status: 'disponible',
        shipperId: firebaseUser.uid,
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
        paymentTerms: payload.paymentTerms,
        settlementStatus: 'pendiente_entrega',
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
            actorId: firebaseUser.uid,
            timestampIso: nowIso,
            title: `Solicitud ${code} publicada en mercado en tiempo real`,
            detail: `${payload.originName} → ${payload.destinationName} (${payload.distanceKm} km · $${payload.priceUsd} USD · Pago externo).`,
            source: 'Google Maps',
          },
        ],
      };

      await createShipmentInFirestore(firebaseUser.uid, newShipment);
      setActiveTab('marketplace');
      await createNotificationInFirestore(firebaseUser.uid, {
        severity: 'info',
        category: payload.mode === 'ruta_vacia' ? 'ruta_vacia' : 'liquidacion',
        title: `Nueva carga publicada: ${code}`,
        message: `${payload.title} (${payload.originName} → ${payload.destinationName}) por $${payload.priceUsd} USD.`,
      });
      setBannerFeedback({
        type: 'success',
        message: `Carga ${code} publicada exitosamente en el Mercado Spot.`,
      });
    },
    [firebaseUser]
  );

  const handleAllocateEsgBudget = useCallback(
    async (amountUsd: number, reference: string) => {
      if (!firebaseUser) return;
      await allocateEsgBudgetInFirestore(firebaseUser.uid, amountUsd, reference);
      setBannerFeedback({
        type: 'success',
        message: `Presupuesto ESG incrementado por $${amountUsd.toFixed(2)} USD (Ref. ${reference}).`,
      });
    },
    [firebaseUser]
  );

  const handleRecordExternalSettlement = useCallback(
    async (params: {
      shipment: Shipment;
      settlementStatus: SettlementStatus;
      invoiceFolio: string;
      externalPaymentRef: string;
    }) => {
      if (!firebaseUser) return;
      await recordOffPlatformSettlementInFirestore({
        uid: firebaseUser.uid,
        ...params,
      });
      setBannerFeedback({
        type: 'success',
        message: `Liquidación externa registrada para ${params.shipment.code} (${params.invoiceFolio}).`,
      });
    },
    [firebaseUser]
  );

  const handleAddTicket = useCallback(
    async (ticket: SupportTicket) => {
      if (!firebaseUser) return;
      await createSupportTicketInFirestore(firebaseUser.uid, ticket);
      setBannerFeedback({
        type: 'success',
        message: `Ticket ${ticket.id} registrado en soporte 24/7.`,
      });
    },
    [firebaseUser]
  );

  const handleOpenPublicCertificate = useCallback((certCode: string) => {
    const nextUrl = `${window.location.pathname}?cert=${encodeURIComponent(certCode)}`;
    window.history.pushState({}, '', nextUrl);
    setPublicCertCode(certCode);
  }, []);

  const handleBackFromPublicCert = useCallback(() => {
    window.history.pushState({}, '', window.location.pathname);
    setPublicCertCode(null);
  }, []);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const criticalMaintenanceCount = useMemo(
    () =>
      fleet.filter(
        (v) =>
          evaluateMaintenanceStatus(v, new Date().toISOString()).level !== 'nominal'
      ).length,
    [fleet]
  );

  // Public unauthenticated ESG certificate verification portal (?cert=TC-ESG-...)
  if (publicCertCode) {
    return (
      <PublicCertificateView
        certCode={publicCertCode}
        onBackToApp={handleBackFromPublicCert}
      />
    );
  }

  // Require real Google Sign-In for operational workspace
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0D1F1B] text-white flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-base font-bold tracking-tight">TerraCarga</p>
          <p className="text-xs text-emerald-300">
            Verificando sesión segura y base de datos en tiempo real...
          </p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <AuthGate
        loading={authLoading}
        authError={authError}
        onGoogleSignIn={handleGoogleSignIn}
      />
    );
  }

  const appShell = (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        userRole={userRole}
        isAdminUser={isAdminUser}
        userProfile={userProfile}
        wsConnected={wsConnected}
        onChangeRole={handleChangeRole}
        onSignOut={handleSignOut}
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
          esgBudgetUsd={ledger.esgBudgetUsd}
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
              onAdvanceStatus={handleAdvanceShipmentStatus}
              onOpenNewLoad={() => setNewLoadOpen(true)}
            />
          )}

          {activeTab === 'fleet' && (
            <FleetTeltonikaView
              fleet={fleet}
              wsConnected={wsConnected}
              onAddMaintenance={handleAddMaintenance}
              onAddVehicle={handleAddVehicle}
              onDispatchTeltonikaWebhookTest={handleDispatchTeltonikaWebhookTest}
            />
          )}

          {activeTab === 'carbon' && (
            <CarbonBlockchainView
              shipments={shipments}
              projects={REFORESTATION_PROJECTS}
              certificates={certificates}
              esgBudgetUsd={ledger.esgBudgetUsd}
              onOffsetShipment={handleOffsetShipment}
              onOpenPublicCertificate={handleOpenPublicCertificate}
            />
          )}

          {activeTab === 'wallet' && (
            <WalletAnalyticsView
              ledger={ledger}
              shipments={shipments}
              fleet={fleet}
              onToggleAutoOffset={() => setAutoOffsetEnabled((prev) => !prev)}
              onAllocateEsgBudget={handleAllocateEsgBudget}
              onRecordExternalSettlement={handleRecordExternalSettlement}
            />
          )}
        </main>
      </div>

      <NewLoadModal
        open={newLoadOpen}
        mapsAvailable={Boolean(mapsApiKey)}
        defaultShipperName={userProfile?.companyName}
        onClose={() => setNewLoadOpen(false)}
        onCreateLoad={handleCreateLoad}
      />

      <NotificationsDrawer
        open={notifOpen}
        notifications={notifications}
        onClose={() => setNotifOpen(false)}
        onMarkAllRead={() => markAllNotificationsReadInFirestore(notifications)}
      />

      <SupportDrawer
        open={supportOpen}
        tickets={tickets}
        onClose={() => setSupportOpen(false)}
        onAddTicket={handleAddTicket}
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

export default function App() {
  return (
    <AppErrorBoundary>
      <TerraCargaApp />
    </AppErrorBoundary>
  );
}
