import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  INITIAL_FLEET,
  INITIAL_NOTIFICATIONS,
  INITIAL_SETTLEMENT_LEDGER,
  INITIAL_SHIPMENTS,
  INITIAL_TICKETS,
  REFORESTATION_PROJECTS,
} from '../data/seedData';
import type {
  BlockchainCertificate,
  FleetVehicle,
  MaintenanceRecord,
  PaymentTerms,
  PushNotificationItem,
  SettlementRecord,
  SettlementStatus,
  Shipment,
  SupportTicket,
  TraceabilityEvent,
  UserProfile,
  UserRole,
} from '../types/logistics';
import { mintBlockchainCertificate } from '../utils/logisticsEngine';

const BOOTSTRAP_ADMIN_EMAIL = 'pensando@fueradelacaja.co';

export function isBootstrapAdminUser(user: User | null): boolean {
  return Boolean(
    user?.email &&
      user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL &&
      user.emailVerified
  );
}

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function tsToIso(val: unknown, fallback = new Date().toISOString()): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return fallback;
}

export async function ensureUserProfile(
  user: User,
  overrides?: { role?: UserRole; companyName?: string; displayName?: string; phone?: string; taxId?: string }
): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'profile');

  try {
    const existingSnap = await getDoc(userRef);
    const isAdminEmail = isBootstrapAdminUser(user);

    if (!existingSnap.exists()) {
      const defaultRole: UserRole = isAdminEmail
        ? 'admin'
        : overrides?.role && overrides.role !== 'admin'
          ? overrides.role
          : 'carrier';
      const displayName = clampStr(
        overrides?.displayName || user.displayName || 'Operador TerraCarga',
        120
      );
      const companyName = clampStr(
        overrides?.companyName ||
          (user.email ? `Flota ${user.email.split('@')[0]}` : 'Operador Logístico'),
        140
      );

      const batch = writeBatch(db);
      batch.set(userRef, {
        uid: user.uid,
        displayName,
        companyName,
        role: defaultRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(privateRef, {
        uid: user.uid,
        email: clampStr(user.email || 'sin-correo@terracarga.app', 160),
        phone: clampStr(overrides?.phone || '', 40),
        taxId: clampStr(overrides?.taxId || '', 40),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      return {
        uid: user.uid,
        displayName,
        companyName,
        role: defaultRole,
        email: user.email || undefined,
      };
    }

    const data = existingSnap.data();
    const privateSnap = await getDoc(privateRef);
    const privData = privateSnap.exists() ? privateSnap.data() : {};

    if (overrides && (overrides.role || overrides.companyName || overrides.displayName)) {
      const nextRole: UserRole =
        overrides.role === 'admin' && !isAdminEmail
          ? (data.role as UserRole)
          : overrides.role || (data.role as UserRole);
      const nextDisplayName = clampStr(
        overrides.displayName || String(data.displayName || 'Operador'),
        120
      );
      const nextCompany = clampStr(
        overrides.companyName || String(data.companyName || 'TerraCarga'),
        140
      );

      await updateDoc(userRef, {
        displayName: nextDisplayName,
        companyName: nextCompany,
        role: nextRole,
        updatedAt: serverTimestamp(),
      });

      if (overrides.phone !== undefined || overrides.taxId !== undefined) {
        await updateDoc(privateRef, {
          email: clampStr(user.email || String(privData.email || ''), 160),
          phone: clampStr(overrides.phone ?? String(privData.phone || ''), 40),
          taxId: clampStr(overrides.taxId ?? String(privData.taxId || ''), 40),
          updatedAt: serverTimestamp(),
        });
      }

      return {
        uid: user.uid,
        displayName: nextDisplayName,
        companyName: nextCompany,
        role: nextRole,
        email: String(privData.email || user.email || ''),
        phone: String(privData.phone || ''),
        taxId: String(privData.taxId || ''),
      };
    }

    return {
      uid: user.uid,
      displayName: String(data.displayName || user.displayName || 'Operador'),
      companyName: String(data.companyName || 'TerraCarga'),
      role: (data.role as UserRole) || 'carrier',
      email: String(privData.email || user.email || ''),
      phone: String(privData.phone || ''),
      taxId: String(privData.taxId || ''),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function seedInitialWorkspaceForUser(
  uid: string,
  companyName: string
): Promise<void> {
  try {
    const existingVeh = await getDocs(
      query(collection(db, 'vehicles'), where('ownerId', '==', uid), limit(1))
    );
    const existingShip = await getDocs(
      query(collection(db, 'shipments'), where('shipperId', '==', uid), limit(1))
    );
    if (!existingVeh.empty || !existingShip.empty) {
      return;
    }

    const prefix = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'usr';
    const batch = writeBatch(db);
    const vehicleIdMap = new Map<string, string>();

    for (const v of INITIAL_FLEET) {
      const newVid = `${prefix}-${v.id}`;
      vehicleIdMap.set(v.id, newVid);
      batch.set(doc(db, 'vehicles', newVid), {
        ownerId: uid,
        visibility: v.visibility ?? 'shared_dispatch',
        plate: v.plate,
        unitName: v.unitName,
        vehicleClass: v.vehicleClass,
        fuelType: v.fuelType,
        maxPayloadTons: v.maxPayloadTons,
        driverName: v.driverName,
        status: v.status,
        currentPosition: v.currentPosition,
        currentLocationLabel: v.currentLocationLabel,
        ...(v.emptyBackhaulTo ? { emptyBackhaulTo: v.emptyBackhaulTo } : {}),
        nextServiceOdometerKm: v.nextServiceOdometerKm,
        nextServiceDateIso: v.nextServiceDateIso,
        teltonika: v.teltonika,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const m of v.maintenanceHistory) {
        const mid = `${prefix}-${m.id}`;
        batch.set(doc(db, 'vehicles', newVid, 'maintenance', mid), {
          ownerId: uid,
          vehicleId: newVid,
          type: m.type,
          title: m.title,
          odometerAtServiceKm: m.odometerAtServiceKm,
          dateIso: m.dateIso,
          costUsd: m.costUsd,
          technicianNotes: m.technicianNotes,
          ...(m.nextDueOdometerKm !== undefined
            ? { nextDueOdometerKm: m.nextDueOdometerKm }
            : {}),
          createdAt: serverTimestamp(),
        });
      }
    }

    // Seed shipments (first 4 active/spot + 1 certified delivered with atomic cert)
    const deliveredShipId = `${prefix}-ship-105`;
    const seededCert = mintBlockchainCertificate({
      shipmentId: deliveredShipId,
      shipmentCode: 'TC-4790',
      vehiclePlate: '84-AK-7M',
      teltonikaImei: '352093089412014',
      distanceKm: 214,
      fuelConsumedLiters: 71.3,
      co2CompensatedKg: 191.1,
      offsetCostUsd: 4.68,
      projectId: REFORESTATION_PROJECTS[0].id,
      projectName: REFORESTATION_PROJECTS[0].name,
      standard: 'Verra VCS · VCS-2491-MX',
      issuedAtIso: '2026-11-19T14:15:00Z',
      existingBlockCount: 1,
    });

    for (const s of INITIAL_SHIPMENTS) {
      const newSid = `${prefix}-${s.id}`;
      const mappedVeh = s.assignedVehicleId
        ? vehicleIdMap.get(s.assignedVehicleId)
        : undefined;
      const isDeliveredSample = s.id === 'ship-105';

      if (isDeliveredSample) {
        batch.set(doc(db, 'certificates', seededCert.certificateCode), {
          issuerId: uid,
          visibility: 'public_verifiable',
          certificateCode: seededCert.certificateCode,
          shipmentId: deliveredShipId,
          shipmentCode: seededCert.shipmentCode,
          vehiclePlate: seededCert.vehiclePlate,
          teltonikaImei: seededCert.teltonikaImei,
          distanceKm: seededCert.distanceKm,
          fuelConsumedLiters: seededCert.fuelConsumedLiters,
          co2CompensatedKg: seededCert.co2CompensatedKg,
          offsetCostUsd: seededCert.offsetCostUsd,
          projectId: seededCert.projectId,
          projectName: seededCert.projectName,
          txHash: seededCert.txHash,
          blockNumber: seededCert.blockNumber,
          anchorMode: seededCert.anchorMode,
          networkName: seededCert.networkName,
          registryProvider: seededCert.registryProvider || 'Verra VCS',
          registryStatus: seededCert.registryStatus,
          issuedAtIso: seededCert.issuedAtIso,
          standard: seededCert.standard,
          createdAt: serverTimestamp(),
        });
      }

      batch.set(doc(db, 'shipments', newSid), {
        code: s.code,
        title: s.title,
        cargoType: s.cargoType,
        mode: s.mode,
        status: s.status,
        shipperId: uid,
        shipperName: s.shipperName || companyName,
        ...(mappedVeh ? { carrierId: uid, assignedVehicleId: mappedVeh } : {}),
        originName: s.originName,
        originCoords: s.originCoords,
        destinationName: s.destinationName,
        destinationCoords: s.destinationCoords,
        distanceKm: s.distanceKm,
        estimatedDurationMin: s.estimatedDurationMin,
        trafficDelayPct: s.trafficDelayPct,
        payloadTons: s.payloadTons,
        priceUsd: s.priceUsd,
        paymentTerms: s.paymentTerms,
        settlementStatus: s.settlementStatus,
        ...(s.invoiceFolio ? { invoiceFolio: s.invoiceFolio } : {}),
        ...(s.externalPaymentRef ? { externalPaymentRef: s.externalPaymentRef } : {}),
        backhaulDiscountPct: s.backhaulDiscountPct,
        scheduledDateIso: s.scheduledDateIso,
        fuelType: s.fuelType,
        estimatedFuelLiters: s.estimatedFuelLiters,
        co2Kg: s.co2Kg,
        ecoRouteSavedCo2Kg: s.ecoRouteSavedCo2Kg,
        offsetCompleted: isDeliveredSample,
        ...(isDeliveredSample
          ? {
              offsetProjectId: seededCert.projectId,
              certificateId: seededCert.certificateCode,
            }
          : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const ev of s.traceability) {
        const eid = `${prefix}-${ev.id}`;
        batch.set(doc(db, 'shipments', newSid, 'events', eid), {
          actorId: uid,
          timestampIso: ev.timestampIso,
          title: ev.title,
          detail: ev.detail,
          source: ev.source,
          createdAt: serverTimestamp(),
        });
      }
    }

    for (const r of INITIAL_SETTLEMENT_LEDGER.records) {
      const rid = `${prefix}-${r.id}`;
      batch.set(doc(db, 'settlements', rid), {
        ownerId: uid,
        shipmentId: r.shipmentId.startsWith('ship-')
          ? `${prefix}-${r.shipmentId}`
          : r.shipmentId,
        type: r.type,
        description: r.description,
        amountUsd: r.amountUsd,
        paymentTerms: r.paymentTerms,
        ...(r.dueDateIso ? { dueDateIso: r.dueDateIso } : {}),
        ...(r.invoiceFolio ? { invoiceFolio: r.invoiceFolio } : {}),
        ...(r.externalRef ? { externalRef: r.externalRef } : {}),
        status: r.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const n of INITIAL_NOTIFICATIONS) {
      const nid = `${prefix}-${n.id}`;
      batch.set(doc(db, 'notifications', nid), {
        recipientId: uid,
        severity: n.severity,
        category: n.category,
        title: n.title,
        message: n.message,
        read: n.read,
        createdAt: serverTimestamp(),
      });
    }

    for (const t of INITIAL_TICKETS) {
      const tid = `${prefix}-${t.id}`;
      batch.set(doc(db, 'supportTickets', tid), {
        authorId: uid,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        ...(t.aiDiagnosticSummary
          ? { aiDiagnosticSummary: t.aiDiagnosticSummary }
          : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'workspace/seed');
  }
}

export function subscribeToVehicles(
  user: User,
  onChange: (vehicles: FleetVehicle[]) => void
): () => void {
  const isAdmin = isBootstrapAdminUser(user);
  const byId = new Map<string, FleetVehicle>();
  const maintByVehicle = new Map<string, MaintenanceRecord[]>();

  const emit = () => {
    const merged = Array.from(byId.values()).map((v) => ({
      ...v,
      maintenanceHistory: maintByVehicle.get(v.id) ?? v.maintenanceHistory,
    }));
    onChange(merged);
  };

  const handleSnap = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    docs.forEach((d) => {
      const data = d.data();
      byId.set(d.id, {
        id: d.id,
        ownerId: String(data.ownerId || ''),
        visibility: (data.visibility as 'private' | 'shared_dispatch') || 'shared_dispatch',
        plate: String(data.plate || ''),
        unitName: String(data.unitName || ''),
        vehicleClass: data.vehicleClass as FleetVehicle['vehicleClass'],
        fuelType: data.fuelType as FleetVehicle['fuelType'],
        maxPayloadTons: Number(data.maxPayloadTons || 0),
        driverName: String(data.driverName || ''),
        status: data.status as FleetVehicle['status'],
        currentPosition: data.currentPosition as FleetVehicle['currentPosition'],
        currentLocationLabel: String(data.currentLocationLabel || ''),
        emptyBackhaulTo: data.emptyBackhaulTo
          ? String(data.emptyBackhaulTo)
          : undefined,
        nextServiceOdometerKm: Number(data.nextServiceOdometerKm || 0),
        nextServiceDateIso: String(data.nextServiceDateIso || ''),
        teltonika: data.teltonika as FleetVehicle['teltonika'],
        maintenanceHistory: maintByVehicle.get(d.id) ?? [],
      });
    });
    emit();
  };

  const unsubs: Array<() => void> = [];
  if (isAdmin) {
    unsubs.push(
      onSnapshot(
        collection(db, 'vehicles'),
        (snap) => {
          byId.clear();
          handleSnap(snap.docs);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles')
      )
    );
  } else {
    const qOwn = query(collection(db, 'vehicles'), where('ownerId', '==', user.uid));
    const qShared = query(
      collection(db, 'vehicles'),
      where('visibility', '==', 'shared_dispatch')
    );
    unsubs.push(
      onSnapshot(
        qOwn,
        (snap) => handleSnap(snap.docs),
        (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles')
      ),
      onSnapshot(
        qShared,
        (snap) => handleSnap(snap.docs),
        (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles')
      )
    );
  }

  return () => unsubs.forEach((u) => u());
}

export async function fetchVehicleMaintenanceHistory(
  user: User,
  vehicleId: string
): Promise<MaintenanceRecord[]> {
  try {
    const isAdmin = isBootstrapAdminUser(user);
    const q = isAdmin
      ? collection(db, 'vehicles', vehicleId, 'maintenance')
      : query(
          collection(db, 'vehicles', vehicleId, 'maintenance'),
          where('ownerId', '==', user.uid)
        );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ownerId: String(data.ownerId || ''),
        vehicleId: String(data.vehicleId || vehicleId),
        type: data.type as MaintenanceRecord['type'],
        title: String(data.title || ''),
        odometerAtServiceKm: Number(data.odometerAtServiceKm || 0),
        dateIso: String(data.dateIso || ''),
        costUsd: Number(data.costUsd || 0),
        technicianNotes: String(data.technicianNotes || ''),
        nextDueOdometerKm:
          typeof data.nextDueOdometerKm === 'number'
            ? data.nextDueOdometerKm
            : undefined,
      };
    });
  } catch {
    return [];
  }
}

export function subscribeToShipments(
  user: User,
  onChange: (shipments: Shipment[]) => void
): () => void {
  const isAdmin = isBootstrapAdminUser(user);
  const byId = new Map<string, Shipment>();

  const handleSnap = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    docs.forEach((d) => {
      const data = d.data();
      const prev = byId.get(d.id);
      byId.set(d.id, {
        id: d.id,
        code: String(data.code || ''),
        title: String(data.title || ''),
        cargoType: String(data.cargoType || ''),
        mode: data.mode as Shipment['mode'],
        status: data.status as Shipment['status'],
        shipperId: String(data.shipperId || ''),
        shipperName: String(data.shipperName || ''),
        carrierId: data.carrierId ? String(data.carrierId) : undefined,
        assignedVehicleId: data.assignedVehicleId
          ? String(data.assignedVehicleId)
          : undefined,
        originName: String(data.originName || ''),
        originCoords: data.originCoords as Shipment['originCoords'],
        destinationName: String(data.destinationName || ''),
        destinationCoords: data.destinationCoords as Shipment['destinationCoords'],
        distanceKm: Number(data.distanceKm || 0),
        estimatedDurationMin: Number(data.estimatedDurationMin || 0),
        trafficDelayPct: Number(data.trafficDelayPct || 0),
        payloadTons: Number(data.payloadTons || 0),
        priceUsd: Number(data.priceUsd || 0),
        paymentTerms: (data.paymentTerms as PaymentTerms) || 'credito_30',
        settlementStatus:
          (data.settlementStatus as SettlementStatus) || 'pendiente_entrega',
        invoiceFolio: data.invoiceFolio ? String(data.invoiceFolio) : undefined,
        externalPaymentRef: data.externalPaymentRef
          ? String(data.externalPaymentRef)
          : undefined,
        backhaulDiscountPct: Number(data.backhaulDiscountPct || 0),
        scheduledDateIso: String(data.scheduledDateIso || ''),
        fuelType: data.fuelType as Shipment['fuelType'],
        estimatedFuelLiters: Number(data.estimatedFuelLiters || 0),
        co2Kg: Number(data.co2Kg || 0),
        ecoRouteSavedCo2Kg: Number(data.ecoRouteSavedCo2Kg || 0),
        offsetCompleted: Boolean(data.offsetCompleted),
        offsetProjectId: data.offsetProjectId
          ? String(data.offsetProjectId)
          : undefined,
        certificateId: data.certificateId ? String(data.certificateId) : undefined,
        traceability: prev?.traceability ?? [],
      });
    });

    const sorted = Array.from(byId.values()).sort((a, b) =>
      b.scheduledDateIso.localeCompare(a.scheduledDateIso)
    );
    onChange(sorted);
  };

  const unsubs: Array<() => void> = [];
  if (isAdmin) {
    unsubs.push(
      onSnapshot(
        collection(db, 'shipments'),
        (snap) => {
          byId.clear();
          handleSnap(snap.docs);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'shipments')
      )
    );
  } else {
    unsubs.push(
      onSnapshot(
        query(collection(db, 'shipments'), where('status', '==', 'disponible')),
        (snap) => handleSnap(snap.docs),
        (err) => handleFirestoreError(err, OperationType.LIST, 'shipments')
      ),
      onSnapshot(
        query(collection(db, 'shipments'), where('shipperId', '==', user.uid)),
        (snap) => handleSnap(snap.docs),
        (err) => handleFirestoreError(err, OperationType.LIST, 'shipments')
      ),
      onSnapshot(
        query(collection(db, 'shipments'), where('carrierId', '==', user.uid)),
        (snap) => handleSnap(snap.docs),
        (err) => handleFirestoreError(err, OperationType.LIST, 'shipments')
      )
    );
  }

  return () => unsubs.forEach((u) => u());
}

export async function fetchShipmentEvents(
  user: User,
  shipmentId: string
): Promise<TraceabilityEvent[]> {
  try {
    const isAdmin = isBootstrapAdminUser(user);
    const q = isAdmin
      ? collection(db, 'shipments', shipmentId, 'events')
      : query(
          collection(db, 'shipments', shipmentId, 'events'),
          where('actorId', '==', user.uid)
        );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          actorId: String(data.actorId || ''),
          timestampIso: String(data.timestampIso || ''),
          title: String(data.title || ''),
          detail: String(data.detail || ''),
          source: data.source as TraceabilityEvent['source'],
        };
      })
      .sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));
  } catch {
    return [];
  }
}

export function subscribeToCertificates(
  user: User,
  onChange: (certs: BlockchainCertificate[]) => void
): () => void {
  const isAdmin = isBootstrapAdminUser(user);
  const q = isAdmin
    ? collection(db, 'certificates')
    : query(
        collection(db, 'certificates'),
        where('visibility', '==', 'public_verifiable')
      );

  return onSnapshot(
    q,
    (snap) => {
      const list: BlockchainCertificate[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          issuerId: String(data.issuerId || ''),
          visibility: 'public_verifiable',
          certificateCode: String(data.certificateCode || d.id),
          shipmentId: String(data.shipmentId || ''),
          shipmentCode: String(data.shipmentCode || ''),
          vehiclePlate: String(data.vehiclePlate || ''),
          teltonikaImei: String(data.teltonikaImei || ''),
          distanceKm: Number(data.distanceKm || 0),
          fuelConsumedLiters: Number(data.fuelConsumedLiters || 0),
          co2CompensatedKg: Number(data.co2CompensatedKg || 0),
          offsetCostUsd: Number(data.offsetCostUsd || 0),
          projectId: String(data.projectId || ''),
          projectName: String(data.projectName || ''),
          txHash: String(data.txHash || ''),
          blockNumber: Number(data.blockNumber || 0),
          anchorMode:
            (data.anchorMode as BlockchainCertificate['anchorMode']) ||
            'ecdsa_attestation',
          networkName: String(data.networkName || ''),
          explorerUrl: data.explorerUrl ? String(data.explorerUrl) : undefined,
          signature: data.signature ? String(data.signature) : undefined,
          signerAddress: data.signerAddress ? String(data.signerAddress) : undefined,
          registryProvider: data.registryProvider
            ? String(data.registryProvider)
            : undefined,
          registryOrderId: data.registryOrderId
            ? String(data.registryOrderId)
            : undefined,
          registryStatus:
            (data.registryStatus as BlockchainCertificate['registryStatus']) ||
            'pending_registry_settlement',
          issuedAtIso: String(data.issuedAtIso || ''),
          standard: String(data.standard || ''),
        };
      });
      list.sort((a, b) => b.issuedAtIso.localeCompare(a.issuedAtIso));
      onChange(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'certificates')
  );
}

export function subscribeToSettlements(
  user: User,
  onChange: (records: SettlementRecord[]) => void
): () => void {
  const isAdmin = isBootstrapAdminUser(user);
  const byId = new Map<string, SettlementRecord>();

  const handleSnap = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    docs.forEach((d) => {
      const data = d.data();
      byId.set(d.id, {
        id: d.id,
        ownerId: String(data.ownerId || ''),
        counterpartyId: data.counterpartyId
          ? String(data.counterpartyId)
          : undefined,
        shipmentId: String(data.shipmentId || ''),
        timestampIso: tsToIso(data.createdAt),
        type: data.type as SettlementRecord['type'],
        description: String(data.description || ''),
        amountUsd: Number(data.amountUsd || 0),
        paymentTerms: data.paymentTerms as SettlementRecord['paymentTerms'],
        dueDateIso: data.dueDateIso ? String(data.dueDateIso) : undefined,
        invoiceFolio: data.invoiceFolio ? String(data.invoiceFolio) : undefined,
        externalRef: data.externalRef ? String(data.externalRef) : undefined,
        status: data.status as SettlementRecord['status'],
      });
    });
    const sorted = Array.from(byId.values()).sort((a, b) =>
      b.timestampIso.localeCompare(a.timestampIso)
    );
    onChange(sorted);
  };

  const unsubs: Array<() => void> = [];
  if (isAdmin) {
    unsubs.push(
      onSnapshot(
        collection(db, 'settlements'),
        (snap) => {
          byId.clear();
          handleSnap(snap.docs);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'settlements')
      )
    );
  } else {
    unsubs.push(
      onSnapshot(
        query(collection(db, 'settlements'), where('ownerId', '==', user.uid)),
        (snap) => handleSnap(snap.docs),
        (err) => handleFirestoreError(err, OperationType.LIST, 'settlements')
      ),
      onSnapshot(
        query(collection(db, 'settlements'), where('counterpartyId', '==', user.uid)),
        (snap) => handleSnap(snap.docs),
        (err) => handleFirestoreError(err, OperationType.LIST, 'settlements')
      )
    );
  }

  return () => unsubs.forEach((u) => u());
}

export function subscribeToNotifications(
  user: User,
  onChange: (items: PushNotificationItem[]) => void
): () => void {
  const isAdmin = isBootstrapAdminUser(user);
  const q = isAdmin
    ? collection(db, 'notifications')
    : query(collection(db, 'notifications'), where('recipientId', '==', user.uid));

  return onSnapshot(
    q,
    (snap) => {
      const list: PushNotificationItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            recipientId: String(data.recipientId || ''),
            timestampIso: tsToIso(data.createdAt),
            severity: data.severity as PushNotificationItem['severity'],
            category: data.category as PushNotificationItem['category'],
            title: String(data.title || ''),
            message: String(data.message || ''),
            read: Boolean(data.read),
          };
        })
        .sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));
      onChange(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
  );
}

export function subscribeToSupportTickets(
  user: User,
  onChange: (tickets: SupportTicket[]) => void
): () => void {
  const isAdmin = isBootstrapAdminUser(user);
  const q = isAdmin
    ? collection(db, 'supportTickets')
    : query(collection(db, 'supportTickets'), where('authorId', '==', user.uid));

  return onSnapshot(
    q,
    (snap) => {
      const list: SupportTicket[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            authorId: String(data.authorId || ''),
            createdAtIso: tsToIso(data.createdAt),
            subject: String(data.subject || ''),
            category: data.category as SupportTicket['category'],
            priority: data.priority as SupportTicket['priority'],
            status: data.status as SupportTicket['status'],
            aiDiagnosticSummary: data.aiDiagnosticSummary
              ? String(data.aiDiagnosticSummary)
              : undefined,
          };
        })
        .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
      onChange(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'supportTickets')
  );
}

// --- Write Operations ---

export async function createShipmentInFirestore(
  uid: string,
  shipment: Shipment
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'shipments', shipment.id), {
      code: clampStr(shipment.code, 32),
      title: clampStr(shipment.title, 140),
      cargoType: clampStr(shipment.cargoType, 140),
      mode: shipment.mode,
      status: 'disponible',
      shipperId: uid,
      shipperName: clampStr(shipment.shipperName, 120),
      originName: clampStr(shipment.originName, 180),
      originCoords: shipment.originCoords,
      destinationName: clampStr(shipment.destinationName, 180),
      destinationCoords: shipment.destinationCoords,
      distanceKm: shipment.distanceKm,
      estimatedDurationMin: shipment.estimatedDurationMin,
      trafficDelayPct: shipment.trafficDelayPct,
      payloadTons: shipment.payloadTons,
      priceUsd: shipment.priceUsd,
      paymentTerms: shipment.paymentTerms,
      settlementStatus: 'pendiente_entrega',
      backhaulDiscountPct: shipment.backhaulDiscountPct,
      scheduledDateIso: clampStr(shipment.scheduledDateIso, 40),
      fuelType: shipment.fuelType,
      estimatedFuelLiters: shipment.estimatedFuelLiters,
      co2Kg: shipment.co2Kg,
      ecoRouteSavedCo2Kg: shipment.ecoRouteSavedCo2Kg,
      offsetCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (shipment.traceability[0]) {
      const ev = shipment.traceability[0];
      batch.set(doc(db, 'shipments', shipment.id, 'events', ev.id), {
        actorId: uid,
        timestampIso: clampStr(ev.timestampIso, 40),
        title: clampStr(ev.title, 160),
        detail: clampStr(ev.detail, 500),
        source: ev.source,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `shipments/${shipment.id}`);
  }
}

export async function acceptAndDispatchShipmentInFirestore(params: {
  uid: string;
  shipment: Shipment;
  vehicle: FleetVehicle;
  dueDateIso: string;
}): Promise<void> {
  const { uid, shipment, vehicle, dueDateIso } = params;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'shipments', shipment.id), {
      status: 'en_transito',
      carrierId: uid,
      assignedVehicleId: vehicle.id,
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'shipments', shipment.id, 'events', `ev-disp-${Date.now()}`),
      {
        actorId: uid,
        timestampIso: new Date().toISOString(),
        title: `Despacho asignado a ${vehicle.plate}`,
        detail: clampStr(
          `${vehicle.unitName} (Teltonika IMEI ${vehicle.teltonika.imei}) inició ruta. Pago acordado fuera de plataforma.`,
          500
        ),
        source: 'Teltonika GPS',
        createdAt: serverTimestamp(),
      }
    );
    batch.set(doc(db, 'settlements', `stl-${shipment.id}-${Date.now()}`), {
      ownerId: uid,
      ...(shipment.shipperId ? { counterpartyId: shipment.shipperId } : {}),
      shipmentId: shipment.id,
      type: 'freight_invoice',
      description: clampStr(
        `Acuerdo flete ${shipment.code} (${shipment.originName} → ${shipment.destinationName})`,
        220
      ),
      amountUsd: shipment.priceUsd,
      paymentTerms: shipment.paymentTerms,
      dueDateIso: clampStr(dueDateIso, 40),
      status: 'pendiente_entrega',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `shipments/${shipment.id}`);
  }
}

