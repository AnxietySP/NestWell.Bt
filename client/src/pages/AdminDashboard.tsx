import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  ShieldCheck,
  BarChart3,
  FileCheck2,
  Users,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Search,
  LogOut,
  Camera,
  Trash2,
  AlertTriangle,
  Sparkles,
  FileText,
  ExternalLink,
  MapPin,
  RefreshCw,
  X,
  Eye,
  Baby,
  Mail,
  Phone,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatBtn, formatDisplayDate } from '../lib/date';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

type SidebarSection = 'OVERVIEW' | 'PARENTS' | 'VERIFICATIONS' | 'ANALYTICS' | 'CONTRACTS';
type VerificationFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

interface AdminCaretakerRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dzongkhag: string;
  address?: string;
  qualifications: string;
  yearsExperience: number;
  monthlyRateBtn: number;
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  idDocumentPath?: string | null;
  certificateDocumentPath?: string | null;
  rejectionReason?: string | null;
  avatarUrl?: string | null;
}

interface AdminParentRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dzongkhag?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean | number;
  createdAt?: string | null;
  childrenCount: number;
  totalBookingsCount: number;
  activeContractsCount: number;
}

interface AdminStats {
  totalParents: number;
  totalCaretakers: number;
  verifiedCaretakers: number;
  pendingCaretakers: number;
  activeContracts: number;
}

function getInitials(name?: string) {
  if (!name) return 'AD';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function resolveDocumentUrl(rawPath?: string | null): string | null {
  if (!rawPath) return null;
  if (/^https?:\/\//i.test(rawPath)) return rawPath;
  const cleaned = rawPath.replace(/^\/+/, '');
  const baseUrl = api.defaults.baseURL || '';
  const apiBase = /^https?:\/\//i.test(baseUrl)
    ? baseUrl.replace(/\/api\/?$/, '')
    : window.location.origin;
  return `${apiBase}/${cleaned}`;
}

function VerificationPill({ status }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' | string }) {
  if (status === 'APPROVED' || ['CONFIRMED', 'ACTIVE', 'ACCEPTED'].includes(status)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#BFD3F5] bg-[#E6EFFC] px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#1A56B8]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#1A56B8]" />
        {status}
      </span>
    );
  }
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-rose-700">
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {status}
    </span>
  );
}

