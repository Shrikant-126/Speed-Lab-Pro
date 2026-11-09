import { useState, useEffect, Suspense } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, ScanSearch, Activity, Target, Image, Video, Palette, FileCode2, Network, Puzzle,
  Lightbulb, Code2, History, FileText, Settings, Menu, X, Sun, Moon, Monitor, Smartphone, Zap, Loader2, LogIn, LogOut,
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { cx, PageSkeleton } from './ui.jsx';
import { getSupabase } from '../lib/supabase.js';

export const NAV_GROUPS = [
  {
    title: 'Dashboard',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/analyzer', label: 'Website Analyzer', icon: ScanSearch },
    ],
  },
  {
    title: 'Diagnostics',
    items: [
      { to: '/core-web-vitals', label: 'Core Web Vitals', icon: Activity },
      { to: '/lcp', label: 'LCP Analysis', icon: Target },
      { to: '/images', label: 'Image Optimizer', icon: Image },
      { to: '/videos', label: 'Video Optimizer', icon: Video },
      { to: '/css', label: 'CSS Analyzer', icon: Palette },
      { to: '/javascript', label: 'JavaScript Analyzer', icon: FileCode2 },
      { to: '/network', label: 'Network Analysis', icon: Network },
      { to: '/third-party', label: 'Third-Party Scripts', icon: Puzzle },
    ],
  },
  {
    title: 'Optimize',
    items: [
      { to: '/suggestions', label: 'Optimization Suggestions', icon: Lightbulb, badge: 'issues' },
      { to: '/code-generator', label: 'Code Generator', icon: Code2 },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { to: '/history', label: 'Scan History', icon: History },
      { to: '/reports', label: 'Reports', icon: FileText },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

function SidebarScore() {
  const { report } = useApp();
  if (!report) {
    return (
      <Link to="/analyzer" className="mx-3 mb-4 block rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 p-4 text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110">
        <p className="text-sm font-semibold">Start your first scan</p>
        <p className="mt-0.5 text-xs text-white/75">Analyze any public URL in under a minute.</p>
      </Link>
    );
  }
  const s = report.scores.performance;
  const color = s === null ? '#94a3b8' : s >= 90 ? '#0cce6b' : s >= 50 ? '#ffa400' : '#ff4e42';
  return (
    <Link to="/" className="mx-3 mb-4 flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50 p-3 transition hover:border-brand-300 dark:border-white/[0.07] dark:from-white/[0.04] dark:to-transparent">
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(${color} ${(s ?? 0) * 3.6}deg, rgb(148 163 184 / 0.2) 0)` }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold tabular-nums dark:bg-slate-900" style={{ color }}>
          {s ?? '—'}
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{(() => { try { return new URL(report.finalUrl).host; } catch { return report.finalUrl; } })()}</p>
        <p className="text-[11px] capitalize text-slate-500">{report.strategy} · {report.issues.length} issues</p>
      </div>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useApp();
  const next = { light: 'dark', dark: 'system', system: 'light' };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button type="button" onClick={() => setTheme(next[theme])} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" title={`Theme: ${theme}`} aria-label="Toggle theme">
      <Icon size={18} />
    </button>
  );
}

function DeviceSwitch() {
  const { device, setDevice, reports } = useApp();
  if (!reports.mobile && !reports.desktop) return null;
  return (
    <div className="flex rounded-xl border border-slate-200/70 bg-slate-100/80 p-0.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
      {[
        ['mobile', Smartphone, 'Mobile'],
        ['desktop', Monitor, 'Desktop'],
      ].map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          disabled={!reports[key]}
          onClick={() => setDevice(key)}
          title={reports[key] ? `Show ${label} results` : `No ${label} scan loaded`}
          className={cx(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-40',
            device === key && reports[key] ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500',
          )}
        >
          <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function ScanIndicator() {
  const { jobs, scanning } = useApp();
  if (!scanning) return null;
  const progress = Math.round(jobs.reduce((s, j) => s + (j.progress || 0), 0) / Math.max(1, jobs.length));
  return (
    <Link to="/analyzer" className="flex items-center gap-2 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
      <Loader2 size={14} className="animate-spin" /> Scanning… {progress}%
    </Link>
  );
}

function Account() {
  const { supabaseEnabled, user } = useApp();
  if (!supabaseEnabled) return null;
  if (!user) {
    return (
      <Link to="/settings#account" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
        <LogIn size={14} /> Sign in
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={async () => (await getSupabase())?.auth.signOut()}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      title={user.email}
    >
      <LogOut size={14} /> <span className="hidden md:inline">Sign out</span>
    </button>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { report } = useApp();
  useEffect(() => setOpen(false), [location.pathname]);

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-brand-500 opacity-50 blur-md" />
          <div className="relative rounded-xl bg-gradient-to-br from-brand-500 via-violet-600 to-fuchsia-600 p-2 text-white">
            <Zap size={18} fill="currentColor" />
          </div>
        </div>
        <div>
          <p className="text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
            SpeedLab <span className="gradient-text">Pro</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Performance Intelligence</p>
        </div>
      </Link>
      <SidebarScore />
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map(({ to, label, icon: Icon, end, badge }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition',
                      isActive
                        ? 'bg-gradient-to-r from-brand-50 to-violet-50/40 text-brand-700 dark:from-brand-500/15 dark:to-transparent dark:text-white'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-100',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-500 to-violet-500" />}
                      <Icon size={17} className={cx('transition', isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300')} />
                      <span className="flex-1 truncate">{label}</span>
                      {badge === 'issues' && report?.issues?.length > 0 && (
                        <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">{report.issues.length}</span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200/70 px-5 py-3 text-[11px] text-slate-400 dark:border-white/[0.06]">Lighthouse · CrUX · Playwright · Sharp</div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/70 bg-white/80 backdrop-blur-xl lg:block dark:border-white/[0.06] dark:bg-[#0a0f1f]/80">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl dark:bg-slate-900">
            <button type="button" className="absolute right-3 top-5 rounded-lg p-1.5 text-slate-500" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/60 bg-white/70 px-4 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#070b17]/70 sm:px-6">
          <button type="button" className="rounded-lg p-1.5 text-slate-600 lg:hidden dark:text-slate-300" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm text-slate-500 dark:text-slate-400">
            {report ? (
              <span title={report.finalUrl} className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 py-1 pl-1.5 pr-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="truncate font-medium text-slate-800 dark:text-slate-200">{report.finalUrl}</span>
                <span className="hidden shrink-0 text-xs md:inline">· {new Date(report.createdAt).toLocaleString()}</span>
              </span>
            ) : (
              <span className="text-slate-400">No scan loaded</span>
            )}
          </div>
          <ScanIndicator />
          <DeviceSwitch />
          <Account />
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
