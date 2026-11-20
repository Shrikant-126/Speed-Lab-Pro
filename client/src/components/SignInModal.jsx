// "Please sign in" popup shown when a signed-out user tries to run a scan.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock, X } from 'lucide-react';
import SignInForm from './SignInForm.jsx';

export default function SignInModal({ open, onClose, title = 'Please sign in', message = 'Sign in to analyze a website. Your scans, history and reports are saved to your account.' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="signin-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="animate-fade-up relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#0b1214]">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-white">
          <X size={18} />
        </button>
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-400 shadow-[0_0_24px_rgba(194,238,42,0.45)]">
            <Lock size={20} className="text-[#04090a]" />
          </span>
          <div>
            <h2 id="signin-title" className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>
          </div>
        </div>
        <SignInForm autoFocus />
      </div>
    </div>,
    document.body,
  );
}
