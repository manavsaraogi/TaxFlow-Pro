'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

const PORTAL_URL = 'https://eportal.incometax.gov.in/iec/foservices/#/login';
const SS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR);

const STEALTH = `
  Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
  if(!window.chrome)window.chrome={};
  if(!window.chrome.runtime)window.chrome.runtime={};
`;

async function launchBrowser() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA||'')+'\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
    '--no-sandbox',
    '--disable-infobars',
    '--disable-popup-blocking',
    '--disable-web-security',
    '--disable-features=BlockInsecurePrivateNetworkRequests',
  ];
  for (const p of paths) {
    if (p && fs.existsSync(p)) return chromium.launch({ executablePath: p, headless: false, args: ARGS });
  }
  try { return await chromium.launch({ channel: 'chrome', headless: false, args: ARGS }); } catch {}
  return chromium.launch({ headless: false, args: ARGS });
}

// Wait for an element matching any selector to be visible
async function waitFor(page, selectors, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const s of selectors) {
      try {
        const el = await page.$(s);
        if (el && await el.isVisible().catch(() => false)) return el;
      } catch {}
    }
    await page.waitForTimeout(300);
  }
  return null;
}

// Click element by finding its bounding box coordinates
async function clickByText(page, text, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const box = await page.evaluate(txt => {
      const el = [...document.querySelectorAll('*')]
        .find(e => e.textContent.trim() === txt && e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, text).catch(() => null);
    if (box) { await page.mouse.click(box.x, box.y); return true; }
    await page.waitForTimeout(300);
  }
  return false;
}

async function fetchPortalData({ pan, password, dob, assessmentYear, onStatus }) {
  const log = m => { console.log('[portal]', m); onStatus?.(m); };

  log('Launching browser...');
  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
  });
  await context.addInitScript(STEALTH);

  const captured = { ais: null, tis: null, form26AS: null };
  const page = await context.newPage();

  try {
    // ── LOGIN ────────────────────────────────────────────────────────────────
    log('Opening portal...');
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);

    // Wait for PAN input to appear
    await page.waitForSelector('input', { timeout: 20000 }).catch(() => null);
    await page.screenshot({ path: path.join(SS_DIR, '01-login-page.png') }).catch(() => null);

    // Check if already at password step
    const hasPwd = await page.$('input[type="password"]').then(e => !!e).catch(() => false);
    if (!hasPwd) {
      log('Entering PAN...');
      const panEl = await waitFor(page, [
        'input[id="panAdhaarUserId"]',
        'input[placeholder*="PAN"]',
        'input[type="text"]',
      ]);
      if (!panEl) throw new Error('PAN field not found');
      await panEl.click({ clickCount: 3 });
      await panEl.fill(pan.toUpperCase());

      const contBtn = await waitFor(page, ['button:has-text("Continue")', 'button[type="submit"]']);
      if (contBtn) await contBtn.click();
      else await panEl.press('Enter');
      log('Clicked Continue');
    }

    // Wait for checkbox and tick it
    await page.waitForSelector('input[type="checkbox"], input[type="password"]', { timeout: 10000 }).catch(() => null);
    const chk = await page.$('input[type="checkbox"]').catch(() => null);
    if (chk && await chk.isVisible().catch(() => false) && !await chk.isChecked().catch(() => false)) {
      await chk.click();
      log('SAM checkbox ticked');
    }

    // Wait for password field
    log('Entering password...');
    const pwdEl = await waitFor(page, ['input[type="password"]'], 10000);
    if (!pwdEl) throw new Error('Password field not found');
    await pwdEl.click({ clickCount: 3 });
    await pwdEl.fill(password);
    await page.screenshot({ path: path.join(SS_DIR, '03-before-login.png') }).catch(() => null);

    const loginBtn = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Login")', 'button[type="submit"]']);
    if (loginBtn) await loginBtn.click();
    else await pwdEl.press('Enter');
    log('Clicked login');

    // Retry if "Request is not authenticated" appears
    for (let i = 0; i < 5; i++) {
      // Wait briefly then check
      await page.waitForTimeout(2000);
      const url = page.url();
      if (/dashboard|myaccount|home|landing|fileIncomeTaxReturn/i.test(url)) break;
      const notAuth = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')]
          .find(e => e.getBoundingClientRect().width > 0 &&
            /request.*not.*authenticated/i.test(e.textContent) &&
            e.children.length === 0);
        return el ? el.textContent.trim() : null;
      }).catch(() => null);
      if (!notAuth) break;
      log('Not authenticated — retrying login (' + (i + 1) + ')...');
      const btn = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Login")', 'button[type="submit"]'], 3000);
      if (btn) await btn.click(); else await page.keyboard.press('Enter');
    }

    // Wait for dashboard
    log('Waiting for dashboard...');
    await waitDashboard(page, log);
    log('Logged in!');

    // Screenshot + log what's on screen after dashboard
    await page.screenshot({ path: path.join(SS_DIR, 'after-dashboard.png') }).catch(() => null);
    const allText = await page.evaluate(() =>
      [...document.querySelectorAll('a, li, span, button')]
        .filter(e => e.getBoundingClientRect().width > 0)
        .map(e => e.textContent.trim())
        .filter(t => t.length > 0 && t.length < 25)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 50)
    ).catch(() => []);
    log('Page elements: ' + allText.join(' | '));
    await page.locator('a, li, span, button').filter({ hasText: /AIS/ }).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);

    // ── AIS ──────────────────────────────────────────────────────────────────
    log('Navigating to AIS...');
    await fetchAIS(page, context, { assessmentYear: assessmentYear || '2025-26', pan, dob }, captured, log);

    log(`Done — AIS:${captured.ais ? 'YES' : 'NO'} 26AS:${captured.form26AS ? 'YES' : 'NO'}`);
    return { ais: captured.ais, form26AS: captured.form26AS, tis: captured.tis };

  } catch (e) {
    await page.screenshot({ path: path.join(SS_DIR, 'error.png'), fullPage: true }).catch(() => null);
    log('Error: ' + e.message);
    throw e;
  } finally {
    await browser.close().catch(() => null);
  }
}

