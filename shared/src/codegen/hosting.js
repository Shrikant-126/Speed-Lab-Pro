// Hosting detection (from response headers / HTML) and hosting-aware optimisation plugin
// recommendations. Host policies change – every recommendation links the host's own docs
// and should be confirmed there before installing.

const HOSTS = [
  {
    key: 'wpengine',
    name: 'WP Engine',
    test: (h, s) => h['wpe-backend'] || h['x-wpe-loopback-upstream-addr'] || h['x-wpe-request-id'] || /wpengine/i.test(s.html.slice(0, 50000)) || /wpenginepowered\.com/.test(s.urls),
    caching: 'Server-level page cache (EverCache) + optional CDN. Do NOT add another page-cache plugin.',
    docs: 'https://wpengine.com/support/disallowed-plugins/',
    recommended: [
      { name: 'WP Rocket', why: 'Allowed. WP Rocket detects WP Engine and turns off its own page cache automatically, keeping file optimisation, lazy load, delay JS and Remove Unused CSS.', settings: 'File Optimization → Minify CSS/JS, Load JS deferred, Delay JS; Media → LazyLoad. Leave caching to WP Engine.' },
      { name: 'Perfmatters', why: 'No caching – only asset/script control, so it never conflicts with EverCache.', settings: 'Script Manager to unload plugin assets per page; Delay JavaScript; Preload & preconnect.' },
      { name: 'Autoptimize', why: 'CSS/JS aggregation & minify without page caching.', settings: 'Enable "Optimize JavaScript/CSS", "Defer", and "Lazy-load images".' },
      { name: 'ShortPixel / Imagify / EWWW', why: 'Image compression + WebP/AVIF; compatible.', settings: 'Use the plugin’s “serve WebP via <picture>” option (WP Engine’s CDN does not rewrite formats).' },
    ],
    avoid: [
      { name: 'W3 Total Cache, WP Super Cache, WP Fastest Cache, WP File Cache, Cache Enabler', why: 'Page-cache plugins are on WP Engine’s disallowed list – they conflict with EverCache.' },
      { name: 'LiteSpeed Cache (page cache)', why: 'Needs a LiteSpeed web server; WP Engine runs Nginx/Apache, so its cache will not work.' },
    ],
  },
  {
    key: 'kinsta',
    name: 'Kinsta',
    test: (h) => h['ki-cf-cache-status'] || h['x-kinsta-cache'] || h['ki-edge'] || /kinsta/i.test(h['x-powered-by'] || ''),
    caching: 'Server-level full-page cache + Cloudflare edge cache (Kinsta CDN).',
    docs: 'https://kinsta.com/docs/wordpress-hosting/wordpress-plugins-themes/banned-plugins/',
    recommended: [
      { name: 'WP Rocket', why: 'Kinsta-compatible; page caching is disabled automatically on Kinsta, optimisation features stay.', settings: 'Use file optimisation, lazy load and Delay JS; skip caching options.' },
      { name: 'Perfmatters', why: 'Script manager and lightweight tweaks; no cache.', settings: 'Disable unused assets, delay third-party JS.' },
      { name: 'Kinsta MU plugin (pre-installed)', why: 'Clears Kinsta cache on content changes – keep it active.', settings: 'MyKinsta → Tools → enable Edge Caching & CDN.' },
    ],
    avoid: [{ name: 'W3 Total Cache, WP Super Cache, WP Fastest Cache, LiteSpeed Cache', why: 'Caching plugins are banned/redundant on Kinsta.' }],
  },
  {
    key: 'siteground',
    name: 'SiteGround',
    test: (h) => /siteground/i.test(h['x-proxy-cache-info'] || '') || h['x-sg-id'] || /sg-?cache|siteground/i.test(JSON.stringify(h)),
    caching: 'NGINX Direct Delivery + Dynamic Cache (managed by the Speed Optimizer plugin).',
    docs: 'https://www.siteground.com/tutorials/wordpress/speed-optimizer/',
    recommended: [
      { name: 'Speed Optimizer (SiteGround Optimizer)', why: 'Controls SiteGround’s server cache and adds minify, lazy load, WebP and font optimisation.', settings: 'Caching → Dynamic Caching ON; Frontend → Minify HTML/CSS/JS, Defer render-blocking JS; Media → Lazy Load, WebP.' },
      { name: 'WP Rocket (optional)', why: 'Compatible; disable Speed Optimizer frontend options that overlap to avoid double minification.', settings: 'Use either WP Rocket or Speed Optimizer frontend features – not both.' },
    ],
    avoid: [{ name: 'LiteSpeed Cache', why: 'SiteGround does not run LiteSpeed web servers.' }, { name: 'A second page-cache plugin', why: 'Conflicts with SiteGround Dynamic Cache.' }],
  },
  {
    key: 'litespeed',
    name: 'LiteSpeed server (e.g. Hostinger, A2, NameHero, QUIC.cloud)',
    test: (h) => /litespeed/i.test(h.server || '') || h['x-litespeed-cache'] || h['x-qc-cache'] || h['x-qc-pop'],
    caching: 'LiteSpeed Web Server with LSCache (server-level page cache).',
    docs: 'https://docs.litespeedtech.com/lscache/lscwp/',
    recommended: [
      { name: 'LiteSpeed Cache', why: 'Best choice here: it drives the server’s LSCache, plus CSS/JS optimisation, UCSS/CCSS (via QUIC.cloud), image optimisation and lazy load – all free.', settings: 'Cache ON; Page Optimization → CSS/JS Minify, Load CSS Asynchronously, Load JS Deferred/Delayed; Media → Lazy Load + Viewport Images.' },
      { name: 'Perfmatters (optional)', why: 'Script manager for unloading plugin assets; no cache conflict.', settings: 'Script Manager only; leave optimisation to LiteSpeed Cache.' },
    ],
    avoid: [{ name: 'WP Rocket, W3 Total Cache, WP Super Cache (page cache)', why: 'Duplicate page caching on a LiteSpeed server wastes the built-in LSCache and can cause stale pages.' }],
  },
  {
    key: 'cloudways',
    name: 'Cloudways',
    test: (h, s) => /cloudways/i.test(JSON.stringify(h)) || /cloudwaysapps\.com/.test(s.urls) || (h['x-cache'] && /varnish/i.test(h.via || '') && h['x-breeze']),
    caching: 'Varnish + Redis/Memcached; Breeze plugin integrates with Varnish.',
    docs: 'https://support.cloudways.com/en/articles/5126470-how-to-configure-breeze-wordpress-cache-plugin',
    recommended: [
      { name: 'Breeze', why: 'Cloudways’ own free plugin; purges Varnish and adds minify/lazy load.', settings: 'Enable Varnish auto-purge, minify, lazy load.' },
      { name: 'WP Rocket', why: 'Officially compatible with Cloudways Varnish (enable Varnish add-on in WP Rocket).', settings: 'Add-ons → Varnish ON; File Optimization + Delay JS.' },
      { name: 'Object Cache Pro / Redis Object Cache', why: 'Uses the Redis available on Cloudways for faster dynamic pages (lower TTFB).', settings: 'Enable Redis in the Cloudways panel first.' },
    ],
    avoid: [{ name: 'LiteSpeed Cache', why: 'Cloudways (Apache/Nginx) is not LiteSpeed.' }],
  },
  {
    key: 'flywheel',
    name: 'Flywheel',
    test: (h) => h['x-fw-hash'] || h['x-fw-serve'] || /flywheel/i.test(JSON.stringify(h)),
    caching: 'Server-level FlyCache.',
    docs: 'https://getflywheel.com/wordpress-support/what-plugins-are-not-allowed/',
    recommended: [
      { name: 'Perfmatters', why: 'Asset control without caching.', settings: 'Script Manager + Delay JS.' },
      { name: 'Autoptimize', why: 'Minify/aggregate without page cache.', settings: 'Optimize CSS/JS + lazy load.' },
    ],
    avoid: [{ name: 'Page-cache plugins (W3TC, WP Super Cache, WP Fastest Cache)', why: 'Disallowed on Flywheel – FlyCache handles caching.' }],
  },
  {
    key: 'pantheon',
    name: 'Pantheon',
    test: (h) => h['x-pantheon-styx-hostname'] || h['x-styx-req-id'] || /pantheon/i.test(h['x-served-by'] || ''),
    caching: 'Global CDN (Fastly) page cache.',
    docs: 'https://docs.pantheon.io/plugins-known-issues',
    recommended: [
      { name: 'Pantheon Advanced Page Cache', why: 'Surrogate-key cache purging for the Global CDN.', settings: 'Activate; no configuration needed.' },
      { name: 'Autoptimize / Perfmatters', why: 'Asset optimisation only.', settings: 'Minify + defer + lazy load.' },
    ],
    avoid: [{ name: 'Page-cache plugins', why: 'Redundant with Pantheon’s CDN; check Pantheon’s known-issues list.' }],
  },
  {
    key: 'godaddy',
    name: 'GoDaddy Managed WordPress',
    test: (h, s) => /godaddy|secureserver/i.test(JSON.stringify(h)) || /wp-content\/mu-plugins\/gd-system-plugin/.test(s.html),
    caching: 'Managed page cache + CDN (GoDaddy system plugin).',
    docs: 'https://www.godaddy.com/help/blocked-plugins-8964',
    recommended: [
      { name: 'Perfmatters / Autoptimize', why: 'Non-caching optimisation is the safe option.', settings: 'Minify, defer, delay JS, lazy load.' },
    ],
    avoid: [{ name: 'Caching plugins (W3TC, WP Super Cache, WP Fastest Cache…)', why: 'On GoDaddy’s blocked list for Managed WordPress.' }],
  },
  {
    key: 'wpcom',
    name: 'WordPress.com',
    test: (h) => /wordpress\.com/i.test(h['host-header'] || '') || h['x-ac'] || /wpcom/i.test(JSON.stringify(h)),
    caching: 'Automattic edge cache (Batcache + global CDN).',
    docs: 'https://wordpress.com/support/plugins/incompatible-plugins/',
    recommended: [{ name: 'Jetpack Boost', why: 'Critical CSS, defer non-essential JS, image CDN – designed for WordPress.com.', settings: 'Enable Optimize CSS Loading, Defer JS, Image CDN.' }],
    avoid: [{ name: 'Caching plugins', why: 'Listed as incompatible on WordPress.com.' }],
  },
  {
    key: 'cloudflare-apo',
    name: 'Cloudflare (in front of your host)',
    test: (h) => h['cf-ray'] && /cf-apo-via|cf-edge-cache/i.test(JSON.stringify(h)),
    caching: 'Cloudflare APO caches HTML at the edge.',
    docs: 'https://developers.cloudflare.com/automatic-platform-optimization/',
    recommended: [{ name: 'Cloudflare plugin (for APO)', why: 'Keeps the APO edge cache in sync with WordPress content changes.', settings: 'Enable APO; exclude logged-in/cart cookies.' }],
    avoid: [{ name: 'Rocket Loader together with a Delay-JS plugin', why: 'Both rewrite script loading and frequently break each other.' }],
  },
  {
    key: 'apache',
    name: 'Apache / shared hosting (generic)',
    test: (h) => /apache/i.test(h.server || ''),
    caching: 'No server page cache detected.',
    docs: null,
    recommended: [
      { name: 'WP Rocket (paid) or WP Fastest Cache / W3 Total Cache (free)', why: 'You need a page-cache plugin because the host does not cache HTML.', settings: 'Enable page cache + browser cache (.htaccess), minify, lazy load, delay JS.' },
      { name: 'ShortPixel / Imagify', why: 'Image compression + WebP.', settings: 'WebP via <picture> or .htaccess rewrite.' },
    ],
    avoid: [{ name: 'LiteSpeed Cache (page cache)', why: 'Only works on LiteSpeed servers.' }],
  },
  {
    key: 'nginx',
    name: 'Nginx (generic / VPS)',
    test: (h) => /nginx/i.test(h.server || ''),
    caching: 'No managed page cache detected (unless configured as FastCGI cache).',
    docs: null,
    recommended: [
      { name: 'WP Rocket or Nginx Helper + FastCGI cache', why: 'Nginx does not read .htaccess; WP Rocket works with its Nginx config rules, or use FastCGI cache + Nginx Helper for purging.', settings: 'Add WP Rocket’s Nginx rules (rocket-nginx) or enable fastcgi_cache.' },
      { name: 'Redis Object Cache', why: 'If Redis is available on the server, reduces database time (TTFB).', settings: 'Install Redis server, then the plugin.' },
    ],
    avoid: [{ name: 'LiteSpeed Cache (page cache)', why: 'Requires LiteSpeed/OpenLiteSpeed.' }],
  },
];

