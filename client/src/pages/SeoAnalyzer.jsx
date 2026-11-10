import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchCheck, CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, ExternalLink, RotateCcw, Tags, FileJson, Globe, Share2, ListTree, ShieldCheck } from 'lucide-react';
import RequireReport from '../components/RequireReport.jsx';
import ScoreGauge from '../components/ScoreGauge.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import { Card, CardHeader, PageHeader, Tabs, Badge, Button, EmptyState, Notice, Stat, KeyValue, cx } from '../components/ui.jsx';

const STATUS = {
  pass: { icon: CheckCircle2, cls: 'text-emerald-500', label: 'Passed', tone: 'green' },
  warn: { icon: AlertTriangle, cls: 'text-amber-500', label: 'Warning', tone: 'amber' },
  fail: { icon: XCircle, cls: 'text-red-500', label: 'Failed', tone: 'red' },
  info: { icon: Info, cls: 'text-sky-500', label: 'Info', tone: 'blue' },
  manual: { icon: Info, cls: 'text-slate-400', label: 'Manual check', tone: 'slate' },
};
const SEV_TONE = { critical: 'red', high: 'orange', medium: 'amber', low: 'blue' };

function CheckRow({ c, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const S = STATUS[c.status] || STATUS.info;
  return (
    <div className="border-b border-slate-100 last:border-0 dark:border-white/[0.05]">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-5 py-3.5 text-left" aria-expanded={open}>
        <S.icon size={19} className={cx('mt-0.5 shrink-0', S.cls)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900 dark:text-white">{c.title}</p>
            {c.severity && c.status !== 'pass' && <Badge tone={SEV_TONE[c.severity]} className="capitalize">{c.severity}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{c.detail}</p>
        </div>
        <ChevronDown size={17} className={cx('mt-1 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 px-5 pb-5 pl-[52px]">
          {c.fix && (
            <div>
              <p className="label">How to fix</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{c.fix}</p>
            </div>
          )}
          {c.items?.length > 0 && (
            <div>
              <p className="label">Affected</p>
              <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-slate-600 dark:text-slate-400">
                {c.items.map((i) => <li key={i} className="break-all">{i}</li>)}
              </ul>
            </div>
          )}
          {c.code && <CodeBlock code={c.code} language={c.codeLang || 'html'} tone="after" title="Recommended code" />}
          {c.shopify && <Notice>{/^</.test(c.shopify) ? <>Shopify Liquid: <code>{c.shopify}</code></> : c.shopify}</Notice>}
        </div>
      )}
    </div>
  );
}

function CheckList({ checks, title, subtitle, icon }) {
  const order = { fail: 0, warn: 1, info: 2, manual: 3, pass: 4 };
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <Card>
      <CardHeader icon={icon} title={title} subtitle={subtitle} />
      {sorted.length ? sorted.map((c) => <CheckRow key={c.id} c={c} defaultOpen={c.status === 'fail'} />) : <p className="p-5 text-sm text-slate-500">No checks.</p>}
    </Card>
  );
}

function SerpPreview({ meta, url }) {
  let crumbs = url;
  try {
    const u = new URL(url);
    crumbs = `${u.host}${u.pathname.replace(/\/$/, '').split('/').filter(Boolean).map((p) => ` › ${p}`).join('')}`;
  } catch { /* keep */ }
  const t = meta.title || 'No title';
  const d = meta.description || 'No meta description – Google will pick text from the page.';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950">
      <p className="text-xs text-slate-500">Google search preview (approximate)</p>
      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">{crumbs}</p>
      <p className="mt-0.5 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{t.length > 60 ? `${t.slice(0, 58)}…` : t}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{d.length > 158 ? `${d.slice(0, 155)}…` : d}</p>
    </div>
  );
}

function SocialPreview({ og, url }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
      <div className="flex aspect-[1.91/1] items-center justify-center bg-slate-100 dark:bg-slate-800">
        {og.image ? <img src={og.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <span className="text-xs text-slate-400">No og:image</span>}
      </div>
      <div className="p-3">
        <p className="text-[11px] uppercase text-slate-500">{(() => { try { return new URL(og.url || url).host; } catch { return ''; } })()}</p>
        <p className="truncate font-semibold text-slate-900 dark:text-white">{og.title || 'No og:title'}</p>
        <p className="line-clamp-2 text-sm text-slate-500">{og.description || 'No og:description'}</p>
      </div>
    </div>
  );
}

function SeoPage({ report }) {
  const seo = report.seo;
  const [tab, setTab] = useState('all');
  const groups = useMemo(() => {
    const all = [...seo.checks, ...seo.tagChecks];
    const by = (g) => all.filter((c) => c.group === g);
    return {
      all,
      onpage: by('On-page'),
      indexing: [...by('Indexing'), ...by('Crawlability')],
      social: by('Social'),
      sd: by('Structured data'),
      tags: seo.tagChecks,
    };
  }, [seo]);
  const count = (s) => groups.all.filter((c) => c.status === s).length;
  const a = seo.analytics;
  const tools = [
    ['Google Rich Results Test', `https://search.google.com/test/rich-results?url=${encodeURIComponent(report.finalUrl)}`],
    ['Schema Markup Validator', `https://validator.schema.org/#url=${encodeURIComponent(report.finalUrl)}`],
    ['Google Tag Assistant', 'https://tagassistant.google.com/'],
    ['Google Search Console', 'https://search.google.com/search-console'],
    ['Facebook Sharing Debugger', `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(report.finalUrl)}`],
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={SearchCheck} title="SEO & Analytics" description="On-page SEO, indexing and crawlability, social previews, structured data validation and Google Tag Manager / GA4 / consent-mode checks — each with a fix and ready-to-use code." />
      {!seo.htmlAvailable && <Notice tone="warn">The page HTML could not be downloaded for this scan, so most SEO checks are unavailable.</Notice>}

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card className="flex items-center gap-6 p-6">
          <ScoreGauge score={seo.score} label="SpeedLab SEO score" size={120} />
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> {count('pass')} passed</p>
            <p className="flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> {count('warn')} warnings</p>
            <p className="flex items-center gap-2"><XCircle size={16} className="text-red-500" /> {count('fail')} failed</p>
            <p className="text-xs text-slate-500">Lighthouse SEO: {seo.lighthouseScore ?? 'unavailable'}</p>
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <SerpPreview meta={seo.meta} url={report.finalUrl} />
          <SocialPreview og={seo.meta.og} url={report.finalUrl} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Words (HTML)" value={seo.words.toLocaleString()} icon={ListTree} accent="blue" />
        <Stat label="Images missing alt" value={seo.images.missingAlt} hint={`${seo.images.total} images`} icon={Globe} accent={seo.images.missingAlt ? 'amber' : 'green'} />
        <Stat label="Links" value={seo.links.internal + seo.links.external} hint={`${seo.links.internal} internal · ${seo.links.external} external`} icon={Share2} accent="pink" />
        <Stat label="Schema types" value={seo.structuredData.types.length} hint={seo.structuredData.errors ? `${seo.structuredData.errors} errors` : 'No errors'} icon={FileJson} accent={seo.structuredData.errors ? 'red' : 'green'} />
      </div>

      <Tabs
        tabs={[
          { key: 'all', label: 'All checks', count: groups.all.length },
          { key: 'onpage', label: 'On-page', count: groups.onpage.length },
          { key: 'indexing', label: 'Indexing & crawl', count: groups.indexing.length },
          { key: 'social', label: 'Social', count: groups.social.length },
          { key: 'sd', label: 'Structured data' },
          { key: 'tags', label: 'Analytics & GTM', count: groups.tags.length },
          { key: 'lighthouse', label: 'Lighthouse SEO', count: seo.lighthouse.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'all' && <CheckList checks={groups.all} title="All SEO & tracking checks" subtitle="Failed and warning checks first. Click a check for the fix and code." icon={ShieldCheck} />}
      {tab === 'onpage' && (
        <>
          <CheckList checks={groups.onpage} title="On-page SEO" icon={ListTree} />
          <Card>
            <CardHeader title="Heading outline" subtitle="From the server-rendered HTML" />
            <div className="max-h-96 space-y-1 overflow-auto p-5 text-sm">
              {seo.headings.length ? seo.headings.map((h, i) => (
                <p key={i} style={{ paddingLeft: (h.level - 1) * 18 }} className="truncate"><Badge tone={h.level === 1 ? 'brand' : 'slate'}>H{h.level}</Badge> <span className="ml-1">{h.text || '(empty)'}</span></p>
              )) : <p className="text-slate-500">No headings found.</p>}
            </div>
          </Card>
        </>
      )}
      {tab === 'indexing' && (
        <>
          <CheckList checks={groups.indexing} title="Indexing & crawlability" icon={Globe} />
          {seo.robots?.excerpt && <CodeBlock code={seo.robots.excerpt} language="text" title="robots.txt (current)" />}
        </>
      )}
      {tab === 'social' && <CheckList checks={groups.social} title="Social sharing (Open Graph & X)" icon={Share2} />}
      {tab === 'sd' && (
        <div className="space-y-4">
          <CheckList checks={groups.sd} title="Structured data" icon={FileJson} />
          {seo.structuredData.blocks.map((b, i) => (
            <Card key={i}>
              <CardHeader title={`JSON-LD block ${i + 1}`} subtitle={b.valid ? `Types: ${b.nodes.flatMap((n) => n.types).join(', ') || 'none'}` : b.error} actions={<Badge tone={!b.valid || b.nodes.some((n) => n.errors.length) ? 'red' : 'green'}>{!b.valid ? 'Invalid JSON' : b.nodes.some((n) => n.errors.length) ? 'Errors' : 'Valid'}</Badge>} />
              <div className="space-y-3 p-5">
                {b.nodes.flatMap((n) => n.errors).map((e) => <p key={e} className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"><XCircle size={15} className="mt-0.5 shrink-0" />{e}</p>)}
                {b.nodes.flatMap((n) => n.warnings).slice(0, 12).map((w) => <p key={w} className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{w}</p>)}
                <CodeBlock code={(() => { try { return JSON.stringify(JSON.parse(b.raw), null, 2); } catch { return b.raw; } })()} language="json" title="Found on page" maxHeight={300} />
              </div>
            </Card>
          ))}
          <Card>
            <CardHeader title="Ready-to-use schema templates" subtitle="Fill in real values that match the visible page content, then validate with the Rich Results Test" />
            <div className="space-y-4 p-5">
              {Object.entries(seo.structuredData.templates).map(([k, code]) => <CodeBlock key={k} code={code} language="html" title={k} maxHeight={260} />)}
            </div>
          </Card>
        </div>
      )}
      {tab === 'tags' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="GTM containers" value={a.gtm.length || '—'} hint={a.gtm.join(', ') || 'none found'} accent={a.gtm.length ? 'green' : 'amber'} />
            <Stat label="GA4" value={a.ga4.length || '—'} hint={a.ga4.join(', ') || 'none in HTML'} accent={a.ga4.length ? 'green' : 'amber'} />
            <Stat label="Google Ads / Meta" value={(a.ads.length + a.fbPixel.length) || '—'} hint={[...a.ads, ...a.fbPixel.map((p) => `Pixel ${p}`)].join(', ') || 'none'} accent="blue" />
            <Stat label="Consent mode" value={a.consentDefault ? 'Yes' : 'No'} hint={a.cmp ? 'Consent platform detected' : 'No CMP detected'} accent={a.consentDefault ? 'green' : 'red'} />
          </div>
          <CheckList checks={groups.tags} title="Tag & analytics validation" subtitle="Checks the installed snippets, duplicates, dataLayer order, consent mode and whether hits were sent during the test load" icon={Tags} />
          <Notice>Tags configured inside GTM are not visible in the page HTML. Use Google Tag Assistant to confirm which tags fire and in which order.</Notice>
        </div>
      )}
      {tab === 'lighthouse' && (
        <Card>
          <CardHeader title="Lighthouse SEO audits" subtitle={seo.lighthouseScore !== null ? `Lighthouse SEO score ${seo.lighthouseScore}` : 'Unavailable for this scan'} />
          {seo.lighthouse.length ? seo.lighthouse.map((l) => (
            <CheckRow key={l.id} c={{ id: l.id, title: l.title, detail: l.description, status: l.status, items: l.items }} defaultOpen={false} />
          )) : <p className="p-5 text-sm text-slate-500">No Lighthouse SEO data.</p>}
        </Card>
      )}

      <Card>
        <CardHeader title="Validate with official tools" />
        <div className="flex flex-wrap gap-2 p-5">
          {tools.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm" icon={ExternalLink}>{label}</Button>
            </a>
          ))}
        </div>
      </Card>
      <KeyValue
        className="card p-5"
        items={[
          ['Canonical', seo.meta.canonical || '—'],
          ['Robots', seo.meta.robots || 'index, follow (default)'],
          ['Language', seo.meta.lang || '—'],
          ['hreflang', seo.meta.hreflangs.length ? `${seo.meta.hreflangs.length} alternates` : '—'],
        ]}
      />
    </div>
  );
}

export default function SeoAnalyzer() {
  return (
    <RequireReport title="SEO & Analytics">
      {(report) =>
        report.seo ? (
          <SeoPage report={report} />
        ) : (
          <EmptyState
            icon={SearchCheck}
            title="SEO analysis is not in this scan yet"
            description="This scan was made before SEO & Analytics checks were added. Retest the page to get the full SEO, structured data and GTM report."
            action={
              <Link to={`/analyzer?url=${encodeURIComponent(report.finalUrl)}&strategy=${report.strategy}&base=${report.id || ''}&run=1`}>
                <Button icon={RotateCcw}>Retest now</Button>
              </Link>
            }
          />
        )
      }
    </RequireReport>
  );
}