async function fetchAIS(page, context, { assessmentYear, pan, dob }, captured, log) {
  // Register new-tab listener BEFORE clicking
  const newTabPromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);

  // Scroll to top and wait for nav to settle
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => null);
  await page.waitForTimeout(1500);

  // The IT portal nav may be in a collapsed hamburger on smaller windows — maximise first
  await page.evaluate(() => { try { document.body.style.zoom = '0.8'; } catch {} }).catch(() => null);
  await page.waitForTimeout(500);

  log('Looking for AIS nav link...');

  // Try clicking a hamburger/menu toggle if the nav is collapsed
  const hamburger = await page.$('button[class*="menu"], button[aria-label*="menu" i], .hamburger, .nav-toggle, button:has-text("Menu")').catch(() => null);
  if (hamburger && await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    log('Opened hamburger menu');
    await page.waitForTimeout(800);
  }

  // Try multiple locator strategies
  let aisLocator = null;
  for (const selector of [
    'a:text-is("AIS")',
    'span:text-is("AIS")',
    'li:text-is("AIS")',
    'button:text-is("AIS")',
    'a[href*="AIS"]',
    '[class*="nav"] :text("AIS")',
    'a >> text=AIS',
  ]) {
    try {
      const loc = page.locator(selector).first();
      const n = await loc.count();
      if (!n) continue;
      // Force element into view via JS then check visibility
      await loc.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' })).catch(() => null);
      await page.waitForTimeout(300);
      if (await loc.isVisible().catch(() => false)) { aisLocator = loc; log('AIS found: ' + selector); break; }
    } catch { /* try next */ }
  }

  // Fallback: click by text coordinate scan
  if (!aisLocator) {
    const clicked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('a, li, span, button')]
        .find(e => e.textContent.trim() === 'AIS');
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.click();
      return true;
    }).catch(() => false);
    if (clicked) { log('AIS clicked via JS fallback'); await page.waitForTimeout(1000); }
    else {
      log('AIS nav not found — page: ' + page.url());
      await page.screenshot({ path: path.join(SS_DIR, 'ais-not-found.png') }).catch(() => null);
      return;
    }
  }

  if (aisLocator) {
    log('Clicking AIS nav link...');
    await aisLocator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' })).catch(() => null);
    await page.waitForTimeout(300);
    await aisLocator.click();
  }
  await page.screenshot({ path: path.join(SS_DIR, 'ais-click.png') }).catch(() => null);

  // Wait for AIS tab to open
  let aisPage = await newTabPromise;
  if (!aisPage) {
    aisPage = context.pages().find(p =>
      p.url().includes('ais.insight') || p.url().includes('complianceportal')
    ) || null;
  }
  if (!aisPage) { log('AIS tab did not open'); return; }

  // Wait for AIS portal to load (SSO redirect)
  await aisPage.waitForLoadState('domcontentloaded').catch(() => null);
  await aisPage.bringToFront().catch(() => null);

  // Intercept AIS API responses to capture TDS/AIS data directly (unencrypted)
  aisPage.on('response', async res => {
    const url = res.url();
    const status = res.status();
    if (status !== 200) return;
    const ct = res.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;
    try {
      const text = await res.text().catch(() => null);
      if (!text || text.length < 200) return;
      let json; try { json = JSON.parse(text); } catch { return; }
      log('[ais-net] ' + url.replace('https://ais.insight.gov.in','').slice(0,80) + ' (' + text.length + 'b) keys=' + Object.keys(json).join(',').slice(0,60));

      if (!captured.ais && text.length > 5000 &&
        !/auth|token|ticker|general-info\/user|captcha|session/i.test(url)) {
        captured.ais = json;
        log('✓ AIS data captured (' + text.length + ' bytes): ' + url);
        // Deep structure log
        const topKeys = Object.keys(json);
        log('top-level keys: ' + topKeys.join(', '));
        if (json.data) log('.data keys: ' + Object.keys(json.data).join(', '));
        if (json.data?.aisTaxpayerData) log('.data.aisTaxpayerData keys: ' + Object.keys(json.data.aisTaxpayerData).join(', '));
        if (json.aisInformation) log('.aisInformation length: ' + json.aisInformation.length);
        if (Array.isArray(json)) log('root array length: ' + json.length);
      }
    } catch {}
  });

  await aisPage.screenshot({ path: path.join(SS_DIR, 'ais-portal.png') }).catch(() => null);
  log('AIS portal: ' + aisPage.url());

  // ── Click AIS in the compliance portal top nav ────────────────────────────
  log('Clicking AIS in compliance portal nav...');
  const aisNavLocator = aisPage.locator('a, li, span, button').filter({ hasText: /^AIS$/ }).first();
  if (await aisNavLocator.isVisible().catch(() => false)) {
    await aisNavLocator.click();
    log('Clicked compliance portal AIS nav');
    await aisPage.waitForLoadState('domcontentloaded').catch(() => null);
  }
  await aisPage.screenshot({ path: path.join(SS_DIR, 'ais-home.png') }).catch(() => null);

  // ── Select Financial Year ─────────────────────────────────────────────────
  const fyLabel = 'F.Y. ' + assessmentYear;
  log('Selecting FY: ' + fyLabel);

  // Wait for dropdown to appear
  const fyTrigger = await waitFor(aisPage, ['mat-select', 'select', '[role="combobox"]'], 10000);
  if (fyTrigger) {
    await fyTrigger.click();
    // Wait for options to appear then click the right one
    const fyOpt = await waitFor(aisPage, [
      `mat-option:has-text("${fyLabel}")`,
      `li:has-text("${fyLabel}")`,
      `[role="option"]:has-text("${fyLabel}")`,
    ], 5000);
    if (fyOpt) { await fyOpt.click(); log('Selected FY: ' + fyLabel); }
    else log('FY option not found');
  } else {
    log('FY dropdown not found');
  }
  await aisPage.screenshot({ path: path.join(SS_DIR, 'ais-fy-selected.png') }).catch(() => null);

  // ── Click Download button ─────────────────────────────────────────────────
  log('Looking for Download button...');
  const dlPromise = aisPage.waitForEvent('download', { timeout: 180000 }).catch(() => null);

  // Wait for the download button to appear
  const dlBtn = await waitFor(aisPage, [
    'button:has-text("Download AIS")',
    'a:has-text("Download AIS")',
    'button:has-text("Download AIS/TIS")',
    '[class*="download"]',
    'mat-icon:has-text("file_download")',
    'button[aria-label*="download" i]',
    'a[aria-label*="download" i]',
  ], 10000);

  if (!dlBtn) {
    await aisPage.screenshot({ path: path.join(SS_DIR, 'ais-no-btn.png'), fullPage: true }).catch(() => null);
    log('Download button not found');
    return;
  }
  await dlBtn.click();
  log('Clicked Download button');
  await aisPage.screenshot({ path: path.join(SS_DIR, 'ais-after-dl-click.png') }).catch(() => null);

  // ── Modal: click Download next to JSON row ────────────────────────────────
  log('Waiting for download modal...');
  // Wait for modal to appear
  await waitFor(aisPage, ['text=Annual Information Statement (AIS) - JSON', '.modal', '[role="dialog"]'], 8000);
  await aisPage.screenshot({ path: path.join(SS_DIR, 'ais-modal.png') }).catch(() => null);

  // Find Download button in the JSON row (2nd Download button in modal)
  const jsonDlBox = await aisPage.evaluate(() => {
    const dlBtns = [...document.querySelectorAll('button, a')]
      .filter(e => e.textContent.trim().toLowerCase() === 'download' && e.getBoundingClientRect().width > 0);
    // Row order: AIS-PDF (1st), AIS-JSON (2nd), TIS-PDF (3rd)
    const btn = dlBtns[1] || dlBtns[0];
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }).catch(() => null);

  if (jsonDlBox) {
    await aisPage.mouse.click(jsonDlBox.x, jsonDlBox.y);
    log('Clicked JSON Download — solve captcha in browser if shown');
  } else {
    log('JSON Download button not found in modal');
    await aisPage.screenshot({ path: path.join(SS_DIR, 'ais-no-json.png') }).catch(() => null);
  }

  // ── Wait for file download ────────────────────────────────────────────────
  log('⚠ Waiting for download (solve captcha in browser)...');
  const dl = await dlPromise;
  if (!dl) { log('Download did not complete'); return; }

  const fp = await dl.path();
  if (!fp) { log('No file path'); return; }

  const buf = fs.readFileSync(fp);
  const raw = buf.toString('utf8');
  log('Downloaded: ' + raw.length + ' chars, starts: ' + raw.slice(0, 20));

  let jsonText = null;

  // AIS Utility v14+ format: [32-hex IV][32-hex Salt][Base64 AES-256-CBC ciphertext]
  // Password = pan.toLowerCase() + "GQ39%*g" + dob_DDMMYYYY
  // Key = PBKDF2-SHA256(password, salt, 1000 iterations, 32 bytes)
  const hexPrefix = raw.slice(0, 64);
  const isHex = /^[0-9a-f]{64}/i.test(hexPrefix);

  if (isHex) {
    const iv   = Buffer.from(raw.slice(0, 32), 'hex');
    const salt = Buffer.from(raw.slice(32, 64), 'hex');
    const encrypted = Buffer.from(raw.slice(64), 'base64');
    const AIS_ID = 'GQ39%*g';
    const password = (pan || '').toLowerCase() + AIS_ID + (dob || '');
    if (!dob) {
      log('⚠ DOB not set for this client — cannot decrypt downloaded AIS file. Please edit the client in TaxFlow Pro and save the Date of Birth, then retry.');
    } else {
      log('AIS Utility v14 format. Deriving key via PBKDF2 for pan=' + (pan||'') + ' dob=' + dob);
      try {
        const { pbkdf2Sync, createDecipheriv } = crypto;
        const key = pbkdf2Sync(password, salt, 1000, 32, 'sha256');
        const decipher = createDecipheriv('aes-256-cbc', key, iv);
        decipher.setAutoPadding(true);
        jsonText = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        log('✓ AIS file decrypted successfully');
      } catch (e) {
        log('Decryption failed (check DOB is correct DDMMYYYY): ' + e.message.split('\n')[0]);
      }
    }
  } else if (raw.trimStart().startsWith('{') || raw.trimStart().startsWith('[')) {
    jsonText = raw;
    log('Plain JSON detected');
  } else {
    log('Unknown format, first 100: ' + raw.slice(0, 100));
  }

  if (jsonText) {
    try {
      captured.ais = JSON.parse(jsonText.trim());
      log('✓ AIS JSON parsed! Keys: ' + Object.keys(captured.ais).slice(0, 6).join(', '));
    } catch {
      log('JSON parse failed — first 200: ' + jsonText.slice(0, 200));
      captured.ais = { raw: jsonText };
    }
  }
}

