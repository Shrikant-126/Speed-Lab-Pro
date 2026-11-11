// Framework-specific fixes (Vanilla JS, React, Next.js, Vue/Nuxt) generated from scan issues.
// Each group: { issue, snippets: [{ title, placement, before, after, language, notes }] }.

import { fileName } from '../format.js';

export const JS_FRAMEWORKS = [
  { key: 'vanilla', label: 'Vanilla JS / HTML' },
  { key: 'react', label: 'React (Vite / CRA)' },
  { key: 'next', label: 'Next.js' },
  { key: 'vue', label: 'Vue / Nuxt' },
];

export function detectFramework(report) {
  const l = `${report?.platform?.label || ''}`.toLowerCase();
  if (l.includes('next')) return 'next';
  if (l.includes('nuxt') || l.includes('vue')) return 'vue';
  if (l.includes('react') || l.includes('gatsby')) return 'react';
  return 'vanilla';
}

const S = (title, placement, after, language = 'javascript', before = '', notes = []) => ({ title, placement, after, before, language, notes });
const base = (u) => fileName(u || '').split('?')[0];

function lcpImage(report, fw) {
  const img = report.lcp?.image || {};
  const url = report.lcp?.imageUrl || '/hero.jpg';
  const w = img.natural?.w || 1600;
  const h = img.natural?.h || 900;
  switch (fw) {
    case 'next':
      return [S('Hero image with next/image priority', 'app/page.jsx (or the component that renders the hero)', `import Image from 'next/image';\n\nexport default function Hero() {\n  return (\n    <Image\n      src="${url}"\n      alt="…"\n      width={${w}}\n      height={${h}}\n      priority            // preloads + fetchpriority="high", disables lazy loading\n      sizes="100vw"\n      style={{ width: '100%', height: 'auto' }}\n    />\n  );\n}`, 'jsx', `<img src="${url}" loading="lazy" />`, ['For remote images add the host to images.remotePatterns in next.config.js.', 'Use priority on ONE image per page – the LCP image.'])];
    case 'react':
      return [S('Prioritised hero <img> in React', 'Hero component', `export function Hero() {\n  return (\n    <img\n      src="${url}"\n      alt="…"\n      width={${w}}\n      height={${h}}\n      fetchPriority="high"   // React 19; on React 18 use: {...{ fetchpriority: 'high' }}\n      loading="eager"\n      decoding="async"\n      style={{ width: '100%', height: 'auto' }}\n    />\n  );\n}`, 'jsx', `<img src="${url}" loading="lazy" />`, ['Render the hero in the initial HTML (SSR/SSG) if possible – a client-only React app cannot show the image before the JS bundle runs.']),
        S('Preload the hero in index.html', 'index.html <head>', `<link rel="preload" as="image" href="${url}" fetchpriority="high">`, 'html')];
    case 'vue':
      return [S('Hero image in Vue / Nuxt', 'components/Hero.vue', `<template>\n  <!-- Nuxt Image: <NuxtImg src="${url}" width="${w}" height="${h}" preload fetchpriority="high" loading="eager" /> -->\n  <img\n    src="${url}"\n    alt="…"\n    width="${w}"\n    height="${h}"\n    fetchpriority="high"\n    loading="eager"\n    decoding="async"\n    style="width:100%;height:auto"\n  />\n</template>`, 'html', '', ['Nuxt: useHead({ link: [{ rel: "preload", as: "image", href: "…", fetchpriority: "high" }] }) on the page.'])];
    default:
      return [S('Prioritise the hero image', 'HTML of the page', `<link rel="preload" as="image" href="${url}" fetchpriority="high"> <!-- in <head>, only if the image is a CSS background or JS-inserted -->\n<img src="${url}" width="${w}" height="${h}" alt="…" fetchpriority="high" loading="eager" decoding="async">`, 'html', `<img src="${url}" loading="lazy">`)];
  }
}

