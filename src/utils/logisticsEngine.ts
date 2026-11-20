import type {
  BlockchainCertificate,
  DigitalWallet,
  FleetVehicle,
  FuelType,
  MaintenanceAlertLevel,
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
  DIESEL: 2.68, // kg CO2e per liter
  HYBRID: 2.15, // kg CO2e per liter (blended diesel-electric)
  LNG: 2.75, // kg CO2e per kg LNG equivalent
  ELECTRIC: 0.18, // kg CO2e per kWh (grid mix)
};

const BASE_CONSUMPTION_PER_100KM: Record<FuelType, number> = {
  DIESEL: 32.0, // L/100km heavy truck baseline
  HYBRID: 23.5, // L/100km
  LNG: 29.0, // kg/100km eq
  ELECTRIC: 118.0, // kWh/100km heavy e-truck
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

  // Payload weight factor: +1.1% fuel per ton above 10t baseline, capped smoothly
  const payloadMultiplier = 1 + Math.max(0, safePayload - 10) * 0.011;
  // Congestion idle penalty: up to +18% fuel burn in heavy traffic
  const trafficMultiplier = 1 + (safeTraffic / 100) * 0.25;

  const rawConsumption =
    (safeDistance / 100) * baseRate * payloadMultiplier * trafficMultiplier;

  const factor = EMISSION_FACTORS_KG_PER_UNIT[input.fuelType];
  const co2Kg = Number((rawConsumption * factor).toFixed(2));
  const co2Tons = Number((co2Kg / 1000).toFixed(4));

  // Eco-friendly Google Maps routing avoids steep grades & stop-and-go bottlenecks (~8.5% savings)
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
  const discountRate = Math.max(0, Math.min(45, input.backhaulDiscountPct ?? 0)) / 100;
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

// Pure deterministic FNV-1a + mixing 256-bit hex digest so tests & browser share identical behavior
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

  const txHash = computeDeterministicLedgerHash(canonicalPayload);
  const blockNumber = 19842100 + input.existingBlockCount * 17 + 1;
  const certSuffix = txHash.slice(2, 8).toUpperCase();

  return {
    id: `cert-${input.shipmentId}-${certSuffix}`,
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
    issuedAtIso: input.issuedAtIso,
    standard: input.standard,
  };
}

export interface WalletChargeResult {
  ok: boolean;
  error?: string;
  wallet: DigitalWallet;
}

export function processWalletOffset(params: {
  wallet: DigitalWallet;
  amountUsd: number;
  description: string;
  referenceId: string;
  timestampIso: string;
}): WalletChargeResult {
  const amount = Number(params.amountUsd.toFixed(2));
  if (amount <= 0) {
    return {
      ok: false,
      error: 'El monto de compensación debe ser mayor a $0.00 USD.',
      wallet: params.wallet,
    };
  }
  if (params.wallet.balanceUsd < amount) {
    return {
      ok: false,
      error: `Saldo insuficiente en billetera ($${params.wallet.balanceUsd.toFixed(2)} USD disponibles vs $${amount.toFixed(2)} USD requeridos).`,
      wallet: params.wallet,
    };
  }

  return {
    ok: true,
    wallet: {
      ...params.wallet,
      balanceUsd: Number((params.wallet.balanceUsd - amount).toFixed(2)),
      totalOffsetSpentUsd: Number(
        (params.wallet.totalOffsetSpentUsd + amount).toFixed(2)
      ),
      transactions: [
        {
          id: `tx-offset-${Date.now()}`,
          timestampIso: params.timestampIso,
          type: 'carbon_offset',
          description: params.description,
          amountUsd: -amount,
          referenceId: params.referenceId,
          status: 'confirmado',
        },
        ...params.wallet.transactions,
      ],
    },
  };
}
