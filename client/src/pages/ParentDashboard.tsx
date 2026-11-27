import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  FileCheck2,
  Baby,
  Bell,
  Plus,
  Search,
  Calendar,
  ShieldCheck,
  LogOut,
  Camera,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  XCircle,
  MapPin,
  Star,
  Award,
  UserSearch,
  FileText,
  ExternalLink,
  RotateCcw,
  Wallet,
  Inbox,
  Check,
  X,
  ArrowRight,
} from 'lucide-react';
import { BookingRecord, ChildProfile, AppNotification } from '../types/domain';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatBtn, formatDisplayDate } from '../lib/date';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { TermsAndConditionsModal } from '../components/shared/TermsAndConditionsModal';

type SidebarSection = 'OVERVIEW' | 'FIND_CARETAKERS' | 'CONTRACTS' | 'CHILDREN' | 'NOTIFICATIONS';
type ContractFilter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'COMPLETED';

interface CaretakerSummary {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  dzongkhag: string;
  address?: string;
  bio?: string | null;
  yearsExperience: number;
  qualifications: string;
  skills: string[];
  languages: string[];
  monthlyRateBtn: number;
  avgRating: number;
  totalReviews: number;
  isAvailable: boolean;
  idDocumentPath?: string | null;
  certificateDocumentPath?: string | null;
}

const DZONGKHAG_OPTIONS = [
  'ALL',
  'Bumthang',
  'Chukha',
  'Dagana',
  'Gasa',
  'Haa',
  'Lhuntse',
  'Mongar',
  'Paro',
  'Pemagatshel',
  'Punakha',
  'Samdrup Jongkhar',
  'Samtse',
  'Sarpang',
  'Thimphu',
  'Trashigang',
  'Trashiyangtse',
  'Trongsa',
  'Tsirang',
  'Wangdue Phodrang',
  'Zhemgang',
];

const LIVE_STATUSES = ['CONFIRMED', 'ACTIVE'];
const DAY = 86_400_000;

/* ----------------------------------------------------------------------- */
/* Helpers                                                                  */
/* ----------------------------------------------------------------------- */

function getInitials(name?: string) {
  if (!name) return 'PR';
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

function contractProgress(b: any): Progress {
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

function resolveDocumentUrl(rawPath?: string | null): string | null {
  if (!rawPath) return null;
  if (/^https?:\/\//i.test(rawPath)) return rawPath;
  const cleaned = rawPath.replace(/^\/+/, '');
  const baseUrl = api.defaults.baseURL || '';
  const apiBase = /^https?:\/\//i.test(baseUrl) ? baseUrl.replace(/\/api\/?$/, '') : window.location.origin;
  return `${apiBase}/${cleaned}`;
}

function nextDayIso(dateIso?: string): string {
  if (!dateIso) return new Date().toISOString().slice(0, 10);
  const clean = String(dateIso).slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return new Date().toISOString().slice(0, 10);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function isContractExpired(booking: any): boolean {
  if (booking.status === 'COMPLETED') return true;
  if (!booking.endDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return String(booking.endDate).slice(0, 10) < today && ['CONFIRMED', 'ACTIVE'].includes(booking.status);
}

/* ----------------------------------------------------------------------- */
/* Small presentational pieces                                              */
/* ----------------------------------------------------------------------- */

function StatusPill({ status, expired }: { status: string; expired: boolean }) {
  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600">
        EXPIRED
      </span>
    );
  }
  if (status === 'CONFIRMED' || status === 'ACTIVE') {
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
  onConfirm,
  onCancel,
  onRenew,
  onFindAnother,
}: {
  b: any;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onRenew: (b: any) => void;
  onFindAnother: () => void;
}) {
  const expired = isContractExpired(b);
  const live = LIVE_STATUSES.includes(b.status) && !expired;
  const p = LIVE_STATUSES.includes(b.status) ? contractProgress(b) : null;

  const cardSurface = live
    ? 'border-[#BFD3F5] bg-gradient-to-br from-[#F3F7FD] via-white to-[#EBF2FC]/60 hover:border-[#1A56B8]/50'
    : 'border-[#E2E8F4] bg-white hover:border-[#BFD3F5]';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`space-y-4 rounded-card border p-5 shadow-soft transition-all ${cardSurface}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
              live ? 'bg-[#1A56B8] text-white shadow-xs' : 'bg-[#E6EFFC] text-[#1A56B8]'
            }`}
          >
            {getInitials(b.caretakerName)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold text-slate-900">{b.caretakerName}</h3>
            <p className="text-xs text-slate-500">Child: {b.childName}</p>
          </div>
        </div>
        <StatusPill status={b.status} expired={expired} />
      </div>

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
          {b.durationMonths} months · {formatDisplayDate(b.startDate)}
          {b.endDate ? ` – ${formatDisplayDate(b.endDate)}` : ''}
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

        <div className="flex flex-wrap gap-2">
          {b.status === 'ACCEPTED' && (
            <Button size="sm" className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]" onClick={() => onConfirm(b.id)}>
              <CheckCircle2 className="h-4 w-4" /> Confirm
            </Button>
          )}
          {['PENDING', 'ACCEPTED'].includes(b.status) && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => onCancel(b.id)}>
              <XCircle className="h-4 w-4 text-danger" /> Cancel
            </Button>
          )}
          {expired && (
            <>
              <Button size="sm" className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]" onClick={() => onRenew(b)}>
                <RotateCcw className="h-4 w-4" /> Renew
              </Button>
              <Button size="sm" variant="outline" className="rounded-full border-[#C7D9F7] text-[#1A56B8] hover:bg-[#E6EFFC]" onClick={onFindAnother}>
                <UserSearch className="h-4 w-4" /> Find another
              </Button>
            </>
          )}
        </div>
      </div>

      {b.status === 'PENDING' && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Waiting for the caretaker to respond
        </p>
      )}
    </motion.article>
  );
}

/* ----------------------------------------------------------------------- */
/* Page                                                                     */
/* ----------------------------------------------------------------------- */

