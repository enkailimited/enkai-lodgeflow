import React, { useState, useEffect } from 'react';
import {
  Home,
  Video,
  PlayCircle,
  BedDouble,
  Clock,
  CheckCircle2,
  BarChart3,
  Settings,
  Sliders,
  MapPin,
  Bell,
  Calendar,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { ConnectionStatus, StatusBadge } from '../ui/StatusComponents';
import { Modal } from '../ui/Modal';

export type AppRouteId =
  | 'dashboard'
  | 'rooms'
  | 'monitoring'
  | 'analysis'
  | 'activity'
  | 'timeline'
  | 'handover'
  | 'reports'
  | 'admin'
  | 'settings';

export interface NavItemSpec {
  id: AppRouteId;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

export const APP_NAV_ITEMS: NavItemSpec[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <Home className="w-4 h-4" /> },
  { id: 'rooms', label: 'Room Management', icon: <BedDouble className="w-4 h-4" /> },
  { id: 'monitoring', label: 'CCTV Monitoring', icon: <Video className="w-4 h-4" /> },
  { id: 'analysis', label: 'Video Analysis', icon: <PlayCircle className="w-4 h-4" /> },
  { id: 'activity', label: 'Room Activity', icon: <BedDouble className="w-4 h-4" /> },
  { id: 'timeline', label: 'Event Timeline', icon: <Clock className="w-4 h-4" /> },
  { id: 'handover', label: 'Room Handover', icon: <CheckCircle2 className="w-4 h-4" /> },
  { id: 'reports', label: 'Reports & Analytics', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'admin', label: 'Administration', icon: <Settings className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Sliders className="w-4 h-4" /> },
];

export interface AppNotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  tone: 'info' | 'success' | 'warning';
}

export interface AppLayoutProps {
  activeRoute: AppRouteId;
  onNavigate: (route: AppRouteId) => void;
  selectedBranch: string;
  branches: string[];
  onSelectBranch: (branch: string) => void;
  systemOnline: boolean;
  modelName: string;
  notifications: AppNotificationItem[];
  onMarkAllNotificationsRead: () => void;
  currentUserName: string;
  currentUserRole: string;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeRoute,
  onNavigate,
  selectedBranch,
  branches,
  onSelectBranch,
  systemOnline,
  modelName,
  notifications,
  onMarkAllNotificationsRead,
  currentUserName,
  currentUserRole,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [darDateStr, setDarDateStr] = useState<string>('');
  const [darTimeStr, setDarTimeStr] = useState<string>('');

