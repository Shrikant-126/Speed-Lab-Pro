// Email/password, sign-up and magic-link form (Supabase). Used in Settings and in the sign-in popup.
import { useState } from 'react';
import { LogIn, Mail } from 'lucide-react';
import { getSupabase } from '../lib/supabase.js';
import { Button, Notice, ErrorState, Select } from './ui.jsx';

export default function SignInForm({ autoFocus = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const sb = await getSupabase();
      if (mode === 'magic') {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
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
    <form onSubmit={submit} className="space-y-3">
      <Select value={mode} onChange={setMode} options={[{ value: 'signin', label: 'Sign in with password' }, { value: 'signup', label: 'Create account' }, { value: 'magic', label: 'Email magic link' }]} />
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input className="input" type="email" required autoFocus={autoFocus} placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      {mode !== 'magic' && <input className="input" type="password" required minLength={8} placeholder="Password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />}
      <Button type="submit" icon={mode === 'magic' ? Mail : LogIn} loading={busy} className="w-full sm:w-auto">
        {mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send link' : 'Sign in'}
      </Button>
      {msg && <Notice>{msg}</Notice>}
      {err && <ErrorState title="Authentication failed" message={err} />}
    </form>
  );
}
