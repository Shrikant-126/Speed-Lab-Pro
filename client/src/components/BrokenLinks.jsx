import { useMemo, useState } from 'react';
import { Link2Off, Search, Download, ExternalLink, CheckCircle2, AlertTriangle, XCircle, Clock, ShieldAlert, ArrowRightLeft, MinusCircle } from 'lucide-react';
import { api, downloadText } from '../lib/api.js';
import { shortUrl } from '@speedlab/shared/format';
import { Card, CardHeader, Button, Badge, Notice, Stat, Tabs, ErrorState, cx } from './ui.jsx';
import CodeBlock from './CodeBlock.jsx';

const STATUS = {
  broken: { label: 'Broken', tone: 'red', icon: XCircle },
  'broken-anchor': { label: 'Missing #anchor', tone: 'red', icon: XCircle },
  'server-error': { label: 'Server error', tone: 'red', icon: AlertTriangle },
  redirect: { label: 'Redirects', tone: 'amber', icon: ArrowRightLeft },
  timeout: { label: 'Timeout', tone: 'amber', icon: Clock },
  restricted: { label: 'Restricted (bot protection)', tone: 'slate', icon: ShieldAlert },
  skipped: { label: 'Skipped', tone: 'slate', icon: MinusCircle },
  'not-checked': { label: 'Not checked (limit)', tone: 'slate', icon: MinusCircle },
  ok: { label: 'OK', tone: 'green', icon: CheckCircle2 },
};
const PROBLEM = ['broken', 'broken-anchor', 'server-error', 'redirect', 'timeout'];

function fixFor(r) {
  if (r.status === 'broken-anchor') return `The link points to ${r.url}, but no element on the page has id="${decodeURIComponent(r.url.slice(1))}". Add the id to the target section, or update the link.`;
  if (r.status === 'redirect') return `Update the link to the final URL to skip the redirect${r.redirectHops > 1 ? ` chain (${r.redirectHops} hops)` : ''}: ${r.finalUrl || ''}`;
  if (r.status === 'timeout') return 'The server did not answer in time. Check it manually; if the site is slow or gone, replace or remove the link.';
  if (r.status === 'server-error') return `The server returned ${r.httpStatus}. If it is your page, check the server logs; if external, contact the site or remove the link.`;
  if (r.internal) return r.type === 'link' ? 'Fix the URL in your content/menu, or add a 301 redirect from this URL to the correct page (code below).' : 'The file is missing – re-upload it or update the reference in your theme/template.';
  return 'Replace the link with a working URL (or a web.archive.org copy) or remove it.';
}

function redirectCode(rows, origin) {
  const internal = rows.filter((r) => r.internal && ['broken', 'server-error'].includes(r.status) && r.type === 'link');
  const paths = internal.map((r) => {
    try {
      return new URL(r.url).pathname;
    } catch {
      return r.url;
    }
  });
  const list = paths.length ? paths : ['/old-page/'];
  return {
    htaccess: `# .htaccess (Apache) – replace /new-page/ with the correct destination\n${list.map((p) => `Redirect 301 ${p} /new-page/`).join('\n')}`,
    nginx: `# nginx server {} block\n${list.map((p) => `location = ${p} { return 301 /new-page/; }`).join('\n')}`,
    wordpress: `<?php\n// WordPress: easiest is the free "Redirection" plugin (Tools → Redirection).\n// Or add this to functions.php:\nadd_action( 'template_redirect', function () {\n\t$map = array(\n${list.map((p) => `\t\t'${p.replace(/'/g, '')}' => '/new-page/',`).join('\n')}\n\t);\n\t$path = wp_parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );\n\tif ( isset( $map[ $path ] ) ) {\n\t\twp_safe_redirect( home_url( $map[ $path ] ), 301 );\n\t\texit;\n\t}\n} );`,
    shopify: `Shopify Admin → Online Store → Navigation → URL Redirects → Create URL redirect\n(or Import a CSV with these columns):\n\nRedirect from,Redirect to\n${list.map((p) => `${p},/new-page/`).join('\n')}`,
    vercel: `// vercel.json\n${JSON.stringify({ redirects: list.map((p) => ({ source: p, destination: '/new-page/', permanent: true })) }, null, 2)}`,
    origin,
  };
}

