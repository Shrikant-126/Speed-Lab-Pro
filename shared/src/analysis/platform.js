// Platform detection (Shopify / WordPress + theme, builder and cache plugin) from HTML,
// headers and request URLs. Every detection lists its evidence.

const SHOPIFY_THEMES = ['Dawn', 'Horizon', 'Prestige', 'Empire', 'Symmetry', 'Impulse', 'Motion', 'Impact', 'Focal', 'Warehouse', 'Broadcast', 'Sense', 'Craft', 'Refresh', 'Studio', 'Taste', 'Crave', 'Ride', 'Spotlight', 'Colorblock', 'Origin', 'Publisher', 'Trade', 'Expanse', 'Enterprise', 'Pipeline', 'Turbo', 'Streamline', 'Be Yours'];

export function detectPlatform({ html = '', headers = {}, requests = [] }) {
  const urls = requests.map((r) => r.url).join('\n');
  const hay = `${html}\n${urls}`;
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const evidence = [];

  // ---- Shopify ----
  const shopifySignals = [
    [/cdn\.shopify\.com/i, 'Assets served from cdn.shopify.com'],
    [/Shopify\.theme\s*=/, 'Shopify.theme object in HTML'],
    [/shopify-section/i, 'shopify-section markup'],
    [/myshopify\.com/i, 'myshopify.com reference'],
  ];
  for (const [re, label] of shopifySignals) if (re.test(hay)) evidence.push(label);
  if (h['x-shopid'] || h['x-shopify-stage'] || /shopify/i.test(h['powered-by'] || '')) evidence.push('Shopify response headers');
  if (evidence.length >= 2) {
    let theme = null;
    let themeId = null;
    const m = html.match(/Shopify\.theme\s*=\s*(\{[^;]*?\})\s*;/);
    if (m) {
      try {
        const obj = JSON.parse(m[1]);
        theme = obj.schema_name || obj.name || null;
        themeId = obj.id || null;
        if (obj.schema_name && obj.name && obj.schema_name !== obj.name) evidence.push(`Theme "${obj.name}" based on ${obj.schema_name}`);
      } catch {
        const n = m[1].match(/"schema_name"\s*:\s*"([^"]+)"/) || m[1].match(/"name"\s*:\s*"([^"]+)"/);
        if (n) theme = n[1];
      }
    }
    if (!theme) {
      const known = SHOPIFY_THEMES.find((t) => new RegExp(`theme_store_id|${t}`, 'i').test(html.slice(0, 200000)) && new RegExp(`["/]${t}["/ ]`, 'i').test(html));
      if (known) theme = known;
    }
    const apps = [...new Set((urls.match(/cdn\.shopify\.com\/extensions\/[^/]+\/([^/]+)\//g) || []).map((s) => s.split('/')[3]))];
    const appHosts = [...new Set(requests.filter((r) => r.thirdParty).map((r) => { try { return new URL(r.url).hostname; } catch { return ''; } }))]
      .filter((x) => /judge|yotpo|klaviyo|privy|okendo|stamped|loox|rebuy|recharge|smile|gorgias|boost|searchanise|pagefly|gempages|shogun|vitals|hextom|omega/i.test(x));
    return {
      name: 'shopify',
      label: 'Shopify',
      theme,
      themeId,
      knownTheme: theme ? SHOPIFY_THEMES.find((t) => theme.toLowerCase().includes(t.toLowerCase())) || null : null,
      apps: [...apps, ...appHosts].slice(0, 20),
      builder: /pagefly/i.test(hay) ? 'PageFly' : /gempages/i.test(hay) ? 'GemPages' : /shogun/i.test(hay) ? 'Shogun' : null,
      evidence,
    };
  }

  // ---- WordPress ----
  evidence.length = 0;
  const wpSignals = [
    [/\/wp-content\//i, '/wp-content/ assets'],
    [/\/wp-includes\//i, '/wp-includes/ assets'],
    [/<meta[^>]+generator[^>]+WordPress/i, 'WordPress generator meta tag'],
    [/wp-json/i, 'REST API link (wp-json)'],
  ];
  for (const [re, label] of wpSignals) if (re.test(hay)) evidence.push(label);
  if (/<https?:\/\/[^>]+\/wp-json\/>; rel="https:\/\/api\.w\.org\/"/i.test(h.link || '')) evidence.push('wp-json Link header');
  if (evidence.length >= 1 && /wp-content|wp-includes|WordPress/i.test(hay)) {
    const themeMatch = urls.match(/\/wp-content\/themes\/([a-z0-9_-]+)\//i) || html.match(/\/wp-content\/themes\/([a-z0-9_-]+)\//i);
    const pluginSlugs = [...new Set([...(html + urls).matchAll(/\/wp-content\/plugins\/([a-z0-9_-]+)\//gi)].map((x) => x[1].toLowerCase()))];
    let builder = null;
    if (/elementor/i.test(hay)) builder = 'Elementor';
    else if (/et_pb_|\/Divi\/|divi-builder/i.test(hay)) builder = 'Divi';
    else if (/brxe-|\/bricks\//i.test(hay)) builder = 'Bricks';
    else if (/wp-block-|is-layout-/i.test(html)) builder = 'Gutenberg';
    if (builder === 'Divi' || builder === 'Elementor' || builder === 'Bricks') evidence.push(`${builder} markup/assets`);
    let cachePlugin = null;
    if (/WP Rocket|wp-rocket|rocket-lazyload|data-rocket/i.test(hay) || h['x-rocket-nginx-serving-static']) cachePlugin = 'WP Rocket';
    else if (/litespeed/i.test(hay) || h['x-litespeed-cache'] || /litespeed/i.test(h.server || '')) cachePlugin = 'LiteSpeed Cache';
    else if (/w3 total cache|w3tc/i.test(hay)) cachePlugin = 'W3 Total Cache';
    else if (/wp-super-cache|WP-Super-Cache/i.test(hay)) cachePlugin = 'WP Super Cache';
    else if (/autoptimize/i.test(hay)) cachePlugin = 'Autoptimize';
    else if (/perfmatters/i.test(hay)) cachePlugin = 'Perfmatters';
    else if (/flying-press|flyingpress/i.test(hay)) cachePlugin = 'FlyingPress';
    else if (/nitropack/i.test(hay)) cachePlugin = 'NitroPack';
    if (cachePlugin) evidence.push(`${cachePlugin} detected`);
    return {
      name: 'wordpress',
      label: 'WordPress',
      theme: themeMatch ? themeMatch[1] : null,
      builder,
      cachePlugin,
      woocommerce: /woocommerce/i.test(hay),
      plugins: pluginSlugs.slice(0, 40),
      evidence,
    };
  }

  // ---- Other frameworks (informational) ----
  const others = [
    [/__NEXT_DATA__|\/_next\//, 'Next.js'],
    [/__NUXT__|\/_nuxt\//, 'Nuxt'],
    [/wix\.com|wixstatic/i, 'Wix'],
    [/squarespace/i, 'Squarespace'],
    [/webflow/i, 'Webflow'],
    [/BigCommerce|bigcommerce\.com/i, 'BigCommerce'],
    [/\bMagento\b|requirejs-config\.js|\/static\/version\d+\/frontend\//i, 'Magento'],
    [/data-reactroot|react-dom/i, 'React'],
    [/ng-version/i, 'Angular'],
    [/gatsby/i, 'Gatsby'],
  ];
  for (const [re, label] of others) {
    if (re.test(hay)) return { name: 'other', label, evidence: [`${label} signature in HTML/assets`] };
  }
  return { name: null, label: 'Custom / unknown', evidence: [] };
}
