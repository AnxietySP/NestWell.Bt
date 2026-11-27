import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  FileCheck2,
  UserCog,
  Bell,
  ShieldCheck,
  Clock,
  Calendar,
  Check,
  X,
  LogOut,
  Camera,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Search,
  Wallet,
  Circle,
  ArrowRight,
  Inbox,
} from 'lucide-react';
import { BookingRecord, AppNotification } from '../types/domain';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatBtn, formatDisplayDate } from '../lib/date';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

type SidebarSection = 'OVERVIEW' | 'REQUESTS' | 'PROFILE' | 'NOTIFICATIONS';
type RequestFilter = 'ALL' | 'PENDING' | 'ACTIVE';

const LIVE_STATUSES = ['ACCEPTED', 'CONFIRMED', 'ACTIVE'];
const DAY = 86_400_000;

/* ----------------------------------------------------------------------- */
/* Helpers                                                                  */
/* ----------------------------------------------------------------------- */

function getInitials(name?: string) {
  if (!name) return 'CT';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const toUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const todayUtc = () => {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Progress =
  | { state: 'upcoming'; daysUntil: number; pct: 0 }
  | { state: 'running'; month: number; daysLeft: number; pct: number }
  | { state: 'ended'; pct: 100 };

function contractProgress(b: BookingRecord): Progress {
  const start = toUtc(b.startDate);
  const end = toUtc(b.endDate);
  const today = todayUtc();
  if (today < start) return { state: 'upcoming', daysUntil: Math.round((start - today) / DAY), pct: 0 };
  if (today > end) return { state: 'ended', pct: 100 };
  const frac = (today - start) / Math.max(1, end - start);
  return {
    state: 'running',
    month: Math.min(b.durationMonths, Math.floor(frac * b.durationMonths) + 1),
    daysLeft: Math.round((end - today) / DAY),
    pct: Math.round(frac * 100),
  };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/* ----------------------------------------------------------------------- */
/* Small presentational pieces                                              */
/* ----------------------------------------------------------------------- */

function StatusPill({ status }: { status: string }) {
  if (['CONFIRMED', 'ACTIVE', 'ACCEPTED'].includes(status)) {
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

function ProgressRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-[#DCE6F7]" />
      <motion.circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-[#1A56B8]"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (c * pct) / 100 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </svg>
  );
}

function ContractCard({
  b,
  onDecision,
}: {
  b: BookingRecord;
  onDecision: (id: string, status: 'ACCEPTED' | 'REJECTED') => void;
}) {
  const live = LIVE_STATUSES.includes(b.status);
  const p = live ? contractProgress(b) : null;

  const cardSurface = live
    ? 'border-[#BFD3F5] bg-gradient-to-br from-[#F3F7FD] via-white to-[#EBF2FC]/60 hover:border-[#1A56B8]/50'
    : 'border-[#E2E8F4] bg-white hover:border-[#BFD3F5]';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, transition: { duration: 0.18 } }}
      transition={{ duration: 0.25 }}
      className={`space-y-4 rounded-card border p-5 shadow-soft transition-colors ${cardSurface}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
              live ? 'bg-[#1A56B8] text-white shadow-xs' : 'bg-[#E6EFFC] text-[#1A56B8]'
            }`}
          >
            {getInitials(b.parentName)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold text-slate-900">{b.parentName}</h3>
            <p className="text-xs text-slate-500">
              {b.parentDzongkhag} · Child: {b.childName}
            </p>
          </div>
        </div>
        <StatusPill status={b.status} />
      </div>

      {/* Six-month timeline */}
      {p && (
        <div className="space-y-2 rounded-xl border border-[#DCE6F7] bg-white/80 p-3">
          <div className="h-2 overflow-hidden rounded-full bg-[#DCE6F7]">
            <motion.div
              className={`h-full rounded-full ${
                p.state === 'ended' ? 'bg-slate-400' : 'bg-gradient-to-r from-[#1A56B8] to-[#3B7BE3]'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${p.pct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              {formatDisplayDate(b.startDate)} – {formatDisplayDate(b.endDate)}
            </span>
            <span className="font-semibold text-[#1A56B8]">
              {p.state === 'upcoming' && `Starts in ${plural(p.daysUntil, 'day')}`}
              {p.state === 'running' && `Month ${p.month} of ${b.durationMonths} · ${plural(p.daysLeft, 'day')} left`}
              {p.state === 'ended' && 'Contract period ended'}
            </span>
          </div>
        </div>
      )}
      {!p && (
        <p className="text-xs text-slate-500">
          {b.durationMonths} months · {formatDisplayDate(b.startDate)} – {formatDisplayDate(b.endDate)}
        </p>
      )}

      {b.parentNotes && (
        <p className="rounded-control border border-[#E2E8F4] bg-[#F3F7FD] p-3 text-xs text-slate-600">“{b.parentNotes}”</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F4] pt-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-lg bg-[#E6EFFC] px-2.5 py-1 text-xs font-bold text-[#1A56B8]">
            {formatBtn(b.estimatedTotalBtn)} total
          </span>
          <span className="text-xs font-medium text-slate-500">· {formatBtn(b.agreedMonthlyRateBtn)}/mo</span>
        </div>

        {b.status === 'PENDING' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => onDecision(b.id, 'REJECTED')}>
              <X className="h-4 w-4 text-danger" /> Decline
            </Button>
            <Button size="sm" className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]" onClick={() => onDecision(b.id, 'ACCEPTED')}>
              <Check className="h-4 w-4" /> Accept
            </Button>
          </div>
        )}
        {b.status === 'ACCEPTED' && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#1A56B8]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1A56B8]" />
            Waiting for parent confirmation
          </span>
        )}
      </div>
    </motion.article>
  );
}

/* ----------------------------------------------------------------------- */
/* Page                                                                     */
/* ----------------------------------------------------------------------- */

export function CaretakerDashboard() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [activeSection, setActiveSection] = useState<SidebarSection>('OVERVIEW');
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const loadData = async () => {
    const [pRes, bRes, nRes] = await Promise.all([
      api.get('/caretakers/me/profile'),
      api.get('/bookings'),
      api.get('/notifications'),
    ]);
    setProfile(pRes.data.profile);
    setBookings(bRes.data.bookings || []);
    setNotifications(nRes.data.notifications || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const avatarUrlRaw: string | null = user?.avatarUrl || profile?.avatarUrl || null;
  useEffect(() => setAvatarFailed(false), [avatarUrlRaw]);

  // =========================================================================
  // PROFILE PICTURE UPDATE & DELETE HANDLERS
  // =========================================================================
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      window.alert('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }

    setAvatarBusy(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await api.patch('/auth/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      await loadData();
      setMessage('Profile picture updated successfully.');
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Unable to update profile picture.');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    const currentAvatar = user?.avatarUrl || profile?.avatarUrl;
    if (!currentAvatar) return;

    setAvatarBusy(true);
    setMessage(null);
    try {
      await api
        .delete('/auth/me/avatar')
        .catch(() => api.patch('/auth/me/avatar', { removeAvatar: true, avatarUrl: null }));
      await refreshUser();
      await loadData();
      setMessage('Profile picture removed.');
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Unable to remove profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  // =========================================================================
  // BOOKING DECISION, PROFILE SAVE, AVAILABILITY HANDLERS
  // =========================================================================
  const handleDecision = async (bookingId: string, status: 'ACCEPTED' | 'REJECTED') => {
    try {
      await api.patch(`/bookings/${bookingId}/status`, { status });
      setMessage(
        status === 'ACCEPTED'
          ? 'Contract request accepted! Waiting for parent final confirmation.'
          : 'Contract request declined.'
      );
      await loadData();
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Could not update booking status.');
    }
  };

  const profilePayload = (p: any) => ({
    bio: p.bio || '',
    yearsExperience: Number(p.yearsExperience),
    qualifications: p.qualifications,
    skills: p.skills,
    languages: p.languages,
    monthlyRateBtn: Number(p.monthlyRateBtn),
    isAvailable: Boolean(p.isAvailable),
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    setMessage(null);
    try {
      await api.put('/caretakers/me/profile', profilePayload(profile));
      setMessage('Profile & availability updated successfully.');
      await loadData();
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleAvailability = async () => {
    if (!profile || togglingAvailability) return;
    const next = !profile.isAvailable;
    setProfile({ ...profile, isAvailable: next });
    setTogglingAvailability(true);
    try {
      await api.put('/caretakers/me/profile', profilePayload({ ...profile, isAvailable: next }));
      setMessage(next ? 'You are open for new contracts.' : 'New requests are paused.');
    } catch (err: any) {
      setProfile((p: any) => ({ ...p, isAvailable: !next }));
      setMessage(err?.response?.data?.message || 'Could not change availability.');
    } finally {
      setTogglingAvailability(false);
    }
  };

  // =========================================================================
  // NOTIFICATION HANDLERS
  // =========================================================================
  const handleOpenNotification = async (n: AppNotification) => {
    if (n.isRead) return;
    setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    await api.patch(`/notifications/${n.id}/read`).catch(() => {});
  };

  const handleMarkAllRead = async () => {
    setNotifications((list) => list.map((x) => ({ ...x, isRead: true })));
    await api.patch('/notifications/read-all').catch(() => {});
  };

  const handleDeleteNotification = async (id: string) => {
    const previous = notifications;
    setNotifications((list) => list.filter((x) => x.id !== id));
    try {
      await api.delete(`/notifications/${id}`);
    } catch (err: any) {
      setNotifications(previous);
      setMessage(err?.response?.data?.message || 'Could not delete notification.');
    }
  };

  const handleClearAllNotifications = async () => {
    if (!window.confirm('Delete all notifications? This cannot be undone.')) return;
    const previous = notifications;
    setNotifications([]);
    try {
      await api.delete('/notifications');
    } catch (err: any) {
      setNotifications(previous);
      setMessage(err?.response?.data?.message || 'Could not clear notifications.');
    }
  };

  const handleConfirmLogout = () => {
    setLogoutModalOpen(false);
    logout();
    navigate('/login');
  };

  // =========================================================================
  // DERIVED DATA
  // =========================================================================
  const pendingBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'PENDING')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [bookings]
  );
  const pendingCount = pendingBookings.length;
  const activeCount = useMemo(() => bookings.filter((b) => LIVE_STATUSES.includes(b.status)).length, [bookings]);
  const unreadNotifsCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const income = useMemo(() => {
    const today = new Date();
    const monthStart = Date.UTC(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = Date.UTC(today.getFullYear(), today.getMonth() + 1, 0);
    const now = todayUtc();
    const paying = bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'ACTIVE');
    return {
      thisMonth: paying
        .filter((b) => toUtc(b.startDate) <= monthEnd && toUtc(b.endDate) >= monthStart)
        .reduce((sum, b) => sum + Number(b.agreedMonthlyRateBtn || 0), 0),
      committed: paying.filter((b) => toUtc(b.endDate) >= now).reduce((sum, b) => sum + Number(b.estimatedTotalBtn || 0), 0),
      contracts: paying.filter((b) => toUtc(b.endDate) >= now).length,
    };
  }, [bookings]);

  const bookedUntil = useMemo(() => {
    const now = todayUtc();
    const ends = bookings.filter((b) => LIVE_STATUSES.includes(b.status) && toUtc(b.endDate) >= now).map((b) => b.endDate.slice(0, 10));
    ends.sort();
    return ends.length ? ends[ends.length - 1] : null;
  }, [bookings]);

  const upcomingStarts = useMemo(() => {
    const now = todayUtc();
    return bookings
      .filter((b) => LIVE_STATUSES.includes(b.status) && toUtc(b.startDate) >= now && toUtc(b.startDate) - now <= 30 * DAY)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [bookings]);

  const matchesSearch = (b: BookingRecord) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (b.parentName || '').toLowerCase().includes(q) ||
      (b.parentDzongkhag || '').toLowerCase().includes(q) ||
      b.childName.toLowerCase().includes(q) ||
      b.status.toLowerCase().includes(q)
    );
  };

  const overviewContracts = useMemo(
    () => bookings.filter((b) => b.status !== 'PENDING' && matchesSearch(b)).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, searchQuery]
  );
  const requestsList = useMemo(
    () =>
      bookings
        .filter((b) => {
          if (requestFilter === 'PENDING' && b.status !== 'PENDING') return false;
          if (requestFilter === 'ACTIVE' && !LIVE_STATUSES.includes(b.status)) return false;
          return matchesSearch(b);
        })
        .sort((a, b) => (a.status === 'PENDING' ? -1 : 0) - (b.status === 'PENDING' ? -1 : 0) || b.startDate.localeCompare(a.startDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, requestFilter, searchQuery]
  );

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFE] text-sm text-slate-500">
        Loading caretaker workspace...
      </div>
    );
  }

  const avatarSrc = avatarFailed ? null : avatarUrlRaw;
  const displayName = user?.fullName || profile.fullName || 'Caretaker';
  const firstName = displayName.split(' ')[0];

  const checklist = [
    { label: 'Citizenship ID approved', done: profile.verificationStatus === 'APPROVED' },
    { label: 'Add a profile photo', done: !!avatarSrc },
    { label: 'Write a short bio', done: (profile.bio || '').trim().length >= 20 },
    { label: 'List your qualifications', done: !!(profile.qualifications || '').trim() },
    { label: 'Add your skills', done: Array.isArray(profile.skills) && profile.skills.length > 0 },
    { label: 'Open for new contracts', done: !!profile.isAvailable },
  ];
  const completeness = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);
  const nextTodo = checklist.find((c) => !c.done);

  const navItems: { id: SidebarSection; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'OVERVIEW', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'REQUESTS', label: 'Contract Requests', icon: <FileCheck2 className="h-4 w-4" />, badge: pendingCount || undefined },
    { id: 'PROFILE', label: 'Profile & Rate', icon: <UserCog className="h-4 w-4" /> },
    { id: 'NOTIFICATIONS', label: 'Notifications', icon: <Bell className="h-4 w-4" />, badge: unreadNotifsCount || undefined },
  ];

  /* ---- reusable blocks ------------------------------------------------- */

  const activityFeed = (limit?: number) => {
    const items = limit ? notifications.slice(0, limit) : notifications;
    return (
      <div className="space-y-1">
        {items.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">Nothing yet. Updates about requests and approvals will show up here.</p>
        ) : (
          items.map((n) => {
            const Icon = n.type.includes('BOOKING') ? FileCheck2 : /verified|approved/i.test(n.title) ? ShieldCheck : Bell;
            return (
              <div
                key={n.id}
                className="group flex items-start gap-1 rounded-control transition-colors hover:bg-[#F3F7FD]"
              >
                <button
                  type="button"
                  onClick={() => handleOpenNotification(n)}
                  className="flex min-w-0 flex-1 items-start gap-3 p-2.5 text-left"
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${
                      n.isRead ? 'bg-[#F3F7FD] text-slate-500' : 'bg-[#E6EFFC] text-[#1A56B8]'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${n.isRead ? 'font-medium text-slate-600' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{n.message}</span>
                  </span>
                  {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#1A56B8]" aria-label="Unread" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNotification(n.id)}
                  title="Delete notification"
                  aria-label="Delete notification"
                  className="mr-1.5 mt-2.5 shrink-0 rounded-control p-1.5 text-slate-400 transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:shadow-focus lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    );
  };

  const strengthCard = (
    <section className="rounded-card border border-[#E2E8F4] bg-[#F3F7FD]/70 p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="relative">
          <ProgressRing pct={completeness} />
          <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-semibold text-[#1A56B8]">{completeness}%</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-slate-900">Profile strength</h3>
          <p className="text-xs text-slate-500">{nextTodo ? `Next: ${nextTodo.label.toLowerCase()}` : 'Your profile is complete.'}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {checklist.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 text-sm">
            {c.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1A56B8]" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            )}
            <span className={c.done ? 'text-slate-500' : 'font-medium text-slate-800'}>{c.label}</span>
          </li>
        ))}
      </ul>
      {activeSection !== 'PROFILE' && completeness < 100 && (
        <Button
          size="sm"
          variant="outline"
          className="mt-4 w-full rounded-full border-[#C7D9F7] bg-white text-[#1A56B8] hover:bg-[#E6EFFC]"
          onClick={() => setActiveSection('PROFILE')}
        >
          Improve profile <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFE]">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        {/* ================================================================= */}
        {/* LEFT SIDEBAR RAIL (Royal Blue Theme matching Reference Design)    */}
        {/* ================================================================= */}
        <aside className="flex w-full shrink-0 flex-col justify-between bg-[#1A56B8] px-4 py-5 text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:overflow-y-auto lg:px-5 lg:py-7">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between lg:block">
                <div className="flex items-center gap-3">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={displayName}
                      onError={() => setAvatarFailed(true)}
                      className="h-11 w-11 shrink-0 rounded-full border-2 border-white/30 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[#1A56B8] shadow-sm">
                      {getInitials(displayName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold text-white">{displayName}</p>
                    <p className="truncate text-xs text-blue-100/80">NestWell.BT • Caretaker</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setLogoutModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 lg:hidden"
                >
                  <LogOut className="h-3.5 w-3.5" /> Log out
                </button>
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <button
                  type="button"
                  disabled={avatarBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-semibold text-[#1A56B8] shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {avatarBusy ? 'Saving...' : avatarUrlRaw ? 'Update Photo' : 'Upload Photo'}
                </button>

                {avatarUrlRaw && (
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

            <nav aria-label="Caretaker dashboard sections" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'REQUESTS') setRequestFilter('ALL');
                      setActiveSection(item.id);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex shrink-0 items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? 'bg-white/20 font-semibold text-white shadow-sm' : 'text-blue-100/85 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {item.icon}
                      {item.label}
                    </span>
                    {item.badge !== undefined && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white text-[#1A56B8]' : 'bg-white/15 text-white'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="hidden space-y-3 pt-4 lg:block">
            <div className="space-y-2.5 rounded-2xl border border-white/15 bg-[#134291]/70 p-4 text-white">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-white">
                  <ShieldCheck className="h-4 w-4 text-blue-200" /> CID Status
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    profile.verificationStatus === 'APPROVED'
                      ? 'bg-white/20 text-white'
                      : profile.verificationStatus === 'REJECTED'
                      ? 'bg-rose-500/30 text-white'
                      : 'bg-amber-400/30 text-white'
                  }`}
                >
                  {profile.verificationStatus}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-blue-100/80">
                {profile.verificationStatus === 'APPROVED'
                  ? 'Your profile is live in parent search results for 6+ month placements.'
                  : 'Admin review of your Citizenship ID unlocks public parent bookings.'}
              </p>
              <button
                type="button"
                onClick={() => setActiveSection('PROFILE')}
                className="block w-full rounded-full bg-white py-2 text-center text-xs font-semibold text-[#1A56B8] shadow-sm transition-colors hover:bg-blue-50"
              >
                Edit Profile & Rate
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
        {/* MAIN WORKSPACE                                                    */}
        {/* ================================================================= */}
        <main className="min-w-0 flex-1 bg-white px-4 py-6 sm:px-6 lg:rounded-l-[28px] lg:px-10 lg:py-8 lg:shadow-[-4px_0_24px_rgba(26,86,184,0.06)]">
          <div className="mx-auto w-full max-w-[1500px] space-y-6">
            {/* Header */}
            <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-display text-slate-900 sm:text-3xl">
                  {greeting()}, {firstName}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                  <Calendar className="h-3.5 w-3.5 text-[#1A56B8]" aria-hidden />
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search family or child..."
                    aria-label="Search families or children"
                    className="w-52 rounded-full border border-[#E2E8F4] bg-[#F3F7FD] py-2 pl-9 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#1A56B8] focus:bg-white focus:outline-none focus:shadow-focus"
                  />
                </div>

                {/* Availability switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!profile.isAvailable}
                  onClick={handleToggleAvailability}
                  disabled={togglingAvailability}
                  className="flex items-center gap-3 rounded-full border border-[#E2E8F4] bg-[#F3F7FD] py-1.5 pl-4 pr-2 text-left transition-colors hover:bg-[#EBF2FC] focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-70"
                >
                  <span className="leading-tight">
                    <span className="block text-xs font-semibold text-slate-900">{profile.isAvailable ? 'Open for contracts' : 'Requests paused'}</span>
                    <span className="block text-[11px] text-slate-500">{bookedUntil ? `Booked until ${formatDisplayDate(bookedUntil)}` : 'No active contracts'}</span>
                  </span>
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${profile.isAvailable ? 'bg-[#1A56B8]' : 'bg-slate-300'}`}>
                    <motion.span
                      className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
                      animate={{ left: profile.isAvailable ? 22 : 2 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 36 }}
                    />
                  </span>
                </button>

                <StatusPill status={profile.verificationStatus === 'APPROVED' ? 'VERIFIED' : profile.verificationStatus} />
              </div>
            </header>

            {profile.verificationStatus !== 'APPROVED' && (
              <div className="flex items-center gap-2.5 rounded-card border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-900">
                <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Your profile is currently <strong>{profile.verificationStatus}</strong>. You will appear in parent search as soon as an administrator approves your Citizenship ID.
                </span>
              </div>
            )}

            <AnimatePresence>
              {message && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  role="status"
                  className="flex items-center justify-between gap-3 rounded-card border border-[#BFD3F5] bg-[#EBF2FC] px-5 py-3 text-sm font-medium text-[#134291]"
                >
                  <span>{message}</span>
                  <button
                    type="button"
                    onClick={() => setMessage(null)}
                    aria-label="Dismiss message"
                    className="rounded p-1 text-[#1A56B8] hover:bg-white/60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {/* ============================ OVERVIEW ============================ */}
              {activeSection === 'OVERVIEW' && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="space-y-6"
                >
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {/* 1. Income this month -> All Contract Requests */}
                    <button
                      type="button"
                      onClick={() => {
                        setRequestFilter('ALL');
                        setActiveSection('REQUESTS');
                      }}
                      className="flex flex-col justify-between gap-3 rounded-card bg-gradient-to-br from-[#1A56B8] to-[#154698] p-5 text-left text-white shadow-card transition-all hover:brightness-105"
                    >
                      <p className="text-xs font-medium text-blue-100">Income this month</p>
                      <p className="font-display text-3xl font-semibold tracking-tight">{formatBtn(income.thisMonth)}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-blue-100">
                        <Wallet className="h-3.5 w-3.5" /> {formatBtn(income.committed)} committed over {plural(income.contracts, 'contract')}
                      </p>
                    </button>

                    {/* 2. Active contracts -> Contract Requests filtered to ACTIVE */}
                    <button
                      type="button"
                      onClick={() => {
                        setRequestFilter('ACTIVE');
                        setActiveSection('REQUESTS');
                      }}
                      className="flex flex-col justify-between gap-3 rounded-card border border-[#E2E8F4] bg-[#F3F7FD] p-5 text-left transition-all hover:border-[#BFD3F5] hover:bg-[#EBF2FC]"
                    >
                      <p className="text-xs font-medium text-slate-500">Active contracts</p>
                      <p className="font-display text-3xl font-semibold text-slate-900">{activeCount}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#1A56B8]" />
                        {upcomingStarts.length ? `${plural(upcomingStarts.length, 'start')} in the next 30 days` : 'View active placements →'}
                      </p>
                    </button>

                    {/* 3. Awaiting your reply -> Contract Requests filtered to PENDING */}
                    <button
                      type="button"
                      onClick={() => {
                        setRequestFilter('PENDING');
                        setActiveSection('REQUESTS');
                      }}
                      className="flex flex-col justify-between gap-3 rounded-card border border-[#E2E8F4] bg-[#F3F7FD] p-5 text-left transition-all hover:border-[#BFD3F5] hover:bg-[#EBF2FC]"
                    >
                      <p className="text-xs font-medium text-slate-500">Awaiting your reply</p>
                      <p className="font-display text-3xl font-semibold text-slate-900">{pendingCount}</p>
                      <p className={`flex items-center gap-1.5 text-[11px] ${pendingCount ? 'font-semibold text-amber-600' : 'text-slate-600'}`}>
                        <Inbox className="h-3.5 w-3.5 text-[#1A56B8]" /> {pendingCount ? 'Respond to families →' : 'View incoming requests →'}
                      </p>
                    </button>

                    {/* 4. Profile strength -> Profile & Rate */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('PROFILE')}
                      className="flex flex-col justify-between gap-3 rounded-card border border-[#E2E8F4] bg-[#F3F7FD] p-5 text-left transition-all hover:border-[#BFD3F5] hover:bg-[#EBF2FC]"
                    >
                      <p className="text-xs font-medium text-slate-500">Profile strength</p>
                      <p className="font-display text-3xl font-semibold text-slate-900">{completeness}%</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <UserCog className="h-3.5 w-3.5 text-[#1A56B8]" /> {nextTodo ? `${nextTodo.label} →` : 'Edit profile & rate →'}
                      </p>
                    </button>
                  </div>

                  <div className="grid items-start gap-6 xl:grid-cols-12">
                    <div className="space-y-6 xl:col-span-8">
                      {/* Needs you now */}
                      <section aria-labelledby="needs-you" className="rounded-card border border-[#E2E8F4] bg-white p-5 shadow-soft">
                        <div className="flex items-center justify-between gap-3">
                          <h2 id="needs-you" className="font-display text-lg font-semibold text-slate-900">
                            Needs you now
                          </h2>
                          {pendingCount > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                              {plural(pendingCount, 'request')}
                            </span>
                          )}
                        </div>

                        {pendingCount === 0 && upcomingStarts.length === 0 && (
                          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                            <CheckCircle2 className="h-4 w-4 text-[#1A56B8]" aria-hidden /> Nothing waiting. New family requests will appear here.
                          </p>
                        )}

                        <ul className="mt-3 divide-y divide-[#E8EFFB]">
                          <AnimatePresence initial={false}>
                            {pendingBookings.filter(matchesSearch).map((b) => (
                              <motion.li
                                key={b.id}
                                layout
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex flex-wrap items-center justify-between gap-3 overflow-hidden py-3.5"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {b.parentName} <span className="font-normal text-slate-500">· child {b.childName}</span>
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {plural(b.durationMonths, 'month')} from {formatDisplayDate(b.startDate)} · {formatBtn(b.agreedMonthlyRateBtn)}/mo · {formatBtn(b.estimatedTotalBtn)} total
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleDecision(b.id, 'REJECTED')}>
                                    <X className="h-4 w-4 text-danger" /> Decline
                                  </Button>
                                  <Button size="sm" className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]" onClick={() => handleDecision(b.id, 'ACCEPTED')}>
                                    <Check className="h-4 w-4" /> Accept
                                  </Button>
                                </div>
                              </motion.li>
                            ))}
                          </AnimatePresence>
                          {upcomingStarts.map((b) => {
                            const days = Math.round((toUtc(b.startDate) - todayUtc()) / DAY);
                            return (
                              <li key={`start-${b.id}`} className="flex items-center gap-3 py-3.5 text-sm">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-[#E6EFFC] text-[#1A56B8]">
                                  <Calendar className="h-4 w-4" aria-hidden />
                                </span>
                                <span className="text-slate-800">
                                  <strong className="font-semibold text-[#1A56B8]">{days === 0 ? 'Starts today' : `Starts in ${plural(days, 'day')}`}</strong>
                                  <span className="text-slate-500"> · {b.parentName}, child {b.childName} ({formatDisplayDate(b.startDate)})</span>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </section>

                      {/* Contracts */}
                      <section aria-labelledby="contracts" className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 id="contracts" className="font-display text-lg font-semibold text-slate-900">
                            Contracts
                          </h2>
                          <button
                            type="button"
                            onClick={() => {
                              setRequestFilter('ALL');
                              setActiveSection('REQUESTS');
                            }}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-[#1A56B8] hover:underline"
                          >
                            All requests <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>
                        {overviewContracts.length === 0 ? (
                          <div className="rounded-card border border-dashed border-[#C7D9F7] bg-[#F3F7FD]/60 p-8 text-center text-sm text-slate-500">
                            No contracts yet. Accepted and confirmed placements will appear here with their progress.
                          </div>
                        ) : (
                          <div className="grid gap-4 2xl:grid-cols-2">
                            {overviewContracts.map((b) => (
                              <ContractCard key={b.id} b={b} onDecision={handleDecision} />
                            ))}
                          </div>
                        )}
                      </section>
                    </div>

                    <div className="space-y-6 xl:col-span-4">
                      <section className="rounded-card border border-[#E2E8F4] bg-white p-5 shadow-soft">
                        <div className="mb-2 flex items-center justify-between">
                          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
                            Activity
                            {unreadNotifsCount > 0 && <span className="rounded-full bg-[#1A56B8] px-2 py-0.5 text-[11px] font-semibold text-white">{unreadNotifsCount}</span>}
                          </h2>
                          <button type="button" onClick={() => setActiveSection('NOTIFICATIONS')} className="text-sm font-semibold text-[#1A56B8] hover:underline">
                            See all
                          </button>
                        </div>
                        {activityFeed(5)}
                      </section>
                      {strengthCard}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ============================ REQUESTS ============================ */}
              {activeSection === 'REQUESTS' && (
                <motion.section
                  key="requests"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="space-y-5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'ALL', label: `All (${bookings.length})` },
                        { id: 'PENDING', label: `New (${pendingCount})` },
                        { id: 'ACTIVE', label: `Accepted & active (${activeCount})` },
                      ] as { id: RequestFilter; label: string }[]
                    ).map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setRequestFilter(pill.id)}
                        aria-pressed={requestFilter === pill.id}
                        className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                          requestFilter === pill.id
                            ? 'bg-[#1A56B8] text-white shadow-soft'
                            : 'border border-[#E2E8F4] bg-[#F3F7FD] text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>
                  {requestsList.length === 0 ? (
                    <div className="rounded-card border border-dashed border-[#C7D9F7] bg-[#F3F7FD]/60 p-10 text-center text-sm text-slate-500">
                      {bookings.length === 0 ? 'No booking requests received yet.' : 'No requests match this filter.'}
                    </div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                      {requestsList.map((b) => (
                        <ContractCard key={b.id} b={b} onDecision={handleDecision} />
                      ))}
                    </div>
                  )}
                </motion.section>
              )}

              {/* ============================= PROFILE ============================ */}
              {activeSection === 'PROFILE' && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="grid items-start gap-6 xl:grid-cols-12"
                >
                  <form onSubmit={handleSaveProfile} className="space-y-4 rounded-card border border-[#E2E8F4] bg-white p-6 shadow-soft xl:col-span-7">
                    <h2 className="font-display text-xl font-semibold text-slate-900">Profile & availability</h2>

                    <label className="flex cursor-pointer items-center justify-between rounded-control border border-[#E2E8F4] bg-[#F3F7FD] p-3.5 text-sm">
                      <span className="font-medium text-slate-900">Available for new 6+ month contracts</span>
                      <input
                        type="checkbox"
                        checked={!!profile.isAvailable}
                        onChange={(e) => setProfile({ ...profile, isAvailable: e.target.checked })}
                        className="h-4 w-4 accent-[#1A56B8]"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input
                        label="Monthly rate (BTN)"
                        type="number"
                        value={profile.monthlyRateBtn}
                        onChange={(e) => setProfile({ ...profile, monthlyRateBtn: Number(e.target.value) })}
                      />
                      <Input
                        label="Qualifications"
                        value={profile.qualifications}
                        onChange={(e) => setProfile({ ...profile, qualifications: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="bio" className="mb-1.5 block text-sm font-semibold text-slate-900">
                        Professional bio
                      </label>
                      <textarea
                        id="bio"
                        rows={5}
                        value={profile.bio || ''}
                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                        className="w-full rounded-control border border-[#E2E8F4] bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1A56B8] focus:outline-none focus:shadow-focus"
                      />
                    </div>

                    <Button type="submit" className="w-full rounded-full bg-[#1A56B8] text-white hover:bg-[#154698] sm:w-auto" isLoading={savingProfile}>
                      Save changes
                    </Button>
                  </form>

                  <div className="space-y-6 xl:col-span-5">
                    {strengthCard}
                    <section className="rounded-card border border-[#E2E8F4] bg-white p-5 shadow-soft">
                      <h3 className="font-display text-base font-semibold text-slate-900">How parents see you</h3>
                      <div className="mt-4 flex items-start gap-3">
                        {avatarSrc ? (
                          <img src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} className="h-14 w-14 rounded-xl border border-[#E2E8F4] object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#E6EFFC] text-base font-semibold text-[#1A56B8]">
                            {getInitials(displayName)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-base font-semibold text-slate-900">{displayName}</p>
                          <p className="text-xs text-slate-500">{profile.qualifications || 'Add your qualifications'}</p>
                          <p className="mt-1 text-sm font-semibold text-[#1A56B8]">{formatBtn(Number(profile.monthlyRateBtn || 0))}/mo</p>
                        </div>
                        <StatusPill status={profile.isAvailable ? 'AVAILABLE' : 'PAUSED'} />
                      </div>
                      <p className="mt-3 line-clamp-4 text-sm text-slate-500">{profile.bio?.trim() || 'Your bio will appear here. Parents read it before sending a request.'}</p>
                    </section>
                  </div>
                </motion.div>
              )}

              {/* =========================== NOTIFICATIONS ======================== */}
              {activeSection === 'NOTIFICATIONS' && (
                <motion.section
                  key="notifications"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="max-w-3xl rounded-card border border-[#E2E8F4] bg-white p-5 shadow-soft"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-display text-xl font-semibold text-slate-900">Activity</h2>
                    {notifications.length > 0 && (
                      <div className="flex items-center gap-1">
                        {unreadNotifsCount > 0 && (
                          <Button size="sm" variant="ghost" className="text-[#1A56B8] hover:bg-[#E6EFFC]" onClick={handleMarkAllRead}>
                            <Check className="h-4 w-4" /> Mark all read
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={handleClearAllNotifications}>
                          <Trash2 className="h-4 w-4" /> Clear all
                        </Button>
                      </div>
                    )}
                  </div>
                  {activityFeed()}
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ================================================================= */}
      {/* LOGOUT WARNING MODAL                                              */}
      {/* ================================================================= */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="Log out of NestWell.BT?"
        subtitle="Please confirm before ending your current caretaker session."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3.5 text-xs text-slate-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="leading-relaxed">
              <strong>Warning:</strong> Logging out will end your active session. Any unsaved profile edits will be lost, and you will need to sign back in to respond to 6-month family booking requests.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setLogoutModalOpen(false)}>
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