function thirdParty(report, fw) {
  const urls = (report.thirdParty?.entities || []).flatMap((e) => e.scriptUrls || []).slice(0, 3);
  const src = urls[0] || 'https://widget.example.com/loader.js';
  switch (fw) {
    case 'next':
      return [S('Load third-party scripts with next/script', 'app/layout.jsx', `import Script from 'next/script';\n\nexport default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>\n        {children}\n${urls.length ? urls.map((u) => `        <Script src="${u}" strategy="lazyOnload" />`).join('\n') : `        <Script src="${src}" strategy="lazyOnload" />`}\n        {/* GTM / GA: strategy="afterInteractive"; heavy widgets: "lazyOnload" */}\n      </body>\n    </html>\n  );\n}`, 'jsx', urls.map((u) => `<script src="${u}"></script>`).join('\n'), ['Google: @next/third-parties provides <GoogleTagManager gtmId="GTM-…" /> and <GoogleAnalytics gaId="G-…" /> with optimised loading.'])];
    case 'react':
      return [S('useDelayedScript hook (load on first interaction)', 'src/hooks/useDelayedScript.js', `import { useEffect } from 'react';\n\nexport function useDelayedScript(src, { timeout = 5000 } = {}) {\n  useEffect(() => {\n    let done = false;\n    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];\n    const load = () => {\n      if (done) return;\n      done = true;\n      events.forEach((e) => window.removeEventListener(e, load));\n      const s = document.createElement('script');\n      s.src = src;\n      s.async = true;\n      document.head.appendChild(s);\n    };\n    events.forEach((e) => window.addEventListener(e, load, { once: true, passive: true }));\n    const t = setTimeout(load, timeout);\n    return () => { clearTimeout(t); events.forEach((e) => window.removeEventListener(e, load)); };\n  }, [src, timeout]);\n}\n\n// Usage in App.jsx:\n${(urls.length ? urls : [src]).map((u) => `// useDelayedScript('${u}');`).join('\n')}`)];
    case 'vue':
      return [S('Delay third-party scripts in Vue / Nuxt', 'plugins/delayed-scripts.client.js (Nuxt) or main.js', `const scripts = ${JSON.stringify(urls.length ? urls : [src], null, 2)};\n\nexport default function () {\n  let done = false;\n  const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];\n  const load = () => {\n    if (done) return;\n    done = true;\n    scripts.forEach((src) => {\n      const s = document.createElement('script');\n      s.src = src; s.async = true;\n      document.head.appendChild(s);\n    });\n  };\n  events.forEach((e) => window.addEventListener(e, load, { once: true, passive: true }));\n  window.addEventListener('load', () => setTimeout(load, 5000));\n}`, 'javascript', '', ['Nuxt 3: the @nuxt/scripts module offers useScript(…, { trigger: "onNuxtReady" }) with the same idea.'])];
    default:
      return [S('Delay third-party scripts until interaction', 'Before </body>', `<script>\n(function () {\n  var scripts = ${JSON.stringify(urls.length ? urls : [src])};\n  var events = ['pointerdown', 'keydown', 'touchstart', 'scroll'], done = false;\n  function load() {\n    if (done) return; done = true;\n    scripts.forEach(function (src) { var s = document.createElement('script'); s.src = src; s.async = true; document.head.appendChild(s); });\n  }\n  events.forEach(function (e) { addEventListener(e, load, { once: true, passive: true }); });\n  addEventListener('load', function () { setTimeout(load, 5000); });\n})();\n</script>`, 'html', urls.map((u) => `<script src="${u}"></script>`).join('\n'), ['For GTM, reCAPTCHA, chat widgets with placement guide, use the "Delay / lazy scripts" tab.'])];
  }
}

function codeSplit(report, fw) {
  const heavy = (report.js?.files || []).filter((f) => !f.thirdParty).sort((a, b) => (b.unusedBytes || b.transferSize || 0) - (a.unusedBytes || a.transferSize || 0))[0];
  const note = heavy ? [`Largest first-party bundle: ${base(heavy.url)}${heavy.unusedBytes ? ` (${Math.round(heavy.unusedBytes / 1024)} KB unused)` : ''}.`] : [];
  switch (fw) {
    case 'next':
      return [S('Load heavy components on demand with next/dynamic', 'The page that uses the component', `import dynamic from 'next/dynamic';\n\nconst Reviews = dynamic(() => import('../components/Reviews'), {\n  loading: () => <div style={{ minHeight: 320 }} />, // reserve space (no CLS)\n  ssr: false,                                           // only for browser-only widgets\n});\nconst Map = dynamic(() => import('../components/StoreMap'), { ssr: false });`, 'jsx', `import Reviews from '../components/Reviews';\nimport Map from '../components/StoreMap';`, [...note, 'Run ANALYZE=true next build with @next/bundle-analyzer to find large modules; use optimizePackageImports in next.config.js for icon/UI libraries.'])];
    case 'react':
      return [S('Code-split with React.lazy + Suspense', 'App.jsx / routes', `import { lazy, Suspense } from 'react';\n\nconst Dashboard = lazy(() => import('./pages/Dashboard'));\nconst Reviews = lazy(() => import('./components/Reviews'));\n\nexport default function App() {\n  return (\n    <Suspense fallback={<div style={{ minHeight: 320 }} />}>\n      <Dashboard />\n      <Reviews />\n    </Suspense>\n  );\n}`, 'jsx', `import Dashboard from './pages/Dashboard';\nimport Reviews from './components/Reviews';`, note),
        S('Split vendor chunks (Vite)', 'vite.config.js', `export default {\n  build: {\n    target: 'es2020',\n    rollupOptions: {\n      output: {\n        manualChunks: { react: ['react', 'react-dom'], charts: ['recharts'] },\n      },\n    },\n  },\n};`)];
    case 'vue':
      return [S('Async components in Vue / Nuxt', 'Component that imports the heavy widget', `<script setup>\nimport { defineAsyncComponent } from 'vue';\nconst Reviews = defineAsyncComponent(() => import('./Reviews.vue'));\n</script>\n\n<template>\n  <!-- Nuxt: prefix with Lazy → <LazyReviews /> and add hydrate-on-visible in Nuxt 3.16+ -->\n  <Reviews />\n</template>`, 'html', `import Reviews from './Reviews.vue';`, note)];
    default:
      return [S('Load feature code only when needed (dynamic import)', 'Your main JS file', `const lazyInit = (selector, loader) => {\n  const el = document.querySelector(selector);\n  if (!el) return;\n  const io = new IntersectionObserver(async ([entry]) => {\n    if (!entry.isIntersecting) return;\n    io.disconnect();\n    (await loader()).init(el);\n  }, { rootMargin: '300px' });\n  io.observe(el);\n};\n\nlazyInit('.carousel', () => import('./carousel.js'));\nlazyInit('#reviews', () => import('./reviews.js'));`, 'javascript', `import { init as carousel } from './carousel.js';\nimport { init as reviews } from './reviews.js';`, note)];
  }
}

function longTasks(fw) {
  const yieldFn = `export function yieldToMain() {\n  if (globalThis.scheduler?.yield) return scheduler.yield();\n  return new Promise((r) => setTimeout(r, 0));\n}`;
  if (fw === 'react' || fw === 'next') {
    return [S('Keep interactions responsive (INP)', 'Components with heavy updates', `import { useState, useTransition, useDeferredValue } from 'react';\n\nexport function SearchList({ items }) {\n  const [query, setQuery] = useState('');\n  const deferred = useDeferredValue(query);     // heavy list re-renders at low priority\n  const [isPending, startTransition] = useTransition();\n  const filtered = items.filter((i) => i.name.toLowerCase().includes(deferred.toLowerCase()));\n  return (\n    <>\n      <input value={query} onChange={(e) => setQuery(e.target.value)} />\n      <button onClick={() => startTransition(() => {/* expensive state update */})}>Apply</button>\n      {isPending && <span>Updating…</span>}\n      <ul>{filtered.map((i) => <li key={i.id}>{i.name}</li>)}</ul>\n    </>\n  );\n}`, 'jsx', '', ['Wrap long loops with yieldToMain() (below) so no task exceeds ~50 ms.']), S('yieldToMain helper', 'src/utils/yield.js', yieldFn)];
  }
  return [S('Break up long tasks', 'Utility + long loops', `${yieldFn}\n\n// Usage\nasync function processAll(items) {\n  let last = performance.now();\n  for (const item of items) {\n    process(item);\n    if (performance.now() - last > 40) { await yieldToMain(); last = performance.now(); }\n  }\n}`)];
}

function renderBlocking(report, fw) {
  const files = (report.js?.files || []).filter((f) => f.renderBlocking).slice(0, 4);
  if (fw === 'next') return [S('Render-blocking scripts in Next.js', 'app/layout.jsx', `// Do not put raw <script src> tags in <head>. Use next/script:\nimport Script from 'next/script';\n${files.map((f) => `<Script src="${f.url}" strategy="afterInteractive" />`).join('\n') || '<Script src="/legacy.js" strategy="afterInteractive" />'}`, 'jsx')];
  if (fw === 'vue') return [S('Defer scripts in Nuxt', 'nuxt.config.ts', `export default defineNuxtConfig({\n  app: {\n    head: {\n      script: [\n${(files.length ? files : [{ url: '/legacy.js' }]).map((f) => `        { src: '${f.url}', defer: true },`).join('\n')}\n      ],\n    },\n  },\n});`, 'javascript')];
  return [S('Add defer / type="module"', 'index.html <head>', (files.length ? files : [{ url: '/app.js' }]).map((f) => `<script src="${f.url}" defer></script>`).join('\n'), 'html', (files.length ? files : [{ url: '/app.js' }]).map((f) => `<script src="${f.url}"></script>`).join('\n'))];
}

function fonts(fw) {
  if (fw === 'next') return [S('Self-hosted fonts with next/font', 'app/layout.jsx', `import { Inter } from 'next/font/google';\n\nconst inter = Inter({ subsets: ['latin'], display: 'swap' }); // self-hosted, preloaded, size-adjusted fallback\n\nexport default function RootLayout({ children }) {\n  return <html lang="en" className={inter.className}><body>{children}</body></html>;\n}`, 'jsx', `<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">`)];
  if (fw === 'vue') return [S('Fonts in Nuxt', 'nuxt.config.ts', `export default defineNuxtConfig({\n  modules: ['@nuxt/fonts'],   // self-hosts Google Fonts with font-display: swap + fallbacks\n  fonts: { families: [{ name: 'Inter', weights: [400, 600] }] },\n});`)];
  return [S('Self-host fonts (Fontsource) with swap', 'main.js + CSS', `// npm i @fontsource-variable/inter\nimport '@fontsource-variable/inter';\n\n/* CSS */\n/* body { font-family: 'Inter Variable', system-ui, sans-serif; } – Fontsource uses font-display: swap */`)];
}

function cls(fw) {
  const css = `.media-16x9 { aspect-ratio: 16 / 9; width: 100%; }\n.ad-slot { min-height: 250px; }`;
  if (fw === 'react' || fw === 'next') return [S('Reserve space for late content (CLS)', 'Components that load async', `export function AsyncBlock({ loading, children }) {\n  return <div style={{ minHeight: 320 }}>{loading ? <Skeleton /> : children}</div>;\n}\n\n/* CSS */\n/* ${css.replace(/\n/g, ' ')} */`, 'jsx')];
  return [S('Reserve space for late content (CLS)', 'Stylesheet', css, 'css')];
}

const MAP = {
  'lcp-lazy': lcpImage, 'lcp-fetchpriority': lcpImage, 'lcp-preload': lcpImage, 'lcp-format': lcpImage, 'lcp-oversized': lcpImage,
  'third-party-delay': thirdParty, 'third-party-blocking': thirdParty, 'third-party-facade': thirdParty,
  'js-unused': codeSplit, 'js-execution': codeSplit, 'js-legacy': codeSplit, 'js-duplicates': codeSplit,
  'js-long-tasks': (r, fw) => longTasks(fw), 'js-listeners': (r, fw) => longTasks(fw),
  'js-render-blocking': renderBlocking,
  'font-display': (r, fw) => fonts(fw), 'font-preload': (r, fw) => fonts(fw), 'font-google': (r, fw) => fonts(fw),
  'cls-shifts': (r, fw) => cls(fw), 'img-cls': (r, fw) => cls(fw), 'img-dimensions': (r, fw) => cls(fw),
};

/** Fixes for the scan's issues; falls back to best-practice snippets when nothing applies. */
export function buildFrameworkFixes(report, fw) {
  const groups = [];
  const seen = new Set();
  for (const issue of report?.issues || []) {
    const gen = MAP[issue.type];
    if (!gen) continue;
    const key = `${gen.name || issue.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ issue, snippets: gen(report, fw) });
  }
  if (!groups.length) {
    groups.push({ issue: { id: 'bp-split', title: 'Best practice: code splitting', priority: 'low' }, snippets: codeSplit(report || {}, fw) });
    groups.push({ issue: { id: 'bp-3p', title: 'Best practice: third-party scripts', priority: 'low' }, snippets: thirdParty(report || {}, fw) });
  }
  return groups;
}
