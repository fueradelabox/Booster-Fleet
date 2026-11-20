import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCarbonFootprint,
  calculateSpotFreightPrice,
  computeDueDateIso,
  computePredictiveEta,
  evaluateMaintenanceStatus,
  mintBlockchainCertificate,
  normalizeTeltonikaPayload,
  processEsgBudgetOffset,
} from './logisticsEngine.ts';
import type { FleetVehicle, SettlementLedger } from '../types/logistics.ts';

test('calculateCarbonFootprint computes diesel vs electric accurately with eco-route savings', () => {
  const diesel = calculateCarbonFootprint({
    distanceKm: 400,
    fuelType: 'DIESEL',
    payloadTons: 20,
    trafficDelayPct: 12,
  });
  const electric = calculateCarbonFootprint({
    distanceKm: 400,
    fuelType: 'ELECTRIC',
    payloadTons: 20,
    trafficDelayPct: 12,
  });

  assert.ok(diesel.fuelConsumedLiters > 120);
  assert.ok(diesel.co2Kg > 300);
  assert.ok(diesel.ecoRouteSavedCo2Kg > 20);
  assert.equal(electric.fuelConsumedLiters, 0);
  assert.ok(electric.energyKwh > 400);
  assert.ok(electric.co2Kg < diesel.co2Kg * 0.35);
});

test('calculateSpotFreightPrice applies empty-backhaul discount properly', () => {
  const standard = calculateSpotFreightPrice({
    distanceKm: 500,
    payloadTons: 18,
    urgency: 'programada',
    backhaulDiscountPct: 0,
  });
  const backhaul = calculateSpotFreightPrice({
    distanceKm: 500,
    payloadTons: 18,
    urgency: 'programada',
    backhaulDiscountPct: 25,
  });

  assert.ok(backhaul.discountUsd > 0);
  assert.equal(
    Number((standard.totalPriceUsd * 0.75).toFixed(2)),
    backhaul.totalPriceUsd
  );
});

test('evaluateMaintenanceStatus detects nominal, warning, and critical thresholds', () => {
  const baseVehicle: FleetVehicle = {
    id: 'v-test',
    plate: 'AA-123',
    unitName: 'Test Unit',
    vehicleClass: 'tractocamion',
    fuelType: 'DIESEL',
    maxPayloadTons: 24,
    driverName: 'Test Driver',
    status: 'disponible',
    currentPosition: { lat: 19.4, lng: -99.1 },
    currentLocationLabel: 'CDMX',
    nextServiceOdometerKm: 100000,
    nextServiceDateIso: '2026-12-30T00:00:00Z',
    teltonika: {
      deviceModel: 'Teltonika FMC650',
      imei: '352093089412000',
      ignitionOn: false,
      speedKmh: 0,
      odometerKm: 95000,
      fuelLevelPct: 80,
      canFuelRateLPer100Km: 31,
      engineHours: 2000,
      satellites: 14,
      lastHeartbeatIso: '2026-11-20T00:00:00Z',
      tamperLockActive: true,
    },
    maintenanceHistory: [],
  };

  assert.equal(
    evaluateMaintenanceStatus(baseVehicle, '2026-11-20T00:00:00Z').level,
    'nominal'
  );

  const warningVehicle: FleetVehicle = {
    ...baseVehicle,
    teltonika: { ...baseVehicle.teltonika, odometerKm: 99200 },
  };
  assert.equal(
    evaluateMaintenanceStatus(warningVehicle, '2026-11-20T00:00:00Z').level,
    'warning'
  );

  const criticalVehicle: FleetVehicle = {
    ...baseVehicle,
    teltonika: { ...baseVehicle.teltonika, odometerKm: 100250 },
  };
  assert.equal(
    evaluateMaintenanceStatus(criticalVehicle, '2026-11-20T00:00:00Z').level,
    'critical'
  );
});

test('computePredictiveEta produces ordered confidence window', () => {
  const eta = computePredictiveEta({
    distanceKm: 420,
    baseSpeedKmh: 72,
    trafficDelayPct: 15,
    restStopsCount: 1,
  });

  assert.ok(eta.optimisticMinutes < eta.estimatedMinutes);
  assert.ok(eta.estimatedMinutes < eta.conservativeMinutes);
  assert.ok(eta.effectiveSpeedKmh > 30 && eta.effectiveSpeedKmh < 80);
});

