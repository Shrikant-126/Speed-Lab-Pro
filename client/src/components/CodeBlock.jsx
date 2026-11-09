import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { downloadText } from '../lib/api.js';
import { cx } from './ui.jsx';

const EXT = { html: 'html', css: 'css', javascript: 'js', liquid: 'liquid', php: 'php', nginx: 'conf', apache: 'htaccess', json: 'json', bash: 'sh', text: 'txt' };

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export default function CodeBlock({ code, language = 'text', title, tone = 'neutral', filename, maxHeight = 420 }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  const border = tone === 'before' ? 'border-red-500/30' : tone === 'after' ? 'border-emerald-500/40' : 'border-slate-700/60';
  return (
    <div className={cx('overflow-hidden rounded-xl border bg-slate-950 text-slate-100', border)}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          {tone === 'before' && <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-semibold text-red-300">BEFORE</span>}
          {tone === 'after' && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-semibold text-emerald-300">AFTER</span>}
          <span className="truncate text-slate-400">{title || language}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onCopy} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" aria-label="Copy code">
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => downloadText(code, filename || `speedlab-snippet.${EXT[language] || 'txt'}`)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            aria-label="Download code"
          >
            <Download size={13} />
          </button>
        </div>
      </div>
      <pre className="code-scroll overflow-auto p-3.5 font-mono text-[12.5px] leading-relaxed" style={{ maxHeight }}>
        <code>{code || '// (empty)'}</code>
      </pre>
    </div>
  );
}
