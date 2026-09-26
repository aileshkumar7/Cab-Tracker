import { Timestamp } from 'firebase/firestore';

export type UserRole = 'master_admin' | 'admin' | 'supervisor' | 'driver' | 'sub_vendor';

export type DriverShiftType = 'morning_12h' | 'night_12h';
export type DriverSlotType = 'first' | 'second';

export interface SubVendorPermissions {
  canViewMap: boolean;
  canViewFleetTable: boolean;
  canAssignDuty: boolean;
  canViewReports: boolean;
  canViewAttendance: boolean;
  canAddCab: boolean;
  canDeleteCab: boolean;
  canExportData: boolean;
  canViewDrivers: boolean;
}

export const DEFAULT_SUB_VENDOR_PERMISSIONS: SubVendorPermissions = {
  canViewMap: true,
  canViewFleetTable: true,
  canAssignDuty: true,
  canViewReports: true,
  canViewAttendance: true,
  canAddCab: false,
  canDeleteCab: false,
  canExportData: true,
  canViewDrivers: true,
};

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  site?: string; // Bound site / location (e.g. 'North Terminal Hub', 'Central Tech Park Hub')
  cabNumber?: string;
  shift?: DriverShiftType; // 'morning_12h' (1st Driver) or 'night_12h' (2nd Driver)
  driverSlot?: DriverSlotType; // 'first' | 'second'
  temporaryPassword?: string; // Plaintext or initial password for admin credential tracking
  vendorName?: string; // Company / agency name for Sub-Vendors (e.g. 'Apex Travel Fleet', 'Sai Logistics')
  assignedCabs?: string[]; // Cabs that this Sub-Vendor is authorized to track
  permissions?: SubVendorPermissions; // Specific features enabled for this Sub-Vendor by Master Admin
  status?: 'active' | 'suspended';
  createdAt: Timestamp | string | number;
  lastLogin?: Timestamp | any;
}

export type FleetCabStatus = 'reported_at_hub' | 'on_duty' | 'free' | 'cab_off_duty';

export interface FleetCab {
  id?: string;
  cabNumber: string;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  baseHub: string;
  site?: string; // Bound site / location
  vendorName?: string; // Sub-Vendor company name if owned/supplied by a vendor
  status: FleetCabStatus;
  standingStatus?: 'free' | 'on_duty' | 'pending';
  currentLocationText: string;
  currentLocationLat: number;
  currentLocationLng: number;
  lastUpdated: Timestamp | any;
  lastPunchedLocation?: string;
  lastPunchedLat?: number;
  lastPunchedLng?: number;
  lastPunchedAt?: Timestamp | any;
  isMoving?: boolean;
  speed?: number;
  heading?: number;
  assignedSupervisor: string;
  // 2 Drivers per cab (12-hr shifts) support
  firstDriverName?: string;
  firstDriverPhone?: string;
  firstDriverShift?: DriverShiftType;
  secondDriverName?: string;
  secondDriverPhone?: string;
  secondDriverShift?: DriverShiftType;
  currentShift?: DriverShiftType;
  activeDriverSlot?: DriverSlotType;
  activeDriverName?: string;
  activeDriverPhone?: string;
  dutyStartedAt?: Timestamp | any;
  dutyStartLocation?: string;
  dutyEndLocation?: string;
  dutyEndedAt?: Timestamp | any;
}

export const cleanCabForCompare = (c?: string): string => {
  if (!c) return '';
  return c.trim().toUpperCase().replace(/[\s\-_]+/g, '');
};

export const normalizeCab = (c?: string): string => {
  if (!c) return '';
  return c.trim().toUpperCase().replace(/\s+/g, '');
};

export const normalizePhone = (p?: string): string => {
  if (!p) return '';
  return p.replace(/\D/g, '').slice(-10);
};

export type DutyStatus = 'active' | 'completed';

export interface Duty {
  id?: string;
  cabNumber: string;
  driverName: string;
  driverPhone?: string;
  site?: string;
  shift?: DriverShiftType;
  driverSlot?: DriverSlotType;
  startLocationText: string;
  startTime: Timestamp | any;
  endLocationText: string;
  endTime: Timestamp | any | null;
  status: DutyStatus;
  assignedBy: string;
  concludedReason?: 'manual' | 'shift_limit_exceeded';
}

export type NotificationType =
  | 'duty_completed'
  | 'reported_at_hub'
  | 'duty_started'
  | 'location_punch'
  | 'shift_concluded_14h';

export interface FleetNotification {
  id?: string;
  cabNumber: string;
  driverName?: string;
  site?: string;
  type: NotificationType;
  locationText: string;
  lat: number;
  lng: number;
  timestamp: Timestamp | any;
  read: boolean;
  notes?: string;
}

export type LocationLogEventType =
  | 'location_punch'
  | 'duty_started'
  | 'duty_completed'
  | 'reported_at_hub'
  | 'telemetry_ping'
  | 'shift_concluded_14h';

export interface LocationLog {
  id?: string;
  cabNumber: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  site?: string;
  eventType: LocationLogEventType;
  locationText: string;
  lat: number;
  lng: number;
  dutyId?: string | null;
  speed?: number;
  notes?: string;
  timestamp: Timestamp | any;
}

export interface DriverAttendance {
  id?: string;
  driverName: string;
  driverPhone?: string;
  cabNumber: string;
  site?: string;
  driverSlot?: DriverSlotType; // 'first' | 'second'
  driverSlotLabel?: string; // '1st Driver' | '2nd Driver'
  date: string; // 'YYYY-MM-DD'
  punchInTime: Timestamp | any;
  punchInLocation: string;
  punchOutTime?: Timestamp | any | null;
  punchOutLocation?: string | null;
  status: 'present' | 'completed';
  dutyId?: string | null;
  totalHoursWorked?: number | null;
  notes?: string;
  createdAt?: Timestamp | any;
}

export const DEFAULT_SITES = [
  'North Terminal Hub',
  'Central Tech Park Hub',
  'South City Hub',
  'Airport Expressway Hub',
  'West Industrial Hub',
] as const;