export async function advanceShipmentStatusInFirestore(params: {
  uid: string;
  shipmentId: string;
  nextStatus: 'en_transito' | 'entregado';
}): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'shipments', params.shipmentId), {
      status: params.nextStatus,
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'shipments', params.shipmentId, 'events', `ev-st-${Date.now()}`),
      {
        actorId: params.uid,
        timestampIso: new Date().toISOString(),
        title:
          params.nextStatus === 'entregado'
            ? 'Entrega confirmada en destino'
            : 'Unidad en tránsito',
        detail:
          params.nextStatus === 'entregado'
            ? 'Recepción validada. Listo para facturación y liquidación externa según plazo pactado.'
            : 'Movimiento confirmado en corredor logístico.',
        source: 'Google Maps',
        createdAt: serverTimestamp(),
      }
    );
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `shipments/${params.shipmentId}`
    );
  }
}

export async function recordOffPlatformSettlementInFirestore(params: {
  uid: string;
  shipment: Shipment;
  settlementStatus: SettlementStatus;
  invoiceFolio: string;
  externalPaymentRef: string;
}): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'shipments', params.shipment.id), {
      settlementStatus: params.settlementStatus,
      invoiceFolio: clampStr(params.invoiceFolio, 64),
      externalPaymentRef: clampStr(params.externalPaymentRef, 80),
      updatedAt: serverTimestamp(),
    });

    batch.set(
      doc(db, 'settlements', `stl-ext-${params.shipment.id}-${Date.now()}`),
      {
        ownerId: params.uid,
        ...(params.shipment.shipperId && params.shipment.shipperId !== params.uid
          ? { counterpartyId: params.shipment.shipperId }
          : params.shipment.carrierId && params.shipment.carrierId !== params.uid
            ? { counterpartyId: params.shipment.carrierId }
            : {}),
        shipmentId: params.shipment.id,
        type:
          params.settlementStatus === 'liquidado_externo'
            ? 'external_transfer'
            : 'freight_invoice',
        description: clampStr(
          `${params.settlementStatus === 'liquidado_externo' ? 'Liquidación externa' : 'Factura registrada'} ${params.shipment.code} (${params.invoiceFolio || 'S/F'})`,
          220
        ),
        amountUsd: params.shipment.priceUsd,
        paymentTerms: params.shipment.paymentTerms,
        invoiceFolio: clampStr(params.invoiceFolio, 64),
        externalRef: clampStr(params.externalPaymentRef, 80),
        status: params.settlementStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    batch.set(
      doc(
        db,
        'shipments',
        params.shipment.id,
        'events',
        `ev-stl-${Date.now()}`
      ),
      {
        actorId: params.uid,
        timestampIso: new Date().toISOString(),
        title:
          params.settlementStatus === 'liquidado_externo'
            ? 'Liquidación externa confirmada'
            : 'Factura / Carta Porte emitida',
        detail: clampStr(
          `Folio ${params.invoiceFolio || 'N/A'} · Referencia bancaria externa ${params.externalPaymentRef || 'Pendiente de transferencia'}.`,
          500
        ),
        source: 'Liquidación Externa',
        createdAt: serverTimestamp(),
      }
    );

    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `shipments/${params.shipment.id}`
    );
  }
}