export default function BrokenLinks({ report }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('problems');
  const [q, setQ] = useState('');
  const [codeTab, setCodeTab] = useState(report.platform?.name === 'wordpress' ? 'wordpress' : report.platform?.name === 'shopify' ? 'shopify' : 'htaccess');

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await api('/seo/links', { method: 'POST', body: { url: report.finalUrl, max: 200 } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const order = (s) => (PROBLEM.includes(s) ? PROBLEM.indexOf(s) : 10 + Object.keys(STATUS).indexOf(s));
    return data.results
      .filter((r) => (filter === 'all' ? true : filter === 'problems' ? PROBLEM.includes(r.status) : filter === 'internal' ? r.internal : r.status === filter))
      .filter((r) => !q || `${r.url} ${r.text}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => order(a.status) - order(b.status) || b.internal - a.internal);
  }, [data, filter, q]);

  const s = data?.summary || {};
  const broken = (s.broken || 0) + (s['broken-anchor'] || 0) + (s['server-error'] || 0);
  const code = data ? redirectCode(data.results, report.finalUrl) : null;

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Status', 'HTTP', 'Type', 'Internal', 'URL', 'Link text', 'Final URL', 'Error', 'Fix'].map(esc).join(',')];
    for (const r of data.results) lines.push([STATUS[r.status]?.label || r.status, r.httpStatus, r.type, r.internal ? 'yes' : 'no', r.url, r.text, r.finalUrl, r.error, PROBLEM.includes(r.status) ? fixFor(r) : ''].map(esc).join(','));
    downloadText(lines.join('\n'), `broken-links-${new URL(report.finalUrl).host}.csv`, 'text/csv');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={Link2Off}
          title="Broken link checker"
          subtitle="Checks every link, image, stylesheet, script, iframe and #anchor on this page (up to 200 URLs, internal first)"
          actions={
            <>
              {data && <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>}
              <Button icon={Search} loading={busy} onClick={run}>{data ? 'Check again' : 'Check all links'}</Button>
            </>
          }
        />
        <div className="space-y-4 p-5">
          {busy && <Notice>Checking links… this usually takes 15–40 seconds.</Notice>}
          {error && <ErrorState title="Link check failed" message={error} />}
          {!data && !busy && !error && <p className="text-sm text-slate-500">Press <b>Check all links</b> to test the links on {shortUrl(report.finalUrl, 60)} right now (live check, not from the saved scan).</p>}
          {data && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="Checked" value={data.checked} hint={`of ${data.total} found${data.limited ? ` · ${data.limited} over limit` : ''}`} />
                <Stat label="Broken" value={broken} accent={broken ? 'red' : 'green'} tone={broken ? 'text-red-500' : undefined} />
                <Stat label="Redirects" value={s.redirect || 0} accent="amber" />
                <Stat label="Timeouts" value={s.timeout || 0} accent="amber" />
                <Stat label="OK" value={s.ok || 0} accent="green" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs
                  tabs={[
                    { key: 'problems', label: 'Problems', count: rows.length && filter === 'problems' ? rows.length : undefined },
                    { key: 'internal', label: 'Internal' },
                    { key: 'restricted', label: 'Restricted' },
                    { key: 'ok', label: 'OK' },
                    { key: 'all', label: 'All' },
                  ]}
                  value={filter}
                  onChange={setFilter}
                />
                <input className="input max-w-xs" placeholder="Search URL or link text…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {rows.length ? (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Status</th><th>URL</th><th>Type</th><th className="min-w-[260px]">How to fix</th></tr></thead>
                    <tbody>
                      {rows.slice(0, 300).map((r) => {
                        const S = STATUS[r.status] || STATUS.broken;
                        return (
                          <tr key={`${r.type}-${r.url}`}>
                            <td className="whitespace-nowrap">
                              <Badge tone={S.tone}><S.icon size={12} /> {S.label}</Badge>
                              {r.httpStatus && <p className="mt-1 text-xs text-slate-500">HTTP {r.httpStatus}</p>}
                            </td>
                            <td className="max-w-[420px]">
                              {/^https?:/.test(r.url) ? (
                                <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 break-all text-brand-700 hover:underline dark:text-brand-300">{shortUrl(r.url, 80)} <ExternalLink size={11} className="shrink-0" /></a>
                              ) : <code className="text-xs">{r.url}</code>}
                              {r.text && <p className="truncate text-xs text-slate-500">“{r.text}”</p>}
                              {r.finalUrl && <p className="truncate text-xs text-amber-600 dark:text-amber-400">→ {shortUrl(r.finalUrl, 80)}</p>}
                              {r.error && <p className="text-xs text-red-500">{r.error}</p>}
                            </td>
                            <td><Badge>{r.type}</Badge> <span className={cx('text-xs', r.internal ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500')}>{r.internal ? 'internal' : 'external'}</span>{r.count > 1 && <p className="text-xs text-slate-400">{r.count}× on page</p>}</td>
                            <td className="text-sm text-slate-600 dark:text-slate-300">{PROBLEM.includes(r.status) ? fixFor(r) : r.status === 'restricted' ? 'The site blocks automated checks – open it in a browser to confirm.' : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={16} /> No {filter === 'problems' ? 'problems' : 'links'} in this view.</p>
              )}
            </>
          )}
        </div>
      </Card>
      {data && (
        <Card>
          <CardHeader title="301 redirect code for broken internal pages" subtitle="Point each broken URL to the right page – replace /new-page/ with the real destination" actions={<Tabs tabs={[{ key: 'htaccess', label: 'Apache' }, { key: 'nginx', label: 'Nginx' }, { key: 'wordpress', label: 'WordPress' }, { key: 'shopify', label: 'Shopify' }, { key: 'vercel', label: 'Vercel' }]} value={codeTab} onChange={setCodeTab} />} />
          <div className="p-5">
            <CodeBlock code={code[codeTab]} language={codeTab === 'wordpress' ? 'php' : codeTab === 'vercel' ? 'json' : codeTab === 'nginx' ? 'nginx' : 'text'} tone="after" />
          </div>
        </Card>
      )}
    </div>
  );
}
