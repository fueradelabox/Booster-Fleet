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

export interface LatLngLiteral {
  lat: number;
  lng: number;
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

export interface MaintenanceRecord {
  id: string;
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
  timestampIso: string;
  title: string;
  detail: string;
  source: 'Teltonika GPS' | 'Google Maps' | 'Billetera' | 'Blockchain';
}

export interface Shipment {
  id: string;
  code: string;
  title: string;
  cargoType: string;
  mode: ShipmentMode;
  status: ShipmentStatus;
  shipperName: string;
  originName: string;
  originCoords: LatLngLiteral;
  destinationName: string;
  destinationCoords: LatLngLiteral;
  distanceKm: number;
  estimatedDurationMin: number;
  trafficDelayPct: number;
  payloadTons: number;
  priceUsd: number;
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
  pricePerTonUsd: number;
  availableTons: number;
  species: string;
  coBenefit: string;
  coordinates: LatLngLiteral;
}

export interface BlockchainCertificate {
  id: string;
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
  issuedAtIso: string;
  standard: string;
}

export interface WalletTransaction {
  id: string;
  timestampIso: string;
  type: 'freight_escrow' | 'carrier_payout' | 'carbon_offset' | 'deposit' | 'toll_settlement';
  description: string;
  amountUsd: number;
  referenceId: string;
  status: 'confirmado' | 'en_custodia';
}

export interface DigitalWallet {
  balanceUsd: number;
  escrowHeldUsd: number;
  totalOffsetSpentUsd: number;
  autoOffsetEnabled: boolean;
  autoOffsetTargetPct: number;
  transactions: WalletTransaction[];
}

export interface PushNotificationItem {
  id: string;
  timestampIso: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  category: 'trafico' | 'mantenimiento' | 'ruta_vacia' | 'carbono' | 'billetera';
  title: string;
  message: string;
  read: boolean;
}

export interface SupportTicket {
  id: string;
  createdAtIso: string;
  subject: string;
  category: 'Teltonika GPS' | 'Enrutamiento Maps' | 'Billetera y Pagos' | 'Certificado Blockchain';
  priority: 'normal' | 'alta';
  status: 'abierto' | 'resuelto';
  aiDiagnosticSummary?: string;
}