async function waitDashboard(page, log) {
  // Fast path: wait for URL to match dashboard pattern
  const urlReached = await page.waitForURL(
    /dashboard|myaccount|home|landing|fileIncomeTaxReturn/i,
    { timeout: 90000 }
  ).then(() => true).catch(() => false);

  if (urlReached) {
    log('Dashboard reached: ' + page.url());
    return;
  }

  // Slow path: may be stuck on dialog or captcha — poll for 90s
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(2000);
    const url = page.url();
    if (/dashboard|myaccount|home|landing|fileIncomeTaxReturn/i.test(url)) {
      log('Dashboard reached: ' + url); return;
    }
    const loginHere = await page.$('button:has-text("Login Here")').catch(() => null);
    if (loginHere && await loginHere.isVisible().catch(() => false)) {
      await loginHere.click(); log('Dual login — clicked Login Here');
    }
    const no = await page.$('button:has-text("No")').catch(() => null);
    if (no && await no.isVisible().catch(() => false)) {
      await no.click(); log('Logout dialog — clicked No');
    }
    if (i === 15) log('Still waiting... check browser for captcha or OTP.');
  }
  throw new Error('Login timed out after 90 seconds.');
}

// Extract 26AS text from a TRACES-downloaded ZIP.
// TRACES ZIP password = PAN (uppercase) + DOB as DDMMYYYY, e.g. "JOMPS8827A06051999"
function extract26ASFromZip(zipPath, pan, dob, log) {
  try {
    const zipPassword = (pan || '').toUpperCase() + (dob || '');
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    log('ZIP entries: ' + entries.map(e => e.entryName).join(', '));
    for (const entry of entries) {
      if (/\.(txt|html|htm|csv)$/i.test(entry.entryName)) {
        let data;
        if (zipPassword) {
          try { data = zip.readFile(entry, zipPassword); } catch { /* try without */ }
        }
        if (!data) data = zip.readFile(entry);
        if (data && data.length > 100) {
          const text = data.toString('utf8');
          log('✓ 26AS extracted from ZIP (' + text.length + ' chars) — file: ' + entry.entryName);
          return text;
        }
      }
    }
    log('No text file found in ZIP');
  } catch (e) {
    log('ZIP extraction error: ' + e.message);
  }
  return null;
}

