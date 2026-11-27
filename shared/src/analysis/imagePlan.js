// Turns an analysed image (from analyzeImages) into a plain, numbered action plan:
// "resize 1361×768 → 1017×574 px, convert to WebP q75, target ≈ 30 KB, saves 136 KB".
// Works on old reports too, because it also reads the raw Lighthouse reasons stored on each image.

const DIM_PAIR = /\((\d+)\s*[x×]\s*(\d+)\)[^()]*\((\d+)\s*[x×]\s*(\d+)\)/i;

/** Parse Lighthouse's "larger than it needs to be (1361x768) for its displayed dimensions (581x326)". */
export function parseLhDims(reasons = []) {
  for (const r of reasons) {
    const m = String(r).match(DIM_PAIR);
    if (m) return { file: { w: +m[1], h: +m[2] }, displayed: { w: +m[3], h: +m[4] } };
  }
  return null;
}

/** Normalise Lighthouse's free-text reasons into issue codes used by the analyzer. */
export function lhReasonCodes(reasons = [], format = null) {
  const codes = new Set();
  const modernAlready = ['webp', 'avif', 'svg'].includes(format);
  for (const raw of reasons) {
    const r = String(raw);
    if (/larger than (it needs|its displayed)|displayed dimensions|responsive images/i.test(r)) codes.add('oversized');
    if (/modern (image )?format/i.test(r)) codes.add(modernAlready ? 'poor-compression' : 'legacy-format');
    else if (/compress/i.test(r)) codes.add('poor-compression');
    if (/offscreen|lazy/i.test(r)) codes.add('not-lazy');
    if (/video format|animated|\bGIF/i.test(r)) codes.add('animated-gif');
  }
  return [...codes];
}

const round = (n) => Math.round(n);

/**
 * @param img     one entry of report.images.images
 * @param opts    { strategy: 'mobile' | 'desktop' }
 * @returns {{ verdict: 'optimize'|'fix-markup'|'ok', currentBytes, targetBytes, savingsBytes, savingsPct, steps: {kind,title,detail}[] }}
 */
