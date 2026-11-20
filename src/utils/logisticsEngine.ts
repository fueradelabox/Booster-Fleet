import type {
  BlockchainCertificate,
  FleetVehicle,
  FuelType,
  MaintenanceAlertLevel,
  PaymentTerms,
  SettlementLedger,
  TeltonikaPacket,
} from '../types/logistics';

export interface CarbonCalculationInput {
  distanceKm: number;
  fuelType: FuelType;
  payloadTons: number;
  trafficDelayPct: number;
  vehicleConsumptionPer100Km?: number;
}

export interface CarbonCalculationResult {
  fuelConsumedLiters: number;
  energyKwh: number;
  co2Kg: number;
  co2Tons: number;
  standardRouteCo2Kg: number;
  ecoRouteSavedCo2Kg: number;
  recommendedOffsetUsd: number;
}

// IPCC / GLEC Freight Emission Factors (Well-to-Wheel)
const EMISSION_FACTORS_KG_PER_UNIT: Record<FuelType, number> = {
  DIESEL: 2.68,
  HYBRID: 2.15,
  LNG: 2.75,
  ELECTRIC: 0.18,
};

const BASE_CONSUMPTION_PER_100KM: Record<FuelType, number> = {
  DIESEL: 32.0,
  HYBRID: 23.5,
  LNG: 29.0,
  ELECTRIC: 118.0,
};

export const CARBON_PRICE_PER_TON_USD = 24.5;

export function calculateCarbonFootprint(
  input: CarbonCalculationInput
): CarbonCalculationResult {
  const safeDistance = Math.max(0, input.distanceKm);
  const safePayload = Math.max(0, input.payloadTons);
  const safeTraffic = Math.max(0, Math.min(100, input.trafficDelayPct));

  const baseRate =
    input.vehicleConsumptionPer100Km && input.vehicleConsumptionPer100Km > 0
      ? input.vehicleConsumptionPer100Km
      : BASE_CONSUMPTION_PER_100KM[input.fuelType];

  const payloadMultiplier = 1 + Math.max(0, safePayload - 10) * 0.011;
  const trafficMultiplier = 1 + (safeTraffic / 100) * 0.25;

  const rawConsumption =
    (safeDistance / 100) * baseRate * payloadMultiplier * trafficMultiplier;

  const factor = EMISSION_FACTORS_KG_PER_UNIT[input.fuelType];
  const co2Kg = Number((rawConsumption * factor).toFixed(2));
  const co2Tons = Number((co2Kg / 1000).toFixed(4));

  const standardRouteCo2Kg = Number((co2Kg * 1.093).toFixed(2));
  const ecoRouteSavedCo2Kg = Number((standardRouteCo2Kg - co2Kg).toFixed(2));
  const recommendedOffsetUsd = Number(
    Math.max(0.5, co2Tons * CARBON_PRICE_PER_TON_USD).toFixed(2)
  );

  return {
    fuelConsumedLiters:
      input.fuelType === 'ELECTRIC' ? 0 : Number(rawConsumption.toFixed(1)),
    energyKwh:
      input.fuelType === 'ELECTRIC' ? Number(rawConsumption.toFixed(1)) : 0,
    co2Kg,
    co2Tons,
    standardRouteCo2Kg,
    ecoRouteSavedCo2Kg,
    recommendedOffsetUsd,
  };
}

export interface SpotPriceInput {
  distanceKm: number;
  payloadTons: number;
  urgency: 'inmediata' | 'programada';
  backhaulDiscountPct?: number;
  fuelCostPerLiterUsd?: number;
}

export interface SpotPriceBreakdown {
  baseFreightUsd: number;
  fuelSurchargeUsd: number;
  discountUsd: number;
  totalPriceUsd: number;
  pricePerKmUsd: number;
}