export async function createVehicleInFirestore(
  uid: string,
  vehicle: FleetVehicle
): Promise<void> {
  try {
    await setDoc(doc(db, 'vehicles', vehicle.id), {
      ownerId: uid,
      visibility: vehicle.visibility || 'shared_dispatch',
      plate: clampStr(vehicle.plate, 24),
      unitName: clampStr(vehicle.unitName, 120),
      vehicleClass: vehicle.vehicleClass,
      fuelType: vehicle.fuelType,
      maxPayloadTons: vehicle.maxPayloadTons,
      driverName: clampStr(vehicle.driverName, 100),
      status: vehicle.status,
      currentPosition: vehicle.currentPosition,
      currentLocationLabel: clampStr(vehicle.currentLocationLabel, 160),
      ...(vehicle.emptyBackhaulTo
        ? { emptyBackhaulTo: clampStr(vehicle.emptyBackhaulTo, 120) }
        : {}),
      nextServiceOdometerKm: vehicle.nextServiceOdometerKm,
      nextServiceDateIso: clampStr(vehicle.nextServiceDateIso, 40),
      teltonika: vehicle.teltonika,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `vehicles/${vehicle.id}`);
  }
}

export async function updateVehicleTelemetryInFirestore(
  vehicle: FleetVehicle
): Promise<void> {
  try {
    await updateDoc(doc(db, 'vehicles', vehicle.id), {
      currentPosition: vehicle.currentPosition,
      currentLocationLabel: clampStr(vehicle.currentLocationLabel, 160),
      teltonika: vehicle.teltonika,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `vehicles/${vehicle.id}`);
  }
}

export async function logMaintenanceInFirestore(
  uid: string,
  vehicle: FleetVehicle,
  record: MaintenanceRecord,
  nextServiceOdometerKm: number,
  nextServiceDateIso: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'vehicles', vehicle.id, 'maintenance', record.id), {
      ownerId: uid,
      vehicleId: vehicle.id,
      type: record.type,
      title: clampStr(record.title, 160),
      odometerAtServiceKm: record.odometerAtServiceKm,
      dateIso: clampStr(record.dateIso, 40),
      costUsd: record.costUsd,
      technicianNotes: clampStr(record.technicianNotes, 500),
      ...(record.nextDueOdometerKm !== undefined
        ? { nextDueOdometerKm: record.nextDueOdometerKm }
        : {}),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'vehicles', vehicle.id), {
      nextServiceOdometerKm,
      nextServiceDateIso: clampStr(nextServiceDateIso, 40),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `vehicles/${vehicle.id}/maintenance/${record.id}`
    );
  }
}