export function imagePlan(img, { strategy = 'mobile' } = {}) {
  const dpr = strategy === 'desktop' ? 1 : 1.75;
  const reasons = img.lighthouse?.reasons || [];
  const codes = new Set([...(img.issues || []), ...lhReasonCodes(reasons, img.format)]);
  const lhDims = parseLhDims(reasons);
  const steps = [];
  let targetWidth = null;
  const fmt = (img.format || '').toLowerCase();
  const isVector = fmt === 'svg';

  // ---- Savings: measured (Sharp) > Lighthouse > pixel-area estimate
  const current = img.transferSize ?? null;
  let savings = img.probe ? img.savingsBytes || 0 : Math.max(img.savingsBytes || 0, img.lighthouse?.wastedBytes || 0);
  if (current) savings = Math.min(savings, current);
  const target = current && savings ? Math.max(0, current - savings) : null;

  // ---- 1. Resize
  const natural = img.natural?.w ? img.natural : lhDims?.file || null;
  // Lighthouse's displayed size belongs to the same run as its savings claim, so prefer it.
  const displayed = lhDims?.displayed || (img.rendered?.w ? img.rendered : null);
  let w = null;
  let h = null;
  if (codes.has('oversized') && !isVector) {
    w = img.recommended?.width;
    h = img.recommended?.height;
    if ((!w || (natural?.w && w >= natural.w)) && displayed?.w) {
      w = Math.ceil(displayed.w * dpr);
      const ratio = natural?.w ? natural.h / natural.w : displayed.h / displayed.w;
      h = round(w * ratio);
    }
    // Never recommend making an image bigger: if the target is not clearly smaller, skip the resize.
    if (w && natural?.w && w >= natural.w * 0.95) {
      codes.delete('oversized');
      if (!codes.has('legacy-format') && !codes.has('animated-gif')) codes.add('poor-compression');
    }
  }
  if (codes.has('oversized') && !isVector) {
    targetWidth = w || null;
    const from = natural?.w ? `${natural.w}×${natural.h} px` : 'the current file';
    steps.push({
      kind: 'resize',
      title: w ? `Resize from ${from} to ${w}×${h} px` : 'Resize to the size it is displayed at',
      detail: displayed?.w
        ? `It is shown at only ${displayed.w}×${displayed.h} px on ${strategy}${dpr > 1 ? ` (×${dpr} for sharp screens = ${w} px wide)` : ''}. Every extra pixel is wasted download.${img.attrs?.srcset ? ' The page already has a srcset — make sure it includes a file this small and that "sizes" matches the real layout width.' : ' Upload this smaller version (or add it to srcset so phones get the small file and desktops the large one).'}`
        : 'The file has more pixels than the layout shows.',
    });
  }

  // ---- 2. Format / compression
  if (!isVector && codes.has('animated-gif')) {
    steps.push({ kind: 'format', title: 'Replace the animated GIF with an MP4/WebM video', detail: 'Use <video autoplay muted loop playsinline>. Usually 80–95% smaller.' });
  } else if (!isVector && codes.has('legacy-format')) {
    const to = img.recommended?.format ? img.recommended.format.toUpperCase() : 'WebP';
    steps.push({ kind: 'format', title: `Convert ${fmt.toUpperCase() || 'image'} → ${to} (quality 75–80)`, detail: `${to} is 25–50% smaller than ${fmt.toUpperCase() || 'JPEG/PNG'} at the same visual quality. Use the "Convert & optimize" tab or a plugin (e.g. ShortPixel, Imagify, EWWW for WordPress).` });
  } else if (!isVector && codes.has('poor-compression')) {
    steps.push({ kind: 'compress', title: `Re-compress the ${fmt ? fmt.toUpperCase() : 'image'} at quality 75`, detail: 'It is saved at a higher quality than needed. Quality 75–80 looks the same to visitors but the file is much smaller.' });
  }

  // ---- 3. Loading behaviour / markup
  if (codes.has('lazy-above-fold')) steps.push({ kind: 'markup', title: 'Remove loading="lazy"', detail: 'This image is visible on the first screen; lazy loading delays it.' });
  if (codes.has('not-lazy')) steps.push({ kind: 'markup', title: 'Add loading="lazy" decoding="async"', detail: 'It is below the first screen, so it should not download during the initial load.' });
  if (codes.has('lcp-no-fetchpriority')) steps.push({ kind: 'markup', title: 'Add fetchpriority="high"', detail: 'This is the LCP (largest) image — tell the browser to fetch it first.' });
  if (codes.has('missing-dimensions')) steps.push({ kind: 'markup', title: 'Add width and height attributes', detail: `Reserves space so the page does not jump (CLS).${natural?.w ? ` Use width="${natural.w}" height="${natural.h}".` : ''}` });
  if (codes.has('missing-srcset')) steps.push({ kind: 'markup', title: 'Add srcset + sizes', detail: 'Serve a small file to phones and a larger one to desktops.' });
  if (codes.has('missing-sizes')) steps.push({ kind: 'markup', title: 'Add a correct sizes attribute', detail: 'Without it the browser assumes full screen width and picks a bigger file.' });
  if (codes.has('causes-cls')) steps.push({ kind: 'markup', title: 'Reserve space (width/height or CSS aspect-ratio)', detail: 'This image moved content when it loaded.' });

  // Tiny savings are not worth re-exporting the file: drop file steps below 4 KB.
  const fileStep = (s) => ['resize', 'format', 'compress'].includes(s.kind);
  const worthIt = savings >= 4096 || !current;
  const finalSteps = worthIt ? steps : steps.filter((s) => !fileStep(s));
  const hasFile = finalSteps.some(fileStep);
  const verdict = hasFile ? 'optimize' : finalSteps.length ? 'fix-markup' : 'ok';
  return {
    verdict,
    steps: finalSteps,
    targetWidth: finalSteps.some((s) => s.kind === 'resize') ? targetWidth : null,
    targetFormat: hasFile && !isVector && fmt !== 'gif' ? 'webp' : null,
    currentBytes: current,
    targetBytes: hasFile ? target : null,
    savingsBytes: hasFile ? savings : 0,
    savingsPct: hasFile && current && savings ? round((savings / current) * 100) : 0,
  };
}
