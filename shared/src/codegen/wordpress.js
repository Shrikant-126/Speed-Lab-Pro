// Environment-specific WordPress guidance (page builders and cache plugins).
// Settings paths are given as found in recent plugin versions; menu names can vary by version.

const BUILDER = {
  Elementor: {
    lcp: 'Elementor: Settings → Features → enable "Optimized Image Loading" (adds fetchpriority/eager to the first image). For a hero set as a section background, use an Image widget instead, or keep the background and preload it.',
    lazy: 'Elementor: Settings → Features → "Lazy Load Background Images" handles section backgrounds; leave it off for the hero section.',
    'lazy-exclude': 'Elementor: for the hero Image widget, avoid lazy-load classes and make sure "Optimized Image Loading" is enabled.',
    css: 'Elementor: Settings → Features → enable "Improved CSS Loading", "Inline Font Icons", and set CSS Print Method to "External File".',
    'unused-css': 'Elementor: enable "Improved Asset Loading" and "Element Caching"; disable unused widgets in Elementor → Element Manager.',
    fonts: 'Elementor: Settings → Advanced → "Google Fonts Load" = Swap; consider "Load Google Fonts Locally".',
    defer: 'Elementor: enable "Improved Asset Loading" (loads widget scripts only where used).',
  },
  Divi: {
    lcp: 'Divi: Theme Options → Performance → keep "Critical CSS" on; for the hero Image module, avoid lazy load and preload the image with the PHP snippet.',
    css: 'Divi: Theme Options → Performance → enable "Dynamic CSS", "Critical CSS" and "Defer Additional Third Party Scripts".',
    'unused-css': 'Divi: Theme Options → Performance → "Dynamic CSS" and "Dynamic Module Framework" remove unused module CSS/JS.',
    fonts: 'Divi: Theme Options → Performance → "Improve Google Fonts Loading" and "Limit Google Fonts Support For Legacy Browsers".',
    defer: 'Divi: Theme Options → Performance → "Defer jQuery And jQuery Migrate" and "Dynamic JavaScript Libraries".',
    minify: 'Divi: Theme Options → General → Performance → "Minify And Combine JavaScript/CSS Files".',
  },
  Bricks: {
    lcp: 'Bricks: on the hero Image element, set loading to eager / disable lazy load, and avoid using a section background for the LCP image.',
    lazy: 'Bricks: Settings → Performance → keep lazy loading enabled; disable it per element for above-the-fold images.',
    css: 'Bricks: Settings → Performance → CSS loading method: "External files".',
    'unused-css': 'Bricks only outputs CSS for elements used on the page when using External files; regenerate CSS files after changes.',
  },
  Gutenberg: {
    lcp: 'Block editor: WordPress 6.3+ adds fetchpriority="high" to the first large image automatically; make sure the hero is an Image/Cover block in the content, not injected by JS.',
  },
};

const CACHE = {
  'WP Rocket': {
    lcp: 'WP Rocket: Media → LazyLoad → add the hero image filename to "Excluded images or iframes". WP Rocket 3.16+ also optimises critical images automatically.',
    lazy: 'WP Rocket: Media → enable LazyLoad for images and iframes ("Replace YouTube iframe with preview image" as well).',
    'lazy-exclude': 'WP Rocket: Media → LazyLoad → "Excluded images or iframes": add above-the-fold image filenames or classes.',
    css: 'WP Rocket: File Optimization → enable "Optimize CSS delivery" → "Remove Unused CSS" (or "Load CSS asynchronously").',
    'unused-css': 'WP Rocket: File Optimization → "Remove Unused CSS"; add dynamic classes to the safelist if something breaks.',
    minify: 'WP Rocket: File Optimization → "Minify CSS files" and "Minify JavaScript files".',
    defer: 'WP Rocket: File Optimization → "Load JavaScript deferred".',
    'delay-js': 'WP Rocket: File Optimization → "Delay JavaScript execution"; add scripts that must run immediately (consent banner, above-the-fold sliders) to the exclusions.',
    fonts: 'WP Rocket: Preload → "Preload fonts" (add the font file URLs); File Optimization → "Self-host Google Fonts" (3.16+).',
    images: 'WP Rocket does not convert images; use Imagify/ShortPixel/EWWW for WebP/AVIF.',
    ttfb: 'WP Rocket: make sure page caching is active ("Cache" tab), enable cache preload, and check that logged-out pages return a cached copy.',
    video: 'WP Rocket: Media → "Replace YouTube iframe with preview image".',
  },
  'LiteSpeed Cache': {
    lcp: 'LiteSpeed Cache: Page Optimization → Media Settings → enable "Viewport Images (VPI)" so above-the-fold images are not lazy-loaded; add the hero image to "Lazy Load Image Excludes".',
    lazy: 'LiteSpeed Cache: Page Optimization → Media Settings → "Lazy Load Images" ON.',
    'lazy-exclude': 'LiteSpeed Cache: Page Optimization → Media Settings → "Lazy Load Image Excludes" and enable "Viewport Images".',
    css: 'LiteSpeed Cache: Page Optimization → CSS Settings → "Load CSS Asynchronously" + "Generate Critical CSS" (requires QUIC.cloud).',
    'unused-css': 'LiteSpeed Cache: Page Optimization → CSS Settings → "Generate UCSS" (requires QUIC.cloud).',
    minify: 'LiteSpeed Cache: Page Optimization → "CSS Minify" and "JS Minify".',
    defer: 'LiteSpeed Cache: Page Optimization → JS Settings → "Load JS Deferred" = Deferred.',
    'delay-js': 'LiteSpeed Cache: Page Optimization → JS Settings → "Load JS Deferred" = Delayed; add essential scripts to "JS Deferred/Delayed Excludes".',
    fonts: 'LiteSpeed Cache: Page Optimization → CSS Settings → "Font Display Optimization" = Swap.',
    images: 'LiteSpeed Cache: Image Optimization → enable "Image WebP/AVIF Replacement" after optimising images through QUIC.cloud.',
    ttfb: 'LiteSpeed Cache: requires a LiteSpeed server for page caching; check the x-litespeed-cache header is "hit".',
  },
  Perfmatters: {
    'delay-js': 'Perfmatters: Assets → JavaScript → "Delay JavaScript" (delay all, with exclusions).',
    'unused-css': 'Perfmatters: Assets → CSS → "Remove Unused CSS"; use Script Manager to disable plugin assets per page.',
    lcp: 'Perfmatters: Lazy Loading → "Exclude Leading Images" and Preloading → "Preload Critical Images".',
  },
};

export function wordpressEnvNotes(platform, topic) {
  if (!platform || platform.name !== 'wordpress') return [];
  const notes = [];
  const b = BUILDER[platform.builder]?.[topic];
  if (b) notes.push(b);
  const c = CACHE[platform.cachePlugin]?.[topic];
  if (c) notes.push(c);
  if (!platform.cachePlugin && ['ttfb', 'css', 'delay-js', 'minify'].includes(topic)) {
    notes.push('No caching/optimisation plugin detected. WP Rocket, LiteSpeed Cache (on LiteSpeed hosting) or FlyingPress provide page caching, CSS/JS optimisation and script delay.');
  }
  return notes;
}
