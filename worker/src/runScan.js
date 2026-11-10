// Scan orchestration: runs all collectors (in parallel where possible), builds the
// normalised report and stores it.

import { validatePublicUrl, runPageSpeed, fetchCrux, probeDocument, probeSeoFiles } from '@speedlab/shared/net';
import { buildReport } from '@speedlab/shared/analysis';
import { getStore } from '@speedlab/shared/store';
import { inspectPage, playwrightAvailable } from './collectors/browser.js';
import { runLocalLighthouse, lighthouseAvailable } from './collectors/lighthouse.js';
import { probeImages, sharpAvailable } from './collectors/images.js';

export const SCAN_STEPS = [
  { key: 'validate', label: 'Validating URL & SSRF checks' },
  { key: 'lighthouse', label: 'Lighthouse / PageSpeed Insights' },
  { key: 'field', label: 'Chrome UX Report field data' },
  { key: 'probe', label: 'Server, TTFB, SEO, robots.txt & sitemap' },
  { key: 'browser', label: 'Browser inspection (Playwright + CDP)' },
  { key: 'images', label: 'Image analysis (Sharp)' },
  { key: 'analysis', label: 'Building diagnostics & recommendations' },
  { key: 'save', label: 'Saving report' },
];

export async function capabilities() {
  const mode = process.env.LIGHTHOUSE_MODE || 'psi';
  return {
    pagespeedKey: !!process.env.PAGESPEED_API_KEY,
    cruxKey: !!(process.env.CRUX_API_KEY || process.env.PAGESPEED_API_KEY),
    lighthouseMode: mode,
    localLighthouse: mode !== 'psi' ? await lighthouseAvailable() : false,
    playwright: process.env.DISABLE_BROWSER === 'true' ? false : await playwrightAvailable(),
    sharp: await sharpAvailable(),
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new Error('Scan cancelled');
}

export async function runScan(payload, { signal, update }) {
  const { strategy = 'mobile', userId = 'local', projectId = null } = payload;
  const warnings = [];
  const warn = (w) => {
    warnings.push(w);
    update({ warning: w });
  };

  // 1) Validate --------------------------------------------------------------
  update({ step: 'validate', status: 'running', progress: 2, message: 'Validating URL' });
  const url = await validatePublicUrl(payload.url);
  update({ step: 'validate', status: 'done', progress: 5 });
  throwIfAborted(signal);

  const psiKey = process.env.PAGESPEED_API_KEY;
  const cruxKey = process.env.CRUX_API_KEY || psiKey;
  const mode = process.env.LIGHTHOUSE_MODE || 'psi'; // psi | local | psi-fallback-local
  const browserEnabled = process.env.DISABLE_BROWSER !== 'true';
  let done = 0;
  const tick = (weight) => {
    done += weight;
    update({ progress: 5 + done });
  };

  // 2) Parallel collectors ---------------------------------------------------
  const lighthouseTask = (async () => {
    update({ step: 'lighthouse', status: 'running', message: mode === 'local' ? 'Running local Lighthouse' : 'Running PageSpeed Insights (this takes 20–60 s)' });
    try {
      if (mode === 'local') {
        const lhr = await runLocalLighthouse(url, strategy, { signal });
        update({ step: 'lighthouse', status: 'done' });
        return { lhr, psi: null, source: 'local' };
      }
      try {
        const psi = await runPageSpeed(url, strategy, { apiKey: psiKey, signal });
        update({ step: 'lighthouse', status: 'done' });
        return { psi, lhr: psi.lighthouseResult, source: 'psi' };
      } catch (err) {
        if (signal.aborted) throw err;
        if (mode === 'psi-fallback-local' && (await lighthouseAvailable())) {
          warn(`PageSpeed Insights failed (${err.message}); fell back to local Lighthouse.`);
          const lhr = await runLocalLighthouse(url, strategy, { signal });
          update({ step: 'lighthouse', status: 'done' });
          return { lhr, psi: null, source: 'local' };
        }
        throw err;
      }
    } catch (err) {
      if (signal.aborted) throw err;
      update({ step: 'lighthouse', status: 'error' });
      warn(`Lighthouse data unavailable: ${err.message}`);
      return { lhr: null, psi: null, source: null, error: err };
    } finally {
      tick(40);
    }
  })();

  const cruxTask = (async () => {
    if (!cruxKey) {
      update({ step: 'field', status: 'skipped' });
      tick(5);
      return null;
    }
    update({ step: 'field', status: 'running' });
    try {
      const r = await fetchCrux(url, strategy, { apiKey: cruxKey, signal });
      update({ step: 'field', status: 'done' });
      return r;
    } catch (err) {
      if (signal.aborted) throw err;
      update({ step: 'field', status: 'error' });
      warn(`CrUX API: ${err.message} (falling back to PageSpeed field data if available)`);
      return null;
    } finally {
      tick(5);
    }
  })();

  const seoFilesTask = probeSeoFiles(url, { signal }).catch(() => null);

  const probeTask = (async () => {
    update({ step: 'probe', status: 'running' });
    try {
      const r = await probeDocument(url, { signal, mobile: strategy === 'mobile' });
      update({ step: 'probe', status: 'done' });
      return r;
    } catch (err) {
      if (signal.aborted) throw err;
      update({ step: 'probe', status: 'error' });
      warn(`Document probe failed: ${err.message}`);
      return null;
    } finally {
      tick(10);
    }
  })();

  const browserTask = (async () => {
    if (!browserEnabled || !(await playwrightAvailable())) {
      update({ step: 'browser', status: 'skipped' });
      // On Vercel this is the expected "Lite" mode – reported via report.mode, not as a warning.
      if (!process.env.VERCEL) {
        warn(
          browserEnabled
            ? 'Playwright/Chromium is not installed on the worker – element-level image, video, coverage and listener diagnostics are unavailable. Run "npm run browsers".'
            : 'Browser inspection disabled (DISABLE_BROWSER=true).',
        );
      }
      tick(20);
      return null;
    }
    update({ step: 'browser', status: 'running' });
    try {
      const r = await inspectPage(url, strategy, { signal });
      update({ step: 'browser', status: 'done' });
      return r;
    } catch (err) {
      if (signal.aborted) throw err;
      update({ step: 'browser', status: 'error' });
      warn(`Browser inspection failed: ${err.message}`);
      return null;
    } finally {
      tick(20);
    }
  })();

  const [lh, crux, probe, inspection, seoFiles] = await Promise.all([lighthouseTask, cruxTask, probeTask, browserTask, seoFilesTask]);
  throwIfAborted(signal);

  if (!lh.lhr && !inspection) {
    const err = new Error(lh.error?.message || 'Neither Lighthouse nor the browser inspection could analyse this page');
    err.code = lh.error?.code || 'SCAN_FAILED';
    throw err;
  }
  if (!lh.lhr) warn('Scores and throttled lab metrics are unavailable for this scan; metrics shown come from an unthrottled Playwright page load.');

  // 3) Image probe ------------------------------------------------------------
  let imageProbe = null;
  if (await sharpAvailable()) {
    update({ step: 'images', status: 'running', message: 'Re-encoding images with Sharp to measure savings' });
    try {
      imageProbe = await probeImages({ lhr: lh.lhr, inspection, signal });
      update({ step: 'images', status: 'done' });
    } catch (err) {
      if (signal.aborted) throw err;
      update({ step: 'images', status: 'error' });
      warn(`Image probe failed: ${err.message}`);
    }
  } else {
    update({ step: 'images', status: 'skipped' });
    warn('Sharp is not installed on the worker – compressed-size measurements are unavailable.');
  }
  update({ progress: 88 });
  throwIfAborted(signal);

  // 4) Build report -----------------------------------------------------------
  update({ step: 'analysis', status: 'running', message: 'Analysing results' });
  const report = buildReport({
    url,
    strategy,
    psi: lh.psi,
    lhr: lh.lhr,
    lighthouseSource: lh.source,
    crux,
    probe,
    inspection,
    imageProbe,
    seoFiles,
    warnings,
  });
  report.mode = inspection ? 'full' : process.env.VERCEL ? 'lite' : 'no-browser';
  update({ step: 'analysis', status: 'done', progress: 94 });

  // 5) Save ---------------------------------------------------------------------
  update({ step: 'save', status: 'running' });
  let scanId = null;
  try {
    scanId = await getStore().saveScan(report, { userId, projectId });
    report.id = scanId;
    update({ step: 'save', status: 'done' });
  } catch (err) {
    update({ step: 'save', status: 'error' });
    report.warnings.push(`Report could not be saved: ${err.message}`);
  }
  return { report, scanId };
}
