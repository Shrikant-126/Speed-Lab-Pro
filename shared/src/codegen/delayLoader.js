// Generates delay / lazy-load code for common third-party scripts, with placement guidance
// (header/footer, WordPress hook, Shopify theme file) and the markup (class/id) each needs.

export const DELAY_SCRIPTS = [
  { key: 'gtm', label: 'Google Tag Manager', idLabel: 'Container ID', placeholder: 'GTM-XXXXXXX', pattern: /^GTM-[A-Z0-9]{4,10}$/, defaultTrigger: 'interaction' },
  { key: 'ga4', label: 'Google Analytics 4 (gtag.js)', idLabel: 'Measurement ID', placeholder: 'G-XXXXXXXXXX', pattern: /^G-[A-Z0-9]{6,12}$/, defaultTrigger: 'interaction' },
  { key: 'gads', label: 'Google Ads tag', idLabel: 'Conversion ID', placeholder: 'AW-123456789', pattern: /^AW-\d{6,12}$/, defaultTrigger: 'interaction' },
  { key: 'recaptcha3', label: 'Google reCAPTCHA v3', idLabel: 'Site key', placeholder: '6Lc…', pattern: /^[\w-]{20,60}$/, defaultTrigger: 'focus', selectorLabel: 'Form selector', selectorDefault: '#contact-form' },
  { key: 'recaptcha2', label: 'Google reCAPTCHA v2 (checkbox)', idLabel: 'Site key', placeholder: '6Lc…', pattern: /^[\w-]{20,60}$/, defaultTrigger: 'focus', selectorLabel: 'Form selector', selectorDefault: '#contact-form' },
  { key: 'metapixel', label: 'Meta (Facebook) Pixel', idLabel: 'Pixel ID', placeholder: '123456789012345', pattern: /^\d{8,20}$/, defaultTrigger: 'interaction' },
  { key: 'clarity', label: 'Microsoft Clarity', idLabel: 'Project ID', placeholder: 'abcd1234ef', pattern: /^[a-z0-9]{6,20}$/i, defaultTrigger: 'interaction' },
  { key: 'hotjar', label: 'Hotjar', idLabel: 'Site ID', placeholder: '1234567', pattern: /^\d{4,10}$/, defaultTrigger: 'interaction' },
  { key: 'tawk', label: 'Tawk.to chat', idLabel: 'Property ID/Widget ID', placeholder: '64ab…/1h2j…', pattern: /^[a-z0-9]+\/[a-z0-9]+$/i, defaultTrigger: 'interaction' },
  { key: 'youtube', label: 'YouTube embed (facade)', idLabel: 'Video ID', placeholder: 'dQw4w9WgXcQ', pattern: /^[\w-]{6,20}$/, defaultTrigger: 'click' },
  { key: 'maps', label: 'Google Maps embed', idLabel: 'Embed URL', placeholder: 'https://www.google.com/maps/embed?pb=…', pattern: /^https:\/\/www\.google\.com\/maps\/embed/, defaultTrigger: 'visible', selectorLabel: 'Map container selector', selectorDefault: '#store-map' },
  { key: 'custom', label: 'Custom script URL', idLabel: 'Script URL', placeholder: 'https://widget.example.com/loader.js', pattern: /^https:\/\/[^\s"'<>]+$/, defaultTrigger: 'interaction' },
];

export const TRIGGERS = {
  interaction: 'First user interaction (scroll, tap, click, key) – or after the fallback timeout',
  idle: 'Browser idle time after the page has loaded',
  timeout: 'Fixed delay after page load',
  visible: 'When the element scrolls into view',
  focus: 'When the user focuses/clicks inside the form',
  click: 'When the user clicks the placeholder',
};

const q = (s) => JSON.stringify(String(s));

const RUNTIME = `/* SpeedLab delay loader – runs tasks on interaction / idle / visibility / focus */
(function (w, d) {
  if (w.SpeedLabDelay) return;
  var EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove', 'wheel'];
  var queue = [], fired = false;
  function fire() {
    if (fired) return; fired = true;
    EVENTS.forEach(function (e) { w.removeEventListener(e, fire, { passive: true }); });
    queue.splice(0).forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
  }
  EVENTS.forEach(function (e) { w.addEventListener(e, fire, { passive: true, once: true }); });
  function afterLoad(fn) { if (d.readyState === 'complete') fn(); else w.addEventListener('load', fn); }
  w.SpeedLabDelay = {
    loadScript: function (src, attrs) {
      var s = d.createElement('script'); s.src = src; s.async = true;
      if (attrs) Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });
      d.head.appendChild(s); return s;
    },
    onInteraction: function (fn, fallbackMs) {
      if (fired) return fn();
      queue.push(fn);
      if (fallbackMs) afterLoad(function () { setTimeout(fire, fallbackMs); });
    },
    onIdle: function (fn) { afterLoad(function () { (w.requestIdleCallback || function (cb) { setTimeout(cb, 1500); })(fn); }); },
    onTimeout: function (fn, ms) { afterLoad(function () { setTimeout(fn, ms); }); },
    onVisible: function (selector, fn) {
      var el = d.querySelector(selector); if (!el) return;
      if (!('IntersectionObserver' in w)) return fn(el);
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { io.disconnect(); fn(el); }
      }, { rootMargin: '300px' });
      io.observe(el);
    },
    onFocus: function (selector, fn) {
      var done = false;
      function run() { if (!done) { done = true; fn(); } }
      d.addEventListener('focusin', function (e) { if (e.target.closest && e.target.closest(selector)) run(); });
      d.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest(selector)) run(); }, { passive: true });
    }
  };
})(window, document);`;

function wrap(trigger, body, { ms = 5000, selector } = {}) {
  const fn = `function () {\n${body.replace(/^/gm, '    ')}\n  }`;
  switch (trigger) {
    case 'idle':
      return `SpeedLabDelay.onIdle(${fn});`;
    case 'timeout':
      return `SpeedLabDelay.onTimeout(${fn}, ${ms});`;
    case 'visible':
      return `SpeedLabDelay.onVisible(${q(selector)}, ${fn});`;
    case 'focus':
      return `SpeedLabDelay.onFocus(${q(selector)}, ${fn});`;
    default:
      return `SpeedLabDelay.onInteraction(${fn}, ${ms});`;
  }
}

/**
 * @param {Array<{key:string,id:string,trigger?:string,selector?:string}>} items
 * @param {{ fallbackMs?: number, consentMode?: boolean }} options
 */
export function buildDelayCode(items, { fallbackMs = 5000, consentMode = false } = {}) {
  const tasks = [];
  const markup = [];
  const notes = [];
  const remove = [];
  const head = [];

  for (const it of items) {
    const def = DELAY_SCRIPTS.find((d) => d.key === it.key);
    if (!def) continue;
    const id = String(it.id || def.placeholder).trim();
    const trigger = it.trigger || def.defaultTrigger;
    const selector = it.selector || def.selectorDefault;
    const opts = { ms: Number(it.ms) || fallbackMs, selector };
    switch (it.key) {
      case 'gtm':
        tasks.push(`// Google Tag Manager (${id})\n${wrap(trigger, `w = window; w.dataLayer = w.dataLayer || [];\nw.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });\nSpeedLabDelay.loadScript('https://www.googletagmanager.com/gtm.js?id=${id}');`, opts).replace('w = window;', 'var w = window;')}`);
        markup.push({ where: 'Immediately after the opening <body> tag (keep it – it is only used when JavaScript is off)', code: `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>` });
        remove.push(`The original GTM <script> snippet for ${id} in the <head> (keep only the delayed version).`);
        notes.push('GTM: every tag inside the container now starts on first interaction. Very short bounces may not be recorded; conversion tags on thank-you pages still fire because the user has interacted by then.');
        break;
      case 'ga4':
        tasks.push(`// Google Analytics 4 (${id})\n${wrap(trigger, `SpeedLabDelay.loadScript('https://www.googletagmanager.com/gtag/js?id=${id}');\nwindow.dataLayer = window.dataLayer || [];\nwindow.gtag = window.gtag || function () { dataLayer.push(arguments); };\ngtag('js', new Date());\ngtag('config', ${q(id)});`, opts)}`);
        remove.push(`The original gtag.js snippet for ${id}. If GA4 is also configured inside GTM, delete one of them to avoid double counting.`);
        notes.push('GA4: sessions where the user leaves without any interaction are not counted (usually 2–10% of bounces). Engagement data for real visitors is unaffected.');
        break;
      case 'gads':
        tasks.push(`// Google Ads (${id})\n${wrap(trigger, `SpeedLabDelay.loadScript('https://www.googletagmanager.com/gtag/js?id=${id}');\nwindow.dataLayer = window.dataLayer || [];\nwindow.gtag = window.gtag || function () { dataLayer.push(arguments); };\ngtag('js', new Date());\ngtag('config', ${q(id)});`, opts)}`);
        notes.push('Google Ads: fire conversion events (gtag("event","conversion",…)) only after the tag has loaded – e.g. inside the same delayed function or on the thank-you page.');
        break;
      case 'recaptcha3':
        tasks.push(`// reCAPTCHA v3 – loads when the user starts using the form ${selector}\n${wrap(trigger, `SpeedLabDelay.loadScript('https://www.google.com/recaptcha/api.js?render=${id}');`, opts)}\n\n// Attach a fresh token on submit\ndocument.addEventListener('submit', function (e) {\n  var form = e.target.closest && e.target.closest(${q(selector)});\n  if (!form || form.dataset.recaptchaDone) return;\n  e.preventDefault();\n  (function waitForGrecaptcha() {\n    if (!window.grecaptcha || !grecaptcha.execute) return setTimeout(waitForGrecaptcha, 100);\n    grecaptcha.ready(function () {\n      grecaptcha.execute(${q(id)}, { action: 'submit' }).then(function (token) {\n        var input = form.querySelector('input[name="g-recaptcha-response"]') || form.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name: 'g-recaptcha-response' }));\n        input.value = token;\n        form.dataset.recaptchaDone = '1';\n        form.requestSubmit ? form.requestSubmit() : form.submit();\n      });\n    });\n  })();\n}, true);`);
        markup.push({ where: `Your form must match the selector ${selector}`, code: `<form id="${selector.replace(/^#/, '')}" method="post" action="/contact">\n  …your fields…\n  <button type="submit">Send</button>\n</form>` });
        remove.push('The original <script src="https://www.google.com/recaptcha/api.js?render=…"> tag on every page.');
        notes.push('reCAPTCHA: verify the token on your server as before (secret key). Only pages with the form need this code; the badge appears once the user interacts with the form.');
        break;
      case 'recaptcha2':
        tasks.push(`// reCAPTCHA v2 checkbox – loads when the user starts using the form ${selector}\n${wrap(trigger, `SpeedLabDelay.loadScript('https://www.google.com/recaptcha/api.js');`, opts)}`);
        markup.push({ where: `Inside the form ${selector}, where the checkbox should appear`, code: `<form id="${selector.replace(/^#/, '')}">\n  …your fields…\n  <div class="g-recaptcha" data-sitekey="${id}" style="min-height:78px"></div>\n  <button type="submit">Send</button>\n</form>` });
        remove.push('The original <script src="https://www.google.com/recaptcha/api.js"> tag.');
        notes.push('reCAPTCHA v2: min-height:78px reserves space so the checkbox does not shift the layout (CLS) when it renders.');
        break;
      case 'metapixel':
        tasks.push(`// Meta Pixel (${id})\n${wrap(trigger, `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?\nn.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;\nn.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;\nt.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,\ndocument,'script','https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', ${q(id)});\nfbq('track', 'PageView');`, opts)}`);
        remove.push('The original Meta Pixel base code (and its <noscript><img> fallback if you no longer need it).');
        notes.push('Meta Pixel: PageView is recorded on first interaction. Consider the Conversions API for server-side events.');
        break;
      case 'clarity':
        tasks.push(`// Microsoft Clarity (${id})\n${wrap(trigger, `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};\nt=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;\ny=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", ${q(id)});`, opts)}`);
        remove.push('The original Clarity snippet.');
        break;
      case 'hotjar':
        tasks.push(`// Hotjar (${id})\n${wrap(trigger, `(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};\nh._hjSettings={hjid:${Number(id) || 0},hjsv:6};a=o.getElementsByTagName('head')[0];\nr=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;\na.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`, opts)}`);
        remove.push('The original Hotjar tracking code.');
        notes.push('Hotjar: recordings start at the first interaction, so the first second of each session is not recorded.');
        break;
      case 'tawk':
        tasks.push(`// Tawk.to chat (${id})\n${wrap(trigger, `window.Tawk_API = window.Tawk_API || {}; window.Tawk_LoadStart = new Date();\nSpeedLabDelay.loadScript('https://embed.tawk.to/${id}', { charset: 'UTF-8', crossorigin: '*' });`, opts)}`);
        remove.push('The original Tawk.to widget script.');
        notes.push('Chat: the bubble appears after the first interaction (or the fallback timeout). Visitors can still reach support.');
        break;
      case 'youtube':
        markup.push({ where: 'Where the video should appear (replaces the <iframe>)', code: `<div class="yt-lazy" data-id="${id}" role="button" tabindex="0" aria-label="Play video"\n     style="position:relative;aspect-ratio:16/9;cursor:pointer;background:#000 url(https://i.ytimg.com/vi/${id}/hqdefault.jpg) center/cover">\n  <span style="position:absolute;inset:0;margin:auto;width:68px;height:48px;background:#f00;border-radius:12px"></span>\n</div>` });
        tasks.push(`// YouTube facade – the real player loads only when clicked\ndocument.addEventListener('click', function (e) {\n  var box = e.target.closest && e.target.closest('.yt-lazy');\n  if (!box) return;\n  var f = document.createElement('iframe');\n  f.src = 'https://www.youtube-nocookie.com/embed/' + box.dataset.id + '?autoplay=1';\n  f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true;\n  f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';\n  box.innerHTML = ''; box.appendChild(f);\n});`);
        remove.push('The original YouTube <iframe> embed code.');
        notes.push('YouTube facade: saves ~500 KB+ of JavaScript per embed until the visitor actually plays the video.');
        break;
      case 'maps':
        markup.push({ where: `Where the map should appear – the element needs id="${(selector || '#store-map').replace(/^#/, '')}"`, code: `<div id="${(selector || '#store-map').replace(/^#/, '')}" data-src="${id}" style="aspect-ratio:4/3;background:#e5e7eb"></div>` });
        tasks.push(`// Google Maps – iframe is created when the map scrolls into view\n${wrap('visible', `var f = document.createElement('iframe');\nf.src = el.dataset.src; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';\nf.style.cssText = 'width:100%;height:100%;border:0';\nel.appendChild(f);`, opts).replace('function () {', 'function (el) {')}`);
        remove.push('The original Google Maps <iframe>.');
        break;
      case 'custom':
        tasks.push(`// Custom script\n${wrap(trigger, `SpeedLabDelay.loadScript(${q(id)});`, opts)}`);
        remove.push(`The original <script src="${id}"> tag.`);
        break;
      default:
        break;
    }
  }

  if (consentMode) {
    head.push(`<!-- Consent Mode v2 defaults: keep in <head>, BEFORE any Google tag -->\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500 });\n</script>`);
  }

  const script = `<script>\n${RUNTIME}\n\n${tasks.join('\n\n')}\n</script>`;
  const php = `<?php
/**
 * SpeedLab Pro – delayed third-party scripts.
 * Add to your child theme's functions.php or a Code Snippets plugin (Run on: front-end).
 * Remove the original snippets (or disable them in the plugin that adds them) first.
 */
${head.length ? `add_action( 'wp_head', function () {\n\t?>\n${head.join('\n')}\n\t<?php\n}, 1 );\n\n` : ''}add_action( 'wp_footer', function () {
\tif ( is_admin() || wp_doing_ajax() ) {
\t\treturn;
\t}
\t?>
${script}
\t<?php
}, 99 );
${markup.some((m) => /noscript/.test(m.code)) ? `\nadd_action( 'wp_body_open', function () {\n\t?>\n${markup.filter((m) => /noscript/.test(m.code)).map((m) => m.code).join('\n')}\n\t<?php\n}, 1 );\n` : ''}`;

  const liquid = `{%- comment -%}
  SpeedLab Pro – delayed third-party scripts.
  layout/theme.liquid: paste just before </body>.
  Checkout pages only run pixels added under Settings → Customer events, not theme code.
{%- endcomment -%}
${script}`;

  return {
    head: head.join('\n'),
    script,
    php,
    liquid,
    markup,
    remove,
    notes,
    placement: [
      'Paste the delay loader just before the closing </body> tag (footer), once per page/template.',
      head.length ? 'Paste the Consent Mode defaults at the top of <head>, before anything else.' : null,
      ...markup.map((m) => `${m.where}.`),
      'Remove the original snippets listed under “Remove” so the scripts are not loaded twice.',
    ].filter(Boolean),
  };
}
