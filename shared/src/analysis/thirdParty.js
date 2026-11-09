// Third-party script analysis with category detection and delay/conditional-load guidance.
// Recommendations always explain the business consequence of delaying/removing a tag.

import { audit, rows, urlOf, entityName, subItems } from './lhr.js';
import { makeIssue, priorityFromSavings } from './issue.js';

export const THIRD_PARTY_CATALOG = [
  { match: /googletagmanager\.com\/gtm\.js|Google Tag Manager/i, name: 'Google Tag Manager', category: 'tag-manager', delayable: 'partial', note: 'GTM loads other tags; delaying it delays every tag inside it (analytics, ads, pixels).' },
  { match: /google-analytics\.com|googletagmanager\.com\/gtag|Google Analytics/i, name: 'Google Analytics', category: 'analytics', delayable: 'yes', note: 'Delaying GA by a few seconds or until interaction can miss very short sessions/bounces; pageviews are still recorded for engaged users.' },
  { match: /connect\.facebook\.net|Facebook/i, name: 'Meta (Facebook) Pixel', category: 'advertising', delayable: 'yes', note: 'Delaying the Pixel can reduce attributed PageView events for users who leave immediately; conversion events after interaction are unaffected.' },
  { match: /doubleclick\.net|googleadservices|googlesyndication|Google\/Doubleclick Ads|Google Ads/i, name: 'Google Ads', category: 'advertising', delayable: 'yes', note: 'Conversion tracking must still fire on conversion pages; remarketing tags can be delayed.' },
  { match: /tiktok/i, name: 'TikTok Pixel', category: 'advertising', delayable: 'yes', note: 'Same attribution trade-off as other ad pixels.' },
  { match: /snap\.licdn|linkedin/i, name: 'LinkedIn Insight', category: 'advertising', delayable: 'yes', note: 'Delay until interaction; minor attribution loss for immediate bounces.' },
  { match: /pinterest|pinimg\.com\/ct/i, name: 'Pinterest Tag', category: 'advertising', delayable: 'yes', note: 'Delay until interaction.' },
  { match: /hotjar|clarity\.ms|fullstory|mouseflow|luckyorange|crazyegg|Microsoft Clarity/i, name: 'Session recording / heatmaps', category: 'analytics', delayable: 'yes', note: 'Recordings will start after the delay, missing the very first seconds of a session.' },
  { match: /intercom|tawk\.to|zendesk|zdassets|livechat|crisp\.chat|drift|tidio|hubspot.*conversations|gorgias|freshchat|olark|smartsupp/i, name: 'Chat widget', category: 'customer-success', delayable: 'yes', note: 'Load the chat on first interaction or after ~5 s; show a lightweight static chat button meanwhile so support remains reachable.' },
  { match: /klaviyo|privy|justuno|omnisend|mailchimp|optinmonster|sumo\.com|wisepops/i, name: 'Email / popup marketing', category: 'marketing', delayable: 'yes', note: 'Popups usually appear after a delay anyway; load the script on interaction or idle.' },
  { match: /judge\.me|yotpo|stamped|okendo|loox|trustpilot|reviews\.io|bazaarvoice|powerreviews/i, name: 'Reviews widget', category: 'reviews', delayable: 'conditional', note: 'Load review widgets when the reviews section scrolls into view; keep star-rating snippets server-rendered for SEO.' },
  { match: /hubspot|hs-scripts|hs-analytics|hsforms/i, name: 'HubSpot', category: 'marketing', delayable: 'partial', note: 'Tracking can be delayed; forms must load before the user needs them.' },
  { match: /youtube|ytimg|vimeo/i, name: 'Video embed', category: 'video', delayable: 'yes', note: 'Use a lightweight facade (thumbnail + play button) and load the player on click.' },
  { match: /maps\.googleapis|maps\.google/i, name: 'Google Maps', category: 'utility', delayable: 'yes', note: 'Load the map on interaction or when it scrolls into view; show a static map image first.' },
  { match: /recaptcha|hcaptcha|turnstile/i, name: 'CAPTCHA', category: 'security', delayable: 'conditional', note: 'Load only on pages with forms, ideally when the form gains focus. Removing it can expose forms to spam.' },
  { match: /stripe|paypal|braintree|klarna|afterpay|affirm|shop\.app|shopifycloud\/payment/i, name: 'Payments', category: 'payments', delayable: 'conditional', note: 'Payment scripts are business-critical. Load them only on product/cart/checkout pages; never remove them.' },
  { match: /cookiebot|onetrust|cookielaw|usercentrics|termly|iubenda|quantcast|didomi|osano|cookieyes/i, name: 'Consent management (CMP)', category: 'consent', delayable: 'no', note: 'Required for legal compliance (GDPR/CCPA). Do not delay or remove; instead make sure it loads asynchronously and reserves space for the banner.' },
  { match: /cdn\.shopify\.com\/extensions|shopifyapps|shopify\.com\/s\/files.*\/apps/i, name: 'Shopify app script', category: 'shopify-app', delayable: 'conditional', note: 'App scripts power storefront features. Remove scripts left behind by uninstalled apps; load the rest only on templates where the app is used.' },
  { match: /cloudflareinsights|cloudflare-static\/rocket/i, name: 'Cloudflare scripts', category: 'cdn', delayable: 'partial', note: 'Web Analytics beacon is small; Rocket Loader can be disabled if it conflicts with your scripts.' },
  { match: /fonts\.googleapis|fonts\.gstatic|use\.typekit|fonts\.com/i, name: 'Web fonts', category: 'fonts', delayable: 'no', note: 'Fonts are needed for rendering; self-host and preload instead of delaying.' },
  { match: /jsdelivr|unpkg|cdnjs|code\.jquery/i, name: 'Public CDN library', category: 'library', delayable: 'no', note: 'A library from a public CDN that your own code depends on; self-host it to avoid an extra connection.' },
];