async function fetch26AS({ pan, password, dob, assessmentYear, onStatus }) {
  const log = m => { console.log('[26as]', m); onStatus?.(m); };

  // assessmentYear like "2025-26" — used as-is on TRACES AY dropdown
  const ay = assessmentYear || '2025-26';

  log('Launching browser...');
  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    acceptDownloads: true,
  });
  await context.addInitScript(STEALTH);
  const page = await context.newPage();
  const captured = { text26AS: null };

  try {
    // ── STEP 1: LOGIN ────────────────────────────────────────────────────────
    log('Opening portal...');
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await page.waitForSelector('input', { timeout: 20000 }).catch(() => null);

    const hasPwd = await page.$('input[type="password"]').then(e => !!e).catch(() => false);
    if (!hasPwd) {
      log('Entering PAN...');
      const panEl = await waitFor(page, ['input[id="panAdhaarUserId"]', 'input[placeholder*="PAN"]', 'input[type="text"]']);
      if (!panEl) throw new Error('PAN field not found');
      await panEl.click({ clickCount: 3 });
      await panEl.fill(pan.toUpperCase());
      const contBtn = await waitFor(page, ['button:has-text("Continue")', 'button[type="submit"]']);
      if (contBtn) await contBtn.click(); else await panEl.press('Enter');
      log('Clicked Continue');
    }

    await page.waitForSelector('input[type="checkbox"], input[type="password"]', { timeout: 10000 }).catch(() => null);
    const chk = await page.$('input[type="checkbox"]').catch(() => null);
    if (chk && await chk.isVisible().catch(() => false) && !await chk.isChecked().catch(() => false)) {
      await chk.click(); log('SAM checkbox ticked');
    }

    log('Entering password...');
    const pwdEl = await waitFor(page, ['input[type="password"]'], 10000);
    if (!pwdEl) throw new Error('Password field not found');
    await pwdEl.click({ clickCount: 3 });
    await pwdEl.fill(password);
    const loginBtn = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Login")', 'button[type="submit"]']);
    if (loginBtn) await loginBtn.click(); else await pwdEl.press('Enter');
    log('Clicked login');

    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(800);
      const url = page.url();
      if (/dashboard|myaccount|home|landing|fileIncomeTaxReturn/i.test(url)) break;
      const notAuth = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')]
          .find(e => e.getBoundingClientRect().width > 0 && /request.*not.*authenticated/i.test(e.textContent) && e.children.length === 0);
        return el ? el.textContent.trim() : null;
      }).catch(() => null);
      if (!notAuth) break;
      log('Not authenticated — retrying (' + (i + 1) + ')...');
      const btn = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Login")', 'button[type="submit"]'], 2000);
      if (btn) await btn.click(); else await page.keyboard.press('Enter');
    }

    log('Waiting for dashboard...');
    await waitDashboard(page, log);
    log('Logged in!');
    await page.screenshot({ path: path.join(SS_DIR, '26as-01-dashboard.png') }).catch(() => null);

    // ── STEP 2: Navigate to TRACES via direct URL (most reliable) ────────────
    log('Navigating to View Form 26AS (direct URL)...');

    // Register new-tab listener BEFORE navigating — the portal may open TRACES in a new tab
    let tracesTabPromise = context.waitForEvent('page', { timeout: 60000 }).catch(() => null);

    // Primary: use the portal's deep link which SSO-redirects to TRACES
    await page.goto(
      'https://eportal.incometax.gov.in/iec/foservices/#/taxstatement/form26as',
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    ).catch(() => null);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(SS_DIR, '26as-02-after-direct-nav.png') }).catch(() => null);
    log('After direct nav, URL: ' + page.url());

    // If the direct URL logged us out, re-login first
    if (/login|signin/i.test(page.url())) {
      log('Session expired — re-logging in...');
      await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      await waitDashboard(page, log);
      tracesTabPromise = context.waitForEvent('page', { timeout: 60000 }).catch(() => null);
      await page.goto(
        'https://eportal.incometax.gov.in/iec/foservices/#/taxstatement/form26as',
        { waitUntil: 'domcontentloaded', timeout: 30000 }
      ).catch(() => null);
      await page.waitForTimeout(4000);
    }

    // The direct URL may land on an IT-portal intermediate page with a "Proceed to TRACES"
    // or "View Form 26AS" button. Click it if TRACES hasn't opened yet.
    if (!/traces\.gov\.in|tdscpc\.gov\.in/i.test(page.url())) {
      log('Checking for SSO proceed button on portal 26AS page...');
      await page.screenshot({ path: path.join(SS_DIR, '26as-02b-sso-page.png') }).catch(() => null);
      const ssoClicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')]
          .find(e => /proceed|view.*form.*26as|form.*26as|annual tax statement|go to traces/i.test(
            (e.textContent || e.value || '').trim()
          ) && e.getBoundingClientRect().width > 0);
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
        return false;
      }).catch(() => false);
      if (ssoClicked) {
        log('Clicked SSO proceed button — waiting for TRACES...');
        await page.waitForTimeout(5000);
      }
    }

    // Fallback: menu navigation — hover over "Income Tax Returns" to open submenu
    if (!/traces\.gov\.in|tdscpc\.gov\.in/i.test(page.url())) {
      log('Direct URL did not open TRACES — trying menu navigation...');
      const efileClicked = await clickMenuItem(page, /e-fil/i, log, 'e-File/e-Filing menu');
      if (efileClicked) {
        await page.waitForTimeout(1000);
        // Hover over "Income Tax Returns" to reveal its submenu (it has a ▶ arrow)
        const hovered = await page.evaluate(() => {
          const el = [...document.querySelectorAll('a, li, button, span')]
            .find(e => /income tax returns/i.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0);
          if (el) {
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            return true;
          }
          return false;
        }).catch(() => false);
        if (hovered) {
          log('Hovered Income Tax Returns — waiting for submenu...');
          await page.waitForTimeout(800);
        }
        // Now click "View Form 26AS" from the submenu
        const clicked = await clickMenuItemVisible(page, /view.*form.*26as|view.*26as|form.*26as/i, log, 'View Form 26AS');
        if (!clicked) {
          // Last try: JS click on any matching visible link
          await page.evaluate(() => {
            const el = [...document.querySelectorAll('a, li, span, button')]
              .find(e => /view.*form.*26as|form.*26as|annual tax statement/i.test(e.textContent) && e.getBoundingClientRect().width > 0);
            if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
          }).catch(() => null);
        }
      } else {
        // e-File menu not found — try a direct JS search for any 26AS link
        await page.evaluate(() => {
          const el = [...document.querySelectorAll('a, li, span, button')]
            .find(e => /view form 26as|annual tax statement/i.test(e.textContent) && e.getBoundingClientRect().width > 0);
          if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
        }).catch(() => null);
      }
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: path.join(SS_DIR, '26as-03-after-nav.png') }).catch(() => null);
    log('After navigation, page URL: ' + page.url());

    // ── STEP 3: Wait for TRACES tab to open ─────────────────────────────────
    log('Waiting for TRACES portal to open...');
    let tracesPage = await tracesTabPromise;

    // If no new tab, check if current page redirected to TRACES, or search existing tabs
    if (!tracesPage) {
      if (/traces\.gov\.in|tdscpc\.gov\.in/i.test(page.url())) {
        tracesPage = page;
        log('Current page redirected to TRACES');
      } else {
        tracesPage = context.pages().find(p => /traces\.gov\.in|tdscpc\.gov\.in/i.test(p.url())) ?? null;
      }
    }

    if (!tracesPage) {
      // Last resort: try the direct portal URL that redirects to TRACES
      log('TRACES not opened — trying direct portal redirect URL...');
      tracesTabPromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);
      await page.goto(
        'https://eportal.incometax.gov.in/iec/foservices/#/taxstatement/form26as',
        { waitUntil: 'domcontentloaded', timeout: 20000 }
      ).catch(() => null);
      await page.waitForTimeout(3000);
      tracesPage = await tracesTabPromise;
      if (!tracesPage) {
        tracesPage = context.pages().find(p => /traces\.gov\.in|tdscpc\.gov\.in/i.test(p.url())) ?? null;
      }
      if (!tracesPage && /traces\.gov\.in|tdscpc\.gov\.in/i.test(page.url())) {
        tracesPage = page;
      }
    }

    if (!tracesPage) {
      await page.screenshot({ path: path.join(SS_DIR, '26as-no-traces.png') }).catch(() => null);
      throw new Error('TRACES portal did not open. Please check that the browser navigated to e-File → Income Tax Returns → View Form 26AS and try again.');
    }

    await tracesPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => null);
    await tracesPage.bringToFront().catch(() => null);
    log('TRACES portal opened: ' + tracesPage.url());
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-05-traces.png') }).catch(() => null);

    // Wait for TRACES page to fully load (it can be slow due to SSO)
    await tracesPage.waitForTimeout(3000);

    // ── STEP 4: TRACES — "I agree" checkbox + Proceed ───────────────────────
    log('Looking for "I agree" checkbox on TRACES...');
    for (let attempt = 0; attempt < 3; attempt++) {
      // The acceptance checkbox text: "I agree to the usage and acceptance of Form 16 / 16A generated from TRACES"
      const agreeChk = await tracesPage.evaluate(() => {
        // Find checkbox near "I agree" text
        const labels = [...document.querySelectorAll('label, span, td, div, p')]
          .filter(e => /i agree|usage.*acceptance|acceptance.*usage/i.test(e.textContent) && e.getBoundingClientRect().width > 0);
        for (const lbl of labels) {
          const chk = lbl.querySelector('input[type="checkbox"]') ||
                      lbl.previousElementSibling?.querySelector?.('input[type="checkbox"]') ||
                      document.querySelector('input[type="checkbox"]');
          if (chk && !chk.checked) { chk.click(); return 'clicked'; }
          if (chk?.checked) return 'already-checked';
        }
        // Fallback: click any unchecked checkbox on the page
        const anyChk = document.querySelector('input[type="checkbox"]:not(:checked)');
        if (anyChk) { anyChk.click(); return 'fallback-clicked'; }
        return null;
      }).catch(() => null);

      if (agreeChk) {
        log('I agree checkbox: ' + agreeChk);
        break;
      }
      await tracesPage.waitForTimeout(1500);
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-06-agree-attempt' + attempt + '.png') }).catch(() => null);
    }

    await tracesPage.waitForTimeout(500);
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-07-after-agree.png') }).catch(() => null);

    // Click "Proceed" button
    log('Clicking Proceed...');
    const proceedClicked = await tracesPage.evaluate(() => {
      const btn = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a')]
        .find(e => /^proceed$/i.test(e.value?.trim() || e.textContent?.trim()) && e.getBoundingClientRect().width > 0);
      if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return true; }
      return false;
    }).catch(() => false);

    if (!proceedClicked) {
      log('Proceed button not found — trying submit...');
      await tracesPage.evaluate(() => {
        const btn = document.querySelector('input[type="submit"], button[type="submit"]');
        if (btn) btn.click();
      }).catch(() => null);
    }

    await tracesPage.waitForTimeout(2000);
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-08-after-proceed.png') }).catch(() => null);
    log('After Proceed, TRACES URL: ' + tracesPage.url());

    // ── STEP 5: Click "View Tax Credit (Form 26AS/Annual Tax Statement)" ──────
    log('Clicking View Tax Credit (Form 26AS/Annual Tax Statement)...');
    await tracesPage.waitForTimeout(1000);

    const viewTaxCreditClicked = await tracesPage.evaluate(() => {
      const el = [...document.querySelectorAll('a, button, span, li, td, div')]
        .find(e => /view tax credit|form 26as.*annual|annual.*tax statement/i.test(e.textContent) && e.getBoundingClientRect().width > 0);
      if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return el.textContent.trim().slice(0, 60); }
      return null;
    }).catch(() => null);

    if (viewTaxCreditClicked) {
      log('Clicked: ' + viewTaxCreditClicked);
    } else {
      log('View Tax Credit link not found — taking screenshot for debugging');
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-09-no-view-credit.png'), fullPage: true }).catch(() => null);
    }

    await tracesPage.waitForTimeout(2000);
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-10-view-credit.png') }).catch(() => null);

    // ── STEP 6: Select Assessment Year ──────────────────────────────────────
    // TRACES AY dropdown: values like "2025-26" or "2026" or numeric year
    log('Selecting Assessment Year: ' + ay);
    await tracesPage.waitForTimeout(1000);

    const aySelected = await tracesPage.evaluate((ayLabel) => {
      const selects = [...document.querySelectorAll('select')];
      for (const sel of selects) {
        const opts = [...sel.options].map(o => o.text.trim());
        // Try exact match first
        const exactOpt = [...sel.options].find(o => o.text.trim() === ayLabel || o.value === ayLabel);
        if (exactOpt) {
          sel.value = exactOpt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return 'exact: ' + exactOpt.text;
        }
        // Try partial match (e.g. "2025-26" contains "2025")
        const [ayStart] = ayLabel.split('-');
        const partialOpt = [...sel.options].find(o => o.text.includes(ayStart) || o.value.includes(ayStart));
        if (partialOpt) {
          sel.value = partialOpt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return 'partial: ' + partialOpt.text;
        }
      }
      return null;
    }, ay).catch(() => null);

    if (aySelected) {
      log('AY selected: ' + aySelected);
    } else {
      log('AY dropdown not found — may need manual selection');
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-11-no-ay.png'), fullPage: true }).catch(() => null);
    }

    await tracesPage.waitForTimeout(500);

    // ── STEP 7: Select "View As" = Text File ────────────────────────────────
    log('Selecting View As = Text File...');
    const viewAsSelected = await tracesPage.evaluate(() => {
      const selects = [...document.querySelectorAll('select')];
      for (const sel of selects) {
        const textOpt = [...sel.options].find(o => /text|txt/i.test(o.text) || o.value.toUpperCase() === 'T');
        if (textOpt) {
          sel.value = textOpt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return 'selected: ' + textOpt.text;
        }
      }
      // If only one select (AY dropdown), try looking for a radio button for "Text"
      const radioText = [...document.querySelectorAll('input[type="radio"]')]
        .find(r => /text|txt/i.test(r.value) || /text/i.test(r.nextSibling?.textContent));
      if (radioText && !radioText.checked) {
        radioText.click();
        return 'radio: ' + radioText.value;
      }
      return null;
    }).catch(() => null);

    if (viewAsSelected) {
      log('View As: ' + viewAsSelected);
    } else {
      log('View As = Text selector not found — may default to HTML; will try to parse whatever downloads');
    }

    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-12-view-as.png') }).catch(() => null);

    // ── STEP 8: Click "View/Download" and capture the ZIP ───────────────────
    log('Clicking View/Download button...');
    const dlPromise = tracesPage.waitForEvent('download', { timeout: 120000 }).catch(() => null);

    const viewDlClicked = await tracesPage.evaluate(() => {
      const btn = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a')]
        .find(e => /view.*download|download.*view|^view$|^download$/i.test((e.value || e.textContent || '').trim()) && e.getBoundingClientRect().width > 0);
      if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return btn.textContent?.trim() || btn.value; }
      // Fallback: click first submit button
      const submit = document.querySelector('input[type="submit"], button[type="submit"]');
      if (submit) { submit.click(); return 'submit: ' + (submit.value || submit.textContent).trim(); }
      return null;
    }).catch(() => null);

    if (viewDlClicked) {
      log('Clicked: ' + viewDlClicked);
    } else {
      log('View/Download button not found — check TRACES page screenshot');
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-13-no-view-dl.png'), fullPage: true }).catch(() => null);
    }

    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-14-after-view-dl.png') }).catch(() => null);

    // ── STEP 9: Wait for ZIP download ───────────────────────────────────────
    log('Waiting for 26AS ZIP to download (may take 30-60 seconds)...');
    const dl = await dlPromise;

    if (!dl) {
      // Maybe it rendered inline as HTML (when Text File wasn't selected, or server returned HTML)
      log('No download detected — trying to capture inline 26AS page content...');
      await tracesPage.waitForTimeout(3000);
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-15-inline.png') }).catch(() => null);

      const inlineContent = await tracesPage.evaluate(() => {
        // Try to get caret-delimited text from any tables
        const tables = document.querySelectorAll('table');
        if (tables.length > 0) {
          let result = '';
          tables.forEach(t => {
            t.querySelectorAll('tr').forEach(r => {
              const cells = [...r.querySelectorAll('td, th')].map(c => c.textContent.trim());
              if (cells.length > 1) result += cells.join('^') + '\n';
            });
            result += '\n';
          });
          return result.length > 200 ? result : null;
        }
        return null;
      }).catch(() => null);

      if (inlineContent) {
        captured.text26AS = inlineContent;
        log('✓ Captured inline 26AS HTML table content (' + inlineContent.length + ' chars)');
      } else {
        log('No inline content found. The 26AS may still be loading — please check the browser.');
      }
    } else {
      // ── STEP 10: Extract ZIP ─────────────────────────────────────────────
      const fp = await dl.path();
      log('Download complete: ' + (fp || 'unknown path'));

      if (fp) {
        const zipPassword = (pan || '').toUpperCase() + (dob || '');
        log('Extracting ZIP with password: ' + zipPassword);
        captured.text26AS = extract26ASFromZip(fp, pan, dob, log);
      }
    }

    log(`Done — 26AS: ${captured.text26AS ? 'YES (' + captured.text26AS.length + ' chars)' : 'NO'}`);
    return { form26AS: captured.text26AS ? { raw: captured.text26AS } : null };

  } catch (e) {
    await page.screenshot({ path: path.join(SS_DIR, '26as-error.png'), fullPage: true }).catch(() => null);
    log('Error: ' + e.message);
    throw e;
  } finally {
    await browser.close().catch(() => null);
  }
}