export function calculateSpotFreightPrice(
  input: SpotPriceInput
): SpotPriceBreakdown {
  const safeKm = Math.max(1, input.distanceKm);
  const safeTons = Math.max(1, input.payloadTons);
  const fuelPrice = input.fuelCostPerLiterUsd ?? 1.32;

  const ratePerKm = input.urgency === 'inmediata' ? 1.85 : 1.58;
  const weightPremium = safeTons > 15 ? (safeTons - 15) * 14 : 0;
  const baseFreightUsd = safeKm * ratePerKm + weightPremium;

  const estimatedLiters = (safeKm / 100) * 32;
  const fuelSurchargeUsd = estimatedLiters * fuelPrice * 0.35;

  const subtotal = Number((baseFreightUsd + fuelSurchargeUsd).toFixed(2));
  const discountRate =
    Math.max(0, Math.min(45, input.backhaulDiscountPct ?? 0)) / 100;
  const discountUsd = Number((subtotal * discountRate).toFixed(2));
  const totalPriceUsd = Number((subtotal - discountUsd).toFixed(2));

  return {
    baseFreightUsd: Number(baseFreightUsd.toFixed(2)),
    fuelSurchargeUsd: Number(fuelSurchargeUsd.toFixed(2)),
    discountUsd,
    totalPriceUsd,
    pricePerKmUsd: Number((totalPriceUsd / safeKm).toFixed(2)),
  };
}

export interface MaintenanceEvaluation {
  level: MaintenanceAlertLevel;
  kmRemaining: number;
  daysRemaining: number;
  reason: string;
}

export function evaluateMaintenanceStatus(
  vehicle: FleetVehicle,
  referenceDateIso: string
): MaintenanceEvaluation {
  const kmRemaining = Math.round(
    vehicle.nextServiceOdometerKm - vehicle.teltonika.odometerKm
  );
  const refMs = new Date(referenceDateIso).getTime();
  const dueMs = new Date(vehicle.nextServiceDateIso).getTime();
  const daysRemaining = Math.ceil((dueMs - refMs) / (1000 * 60 * 60 * 24));

  if (kmRemaining <= 0 || daysRemaining <= 0) {
    return {
      level: 'critical',
      kmRemaining,
      daysRemaining,
      reason:
        kmRemaining <= 0
          ? `Kilometraje excedido por ${Math.abs(kmRemaining)} km`
          : `Fecha de servicio vencida hace ${Math.abs(daysRemaining)} días`,
    };
  }

  if (kmRemaining <= 1500 || daysRemaining <= 10) {
    return {
      level: 'warning',
      kmRemaining,
      daysRemaining,
      reason: `Mantención próxima en ${kmRemaining} km o ${daysRemaining} días`,
    };
  }

  return {
    level: 'nominal',
    kmRemaining,
    daysRemaining,
    reason: `Operación nominal · próximo servicio en ${kmRemaining} km`,
  };
}

export interface PredictiveEtaInput {
  distanceKm: number;
  baseSpeedKmh: number;
  trafficDelayPct: number;
  restStopsCount?: number;
  weatherPenaltyPct?: number;
}

export interface PredictiveEtaResult {
  estimatedMinutes: number;
  optimisticMinutes: number;
  conservativeMinutes: number;
  effectiveSpeedKmh: number;
}

export function computePredictiveEta(
  input: PredictiveEtaInput
): PredictiveEtaResult {
  const safeDistance = Math.max(1, input.distanceKm);
  const safeBaseSpeed = Math.max(25, input.baseSpeedKmh);
  const trafficFactor = 1 + Math.max(0, input.trafficDelayPct) / 100;
  const weatherFactor = 1 + Math.max(0, input.weatherPenaltyPct ?? 0) / 100;
  const restMinutes = Math.max(0, input.restStopsCount ?? 0) * 30;

  const drivingMinutes =
    (safeDistance / safeBaseSpeed) * 60 * trafficFactor * weatherFactor;
  const estimatedMinutes = Math.round(drivingMinutes + restMinutes);
  const optimisticMinutes = Math.max(15, Math.round(estimatedMinutes * 0.92));
  const conservativeMinutes = Math.round(estimatedMinutes * 1.14);
  const effectiveSpeedKmh = Number(
    (safeDistance / (estimatedMinutes / 60)).toFixed(1)
  );

  return {
    estimatedMinutes,
    optimisticMinutes,
    conservativeMinutes,
    effectiveSpeedKmh,
  };
}

