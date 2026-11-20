import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCarbonFootprint,
  calculateSpotFreightPrice,
  computePredictiveEta,
  evaluateMaintenanceStatus,
  mintBlockchainCertificate,
  processWalletOffset,
} from './logisticsEngine';
import type { DigitalWallet, FleetVehicle } from '../types/logistics';

test('calculateCarbonFootprint computes diesel vs electric accurately with eco-route savings', () => {
  const diesel = calculateCarbonFootprint({
    distanceKm: 500,
    fuelType: 'DIESEL',
    payloadTons: 18,
    trafficDelayPct: 20,
  });
  const electric = calculateCarbonFootprint({
    distanceKm: 500,
    fuelType: 'ELECTRIC',
    payloadTons: 18,
    trafficDelayPct: 20,
  });

  assert.ok(diesel.fuelConsumedLiters > 150);
  assert.ok(diesel.co2Kg > electric.co2Kg);
  assert.ok(diesel.ecoRouteSavedCo2Kg > 0);
  assert.equal(electric.fuelConsumedLiters, 0);
  assert.ok(electric.energyKwh > 0);
});

test('calculateSpotFreightPrice applies empty-backhaul discount properly', () => {
  const regular = calculateSpotFreightPrice({
    distanceKm: 400,
    payloadTons: 16,
    urgency: 'inmediata',
    backhaulDiscountPct: 0,
  });
  const backhaul = calculateSpotFreightPrice({
    distanceKm: 400,
    payloadTons: 16,
    urgency: 'inmediata',
    backhaulDiscountPct: 25,
  });

  assert.ok(backhaul.totalPriceUsd < regular.totalPriceUsd);
  assert.ok(backhaul.discountUsd > 0);
  assert.equal(
    Number((regular.totalPriceUsd - backhaul.totalPriceUsd).toFixed(2)),
    backhaul.discountUsd
  );
});

test('evaluateMaintenanceStatus detects nominal, warning, and critical thresholds', () => {
  const baseVehicle: FleetVehicle = {
    id: 'veh-test',
    plate: 'MX-101',
    unitName: 'Volvo FH16',
    vehicleClass: 'tractocamion',
    fuelType: 'DIESEL',
    maxPayloadTons: 28,
    driverName: 'Carlos Méndez',
    status: 'en_ruta',
    currentPosition: { lat: 19.4326, lng: -99.1332 },
    currentLocationLabel: 'CDMX',
    nextServiceOdometerKm: 150000,
    nextServiceDateIso: '2026-12-15T00:00:00Z',
    teltonika: {
      deviceModel: 'Teltonika FMC650',
      imei: '352093081234567',
      ignitionOn: true,
      speedKmh: 78,
      odometerKm: 142000,
      fuelLevelPct: 74,
      canFuelRateLPer100Km: 31.4,
      engineHours: 4120,
      satellites: 14,
      lastHeartbeatIso: '2026-11-20T15:00:00Z',
      tamperLockActive: true,
    },
    maintenanceHistory: [],
  };

  assert.equal(
    evaluateMaintenanceStatus(baseVehicle, '2026-11-20T15:00:00Z').level,
    'nominal'
  );

  const warningVeh: FleetVehicle = {
    ...baseVehicle,
    teltonika: { ...baseVehicle.teltonika, odometerKm: 149200 },
  };
  assert.equal(
    evaluateMaintenanceStatus(warningVeh, '2026-11-20T15:00:00Z').level,
    'warning'
  );

  const criticalVeh: FleetVehicle = {
    ...baseVehicle,
    teltonika: { ...baseVehicle.teltonika, odometerKm: 150320 },
  };
  assert.equal(
    evaluateMaintenanceStatus(criticalVeh, '2026-11-20T15:00:00Z').level,
    'critical'
  );
});

test('computePredictiveEta produces ordered confidence window', () => {
  const eta = computePredictiveEta({
    distanceKm: 360,
    baseSpeedKmh: 72,
    trafficDelayPct: 15,
    restStopsCount: 1,
  });
  assert.ok(eta.optimisticMinutes < eta.estimatedMinutes);
  assert.ok(eta.estimatedMinutes < eta.conservativeMinutes);
  assert.ok(eta.effectiveSpeedKmh > 0);
});

test('mintBlockchainCertificate produces deterministic 64-hex-char txHash', () => {
  const input = {
    shipmentId: 'ship-1',
    shipmentCode: 'TC-901',
    vehiclePlate: '92-AK-4B',
    teltonikaImei: '352093081234567',
    distanceKm: 215.4,
    fuelConsumedLiters: 69.2,
    co2CompensatedKg: 185.46,
    offsetCostUsd: 4.54,
    projectId: 'proj-sierra',
    projectName: 'Sierra Madre Carbon Sink',
    standard: 'Verra VCS',
    issuedAtIso: '2026-11-20T15:00:00Z',
    existingBlockCount: 3,
  };
  const certA = mintBlockchainCertificate(input);
  const certB = mintBlockchainCertificate(input);
  assert.equal(certA.txHash, certB.txHash);
  assert.match(certA.txHash, /^0x[0-9a-f]{64}$/);
  assert.ok(certA.certificateCode.startsWith('TC-ESG-'));
});

test('processWalletOffset validates insufficient funds and deducts properly when funded', () => {
  const wallet: DigitalWallet = {
    balanceUsd: 50,
    escrowHeldUsd: 1200,
    totalOffsetSpentUsd: 140,
    autoOffsetEnabled: true,
    autoOffsetTargetPct: 100,
    transactions: [],
  };

  const fail = processWalletOffset({
    wallet,
    amountUsd: 75,
    description: 'Compensación excesiva',
    referenceId: 'ship-1',
    timestampIso: '2026-11-20T15:00:00Z',
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.wallet.balanceUsd, 50);

  const ok = processWalletOffset({
    wallet,
    amountUsd: 12.5,
    description: 'Compensación Amazonía Viva',
    referenceId: 'ship-1',
    timestampIso: '2026-11-20T15:00:00Z',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.wallet.balanceUsd, 37.5);
  assert.equal(ok.wallet.totalOffsetSpentUsd, 152.5);
  assert.equal(ok.wallet.transactions.length, 1);
});
