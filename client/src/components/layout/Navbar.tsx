import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LayoutDashboard, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../shared/ThemeToggle';
import { LogoMark, Wordmark } from '../shared/Logo';
import { Button } from '../ui/Button';

const NAV_ITEMS = [
  { label: 'Home', to: '/', hash: '' },
  { label: 'Find Caretakers', to: '/caretakers', hash: '' },
  { label: 'How It Works', to: '/#how-it-works', hash: '#how-it-works' },
  { label: 'About Us', to: '/#about', hash: '#about' },
  { label: 'Contact & FAQ', to: '/#contact', hash: '#contact' },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname, hash]);

  const isActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.to === '/caretakers') return pathname === '/caretakers';
    if (pathname !== '/') return false;
    return item.hash === '' ? hash === '' || hash === '#home' : hash === item.hash;
  };

  const dashboardPath =
    user?.role === 'ADMIN' ? '/dashboard/admin' : user?.role === 'CARETAKER' ? '/dashboard/caretaker' : '/dashboard/parent';
  const target = user && !user.isEmailVerified ? '/verify-email' : dashboardPath;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-lg">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="NestWell.BT home">
          <LogoMark className="h-9 w-9" />
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Link key={item.label} to={item.to} aria-current={active ? 'page' : undefined} className={`relative whitespace-nowrap rounded-control px-3.5 py-2 text-sm font-semibold transition-colors ${active ? 'text-primary' : 'text-fg-muted hover:text-fg'}`}>
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 -z-10 rounded-control bg-primary-soft" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <ThemeToggle />
          {user ? (
            <>
              <Button size="sm" onClick={() => navigate(target)}>
                <LayoutDashboard className="h-4 w-4" aria-hidden /> {user.isEmailVerified ? 'Dashboard' : 'Verify email'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleLogout} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
            </>
          ) : (
            <>
              <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
              <Link to="/register"><Button size="sm">Get started</Button></Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <button type="button" onClick={() => setMobileOpen((o) => !o)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} className="rounded-control border border-border bg-surface p-2 text-fg">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-border bg-surface lg:hidden">
            <div className="space-y-3 px-4 py-4">
              <nav aria-label="Mobile" className="flex flex-col text-sm font-semibold">
                {NAV_ITEMS.map((item) => (
                  <Link key={item.label} to={item.to} className={`rounded-control px-3 py-2.5 ${isActive(item) ? 'bg-primary-soft text-primary' : 'text-fg'}`}>{item.label}</Link>
                ))}
              </nav>
              <div className="flex gap-2 border-t border-border pt-3">
                {user ? (
                  <>
                    <Button className="flex-1" size="sm" onClick={() => navigate(target)}>{user.isEmailVerified ? 'Dashboard' : 'Verify email'}</Button>
                    <Button variant="outline" size="sm" onClick={handleLogout}>Sign out</Button>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="flex-1"><Button variant="outline" className="w-full" size="sm">Sign in</Button></Link>
                    <Link to="/register" className="flex-1"><Button className="w-full" size="sm">Get started</Button></Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
