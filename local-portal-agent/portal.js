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
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
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
    if (i === 30) log('Still waiting... check browser for captcha or OTP.');
  }
  throw new Error('Login timed out after 90 seconds.');
}

module.exports = { fetchPortalData };
