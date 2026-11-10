// Global app state: theme, auth session, API health, active scan jobs and loaded reports.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSupabase, supabaseEnabled } from '../lib/supabase.js';

const AppContext = createContext(null);
const LS_THEME = 'speedlab-theme';
const LS_REPORTS = 'speedlab-current-reports';
const LS_DEVICE = 'speedlab-device';
const LS_DEFAULT_STRATEGY = 'speedlab-default-strategy';

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function AppProvider({ children }) {
  // ---- Theme
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(LS_THEME) || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    try {
      localStorage.setItem(LS_THEME, theme);
    } catch {
      /* ignore */
    }
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // ---- Auth
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabaseEnabled);
  useEffect(() => {
    let sub;
    getSupabase().then((sb) => {
      if (!sb) return;
      sb.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setAuthReady(true);
      });
      sub = sb.auth.onAuthStateChange((_e, s) => setSession(s)).data.subscription;
    });
    return () => sub?.unsubscribe();
  }, []);

  // ---- Health
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api('/health'));
      setHealthError(null);
    } catch (err) {
      setHealthError(err.message);
    }
  }, []);
  useEffect(() => {
    if (authReady) refreshHealth();
  }, [authReady, session, refreshHealth]);

  // ---- Reports
  const [reports, setReports] = useState({ mobile: null, desktop: null });
  const [device, setDeviceState] = useState(() => readLS(LS_DEVICE, 'mobile'));
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState(null);
  // Previous scan of the same URL+device, recorded when a retest starts (for before/after compare).
  const [baselines, setBaselines] = useState({});
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const setDevice = (d) => {
    setDeviceState(d);
    writeLS(LS_DEVICE, d);
  };

  const rememberIds = (next) => writeLS(LS_REPORTS, { mobile: next.mobile?.id || null, desktop: next.desktop?.id || null });

  const putReport = useCallback((report) => {
    setReports((prev) => {
      const next = { ...prev, [report.strategy]: report };
      rememberIds(next);
      return next;
    });
  }, []);

  const loadScan = useCallback(
    async (id, { switchDevice = true } = {}) => {
      const report = await api(`/scans/${id}`);
      putReport(report);
      if (switchDevice) setDevice(report.strategy);
      return report;
    },
    [putReport],
  );

  useEffect(() => {
    if (!authReady) return;
    const ids = readLS(LS_REPORTS, {});
    const list = ['mobile', 'desktop'].filter((k) => ids[k]);
    if (!list.length) {
      setReportsLoading(false);
      return;
    }
    Promise.allSettled(list.map((k) => api(`/scans/${ids[k]}`)))
      .then((results) => {
        const next = { mobile: null, desktop: null };
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') next[list[i]] = r.value;
        });
        setReports(next);
        rememberIds(next);
        if (results.every((r) => r.status === 'rejected') && results[0]?.reason?.status !== 404) setReportsError(results[0].reason.message);
      })
      .finally(() => setReportsLoading(false));
  }, [authReady, session]);

  const clearReports = () => {
    setReports({ mobile: null, desktop: null });
    rememberIds({});
  };

  const report = reports[device] || reports[device === 'mobile' ? 'desktop' : 'mobile'] || null;

  // ---- Scan jobs
  const [jobs, setJobs] = useState([]);
  const [scanError, setScanError] = useState(null);
  const pollRef = useRef(null);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const poll = useCallback(async () => {
    const active = jobsRef.current.filter((j) => ['queued', 'running'].includes(j.status));
    if (!active.length) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    const updates = await Promise.all(
      active.map((j) =>
        api(`/jobs/${j.id}`).catch((err) => ({ ...j, status: 'error', error: { message: err.message }, report: undefined })),
      ),
    );
    setJobs((prev) => prev.map((j) => updates.find((u) => u.id === j.id) || j));
    for (const u of updates) {
      if (u.status === 'done' && u.report) {
        putReport({ ...u.report, id: u.scanId || u.report.id });
      }
    }
  }, [putReport]);

  const ensurePolling = useCallback(() => {
    if (!pollRef.current) pollRef.current = setInterval(poll, 2000);
  }, [poll]);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const startScan = useCallback(
    async ({ url, strategy, projectId, baselineId }) => {
      setScanError(null);
      const sameSite = (a, b) => {
        try {
          const x = new URL(a);
          const y = new URL(/^https?:\/\//i.test(b) ? b : `https://${b}`);
          return x.host.replace(/^www\./, '') === y.host.replace(/^www\./, '') && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '');
        } catch {
          return false;
        }
      };
      const nextBaselines = {};
      for (const s of strategy === 'both' ? ['mobile', 'desktop'] : [strategy]) {
        const prev = reportsRef.current[s];
        if (baselineId && strategy !== 'both') nextBaselines[s] = baselineId;
        else if (prev?.id && sameSite(prev.finalUrl || prev.url, url)) nextBaselines[s] = prev.id;
      }
      setBaselines(nextBaselines);
      try {
        // Show placeholder progress while an inline (Vercel Lite) scan runs inside the request.
        const pending = (strategy === 'both' ? ['mobile', 'desktop'] : [strategy]).map((s) => ({
          id: `pending-${s}`,
          status: 'running',
          progress: 5,
          strategy: s,
          message: 'Analysing… PageSpeed Insights usually takes 20–60 seconds',
          steps: [],
          warnings: [],
        }));
        setJobs(pending);
        startAbort.current = new AbortController();
        const { jobs: created } = await api('/jobs', { method: 'POST', body: { url, strategy, projectId: projectId || null }, signal: startAbort.current.signal });
        startAbort.current = null;
        setJobs(created);
        if (strategy !== 'both') setDevice(strategy);
        for (const j of created) if (j.status === 'done' && j.report) putReport({ ...j.report, id: j.scanId || j.report.id });
        if (created.some((j) => ['queued', 'running'].includes(j.status))) ensurePolling();
        return created;
      } catch (err) {
        startAbort.current = null;
        if (err.name === 'AbortError') {
          setJobs((prev) => prev.map((j) => ({ ...j, status: 'cancelled', message: 'Scan cancelled' })));
          return [];
        }
        setJobs([]);
        setScanError(err.message);
        throw err;
      }
    },
    [ensurePolling, putReport],
  );

  const startAbort = useRef(null);
  const cancelScan = useCallback(async () => {
    if (startAbort.current) {
      startAbort.current.abort();
      return;
    }
    const active = jobsRef.current.filter((j) => ['queued', 'running'].includes(j.status));
    const results = await Promise.all(active.map((j) => api(`/jobs/${j.id}`, { method: 'DELETE' }).catch(() => ({ ...j, status: 'cancelled' }))));
    setJobs((prev) => prev.map((j) => results.find((r) => r.id === j.id) || j));
  }, []);

  const scanning = jobs.some((j) => ['queued', 'running'].includes(j.status));

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      session,
      user: session?.user || null,
      authReady,
      supabaseEnabled,
      health,
      healthError,
      refreshHealth,
      reports,
      report,
      device,
      setDevice,
      reportsLoading,
      reportsError,
      loadScan,
      putReport,
      clearReports,
      jobs,
      scanning,
      scanError,
      startScan,
      cancelScan,
      baselines,
      defaultStrategy: readLS(LS_DEFAULT_STRATEGY, 'mobile'),
      setDefaultStrategy: (s) => writeLS(LS_DEFAULT_STRATEGY, s),
    }),
    [theme, session, authReady, health, healthError, refreshHealth, reports, report, device, reportsLoading, reportsError, loadScan, putReport, jobs, scanning, scanError, startScan, cancelScan, baselines],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