// Click an element matching a regex in the top-level nav (may be hidden until hovered)
async function clickMenuItem(page, regex, log, label) {
  // Try Playwright locator first
  try {
    const loc = page.locator('a, li, button, span').filter({ hasText: regex }).first();
    if (await loc.count() > 0) {
      await loc.scrollIntoViewIfNeeded().catch(() => null);
      await page.waitForTimeout(200);
      if (await loc.isVisible().catch(() => false)) {
        await loc.click();
        log('Clicked ' + label + ' (playwright)');
        return true;
      }
    }
  } catch {}
  // Fallback: JS click
  const clicked = await page.evaluate((re) => {
    const pattern = new RegExp(re.source, re.flags);
    const el = [...document.querySelectorAll('a, li, button, span, div')]
      .find(e => pattern.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0);
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
    return false;
  }, regex).catch(() => false);
  if (clicked) log('Clicked ' + label + ' (JS)');
  return clicked;
}

// Click a visible element (used for submenus that appear after hover)
async function clickMenuItemVisible(page, regex, log, label) {
  for (let i = 0; i < 6; i++) {
    try {
      const loc = page.locator('a, li, button, span').filter({ hasText: regex }).first();
      if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
        await loc.click();
        log('Clicked ' + label);
        return true;
      }
    } catch {}
    await page.waitForTimeout(400);
  }
  return false;
}