  // Live Africa/Dar_es_Salaam clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      try {
        const dStr = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Africa/Dar_es_Salaam',
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }).format(now);
        const tStr = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Africa/Dar_es_Salaam',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).format(now);
        setDarDateStr(dStr);
        setDarTimeStr(`${tStr} EAT`);
      } catch {
        setDarDateStr(now.toDateString());
        setDarTimeStr(now.toLocaleTimeString());
      }
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNavClick = (route: AppRouteId) => {
    onNavigate(route);
    setMobileDrawerOpen(false);
  };

  return (
    <div className="h-dvh max-h-dvh bg-[#F5F8FD] text-[#152B4A] flex flex-col lg:flex-row overflow-hidden">
      {/* Desktop Fixed Navy Sidebar */}
      <aside
        className={`hidden lg:flex flex-col justify-between shrink-0 bg-gradient-to-b from-[#082B59] to-[#061F43] text-white border-r border-[#082B59] transition-all duration-200 select-none h-full z-30 ${
          sidebarCollapsed ? 'w-[78px]' : 'w-[252px]'
        }`}
      >
        {/* Top Brand + Collapse Control */}
        <div className="p-4 space-y-5 overflow-y-auto min-h-0 grow">
          <div className="flex items-center justify-between gap-2">
            <div
              onClick={() => handleNavClick('dashboard')}
              className="cursor-pointer flex items-center justify-center w-full py-1"
              title="ENKAI LODGEFLOW — AI CCTV Room Intelligence"
            >
              {sidebarCollapsed ? (
                <img
                  src="/assets/enkai-logo-mark.png"
                  alt="ENKAI LODGEFLOW"
                  className="w-10 h-10 object-contain drop-shadow-sm"
                />
              ) : (
                <img
                  src="/assets/enkai-logo-compact.png"
                  alt="ENKAI LODGEFLOW"
                  className="h-12 w-auto max-w-[195px] object-contain drop-shadow-sm"
                />
              )}
            </div>
          </div>

          {/* Navigation List */}
          <nav aria-label="Main Navigation" className="space-y-1">
            {APP_NAV_ITEMS.map((item) => {
              const isActive = item.id === activeRoute;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center ${
                    sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-3.5'
                  } py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-[#1769E8] to-[#3188F5] text-white shadow-md shadow-[#061F43]/40'
                      : 'text-white/80 hover:text-white hover:bg-white/8'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'text-white/85'
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <span className="ml-3 truncate">{item.label}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom System Connection Status + User Profile + Collapse Button */}
        <div className="p-3.5 space-y-2.5 border-t border-white/10 shrink-0">
          {!sidebarCollapsed ? (
            <ConnectionStatus
              online={systemOnline}
              variant="sidebar"
              sublabel={systemOnline ? 'All Systems Operational' : 'Verify Gemini API'}
            />
          ) : (
            <div
              title={
                systemOnline
                  ? 'System Online — All Systems Operational'
                  : 'System Standby'
              }
              className="flex justify-center py-2"
            >
              <span
                className={`w-3 h-3 rounded-full ${
                  systemOnline ? 'bg-[#12B981]' : 'bg-[#F5A623]'
                }`}
              />
            </div>
          )}

          <div
            onClick={() => setProfileModalOpen(true)}
            title="User Profile & Session Details"
            className={`p-2.5 rounded-xl bg-[#061F43]/90 hover:bg-white/10 border border-white/10 flex items-center ${
              sidebarCollapsed ? 'justify-center' : 'justify-between'
            } gap-2.5 cursor-pointer transition-colors`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#EAF3FF] text-[#082B59] flex items-center justify-center font-bold text-xs shrink-0">
                <User className="w-4 h-4" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {currentUserName}
                  </div>
                  <div className="text-[11px] text-white/65 truncate">
                    {currentUserRole}
                  </div>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <ChevronRight className="w-4 h-4 text-white/60 shrink-0" />
            )}
          </div>

          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="w-full py-1.5 text-[11px] text-white/60 hover:text-white flex items-center justify-center gap-1 cursor-pointer"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer Overlay */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileDrawerOpen(false);
          }}
        >
          <div className="fixed inset-0 bg-[#061F43]/65 backdrop-blur-[2px]" />
          <div className="relative z-10 w-[275px] max-w-[82vw] bg-gradient-to-b from-[#082B59] to-[#061F43] text-white h-full flex flex-col justify-between p-4 overflow-y-auto shadow-2xl">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <img
                  src="/assets/enkai-logo-compact.png"
                  alt="ENKAI LODGEFLOW"
                  className="h-10 w-auto object-contain"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="!text-white hover:!bg-white/10 !px-2"
                  icon={<X className="w-5 h-5" />}
                />
              </div>

              <nav className="space-y-1">
                {APP_NAV_ITEMS.map((item) => {
                  const isActive = item.id === activeRoute;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-gradient-to-r from-[#1769E8] to-[#3188F5] text-white shadow-sm'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/10">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10">
              <ConnectionStatus online={systemOnline} variant="sidebar" />
              <div
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setProfileModalOpen(true);
                }}
                className="p-2.5 rounded-xl bg-[#061F43] border border-white/10 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#EAF3FF] text-[#082B59] flex items-center justify-center font-bold text-xs">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{currentUserName}</div>
                    <div className="text-[11px] text-white/65">{currentUserRole}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/60" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
        {/* Reusable Top Navigation Header (Matches Reference Image) */}
        <header className="shrink-0 z-20 bg-[#F5F8FD]/95 backdrop-blur-xs border-b border-[#E1EAF5] px-4 sm:px-6 py-3">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
            {/* Left: Mobile Drawer Trigger */}
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMobileDrawerOpen(true)}
                className="lg:hidden !px-2.5"
                icon={<Menu className="w-4 h-4 text-[#082B59]" />}
                title="Open navigation drawer"
              />
            </div>

            {/* Right: Branch Selector, Notifications, Dar es Salaam Clock, Profile */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Branch Selector Pill */}
              <div className="relative flex items-center bg-white border border-[#E1EAF5] rounded-full px-3 py-1.5 shadow-2xs">
                <MapPin className="w-3.5 h-3.5 text-[#1769E8] mr-1.5 shrink-0" />
                <select
                  aria-label="Select Lodge Branch"
                  value={selectedBranch}
                  onChange={(e) => onSelectBranch(e.target.value)}
                  className="text-xs font-semibold text-[#152B4A] bg-transparent focus:outline-none pr-1 cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notifications Button & Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((o) => !o)}
                  className="relative w-9 h-9 rounded-full bg-white border border-[#E1EAF5] hover:border-[#1769E8] flex items-center justify-center text-[#082B59] shadow-2xs cursor-pointer transition-colors"
                  title="System & CCTV Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-[#E1EAF5] rounded-2xl shadow-xl p-4 z-40 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#E1EAF5] pb-2.5">
                      <span className="text-xs font-bold text-[#152B4A]">
                        Notifications ({notifications.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onMarkAllNotificationsRead();
                          setNotificationsOpen(false);
                        }}
                        className="text-xs font-semibold text-[#1769E8] hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-xl border text-xs ${
                            n.read
                              ? 'bg-[#F5F8FD] border-[#E1EAF5]'
                              : 'bg-[#EAF3FF]/60 border-[#1769E8]/30'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold text-[#152B4A]">
                            <span>{n.title}</span>
                            <span className="text-[10px] font-mono text-[#718096]">
                              {n.timestamp}
                            </span>
                          </div>
                          <p className="text-[#718096] mt-0.5">{n.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Dar es Salaam Date & Time Display */}
              <div className="hidden md:flex items-center gap-2.5 bg-white border border-[#E1EAF5] rounded-xl px-3 py-1.5 shadow-2xs">
                <Calendar className="w-4 h-4 text-[#082B59] shrink-0" />
                <div className="text-[11px] leading-tight font-mono tabular-nums">
                  <div className="font-bold text-[#152B4A]">{darDateStr}</div>
                  <div className="text-[#718096]">{darTimeStr}</div>
                </div>
              </div>

              {/* Enterprise Theme / Status Indicator Button */}
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                title="Enterprise Session & Operator Profile"
                className="w-9 h-9 rounded-full bg-white border border-[#E1EAF5] hover:border-[#1769E8] flex items-center justify-center text-[#1769E8] shadow-2xs cursor-pointer transition-colors"
              >
                <Sun className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content Container (only this region scrolls) */}
        <main className="flex-1 min-h-0 overflow-y-auto w-full">
          <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-6">
            {children}
          </div>
        </main>

        {/* Enterprise Footer */}
        <footer className="shrink-0 border-t border-[#E1EAF5] bg-white px-4 sm:px-6 py-3.5">
          <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#718096]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#082B59]">ENKAI LODGEFLOW</span>
              <span>·</span>
              <span>AI-Powered Lodge Management &amp; CCTV Room Intelligence</span>
            </div>
            <div className="font-mono text-[11px]">
              Model: {modelName} · TZ: Africa/Dar_es_Salaam (EAT) · Zero Automatic Checkout
            </div>
          </div>
        </footer>
      </div>

      {/* Shared Operator Profile Modal */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Operator Session & System Status"
        description="Active operator profile and ENKAI LODGEFLOW security governance."
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#F5F8FD] border border-[#E1EAF5]">
            <div className="w-11 h-11 rounded-full bg-[#082B59] text-white flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#152B4A]">{currentUserName}</div>
              <div className="text-xs text-[#718096]">{currentUserRole}</div>
              <div className="mt-1">
                <StatusBadge label={selectedBranch} tone="info" />
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-[#E1EAF5]">
              <span className="text-[#718096]">Gemini Multimodal Engine</span>
              <StatusBadge
                label={systemOnline ? `${modelName} Online` : 'Standby'}
                tone={systemOnline ? 'success' : 'warning'}
                dot
              />
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#E1EAF5]">
              <span className="text-[#718096]">Application Timezone</span>
              <span className="font-mono font-semibold text-[#152B4A]">
                Africa/Dar_es_Salaam (EAT)
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[#718096]">Checkout Handover Policy</span>
              <span className="font-semibold text-[#082B59] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#12B981]" />
                Staff Authorization Required
              </span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