export async function mintCertificateAtomicallyInFirestore(params: {
  uid: string;
  shipment: Shipment;
  certificate: BlockchainCertificate;
  projectId: string;
}): Promise<void> {
  const { uid, shipment, certificate, projectId } = params;
  const certDocId = certificate.certificateCode;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'certificates', certDocId), {
      issuerId: uid,
      visibility: 'public_verifiable',
      certificateCode: clampStr(certificate.certificateCode, 40),
      shipmentId: shipment.id,
      shipmentCode: clampStr(certificate.shipmentCode, 32),
      vehiclePlate: clampStr(certificate.vehiclePlate, 32),
      teltonikaImei: clampStr(certificate.teltonikaImei, 32),
      distanceKm: certificate.distanceKm,
      fuelConsumedLiters: certificate.fuelConsumedLiters,
      co2CompensatedKg: certificate.co2CompensatedKg,
      offsetCostUsd: certificate.offsetCostUsd,
      projectId: clampStr(certificate.projectId, 64),
      projectName: clampStr(certificate.projectName, 160),
      txHash: clampStr(certificate.txHash, 128),
      blockNumber: certificate.blockNumber,
      anchorMode: certificate.anchorMode,
      networkName: clampStr(certificate.networkName, 80),
      ...(certificate.explorerUrl
        ? { explorerUrl: clampStr(certificate.explorerUrl, 240) }
        : {}),
      ...(certificate.signature
        ? { signature: clampStr(certificate.signature, 200) }
        : {}),
      ...(certificate.signerAddress
        ? { signerAddress: clampStr(certificate.signerAddress, 80) }
        : {}),
      ...(certificate.registryProvider
        ? { registryProvider: clampStr(certificate.registryProvider, 80) }
        : {}),
      ...(certificate.registryOrderId
        ? { registryOrderId: clampStr(certificate.registryOrderId, 120) }
        : {}),
      registryStatus: certificate.registryStatus,
      issuedAtIso: clampStr(certificate.issuedAtIso, 40),
      standard: clampStr(certificate.standard, 100),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'shipments', shipment.id), {
      offsetCompleted: true,
      offsetProjectId: clampStr(projectId, 80),
      certificateId: certDocId,
      updatedAt: serverTimestamp(),
    });

    batch.set(
      doc(db, 'shipments', shipment.id, 'events', `ev-cert-${Date.now()}`),
      {
        actorId: uid,
        timestampIso: new Date().toISOString(),
        title: `Certificado ${certDocId} emitido`,
        detail: clampStr(
          `Compensación ${certificate.co2CompensatedKg} kg CO₂e (${certificate.networkName}) · Hash ${certificate.txHash.slice(0, 18)}...`,
          500
        ),
        source: 'Blockchain',
        createdAt: serverTimestamp(),
      }
    );

    batch.set(doc(db, 'settlements', `stl-esg-${shipment.id}-${Date.now()}`), {
      ownerId: uid,
      shipmentId: shipment.id,
      type: 'carbon_retirement',
      description: clampStr(
        `Compensación ${certificate.co2CompensatedKg} kg CO₂e · ${certificate.projectName}`,
        220
      ),
      amountUsd: -certificate.offsetCostUsd,
      paymentTerms: 'esg_directo',
      externalRef: clampStr(
        certificate.registryOrderId || certDocId,
        80
      ),
      status: 'confirmado',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `certificates/${certDocId}`);
  }
}