export function computeDeterministicLedgerHash(payload: string): string {
  const seeds = [
    0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35,
    0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5,
  ];
  const words = seeds.map((seed, lane) => {
    let h = seed >>> 0;
    for (let i = 0; i < payload.length; i++) {
      h ^= payload.charCodeAt(i) ^ ((lane + 1) * 31);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    return (h >>> 0).toString(16).padStart(8, '0');
  });
  return `0x${words.join('')}`;
}

export interface MintCertificateInput {
  shipmentId: string;
  shipmentCode: string;
  vehiclePlate: string;
  teltonikaImei: string;
  distanceKm: number;
  fuelConsumedLiters: number;
  co2CompensatedKg: number;
  offsetCostUsd: number;
  projectId: string;
  projectName: string;
  standard: string;
  issuedAtIso: string;
  existingBlockCount: number;
  anchorProof?: {
    txHash: string;
    blockNumber: number;
    anchorMode: 'evm_onchain' | 'ecdsa_attestation';
    networkName: string;
    explorerUrl?: string;
    signature?: string;
    signerAddress?: string;
  };
  registryProof?: {
    registryProvider?: string;
    registryOrderId?: string;
    registryStatus: 'retired_verified' | 'pending_registry_settlement';
  };
}

export function mintBlockchainCertificate(
  input: MintCertificateInput
): BlockchainCertificate {
  const canonicalPayload = [
    input.shipmentId,
    input.teltonikaImei,
    input.distanceKm.toFixed(2),
    input.fuelConsumedLiters.toFixed(2),
    input.co2CompensatedKg.toFixed(2),
    input.projectId,
    input.issuedAtIso,
  ].join('|');

  const fallbackHash = computeDeterministicLedgerHash(canonicalPayload);
  const txHash = input.anchorProof?.txHash || fallbackHash;
  const certSuffix = txHash.slice(2, 8).toUpperCase();
  const blockNumber =
    input.anchorProof?.blockNumber ??
    19842100 + input.existingBlockCount * 17 + 1;

  return {
    id: `TC-ESG-${certSuffix}`,
    visibility: 'public_verifiable',
    certificateCode: `TC-ESG-${certSuffix}`,
    shipmentId: input.shipmentId,
    shipmentCode: input.shipmentCode,
    vehiclePlate: input.vehiclePlate,
    teltonikaImei: input.teltonikaImei,
    distanceKm: input.distanceKm,
    fuelConsumedLiters: input.fuelConsumedLiters,
    co2CompensatedKg: input.co2CompensatedKg,
    offsetCostUsd: input.offsetCostUsd,
    projectId: input.projectId,
    projectName: input.projectName,
    txHash,
    blockNumber,
    anchorMode: input.anchorProof?.anchorMode ?? 'ecdsa_attestation',
    networkName:
      input.anchorProof?.networkName ?? 'Polygon / Base · Firma ECDSA',
    explorerUrl: input.anchorProof?.explorerUrl,
    signature: input.anchorProof?.signature,
    signerAddress: input.anchorProof?.signerAddress,
    registryProvider:
      input.registryProof?.registryProvider ??
      'Verra VCS / Gold Standard (Reserva Corporativa)',
    registryOrderId: input.registryProof?.registryOrderId,
    registryStatus:
      input.registryProof?.registryStatus ?? 'pending_registry_settlement',
    issuedAtIso: input.issuedAtIso,
    standard: input.standard,
  };
}

export interface EsgBudgetChargeResult {
  ok: boolean;
  error?: string;
  ledger: SettlementLedger;
}

export function processEsgBudgetOffset(params: {
  ledger: SettlementLedger;
  amountUsd: number;
  description: string;
  shipmentId: string;
  timestampIso: string;
}): EsgBudgetChargeResult {
  const amount = Number(params.amountUsd.toFixed(2));
  if (amount <= 0) {
    return {
      ok: false,
      error: 'El monto de compensación debe ser mayor a $0.00 USD.',
      ledger: params.ledger,
    };
  }
  if (params.ledger.esgBudgetUsd < amount) {
    return {
      ok: false,
      error: `Presupuesto ESG insuficiente ($${params.ledger.esgBudgetUsd.toFixed(2)} USD disponibles vs $${amount.toFixed(2)} USD requeridos).`,
      ledger: params.ledger,
    };
  }

  return {
    ok: true,
    ledger: {
      ...params.ledger,
      esgBudgetUsd: Number((params.ledger.esgBudgetUsd - amount).toFixed(2)),
      totalOffsetSpentUsd: Number(
        (params.ledger.totalOffsetSpentUsd + amount).toFixed(2)
      ),
      records: [
        {
          id: `stl-offset-${Date.now()}`,
          shipmentId: params.shipmentId,
          timestampIso: params.timestampIso,
          type: 'carbon_retirement',
          description: params.description,
          amountUsd: -amount,
          paymentTerms: 'esg_directo',
          status: 'confirmado',
        },
        ...params.ledger.records,
      ],
    },
  };
}

export function formatPaymentTermsLabel(terms: PaymentTerms | 'esg_directo'): string {
  switch (terms) {
    case 'contado_entrega':
      return 'Contado contra entrega (externo)';
    case 'credito_15':
      return 'Crédito 15 días';
    case 'credito_30':
      return 'Crédito 30 días';
    case 'credito_60':
      return 'Crédito 60 días';
    case 'factoraje':
      return 'Factoraje corporativo';
    case 'esg_directo':
      return 'Asignación ESG directa';
  }
}

export function computeDueDateIso(
  baseIso: string,
  terms: PaymentTerms
): string {
  const daysMap: Record<PaymentTerms, number> = {
    contado_entrega: 1,
    credito_15: 15,
    credito_30: 30,
    credito_60: 60,
    factoraje: 7,
  };
  const date = new Date(baseIso);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  date.setUTCDate(date.getUTCDate() + daysMap[terms]);
  return date.toISOString();
}

export function normalizeTeltonikaPayload(
  raw: Record<string, unknown>
): { ok: true; packet: TeltonikaPacket } | { ok: false; error: string } {
  const reported =
    raw.state && typeof raw.state === 'object' && 'reported' in raw.state
      ? ((raw.state as { reported?: Record<string, unknown> }).reported ?? {})
      : raw;

  const imei = String(
    reported.imei ?? raw.imei ?? reported.deviceId ?? ''
  ).trim();
  if (!imei || imei.length < 8 || imei.length > 32) {
    return {
      ok: false,
      error: 'IMEI Teltonika inválido o ausente (se requieren 8–32 caracteres).',
    };
  }

  let lat = Number(reported.lat ?? reported.latitude);
  let lng = Number(reported.lng ?? reported.lon ?? reported.longitude);

  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && typeof reported.latlng === 'string') {
    const parts = reported.latlng.split(',').map((s) => Number(s.trim()));
    if (parts.length === 2) {
      lat = parts[0];
      lng = parts[1];
    }
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      ok: false,
      error: 'Coordenadas GPS lat/lng inválidas en paquete Teltonika.',
    };
  }

  const io =
    reported.io && typeof reported.io === 'object'
      ? (reported.io as Record<string, unknown>)
      : {};

  const speedRaw = Number(reported.speedKmh ?? reported.sp ?? io['24'] ?? 0);
  const speedKmh = Number.isFinite(speedRaw)
    ? Math.max(0, Math.min(220, Math.round(speedRaw)))
    : 0;

  const odometerRaw =
    reported.odometerKm ??
    (typeof io['16'] === 'number' ? Number(io['16']) / 1000 : undefined);
  const odometerKm =
    typeof odometerRaw === 'number' && Number.isFinite(odometerRaw)
      ? Math.max(0, Math.round(odometerRaw))
      : undefined;

  const fuelRaw = reported.fuelLevelPct ?? io['89'] ?? io['84'];
  const fuelLevelPct =
    typeof fuelRaw === 'number' && Number.isFinite(fuelRaw)
      ? Math.max(0, Math.min(100, Math.round(fuelRaw)))
      : undefined;

  const canFuelRaw = reported.canFuelRateLPer100Km;
  const canFuelRateLPer100Km =
    typeof canFuelRaw === 'number' && Number.isFinite(canFuelRaw)
      ? Math.max(0, Number(canFuelRaw.toFixed(1)))
      : undefined;

  const ignitionRaw = reported.ignitionOn ?? reported.ig ?? io['239'];
  const ignitionOn =
    typeof ignitionRaw === 'boolean'
      ? ignitionRaw
      : Number(ignitionRaw) === 1 || speedKmh > 3;

  const satRaw = Number(reported.satellites ?? reported.sat ?? 12);
  const satellites = Number.isFinite(satRaw)
    ? Math.max(0, Math.min(64, Math.round(satRaw)))
    : 12;

  const timestampIso =
    typeof reported.timestampIso === 'string' && reported.timestampIso
      ? reported.timestampIso
      : new Date().toISOString();

  const locationLabel =
    typeof reported.locationLabel === 'string' && reported.locationLabel.trim()
      ? reported.locationLabel.trim().slice(0, 160)
      : undefined;

  return {
    ok: true,
    packet: {
      imei,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      speedKmh,
      odometerKm,
      fuelLevelPct,
      canFuelRateLPer100Km,
      ignitionOn,
      satellites,
      timestampIso,
      locationLabel,
    },
  };
}
