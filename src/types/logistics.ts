export type UserRole = 'shipper' | 'carrier' | 'admin';

export type WorkspaceTab =
  | 'dispatch'
  | 'marketplace'
  | 'fleet'
  | 'carbon'
  | 'wallet';

export type FuelType = 'DIESEL' | 'HYBRID' | 'ELECTRIC' | 'LNG';

export type VehicleClass = 'tractocamion' | 'torton' | 'rabon' | 'van_electrica';

export type MaintenanceAlertLevel = 'nominal' | 'warning' | 'critical';

export type PaymentTerms =
  | 'contado_entrega'
  | 'credito_15'
  | 'credito_30'
  | 'credito_60'
  | 'factoraje';

export type SettlementStatus =
  | 'pendiente_entrega'
  | 'facturado_por_cobrar'
  | 'liquidado_externo';

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  companyName: string;
  role: UserRole;
  email?: string;
  phone?: string;
  taxId?: string;
}

export interface TeltonikaTelemetry {
  deviceModel: 'Teltonika FMC650' | 'Teltonika FMB920' | 'Teltonika FMC130';
  imei: string;
  ignitionOn: boolean;
  speedKmh: number;
  odometerKm: number;
  fuelLevelPct: number;
  canFuelRateLPer100Km: number;
  engineHours: number;
  satellites: number;
  lastHeartbeatIso: string;
  tamperLockActive: boolean;
}

export interface TeltonikaPacket {
  imei: string;
  lat: number;
  lng: number;
  speedKmh: number;
  odometerKm?: number;
  fuelLevelPct?: number;
  canFuelRateLPer100Km?: number;
  ignitionOn: boolean;
  satellites: number;
  timestampIso: string;
  locationLabel?: string;
}

export interface MaintenanceRecord {
  id: string;
  ownerId?: string;
  vehicleId: string;
  type: 'preventive' | 'corrective';
  title: string;
  odometerAtServiceKm: number;
  dateIso: string;
  costUsd: number;
  technicianNotes: string;
  nextDueOdometerKm?: number;
}

export interface FleetVehicle {
  id: string;
  ownerId?: string;
  visibility?: 'private' | 'shared_dispatch';
  plate: string;
  unitName: string;
  vehicleClass: VehicleClass;
  fuelType: FuelType;
  maxPayloadTons: number;
  driverName: string;
  status: 'en_ruta' | 'disponible' | 'ruta_vacia' | 'mantenimiento';
  currentPosition: LatLngLiteral;
  currentLocationLabel: string;
  emptyBackhaulTo?: string;
  nextServiceOdometerKm: number;
  nextServiceDateIso: string;
  teltonika: TeltonikaTelemetry;
  maintenanceHistory: MaintenanceRecord[];
}

export type ShipmentMode = 'spot' | 'programada' | 'ruta_vacia';

export type ShipmentStatus =
  | 'disponible'
  | 'asignado'
  | 'en_transito'
  | 'entregado';

export interface TraceabilityEvent {
  id: string;
  actorId?: string;
  timestampIso: string;
  title: string;
  detail: string;
  source: 'Teltonika GPS' | 'Google Maps' | 'Liquidación Externa' | 'Blockchain';
}

export interface Shipment {
  id: string;
  code: string;
  title: string;
  cargoType: string;
  mode: ShipmentMode;
  status: ShipmentStatus;
  shipperId?: string;
  shipperName: string;
  carrierId?: string;
  originName: string;
  originCoords: LatLngLiteral;
  destinationName: string;
  destinationCoords: LatLngLiteral;
  distanceKm: number;
  estimatedDurationMin: number;
  trafficDelayPct: number;
  payloadTons: number;
  priceUsd: number;
  paymentTerms: PaymentTerms;
  settlementStatus: SettlementStatus;
  invoiceFolio?: string;
  externalPaymentRef?: string;
  backhaulDiscountPct: number;
  scheduledDateIso: string;
  assignedVehicleId?: string;
  fuelType: FuelType;
  estimatedFuelLiters: number;
  co2Kg: number;
  ecoRouteSavedCo2Kg: number;
  offsetCompleted: boolean;
  offsetProjectId?: string;
  certificateId?: string;
  traceability: TraceabilityEvent[];
}

export interface ReforestationProject {
  id: string;
  name: string;
  region: string;
  country: string;
  standard: 'Verra VCS' | 'Gold Standard' | 'Climate Action Reserve';
  registryCode: string;
  patchProjectId?: string;
  pricePerTonUsd: number;
  availableTons: number;
  species: string;
  coBenefit: string;
  coordinates: LatLngLiteral;
}

export interface BlockchainCertificate {
  id: string;
  issuerId?: string;
  visibility?: 'public_verifiable';
  certificateCode: string;
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
  txHash: string;
  blockNumber: number;
  anchorMode: 'evm_onchain' | 'ecdsa_attestation';
  networkName: string;
  explorerUrl?: string;
  signature?: string;
  signerAddress?: string;
  registryProvider?: string;
  registryOrderId?: string;
  registryStatus: 'retired_verified' | 'pending_registry_settlement';
  issuedAtIso: string;
  standard: string;
}

export interface SettlementRecord {
  id: string;
  ownerId?: string;
  counterpartyId?: string;
  shipmentId: string;
  timestampIso: string;
  type: 'freight_invoice' | 'external_transfer' | 'carbon_retirement' | 'esg_budget_allocation';
  description: string;
  amountUsd: number;
  paymentTerms: PaymentTerms | 'esg_directo';
  dueDateIso?: string;
  invoiceFolio?: string;
  externalRef?: string;
  status: 'pendiente_entrega' | 'facturado_por_cobrar' | 'liquidado_externo' | 'confirmado';
}

export interface SettlementLedger {
  esgBudgetUsd: number;
  totalOffsetSpentUsd: number;
  pendingReceivablesUsd: number;
  settledExternalUsd: number;
  autoOffsetEnabled: boolean;
  autoOffsetTargetPct: number;
  records: SettlementRecord[];
}

export interface PushNotificationItem {
  id: string;
  recipientId?: string;
  timestampIso: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  category: 'trafico' | 'mantenimiento' | 'ruta_vacia' | 'carbono' | 'liquidacion';
  title: string;
  message: string;
  read: boolean;
}

export interface SupportTicket {
  id: string;
  authorId?: string;
  createdAtIso: string;
  subject: string;
  category: 'Teltonika GPS' | 'Enrutamiento Maps' | 'Liquidación y Facturas' | 'Certificado Blockchain';
  priority: 'normal' | 'alta';
  status: 'abierto' | 'resuelto';
  aiDiagnosticSummary?: string;
}
