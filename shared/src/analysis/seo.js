// SEO, structured data and analytics/GTM validation.
// Works from the server-rendered HTML (document probe), robots.txt/sitemap probes,
// Lighthouse SEO audits and the request list – no browser needed, so it also runs in
// Vercel "Lite" mode. Content injected later by JavaScript is not visible to these checks
// (search engines may or may not render it), which is called out where relevant.

import { audit } from './lhr.js';
import { makeIssue } from './issue.js';

// ---------------------------------------------------------------- HTML helpers
const decode = (s) =>
  String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const stripTags = (s) => decode(String(s).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function attrs(tag) {
  const out = {};
  const re = /([^\s=/<>"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const body = tag.replace(/^<[a-z0-9-]+/i, '').replace(/\/?>$/, '');
  let m;
  while ((m = re.exec(body))) out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => ({ raw: m[0], index: m.index, attrs: attrs(m[0]) }));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function resolve(u, base) {
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- structured data
const SCHEMA_RULES = {
  Organization: { required: ['name', 'url'], recommended: ['logo', 'sameAs', 'contactPoint'] },
  LocalBusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHoursSpecification', 'geo', 'url', 'image', 'priceRange'] },
  WebSite: { required: ['name', 'url'], recommended: ['potentialAction'] },
  WebPage: { required: ['name'], recommended: ['description', 'url'] },
  Product: { required: ['name'], oneOf: [['offers', 'review', 'aggregateRating']], recommended: ['image', 'description', 'sku', 'brand', 'offers'] },
  Offer: { required: ['price', 'priceCurrency'], recommended: ['availability', 'url', 'priceValidUntil'] },
  Article: { required: ['headline'], recommended: ['image', 'datePublished', 'dateModified', 'author', 'publisher'] },
  NewsArticle: { required: ['headline'], recommended: ['image', 'datePublished', 'dateModified', 'author'] },
  BlogPosting: { required: ['headline'], recommended: ['image', 'datePublished', 'dateModified', 'author'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
  Event: { required: ['name', 'startDate', 'location'], recommended: ['endDate', 'image', 'description', 'offers', 'eventStatus'] },
  Recipe: { required: ['name', 'image'], recommended: ['recipeIngredient', 'recipeInstructions', 'author', 'totalTime', 'nutrition'] },
  VideoObject: { required: ['name', 'thumbnailUrl', 'uploadDate'], recommended: ['description', 'contentUrl', 'duration'] },
  JobPosting: { required: ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'], recommended: ['validThrough', 'baseSalary', 'employmentType'] },
  Review: { required: ['itemReviewed', 'reviewRating', 'author'], recommended: [] },
  SoftwareApplication: { required: ['name'], oneOf: [['offers', 'aggregateRating']], recommended: ['operatingSystem', 'applicationCategory'] },
};

function flattenNodes(data) {
  const out = [];
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (n['@graph']) visit(n['@graph']);
    if (n['@type']) out.push(n);
  };
  visit(data);
  return out;
}

function validateNode(node) {
  const types = [].concat(node['@type']).map(String);
  const errors = [];
  const warnings = [];
  for (const t of types) {
    const rule = SCHEMA_RULES[t];
    if (!rule) continue;
    for (const p of rule.required) if (node[p] === undefined || node[p] === '' || node[p] === null) errors.push(`${t}: missing required property "${p}"`);
    for (const group of rule.oneOf || []) if (!group.some((p) => node[p] !== undefined)) errors.push(`${t}: needs at least one of ${group.map((g) => `"${g}"`).join(', ')}`);
    for (const p of rule.recommended || []) if (node[p] === undefined) warnings.push(`${t}: recommended property "${p}" is missing`);
    if (t === 'Product' && node.offers) {
      for (const o of [].concat(node.offers)) {
        if (o && typeof o === 'object' && [].concat(o['@type'] || 'Offer').includes('Offer')) {
          if (o.price === undefined && o.lowPrice === undefined) errors.push('Product.offers: missing "price"');
          if (!o.priceCurrency) errors.push('Product.offers: missing "priceCurrency"');
          if (!o.availability) warnings.push('Product.offers: recommended "availability" is missing');
        }
      }
    }
    if (t === 'BreadcrumbList' && Array.isArray(node.itemListElement)) {
      node.itemListElement.forEach((li, i) => {
        if (li?.position === undefined) errors.push(`BreadcrumbList item ${i + 1}: missing "position"`);
        if (!li?.name && !li?.item?.name) errors.push(`BreadcrumbList item ${i + 1}: missing "name"`);
      });
    }
    if (t === 'FAQPage' && Array.isArray(node.mainEntity)) {
      node.mainEntity.forEach((q, i) => {
        if (!q?.name) errors.push(`FAQPage question ${i + 1}: missing "name"`);
        if (!q?.acceptedAnswer?.text) errors.push(`FAQPage question ${i + 1}: missing "acceptedAnswer.text"`);
      });
    }
  }
  return { types, errors, warnings, known: types.some((t) => SCHEMA_RULES[t]) };
}

function parseStructuredData(html) {
  const blocks = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim();
    try {
      const data = JSON.parse(raw.replace(/^<!--|-->$/g, ''));
      const ctx = [].concat(data).map((d) => d?.['@context']).filter(Boolean).join(' ');
      const nodes = flattenNodes(data).map(validateNode);
      blocks.push({ valid: true, context: ctx || null, contextOk: /schema\.org/i.test(ctx || JSON.stringify(data).slice(0, 300)), nodes, raw: raw.slice(0, 4000) });
    } catch (err) {
      blocks.push({ valid: false, error: `Invalid JSON: ${err.message}`, nodes: [], raw: raw.slice(0, 4000) });
    }
  }
  const microdata = (html.match(/\sitemtype\s*=\s*["']https?:\/\/schema\.org\/(\w+)/gi) || []).map((x) => x.split('/').pop());
  return { blocks, microdata: [...new Set(microdata)] };
}

// ---------------------------------------------------------------- analytics / tags
function analyzeTags(html, requests) {
  const body = html || '';
  const reqUrls = requests.map((r) => r.url);
  const uniq = (a) => [...new Set(a)];
  const gtm = uniq([...body.matchAll(/GTM-[A-Z0-9]{4,10}/g)].map((m) => m[0]));
  const ga4 = uniq([...body.matchAll(/\bG-[A-Z0-9]{6,12}\b/g)].map((m) => m[0]).concat(reqUrls.flatMap((u) => [...u.matchAll(/[?&](?:id|tid)=(G-[A-Z0-9]{6,12})/g)].map((m) => m[1]))));
  const ua = uniq([...body.matchAll(/\bUA-\d{4,10}-\d{1,4}\b/g)].map((m) => m[0]));
  const ads = uniq([...body.matchAll(/\bAW-\d{6,12}\b/g)].map((m) => m[0]));
  const fbPixel = uniq([...body.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]/g)].map((m) => m[1]));
  const clarity = uniq([...body.matchAll(/clarity\.ms\/tag\/([a-z0-9]+)/gi)].map((m) => m[1]));
  const hotjar = uniq([...body.matchAll(/hjid\s*[:=]\s*(\d+)/g)].map((m) => m[1]));
  const tiktok = /analytics\.tiktok\.com|ttq\.load/.test(body);
  const linkedin = /snap\.licdn\.com|_linkedin_partner_id/.test(body);

  const headEnd = body.search(/<\/head>/i);
  const bodyStart = body.search(/<body\b/i);
  const gtmScriptIdx = body.search(/googletagmanager\.com\/gtm\.js/i);
  const gtmNoscript = /<noscript>[\s\S]{0,400}googletagmanager\.com\/ns\.html\?id=GTM-/i.test(body);
  const gtmNoscriptInBody = (() => {
    const i = body.search(/googletagmanager\.com\/ns\.html\?id=GTM-/i);
    return i > -1 && bodyStart > -1 && i > bodyStart;
  })();
  const dataLayerIdx = body.search(/(window\.)?dataLayer\s*=\s*(window\.dataLayer\s*\|\|\s*)?\[/);
  // Only a plain assignment (dataLayer = [...]) after GTM wipes its queue; "|| []" is safe.
  const overwriteIdx = (() => {
    const re = /(?:window\.)?dataLayer\s*=\s*\[/g;
    let m;
    let last = -1;
    while ((m = re.exec(body))) last = m.index;
    return last;
  })();
  const consentDefault = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/.test(body) || /['"]consent['"]\s*,\s*['"]default['"]/.test(body);
  const consentUpdate = /gtag\(\s*['"]consent['"]\s*,\s*['"]update['"]/.test(body);
  const cmp = /cookiebot|onetrust|cookielaw|usercentrics|cookieyes|iubenda|didomi|termly|osano|quantcast/i.test(body + reqUrls.join(' '));
  const gtmLoaded = reqUrls.some((u) => /googletagmanager\.com\/gtm\.js/.test(u));
  const gtagLoaded = reqUrls.some((u) => /googletagmanager\.com\/gtag\/js/.test(u));
  const ga4Hit = reqUrls.some((u) => /google-analytics\.com\/(g\/)?collect|analytics\.google\.com\/g\/collect|\/g\/collect\?v=2/.test(u));
  const gtagConfigs = uniq([...body.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"]([A-Z]{1,3}-[A-Z0-9-]+)['"]/g)].map((m) => m[1]));
  const gtagScripts = (body.match(/googletagmanager\.com\/gtag\/js\?id=/g) || []).length;
  const gtmScripts = (body.match(/googletagmanager\.com\/gtm\.js/g) || []).length;

  return {
    gtm, ga4, ua, ads, fbPixel, clarity, hotjar, tiktok, linkedin,
    gtmInHead: gtmScriptIdx > -1 && headEnd > -1 && gtmScriptIdx < headEnd,
    gtmScriptPresent: gtmScriptIdx > -1,
    gtmNoscript,
    gtmNoscriptInBody,
    dataLayerBeforeGtm: !(overwriteIdx > -1 && gtmScriptIdx > -1 && overwriteIdx > gtmScriptIdx),
    dataLayerDefined: dataLayerIdx > -1,
    consentDefault, consentUpdate, cmp,
    gtmLoaded, gtagLoaded, ga4Hit, gtagConfigs, gtagScripts, gtmScripts,
    requestsObserved: requests.length > 0,
  };
}

// ---------------------------------------------------------------- code templates
const gtmSnippet = (id) => ({
  head: `<!-- Google Tag Manager: as high in the <head> as possible -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');</script>
<!-- End Google Tag Manager -->`,
  body: `<!-- Google Tag Manager (noscript): immediately after the opening <body> tag -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`,
});
const ga4Snippet = (id) => `<!-- Google tag (gtag.js) – only if GA4 is NOT already deployed through GTM -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${id}');
</script>`;
const consentSnippet = `<!-- Google Consent Mode v2 defaults: place BEFORE the GTM / gtag snippet -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });
  // Your consent banner must call this after the user accepts:
  // gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
</script>`;

// ---------------------------------------------------------------- main
export function analyzeSeo({ lhr, probe, seoFiles, requests = [], finalUrl, platform }) {
  const html = probe?.html || '';
  const checks = [];
  const add = (c) => checks.push({ status: 'pass', severity: 'medium', ...c });
  const origin = (() => {
    try {
      return new URL(finalUrl).origin;
    } catch {
      return '';
    }
  })();
  const isShopify = platform?.name === 'shopify';
  const isWp = platform?.name === 'wordpress';

  // ---- Head / meta extraction
  const headHtml = html.split(/<\/head>/i)[0] || html;
  const title = stripTags(headHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const titleCount = (headHtml.match(/<title\b/gi) || []).length;
  const metas = tags(headHtml, 'meta');
  const metaByName = (n) => metas.filter((m) => (m.attrs.name || '').toLowerCase() === n).map((m) => m.attrs.content ?? '');
  const metaByProp = (p) => metas.filter((m) => (m.attrs.property || m.attrs.name || '').toLowerCase() === p).map((m) => m.attrs.content ?? '');
  const description = metaByName('description')[0] ?? null;
  const descCount = metaByName('description').length;
  const robotsMeta = [...metaByName('robots'), ...metaByName('googlebot')].join(', ').toLowerCase();
  const xRobots = (probe?.headers?.['x-robots-tag'] || '').toLowerCase();
  const viewport = metaByName('viewport')[0] ?? null;
  const charset = metas.some((m) => m.attrs.charset) || /charset=/i.test(probe?.contentType || '');
  const links = tags(headHtml, 'link');
  const canonicals = links.filter((l) => /(^|\s)canonical(\s|$)/i.test(l.attrs.rel || '')).map((l) => resolve(l.attrs.href, finalUrl));
  const hreflangs = links.filter((l) => /alternate/i.test(l.attrs.rel || '') && l.attrs.hreflang).map((l) => ({ lang: l.attrs.hreflang, href: resolve(l.attrs.href, finalUrl) }));
  const favicon = links.some((l) => /icon/i.test(l.attrs.rel || ''));
  const htmlTag = tags(html, 'html')[0];
  const lang = htmlTag?.attrs?.lang || null;
  const og = { title: metaByProp('og:title')[0], description: metaByProp('og:description')[0], image: metaByProp('og:image')[0], url: metaByProp('og:url')[0], type: metaByProp('og:type')[0] };
  const twitter = { card: metaByProp('twitter:card')[0], title: metaByProp('twitter:title')[0], image: metaByProp('twitter:image')[0] };

  // ---- Body extraction
  const bodyHtml = html.slice(Math.max(0, html.search(/<body\b/i)));
  const headings = [...bodyHtml.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: stripTags(m[2]).slice(0, 140) }));
  const h1s = headings.filter((h) => h.level === 1);
  const skipped = [];
  for (let i = 1; i < headings.length; i += 1) if (headings[i].level > headings[i - 1].level + 1) skipped.push(`h${headings[i - 1].level} → h${headings[i].level} ("${headings[i].text.slice(0, 40)}")`);
  const imgs = tags(bodyHtml, 'img');
  const noAlt = imgs.filter((i) => i.attrs.alt === undefined);
  const emptyAlt = imgs.filter((i) => i.attrs.alt === '');
  const anchors = tags(bodyHtml, 'a');
  const internal = [];
  const external = [];
  const badAnchors = [];
  for (const a of anchors) {
    const href = a.attrs.href;
    if (!href || href === '#' || /^javascript:/i.test(href)) {
      badAnchors.push(a.raw.slice(0, 140));
      continue;
    }
    if (/^(mailto|tel|sms):/i.test(href)) continue;
    const abs = resolve(href, finalUrl);
    if (!abs) continue;
    (abs.startsWith(origin) ? internal : external).push({ href: abs, rel: a.attrs.rel || '' });
  }
  const genericText = [...bodyHtml.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => stripTags(m[1]).toLowerCase()).filter((t) => /^(click here|here|read more|more|learn more|link|this)$/.test(t));
  const words = stripTags(bodyHtml).split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
  const mixed = finalUrl.startsWith('https:') ? [...html.matchAll(/\s(?:src|href)\s*=\s*["'](http:\/\/[^"']+)["']/gi)].map((m) => m[1]).filter((u) => !/^http:\/\/(www\.)?w3\.org|schema\.org/i.test(u)) : [];

  // ---------------- On-page checks
  add({
    id: 'title',
    group: 'On-page',
    title: 'Title tag',
    status: !title ? 'fail' : title.length < 15 || title.length > 65 || titleCount > 1 ? 'warn' : 'pass',
    severity: 'high',
    detail: !title ? 'No <title> found in the HTML.' : `"${title}" (${title.length} characters${titleCount > 1 ? `, ${titleCount} title tags` : ''}). Recommended: 30–60 characters, unique per page, main keyword first.`,
    fix: 'Write a unique, descriptive title of ~50–60 characters with the primary keyword near the start and your brand at the end.',
    code: `<title>${esc(title ? title.slice(0, 55) : 'Primary Keyword – Secondary Keyword | Brand')}</title>`,
    codeLang: 'html',
  });
  add({
    id: 'meta-description',
    group: 'On-page',
    title: 'Meta description',
    status: description === null ? 'fail' : description.length < 70 || description.length > 160 || descCount > 1 ? 'warn' : 'pass',
    severity: 'high',
    detail: description === null ? 'No meta description found. Google will generate a snippet from page text.' : `${description.length} characters${descCount > 1 ? `, ${descCount} description tags` : ''}: "${description.slice(0, 160)}". Recommended: 120–158 characters.`,
    fix: 'Write a compelling 120–158 character summary with the main keyword and a call to action. One per page.',
    code: `<meta name="description" content="${esc(description || 'Clear summary of this page in about 150 characters, including the main keyword and a reason to click.')}">`,
    codeLang: 'html',
  });
  add({
    id: 'h1',
    group: 'On-page',
    title: 'H1 heading',
    status: h1s.length === 0 ? 'fail' : h1s.length > 1 ? 'warn' : 'pass',
    severity: 'high',
    detail: h1s.length === 0 ? 'No <h1> in the server-rendered HTML.' : `${h1s.length} H1 heading${h1s.length > 1 ? 's' : ''}: ${h1s.slice(0, 3).map((h) => `"${h.text}"`).join(', ')}`,
    fix: 'Use exactly one H1 that describes the page topic (usually the product/article name); use H2–H6 for sections.',
    code: `<h1>${esc(h1s[0]?.text || title || 'Main topic of the page')}</h1>`,
    codeLang: 'html',
  });
  add({
    id: 'heading-order',
    group: 'On-page',
    title: 'Heading hierarchy',
    status: skipped.length ? 'warn' : headings.length ? 'pass' : 'warn',
    severity: 'low',
    detail: headings.length ? `${headings.length} headings (H1 ${h1s.length}, H2 ${headings.filter((h) => h.level === 2).length}, H3 ${headings.filter((h) => h.level === 3).length}).${skipped.length ? ` Skipped levels: ${skipped.slice(0, 4).join('; ')}` : ''}` : 'No headings found in the HTML.',
    fix: 'Keep a logical outline (H1 → H2 → H3) without skipping levels. Style with CSS classes, not by choosing heading levels for size.',
  });
  add({
    id: 'image-alt',
    group: 'On-page',
    title: 'Image alt text',
    status: noAlt.length ? (noAlt.length > 5 ? 'fail' : 'warn') : 'pass',
    severity: 'medium',
    detail: `${imgs.length} images in the HTML; ${noAlt.length} missing the alt attribute, ${emptyAlt.length} with empty alt (fine for decorative images).`,
    fix: 'Add descriptive alt text to every meaningful image (products, diagrams, logos). Use alt="" only for purely decorative images.',
    code: noAlt[0] ? noAlt[0].raw.replace(/<img/i, '<img alt="Describe the image"') : undefined,
    codeLang: 'html',
    items: noAlt.slice(0, 15).map((i) => i.attrs.src || i.attrs['data-src'] || i.raw.slice(0, 100)),
  });
  add({
    id: 'link-text',
    group: 'On-page',
    title: 'Descriptive link text & crawlable links',
    status: genericText.length || badAnchors.length > 3 ? 'warn' : 'pass',
    severity: 'low',
    detail: `${internal.length} internal and ${external.length} external links. ${genericText.length} links use generic text ("click here", "read more"); ${badAnchors.length} anchors have no crawlable href.`,
    fix: 'Use descriptive anchor text that says where the link goes, and real href URLs (not "#" or javascript:) for navigation.',
  });
  add({
    id: 'content-length',
    group: 'On-page',
    title: 'Indexable text content',
    status: words < 150 ? 'warn' : 'pass',
    severity: 'low',
    detail: `≈${words.toLocaleString()} words of text in the server-rendered HTML.${words < 150 ? ' Very thin content – if the page renders text with JavaScript, search engines must execute JS to see it.' : ''}`,
    fix: 'Make sure the main content is present in the HTML response (server-side rendering) and answers the searcher’s intent.',
  });

  // ---------------- Technical / indexing
  const noindex = /noindex/.test(robotsMeta) || /noindex/.test(xRobots);
  add({
    id: 'indexable',
    group: 'Indexing',
    title: 'Page is indexable',
    status: noindex ? 'fail' : (probe?.statusCode ?? 200) >= 400 ? 'fail' : 'pass',
    severity: 'critical',
    detail: noindex ? `The page blocks indexing (${robotsMeta ? `meta robots: "${robotsMeta}"` : ''}${xRobots ? ` X-Robots-Tag: "${xRobots}"` : ''}).` : `HTTP ${probe?.statusCode ?? 'n/a'}; no noindex directive found.`,
    fix: 'Remove "noindex" from the robots meta tag / X-Robots-Tag header on pages that should appear in Google.',
    code: '<meta name="robots" content="index, follow, max-image-preview:large">',
    codeLang: 'html',
  });
  const canonical = canonicals[0] || null;
  const canonicalSelf = canonical && canonical.replace(/\/$/, '') === finalUrl.replace(/[?#].*$/, '').replace(/\/$/, '');
  add({
    id: 'canonical',
    group: 'Indexing',
    title: 'Canonical URL',
    status: !canonical ? 'warn' : canonicals.length > 1 ? 'fail' : 'pass',
    severity: 'high',
    detail: !canonical ? 'No rel="canonical" link. Duplicate URLs (tracking parameters, http/https, trailing slashes) may split ranking signals.' : `${canonical}${canonicals.length > 1 ? ` (+${canonicals.length - 1} more – conflicting canonicals)` : canonicalSelf ? ' (self-referencing ✓)' : ' (points to a different URL – make sure this is intended)'}`,
    fix: 'Add exactly one absolute, self-referencing canonical on each indexable page.',
    code: `<link rel="canonical" href="${esc(finalUrl.replace(/[?#].*$/, ''))}">`,
    codeLang: 'html',
    shopify: isShopify ? '<link rel="canonical" href="{{ canonical_url }}">' : undefined,
  });
  add({
    id: 'lang',
    group: 'Indexing',
    title: 'Language declaration',
    status: lang ? 'pass' : 'warn',
    severity: 'low',
    detail: lang ? `<html lang="${lang}">` : 'The <html> element has no lang attribute.',
    fix: 'Declare the page language so search engines and screen readers handle it correctly.',
    code: '<html lang="en">',
    codeLang: 'html',
  });
  if (hreflangs.length) {
    const hasDefault = hreflangs.some((h) => h.lang.toLowerCase() === 'x-default');
    const selfRef = hreflangs.some((h) => h.href && h.href.replace(/\/$/, '') === finalUrl.replace(/\/$/, ''));
    add({
      id: 'hreflang',
      group: 'Indexing',
      title: 'hreflang (international)',
      status: !hasDefault || !selfRef ? 'warn' : 'pass',
      severity: 'medium',
      detail: `${hreflangs.length} hreflang links (${hreflangs.slice(0, 6).map((h) => h.lang).join(', ')}).${!hasDefault ? ' Missing x-default.' : ''}${!selfRef ? ' No self-referencing entry.' : ''}`,
      fix: 'Every language version must list all alternates including itself, plus an x-default.',
      code: `<link rel="alternate" hreflang="x-default" href="${esc(origin)}/">`,
      codeLang: 'html',
    });
  }
  add({
    id: 'https',
    group: 'Indexing',
    title: 'HTTPS & mixed content',
    status: !finalUrl.startsWith('https:') ? 'fail' : mixed.length ? 'warn' : 'pass',
    severity: 'high',
    detail: !finalUrl.startsWith('https:') ? 'The page is served over HTTP.' : mixed.length ? `${mixed.length} resource(s) referenced over http:// (mixed content): ${mixed.slice(0, 3).join(', ')}` : 'Served over HTTPS with no http:// resources in the HTML.',
    fix: 'Serve everything over HTTPS and update hard-coded http:// URLs.',
  });
  add({
    id: 'viewport',
    group: 'Indexing',
    title: 'Mobile viewport',
    status: viewport ? (/width=device-width/.test(viewport) ? 'pass' : 'warn') : 'fail',
    severity: 'high',
    detail: viewport ? `content="${viewport}"` : 'No <meta name="viewport"> – the page is not mobile-friendly (Google uses mobile-first indexing).',
    fix: 'Add a responsive viewport tag.',
    code: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    codeLang: 'html',
  });
  add({
    id: 'charset-favicon',
    group: 'Indexing',
    title: 'Charset & favicon',
    status: charset && favicon ? 'pass' : 'warn',
    severity: 'low',
    detail: `${charset ? 'Charset declared' : 'No charset declared'} · ${favicon ? 'favicon linked' : 'no favicon <link> found (Google shows favicons in mobile results)'}.`,
    fix: 'Declare <meta charset="utf-8"> first in the <head> and link a square favicon (at least 48×48).',
    code: '<meta charset="utf-8">\n<link rel="icon" href="/favicon.png" sizes="48x48" type="image/png">',
    codeLang: 'html',
  });

  // ---------------- Crawlability
  const robots = seoFiles?.robots || null;
  const sitemap = seoFiles?.sitemap || null;
  add({
    id: 'robots-txt',
    group: 'Crawlability',
    title: 'robots.txt',
    status: !robots ? 'info' : robots.status >= 400 ? 'warn' : robots.blocksAll ? 'fail' : robots.blocksPage ? 'fail' : 'pass',
    severity: 'high',
    detail: !robots ? 'robots.txt could not be checked in this scan.' : robots.status >= 400 ? `HTTP ${robots.status} – no robots.txt (crawlers assume everything is allowed).` : robots.blocksAll ? 'robots.txt blocks the whole site for all crawlers (Disallow: /).' : robots.blocksPage ? `robots.txt disallows this URL (rule: ${robots.matchedRule}).` : `Found (${robots.bytes} bytes). ${robots.sitemaps.length ? `Sitemaps listed: ${robots.sitemaps.length}` : 'No Sitemap: line.'}`,
    fix: 'Allow crawling of public pages, block only private/duplicate areas, and reference your XML sitemap.',
    code: `User-agent: *\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\n\nSitemap: ${origin}/sitemap.xml`,
    codeLang: 'text',
  });
  add({
    id: 'sitemap',
    group: 'Crawlability',
    title: 'XML sitemap',
    status: !sitemap ? 'info' : sitemap.ok ? 'pass' : 'warn',
    severity: 'medium',
    detail: !sitemap ? 'Sitemap could not be checked in this scan.' : sitemap.ok ? `${sitemap.url} – ${sitemap.isIndex ? `sitemap index with ${sitemap.count} sitemaps` : `${sitemap.count} URLs`}.` : `No valid sitemap found (${sitemap.url}: ${sitemap.error || `HTTP ${sitemap.status}`}).`,
    fix: isShopify ? 'Shopify generates /sitemap.xml automatically – submit it in Google Search Console.' : isWp ? 'WordPress 5.5+ serves /wp-sitemap.xml; SEO plugins (Yoast, Rank Math) provide /sitemap_index.xml. Submit it in Google Search Console.' : 'Generate an XML sitemap of all indexable URLs, list it in robots.txt and submit it in Google Search Console.',
  });

  // ---------------- Social
  const ogMissing = ['title', 'description', 'image', 'url'].filter((k) => !og[k]);
  add({
    id: 'open-graph',
    group: 'Social',
    title: 'Open Graph tags (Facebook, LinkedIn, WhatsApp)',
    status: ogMissing.length === 0 ? 'pass' : ogMissing.length >= 3 ? 'fail' : 'warn',
    severity: 'medium',
    detail: ogMissing.length ? `Missing: ${ogMissing.map((k) => `og:${k}`).join(', ')}.` : `og:title "${og.title}", og:image present.`,
    fix: 'Add Open Graph tags so shared links show a proper title, description and 1200×630 image.',
    code: `<meta property="og:type" content="${esc(og.type || 'website')}">\n<meta property="og:title" content="${esc(og.title || title || 'Page title')}">\n<meta property="og:description" content="${esc(og.description || description || 'Page summary')}">\n<meta property="og:image" content="${esc(og.image || `${origin}/og-image.jpg`)}">\n<meta property="og:url" content="${esc(og.url || finalUrl)}">`,
    codeLang: 'html',
  });
  add({
    id: 'twitter-card',
    group: 'Social',
    title: 'Twitter / X card',
    status: twitter.card ? 'pass' : 'warn',
    severity: 'low',
    detail: twitter.card ? `twitter:card="${twitter.card}"` : 'No twitter:card tag (X falls back to Open Graph, but a card type is recommended).',
    fix: 'Add a large image summary card.',
    code: '<meta name="twitter:card" content="summary_large_image">',
    codeLang: 'html',
  });

  // ---------------- Structured data
  const sd = parseStructuredData(html);
  const sdNodes = sd.blocks.flatMap((b) => b.nodes);
  const sdErrors = sd.blocks.filter((b) => !b.valid).length + sdNodes.reduce((s, n) => s + n.errors.length, 0);
  const types = [...new Set([...sdNodes.flatMap((n) => n.types), ...sd.microdata])];
  const suggestType = isShopify ? 'Product' : /\/(blog|news|article|post)s?\//i.test(finalUrl) ? 'Article' : 'Organization';
  const sdTemplates = {
    Organization: `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: og.title || title || 'Company name', url: origin, logo: `${origin}/logo.png`, sameAs: ['https://www.facebook.com/yourpage', 'https://www.linkedin.com/company/yourcompany'] }, null, 2)}\n</script>`,
    Product: `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: h1s[0]?.text || 'Product name', image: [og.image || `${origin}/product.jpg`], description: description || 'Product description', sku: 'SKU123', brand: { '@type': 'Brand', name: 'Brand' }, offers: { '@type': 'Offer', url: finalUrl, priceCurrency: 'INR', price: '999.00', availability: 'https://schema.org/InStock' } }, null, 2)}\n</script>`,
    Article: `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: h1s[0]?.text || title || 'Article headline', image: [og.image || `${origin}/cover.jpg`], datePublished: '2026-01-01T08:00:00+05:30', dateModified: '2026-01-01T08:00:00+05:30', author: [{ '@type': 'Person', name: 'Author Name' }] }, null, 2)}\n</script>`,
    BreadcrumbList: `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` }, { '@type': 'ListItem', position: 2, name: h1s[0]?.text || 'This page', item: finalUrl }] }, null, 2)}\n</script>`,
    FAQPage: `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Question?', acceptedAnswer: { '@type': 'Answer', text: 'Answer.' } }] }, null, 2)}\n</script>`,
  };
  add({
    id: 'structured-data',
    group: 'Structured data',
    title: 'Structured data (JSON-LD / schema.org)',
    status: !sd.blocks.length && !sd.microdata.length ? 'warn' : sdErrors ? 'fail' : 'pass',
    severity: 'medium',
    detail: !sd.blocks.length && !sd.microdata.length ? 'No structured data found. Rich results (stars, price, breadcrumbs, FAQ) need schema.org markup.' : `${sd.blocks.length} JSON-LD block(s)${sd.microdata.length ? ` + microdata (${sd.microdata.join(', ')})` : ''}. Types: ${types.join(', ') || 'none recognised'}. ${sdErrors ? `${sdErrors} error(s) found.` : 'No required-property errors.'}`,
    fix: 'Add JSON-LD that matches the visible page content, then validate it with Google’s Rich Results Test (https://search.google.com/test/rich-results).',
    code: sdTemplates[types.includes('Organization') && suggestType === 'Organization' ? 'BreadcrumbList' : suggestType],
    codeLang: 'html',
  });

  // ---------------- Analytics & tag validation
  const t = analyzeTags(html, requests);
  const tagChecks = [];
  const addTag = (c) => tagChecks.push({ status: 'pass', severity: 'medium', group: 'Analytics & tags', ...c });
  if (t.gtm.length) {
    addTag({
      id: 'gtm-install',
      title: `Google Tag Manager (${t.gtm.join(', ')})`,
      status: !t.gtmScriptPresent ? 'warn' : !t.gtmInHead || !t.gtmNoscriptInBody ? 'warn' : 'pass',
      severity: 'high',
      detail: [
        t.gtmScriptPresent ? (t.gtmInHead ? '✓ gtm.js snippet is in the <head>' : '⚠ gtm.js snippet is not in the <head> (tags fire late)') : '⚠ Container ID found, but the standard gtm.js snippet was not found in the HTML (it may be injected by a plugin/app).',
        t.gtmNoscript ? (t.gtmNoscriptInBody ? '✓ noscript iframe right after <body>' : '⚠ noscript iframe is not inside <body>') : '⚠ noscript iframe fallback missing',
        t.requestsObserved ? (t.gtmLoaded ? '✓ gtm.js was requested during the page load' : '⚠ gtm.js was NOT requested during the test page load') : null,
      ].filter(Boolean).join(' · '),
      fix: 'Install the head snippet as high in <head> as possible and the noscript iframe immediately after <body>.',
      code: `${gtmSnippet(t.gtm[0]).head}\n\n${gtmSnippet(t.gtm[0]).body}`,
      codeLang: 'html',
      shopify: isShopify ? 'Shopify: prefer Settings → Customer events → Add custom pixel (or the Google & YouTube app) instead of pasting GTM into theme.liquid; checkout pages only run pixels from Customer events.' : undefined,
    });
    if (t.gtm.length > 1 || t.gtmScripts > 1) {
      addTag({ id: 'gtm-duplicate', title: 'Multiple GTM containers / duplicate snippet', status: 'warn', severity: 'medium', detail: `${t.gtm.length} container IDs and ${t.gtmScripts} gtm.js snippet(s) found. Duplicate containers often double-count pageviews and conversions.`, fix: 'Keep one container per site unless you intentionally separate ownership (e.g. agency container); never install the same container twice.' });
    }
    addTag({
      id: 'datalayer',
      title: 'dataLayer usage',
      status: !t.dataLayerDefined ? 'info' : t.dataLayerBeforeGtm ? 'pass' : 'fail',
      severity: 'medium',
      detail: !t.dataLayerDefined ? 'No explicit dataLayer initialisation found (GTM creates it automatically – fine unless you push data before GTM loads).' : t.dataLayerBeforeGtm ? 'dataLayer is initialised safely (window.dataLayer = window.dataLayer || []) and never reset after GTM.' : 'A script assigns "dataLayer = [...]" AFTER the GTM snippet. This replaces GTM’s queue and can break triggers and lose events.',
      fix: 'Declare window.dataLayer = window.dataLayer || []; before the GTM snippet and always use dataLayer.push().',
      code: '<script>\n  window.dataLayer = window.dataLayer || [];\n  window.dataLayer.push({ pageType: \'home\' });\n</script>\n<!-- then the GTM snippet -->',
      codeLang: 'html',
    });
  } else {
    addTag({ id: 'gtm-install', title: 'Google Tag Manager', status: 'info', severity: 'low', detail: 'No GTM container found in the HTML.', fix: 'Optional: GTM lets marketing manage tags without code deploys. Replace GTM-XXXXXXX with your container ID.', code: `${gtmSnippet('GTM-XXXXXXX').head}\n\n${gtmSnippet('GTM-XXXXXXX').body}`, codeLang: 'html' });
  }
  if (t.ga4.length || t.gtagConfigs.length) {
    const ids = [...new Set([...t.ga4, ...t.gtagConfigs.filter((x) => x.startsWith('G-'))])];
    const viaBoth = t.gtm.length && t.gtagScripts > 0;
    addTag({
      id: 'ga4',
      title: `Google Analytics 4 (${ids.join(', ') || 'via GTM'})`,
      status: viaBoth ? 'warn' : t.requestsObserved && !t.ga4Hit && !t.gtagLoaded && !t.gtmLoaded ? 'warn' : 'pass',
      severity: 'high',
      detail: [
        `${ids.length} GA4 measurement ID(s) found.`,
        viaBoth ? '⚠ gtag.js is loaded directly AND GTM is present – make sure GA4 is not configured in both (double counting).' : null,
        t.requestsObserved ? (t.ga4Hit ? '✓ A GA4 hit (/g/collect) was sent during the test load.' : '⚠ No GA4 hit was observed during the test load (may be blocked until consent, or fired later).') : null,
      ].filter(Boolean).join(' '),
      fix: 'Deploy GA4 once – either via GTM (Google tag) or via gtag.js, not both. Verify with GA4 DebugView / Tag Assistant.',
      code: viaBoth ? undefined : ga4Snippet(ids[0] || 'G-XXXXXXXXXX'),
      codeLang: 'html',
    });
  } else {
    addTag({ id: 'ga4', title: 'Google Analytics 4', status: 'warn', severity: 'medium', detail: t.gtm.length ? 'No GA4 measurement ID in the HTML – it may be configured inside GTM (not visible here). Confirm in Tag Assistant.' : 'No GA4 found. Without analytics you cannot measure traffic or conversions.', fix: t.gtm.length ? 'Check GTM → Tags for a "Google tag" with your G- ID firing on All Pages.' : 'Add GA4 (via GTM or gtag.js).', code: t.gtm.length ? undefined : ga4Snippet('G-XXXXXXXXXX'), codeLang: 'html' });
  }
  if (t.ua.length) {
    addTag({ id: 'ua', title: `Universal Analytics (${t.ua.join(', ')})`, status: 'fail', severity: 'medium', detail: 'Universal Analytics stopped processing data in 2023/2024. This code adds weight but collects nothing.', fix: 'Remove the UA- tag and make sure GA4 is installed instead.' });
  }
  addTag({
    id: 'consent-mode',
    title: 'Google Consent Mode v2',
    status: t.consentDefault ? (t.consentUpdate || t.cmp ? 'pass' : 'warn') : t.gtm.length || t.ga4.length || t.ads.length ? 'warn' : 'info',
    severity: 'medium',
    detail: t.consentDefault ? `Consent defaults are set${t.cmp ? ' and a consent platform (CMP) was detected' : ''}.${!t.consentUpdate && !t.cmp ? ' No consent update/CMP detected – tags may stay denied.' : ''}` : t.cmp ? 'A consent platform was detected, but no consent-mode default was found in the HTML (it may be set inside the CMP or GTM template).' : 'No consent-mode defaults found. Required for Google Ads/GA4 audiences for EEA/UK traffic since March 2024.',
    fix: 'Set consent defaults before any Google tag loads and update them from your cookie banner (or use a certified CMP template in GTM).',
    code: consentSnippet,
    codeLang: 'html',
  });
  if (t.ads.length) addTag({ id: 'google-ads', title: `Google Ads (${t.ads.join(', ')})`, status: 'pass', severity: 'low', detail: 'Google Ads conversion/remarketing tag found.', fix: 'Verify conversions fire only on the conversion page (e.g. thank-you page) using Tag Assistant.' });
  if (t.fbPixel.length) addTag({ id: 'meta-pixel', title: `Meta Pixel (${t.fbPixel.join(', ')})`, status: t.fbPixel.length > 1 ? 'warn' : 'pass', severity: 'low', detail: t.fbPixel.length > 1 ? 'Multiple Pixel IDs initialised – check for duplicate PageView events.' : 'Meta Pixel initialised.', fix: 'Validate with the Meta Pixel Helper extension; consider the Conversions API for server-side events.' });
  const others = [t.clarity.length && `Microsoft Clarity (${t.clarity.join(', ')})`, t.hotjar.length && `Hotjar (${t.hotjar.join(', ')})`, t.tiktok && 'TikTok Pixel', t.linkedin && 'LinkedIn Insight'].filter(Boolean);
  if (others.length) addTag({ id: 'other-tags', title: 'Other tracking tags', status: 'info', severity: 'low', detail: others.join(', '), fix: 'Keep only tags you actively use; each adds JavaScript to every page (see Third-Party Scripts).' });

  // ---------------- Lighthouse SEO audits
  const lighthouse = [];
  const seoCat = lhr?.categories?.seo;
  for (const ref of seoCat?.auditRefs || []) {
    const a = audit(lhr, ref.id);
    if (!a || a.scoreDisplayMode === 'notApplicable') continue;
    lighthouse.push({
      id: ref.id,
      title: a.title,
      description: (a.description || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
      status: a.scoreDisplayMode === 'manual' ? 'manual' : a.score === 1 ? 'pass' : a.score === null ? 'info' : 'fail',
      weight: ref.weight,
      items: (a.details?.items || []).slice(0, 10).map((it) => it.node?.snippet || it.node?.nodeLabel || it.url || it.source || it.text || JSON.stringify(it).slice(0, 120)),
    });
  }

  // ---------------- Score + issues
  const all = [...checks, ...tagChecks];
  const weight = { critical: 5, high: 3, medium: 2, low: 1 };
  let max = 0;
  let got = 0;
  for (const c of all) {
    if (c.status === 'info' || c.status === 'manual') continue;
    const w = weight[c.severity] || 1;
    max += w;
    got += c.status === 'pass' ? w : c.status === 'warn' ? w * 0.5 : 0;
  }
  const score = max ? Math.round((got / max) * 100) : null;

  const issues = all
    .filter((c) => c.status === 'fail' || (c.status === 'warn' && ['critical', 'high'].includes(c.severity)))
    .map((c) =>
      makeIssue({
        type: `seo-${c.id}`,
        category: c.group === 'Analytics & tags' ? 'analytics' : 'seo',
        title: `${c.group === 'Analytics & tags' ? 'Tracking' : 'SEO'}: ${c.title}`,
        description: c.detail,
        resource: finalUrl,
        why: c.fix,
        impact: c.group === 'Analytics & tags' ? 'Affects measurement accuracy, consent compliance and ad attribution.' : 'Affects how search engines crawl, understand and display the page.',
        metrics: [],
        priority: c.severity === 'critical' ? 'critical' : c.status === 'fail' ? (c.severity === 'high' ? 'high' : 'medium') : 'medium',
        solution: c.fix,
        evidence: { seoCheck: c },
      }),
    );

  return {
    score,
    lighthouseScore: typeof seoCat?.score === 'number' ? Math.round(seoCat.score * 100) : null,
    meta: { title, titleLength: title.length, description, descriptionLength: description?.length ?? null, canonical, robots: robotsMeta || null, xRobots: xRobots || null, lang, viewport, og, twitter, hreflangs },
    headings: headings.slice(0, 60),
    links: { internal: internal.length, external: external.length, nofollow: [...internal, ...external].filter((l) => /nofollow/i.test(l.rel)).length },
    images: { total: imgs.length, missingAlt: noAlt.length, emptyAlt: emptyAlt.length },
    words,
    structuredData: { ...sd, types, errors: sdErrors, templates: sdTemplates },
    analytics: t,
    robots,
    sitemap,
    checks,
    tagChecks,
    lighthouse,
    htmlAvailable: !!html,
    issues,
  };
}