export function ParentDashboard() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [childrenList, setChildrenList] = useState<ChildProfile[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [caretakers, setCaretakers] = useState<CaretakerSummary[]>([]);
  const [loadingCaretakers, setLoadingCaretakers] = useState(false);

  const [activeSection, setActiveSection] = useState<SidebarSection>('OVERVIEW');
  const [contractFilter, setContractFilter] = useState<ContractFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDzongkhag, setSelectedDzongkhag] = useState('ALL');

  const [childModalOpen, setChildModalOpen] = useState(false);
  const [childToDelete, setChildToDelete] = useState<ChildProfile | null>(null);
  const [deletingChild, setDeletingChild] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [bookingCaretaker, setBookingCaretaker] = useState<CaretakerSummary | null>(null);
  const [isRenewalModal, setIsRenewalModal] = useState(false);
  const [docsCaretaker, setDocsCaretaker] = useState<CaretakerSummary | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [childName, setChildName] = useState('');
  const [childDob, setChildDob] = useState('');
  const [allergies, setAllergies] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [savingChild, setSavingChild] = useState(false);

  const [bookingChildId, setBookingChildId] = useState('');
  const [bookingStartDate, setBookingStartDate] = useState('');
  const [bookingMonths, setBookingMonths] = useState(6);
  const [billingArrangement, setBillingArrangement] = useState<'MONTHLY_INSTALLMENT' | 'QUARTERLY_INSTALLMENT'>(
    'MONTHLY_INSTALLMENT'
  );
  const [bookingNotes, setBookingNotes] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const loadAll = async () => {
    try {
      const [bRes, cRes, nRes] = await Promise.all([
        api.get('/bookings'),
        api.get('/parents/children'),
        api.get('/notifications'),
      ]);
      const loadedChildren: ChildProfile[] = cRes.data.children || [];
      setBookings(bRes.data.bookings || []);
      setChildrenList(loadedChildren);
      setNotifications(nRes.data.notifications || []);
      if (loadedChildren.length > 0 && !bookingChildId) {
        setBookingChildId(loadedChildren[0].id);
      }
    } finally {
      setLoaded(true);
    }
  };

  const loadCaretakers = async () => {
    setLoadingCaretakers(true);
    try {
      const params: Record<string, string> = {};
      if (selectedDzongkhag !== 'ALL') params.dzongkhag = selectedDzongkhag;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      const { data } = await api.get('/caretakers', { params });
      setCaretakers(data.caretakers || []);
    } finally {
      setLoadingCaretakers(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (activeSection === 'FIND_CARETAKERS') {
      loadCaretakers();
    }
  }, [activeSection, selectedDzongkhag, searchQuery]);

  const avatarUrlRaw: string | null = user?.avatarUrl || null;
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
      setMessage('Profile picture updated successfully.');
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
    setMessage(null);
    try {
      await api
        .delete('/auth/me/avatar')
        .catch(() => api.patch('/auth/me/avatar', { removeAvatar: true, avatarUrl: null }));
      await refreshUser();
      setMessage('Profile picture removed.');
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Unable to remove profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  // =========================================================================
  // CHILD, BOOKING HANDLERS
  // =========================================================================
  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChild(true);
    try {
      await api.post('/parents/children', {
        fullName: childName,
        dateOfBirth: childDob,
        allergies,
        specialInstructions,
      });
      setChildName('');
      setChildDob('');
      setAllergies('');
      setSpecialInstructions('');
      setChildModalOpen(false);
      setMessage('Encrypted child profile added.');
      await loadAll();
    } finally {
      setSavingChild(false);
    }
  };

  const handleDeleteChild = async () => {
    if (!childToDelete) return;

    const hasActiveContract = bookings.some(
      (b: any) =>
        (b.childId === childToDelete.id || b.childName === childToDelete.fullName) &&
        ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ACTIVE'].includes(b.status)
    );

    if (hasActiveContract) {
      setMessage(`Cannot delete ${childToDelete.fullName} while they have a pending or active contract.`);
      setChildToDelete(null);
      return;
    }

    setDeletingChild(true);
    try {
      await api.delete(`/parents/children/${childToDelete.id}`);
      if (bookingChildId === childToDelete.id) {
        setBookingChildId('');
      }
      setMessage(`Child profile for ${childToDelete.fullName} deleted.`);
      setChildToDelete(null);
      await loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to delete child profile.');
      setChildToDelete(null);
    } finally {
      setDeletingChild(false);
    }
  };

  const openBookingForCaretaker = (caretaker: CaretakerSummary) => {
    if (childrenList.length === 0) {
      setMessage('Please add a child profile first before requesting a caretaker.');
      setChildModalOpen(true);
      return;
    }
    setIsRenewalModal(false);
    setBookingChildId(childrenList[0].id);
    setBookingStartDate('');
    setBookingMonths(6);
    setBillingArrangement('MONTHLY_INSTALLMENT');
    setBookingNotes('');
    setAcceptedTerms(false);
    setBookingError(null);
    setBookingCaretaker(caretaker);
  };

  const openRenewalForContract = (contract: any) => {
    setIsRenewalModal(true);
    setBookingChildId(contract.childId || childrenList[0]?.id || '');
    setBookingStartDate(nextDayIso(contract.endDate));
    setBookingMonths(6);
    setBillingArrangement(contract.billingArrangement || 'MONTHLY_INSTALLMENT');
    setBookingNotes(`Renewal of previous 6-month childcare agreement.`);
    setAcceptedTerms(false);
    setBookingError(null);
    setBookingCaretaker({
      id: contract.caretakerId,
      fullName: contract.caretakerName,
      dzongkhag: contract.caretakerDzongkhag || 'Thimphu',
      yearsExperience: Number(contract.caretakerYearsExperience || 2),
      qualifications: contract.caretakerQualifications || 'Verified Caretaker',
      skills: [],
      languages: ['Dzongkha', 'English'],
      monthlyRateBtn: Number(contract.caretakerCurrentRateBtn ?? contract.agreedMonthlyRateBtn ?? 15000),
      avgRating: 5,
      totalReviews: 1,
      isAvailable: true,
    });
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingCaretaker) return;
    setBookingError(null);

    if (!acceptedTerms) {
      setBookingError('You must read and accept the 6-month Terms & Conditions.');
      return;
    }

    setSubmittingBooking(true);
    try {
      await api.post('/bookings', {
        caretakerId: bookingCaretaker.id,
        childId: bookingChildId,
        startDate: bookingStartDate,
        durationMonths: bookingMonths,
        billingArrangement,
        parentNotes: bookingNotes.trim() || undefined,
        acceptedTerms: true,
      });
      setBookingCaretaker(null);
      setAcceptedTerms(false);
      setActiveSection('OVERVIEW');
      setMessage(
        isRenewalModal
          ? `Contract renewal request sent to ${bookingCaretaker.fullName}.`
          : `6-month childcare request sent to ${bookingCaretaker.fullName}.`
      );
      await loadAll();
    } catch (err: any) {
      const rawMessage = err?.response?.data?.message;
      let cleanMessage =
        err?.response?.data?.errors?.[0]?.message || 'Unable to submit booking request. Please verify all fields.';

      if (typeof rawMessage === 'string') {
        try {
          const parsed = JSON.parse(rawMessage);
          if (Array.isArray(parsed) && parsed[0]?.message) {
            cleanMessage = parsed[0].message;
          } else {
            cleanMessage = rawMessage;
          }
        } catch {
          cleanMessage = rawMessage;
        }
      }

      setBookingError(cleanMessage);
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleBookingAction = async (bookingId: string, status: 'CONFIRMED' | 'CANCELLED') => {
    try {
      await api.patch(`/bookings/${bookingId}/status`, { status });
      setMessage(
        status === 'CONFIRMED'
          ? 'Contract confirmed! Your 6-month childcare agreement is active.'
          : 'Booking request cancelled.'
      );
      await loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to update contract status.');
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
  const activeContractsCount = useMemo(
    () => bookings.filter((b) => LIVE_STATUSES.includes(b.status) && !isContractExpired(b)).length,
    [bookings]
  );
  const pendingContractsCount = useMemo(
    () => bookings.filter((b) => ['PENDING', 'ACCEPTED'].includes(b.status)).length,
    [bookings]
  );
  const completedContractsCount = useMemo(() => bookings.filter((b) => isContractExpired(b)).length, [bookings]);
  const unreadNotifsCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const acceptedBookings = useMemo(() => bookings.filter((b) => b.status === 'ACCEPTED'), [bookings]);
  const expiredBookings = useMemo(() => bookings.filter((b) => isContractExpired(b)), [bookings]);

  const spend = useMemo(() => {
    const today = new Date();
    const monthStart = Date.UTC(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = Date.UTC(today.getFullYear(), today.getMonth() + 1, 0);
    const now = todayUtc();
    const paying = bookings.filter((b) => LIVE_STATUSES.includes(b.status));
    return {
      thisMonth: paying
        .filter((b) => toUtc(b.startDate) <= monthEnd && toUtc(b.endDate) >= monthStart)
        .reduce((sum, b) => sum + Number(b.agreedMonthlyRateBtn || 0), 0),
      committed: paying
        .filter((b) => toUtc(b.endDate) >= now)
        .reduce((sum, b) => sum + Number(b.estimatedTotalBtn || 0), 0),
      contracts: paying.filter((b) => toUtc(b.endDate) >= now).length,
    };
  }, [bookings]);

  const upcomingStarts = useMemo(() => {
    const now = todayUtc();
    return bookings
      .filter(
        (b) => LIVE_STATUSES.includes(b.status) && toUtc(b.startDate) >= now && toUtc(b.startDate) - now <= 30 * DAY
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [bookings]);

  const canCreateNewRequest = useMemo(() => {
    if (childrenList.length === 0) return false;

    const RENEWAL_WINDOW_DAYS = 30;
    const windowLimit = new Date();
    windowLimit.setDate(windowLimit.getDate() + RENEWAL_WINDOW_DAYS);
    const windowLimitIso = windowLimit.toISOString().slice(0, 10);

    return childrenList.some((child) => {
      const childBookings = bookings.filter(
        (b: any) =>
          (b.childId === child.id || b.childName === child.fullName) &&
          ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ACTIVE'].includes(b.status)
      );

      if (childBookings.length === 0) return true;
      if (childBookings.some((b) => ['PENDING', 'ACCEPTED'].includes(b.status))) return false;

      return childBookings.every((b: any) => {
        if (!b.endDate) return false;
        const endIso = String(b.endDate).slice(0, 10);
        return endIso <= windowLimitIso;
      });
    });
  }, [childrenList, bookings]);

  const matchesSearch = (b: BookingRecord) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      b.caretakerName.toLowerCase().includes(q) ||
      b.childName.toLowerCase().includes(q) ||
      b.status.toLowerCase().includes(q)
    );
  };

  const overviewContracts = useMemo(
    () =>
      bookings
        .filter((b) => b.status !== 'ACCEPTED' && matchesSearch(b))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, searchQuery]
  );

  const filteredBookings = useMemo(
    () =>
      bookings
        .filter((b) => {
          const expired = isContractExpired(b);
          if (contractFilter === 'PENDING' && !['PENDING', 'ACCEPTED'].includes(b.status)) return false;
          if (contractFilter === 'CONFIRMED' && (!LIVE_STATUSES.includes(b.status) || expired)) return false;
          if (contractFilter === 'COMPLETED' && !expired) return false;
          return matchesSearch(b);
        })
        .sort(
          (a, b) =>
            (a.status === 'ACCEPTED' ? -1 : 0) - (b.status === 'ACCEPTED' ? -1 : 0) ||
            b.startDate.localeCompare(a.startDate)
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, contractFilter, searchQuery]
  );

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFE] text-sm text-slate-500">
        Loading your family workspace...
      </div>
    );
  }

  const avatarSrc = avatarFailed ? null : avatarUrlRaw;
  const displayName = user?.fullName || 'Parent';
  const firstName = displayName.split(' ')[0];

  const checklist = [
    { label: 'Add a profile photo', done: !!avatarSrc },
    { label: 'Add a child profile', done: childrenList.length > 0 },
    { label: 'Request a caretaker', done: bookings.length > 0 },
    {
      label: 'Confirm your first contract',
      done: bookings.some((b) => ['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(b.status)),
    },
  ];
  const completeness = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);
  const nextTodo = checklist.find((c) => !c.done);

  const navItems: { id: SidebarSection; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'OVERVIEW', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'FIND_CARETAKERS', label: 'Find Caretakers', icon: <UserSearch className="h-4 w-4" /> },
    { id: 'CONTRACTS', label: 'Contracts', icon: <FileCheck2 className="h-4 w-4" />, badge: bookings.length || undefined },
    { id: 'CHILDREN', label: 'Child Profiles', icon: <Baby className="h-4 w-4" />, badge: childrenList.length || undefined },
    { id: 'NOTIFICATIONS', label: 'Notifications', icon: <Bell className="h-4 w-4" />, badge: unreadNotifsCount || undefined },
  ];

  const estimatedContractTotal = bookingCaretaker ? bookingCaretaker.monthlyRateBtn * bookingMonths : 0;

  const parentCidUrl = resolveDocumentUrl(docsCaretaker?.idDocumentPath);
  const isParentCidPdf = Boolean(parentCidUrl && parentCidUrl.toLowerCase().endsWith('.pdf'));
  const parentCertUrl = resolveDocumentUrl(docsCaretaker?.certificateDocumentPath);
  const isParentCertPdf = Boolean(parentCertUrl && parentCertUrl.toLowerCase().endsWith('.pdf'));

  /* ---- reusable blocks ------------------------------------------------- */

  const activityFeed = (limit?: number) => {
    const items = limit ? notifications.slice(0, limit) : notifications;
    return (
      <div className="space-y-1">
        {items.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">Nothing yet. Updates about your requests and contracts will show up here.</p>
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
                      <span className={`truncate text-sm ${n.isRead ? 'font-medium text-slate-600' : 'font-semibold text-slate-900'}`}>
                        {n.title}
                      </span>
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

  const setupCard = (
    <section className="rounded-card border border-[#E2E8F4] bg-[#F3F7FD]/70 p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="relative">
          <ProgressRing pct={completeness} />
          <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-semibold text-[#1A56B8]">
            {completeness}%
          </span>
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-slate-900">Household setup</h3>
          <p className="text-xs text-slate-500">
            {nextTodo ? `Next: ${nextTodo.label.toLowerCase()}` : 'You are all set up.'}
          </p>
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
      {completeness < 100 && (
        <Button
          size="sm"
          variant="outline"
          className="mt-4 w-full rounded-full border-[#C7D9F7] bg-white text-[#1A56B8] hover:bg-[#E6EFFC]"
          onClick={() => {
            if (!checklist[1].done) setChildModalOpen(true);
            else if (!checklist[2].done) setActiveSection('FIND_CARETAKERS');
            else if (!checklist[3].done) {
              setContractFilter('ALL');
              setActiveSection('CONTRACTS');
            } else fileInputRef.current?.click();
          }}
        >
          Continue setup <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </section>
  );

  const renderContractCard = (b: any) => (
    <ContractCard
      key={b.id}
      b={b}
      onConfirm={(id) => handleBookingAction(id, 'CONFIRMED')}
      onCancel={(id) => handleBookingAction(id, 'CANCELLED')}
      onRenew={openRenewalForContract}
      onFindAnother={() => setActiveSection('FIND_CARETAKERS')}
    />
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
                    <p className="truncate text-xs text-blue-100/80">NestWell.BT • Parent</p>
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

            <nav
              aria-label="Parent dashboard sections"
              className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
            >
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'CONTRACTS') setContractFilter('ALL');
                      setActiveSection(item.id);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex shrink-0 items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
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
                          isActive ? 'bg-white text-[#1A56B8]' : 'bg-white/15 text-white'
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

          <div className="hidden space-y-3 pt-4 lg:block">
            <div className="space-y-2.5 rounded-2xl border border-white/15 bg-[#134291]/70 p-4 text-white">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-white">
                  <ShieldCheck className="h-4 w-4 text-blue-200" /> Verified Care
                </span>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">6+ Mos</span>
              </div>
              <p className="text-[11px] leading-relaxed text-blue-100/80">
                All caretakers are CID & certificate screened for stable 6+ month family placements.
              </p>
              <button
                type="button"
                onClick={() => setActiveSection('FIND_CARETAKERS')}
                className="block w-full rounded-full bg-white py-2 text-center text-xs font-semibold text-[#1A56B8] shadow-sm transition-colors hover:bg-blue-50"
              >
                Find Caretakers
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
                  {new Date().toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
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
                      activeSection === 'FIND_CARETAKERS' ? 'Search name, skill, qualification...' : 'Search caretaker or child...'
                    }
                    aria-label="Search"
                    className="w-60 rounded-full border border-[#E2E8F4] bg-[#F3F7FD] py-2 pl-9 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#1A56B8] focus:bg-white focus:outline-none focus:shadow-focus"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-[#C7D9F7] bg-[#F3F7FD] text-[#1A56B8] hover:bg-[#E6EFFC]"
                  onClick={() => setChildModalOpen(true)}
                >
                  <Plus className="h-4 w-4" /> Add child
                </Button>

                <Button
                  size="sm"
                  className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]"
                  onClick={() => setActiveSection('FIND_CARETAKERS')}
                >
                  <Search className="h-4 w-4" /> Find caretakers
                </Button>
              </div>
            </header>

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

            {/* ============================ OVERVIEW ============================ */}
            <AnimatePresence mode="wait">
              {activeSection === 'OVERVIEW' && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {/* 1. Care cost this month -> Contracts */}
                    <button
                      type="button"
                      onClick={() => {
                        setContractFilter('ALL');
                        setActiveSection('CONTRACTS');
                      }}
                      className="flex flex-col justify-between gap-3 rounded-card bg-gradient-to-br from-[#1A56B8] to-[#154698] p-5 text-left text-white shadow-card transition-all hover:brightness-105"
                    >
                      <p className="text-xs font-medium text-blue-100">Care cost this month</p>
                      <p className="font-display text-3xl font-semibold tracking-tight">{formatBtn(spend.thisMonth)}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-blue-100">
                        <Wallet className="h-3.5 w-3.5" /> {formatBtn(spend.committed)} committed over{' '}
                        {plural(spend.contracts, 'contract')}
                      </p>
                    </button>

                    {/* 2. Active contracts -> Contracts filtered to CONFIRMED/ACTIVE */}
                    <button
                      type="button"
                      onClick={() => {
                        setContractFilter('CONFIRMED');
                        setActiveSection('CONTRACTS');
                      }}
                      className="flex flex-col justify-between gap-3 rounded-card border border-[#E2E8F4] bg-[#F3F7FD] p-5 text-left transition-all hover:border-[#BFD3F5] hover:bg-[#EBF2FC]"
                    >
                      <p className="text-xs font-medium text-slate-500">Active contracts</p>
                      <p className="font-display text-3xl font-semibold text-slate-900">{activeContractsCount}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#1A56B8]" />
                        {upcomingStarts.length
                          ? `${plural(upcomingStarts.length, 'start')} in the next 30 days`
                          : 'View active placements →'}
                      </p>
                    </button>

                    {/* 3. Awaiting you / caretaker -> Contracts filtered to PENDING/ACCEPTED */}
                    <button
                      type="button"
                      onClick={() => {
                        setContractFilter('PENDING');
                        setActiveSection('CONTRACTS');
                      }}
                      className="flex flex-col justify-between gap-3 rounded-card border border-[#E2E8F4] bg-[#F3F7FD] p-5 text-left transition-all hover:border-[#BFD3F5] hover:bg-[#EBF2FC]"
                    >
                      <p className="text-xs font-medium text-slate-500">Awaiting you / caretaker</p>
                      <p className="font-display text-3xl font-semibold text-slate-900">{pendingContractsCount}</p>
                      <p
                        className={`flex items-center gap-1.5 text-[11px] ${
                          acceptedBookings.length ? 'font-semibold text-amber-600' : 'text-slate-600'
                        }`}
                      >
                        <Inbox className="h-3.5 w-3.5 text-[#1A56B8]" />
                        {acceptedBookings.length
                          ? `${plural(acceptedBookings.length, 'contract')} ready to confirm →`
                          : 'View pending requests →'}
                      </p>
                    </button>

                    {/* 4. Registered children -> Child Profiles */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('CHILDREN')}
                      className="flex flex-col justify-between gap-3 rounded-card border border-[#E2E8F4] bg-[#F3F7FD] p-5 text-left transition-all hover:border-[#BFD3F5] hover:bg-[#EBF2FC]"
                    >
                      <p className="text-xs font-medium text-slate-500">Registered children</p>
                      <p className="font-display text-3xl font-semibold text-slate-900">{childrenList.length}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <Baby className="h-3.5 w-3.5 text-[#1A56B8]" /> View & manage child profiles →
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
                          {acceptedBookings.length > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                              {plural(acceptedBookings.length, 'contract')} to confirm
                            </span>
                          )}
                        </div>

                        {acceptedBookings.length === 0 && upcomingStarts.length === 0 && expiredBookings.length === 0 && (
                          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                            <CheckCircle2 className="h-4 w-4 text-[#1A56B8]" aria-hidden /> Nothing waiting. Accepted contracts
                            and renewals will appear here.
                          </p>
                        )}

                        <ul className="mt-3 divide-y divide-[#E8EFFB]">
                          <AnimatePresence initial={false}>
                            {acceptedBookings.filter(matchesSearch).map((b: any) => (
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
                                    {b.caretakerName}{' '}
                                    <span className="font-normal text-slate-500">accepted · child {b.childName}</span>
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {plural(b.durationMonths, 'month')} from {formatDisplayDate(b.startDate)} ·{' '}
                                    {formatBtn(b.agreedMonthlyRateBtn)}/mo · {formatBtn(b.estimatedTotalBtn)} total
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleBookingAction(b.id, 'CANCELLED')}>
                                    <X className="h-4 w-4" /> Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]"
                                    onClick={() => handleBookingAction(b.id, 'CONFIRMED')}
                                  >
                                    <Check className="h-4 w-4" /> Confirm
                                  </Button>
                                </div>
                              </motion.li>
                            ))}
                          </AnimatePresence>

                          {expiredBookings.filter(matchesSearch).map((b: any) => (
                            <li key={`renew-${b.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-[#F3F7FD] text-slate-500">
                                  <RotateCcw className="h-4 w-4" aria-hidden />
                                </span>
                                <p className="min-w-0 text-sm text-slate-800">
                                  <strong className="font-semibold">Contract ended</strong>
                                  <span className="text-slate-500">
                                    {' '}
                                    · {b.caretakerName}, child {b.childName} ({formatDisplayDate(b.endDate)})
                                  </span>
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]"
                                  onClick={() => openRenewalForContract(b)}
                                >
                                  <RotateCcw className="h-4 w-4" /> Renew
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full border-[#C7D9F7] text-[#1A56B8] hover:bg-[#E6EFFC]"
                                  onClick={() => setActiveSection('FIND_CARETAKERS')}
                                >
                                  <UserSearch className="h-4 w-4" /> Find another
                                </Button>
                              </div>
                            </li>
                          ))}

                          {upcomingStarts.map((b: any) => {
                            const days = Math.round((toUtc(b.startDate) - todayUtc()) / DAY);
                            return (
                              <li key={`start-${b.id}`} className="flex items-center gap-3 py-3.5 text-sm">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-[#E6EFFC] text-[#1A56B8]">
                                  <Calendar className="h-4 w-4" aria-hidden />
                                </span>
                                <span className="text-slate-800">
                                  <strong className="font-semibold text-[#1A56B8]">
                                    {days === 0 ? 'Starts today' : `Starts in ${plural(days, 'day')}`}
                                  </strong>
                                  <span className="text-slate-500">
                                    {' '}
                                    · {b.caretakerName}, child {b.childName} ({formatDisplayDate(b.startDate)})
                                  </span>
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
                              setContractFilter('ALL');
                              setActiveSection('CONTRACTS');
                            }}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-[#1A56B8] hover:underline"
                          >
                            All contracts <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>
                        {overviewContracts.length === 0 ? (
                          <div className="rounded-card border border-dashed border-[#C7D9F7] bg-[#F3F7FD]/60 p-8 text-center text-sm text-slate-500">
                            No contracts yet. Browse verified caretakers to request a 6-month care placement.
                          </div>
                        ) : (
                          <div className="grid gap-4 2xl:grid-cols-2">{overviewContracts.map(renderContractCard)}</div>
                        )}
                      </section>
                    </div>

                    <div className="space-y-6 xl:col-span-4">
                      <section className="rounded-card border border-[#E2E8F4] bg-white p-5 shadow-soft">
                        <div className="mb-2 flex items-center justify-between">
                          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
                            Activity
                            {unreadNotifsCount > 0 && (
                              <span className="rounded-full bg-[#1A56B8] px-2 py-0.5 text-[11px] font-semibold text-white">
                                {unreadNotifsCount}
                              </span>
                            )}
                          </h2>
                          <button
                            type="button"
                            onClick={() => setActiveSection('NOTIFICATIONS')}
                            className="text-sm font-semibold text-[#1A56B8] hover:underline"
                          >
                            See all
                          </button>
                        </div>
                        {activityFeed(5)}
                      </section>
                      {setupCard}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ========================= FIND CARETAKERS ======================== */}
              {activeSection === 'FIND_CARETAKERS' && (
                <motion.section
                  key="find-caretakers"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <label htmlFor="dzongkhag-filter" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <MapPin className="h-3.5 w-3.5 text-[#1A56B8]" />
                        Dzongkhag:
                      </label>
                      <select
                        id="dzongkhag-filter"
                        value={selectedDzongkhag}
                        onChange={(e) => setSelectedDzongkhag(e.target.value)}
                        className="rounded-full border border-[#E2E8F4] bg-[#F3F7FD] px-4 py-2 text-xs font-medium text-slate-800 focus:border-[#1A56B8] focus:bg-white focus:outline-none focus:shadow-focus"
                      >
                        {DZONGKHAG_OPTIONS.map((dz) => (
                          <option key={dz} value={dz}>
                            {dz === 'ALL' ? 'All Dzongkhags' : dz}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => setActiveSection('OVERVIEW')}>
                      Back to dashboard
                    </Button>
                  </div>

                  {loadingCaretakers ? (
                    <div className="rounded-card border border-[#E2E8F4] bg-[#F3F7FD] p-10 text-center text-sm text-slate-500">
                      Loading verified caretakers...
                    </div>
                  ) : caretakers.length === 0 ? (
                    <div className="space-y-2 rounded-card border border-dashed border-[#C7D9F7] bg-[#F3F7FD]/60 p-10 text-center">
                      <p className="font-display text-lg font-semibold text-slate-900">No verified caretakers matched your filter</p>
                      <p className="text-sm text-slate-500">Try clearing your search or switching to All Dzongkhags.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                      {caretakers.map((c) => (
                        <article
                          key={c.id}
                          className="flex flex-col justify-between space-y-5 rounded-card border border-[#E2E8F4] bg-white p-5 shadow-soft transition-all hover:border-[#BFD3F5]"
                        >
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                {c.avatarUrl ? (
                                  <img
                                    src={c.avatarUrl}
                                    alt={c.fullName}
                                    className="h-12 w-12 shrink-0 rounded-xl border border-[#E2E8F4] object-cover"
                                  />
                                ) : (
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E6EFFC] text-sm font-semibold text-[#1A56B8]">
                                    {getInitials(c.fullName)}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <h3 className="truncate font-display text-lg font-semibold text-slate-900">{c.fullName}</h3>
                                  <p className="flex items-center gap-1 text-xs text-slate-500">
                                    <MapPin className="h-3 w-3 text-[#1A56B8]" />
                                    {c.dzongkhag} • {c.yearsExperience} yrs exp
                                  </p>
                                </div>
                              </div>
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#BFD3F5] bg-[#E6EFFC] px-2.5 py-0.5 text-[11px] font-semibold text-[#1A56B8]">
                                <ShieldCheck className="h-3.5 w-3.5" /> Verified
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                {c.avgRating > 0 ? c.avgRating.toFixed(1) : 'New'}
                              </span>
                              <span>•</span>
                              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                                <Award className="h-3.5 w-3.5 shrink-0 text-[#1A56B8]" />
                                <span className="truncate">{c.qualifications}</span>
                              </span>
                            </div>

                            {c.bio && <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{c.bio}</p>}

                            {Array.isArray(c.skills) && c.skills.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {c.skills.slice(0, 4).map((skill) => (
                                  <span
                                    key={skill}
                                    className="rounded-full bg-[#F3F7FD] px-2.5 py-1 text-[11px] font-medium text-slate-600"
                                  >
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-3 border-t border-[#E8EFFB] pt-4">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-[11px] text-slate-500">Monthly rate</p>
                                <p className="font-display text-lg font-semibold text-slate-900">
                                  {formatBtn(c.monthlyRateBtn)}
                                  <span className="text-xs font-normal text-slate-500">/mo</span>
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => setDocsCaretaker(c)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-[#C7D9F7] bg-[#F3F7FD] px-3 py-1.5 text-xs font-medium text-[#1A56B8] transition-colors hover:bg-[#E6EFFC]"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                CID & Certificate
                              </button>
                            </div>

                            <Button
                              size="sm"
                              className="w-full rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]"
                              onClick={() => openBookingForCaretaker(c)}
                            >
                              Request 6-month care
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </motion.section>
              )}

              {/* ============================ CONTRACTS =========================== */}
              {activeSection === 'CONTRACTS' && (
                <motion.section
                  key="contracts"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'ALL', label: `All (${bookings.length})` },
                          { id: 'PENDING', label: `Pending (${pendingContractsCount})` },
                          { id: 'CONFIRMED', label: `Active (${activeContractsCount})` },
                          { id: 'COMPLETED', label: `Expired (${completedContractsCount})` },
                        ] as { id: ContractFilter; label: string }[]
                      ).map((pill) => (
                        <button
                          key={pill.id}
                          type="button"
                          onClick={() => setContractFilter(pill.id)}
                          aria-pressed={contractFilter === pill.id}
                          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                            contractFilter === pill.id
                              ? 'bg-[#1A56B8] text-white shadow-soft'
                              : 'border border-[#E2E8F4] bg-[#F3F7FD] text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {pill.label}
                        </button>
                      ))}
                    </div>

                    {canCreateNewRequest && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-[#C7D9F7] bg-[#F3F7FD] text-[#1A56B8] hover:bg-[#E6EFFC]"
                        onClick={() => setActiveSection('FIND_CARETAKERS')}
                      >
                        <Plus className="h-4 w-4" /> New 6-month request
                      </Button>
                    )}
                  </div>

                  {filteredBookings.length === 0 ? (
                    <div className="rounded-card border border-dashed border-[#C7D9F7] bg-[#F3F7FD]/60 p-10 text-center text-sm text-slate-500">
                      {bookings.length === 0
                        ? 'No childcare contracts yet. Browse verified caretakers to get started.'
                        : 'No contracts match this filter.'}
                    </div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">{filteredBookings.map(renderContractCard)}</div>
                  )}
                </motion.section>
              )}

              {/* ============================ CHILDREN ============================ */}
              {activeSection === 'CHILDREN' && (
                <motion.div
                  key="children"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="grid items-start gap-6 xl:grid-cols-12"
                >
                  <section className="space-y-4 rounded-card border border-[#E2E8F4] bg-white p-6 shadow-soft xl:col-span-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-xl font-semibold text-slate-900">Child profiles</h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Encrypted dietary, allergy and routine notes, shared only with your confirmed caretaker.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-[#C7D9F7] bg-[#F3F7FD] text-[#1A56B8] hover:bg-[#E6EFFC]"
                        onClick={() => setChildModalOpen(true)}
                      >
                        <Plus className="h-4 w-4" /> Add child
                      </Button>
                    </div>

                    {childrenList.length === 0 ? (
                      <div className="rounded-card border border-dashed border-[#C7D9F7] bg-[#F3F7FD]/60 p-8 text-center text-sm text-slate-500">
                        No child profiles yet. Add one before sending a 6-month caretaker request.
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {childrenList.map((child) => (
                          <div
                            key={child.id}
                            className="space-y-2 rounded-card border border-[#E2E8F4] bg-[#F3F7FD] p-4 transition-colors hover:border-[#BFD3F5]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-display text-base font-semibold text-slate-900">{child.fullName}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#1A56B8] shadow-xs">
                                  DOB: {formatDisplayDate(child.dateOfBirth)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setChildToDelete(child)}
                                  title={`Delete ${child.fullName}`}
                                  aria-label={`Delete ${child.fullName}`}
                                  className="rounded-control p-1 text-slate-400 transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:shadow-focus"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-slate-600">
                              <span className="font-semibold text-slate-800">Allergies:</span> {child.allergies || 'None reported'}
                            </p>
                            {child.specialInstructions && (
                              <p className="text-xs text-slate-600">
                                <span className="font-semibold text-slate-800">Care notes:</span> {child.specialInstructions}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <div className="space-y-6 xl:col-span-4">{setupCard}</div>
                </motion.div>
              )}

              {/* =========================== NOTIFICATIONS ======================== */}
              {activeSection === 'NOTIFICATIONS' && (
                <motion.section
                  key="notifications"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
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
      {/* CID & CERTIFICATE MODAL                                           */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(docsCaretaker)}
        onClose={() => setDocsCaretaker(null)}
        title={`Verified Credentials — ${docsCaretaker?.fullName || ''}`}
        subtitle={`${docsCaretaker?.dzongkhag || ''} • ${docsCaretaker?.qualifications || ''}`}
      >
        {docsCaretaker && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F3F7FD] p-3.5 text-xs">
              <div>
                <p className="text-slate-500">Qualifications & Experience</p>
                <p className="mt-0.5 font-semibold text-slate-900">
                  {docsCaretaker.qualifications} • {docsCaretaker.yearsExperience} yrs
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-[#BFD3F5] bg-[#E6EFFC] px-2.5 py-0.5 text-[11px] font-semibold text-[#1A56B8]">
                Admin Screened & Verified
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-900">1. Citizenship ID (CID)</p>
                {parentCidUrl ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-[#E2E8F4] bg-[#F3F7FD]">
                      {isParentCidPdf ? (
                        <iframe src={parentCidUrl} title="Caretaker Citizenship ID PDF" className="h-[250px] w-full" />
                      ) : (
                        <img
                          src={parentCidUrl}
                          alt={`${docsCaretaker.fullName} Citizenship ID`}
                          className="h-[250px] w-full bg-slate-950/5 object-contain"
                        />
                      )}
                    </div>
                    <a
                      href={parentCidUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A56B8] hover:underline"
                    >
                      Open CID full size <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                ) : (
                  <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-xs text-slate-800">
                    CID document preview not available.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-900">2. Institution Certificate</p>
                {parentCertUrl ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-[#E2E8F4] bg-[#F3F7FD]">
                      {isParentCertPdf ? (
                        <iframe src={parentCertUrl} title="Institution Certificate PDF" className="h-[250px] w-full" />
                      ) : (
                        <img
                          src={parentCertUrl}
                          alt={`${docsCaretaker.fullName} Institution Certificate`}
                          className="h-[250px] w-full bg-slate-950/5 object-contain"
                        />
                      )}
                    </div>
                    <a
                      href={parentCertUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A56B8] hover:underline"
                    >
                      Open Certificate full size <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                ) : (
                  <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-xs text-slate-800">
                    Institution certificate preview not available.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E8EFFB] pt-3">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDocsCaretaker(null)}>
                Close
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]"
                onClick={() => {
                  const target = docsCaretaker;
                  setDocsCaretaker(null);
                  openBookingForCaretaker(target);
                }}
              >
                Request 6-month care
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* ADD CHILD MODAL                                                   */}
      {/* ================================================================= */}
      <Modal
        isOpen={childModalOpen}
        onClose={() => setChildModalOpen(false)}
        title="Add Encrypted Child Profile"
        subtitle="Only caretakers assigned to your confirmed contracts can view these details."
      >
        <form onSubmit={handleAddChild} className="space-y-4">
          <Input
            label="Child's Full Name"
            required
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="e.g. Kinley Wangmo"
          />

          <Input
            label="Date of Birth"
            type="date"
            required
            value={childDob}
            onChange={(e) => setChildDob(e.target.value)}
          />

          <Input
            label="Allergies / Medical Notes (Optional)"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            placeholder="e.g. Peanut allergy, lactose sensitivity"
          />

          <div>
            <label htmlFor="special-instructions" className="mb-1.5 block text-sm font-semibold text-slate-900">
              Daily Routine & Special Instructions (Optional)
            </label>
            <textarea
              id="special-instructions"
              rows={3}
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Nap schedule, feeding preferences, emergency contact..."
              className="w-full rounded-control border border-[#E2E8F4] bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1A56B8] focus:outline-none focus:shadow-focus"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setChildModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]" isLoading={savingChild}>
              Save Child Profile
            </Button>
          </div>
        </form>
      </Modal>

      {/* ================================================================= */}
      {/* DELETE CHILD CONFIRMATION MODAL                                   */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(childToDelete)}
        onClose={() => !deletingChild && setChildToDelete(null)}
        title="Delete Child Profile?"
        subtitle="This will permanently remove the child's encrypted records."
      >
        {childToDelete && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-slate-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p className="leading-relaxed">
                Are you sure you want to delete <strong>{childToDelete.fullName}</strong>? All allergy notes and care
                instructions will be permanently erased and cannot be recovered.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" className="rounded-full" disabled={deletingChild} onClick={() => setChildToDelete(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                isLoading={deletingChild}
                onClick={handleDeleteChild}
                className="rounded-full bg-danger text-white hover:bg-danger/90"
              >
                Delete Profile
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* BOOKING / RENEWAL MODAL                                           */}
      {/* ================================================================= */}
      <Modal
        isOpen={Boolean(bookingCaretaker)}
        onClose={() => setBookingCaretaker(null)}
        title={
          isRenewalModal
            ? `Renew 6-Month Contract — ${bookingCaretaker?.fullName || ''}`
            : `Request 6-Month Care — ${bookingCaretaker?.fullName || ''}`
        }
        subtitle={`Minimum 6-month structured childcare agreement • ${
          bookingCaretaker ? formatBtn(bookingCaretaker.monthlyRateBtn) : ''
        }/mo`}
      >
        {bookingCaretaker && (
          <form onSubmit={handleSubmitBooking} className="space-y-4">
            {bookingError && (
              <div className="flex items-start gap-2.5 rounded-card border border-danger/35 bg-danger/10 px-4 py-3 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <span>{bookingError}</span>
              </div>
            )}

            <div>
              <label htmlFor="booking-child" className="mb-1.5 block text-sm font-semibold text-slate-900">
                Select Child Profile
              </label>
              <select
                id="booking-child"
                required
                value={bookingChildId}
                onChange={(e) => setBookingChildId(e.target.value)}
                className="w-full rounded-control border border-[#E2E8F4] bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1A56B8] focus:outline-none focus:shadow-focus"
              >
                {childrenList.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="booking-start" className="mb-1.5 block text-sm font-semibold text-slate-900">
                  Start Date
                </label>
                <input
                  id="booking-start"
                  type="date"
                  required
                  value={bookingStartDate}
                  onChange={(e) => setBookingStartDate(e.target.value)}
                  className="w-full rounded-control border border-[#E2E8F4] bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1A56B8] focus:outline-none focus:shadow-focus"
                />
              </div>

              <div>
                <label htmlFor="booking-months" className="mb-1.5 block text-sm font-semibold text-slate-900">
                  Duration (Min. 6 Mos)
                </label>
                <select
                  id="booking-months"
                  value={bookingMonths}
                  onChange={(e) => setBookingMonths(Number(e.target.value))}
                  className="w-full rounded-control border border-[#E2E8F4] bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1A56B8] focus:outline-none focus:shadow-focus"
                >
                  <option value={6}>6 Months</option>
                  <option value={9}>9 Months</option>
                  <option value={12}>12 Months (1 Year)</option>
                  <option value={18}>18 Months</option>
                  <option value={24}>24 Months (2 Years)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="booking-billing" className="mb-1.5 block text-sm font-semibold text-slate-900">
                Billing Arrangement
              </label>
              <select
                id="booking-billing"
                value={billingArrangement}
                onChange={(e) => setBillingArrangement(e.target.value as 'MONTHLY_INSTALLMENT' | 'QUARTERLY_INSTALLMENT')}
                className="w-full rounded-control border border-[#E2E8F4] bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1A56B8] focus:outline-none focus:shadow-focus"
              >
                <option value="MONTHLY_INSTALLMENT">
                  Monthly Installment ({formatBtn(bookingCaretaker.monthlyRateBtn)}/mo)
                </option>
                <option value="QUARTERLY_INSTALLMENT">
                  Quarterly Installment ({formatBtn(bookingCaretaker.monthlyRateBtn * 3)} every 3 mos)
                </option>
              </select>
            </div>

            <div>
              <label htmlFor="booking-notes" className="mb-1.5 block text-sm font-semibold text-slate-900">
                Notes for Caretaker (Optional)
              </label>
              <input
                id="booking-notes"
                type="text"
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                placeholder="Preferred arrival hours, school pickup details..."
                className="w-full rounded-control border border-[#E2E8F4] bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1A56B8] focus:outline-none focus:shadow-focus"
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-[#1A56B8] to-[#154698] px-4 py-3.5 text-white">
              <span className="text-xs text-blue-100">Estimated {bookingMonths}-Month Total</span>
              <span className="font-display text-lg font-semibold text-white">{formatBtn(estimatedContractTotal)}</span>
            </div>

            <label className="flex cursor-pointer select-none items-start gap-2.5 rounded-control border border-[#E2E8F4] bg-[#F3F7FD] p-3 text-xs text-slate-800">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#1A56B8]"
              />
              <span className="leading-relaxed text-slate-600">
                I have read and agree to the{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setTermsModalOpen(true);
                  }}
                  className="font-semibold text-[#1A56B8] underline hover:opacity-80"
                >
                  6-Month Contract Terms & Conditions
                </button>{' '}
                and monthly BTN compensation schedule.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setBookingCaretaker(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-full bg-[#1A56B8] text-white hover:bg-[#154698]"
                isLoading={submittingBooking}
                disabled={!acceptedTerms}
              >
                {isRenewalModal ? 'Send Contract Renewal' : 'Send 6-Month Request'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <TermsAndConditionsModal
        isOpen={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        audience="PARENT"
        onAccept={() => setAcceptedTerms(true)}
      />

      {/* ================================================================= */}
      {/* LOGOUT WARNING MODAL                                              */}
      {/* ================================================================= */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="Log out of NestWell.BT?"
        subtitle="Please confirm before ending your current session."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3.5 text-xs text-slate-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="leading-relaxed">
              <strong>Warning:</strong> Logging out will end your current session. You will need to sign back in to manage
              your child profiles or respond to caretaker contract updates.
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
