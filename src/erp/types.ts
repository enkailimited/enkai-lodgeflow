/**
 * API response shapes shared by the ERP pages.
 *
 * These mirror the server-side mappers exactly; nothing is invented on the
 * client. Optional fields stay optional so an empty database renders honest
 * empty states instead of placeholder values.
 */

export interface DashboardData {
  branchId: string | null;
  rooms: {
    total: number;
    available: number;
    occupied: number;
    reserved: number;
    cleaning: number;
    inspection: number;
    ready: number;
    maintenance: number;
    outOfService: number;
    occupancyRate: number;
  };
  currentGuests: number;
  arrivalsToday: number;
  departuresToday: number;
  revenueToday: number;
  outstandingBalance: number;
  outstandingInvoices: number;
  housekeeping: Record<string, number>;
  recentCheckIns: Array<{
    id: string;
    check_in_at: string;
    guest_name: string;
    room_number: string;
  }>;
  recentCheckOuts: Array<{
    id: string;
    check_out_at: string | null;
    guest_name: string;
    room_number: string;
  }>;
  revenueTrend: Array<{ day: string; total: number }>;
  branchPerformance: Array<{
    branchId: string;
    branchName: string;
    rooms: number;
    occupied: number;
    revenueToday: number;
  }>;
}

export interface BusinessSummary {
  branches: number;
  rooms: number;
  guests: number;
  staff: number;
  in_house: number;
  cameras: number;
  open_alerts: number;
}

export interface Guest {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  address: string | null;
  notes: string | null;
  marketingConsent: boolean;
  createdAt: string;
}

export interface Reservation {
  id: string;
  guestId: string;
  guestName: string;
  roomId: string;
  roomNumber: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  source: string;
  rateAmount: number | null;
  ratePlan: string | null;
  notes: string | null;
  createdAt: string;
}

export interface GuestStay {
  id: string;
  reservationId: string | null;
  guestId: string;
  guestName: string;
  roomId: string;
  roomNumber: string;
  status: string;
  checkInAt: string;
  checkOutAt: string | null;
  roomCharge: number | null;
}

export interface Arrival {
  id: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  guest_id: string;
  guest_name: string;
  phone: string | null;
  room_id: string;
  room_number: string;
}

export interface Departure {
  id: string;
  check_in_at: string;
  room_charge: number | null;
  guest_id: string;
  guest_name: string;
  room_id: string;
  room_number: string;
  outstanding: number;
}

export interface Room {
  id: string;
  roomNumber: string;
  name: string | null;
  categoryId: string;
  floor: string;
  capacity: number;
  status: string;
  description: string | null;
  pricing: {
    hourlyRate: number | null;
    dailyRate: number | null;
    overnightRate: number | null;
    currency: string;
  };
  updatedAt: string;
}

export interface RoomCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface HousekeepingTask {
  id: string;
  roomId: string;
  roomNumber: string;
  taskType: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  assignedToName: string | null;
  notes: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  inspectionNotes: string | null;
}

export interface MaintenanceRequest {
  id: string;
  room_id: string | null;
  room_number: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  guestId: string | null;
  guestName: string | null;
  number: string;
  status: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  issuedAt: string | null;
  dueAt: string | null;
  notes: string | null;
  createdAt: string;
  items?: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

export interface Payment {
  id: string;
  invoice_id: string;
  invoice_number: string;
  guest_name: string | null;
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string;
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  method: string;
  reference: string | null;
  spent_at: string;
}

export interface FinanceSummary {
  revenue: number;
  expenses: number;
  net: number;
  paymentsByMethod: Array<{ method: string; total: number; count: number }>;
  outstanding: number;
  invoiceCount: number;
}

export interface StaffMember {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  status: string;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface Branch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  isDefault: boolean;
  status: string;
}

export interface Camera {
  id: string;
  name: string;
  location: string | null;
  room_id: string | null;
  room_number: string | null;
  rtsp_url: string | null;
  status: string;
  mode: string;
  created_at: string;
}

export interface AnalysisJob {
  id: string;
  camera_id: string | null;
  room_id: string | null;
  camera_name: string | null;
  room_number: string | null;
  filename: string | null;
  status: string;
  created_at: string;
}

export interface CctvAlert {
  id: string;
  type: string;
  severity: string;
  status: string;
  message: string;
  camera_id: string | null;
  camera_name: string | null;
  room_number: string | null;
  created_at: string;
}

export interface CctvSummary {
  cameras: Record<string, number>;
  analysisJobs: Record<string, number>;
  openAlerts: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  country: string;
  currency: string;
  status: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actor_email: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface OccupancyRoomState {
  id: string;
  room_id: string;
  room_number: string;
  computed_count: number;
  registered_guest_count: number;
  confidence: number | null;
  derived_lifecycle_state: string | null;
  requires_review: boolean;
  created_at: string;
}
