/**
 * ERP shell: permission-aware, grouped navigation around lodge operations.
 * A platform administrator can open a tenant workspace read-only; the
 * elevation is kept in sessionStorage and audited by the backend.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BedDouble,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ConciergeBell,
  Gauge,
  LogOut,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getElevatedTenantId, setElevatedTenantId } from '../api/client';
import { LoginPage } from './LoginPage';
import { DashboardPage } from './DashboardPage';
import { FrontDeskPage } from './FrontDeskPage';
import { ReservationsPage } from './ReservationsPage';
import { GuestsPage } from './GuestsPage';
import { RoomsPage } from './RoomsPage';
import { HousekeepingPage } from './HousekeepingPage';
import { FinancePage } from './FinancePage';
import { StaffPage } from './StaffPage';
import { ReportsPage } from './ReportsPage';
import { CctvPage } from './CctvPage';
import { SettingsPage } from './SettingsPage';
import { PlatformPage } from './PlatformPage';
import { LoadingBlock } from './ui';

type RouteId =
  | 'dashboard'
  | 'frontdesk'
  | 'reservations'
  | 'guests'
  | 'rooms'
  | 'housekeeping'
  | 'finance'
  | 'reports'
  | 'staff'
  | 'settings'
  | 'cctv'
  | 'platform';

interface NavItem {
  id: RouteId;
  label: string;
  icon: ReactNode;
  permission: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: <Gauge className="w-4 h-4" />, permission: 'reports.read' }],
  },
  {
    label: 'Front office',
    items: [
      { id: 'frontdesk', label: 'Front desk', icon: <ConciergeBell className="w-4 h-4" />, permission: 'reservation.read' },
      { id: 'reservations', label: 'Reservations', icon: <CalendarDays className="w-4 h-4" />, permission: 'reservation.read' },
      { id: 'guests', label: 'Guests', icon: <Users className="w-4 h-4" />, permission: 'guest.read' },
    ],
  },
  {
    label: 'Rooms & housekeeping',
    items: [
      { id: 'rooms', label: 'Rooms', icon: <BedDouble className="w-4 h-4" />, permission: 'room.read' },
      { id: 'housekeeping', label: 'Housekeeping', icon: <ClipboardList className="w-4 h-4" />, permission: 'housekeeping.read' },
    ],
  },
  {
    label: 'Finance',
    items: [{ id: 'finance', label: 'Finance', icon: <Receipt className="w-4 h-4" />, permission: 'finance.read' }],
  },
  {
    label: 'Business',
    items: [
      { id: 'reports', label: 'Reports', icon: <Sparkles className="w-4 h-4" />, permission: 'reports.read' },
      { id: 'staff', label: 'Staff', icon: <Users className="w-4 h-4" />, permission: 'staff.read' },
      { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, permission: 'business.read' },
    ],
  },
  {
    label: 'CCTV intelligence',
    items: [{ id: 'cctv', label: 'Cameras & alerts', icon: <Video className="w-4 h-4" />, permission: 'cctv.read' }],
  },
  {
    label: 'Platform',
    items: [{ id: 'platform', label: 'Platform admin', icon: <Building2 className="w-4 h-4" />, permission: 'platform.tenants.read' }],
  },
];

const ROUTE_TITLES: Record<RouteId, string> = {
  dashboard: 'Dashboard',
  frontdesk: 'Front desk',
  reservations: 'Reservations',
  guests: 'Guests',
  rooms: 'Rooms',
  housekeeping: 'Housekeeping',
  finance: 'Finance',
  reports: 'Reports',
  staff: 'Staff',
  settings: 'Settings',
  cctv: 'CCTV intelligence',
  platform: 'Platform administration',
};

const ELEVATED_NAME_KEY = 'lodge_elevated_tenant_name';

function readElevation(): { id: string; name: string } | null {
  const id = getElevatedTenantId();
  if (!id) return null;
  let name = 'Tenant workspace';
  try {
    name = sessionStorage.getItem(ELEVATED_NAME_KEY) ?? name;
  } catch {
    /* ignore unavailable storage */
  }
  return { id, name };
}

