import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  MapPin,
  Star,
  Award,
  UserSearch,
  FileText,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { BookingRecord, ChildProfile, AppNotification } from '../types/domain';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatBtn, formatDisplayDate } from '../lib/date';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { TermsAndConditionsModal } from '../components/shared/TermsAndConditionsModal';

type SidebarSection =
  | 'OVERVIEW'
  | 'FIND_CARETAKERS'
  | 'CONTRACTS'
  | 'CHILDREN'
  | 'NOTIFICATIONS';
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

function getInitials(name?: string) {
  if (!name) return 'PR';
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

export function ParentDashboard() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [bookingCaretaker, setBookingCaretaker] = useState<CaretakerSummary | null>(null);
  const [isRenewalModal, setIsRenewalModal] = useState(false);
  const [docsCaretaker, setDocsCaretaker] = useState<CaretakerSummary | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [childName, setChildName] = useState('');
  const [childDob, setChildDob] = useState('');
  const [allergies, setAllergies] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [savingChild, setSavingChild] = useState(false);

  const [bookingChildId, setBookingChildId] = useState('');
  const [bookingStartDate, setBookingStartDate] = useState('');
  const [bookingMonths, setBookingMonths] = useState(6);
  const [billingArrangement, setBillingArrangement] = useState<
    'MONTHLY_INSTALLMENT' | 'QUARTERLY_INSTALLMENT'
  >('MONTHLY_INSTALLMENT');
  const [bookingNotes, setBookingNotes] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const loadAll = async () => {
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      window.alert('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }

    setAvatarBusy(true);
    setStatusMessage(null);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await api.patch('/auth/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      setStatusMessage('Profile picture updated successfully.');
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
    setStatusMessage(null);
    try {
      await api
        .delete('/auth/me/avatar')
        .catch(() => api.patch('/auth/me/avatar', { removeAvatar: true, avatarUrl: null }));
      await refreshUser();
      setStatusMessage('Profile picture removed.');
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Unable to remove profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

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
      setStatusMessage('Encrypted child profile added.');
      await loadAll();
    } finally {
      setSavingChild(false);
    }
  };

  const openBookingForCaretaker = (caretaker: CaretakerSummary) => {
    if (childrenList.length === 0) {
      setStatusMessage('Please add a child profile first before requesting a caretaker.');
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
      monthlyRateBtn: Number(
        contract.caretakerCurrentRateBtn ?? contract.agreedMonthlyRateBtn ?? 15000
      ),
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
      setStatusMessage(
        isRenewalModal
          ? `Contract renewal request sent to ${bookingCaretaker.fullName}.`
          : `6-month childcare request sent to ${bookingCaretaker.fullName}.`
      );
      await loadAll();
    } catch (err: any) {
      const rawMessage = err?.response?.data?.message;
      let cleanMessage =
        err?.response?.data?.errors?.[0]?.message ||
        'Unable to submit booking request. Please verify all fields.';

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
      setStatusMessage(
        status === 'CONFIRMED'
          ? 'Contract confirmed! Your 6-month childcare agreement is active.'
          : 'Booking request cancelled.'
      );
      await loadAll();
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Unable to update contract status.');
    }
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    await api.patch(`/notifications/${notificationId}/read`).catch(() => {});
    await loadAll();
  };

  const handleConfirmLogout = () => {
    setLogoutModalOpen(false);
    logout();
    navigate('/login');
  };

  const activeContractsCount = useMemo(
    () =>
      bookings.filter(
        (b) => ['CONFIRMED', 'ACTIVE'].includes(b.status) && !isContractExpired(b)
      ).length,
    [bookings]
  );
  const pendingContractsCount = useMemo(
    () => bookings.filter((b) => ['PENDING', 'ACCEPTED'].includes(b.status)).length,
    [bookings]
  );
  const completedContractsCount = useMemo(
    () => bookings.filter((b) => isContractExpired(b)).length,
    [bookings]
  );
  const unreadNotifsCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

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

      if (childBookings.some((b) => ['PENDING', 'ACCEPTED'].includes(b.status))) {
        return false;
      }

      return childBookings.every((b: any) => {
        if (!b.endDate) return false;
        const endIso = String(b.endDate).slice(0, 10);
        return endIso <= windowLimitIso;
      });
    });
  }, [childrenList, bookings]);

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      const expired = isContractExpired(b);
      if (contractFilter === 'PENDING' && !['PENDING', 'ACCEPTED'].includes(b.status)) {
        return false;
      }
      if (
        contractFilter === 'CONFIRMED' &&
        (!['CONFIRMED', 'ACTIVE'].includes(b.status) || expired)
      ) {
        return false;
      }
      if (contractFilter === 'COMPLETED' && !expired) {
        return false;
      }
      if (!q) return true;
      return (
        b.caretakerName.toLowerCase().includes(q) ||
        b.childName.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q)
      );
    });
  }, [bookings, contractFilter, searchQuery]);

  const navItems: {
    id: SidebarSection;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    { id: 'OVERVIEW', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    {
      id: 'FIND_CARETAKERS',
      label: 'Find Caretakers',
      icon: <UserSearch className="h-4 w-4" />,
    },
    {
      id: 'CONTRACTS',
      label: 'Contracts',
      icon: <FileCheck2 className="h-4 w-4" />,
      badge: bookings.length || undefined,
    },
    {
      id: 'CHILDREN',
      label: 'Child Profiles',
      icon: <Baby className="h-4 w-4" />,
      badge: childrenList.length || undefined,
    },
    {
      id: 'NOTIFICATIONS',
      label: 'Notifications',
      icon: <Bell className="h-4 w-4" />,
      badge: unreadNotifsCount || undefined,
    },
  ];

  const estimatedContractTotal = bookingCaretaker
    ? bookingCaretaker.monthlyRateBtn * bookingMonths
    : 0;

  const parentCidUrl = resolveDocumentUrl(docsCaretaker?.idDocumentPath);
  const isParentCidPdf = Boolean(
    parentCidUrl && parentCidUrl.toLowerCase().endsWith('.pdf')
  );

  const parentCertUrl = resolveDocumentUrl(docsCaretaker?.certificateDocumentPath);
  const isParentCertPdf = Boolean(
    parentCertUrl && parentCertUrl.toLowerCase().endsWith('.pdf')
  );

  return (
    <div className="min-h-screen bg-bg">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-border bg-surface px-4 py-5 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-7 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between lg:block">
                <div className="flex items-center gap-3">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.fullName}
                      className="h-11 w-11 shrink-0 rounded-xl object-cover border border-border"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white">
                      {getInitials(user?.fullName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-semibold text-fg">
                      {user?.fullName || 'Parent'}
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      NestWell.BT • Parent
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setLogoutModalOpen(true)}
                  className="lg:hidden inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:text-danger"
                >
                  <LogOut className="h-3.5 w-3.5" /> Log out
                </button>
              </div>

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
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-subtle/70 px-2.5 py-1.5 text-[11px] font-medium text-fg hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5 text-primary" />
                  {avatarBusy ? 'Saving...' : user?.avatarUrl ? 'Update Photo' : 'Upload Photo'}
                </button>

                {user?.avatarUrl && (
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={handleAvatarRemove}
                    title="Delete profile picture"
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface-subtle/70 px-2.5 py-1.5 text-[11px] font-medium text-fg-muted hover:border-danger/40 hover:text-danger transition-colors disabled:opacity-50"
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
                    onClick={() => setActiveSection(item.id)}
                    className={`flex shrink-0 items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary/12 text-primary font-semibold'
                        : 'text-fg-muted hover:bg-surface-subtle hover:text-fg'
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
                            ? 'bg-primary text-white'
                            : 'bg-surface-subtle text-fg-muted'
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

          <div className="hidden lg:block space-y-3 pt-4">
            <div className="rounded-2xl bg-ink p-4 text-white space-y-2.5 shadow-soft">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-accent">
                  <ShieldCheck className="h-4 w-4" /> Verified Care
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-accent">
                  6+ Mos
                </span>
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                All caretakers are CID & certificate screened for stable 6+ month family placements.
              </p>
              <button
                type="button"
                onClick={() => setActiveSection('FIND_CARETAKERS')}
                className="block w-full rounded-xl bg-primary py-2 text-center text-xs font-semibold text-white transition-opacity hover:opacity-95"
              >
                Find Caretakers
              </button>
            </div>

            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setLogoutModalOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-fg-muted hover:bg-danger/10 hover:text-danger transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" /> Log out
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-[1240px] space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-fg">
                  Welcome, {user?.fullName}
                </h1>
                <p className="text-xs text-fg-muted mt-0.5">
                  Manage your child profiles, discover CID-verified caretakers, and track 6+ month agreements.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      activeSection === 'FIND_CARETAKERS'
                        ? 'Search name, skill, qualification...'
                        : 'Search caretaker or child...'
                    }
                    className="w-48 sm:w-56 rounded-full border border-border bg-surface py-2 pl-9 pr-4 text-xs text-fg placeholder:text-fg-muted shadow-2xs focus:border-primary focus:outline-none"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChildModalOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Child Profile
                </Button>

                <Button
                  size="sm"
                  onClick={() => setActiveSection('FIND_CARETAKERS')}
                >
                  <Search className="h-3.5 w-3.5" /> Find Caretakers
                </Button>
              </div>
            </div>

            {statusMessage && (
              <div className="rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 text-xs font-medium text-fg">
                {statusMessage}
              </div>
            )}

            {activeSection === 'FIND_CARETAKERS' ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <label
                      htmlFor="dzongkhag-filter"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg"
                    >
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      Dzongkhag:
                    </label>
                    <select
                      id="dzongkhag-filter"
                      value={selectedDzongkhag}
                      onChange={(e) => setSelectedDzongkhag(e.target.value)}
                      className="rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-fg shadow-2xs focus:border-primary focus:outline-none"
                    >
                      {DZONGKHAG_OPTIONS.map((dz) => (
                        <option key={dz} value={dz}>
                          {dz === 'ALL' ? 'All Dzongkhags' : dz}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveSection('OVERVIEW')}
                  >
                    Back to Overview
                  </Button>
                </div>

                {loadingCaretakers ? (
                  <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-fg-muted shadow-soft">
                    Loading verified caretakers...
                  </div>
                ) : caretakers.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-surface p-10 text-center space-y-2 shadow-soft">
                    <p className="font-serif text-lg font-semibold text-fg">
                      No verified caretakers matched your filter
                    </p>
                    <p className="text-xs text-fg-muted">
                      Try clearing your search query or switching to All Dzongkhags.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {caretakers.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-2xl border border-border bg-surface p-5 shadow-soft flex flex-col justify-between space-y-5"
                      >
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {c.avatarUrl ? (
                                <img
                                  src={c.avatarUrl}
                                  alt={c.fullName}
                                  className="h-12 w-12 rounded-xl object-cover border border-border"
                                />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-sm font-semibold text-primary">
                                  {getInitials(c.fullName)}
                                </div>
                              )}
                              <div>
                                <h3 className="font-serif text-lg font-semibold text-fg">
                                  {c.fullName}
                                </h3>
                                <p className="text-xs text-fg-muted flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-primary" />
                                  {c.dzongkhag} • {c.yearsExperience} yrs exp
                                </p>
                              </div>
                            </div>

                            <Badge variant="verified">CID Verified</Badge>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-fg-muted">
                            <span className="inline-flex items-center gap-1 font-semibold text-fg">
                              <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                              {c.avgRating > 0 ? c.avgRating.toFixed(1) : 'New'}
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 truncate">
                              <Award className="h-3.5 w-3.5 text-primary shrink-0" />
                              {c.qualifications}
                            </span>
                          </div>

                          {c.bio && (
                            <p className="text-xs text-fg-muted line-clamp-2 leading-relaxed">
                              {c.bio}
                            </p>
                          )}

                          {Array.isArray(c.skills) && c.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {c.skills.slice(0, 4).map((skill) => (
                                <span
                                  key={skill}
                                  className="rounded-full bg-surface-subtle px-2.5 py-1 text-[11px] font-medium text-fg-muted"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 border-t border-border pt-4">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[11px] text-fg-muted">Monthly Rate</p>
                              <p className="font-serif text-lg font-semibold text-fg">
                                {formatBtn(c.monthlyRateBtn)}
                                <span className="text-xs font-normal text-fg-muted">/mo</span>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setDocsCaretaker(c)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-subtle/70 px-3 py-1.5 text-xs font-medium text-fg hover:border-primary/40 hover:text-primary transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5 text-primary" />
                              CID & Certificate
                            </button>
                          </div>

                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => openBookingForCaretaker(c)}
                          >
                            Request 6-Mo Care
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'ALL', label: `All Contracts (${bookings.length})` },
                        { id: 'PENDING', label: `Pending (${pendingContractsCount})` },
                        { id: 'CONFIRMED', label: `Active (${activeContractsCount})` },
                        { id: 'COMPLETED', label: `Expired / Completed (${completedContractsCount})` },
                      ] as { id: ContractFilter; label: string }[]
                    ).map((pill) => {
                      const active = contractFilter === pill.id;
                      return (
                        <button
                          key={pill.id}
                          type="button"
                          onClick={() => setContractFilter(pill.id)}
                          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                            active
                              ? 'bg-ink text-white shadow-soft'
                              : 'border border-border bg-surface text-fg-muted hover:text-fg'
                          }`}
                        >
                          {pill.label}
                        </button>
                      );
                    })}
                  </div>

                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-fg-muted">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    {new Date().toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-ink p-5 text-white shadow-soft flex flex-col justify-between space-y-3">
                    <p className="text-xs font-medium text-stone-300">
                      Active & Confirmed Contracts
                    </p>
                    <p className="font-serif text-3xl font-semibold tracking-tight">
                      {activeContractsCount}
                    </p>
                    <p className="text-[11px] text-accent flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 6+ month verified care
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft flex flex-col justify-between space-y-3">
                    <p className="text-xs font-medium text-fg-muted">Pending & Accepted</p>
                    <p className="font-serif text-3xl font-semibold text-fg">
                      {pendingContractsCount}
                    </p>
                    <p className="text-[11px] text-fg-muted flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Awaiting confirmation
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft flex flex-col justify-between space-y-3">
                    <p className="text-xs font-medium text-fg-muted">Completed / Expired</p>
                    <p className="font-serif text-3xl font-semibold text-fg">
                      {completedContractsCount}
                    </p>
                    <p className="text-[11px] text-primary flex items-center gap-1 font-medium">
                      <RotateCcw className="h-3.5 w-3.5" /> Ready to renew or rebook
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft flex flex-col justify-between space-y-3">
                    <p className="text-xs font-medium text-fg-muted">Registered Children</p>
                    <p className="font-serif text-3xl font-semibold text-fg">
                      {childrenList.length}
                    </p>
                    <p className="text-[11px] text-fg-muted flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Encrypted household profiles
                    </p>
                  </div>
                </div>

                {(activeSection === 'OVERVIEW' || activeSection === 'CONTRACTS') && (
                  <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="font-serif text-xl font-semibold text-fg">
                          6-Month Childcare Contracts
                        </h2>
                        <p className="text-xs text-fg-muted mt-0.5">
                          Confirm accepted placements, or renew expired contracts / select another verified caretaker.
                        </p>
                      </div>
                      {canCreateNewRequest && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveSection('FIND_CARETAKERS')}
                        >
                          <Plus className="h-3.5 w-3.5" /> New 6-Month Request
                        </Button>
                      )}
                    </div>

                    {filteredBookings.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
                        <p className="font-serif text-base font-semibold text-fg">
                          No childcare contracts found
                        </p>
                        <p className="text-xs text-fg-muted">
                          Browse CID-verified caretakers to request a 6-month care placement.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {filteredBookings.map((b: any) => {
                          const expired = isContractExpired(b);
                          return (
                            <div
                              key={b.id}
                              className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-sm text-fg">
                                    {b.caretakerName}
                                  </p>
                                  <Badge
                                    variant={
                                      expired
                                        ? 'neutral'
                                        : ['CONFIRMED', 'ACTIVE'].includes(b.status)
                                        ? 'verified'
                                        : ['REJECTED', 'CANCELLED'].includes(b.status)
                                        ? 'rejected'
                                        : 'pending'
                                    }
                                  >
                                    {expired ? 'EXPIRED / COMPLETED' : b.status}
                                  </Badge>
                                </div>
                                <p className="text-xs text-fg-muted">
                                  Child: <span className="font-medium text-fg">{b.childName}</span> •{' '}
                                  {b.durationMonths} Months ({formatDisplayDate(b.startDate)}
                                  {b.endDate ? ` – ${formatDisplayDate(b.endDate)}` : ''}) •{' '}
                                  <span className="font-semibold text-fg">
                                    {formatBtn(b.agreedMonthlyRateBtn)}/mo
                                  </span>
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {b.status === 'ACCEPTED' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleBookingAction(b.id, 'CONFIRMED')}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Contract
                                  </Button>
                                )}

                                {['PENDING', 'ACCEPTED'].includes(b.status) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleBookingAction(b.id, 'CANCELLED')}
                                  >
                                    <XCircle className="h-3.5 w-3.5 text-danger" /> Cancel
                                  </Button>
                                )}

                                {expired && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => openRenewalForContract(b)}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" /> Renew Contract
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setActiveSection('FIND_CARETAKERS')}
                                    >
                                      <UserSearch className="h-3.5 w-3.5" /> Find Another Caretaker
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {(activeSection === 'OVERVIEW' || activeSection === 'CHILDREN') && (
                  <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-serif text-xl font-semibold text-fg">
                          Child Profiles
                        </h2>
                        <p className="text-xs text-fg-muted mt-0.5">
                          Encrypted dietary, allergy, and routine instructions shared only with your assigned caretaker.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setChildModalOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Child
                      </Button>
                    </div>

                    {childrenList.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
                        <p className="font-serif text-base font-semibold text-fg">
                          No child profiles added yet
                        </p>
                        <p className="text-xs text-fg-muted">
                          Add your child’s profile before sending a 6-month caretaker request.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {childrenList.map((child) => (
                          <div
                            key={child.id}
                            className="rounded-2xl border border-border bg-surface-subtle/50 p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <p className="font-serif text-base font-semibold text-fg">
                                {child.fullName}
                              </p>
                              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                                DOB: {formatDisplayDate(child.dateOfBirth)}
                              </span>
                            </div>
                            <p className="text-xs text-fg-muted">
                              <span className="font-semibold text-fg">Allergies:</span>{' '}
                              {child.allergies || 'None reported'}
                            </p>
                            {child.specialInstructions && (
                              <p className="text-xs text-fg-muted">
                                <span className="font-semibold text-fg">Care Notes:</span>{' '}
                                {child.specialInstructions}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(activeSection === 'OVERVIEW' || activeSection === 'NOTIFICATIONS') && (
                  <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft space-y-4">
                    <div>
                      <h2 className="font-serif text-xl font-semibold text-fg">
                        Recent Alerts & Notifications
                      </h2>
                      <p className="text-xs text-fg-muted mt-0.5">
                        Updates on your caretaker booking requests and contract confirmations.
                      </p>
                    </div>

                    {notifications.length === 0 ? (
                      <p className="text-xs text-fg-muted py-4">
                        No notifications yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {notifications.slice(0, 8).map((n) => (
                          <div
                            key={n.id}
                            className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                          >
                            <div className="space-y-0.5">
                              <p className="text-xs font-semibold text-fg">
                                {n.title}
                              </p>
                              <p className="text-xs text-fg-muted">{n.message}</p>
                            </div>
                            {!n.isRead && (
                              <button
                                type="button"
                                onClick={() => handleMarkNotificationRead(n.id)}
                                className="shrink-0 rounded-full bg-primary/12 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <Modal
        isOpen={Boolean(docsCaretaker)}
        onClose={() => setDocsCaretaker(null)}
        title={`Verified Credentials — ${docsCaretaker?.fullName || ''}`}
        subtitle={`${docsCaretaker?.dzongkhag || ''} • ${
          docsCaretaker?.qualifications || ''
        }`}
      >
        {docsCaretaker && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-subtle p-3.5 text-xs">
              <div>
                <p className="text-fg-muted">Qualifications & Experience</p>
                <p className="font-semibold text-fg mt-0.5">
                  {docsCaretaker.qualifications} • {docsCaretaker.yearsExperience} yrs
                </p>
              </div>
              <Badge variant="verified">Admin Screened & Verified</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-fg">
                  1. Citizenship ID (CID)
                </p>
                {parentCidUrl ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface-subtle">
                      {isParentCidPdf ? (
                        <iframe
                          src={parentCidUrl}
                          title="Caretaker Citizenship ID PDF"
                          className="h-[250px] w-full"
                        />
                      ) : (
                        <img
                          src={parentCidUrl}
                          alt={`${docsCaretaker.fullName} Citizenship ID`}
                          className="h-[250px] w-full object-contain bg-stone-950/5"
                        />
                      )}
                    </div>
                    <a
                      href={parentCidUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    >
                      Open CID full size <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                ) : (
                  <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-xs text-fg">
                    CID document preview not available.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-fg">
                  2. Institution Certificate
                </p>
                {parentCertUrl ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface-subtle">
                      {isParentCertPdf ? (
                        <iframe
                          src={parentCertUrl}
                          title="Institution Certificate PDF"
                          className="h-[250px] w-full"
                        />
                      ) : (
                        <img
                          src={parentCertUrl}
                          alt={`${docsCaretaker.fullName} Institution Certificate`}
                          className="h-[250px] w-full object-contain bg-stone-950/5"
                        />
                      )}
                    </div>
                    <a
                      href={parentCertUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    >
                      Open Certificate full size{' '}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                ) : (
                  <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-xs text-fg">
                    Institution certificate preview not available.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDocsCaretaker(null)}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const target = docsCaretaker;
                  setDocsCaretaker(null);
                  openBookingForCaretaker(target);
                }}
              >
                Request 6-Mo Care
              </Button>
            </div>
          </div>
        )}
      </Modal>

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

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-fg">
              Daily Routine & Special Instructions (Optional)
            </label>
            <textarea
              rows={3}
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Nap schedule, feeding preferences, emergency contact..."
              className="w-full rounded-xl border border-border bg-surface-subtle/60 px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setChildModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={savingChild}>
              Save Child Profile
            </Button>
          </div>
        </form>
      </Modal>

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
              <div className="flex items-start gap-2.5 rounded-2xl border border-danger/35 bg-danger/10 px-4 py-3 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <span>{bookingError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-fg">
                Select Child Profile
              </label>
              <select
                required
                value={bookingChildId}
                onChange={(e) => setBookingChildId(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-subtle/60 px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:outline-none"
              >
                {childrenList.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-fg">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  value={bookingStartDate}
                  onChange={(e) => setBookingStartDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-subtle/60 px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-fg">
                  Contract Duration (Min. 6 Mos)
                </label>
                <select
                  value={bookingMonths}
                  onChange={(e) => setBookingMonths(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-surface-subtle/60 px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:outline-none"
                >
                  <option value={6}>6 Months</option>
                  <option value={9}>9 Months</option>
                  <option value={12}>12 Months (1 Year)</option>
                  <option value={18}>18 Months</option>
                  <option value={24}>24 Months (2 Years)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-fg">
                Billing Arrangement
              </label>
              <select
                value={billingArrangement}
                onChange={(e) =>
                  setBillingArrangement(
                    e.target.value as 'MONTHLY_INSTALLMENT' | 'QUARTERLY_INSTALLMENT'
                  )
                }
                className="w-full rounded-xl border border-border bg-surface-subtle/60 px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:outline-none"
              >
                <option value="MONTHLY_INSTALLMENT">
                  Monthly Installment ({formatBtn(bookingCaretaker.monthlyRateBtn)}/mo)
                </option>
                <option value="QUARTERLY_INSTALLMENT">
                  Quarterly Installment (
                  {formatBtn(bookingCaretaker.monthlyRateBtn * 3)} every 3 mos)
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-fg">
                Notes for Caretaker (Optional)
              </label>
              <input
                type="text"
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                placeholder="Preferred arrival hours, school pickup details..."
                className="w-full rounded-xl border border-border bg-surface-subtle/60 px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-3.5 text-white">
              <span className="text-xs text-stone-300">
                Estimated {bookingMonths}-Month Total
              </span>
              <span className="font-serif text-lg font-semibold text-accent">
                {formatBtn(estimatedContractTotal)}
              </span>
            </div>

            <label className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-subtle/60 p-3 text-xs text-fg cursor-pointer select-none">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-primary"
              />
              <span className="leading-relaxed text-fg-muted">
                I have read and agree to the{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setTermsModalOpen(true);
                  }}
                  className="font-semibold text-primary underline hover:opacity-80"
                >
                  6-Month Contract Terms & Conditions
                </button>{' '}
                and monthly BTN compensation schedule.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBookingCaretaker(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
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

      <Modal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="Log out of Parent Portal?"
        subtitle="Please confirm before ending your current session."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="leading-relaxed">
              <strong>Warning:</strong> Logging out will end your current session. You will need to sign back in to manage your child profiles or respond to caretaker contract updates.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLogoutModalOpen(false)}
            >
              Stay Signed In
            </Button>
            <Button type="button" onClick={handleConfirmLogout}>
              Yes, Log Out
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}