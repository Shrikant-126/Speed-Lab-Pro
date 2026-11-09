// Video optimizer analysis (requires the Playwright DOM inspection for element-level data;
// falls back to media requests seen by Lighthouse).

import { sameResource } from './lhr.js';
import { makeIssue, priorityFromSavings } from './issue.js';

export function analyzeVideos({ inspection, requests, lcpElement, viewport }) {
  const mediaRequests = requests.filter((r) => r.type === 'media' || /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(r.url));
  const videos = [];
  const issues = [];
  const vw = viewport?.width || inspection?.viewport?.width || 412;
  const isMobile = vw < 768;

  for (const v of inspection?.videos || []) {
    const src = v.currentSrc || v.src || v.sources?.[0]?.src || null;
    const reqs = mediaRequests.filter((r) => [v.currentSrc, v.src, ...(v.sources || []).map((s) => s.src)].some((u) => u && sameResource(r.url, u)));
    const bytes = reqs.reduce((s, r) => s + (r.transferSize || 0), 0) || v.bytesDownloaded || 0;
    const formats = [...new Set((v.sources || []).map((s) => s.type || (s.src || '').split('?')[0].split('.').pop()).filter(Boolean))];
    if (!formats.length && src) formats.push((src.split('?')[0].split('.').pop() || '').toLowerCase());
    const isBackground = !!v.isBackground || (v.autoplay && v.muted && v.loop && !v.controls);
    const isLcp = !!lcpElement?.selector && lcpElement.selector === v.selector;

    const codes = [];
    if (!v.poster) codes.push('missing-poster');
    if (v.autoplay && !v.muted) codes.push('autoplay-unmuted');
    if (v.autoplay && !v.playsinline) codes.push('missing-playsinline');
    if (!v.aboveFold && bytes > 0) codes.push('loaded-offscreen');
    if (!v.aboveFold && v.preload !== 'none' && !v.autoplay) codes.push('preload-offscreen');
    if (v.aboveFold === true && v.preload === 'auto' && !v.autoplay) codes.push('preload-auto');
    if (bytes > 2_000_000) codes.push('large-file');
    if (isMobile && bytes > 1_000_000 && isBackground) codes.push('mobile-download');
    if (v.hidden && bytes > 0) codes.push('hidden-download');
    if (formats.length && !formats.some((f) => /webm|av1|hevc|mp4.*av01/i.test(f)) && bytes > 500_000) codes.push('single-format');
    if (isLcp) codes.push('affects-lcp');

    videos.push({
      selector: v.selector,
      src,
      sources: v.sources || [],
      formats,
      autoplay: !!v.autoplay,
      muted: !!v.muted,
      loop: !!v.loop,
      playsinline: !!v.playsinline,
      controls: !!v.controls,
      preload: v.preload || null,
      poster: v.poster || null,
      rendered: v.rendered || null,
      aboveFold: v.aboveFold ?? null,
      hidden: !!v.hidden,
      isBackground,
      isLcp,
      bytes,
      issues: codes,
      priority: codes.length ? priorityFromSavings({ bytes }, { boost: codes.includes('affects-lcp') || codes.includes('mobile-download') ? 1 : 0 }) : null,
      snippet: v.snippet || null,
    });
  }

  // Embedded players (YouTube/Vimeo iframes)
  const embeds = (inspection?.iframes || []).filter((f) => /youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|wistia|vidyard/i.test(f.src || ''));

  // Media requests without matching <video> elements (or when inspection is unavailable)
  const unmatched = mediaRequests.filter((r) => !videos.some((v) => [v.src, ...v.sources.map((s) => s.src)].some((u) => u && sameResource(u, r.url))));

  const groups = [
    ['missing-poster', 'video-poster', 'Videos are missing a poster image', 'Without a poster the area is blank (or the first frame must be downloaded) before playback.', 'Add a lightweight poster image (WebP/AVIF) sized to the video box.', ['LCP', 'CLS']],
    ['loaded-offscreen', 'video-lazy', 'Offscreen videos download during initial page load', 'Videos below the fold consume bandwidth before the user scrolls to them.', 'Use preload="none" and load the source with IntersectionObserver when the video nears the viewport.', ['LCP', 'Speed Index']],
    ['preload-offscreen', 'video-lazy', 'Offscreen videos are not using preload="none"', 'The browser may fetch metadata or data for videos the user may never see.', 'Set preload="none" for below-the-fold videos.', ['Speed Index']],
    ['mobile-download', 'video-mobile', 'Large background video downloads on mobile', 'Decorative background videos cost mobile users data and battery and delay critical requests.', 'Serve a poster image on small screens and load the video only on wide viewports / fast connections.', ['LCP', 'Speed Index']],
    ['large-file', 'video-compress', 'Video files are very large', 'Large MP4 files compete with critical resources.', 'Re-encode (H.264 CRF 26–28 or AV1/VP9 WebM), reduce resolution for the displayed size, and trim duration.', ['Speed Index']],
    ['autoplay-unmuted', 'video-autoplay', 'Autoplay video is not muted', 'Browsers block unmuted autoplay, so the video downloads but may never play.', 'Add muted (and playsinline) to autoplaying videos.', []],
    ['missing-playsinline', 'video-autoplay', 'Autoplay video is missing playsinline', 'On iOS, autoplay without playsinline opens fullscreen or does not play inline.', 'Add the playsinline attribute.', []],
    ['hidden-download', 'video-mobile', 'Hidden videos are still downloading', 'Videos hidden with CSS (e.g. display:none on mobile) still download if their source is set.', 'Do not set the src until the video is shown; use matchMedia to attach sources.', ['Speed Index']],
    ['single-format', 'video-format', 'Videos are served in a single legacy format', 'WebM (VP9/AV1) is often 30–50% smaller than H.264 MP4.', 'Provide a WebM/AV1 <source> before the MP4 fallback.', []],
    ['affects-lcp', 'video-lcp', 'A video is the LCP element', 'LCP for videos is measured on the poster/first frame; the frame must download before LCP.', 'Provide an optimised poster with fetchpriority="high" preload, and keep preload="metadata".', ['LCP']],
  ];
  const seen = new Set();
  for (const [code, type, title, why, solution, metrics] of groups) {
    const list = videos.filter((v) => v.issues.includes(code));
    if (!list.length) continue;
    const key = `${type}:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bytes = ['loaded-offscreen', 'mobile-download', 'hidden-download', 'large-file'].includes(code) ? list.reduce((s, v) => s + v.bytes, 0) : 0;
    issues.push(makeIssue({
      type,
      category: 'video',
      title: `${title} (${list.length})`,
      description: `${list.length} video${list.length > 1 ? 's' : ''} affected.${bytes ? ` ${Math.round(bytes / 1024)} KB downloaded.` : ''}`,
      resource: list[0].src || list[0].selector,
      why,
      impact: metrics.length ? `Affects ${metrics.join(', ')}.` : 'Affects playback reliability.',
      metrics,
      priority: code === 'affects-lcp' ? 'high' : priorityFromSavings({ bytes }, { boost: code === 'mobile-download' ? 1 : 0 }),
      solution,
      evidence: { videos: list.slice(0, 10), isMobile },
      savings: bytes ? { bytes, source: 'measured' } : null,
    }));
  }
  if (!inspection && unmatched.length) {
    const bytes = unmatched.reduce((s, r) => s + (r.transferSize || 0), 0);
    if (bytes > 500_000) {
      issues.push(makeIssue({
        type: 'video-lazy',
        category: 'video',
        title: `Video files downloaded during page load (${unmatched.length})`,
        description: `${Math.round(bytes / 1024)} KB of video was downloaded during the Lighthouse page load.`,
        resource: unmatched[0].url,
        why: 'Video downloads during initial load compete with critical resources.',
        impact: 'Affects LCP and Speed Index.',
        metrics: ['LCP', 'Speed Index'],
        priority: priorityFromSavings({ bytes }),
        solution: 'Use preload="none"/"metadata", a poster image, and load video sources on interaction or visibility.',
        evidence: { videos: unmatched.map((r) => ({ src: r.url, bytes: r.transferSize })) },
        savings: { bytes, source: 'measured' },
      }));
    }
  }

  return {
    videos,
    embeds: embeds.map((e) => ({ src: e.src, loading: e.loading || null, aboveFold: e.aboveFold ?? null })),
    mediaRequests: mediaRequests.map((r) => ({ url: r.url, bytes: r.transferSize, startMs: r.startMs })),
    issues,
    inspected: !!inspection,
  };
}