const SHOPIFY = {
  key: 'shopify',
  name: 'Shopify',
  caching: 'Shopify’s global CDN caches storefront assets and pages – no caching app is needed.',
  docs: 'https://help.shopify.com/en/manual/online-store/store-speed',
  recommended: [
    { name: 'Native Shopify features (no app)', why: 'image_url/image_tag already serve WebP/AVIF and responsive sizes; lazy loading is built into image_tag.', settings: 'Use loading: \'lazy\' below the fold and fetchpriority/preload on the hero (see Code Generator).' },
    { name: 'Remove unused apps', why: 'Leftover app scripts are the #1 Shopify speed problem.', settings: 'Online Store → Themes → Customize → App embeds: turn off unused; delete leftover snippets.' },
    { name: 'Image optimiser app (optional, e.g. TinyIMG / Crush.pics)', why: 'Compresses originals before upload; Shopify already converts formats.', settings: 'Compress originals only; avoid apps that inject lazy-load JavaScript.' },
  ],
  avoid: [{ name: '“Speed booster” apps that inject JavaScript', why: 'Many add their own scripts or fake lazy loading and can make real-user metrics worse. Prefer theme code changes.' }],
};

/** Detect hosting from stored report data (works for old scans too). */
export function detectHosting(report) {
  const headers = Object.fromEntries(Object.entries(report?.network?.document?.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  if (report?.network?.document?.server && !headers.server) headers.server = report.network.document.server;
  const urls = (report?.resources?.requests || []).map((r) => r.url).join('\n');
  const signals = { html: '', urls };
  const cdn = report?.network?.document?.cdn || [];
  if (report?.platform?.name === 'shopify') return { ...SHOPIFY, platform: 'shopify', cdn, evidence: ['Shopify platform detected'] };
  const found = HOSTS.filter((h) => {
    try {
      return !!h.test(headers, signals);
    } catch {
      return false;
    }
  });
  // Prefer specific managed hosts over generic server types.
  const generic = ['apache', 'nginx', 'cloudflare-apo'];
  const primary = found.find((h) => !generic.includes(h.key)) || found.find((h) => h.key !== 'cloudflare-apo') || null;
  const evidence = [];
  if (headers.server) evidence.push(`server: ${headers.server}`);
  for (const k of ['x-litespeed-cache', 'wpe-backend', 'x-kinsta-cache', 'ki-cf-cache-status', 'x-cache', 'cf-cache-status', 'x-proxy-cache-info', 'x-fw-serve']) if (headers[k]) evidence.push(`${k}: ${headers[k]}`);
  return {
    ...(primary || { key: 'unknown', name: 'Unknown host', caching: 'Could not identify the host or a server cache from the response headers.', docs: null, recommended: [], avoid: [] }),
    platform: report?.platform?.name || null,
    cachePlugin: report?.platform?.cachePlugin || null,
    alsoDetected: found.filter((h) => h !== primary).map((h) => h.name),
    cdn,
    cacheStatus: report?.network?.document?.cacheStatus || null,
    evidence,
    isWordPress: report?.platform?.name === 'wordpress',
  };
}