export function ErpApp() {
  const { user, loading, logout, can } = useAuth();
  const [route, setRoute] = useState<RouteId>('dashboard');
  const [elevated, setElevated] = useState<{ id: string; name: string } | null>(() => readElevation());

  const isPlatform = user?.tenantId === null;
  const elevatedRead = isPlatform && Boolean(elevated);

  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (can(item.permission)) return true;
        // Platform staff see read-only business pages only while elevated.
        return elevatedRead && item.permission.endsWith('.read');
      }),
    })).filter((group) => group.items.length > 0);
  }, [can, elevatedRead]);

  const visibleRoutes = useMemo(() => visibleGroups.flatMap((group) => group.items.map((item) => item.id)), [visibleGroups]);

  useEffect(() => {
    if (!user) return;
    if (visibleRoutes.length === 0) return;
    if (!visibleRoutes.includes(route)) {
      setRoute(user.tenantId === null && !elevated ? 'platform' : visibleRoutes[0]);
    }
  }, [user, visibleRoutes, route, elevated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F7FC] flex items-center justify-center">
        <LoadingBlock label="Restoring your session…" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  function enterTenant(tenantId: string, tenantName: string) {
    setElevatedTenantId(tenantId);
    try {
      sessionStorage.setItem(ELEVATED_NAME_KEY, tenantName);
    } catch {
      /* ignore unavailable storage */
    }
    setElevated({ id: tenantId, name: tenantName });
    setRoute('dashboard');
  }

  function exitTenant() {
    setElevatedTenantId(null);
    try {
      sessionStorage.removeItem(ELEVATED_NAME_KEY);
    } catch {
      /* ignore unavailable storage */
    }
    setElevated(null);
    setRoute('platform');
  }

  async function signOut() {
    setElevatedTenantId(null);
    try {
      sessionStorage.removeItem(ELEVATED_NAME_KEY);
    } catch {
      /* ignore unavailable storage */
    }
    setElevated(null);
    await logout();
  }

  function renderPage() {
    if (!visibleRoutes.includes(route)) {
      return (
        <div className="rounded-2xl border border-[#E1EAF5] bg-white px-5 py-10 text-center">
          <p className="text-sm font-semibold text-[#152B4A]">Choose a page</p>
          <p className="text-xs text-[#8EA2BC] mt-1">
            {visibleGroups.length === 0
              ? 'Your account has no workspace permissions yet.'
              : 'Select a page from the navigation on the left.'}
          </p>
        </div>
      );
    }
    switch (route) {
      case 'frontdesk':
        return <FrontDeskPage />;
      case 'reservations':
        return <ReservationsPage />;
      case 'guests':
        return <GuestsPage />;
      case 'rooms':
        return <RoomsPage />;
      case 'housekeeping':
        return <HousekeepingPage />;
      case 'finance':
        return <FinancePage />;
      case 'reports':
        return <ReportsPage />;
      case 'staff':
        return <StaffPage />;
      case 'settings':
        return <SettingsPage />;
      case 'cctv':
        return <CctvPage />;
      case 'platform':
        return <PlatformPage onEnterTenant={enterTenant} />;
      case 'dashboard':
        return <DashboardPage />;
      default:
        return <DashboardPage />;
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F7FC]">
      <div className="flex">
        <aside className="hidden lg:flex w-60 shrink-0 flex-col min-h-screen bg-[#082B59] text-white">
          <div className="px-5 py-5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-[#8FC2FF]" />
              </span>
              <div>
                <p className="text-xs font-bold tracking-wide">ENKAI LODGEFLOW</p>
                <p className="text-[10px] text-white/50">Lodge management ERP</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            {visibleGroups.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35 mb-1.5">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setRoute(item.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-[12px] font-medium transition-colors ${
                        route === item.id ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span className="flex-1 text-left">{item.label}</span>
                      {route === item.id && <ChevronRight className="w-3 h-3 text-white/40" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {visibleGroups.length === 0 && (
              <p className="px-2 text-[11px] text-white/50">
                Your account has no workspace permissions. Ask an administrator to assign a role.
              </p>
            )}
          </nav>

          <div className="px-4 py-3 border-t border-white/10 text-[10px] text-white/45">
            <p>Phase 3 · multi-tenant</p>
            <p className="mt-0.5">Africa/Dar_es_Salaam</p>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#E1EAF5]">
            <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-[#8EA2BC]">
                  {elevated ? 'Platform read-only workspace' : user.tenantName ?? 'ENKAI Platform'}
                </p>
                <h1 className="text-sm font-bold text-[#152B4A] truncate">{ROUTE_TITLES[route]}</h1>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/cctv"
                  className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E1EAF5] bg-white text-[11px] font-semibold text-[#152B4A] hover:border-[#1769E8]/50"
                >
                  <Video className="w-3.5 h-3.5" /> CCTV workspace
                </a>
                {elevated && (
                  <button
                    onClick={exitTenant}
                    className="h-8 px-3 rounded-lg border border-[#F5A623]/40 bg-[#F5A623]/10 text-[11px] font-semibold text-[#8A5B00]"
                  >
                    Exit workspace
                  </button>
                )}
                <div className="hidden sm:block text-right">
                  <p className="text-[11px] font-semibold text-[#152B4A] leading-tight">{user.displayName}</p>
                  <p className="text-[10px] text-[#8EA2BC] leading-tight">
                    {user.roles.length > 0 ? user.roles.join(', ').replace(/_/g, ' ') : 'No role'}
                  </p>
                </div>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="w-8 h-8 rounded-lg border border-[#E1EAF5] text-[#5B6B82] hover:text-[#B42318] hover:border-[#EF4444]/40 flex items-center justify-center"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="lg:hidden px-3 pb-2 flex gap-1 overflow-x-auto">
              {visibleGroups.flatMap((group) => group.items).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setRoute(item.id)}
                  className={`whitespace-nowrap px-2.5 h-7 rounded-lg text-[11px] font-medium border ${
                    route === item.id ? 'bg-[#1769E8] text-white border-[#1769E8]' : 'bg-white text-[#5B6B82] border-[#E1EAF5]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          {elevated && (
            <div className="px-4 sm:px-6 pt-4">
              <div className="rounded-xl border border-[#F5A623]/35 bg-[#F5A623]/8 px-4 py-2.5 text-[11px] text-[#8A5B00]">
                You are viewing <strong>{elevated.name}</strong> with audited, read-only platform access. Writes
                remain blocked unless you sign in as a business user with the required permission.
              </div>
            </div>
          )}

          <main className="px-4 sm:px-6 py-5 max-w-[1500px]">{renderPage()}</main>
        </div>
      </div>
    </div>
  );
}