test('mintBlockchainCertificate produces deterministic 64-hex-char txHash and merges anchor proof', () => {
  const certA = mintBlockchainCertificate({
    shipmentId: 'ship-1',
    shipmentCode: 'TC-100',
    vehiclePlate: '84-AK-7M',
    teltonikaImei: '352093089412014',
    distanceKm: 214,
    fuelConsumedLiters: 71.3,
    co2CompensatedKg: 191.1,
    offsetCostUsd: 4.68,
    projectId: 'proj-sierra',
    projectName: 'Sierra Madre',
    standard: 'Verra VCS',
    issuedAtIso: '2026-11-20T12:00:00Z',
    existingBlockCount: 1,
  });
  const certB = mintBlockchainCertificate({
    shipmentId: 'ship-1',
    shipmentCode: 'TC-100',
    vehiclePlate: '84-AK-7M',
    teltonikaImei: '352093089412014',
    distanceKm: 214,
    fuelConsumedLiters: 71.3,
    co2CompensatedKg: 191.1,
    offsetCostUsd: 4.68,
    projectId: 'proj-sierra',
    projectName: 'Sierra Madre',
    standard: 'Verra VCS',
    issuedAtIso: '2026-11-20T12:00:00Z',
    existingBlockCount: 1,
  });

  assert.equal(certA.txHash, certB.txHash);
  assert.match(certA.txHash, /^0x[0-9a-f]{64}$/);
  assert.equal(certA.certificateCode, certA.id);
});

test('processEsgBudgetOffset validates insufficient budget and deducts properly when funded', () => {
  const ledger: SettlementLedger = {
    esgBudgetUsd: 50,
    totalOffsetSpentUsd: 10,
    pendingReceivablesUsd: 890,
    settledExternalUsd: 495,
    autoOffsetEnabled: true,
    autoOffsetTargetPct: 100,
    records: [],
  };

  const fail = processEsgBudgetOffset({
    ledger,
    amountUsd: 75,
    description: 'Compensación excesiva',
    shipmentId: 'ship-9',
    timestampIso: '2026-11-20T12:00:00Z',
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.ledger.esgBudgetUsd, 50);

  const ok = processEsgBudgetOffset({
    ledger,
    amountUsd: 12.5,
    description: 'Compensación válida',
    shipmentId: 'ship-10',
    timestampIso: '2026-11-20T12:05:00Z',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.ledger.esgBudgetUsd, 37.5);
  assert.equal(ok.ledger.totalOffsetSpentUsd, 22.5);
  assert.equal(ok.ledger.records.length, 1);
});

test('normalizeTeltonikaPayload parses both flat and Codec IO telemetry payloads', () => {
  const flat = normalizeTeltonikaPayload({
    imei: '352093089412014',
    lat: 20.5888,
    lng: -100.3899,
    speedKmh: 84,
    odometerKm: 183900,
    fuelLevelPct: 65,
    ignitionOn: true,
    satellites: 15,
  });
  assert.equal(flat.ok, true);
  if (flat.ok) {
    assert.equal(flat.packet.speedKmh, 84);
    assert.equal(flat.packet.odometerKm, 183900);
  }

  const codec = normalizeTeltonikaPayload({
    state: {
      reported: {
        imei: '358480081145792',
        latlng: '20.6601,-103.3490',
        sp: 62,
        io: { '16': 72500000, '89': 88, '239': 1 },
        sat: 14,
      },
    },
  });
  assert.equal(codec.ok, true);
  if (codec.ok) {
    assert.equal(codec.packet.odometerKm, 72500);
    assert.equal(codec.packet.fuelLevelPct, 88);
    assert.equal(codec.packet.ignitionOn, true);
  }
});

test('computeDueDateIso adds commercial credit terms accurately', () => {
  const due30 = computeDueDateIso('2026-11-01T00:00:00Z', 'credito_30');
  assert.ok(due30.startsWith('2026-12-01'));
});