export function AdminDashboard() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stats, setStats] = useState<AdminStats>({
    totalParents: 0,
    totalCaretakers: 0,
    verifiedCaretakers: 0,
    pendingCaretakers: 0,
    activeContracts: 0,
  });
  const [caretakers, setCaretakers] = useState<AdminCaretakerRow[]>([]);
  const [parents, setParents] = useState<AdminParentRow[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<SidebarSection>('OVERVIEW');
  const [statusFilter, setStatusFilter] = useState<VerificationFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Action States
  const [cidModalCaretaker, setCidModalCaretaker] = useState<AdminCaretakerRow | null>(null);
  const [rejectModalCaretaker, setRejectModalCaretaker] = useState<AdminCaretakerRow | null>(null);
  const [deleteModalCaretaker, setDeleteModalCaretaker] = useState<AdminCaretakerRow | null>(null);
  const [viewModalParent, setViewModalParent] = useState<AdminParentRow | null>(null);
  const [deleteModalParent, setDeleteModalParent] = useState<AdminParentRow | null>(null);
  const [deleteModalBooking, setDeleteModalBooking] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const loadAdminData = async () => {
    setLoadingData(true);
    setLoadError(null);
    try {
      const [statsRes, caretakersRes, parentsRes, usersRes, bookingsRes] = await Promise.all([
        api.get('/admin/stats').catch(() => api.get('/admin/overview').catch(() => ({ data: {} }))),
        api.get('/admin/caretakers').catch(() => ({ data: null })),
        api.get('/admin/parents').catch(() => ({ data: null })),
        api.get('/admin/users').catch(() => ({ data: null })),
        api.get('/admin/bookings').catch(() =>
          api.get('/bookings').catch(() => ({ data: { bookings: [] } }))
        ),
      ]);

      let rawCaretakers: any[] = [];
      if (Array.isArray(caretakersRes.data?.caretakers)) {
        rawCaretakers = caretakersRes.data.caretakers;
      } else if (Array.isArray(caretakersRes.data)) {
        rawCaretakers = caretakersRes.data;
      } else if (Array.isArray(usersRes.data?.caretakers)) {
        rawCaretakers = usersRes.data.caretakers;
      } else if (Array.isArray(usersRes.data?.users)) {
        rawCaretakers = usersRes.data.users.filter((u: any) => u.role === 'CARETAKER');
      } else if (Array.isArray(usersRes.data)) {
        rawCaretakers = usersRes.data.filter((u: any) => u.role === 'CARETAKER');
      }

      const normalized: AdminCaretakerRow[] = rawCaretakers.map((c: any) => ({
        id: c.id || c.userId || c.user_id,
        fullName: c.fullName || c.full_name || 'Applicant',
        email: c.email || '',
        phone: c.phone || '',
        dzongkhag: c.dzongkhag || 'Thimphu',
        address: c.address || '',
        qualifications: c.qualifications || 'Not specified',
        yearsExperience: Number(c.yearsExperience ?? c.years_experience ?? 0),
        monthlyRateBtn: Number(c.monthlyRateBtn ?? c.monthly_rate_btn ?? 0),
        verificationStatus:
          c.verificationStatus || c.verification_status || 'PENDING',
        idDocumentPath:
          c.idDocumentPath || c.id_document_path || c.idDocumentUrl || null,
        certificateDocumentPath:
          c.certificateDocumentPath ||
          c.certificate_document_path ||
          c.certificateDocumentUrl ||
          null,
        rejectionReason: c.rejectionReason || c.rejection_reason || null,
        avatarUrl: c.avatarUrl || c.avatar_url || null,
      }));

      setCaretakers(normalized);

      const allUsersList: any[] =
        usersRes.data?.users || (Array.isArray(usersRes.data) ? usersRes.data : []);
      let rawParents: any[] = [];
      if (Array.isArray(parentsRes.data?.parents)) {
        rawParents = parentsRes.data.parents;
      } else if (Array.isArray(parentsRes.data)) {
        rawParents = parentsRes.data;
      } else {
        rawParents = allUsersList.filter((u: any) => u.role === 'PARENT');
      }

      const normalizedParents: AdminParentRow[] = rawParents.map((p: any) => ({
        id: p.id || p.userId || p.user_id,
        fullName: p.fullName || p.full_name || 'Parent',
        email: p.email || '',
        phone: p.phone || '',
        dzongkhag: p.dzongkhag || null,
        address: p.address || null,
        avatarUrl: p.avatarUrl || p.avatar_url || null,
        isActive: p.isActive ?? p.is_active ?? true,
        createdAt: p.createdAt || p.created_at || null,
        childrenCount: Number(p.childrenCount ?? p.children_count ?? 0),
        totalBookingsCount: Number(p.totalBookingsCount ?? p.total_bookings_count ?? 0),
        activeContractsCount: Number(p.activeContractsCount ?? p.active_contracts_count ?? 0),
      }));

      setParents(normalizedParents);

      const rawBookings = bookingsRes.data?.bookings || bookingsRes.data || [];
      setBookings(Array.isArray(rawBookings) ? rawBookings : []);

      const s = statsRes.data?.stats || statsRes.data || {};
      const verifiedCount = normalized.filter(
        (c) => c.verificationStatus === 'APPROVED'
      ).length;
      const pendingCount = normalized.filter(
        (c) => c.verificationStatus === 'PENDING'
      ).length;

      setStats({
        totalParents: Number(s.totalParents ?? s.parentsCount ?? normalizedParents.length),
        totalCaretakers: Number(s.totalCaretakers ?? normalized.length),
        verifiedCaretakers: Number(s.verifiedCaretakers ?? verifiedCount),
        pendingCaretakers: Number(
          s.pendingVerifications ?? s.pendingCaretakers ?? pendingCount
        ),
        activeContracts: Number(
          s.activeContracts ??
            (Array.isArray(rawBookings)
              ? rawBookings.filter((b: any) =>
                  ['CONFIRMED', 'ACTIVE', 'ACCEPTED'].includes(b.status)
                ).length
              : 0)
        ),
      });
    } catch (err: any) {
      setLoadError(
        err?.response?.data?.message || 'Unable to load administrator records.'
      );
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // =========================================================================
  // ADMIN PROFILE PICTURE UPDATE & DELETE HANDLERS
  // =========================================================================
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      window.alert('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }

    setAvatarBusy(true);
    setBannerMessage(null);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await api.patch('/auth/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      setBannerMessage('Admin profile picture updated.');
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Unable to update profile picture.');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    if (!user?.avatarUrl) return;
    setAvatarBusy(true);
    setBannerMessage(null);
    try {
      await api
        .delete('/auth/me/avatar')
        .catch(() => api.patch('/auth/me/avatar', { removeAvatar: true, avatarUrl: null }));
      await refreshUser();
      setBannerMessage('Admin profile picture removed.');
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Unable to remove profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  // =========================================================================
  // APPROVE / REJECT / DELETE CARETAKER VERIFICATION
  // =========================================================================
  const handleVerifyDecision = async (
    caretakerId: string,
    status: 'APPROVED' | 'REJECTED',
    reason?: string
  ) => {
    setActionBusyId(caretakerId);
    setBannerMessage(null);
    try {
      await api.patch(`/admin/caretakers/${caretakerId}/verify`, {
        status,
        rejectionReason: reason?.trim() || undefined,
      });
      setBannerMessage(
        status === 'APPROVED'
          ? 'Caretaker CID and certificate approved. Profile is now live.'
          : 'Caretaker application rejected.'
      );
      setCidModalCaretaker(null);
      setRejectModalCaretaker(null);
      setRejectionReason('');
      await loadAdminData();
    } catch (err: any) {
      window.alert(
        err?.response?.data?.message || 'Unable to update caretaker verification.'
      );
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteCaretaker = async (caretaker: AdminCaretakerRow) => {
    setActionBusyId(caretaker.id);
    setBannerMessage(null);
    try {
      await api.delete(`/admin/caretakers/${caretaker.id}`);
      setBannerMessage(`Removed ${caretaker.fullName} and associated records.`);
      setDeleteModalCaretaker(null);
      setCidModalCaretaker(null);
      await loadAdminData();
    } catch (err: any) {
      window.alert(
        err?.response?.data?.message || 'Unable to delete caretaker account.'
      );
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteParent = async (parent: AdminParentRow) => {
    setActionBusyId(parent.id);
    setBannerMessage(null);
    try {
      await api.delete(`/admin/parents/${parent.id}`);
      setBannerMessage(`Removed parent account (${parent.fullName}) and associated records.`);
      setDeleteModalParent(null);
      setViewModalParent(null);
      await loadAdminData();
    } catch (err: any) {
      window.alert(
        err?.response?.data?.message || 'Unable to delete parent account.'
      );
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteBooking = async (booking: any) => {
    setActionBusyId(booking.id);
    setBannerMessage(null);
    try {
      await api.delete(`/admin/bookings/${booking.id}`);
      setBannerMessage('Contract record deleted.');
      setDeleteModalBooking(null);
      await loadAdminData();
    } catch (err: any) {
      window.alert(
        err?.response?.data?.message || 'Unable to delete contract record.'
      );
    } finally {
      setActionBusyId(null);
    }
  };

  const handleConfirmLogout = () => {
    setLogoutModalOpen(false);
    logout();
    navigate('/login');
  };

  // Derived Metrics & Analytics Data
  const approvedCount = useMemo(
    () => caretakers.filter((c) => c.verificationStatus === 'APPROVED').length,
    [caretakers]
  );
  const pendingCount = useMemo(
    () => caretakers.filter((c) => c.verificationStatus === 'PENDING').length,
    [caretakers]
  );
  const rejectedCount = useMemo(
    () => caretakers.filter((c) => c.verificationStatus === 'REJECTED').length,
    [caretakers]
  );

  const dzongkhagChartData = useMemo(() => {
    const counts = new Map<string, number>();
    caretakers.forEach((c) => {
      const dz = c.dzongkhag || 'Other';
      counts.set(dz, (counts.get(dz) || 0) + 1);
    });
    const entries = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const max = Math.max(1, ...entries.map((e) => e.count));
    return entries.map((e) => ({
      ...e,
      pct: Math.max(16, Math.round((e.count / max) * 100)),
    }));
  }, [caretakers]);

  const filteredCaretakers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return caretakers.filter((c) => {
      if (statusFilter !== 'ALL' && c.verificationStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.dzongkhag.toLowerCase().includes(q) ||
        c.qualifications.toLowerCase().includes(q)
      );
    });
  }, [caretakers, statusFilter, searchQuery]);

  const filteredParents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q) ||
        (p.dzongkhag || '').toLowerCase().includes(q)
    );
  }, [parents, searchQuery]);

  const navItems: {
    id: SidebarSection;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    { id: 'OVERVIEW', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    {
      id: 'PARENTS',
      label: 'Registered Parents',
      icon: <Users className="h-4 w-4" />,
      badge: parents.length || stats.totalParents || undefined,
    },
    {
      id: 'VERIFICATIONS',
      label: 'Caretakers',
      icon: <ShieldCheck className="h-4 w-4" />,
      badge: caretakers.length || undefined,
    },
    {
      id: 'ANALYTICS',
      label: 'Platform Graph',
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      id: 'CONTRACTS',
      label: '6-Mo Contracts',
      icon: <FileCheck2 className="h-4 w-4" />,
      badge: bookings.length || undefined,
    },
  ];

  const cidDocumentUrl = resolveDocumentUrl(cidModalCaretaker?.idDocumentPath);
  const isCidPdf = Boolean(
    cidDocumentUrl && cidDocumentUrl.toLowerCase().endsWith('.pdf')
  );

  const certDocumentUrl = resolveDocumentUrl(
    cidModalCaretaker?.certificateDocumentPath
  );
  const isCertPdf = Boolean(
    certDocumentUrl && certDocumentUrl.toLowerCase().endsWith('.pdf')
  );

  return (
    <div className="min-h-screen bg-[#F8FAFE]">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        {/* ================================================================= */}
        {/* LEFT SIDEBAR RAIL (Royal Blue Theme matching Reference Design)    */}
        {/* ================================================================= */}
        <aside className="flex w-full shrink-0 flex-col justify-between bg-[#1A56B8] px-4 py-5 text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:overflow-y-auto lg:px-5 lg:py-7">
          <div className="space-y-6">
            {/* Admin Profile & Avatar Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between lg:block">
                <div className="flex items-center gap-3">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.fullName}
                      className="h-11 w-11 shrink-0 rounded-full border-2 border-white/30 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[#1A56B8] shadow-sm">
                      {getInitials(user?.fullName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold text-white">
                      {user?.fullName || 'Administrator'}
                    </p>
                    <p className="truncate text-xs text-blue-100/80">
                      NestWell.BT • Admin
                    </p>
                  </div>
                </div>

                {/* Mobile Logout Button */}
                <button
                  type="button"
                  onClick={() => setLogoutModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 lg:hidden"
                >
                  <LogOut className="h-3.5 w-3.5" /> Log out
                </button>
              </div>

              {/* Update / Delete Profile Picture Controls */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <button
                  type="button"
                  disabled={avatarBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-semibold text-[#1A56B8] shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {avatarBusy ? 'Saving...' : user?.avatarUrl ? 'Update Photo' : 'Upload Photo'}
                </button>

                {user?.avatarUrl && (
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={handleAvatarRemove}
                    title="Delete profile picture"
                    className="inline-flex items-center justify-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sidebar Navigation */}
            <nav
              aria-label="Admin dashboard sections"
              className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
            >
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'VERIFICATIONS') setStatusFilter('ALL');
                      setActiveSection(item.id);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex shrink-0 items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-white/20 font-semibold text-white shadow-sm'
                        : 'text-blue-100/85 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {item.icon}
                      {item.label}
                    </span>
                    {item.badge !== undefined && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isActive
                            ? 'bg-white text-[#1A56B8]'
                            : 'bg-white/15 text-white'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Royal-Blue Audit Card & Logout Trigger */}
          <div className="hidden space-y-3 pt-4 lg:block">
            <div className="space-y-2.5 rounded-2xl border border-white/15 bg-[#134291]/70 p-4 text-white">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-white">
                  <ShieldCheck className="h-4 w-4 text-blue-200" /> Credential Audit
                </span>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {pendingCount} Pending
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-blue-100/80">
                Inspect Citizenship ID and Institution Certificates before approving caretaker profiles.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveSection('VERIFICATIONS');
                  setStatusFilter('PENDING');
                }}
                className="block w-full rounded-full bg-white py-2 text-center text-xs font-semibold text-[#1A56B8] shadow-sm transition-colors hover:bg-blue-50"
              >
                Review Pending Docs
              </button>
            </div>

            <div className="border-t border-white/15 pt-3">
              <button
                type="button"
                onClick={() => setLogoutModalOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-blue-100/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" /> Log out
              </button>
            </div>
          </div>
        </aside>

        {/* ================================================================= */}
        {/* MAIN WORKSPACE CANVAS                                             */}
        {/* ================================================================= */}
        <main className="min-w-0 flex-1 bg-white px-4 py-6 sm:px-6 lg:rounded-l-[28px] lg:px-10 lg:py-8 lg:shadow-[-4px_0_24px_rgba(26,86,184,0.06)]">
          <div className="mx-auto max-w-[1400px] space-y-6">
            {/* Top Bar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-display text-slate-900 sm:text-3xl">
                  Platform Administration
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Audit caretaker Citizenship IDs & certificates, manage registered parents, and oversee 6-month contracts.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      activeSection === 'PARENTS'
                        ? 'Search parent name, email, phone...'
                        : 'Search applicant, Dzongkhag...'
                    }
                    className="w-52 rounded-full border border-[#E2E8F4] bg-[#F3F7FD] py-2 pl-9 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#1A56B8] focus:bg-white focus:outline-none focus:shadow-focus sm:w-64"
                  />
                </div>

                <button
                  type="button"
                  onClick={loadAdminData}
                  disabled={loadingData}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#C7D9F7] bg-[#F3F7FD] px-4 py-2 text-xs font-semibold text-[#1A56B8] transition-colors hover:bg-[#E6EFFC]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

                <span className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F4] bg-[#F3F7FD] px-3.5 py-2 text-xs font-medium text-slate-600">
                  <Calendar className="h-3.5 w-3.5 text-[#1A56B8]" />
                  {new Date().toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>

            {loadError && (
              <div className="rounded-card border border-danger/30 bg-danger/10 px-5 py-3 text-xs font-medium text-danger">
                {loadError}
              </div>
            )}

            <AnimatePresence>
              {bannerMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-center justify-between gap-3 rounded-card border border-[#BFD3F5] bg-[#EBF2FC] px-5 py-3 text-xs font-medium text-[#134291]"
                >
                  <span>{bannerMessage}</span>
                  <button
                    type="button"
                    onClick={() => setBannerMessage(null)}
                    aria-label="Dismiss message"
                    className="rounded p-1 text-[#1A56B8] hover:bg-white/60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* =============================================================== */}
            {/* 4-CARD KPI STRIP (All 4 Cards Interactive)                      */}
            {/* =============================================================== */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => {
                  setActiveSection('VERIFICATIONS');
                  setStatusFilter('APPROVED');
                }}
                className={`flex flex-col justify-between space-y-3 rounded-card bg-gradient-to-br from-[#1A56B8] to-[#154698] p-5 text-left text-white shadow-card transition-all hover:brightness-105 ${
                  activeSection === 'VERIFICATIONS' && statusFilter === 'APPROVED'
                    ? 'ring-2 ring-[#1A56B8] ring-offset-2'
                    : ''
                }`}
              >
                <p className="text-xs font-medium text-blue-100">Verified Caretakers</p>
                <p className="font-display text-3xl font-semibold tracking-tight">
                  {approvedCount}
                  <span className="text-base font-normal text-blue-200">
                    /{caretakers.length}
                  </span>
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-blue-100">
                  <ShieldCheck className="h-3.5 w-3.5" /> View & manage verified nannies →
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('PARENTS')}
                className={`flex flex-col justify-between space-y-3 rounded-card border p-5 text-left transition-all ${
                  activeSection === 'PARENTS'
                    ? 'border-[#1A56B8] bg-[#E6EFFC] ring-2 ring-[#1A56B8]/20'
                    : 'border-[#E2E8F4] bg-[#F3F7FD] hover:border-[#1A56B8]/50 hover:bg-[#EBF2FC]'
                }`}
              >
                <p className="text-xs font-medium text-slate-500">Registered Parents</p>
                <p className="font-display text-3xl font-semibold text-slate-900">
                  {parents.length || stats.totalParents}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#1A56B8]">
                  <Users className="h-3.5 w-3.5" /> View & manage households →
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSection('VERIFICATIONS');
                  setStatusFilter('PENDING');
                }}
                className={`flex flex-col justify-between space-y-3 rounded-card border p-5 text-left transition-all ${
                  activeSection === 'VERIFICATIONS' && statusFilter === 'PENDING'
                    ? 'border-amber-400 bg-amber-50/70 ring-2 ring-amber-400/25'
                    : 'border-[#E2E8F4] bg-[#F3F7FD] hover:border-amber-300 hover:bg-amber-50/40'
                }`}
              >
                <p className="text-xs font-medium text-slate-500">Pending Verifications</p>
                <p className="font-display text-3xl font-semibold text-slate-900">
                  {pendingCount}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600">
                  <Clock className="h-3.5 w-3.5" /> Needs document review
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('CONTRACTS')}
                className={`flex flex-col justify-between space-y-3 rounded-card border p-5 text-left transition-all ${
                  activeSection === 'CONTRACTS'
                    ? 'border-[#1A56B8] bg-[#E6EFFC] ring-2 ring-[#1A56B8]/20'
                    : 'border-[#E2E8F4] bg-[#F3F7FD] hover:border-[#1A56B8]/50 hover:bg-[#EBF2FC]'
                }`}
              >
                <p className="text-xs font-medium text-slate-500">Active 6+ Mo Contracts</p>
                <p className="font-display text-3xl font-semibold text-slate-900">
                  {stats.activeContracts}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#1A56B8]">
                  <Sparkles className="h-3.5 w-3.5" /> Structured placements
                </p>
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="space-y-6"
              >
                {/* =============================================================== */}
                {/* REGISTERED PARENTS DIRECTORY TABLE                              */}
                {/* =============================================================== */}
                {activeSection === 'PARENTS' && (
                  <div className="overflow-hidden rounded-card border border-[#E2E8F4] bg-white shadow-soft">
                    <div className="flex flex-col gap-3 border-b border-[#E8EFFB] p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="font-display text-xl font-semibold text-slate-900">
                          Registered Parent Accounts ({filteredParents.length})
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Inspect family household profiles, child counts, contract activity, or remove inactive accounts.
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setActiveSection('OVERVIEW')}
                      >
                        Back to Dashboard
                      </Button>
                    </div>

                    <div className="w-full overflow-x-auto">
                      <table className="w-full min-w-[960px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[#E8EFFB] bg-[#F3F7FD] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="py-3.5 pl-6 pr-4">Parent / Household</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Contact</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Dzongkhag</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Children</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Contracts</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Joined</th>
                            <th className="whitespace-nowrap py-3.5 pl-4 pr-6 text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-[#E8EFFB] text-sm">
                          {loadingData ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="py-10 text-center text-xs text-slate-500"
                              >
                                Loading registered parents...
                              </td>
                            </tr>
                          ) : filteredParents.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="py-10 text-center text-xs text-slate-500"
                              >
                                No registered parents match your search.
                              </td>
                            </tr>
                          ) : (
                            filteredParents.map((p) => {
                              const isBusy = actionBusyId === p.id;
                              return (
                                <tr
                                  key={p.id}
                                  className="align-middle transition-colors hover:bg-[#F3F7FD]/60"
                                >
                                  {/* Parent */}
                                  <td className="py-4 pl-6 pr-4">
                                    <div className="flex min-w-[200px] items-center gap-3">
                                      {p.avatarUrl ? (
                                        <img
                                          src={p.avatarUrl}
                                          alt={p.fullName}
                                          className="h-9 w-9 shrink-0 rounded-xl border border-[#E2E8F4] object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E6EFFC] text-xs font-semibold text-[#1A56B8]">
                                          {getInitials(p.fullName)}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="truncate font-semibold text-slate-900">
                                          {p.fullName}
                                        </p>
                                        <p className="truncate text-xs text-slate-500">
                                          ID: {p.id.slice(0, 8)}…
                                        </p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Contact */}
                                  <td className="px-4 py-4">
                                    <p className="text-xs font-medium text-slate-800">{p.email}</p>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {p.phone || 'No phone'}
                                    </p>
                                  </td>

                                  {/* Dzongkhag */}
                                  <td className="whitespace-nowrap px-4 py-4 text-xs font-medium text-slate-800">
                                    {p.dzongkhag || 'Not set'}
                                  </td>

                                  {/* Children */}
                                  <td className="whitespace-nowrap px-4 py-4">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F7FD] px-2.5 py-1 text-xs font-semibold text-slate-700">
                                      <Baby className="h-3.5 w-3.5 text-[#1A56B8]" />
                                      {p.childrenCount}
                                    </span>
                                  </td>

                                  {/* Contracts */}
                                  <td className="whitespace-nowrap px-4 py-4">
                                    <span className="inline-flex items-center rounded-full border border-[#BFD3F5] bg-[#E6EFFC] px-2.5 py-0.5 text-xs font-semibold text-[#1A56B8]">
                                      {p.activeContractsCount} active / {p.totalBookingsCount} total
                                    </span>
                                  </td>

                                  {/* Joined */}
                                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                                    {p.createdAt ? formatDisplayDate(p.createdAt) : '—'}
                                  </td>

                                  {/* Actions */}
                                  <td className="whitespace-nowrap py-4 pl-4 pr-6 text-right">
                                    <div className="inline-flex items-center justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-full border-[#C7D9F7] bg-[#F3F7FD] text-[#1A56B8] hover:bg-[#E6EFFC]"
                                        onClick={() => setViewModalParent(p)}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        View
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-full"
                                        disabled={isBusy}
                                        onClick={() => setDeleteModalParent(p)}
                                        title={`Delete ${p.fullName}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                                        Delete
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* =============================================================== */}
                {/* ANALYTICS GRAPH SECTION (Visible on OVERVIEW & ANALYTICS)       */}
                {/* =============================================================== */}
                {(activeSection === 'OVERVIEW' || activeSection === 'ANALYTICS') && (
                  <div className="grid gap-6 lg:grid-cols-12">
                    {/* Left 7 Cols: Caretakers by Dzongkhag Pill-Bar Chart */}
                    <div className="flex flex-col justify-between space-y-6 rounded-card border border-[#E2E8F4] bg-white p-6 shadow-soft lg:col-span-7">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="font-display text-lg font-semibold text-slate-900">
                            Caretaker Supply by Dzongkhag
                          </h2>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Regional distribution of registered childcare providers across Bhutan
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#BFD3F5] bg-[#E6EFFC] px-3 py-1 text-xs font-semibold text-[#1A56B8]">
                          <MapPin className="h-3.5 w-3.5" /> {dzongkhagChartData.length} Regions
                        </span>
                      </div>

                      {dzongkhagChartData.length === 0 ? (
                        <p className="py-8 text-center text-xs text-slate-500">
                          No caretaker regional data available yet.
                        </p>
                      ) : (
                        <div className="grid h-44 grid-cols-6 items-end gap-3 pt-4">
                          {dzongkhagChartData.map((bar, idx) => {
                            const isTop = idx === 0;
                            return (
                              <div
                                key={bar.name}
                                className="flex h-full flex-col items-center justify-end gap-2"
                              >
                                <span className="text-[11px] font-semibold text-slate-800">
                                  {bar.count}
                                </span>
                                <div className="flex w-full flex-1 items-end justify-center">
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: `${bar.pct}%` }}
                                    transition={{ duration: 0.6, ease: 'easeOut', delay: idx * 0.05 }}
                                    className={`w-full max-w-[38px] rounded-full ${
                                      isTop ? 'bg-[#1A56B8]' : 'bg-[#7FA6E8]'
                                    }`}
                                  />
                                </div>
                                <span
                                  title={bar.name}
                                  className="w-full truncate text-center text-[11px] font-medium text-slate-500"
                                >
                                  {bar.name.split(' ')[0]}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Right 5 Cols: Verification & Platform Health Breakdown */}
                    <div className="flex flex-col justify-between space-y-5 rounded-card border border-[#E2E8F4] bg-white p-6 shadow-soft lg:col-span-5">
                      <div>
                        <h2 className="font-display text-lg font-semibold text-slate-900">
                          Credential Screening Breakdown
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Applicant verification status across {caretakers.length} total caretakers
                        </p>
                      </div>

                      <div className="space-y-4">
                        {[
                          {
                            label: 'Approved & Live',
                            count: approvedCount,
                            total: Math.max(1, caretakers.length),
                            barColor: 'bg-[#1A56B8]',
                          },
                          {
                            label: 'Pending Document Review',
                            count: pendingCount,
                            total: Math.max(1, caretakers.length),
                            barColor: 'bg-amber-500',
                          },
                          {
                            label: 'Rejected Applications',
                            count: rejectedCount,
                            total: Math.max(1, caretakers.length),
                            barColor: 'bg-rose-500',
                          },
                        ].map((item) => {
                          const pct = Math.round((item.count / item.total) * 100);
                          return (
                            <div key={item.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-800">{item.label}</span>
                                <span className="font-semibold text-slate-500">
                                  {item.count} ({pct}%)
                                </span>
                              </div>
                              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E8EFFB]">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.65, ease: 'easeOut' }}
                                  className={`h-full rounded-full ${item.barColor}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-[#DCE6F7] bg-[#F3F7FD] p-3.5 text-xs">
                        <span className="text-slate-500">Parent-to-Caretaker Ratio</span>
                        <span className="font-semibold text-[#1A56B8]">
                          {parents.length || stats.totalParents} Families : {approvedCount} Verified Nannies
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* =============================================================== */}
                {/* CARETAKER VERIFICATION & DIRECTORY QUEUE TABLE                  */}
                {/* =============================================================== */}
                {(activeSection === 'OVERVIEW' || activeSection === 'VERIFICATIONS') && (
                  <div className="overflow-hidden rounded-card border border-[#E2E8F4] bg-white shadow-soft">
                    <div className="flex flex-col gap-3 border-b border-[#E8EFFB] p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="font-display text-xl font-semibold text-slate-900">
                          {statusFilter === 'APPROVED'
                            ? `Verified Caretaker Accounts (${filteredCaretakers.length})`
                            : 'Caretaker Verification & Directory'}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Inspect Citizenship ID and Institution Certificate documents, approve listings, or remove caretaker accounts.
                        </p>
                      </div>

                      {/* Status Filter Pills */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: 'ALL', label: `All (${caretakers.length})` },
                            { id: 'PENDING', label: `Pending (${pendingCount})` },
                            { id: 'APPROVED', label: `Verified (${approvedCount})` },
                            { id: 'REJECTED', label: `Rejected (${rejectedCount})` },
                          ] as { id: VerificationFilter; label: string }[]
                        ).map((pill) => {
                          const active = statusFilter === pill.id;
                          return (
                            <button
                              key={pill.id}
                              type="button"
                              onClick={() => setStatusFilter(pill.id)}
                              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                                active
                                  ? 'bg-[#1A56B8] text-white shadow-soft'
                                  : 'border border-[#E2E8F4] bg-[#F3F7FD] text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {pill.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="w-full overflow-x-auto">
                      <table className="w-full min-w-[1040px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[#E8EFFB] bg-[#F3F7FD] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="py-3.5 pl-6 pr-4">Caretaker</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Dzongkhag</th>
                            <th className="px-4 py-3.5">Qualifications & Rate</th>
                            <th className="whitespace-nowrap px-4 py-3.5">CID & Certificate</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Status</th>
                            <th className="whitespace-nowrap py-3.5 pl-4 pr-6 text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-[#E8EFFB] text-sm">
                          {loadingData ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="py-10 text-center text-xs text-slate-500"
                              >
                                Loading caretaker accounts...
                              </td>
                            </tr>
                          ) : filteredCaretakers.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="py-10 text-center text-xs text-slate-500"
                              >
                                No caretakers match the selected filter.
                              </td>
                            </tr>
                          ) : (
                            filteredCaretakers.map((c) => {
                              const isBusy = actionBusyId === c.id;
                              return (
                                <tr
                                  key={c.id}
                                  className="align-middle transition-colors hover:bg-[#F3F7FD]/60"
                                >
                                  {/* Applicant */}
                                  <td className="py-4 pl-6 pr-4">
                                    <div className="flex min-w-[210px] items-center gap-3">
                                      {c.avatarUrl ? (
                                        <img
                                          src={c.avatarUrl}
                                          alt={c.fullName}
                                          className="h-9 w-9 shrink-0 rounded-xl border border-[#E2E8F4] object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E6EFFC] text-xs font-semibold text-[#1A56B8]">
                                          {getInitials(c.fullName)}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="truncate font-semibold text-slate-900">
                                          {c.fullName}
                                        </p>
                                        <p className="truncate text-xs text-slate-500">
                                          {c.email} • {c.phone}
                                        </p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Dzongkhag */}
                                  <td className="whitespace-nowrap px-4 py-4 text-xs font-medium text-slate-800">
                                    {c.dzongkhag}
                                  </td>

                                  {/* Qualifications & Rate */}
                                  <td className="max-w-[260px] px-4 py-4">
                                    <p
                                      title={c.qualifications}
                                      className="truncate text-xs font-medium text-slate-800"
                                    >
                                      {c.qualifications}
                                    </p>
                                    <p className="mt-0.5 whitespace-nowrap text-xs text-slate-500">
                                      {c.yearsExperience} yrs •{' '}
                                      <span className="font-semibold text-[#1A56B8]">
                                        {formatBtn(c.monthlyRateBtn)}/mo
                                      </span>
                                    </p>
                                  </td>

                                  {/* View CID & Certificate Button */}
                                  <td className="whitespace-nowrap px-4 py-4">
                                    <button
                                      type="button"
                                      onClick={() => setCidModalCaretaker(c)}
                                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#C7D9F7] bg-[#F3F7FD] px-3 py-1.5 text-xs font-medium text-[#1A56B8] transition-colors hover:bg-[#E6EFFC]"
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                      View Account & Docs
                                    </button>
                                  </td>

                                  {/* Status */}
                                  <td className="whitespace-nowrap px-4 py-4">
                                    <VerificationPill status={c.verificationStatus} />
                                  </td>

                                  {/* Actions */}
                                  <td className="whitespace-nowrap py-4 pl-4 pr-6 text-right">
                                    <div className="inline-flex items-center justify-end gap-2">
                                      {c.verificationStatus !== 'APPROVED' && (
                                        <Button
                                          size="sm"
                                          className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698] disabled:opacity-40"
                                          disabled={isBusy}
                                          onClick={() =>
                                            handleVerifyDecision(c.id, 'APPROVED')
                                          }
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Approve
                                        </Button>
                                      )}

                                      {c.verificationStatus !== 'REJECTED' && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="rounded-full"
                                          disabled={isBusy}
                                          onClick={() => {
                                            setRejectModalCaretaker(c);
                                            setRejectionReason(c.rejectionReason || '');
                                          }}
                                        >
                                          <XCircle className="h-3.5 w-3.5 text-danger" />
                                          {c.verificationStatus === 'APPROVED' ? 'Revoke' : 'Reject'}
                                        </Button>
                                      )}

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-full"
                                        disabled={isBusy}
                                        onClick={() => setDeleteModalCaretaker(c)}
                                        title={`Delete ${c.fullName}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                                        Delete
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* =============================================================== */}
                {/* 6-MONTH CONTRACTS OVERVIEW TABLE (When Contracts Tab Selected)  */}
                {/* =============================================================== */}
                {activeSection === 'CONTRACTS' && (
                  <div className="overflow-hidden rounded-card border border-[#E2E8F4] bg-white shadow-soft">
                    <div className="border-b border-[#E8EFFB] p-5">
                      <h2 className="font-display text-xl font-semibold text-slate-900">
                        Platform 6-Month Childcare Contracts
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Audit all active, pending, and completed childcare agreements.
                      </p>
                    </div>

                    <div className="w-full overflow-x-auto">
                      <table className="w-full min-w-[880px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[#E8EFFB] bg-[#F3F7FD] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="py-3.5 pl-6 pr-4">Family / Parent</th>
                            <th className="px-4 py-3.5">Caretaker</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Duration</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Monthly Rate</th>
                            <th className="whitespace-nowrap px-4 py-3.5">Status</th>
                            <th className="whitespace-nowrap py-3.5 pl-4 pr-6 text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8EFFB] text-xs">
                          {bookings.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="py-10 text-center text-slate-500"
                              >
                                No contracts recorded yet.
                              </td>
                            </tr>
                          ) : (
                            bookings.map((b: any) => (
                              <tr key={b.id} className="transition-colors hover:bg-[#F3F7FD]/60">
                                <td className="py-4 pl-6 pr-4 font-semibold text-slate-900">
                                  {b.parentName || b.parent_name || 'Parent'}
                                </td>
                                <td className="px-4 py-4 text-slate-800">
                                  {b.caretakerName || b.caretaker_name || 'Caretaker'}
                                </td>
                                <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                                  {b.durationMonths || b.duration_months || 6} Months (
                                  {b.startDate ? formatDisplayDate(b.startDate) : 'TBD'})
                                </td>
                                <td className="whitespace-nowrap px-4 py-4">
                                  <span className="inline-flex items-center rounded-lg bg-[#E6EFFC] px-2.5 py-1 font-bold text-[#1A56B8]">
                                    {formatBtn(
                                      Number(
                                        b.agreedMonthlyRateBtn ?? b.monthlyRateBtn ?? 0
                                      )
                                    )}
                                    /mo
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-4">
                                  <VerificationPill status={b.status} />
                                </td>
                                <td className="whitespace-nowrap py-4 pl-4 pr-6 text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-full"
                                    disabled={actionBusyId === b.id}
                                    onClick={() => setDeleteModalBooking(b)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                                    Delete
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ================================================================= */}
      {/* VIEW PARENT ACCOUNT MODAL                                         */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(viewModalParent)}
        onClose={() => setViewModalParent(null)}
        title={`Parent Account — ${viewModalParent?.fullName || ''}`}
        subtitle={`Registered Family Household • ${viewModalParent?.dzongkhag || 'Bhutan'}`}
      >
        {viewModalParent && (
          <div className="space-y-4">
            <div className="flex items-center gap-3.5 rounded-xl bg-[#F3F7FD] p-4">
              {viewModalParent.avatarUrl ? (
                <img
                  src={viewModalParent.avatarUrl}
                  alt={viewModalParent.fullName}
                  className="h-14 w-14 shrink-0 rounded-2xl border border-[#E2E8F4] object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#E6EFFC] text-base font-bold text-[#1A56B8]">
                  {getInitials(viewModalParent.fullName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-slate-900">
                  {viewModalParent.fullName}
                </p>
                <p className="text-xs text-slate-500">
                  Joined {viewModalParent.createdAt ? formatDisplayDate(viewModalParent.createdAt) : '—'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#E2E8F4] p-3.5 text-xs">
                <p className="flex items-center gap-1.5 text-slate-500">
                  <Mail className="h-3.5 w-3.5 text-[#1A56B8]" /> Email Address
                </p>
                <p className="mt-1 font-semibold text-slate-900">{viewModalParent.email}</p>
              </div>

              <div className="rounded-xl border border-[#E2E8F4] p-3.5 text-xs">
                <p className="flex items-center gap-1.5 text-slate-500">
                  <Phone className="h-3.5 w-3.5 text-[#1A56B8]" /> Phone Number
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {viewModalParent.phone || 'Not provided'}
                </p>
              </div>

              <div className="rounded-xl border border-[#E2E8F4] p-3.5 text-xs">
                <p className="flex items-center gap-1.5 text-slate-500">
                  <MapPin className="h-3.5 w-3.5 text-[#1A56B8]" /> Location
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {viewModalParent.dzongkhag || 'Not specified'}
                  {viewModalParent.address ? ` • ${viewModalParent.address}` : ''}
                </p>
              </div>

              <div className="rounded-xl border border-[#E2E8F4] p-3.5 text-xs">
                <p className="flex items-center gap-1.5 text-slate-500">
                  <Baby className="h-3.5 w-3.5 text-[#1A56B8]" /> Household Activity
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {viewModalParent.childrenCount} Child{viewModalParent.childrenCount === 1 ? '' : 'ren'} •{' '}
                  {viewModalParent.activeContractsCount} Active Contract{viewModalParent.activeContractsCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E8EFFB] pt-3">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => setViewModalParent(null)}
              >
                Close
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-danger text-white hover:bg-danger/90"
                disabled={actionBusyId === viewModalParent.id}
                onClick={() => {
                  const target = viewModalParent;
                  setViewModalParent(null);
                  setDeleteModalParent(target);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Parent Account
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* DELETE PARENT CONFIRMATION MODAL                                  */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(deleteModalParent)}
        onClose={() => setDeleteModalParent(null)}
        title={`Delete ${deleteModalParent?.fullName || 'Parent'}?`}
        subtitle="This action permanently removes the parent account, child profiles, notifications, and non-active booking history."
      >
        {deleteModalParent && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-slate-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p className="leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong>{deleteModalParent.fullName}</strong> (
                {deleteModalParent.email})? This cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setDeleteModalParent(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full bg-danger text-white hover:bg-danger/90"
                isLoading={actionBusyId === deleteModalParent.id}
                onClick={() => handleDeleteParent(deleteModalParent)}
              >
                Yes, Delete Parent
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* VIEW CITIZENSHIP ID & INSTITUTION CERTIFICATE MODAL               */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(cidModalCaretaker)}
        onClose={() => setCidModalCaretaker(null)}
        title={`Caretaker Account & Docs — ${cidModalCaretaker?.fullName || ''}`}
        subtitle={`${cidModalCaretaker?.dzongkhag || ''} • ${
          cidModalCaretaker?.qualifications || ''
        }`}
      >
        {cidModalCaretaker && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F3F7FD] p-3.5 text-xs">
              <div>
                <p className="text-slate-500">Contact Email & Phone</p>
                <p className="mt-0.5 font-semibold text-slate-900">
                  {cidModalCaretaker.email} • {cidModalCaretaker.phone}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Experience & Monthly Rate</p>
                <p className="mt-0.5 font-semibold text-slate-900">
                  {cidModalCaretaker.yearsExperience} yrs •{' '}
                  <span className="text-[#1A56B8]">{formatBtn(cidModalCaretaker.monthlyRateBtn)}/mo</span>
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* 1. Citizenship ID (CID) */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-900">
                  1. Citizenship ID (CID)
                </p>
                {cidDocumentUrl ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-[#E2E8F4] bg-[#F3F7FD]">
                      {isCidPdf ? (
                        <iframe
                          src={cidDocumentUrl}
                          title="Caretaker CID PDF"
                          className="h-[260px] w-full"
                        />
                      ) : (
                        <img
                          src={cidDocumentUrl}
                          alt={`${cidModalCaretaker.fullName} Citizenship ID`}
                          className="h-[260px] w-full bg-slate-950/5 object-contain"
                        />
                      )}
                    </div>
                    <a
                      href={cidDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A56B8] hover:underline"
                    >
                      Open CID in new tab <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                ) : (
                  <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-xs text-slate-800">
                    No Citizenship ID file path attached.
                  </div>
                )}
              </div>

              {/* 2. Institution Certificate */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-900">
                  2. Institution Certificate
                </p>
                {certDocumentUrl ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-[#E2E8F4] bg-[#F3F7FD]">
                      {isCertPdf ? (
                        <iframe
                          src={certDocumentUrl}
                          title="Institution Certificate PDF"
                          className="h-[260px] w-full"
                        />
                      ) : (
                        <img
                          src={certDocumentUrl}
                          alt={`${cidModalCaretaker.fullName} Institution Certificate`}
                          className="h-[260px] w-full bg-slate-950/5 object-contain"
                        />
                      )}
                    </div>
                    <a
                      href={certDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A56B8] hover:underline"
                    >
                      Open Certificate in new tab{' '}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                ) : (
                  <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-xs text-slate-800">
                    No institution certificate attached.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E8EFFB] pt-3">
              <VerificationPill status={cidModalCaretaker.verificationStatus} />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={actionBusyId === cidModalCaretaker.id}
                  onClick={() => {
                    const target = cidModalCaretaker;
                    setCidModalCaretaker(null);
                    setDeleteModalCaretaker(target);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" /> Delete Account
                </Button>
                {cidModalCaretaker.verificationStatus !== 'REJECTED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={actionBusyId === cidModalCaretaker.id}
                    onClick={() => {
                      const target = cidModalCaretaker;
                      setCidModalCaretaker(null);
                      setRejectModalCaretaker(target);
                      setRejectionReason(target.rejectionReason || '');
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5 text-danger" />
                    {cidModalCaretaker.verificationStatus === 'APPROVED' ? 'Revoke' : 'Reject'}
                  </Button>
                )}
                {cidModalCaretaker.verificationStatus !== 'APPROVED' && (
                  <Button
                    size="sm"
                    className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]"
                    disabled={actionBusyId === cidModalCaretaker.id}
                    onClick={() =>
                      handleVerifyDecision(cidModalCaretaker.id, 'APPROVED')
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve Caretaker
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* REJECTION REASON MODAL                                            */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(rejectModalCaretaker)}
        onClose={() => setRejectModalCaretaker(null)}
        title={`Reject ${rejectModalCaretaker?.fullName || 'Application'}`}
        subtitle="Provide a brief note explaining why the Citizenship ID or institution certificate could not be approved."
      >
        {rejectModalCaretaker && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyDecision(
                rejectModalCaretaker.id,
                'REJECTED',
                rejectionReason
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-900">
                Reason for Rejection
              </label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Institution certificate scan is blurry or missing official stamp. Please re-upload."
                className="w-full rounded-xl border border-[#E2E8F4] bg-[#F3F7FD] px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1A56B8] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setRejectModalCaretaker(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-full bg-danger text-white hover:bg-danger/90"
                isLoading={actionBusyId === rejectModalCaretaker.id}
              >
                Confirm Rejection
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* DELETE CARETAKER CONFIRMATION MODAL                               */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(deleteModalCaretaker)}
        onClose={() => setDeleteModalCaretaker(null)}
        title={`Delete ${deleteModalCaretaker?.fullName || 'Caretaker'}?`}
        subtitle="This action permanently removes the caretaker account, profile, contracts, and uploaded CID/certificate files."
      >
        {deleteModalCaretaker && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-slate-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p className="leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong>{deleteModalCaretaker.fullName}</strong> (
                {deleteModalCaretaker.email})? This cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setDeleteModalCaretaker(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full bg-danger text-white hover:bg-danger/90"
                isLoading={actionBusyId === deleteModalCaretaker.id}
                onClick={() => handleDeleteCaretaker(deleteModalCaretaker)}
              >
                Yes, Delete Caretaker
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* DELETE CONTRACT CONFIRMATION MODAL                                */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(deleteModalBooking)}
        onClose={() => setDeleteModalBooking(null)}
        title="Delete Childcare Contract?"
        subtitle="This permanently deletes the selected booking record from the database."
      >
        {deleteModalBooking && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-slate-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p className="leading-relaxed">
                Delete contract between{' '}
                <strong>{deleteModalBooking.parentName || 'Parent'}</strong> and{' '}
                <strong>{deleteModalBooking.caretakerName || 'Caretaker'}</strong>?
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setDeleteModalBooking(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full bg-danger text-white hover:bg-danger/90"
                isLoading={actionBusyId === deleteModalBooking.id}
                onClick={() => handleDeleteBooking(deleteModalBooking)}
              >
                Yes, Delete Contract
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* LOGOUT WARNING MODAL                                              */}
      {/* ================================================================= */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="Log out of Admin Portal?"
        subtitle="Please confirm before ending your current administrator session."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3.5 text-xs text-slate-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="leading-relaxed">
              <strong>Warning:</strong> Logging out will terminate your active admin session. You will need to sign back in with administrator credentials to audit Citizenship IDs or manage platform contracts.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setLogoutModalOpen(false)}
            >
              Stay Signed In
            </Button>
            <Button type="button" className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]" onClick={handleConfirmLogout}>
              Yes, Log Out
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
