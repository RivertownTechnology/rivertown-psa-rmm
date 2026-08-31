import puppeteer from 'puppeteer-core';
import { accessSync } from 'fs';

let browserPath: string | undefined;

function findChromium(): string {
  const win = process.platform === 'win32';
  const paths = [
    process.env.CHROMIUM_PATH,
    // Linux (Docker/Railway)
    '/usr/bin/chromium-browser',    // Alpine
    '/usr/bin/chromium',            // Alpine alt
    '/usr/bin/google-chrome',       // Debian
    '/usr/bin/google-chrome-stable',
    // Windows dev
    ...(win ? [
      `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ] : []),
  ];
  for (const p of paths) {
    if (p) {
      try {
        // NOTE: must be a real import — require() doesn't exist in this ESM
        // module, and a ReferenceError here is swallowed by the catch, making
        // every path probe "fail" even when Chromium is installed.
        accessSync(p);
        return p;
      } catch { /* skip */ }
    }
  }
  throw new Error('Chromium not found. Set CHROMIUM_PATH env var.');
}

interface PdfOptions {
  /** Page margins; pass '0' margins for full-bleed documents that carry their own padding. */
  margin?: { top: string; right: string; bottom: string; left: string };
}

const DEFAULT_MARGIN = { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' };

/**
 * Convert HTML string to PDF buffer using headless Chromium
 */
export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  if (!browserPath) browserPath = findChromium();

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    // Set PDF_DEBUG=1 to pipe Chromium's own stderr into the container logs.
    dumpio: process.env.PDF_DEBUG === '1',
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      // --no-sandbox/--no-zygote are required in the Alpine container but
      // break desktop Chrome on Windows, so they're Linux-only. Never add
      // --single-process: it crashes modern Chromium (Target closed errors),
      // especially on ARM64.
      ...(process.platform !== 'win32'
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--no-zygote']
        : []),
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: opts.margin ?? DEFAULT_MARGIN,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
