/**
 * ENKAI LODGEFLOW — permission catalog and role templates.
 *
 * Permissions are enforced on the server. The UI only uses them to hide
 * actions it would not be allowed to perform anyway.
 */

export const PERMISSIONS = [
  'platform.tenants.read',
  'platform.tenants.write',
  'platform.plans.write',
  'platform.audit.read',
  'platform.health.read',
  'platform.tenant.access',
  'business.read',
  'business.write',
  'branch.read',
  'branch.write',
  'room.read',
  'room.write',
  'room.delete',
  'guest.read',
  'guest.write',
  'reservation.read',
  'reservation.write',
  'frontdesk.checkin',
  'frontdesk.checkout',
  'housekeeping.read',
  'housekeeping.write',
  'maintenance.read',
  'maintenance.write',
  'finance.read',
  'finance.write',
  'staff.read',
  'staff.write',
  'cctv.read',
  'cctv.write',
  'reports.read',
  'audit.read',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const ALL_BUSINESS = PERMISSIONS.filter((key) => !key.startsWith('platform.'));
const ALL_FINANCE = ['finance.read', 'finance.write', 'reports.read', 'guest.read'];

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: readonly string[];
}

export const BUSINESS_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'OWNER',
    name: 'Business Owner',
    description: 'Full control of the business workspace.',
    permissions: ALL_BUSINESS,
  },
  {
    key: 'GENERAL_MANAGER',
    name: 'General Manager',
    description: 'Runs day-to-day operations across all branches.',
    permissions: ALL_BUSINESS,
  },
  {
    key: 'RECEPTIONIST',
    name: 'Receptionist',
    description: 'Front desk, reservations, guests and check-in/out.',
    permissions: [
      'business.read', 'branch.read', 'room.read', 'guest.read', 'guest.write',
      'reservation.read', 'reservation.write', 'frontdesk.checkin',
      'frontdesk.checkout', 'housekeeping.read', 'reports.read',
    ],
  },
  {
    key: 'ACCOUNTANT',
    name: 'Accountant',
    description: 'Invoices, payments, expenses and financial reporting.',
    permissions: [...ALL_FINANCE, 'business.read', 'branch.read'],
  },
  {
    key: 'HOUSEKEEPING_MANAGER',
    name: 'Housekeeping Manager',
    description: 'Cleaning schedule, inspections and room readiness.',
    permissions: [
      'business.read', 'branch.read', 'room.read', 'housekeeping.read',
      'housekeeping.write', 'maintenance.read', 'maintenance.write', 'reports.read',
    ],
  },
  {
    key: 'HOUSEKEEPING_STAFF',
    name: 'Housekeeping Staff',
    description: 'Own cleaning tasks and room readiness updates.',
    permissions: ['room.read', 'housekeeping.read', 'housekeeping.write'],
  },
  {
    key: 'SECURITY_MANAGER',
    name: 'Security Manager',
    description: 'Security operations and the CCTV intelligence module.',
    permissions: [
      'business.read', 'branch.read', 'room.read', 'cctv.read', 'cctv.write',
      'maintenance.read', 'maintenance.write', 'reports.read',
    ],
  },
  {
    key: 'SECURITY_OFFICER',
    name: 'Security Officer',
    description: 'Camera monitoring and event review.',
    permissions: ['room.read', 'cctv.read'],
  },
  {
    key: 'MAINTENANCE_MANAGER',
    name: 'Maintenance Manager',
    description: 'Maintenance requests and asset upkeep.',
    permissions: ['room.read', 'maintenance.read', 'maintenance.write', 'reports.read'],
  },
  {
    key: 'MAINTENANCE_STAFF',
    name: 'Maintenance Staff',
    description: 'Handle assigned maintenance work.',
    permissions: ['room.read', 'maintenance.read', 'maintenance.write'],
  },
  {
    key: 'CCTV_OPERATOR',
    name: 'CCTV Operator',
    description: 'Operate cameras and analyze footage.',
    permissions: ['room.read', 'cctv.read', 'cctv.write'],
  },
];

export function platformPermissions(): string[] {
  return PERMISSIONS.filter((key) => key.startsWith('platform.'));
}
