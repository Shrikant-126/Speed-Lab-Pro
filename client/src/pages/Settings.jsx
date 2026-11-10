import { useState } from 'react';
import { Settings as SettingsIcon, Sun, Moon, Monitor, RefreshCw, CheckCircle2, XCircle, MinusCircle, LogIn, LogOut, Mail, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { getSupabase } from '../lib/supabase.js';
import { Card, CardHeader, PageHeader, Button, Notice, ErrorState, Select, cx, Skeleton, KeyValue } from '../components/ui.jsx';

function Status({ ok, label, detail }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : MinusCircle;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon size={18} className={cx('mt-0.5 shrink-0', ok === true ? 'text-emerald-500' : ok === false ? 'text-red-500' : 'text-slate-400')} />
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
        {detail && <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>}
      </div>
    </li>
  );
}

function AccountCard() {
  const { supabaseEnabled, user } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  if (!supabaseEnabled) {
    return (
      <Card id="account">
        <CardHeader title="Account" subtitle="Local mode" />
        <div className="p-5">
          <Notice>Supabase is not configured, so SpeedLab Pro runs in single-user local mode and stores scans on the API server. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (browser) and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (server) to enable accounts.</Notice>
        </div>
      </Card>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const sb = await getSupabase();
      if (mode === 'magic') {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setMsg('Check your inbox for the sign-in link.');
      } else if (mode === 'signup') {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Account created. Confirm your email if confirmation is enabled, then sign in.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card id="account">
      <CardHeader title="Account" subtitle={user ? `Signed in as ${user.email}` : 'Sign in to save scans, projects and reports'} />
      <div className="p-5">
        {user ? (
          <Button variant="secondary" icon={LogOut} onClick={async () => (await getSupabase()).auth.signOut()}>
            Sign out
          </Button>
        ) : (
          <form onSubmit={submit} className="max-w-sm space-y-3">
            <Select value={mode} onChange={setMode} options={[{ value: 'signin', label: 'Sign in with password' }, { value: 'signup', label: 'Create account' }, { value: 'magic', label: 'Email magic link' }]} />
            <input className="input" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {mode !== 'magic' && <input className="input" type="password" required minLength={8} placeholder="Password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />}
            <Button type="submit" icon={mode === 'magic' ? Mail : LogIn} loading={busy}>
              {mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send link' : 'Sign in'}
            </Button>
            {msg && <Notice>{msg}</Notice>}
            {err && <ErrorState title="Authentication failed" message={err} />}
          </form>
        )}
      </div>
    </Card>
  );
}

export default function Settings() {
  const { theme, setTheme, health, healthError, refreshHealth, defaultStrategy, setDefaultStrategy, clearReports } = useApp();
  const [strategy, setStrategyLocal] = useState(defaultStrategy);
  const [refreshing, setRefreshing] = useState(false);
  const i = health?.integrations || {};
  const w = health?.worker || {};

  return (
    <div className="space-y-6">
      <PageHeader icon={SettingsIcon} title="Settings" description="Appearance, defaults, account and system status." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Appearance" />
            <div className="flex flex-wrap gap-2 p-5">
              {[
                ['light', Sun, 'Light'],
                ['dark', Moon, 'Dark'],
                ['system', Monitor, 'System'],
              ].map(([k, Icon, l]) => (
                <Button key={k} variant={theme === k ? 'primary' : 'secondary'} icon={Icon} onClick={() => setTheme(k)}>
                  {l}
                </Button>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Scan defaults" />
            <div className="flex flex-wrap items-end gap-4 p-5">
              <div>
                <span className="label">Default device</span>
                <Select
                  value={strategy}
                  onChange={(v) => {
                    setStrategyLocal(v);
                    setDefaultStrategy(v);
                  }}
                  options={[{ value: 'mobile', label: 'Mobile' }, { value: 'desktop', label: 'Desktop' }, { value: 'both', label: 'Both' }]}
                />
              </div>
              <Button variant="danger-outline" icon={Trash2} onClick={clearReports}>
                Unload current scans
              </Button>
            </div>
          </Card>
          <AccountCard />
        </div>

        <Card>
          <CardHeader
            title="System status"
            subtitle="Which analysis engines are available"
            actions={
              <Button
                size="sm"
                variant="secondary"
                icon={RefreshCw}
                loading={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  await refreshHealth();
                  setRefreshing(false);
                }}
              >
                Refresh
              </Button>
            }
          />
          <div className="p-5">
            {healthError && <ErrorState title="API unreachable" message={healthError} />}
            {!health && !healthError && <Skeleton className="h-64" />}
            {health && (
              <>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  <Status ok={w.ok !== false && w.mode !== 'missing'} label={`Scan worker (${w.mode})`} detail={w.error || (w.mode === 'inline' ? 'Lite mode on Vercel: Lighthouse, CrUX, server probe and Sharp run inside the API. Browser (Playwright) inspection needs a separate worker or a local run.' : w.mode === 'embedded' ? 'Running inside the API process (development mode).' : w.mode === 'remote' ? `Remote worker · ${w.running ?? 0} running / ${w.queued ?? 0} queued` : 'Set WORKER_URL to your worker service.')} />
                  <Status ok={i.pagespeedApiKey} label="PageSpeed Insights API key" detail={i.pagespeedApiKey ? 'Configured' : 'Not configured – anonymous quota (frequently rate-limited).'} />
                  <Status ok={i.cruxApi} label="Chrome UX Report API" detail={i.cruxApi ? 'Direct CrUX queries with collection period' : 'Falls back to field data inside the PageSpeed response.'} />
                  <Status ok={i.lighthouseMode === 'psi' ? null : i.localLighthouse} label={`Lighthouse mode: ${i.lighthouseMode || 'unknown'}`} detail={i.lighthouseMode === 'psi' ? 'Lighthouse runs on Google infrastructure via PageSpeed Insights.' : i.localLighthouse ? 'Local Lighthouse available on the worker.' : 'Local Lighthouse not installed on the worker.'} />
                  <Status ok={i.playwright} label="Playwright + Chrome DevTools Protocol" detail={i.playwright ? 'Element-level inspection, coverage, listeners and CDP metrics enabled.' : 'Chromium not installed on the worker – run "npm run browsers".'} />
                  <Status ok={i.sharp} label="Sharp image analysis" detail={i.sharp ? 'Measures real WebP/AVIF/optimised sizes.' : 'Not installed – compressed sizes unavailable.'} />
                  <Status ok={i.supabase} label="Supabase database" detail={i.supabase ? 'Scans stored in PostgreSQL.' : `Local ${health.storage} storage on the API server.`} />
                  <Status ok={health.auth?.enabled ? true : null} label="Authentication" detail={health.auth?.enabled ? 'Supabase Auth required for API access.' : 'Disabled (local single-user mode).'} />
                </ul>
                <div className="mt-4">
                  <KeyValue items={[['API version', health.version], ['Signed-in user', health.user?.email || (health.user?.local ? 'local' : '—')]]} />
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