// ─── fetchPrefillJson ─────────────────────────────────────────────────────────
// Login with PAN + password, intercept the prefill JSON the portal downloads
// when you start filing an ITR. Returns { prefill: { ... } }.
async function fetchPrefillJson({ pan, password, assessmentYear, formType, onStatus }) {
  const log = m => { console.log('[prefill]', m); onStatus?.(m); };
  const ay = assessmentYear || '2025-26';
  const form = formType || 'ITR-1';

  log('Launching browser for prefill fetch...');
  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    acceptDownloads: true,
  });
  await context.addInitScript(STEALTH);
  const page = await context.newPage();

  let capturedPrefill = null;

  // Intercept network responses to catch the prefill JSON
  context.on('response', async (response) => {
    const url = response.url();
    if (!/prefill|getReturn|itrJson|jsonDownload|preFilledData|retriveJson/i.test(url)) return;
    try {
      const ct = response.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const body = await response.json();
      if (body && typeof body === 'object' && Object.keys(body).length > 3) {
        capturedPrefill = body;
        log('Intercepted prefill JSON from: ' + url.split('?')[0]);
      }
    } catch {}
  });

  try {
    // ── LOGIN (same flow as fetchPortalData) ─────────────────────────────────
    log('Opening portal...');
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await page.waitForSelector('input', { timeout: 20000 }).catch(() => null);

    const hasPwd = await page.$('input[type="password"]').then(e => !!e).catch(() => false);
    if (!hasPwd) {
      log('Entering PAN...');
      const panEl = await waitFor(page, ['input[id="panAdhaarUserId"]', 'input[placeholder*="PAN"]', 'input[type="text"]']);
      if (!panEl) throw new Error('PAN field not found');
      await panEl.click({ clickCount: 3 });
      await panEl.fill(pan.toUpperCase());
      const contBtn = await waitFor(page, ['button:has-text("Continue")', 'button[type="submit"]']);
      if (contBtn) await contBtn.click(); else await panEl.press('Enter');
      log('Clicked Continue');
    }

    await page.waitForSelector('input[type="checkbox"], input[type="password"]', { timeout: 10000 }).catch(() => null);
    const chk = await page.$('input[type="checkbox"]').catch(() => null);
    if (chk && await chk.isVisible().catch(() => false) && !await chk.isChecked().catch(() => false)) {
      await chk.click(); log('SAM checkbox ticked');
    }

    log('Entering password...');
    const pwdEl = await waitFor(page, ['input[type="password"]'], 10000);
    if (!pwdEl) throw new Error('Password field not found');
    await pwdEl.click({ clickCount: 3 });
    await pwdEl.fill(password);
    const loginBtn = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Login")', 'button[type="submit"]']);
    if (loginBtn) await loginBtn.click(); else await pwdEl.press('Enter');
    log('Clicked login');

    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(800);
      const url = page.url();
      if (/dashboard|myaccount|home|landing|fileIncomeTaxReturn/i.test(url)) break;
      const notAuth = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')]
          .find(e => e.getBoundingClientRect().width > 0 && /request.*not.*authenticated/i.test(e.textContent) && e.children.length === 0);
        return el ? el.textContent.trim() : null;
      }).catch(() => null);
      if (!notAuth) break;
      log('Not authenticated — retrying (' + (i + 1) + ')...');
      const btn = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Login")', 'button[type="submit"]'], 2000);
      if (btn) await btn.click(); else await page.keyboard.press('Enter');
    }

    log('Waiting for dashboard...');
    await waitDashboard(page, log);
    // Let the dashboard fully settle before interacting
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(1000);
    log('Logged in! URL: ' + page.url());
    await page.screenshot({ path: path.join(SS_DIR, 'prefill-01-dashboard.png') }).catch(() => null);

    // ── Step 1: Reach the "File Income Tax Return" page ───────────────────────
    log('Navigating to File Income Tax Return...');

    // Path A: "File Now" button visible on dashboard (fastest — no menu needed)
    const fileNowBtn = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button, a')]
        .find(e => /^(file now|file return)$/i.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0);
      if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return btn.textContent.trim(); }
      return null;
    }).catch(() => null);

    if (fileNowBtn) {
      log('Clicked dashboard button: ' + fileNowBtn);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(1000);
    } else {
      // Path B: e-File menu → Income Tax Returns → File Income Tax Return
      log('No File Now button — using e-File menu...');

      // Find the e-File nav item by checking only immediate text nodes (not child subtrees)
      // This avoids matching a <li> whose textContent contains the entire sub-menu
      const eFileClicked = await page.evaluate(() => {
        const all = [...document.querySelectorAll('a, li, span, button')].filter(
          e => e.getBoundingClientRect().width > 0
        );
        const el = all.find(e => {
          // Check only this element's own text nodes (ignore children)
          const ownText = [...e.childNodes]
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent.trim())
            .join('').trim();
          return /^e-?file$/i.test(ownText);
        });
        if (el) {
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          el.click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (eFileClicked) {
        log('Clicked e-File menu');
        await page.waitForTimeout(600);
      } else {
        log('e-File element not found — taking screenshot');
        await page.screenshot({ path: path.join(SS_DIR, 'prefill-efile-missing.png') }).catch(() => null);
      }

      // Now click "Income Tax Returns" from the dropdown (must be visible)
      await clickMenuItemVisible(page, /^income tax returns$/i, log, 'Income Tax Returns');
      await page.waitForTimeout(500);

      // Then "File Income Tax Return" from the sub-menu
      await clickMenuItemVisible(page, /file income tax return/i, log, 'File Income Tax Return');
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(1000);
    }

    log('After nav, URL: ' + page.url());
    await page.screenshot({ path: path.join(SS_DIR, 'prefill-02-file-itr.png') }).catch(() => null);

    // ── Step 2: Select Assessment Year ───────────────────────────────────────
    log('Selecting AY: ' + ay);

    // Wait up to 8s for AY cards or dropdown to appear on screen
    await waitFor(page, [
      `button:has-text("${ay}")`,
      `div:has-text("${ay}")`,
      `label:has-text("${ay}")`,
      'select',
    ], 8000);

    const ayClicked = await page.evaluate((ayLabel) => {
      // Look for an element whose TEXT is exactly the AY label (short text, no subtrees)
      const el = [...document.querySelectorAll('button, label, div, span, td, li')]
        .filter(e => e.getBoundingClientRect().width > 0)
        .find(e => {
          const t = (e.textContent || '').trim();
          return t === ayLabel || t === 'AY ' + ayLabel || t.includes(ayLabel) && t.length < 35;
        });
      if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return 'clicked: ' + (el.textContent || '').trim().slice(0, 40); }

      // Try a <select> dropdown
      const sel = document.querySelector('select');
      if (sel) {
        const opt = [...sel.options].find(o => (o.text + o.value).includes(ayLabel));
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return 'dropdown: ' + opt.text; }
      }
      return null;
    }, ay).catch(() => null);

    if (ayClicked) log('AY selected: ' + ayClicked);
    else log('AY card/dropdown not found — may already be selected or page is still loading');

    await page.screenshot({ path: path.join(SS_DIR, 'prefill-03-ay-selected.png') }).catch(() => null);

    // Click Continue / Proceed button after AY selection
    const continueBtn = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Proceed")', 'button[type="submit"]'], 5000);
    if (continueBtn) { await continueBtn.click(); log('Clicked Continue after AY'); }
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null);

    // ── Step 3: Select ITR Form type ─────────────────────────────────────────
    log('Selecting form: ' + form);
    // Wait for form type options/radio buttons to appear
    await waitFor(page, [`input[value="${form}"]`, `label:has-text("${form}")`, `button:has-text("${form}")`], 6000);

    const formClicked = await page.evaluate((formLabel) => {
      // Try radio input first
      const radio = [...document.querySelectorAll('input[type="radio"]')]
        .find(e => (e.value || '').toUpperCase().includes(formLabel.replace('-','')) && e.getBoundingClientRect().width > 0);
      if (radio) { radio.click(); radio.dispatchEvent(new Event('change', { bubbles: true })); return 'radio: ' + radio.value; }

      // Try label/card with exactly the form name
      const label = [...document.querySelectorAll('label, button, div, span, li')]
        .filter(e => e.getBoundingClientRect().width > 0)
        .find(e => {
          const t = (e.textContent || '').trim();
          return t === formLabel || t.startsWith(formLabel) || new RegExp('^' + formLabel + '\\b', 'i').test(t);
        });
      if (label) { label.scrollIntoView({ block: 'center' }); label.click(); return 'label: ' + (label.textContent || '').trim().slice(0, 30); }
      return null;
    }, form).catch(() => null);
    if (formClicked) log('Form selected: ' + formClicked);
    else log('Form type not found — may be pre-selected');

    await page.screenshot({ path: path.join(SS_DIR, 'prefill-04-form-selected.png') }).catch(() => null);

    const cont2 = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Proceed")', 'button[type="submit"]'], 5000);
    if (cont2) { await cont2.click(); log('Clicked Continue (2)'); }
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null);

    // ── Step 4: Trigger "Prefill my return" ──────────────────────────────────
    log('Looking for Prefill option...');
    await page.waitForTimeout(1000);
    const prefillClicked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div, button, span, label, li, p')]
        .filter(e => e.getBoundingClientRect().width > 0)
        .find(e => /prefill|pre.?fill|pre-?fill/i.test(e.textContent ?? ''));
      if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return (el.textContent || '').trim().slice(0, 60); }
      return null;
    }).catch(() => null);
    if (prefillClicked) log('Clicked prefill: ' + prefillClicked);
    else log('Prefill option not found — may trigger automatically');

    const cont3 = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Proceed")', 'button:has-text("Let\'s Get Started")', 'button[type="submit"]'], 4000);
    if (cont3) { await cont3.click(); log('Clicked Continue (3)'); }

    // Wait for prefill JSON to be intercepted — check every 1s, up to 30s
    log('Waiting for prefill JSON to load (up to 30s)...');
    for (let i = 0; i < 30; i++) {
      if (capturedPrefill) break;
      await page.waitForTimeout(1000);
      // Click any "get started" prompts that might be blocking
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
          .find(b => /get started|continue|proceed|load/i.test(b.textContent ?? '') && b.getBoundingClientRect().width > 0);
        if (btn) btn.click();
      }).catch(() => null);
    }

    if (capturedPrefill) {
      log('✓ Prefill JSON captured (' + JSON.stringify(capturedPrefill).length + ' bytes)');
      return { prefill: capturedPrefill };
    } else {
      log('⚠ Prefill JSON not captured — returning null');
      return { prefill: null };
    }

  } catch (e) {
    await page.screenshot({ path: path.join(SS_DIR, 'prefill-error.png'), fullPage: true }).catch(() => null);
    log('Error: ' + e.message);
    throw e;
  } finally {
    await browser.close().catch(() => null);
  }
}

module.exports = { fetchPortalData, fetch26AS, fetchPrefillJson };
