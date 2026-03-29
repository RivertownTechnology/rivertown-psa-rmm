import puppeteer from 'puppeteer-core';

let browserPath: string | undefined;

function findChromium(): string {
  // Check common paths
  const paths = [
    '/usr/bin/chromium-browser',    // Alpine
    '/usr/bin/chromium',            // Alpine alt
    '/usr/bin/google-chrome',       // Debian
    '/usr/bin/google-chrome-stable',
    process.env.CHROMIUM_PATH,
  ];
  for (const p of paths) {
    if (p) {
      try {
        require('fs').accessSync(p);
        return p;
      } catch { /* skip */ }
    }
  }
  throw new Error('Chromium not found. Set CHROMIUM_PATH env var.');
}

/**
 * Convert HTML string to PDF buffer using headless Chromium
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  if (!browserPath) browserPath = findChromium();

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
