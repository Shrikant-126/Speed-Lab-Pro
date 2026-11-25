// Visual load: the page as Lighthouse saw it at the end of the run ("final-screenshot") and the
// filmstrip of frames captured while it loaded ("screenshot-thumbnails"). Only images Lighthouse
// actually captured are returned; nothing is synthesised.

const MAX_FINAL_BYTES = 400_000;
const MAX_FRAME_BYTES = 120_000;
const MAX_FRAMES = 12;

const isImage = (d, max) => typeof d === 'string' && d.startsWith('data:image/') && d.length <= max;

export function analyzeVisual({ lhr }) {
  const audits = lhr?.audits || {};
  const desktop = lhr?.configSettings?.formFactor === 'desktop';
  const emu = lhr?.configSettings?.screenEmulation || {};
  const viewport = { width: emu.width || (desktop ? 1350 : 412), height: emu.height || (desktop ? 940 : 823) };

  const finalData = audits['final-screenshot']?.details?.data;
  const finalScreenshot = isImage(finalData, MAX_FINAL_BYTES)
    ? { data: finalData, timing: typeof audits['final-screenshot']?.details?.timing === 'number' ? Math.round(audits['final-screenshot'].details.timing) : null }
    : null;

  const items = audits['screenshot-thumbnails']?.details?.items;
  const frames = (Array.isArray(items) ? items : [])
    .filter((f) => isImage(f?.data, MAX_FRAME_BYTES) && typeof f.timing === 'number')
    .slice(0, MAX_FRAMES)
    .map((f) => ({ timing: Math.round(f.timing), data: f.data }));

  return {
    formFactor: desktop ? 'desktop' : 'mobile',
    viewport,
    finalScreenshot,
    filmstrip: frames,
    available: !!(finalScreenshot || frames.length),
  };
}