export function classifyThirdParty(name, urls = []) {
  const hay = `${name || ''} ${urls.join(' ')}`;
  return THIRD_PARTY_CATALOG.find((c) => c.match.test(hay)) || null;
}

export function analyzeThirdParty({ lhr, requests, inspection }) {
  const a = audit(lhr, 'third-parties-insight', 'third-party-summary');
  const bootup = rows(audit(lhr, 'bootup-time'));
  const entities = [];
  const lhRows = rows(a);
  if (lhRows.length) {
    for (const r of lhRows) {
      const name = entityName(r) || urlOf(r) || 'Unknown';
      const urls = subItems(r).map((s) => urlOf(s)).filter(Boolean);
      entities.push({
        name,
        transferSize: r.transferSize ?? 0,
        mainThreadMs: r.mainThreadTime ?? null,
        blockingMs: r.blockingTime ?? null,
        urls,
      });
    }
  } else {
    // Fallback: group third-party requests by entity name
    const map = new Map();
    for (const r of requests.filter((q) => q.thirdParty)) {
      const e = map.get(r.entity) || { name: r.entity, transferSize: 0, mainThreadMs: null, blockingMs: null, urls: [] };
      e.transferSize += r.transferSize || 0;
      e.urls.push(r.url);
      map.set(r.entity, e);
    }
    for (const e of map.values()) {
      const bt = bootup.filter((b) => e.urls.includes(urlOf(b)));
      if (bt.length) e.mainThreadMs = bt.reduce((s, b) => s + (b.total || 0), 0);
      entities.push(e);
    }
  }

  const syncHead = new Set((inspection?.scripts || []).filter((s) => s.src && !s.async && !s.defer && !s.module).map((s) => s.src));
  const out = entities
    .map((e) => {
      const cat = classifyThirdParty(e.name, e.urls);
      const scriptUrls = e.urls.filter((u) => requests.find((r) => r.url === u)?.type === 'js' || /\.js(\?|$)/.test(u));
      const loading = scriptUrls.some((u) => syncHead.has(u)) ? 'blocking' : inspection ? 'async/deferred' : 'unknown';
      let recommendation = 'Keep, but load asynchronously and only on pages where it is needed.';
      if (cat?.delayable === 'yes') recommendation = 'Delay until first user interaction (or idle time) using a script loader.';
      else if (cat?.delayable === 'conditional') recommendation = 'Load conditionally — only on the pages/sections where it is used.';
      else if (cat?.delayable === 'partial') recommendation = 'Review which tags it loads; delay non-essential ones.';
      else if (cat?.delayable === 'no') recommendation = 'Essential — keep it, but make sure it loads asynchronously.';
      if (loading === 'blocking') recommendation = `Currently render-blocking. ${recommendation} At minimum add async/defer.`;
      return {
        name: e.name,
        product: cat?.name || null,
        category: cat?.category || 'other',
        transferSize: e.transferSize,
        mainThreadMs: e.mainThreadMs,
        blockingMs: e.blockingMs,
        urls: e.urls.slice(0, 25),
        scriptUrls: scriptUrls.slice(0, 10),
        loading,
        delayable: cat?.delayable || 'review',
        recommendation,
        consequence: cat?.note || 'Check with the owner of this tag what it is used for before delaying or removing it.',
      };
    })
    .sort((x, y) => (y.mainThreadMs || 0) - (x.mainThreadMs || 0) || y.transferSize - x.transferSize);

  const issues = [];
  const heavy = out.filter((e) => (e.mainThreadMs || 0) > 100 || e.transferSize > 100_000 || e.loading === 'blocking');
  const delayable = heavy.filter((e) => ['yes', 'conditional', 'partial', 'review'].includes(e.delayable));
  if (delayable.length) {
    const ms = delayable.reduce((s, e) => s + (e.mainThreadMs || 0), 0);
    const bytes = delayable.reduce((s, e) => s + e.transferSize, 0);
    issues.push(makeIssue({
      type: 'third-party-delay',
      category: 'third-party',
      title: `Third-party scripts can be delayed or loaded conditionally (${delayable.length})`,
      description: delayable.slice(0, 6).map((e) => `${e.product || e.name}: ${Math.round(e.transferSize / 1024)} KB${e.mainThreadMs ? `, ${Math.round(e.mainThreadMs)} ms main thread` : ''}`).join('; '),
      resource: delayable[0].scriptUrls[0] || delayable[0].urls[0],
      why: 'Third-party tags download, parse and execute during the critical loading window even though users do not need them to see the page.',
      impact: 'Increases TBT and INP; can delay LCP by competing for bandwidth.',
      metrics: ['TBT', 'INP', 'LCP'],
      priority: priorityFromSavings({ ms, bytes }),
      solution: 'Load these tags after the first user interaction (scroll, click, keydown, touch) or a short idle timeout. Review the consequence noted for each tag before delaying.',
      evidence: { entities: delayable },
      savings: ms ? { ms, source: 'lighthouse' } : null,
    }));
  }
  const blocking = out.filter((e) => e.loading === 'blocking');
  if (blocking.length) {
    issues.push(makeIssue({
      type: 'third-party-blocking',
      category: 'third-party',
      title: `Render-blocking third-party scripts (${blocking.length})`,
      description: blocking.map((e) => e.product || e.name).join(', '),
      resource: blocking[0].scriptUrls[0],
      why: 'Synchronous third-party scripts make your page wait for another company\'s server.',
      impact: 'Delays FCP and LCP; a slow/unavailable third party can block your page entirely.',
      metrics: ['FCP', 'LCP'],
      priority: 'high',
      solution: 'Add async (independent tags) or defer (tags that depend on DOM order) to every third-party <script>.',
      evidence: { entities: blocking },
    }));
  }
  const facades = out.filter((e) => ['video', 'customer-success', 'utility'].includes(e.category) && e.transferSize > 50_000);
  if (facades.length) {
    issues.push(makeIssue({
      type: 'third-party-facade',
      category: 'third-party',
      title: `Embeds that should use a lightweight facade (${facades.length})`,
      description: facades.map((e) => `${e.product || e.name} (${Math.round(e.transferSize / 1024)} KB)`).join(', '),
      resource: facades[0].urls[0],
      why: 'Video players, maps and chat widgets load hundreds of KB before the user interacts with them.',
      impact: 'Increases TBT and page weight.',
      metrics: ['TBT', 'LCP'],
      priority: 'medium',
      solution: 'Render a static placeholder (thumbnail/button) and load the real embed on click.',
      evidence: { entities: facades },
    }));
  }

  return {
    entities: out,
    totals: {
      count: out.length,
      bytes: out.reduce((s, e) => s + e.transferSize, 0),
      mainThreadMs: out.reduce((s, e) => s + (e.mainThreadMs || 0), 0),
    },
    issues,
  };
}
