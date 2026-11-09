// Optional local Lighthouse runner (LIGHTHOUSE_MODE=local or psi-fallback-local).
// Uses Playwright's Chromium binary if no system Chrome is configured (CHROME_PATH).
// NOTE: Chrome launched by Lighthouse cannot be route-intercepted like Playwright; the URL
// is validated beforehand and the worker should run in a network-isolated container
// (see docs/DEPLOYMENT.md) to fully prevent SSRF through redirects.

import { loadPlaywright } from './browser.js';

let available = null;

export async function lighthouseAvailable() {
  if (available !== null) return available;
  try {
    await import('lighthouse');
    await import('chrome-launcher');
    available = !!(process.env.CHROME_PATH || (await loadPlaywright()));
  } catch {
    available = false;
  }
  return available;
}

export async function runLocalLighthouse(url, strategy, { signal } = {}) {
  if (!(await lighthouseAvailable())) throw new Error('Local Lighthouse is not installed (npm i lighthouse chrome-launcher)');
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  let chromePath = process.env.CHROME_PATH;
  if (!chromePath) chromePath = (await loadPlaywright()).chromium.executablePath();

  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const kill = () => chrome.kill();
  signal?.addEventListener('abort', kill, { once: true });
  try {
    const flags = {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      maxWaitForLoad: 45_000,
    };
    let config;
    if (strategy === 'desktop') {
      config = (await import('lighthouse/core/config/desktop-config.js')).default;
    }
    const result = await lighthouse(url, flags, config);
    if (!result?.lhr) throw new Error('Lighthouse returned no result');
    if (result.lhr.runtimeError) throw new Error(`Lighthouse: ${result.lhr.runtimeError.message}`);
    return result.lhr;
  } finally {
    signal?.removeEventListener('abort', kill);
    try {
      chrome.kill();
    } catch {
      /* already dead */
    }
  }
}