export async function allocateEsgBudgetInFirestore(
  uid: string,
  amountUsd: number,
  reference: string
): Promise<void> {
  try {
    const id = `stl-budget-${Date.now()}`;
    await setDoc(doc(db, 'settlements', id), {
      ownerId: uid,
      shipmentId: 'ESG-BUDGET',
      type: 'esg_budget_allocation',
      description: 'Asignación corporativa a fondo de bonos de carbono',
      amountUsd: Number(amountUsd.toFixed(2)),
      paymentTerms: 'esg_directo',
      externalRef: clampStr(reference, 80),
      status: 'confirmado',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'settlements/budget');
  }
}

export async function createNotificationInFirestore(
  uid: string,
  item: Omit<PushNotificationItem, 'id' | 'timestampIso' | 'read'>
): Promise<void> {
  try {
    const id = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await setDoc(doc(db, 'notifications', id), {
      recipientId: uid,
      severity: item.severity,
      category: item.category,
      title: clampStr(item.title, 160),
      message: clampStr(item.message, 400),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking for alerts
  }
}

export async function markAllNotificationsReadInFirestore(
  notifications: PushNotificationItem[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  try {
    const batch = writeBatch(db);
    unread.forEach((n) => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'notifications');
  }
}

export async function createSupportTicketInFirestore(
  uid: string,
  ticket: SupportTicket
): Promise<void> {
  try {
    await setDoc(doc(db, 'supportTickets', ticket.id), {
      authorId: uid,
      subject: clampStr(ticket.subject, 160),
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      ...(ticket.aiDiagnosticSummary
        ? { aiDiagnosticSummary: clampStr(ticket.aiDiagnosticSummary, 1200) }
        : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `supportTickets/${ticket.id}`
    );
  }
}

export async function fetchPublicCertificateByCode(
  certCode: string
): Promise<BlockchainCertificate | null> {
  const cleanCode = certCode.trim();
  if (!cleanCode || !/^[a-zA-Z0-9_\-]+$/.test(cleanCode)) {
    return null;
  }
  try {
    const snap = await getDoc(doc(db, 'certificates', cleanCode));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      visibility: 'public_verifiable',
      certificateCode: String(data.certificateCode || snap.id),
      shipmentId: String(data.shipmentId || ''),
      shipmentCode: String(data.shipmentCode || ''),
      vehiclePlate: String(data.vehiclePlate || ''),
      teltonikaImei: String(data.teltonikaImei || ''),
      distanceKm: Number(data.distanceKm || 0),
      fuelConsumedLiters: Number(data.fuelConsumedLiters || 0),
      co2CompensatedKg: Number(data.co2CompensatedKg || 0),
      offsetCostUsd: Number(data.offsetCostUsd || 0),
      projectId: String(data.projectId || ''),
      projectName: String(data.projectName || ''),
      txHash: String(data.txHash || ''),
      blockNumber: Number(data.blockNumber || 0),
      anchorMode:
        (data.anchorMode as BlockchainCertificate['anchorMode']) ||
        'ecdsa_attestation',
      networkName: String(data.networkName || ''),
      explorerUrl: data.explorerUrl ? String(data.explorerUrl) : undefined,
      signature: data.signature ? String(data.signature) : undefined,
      signerAddress: data.signerAddress ? String(data.signerAddress) : undefined,
      registryProvider: data.registryProvider
        ? String(data.registryProvider)
        : undefined,
      registryOrderId: data.registryOrderId
        ? String(data.registryOrderId)
        : undefined,
      registryStatus:
        (data.registryStatus as BlockchainCertificate['registryStatus']) ||
        'pending_registry_settlement',
      issuedAtIso: String(data.issuedAtIso || ''),
      standard: String(data.standard || ''),
    };
  } catch {
    return null;
  }
}
