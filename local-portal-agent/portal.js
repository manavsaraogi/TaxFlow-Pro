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

  // Auto-dismiss the IT Portal logout confirmation popup whenever it appears.
  page.addLocatorHandler(
    page.getByText('Are you sure you want to Logout?'),
    async () => {
      log('Auto-dismiss: Logout popup detected — clicking No...');
      await page.getByRole('button', { name: 'No' }).click().catch(async () => {
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')]
            .find(b => /^no$/i.test(b.textContent.trim()) && b.getBoundingClientRect().width > 0);
          if (btn) btn.click();
        });
      });
      await page.waitForTimeout(800);
    }
  ).catch(() => null);

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

    // Handle "Dual Login Detected" popup — click "Login Here" to force-login
    await page.waitForTimeout(1500);
    const dualLoginBtn = await waitFor(page, ['button:has-text("Login Here")', 'button:has-text("login here")'], 3000);
    if (dualLoginBtn) {
      log('Dual login popup detected — clicking Login Here...');
      await dualLoginBtn.click();
      await page.waitForTimeout(1500);
    }

    // Retry if "Request is not authenticated" appears
    for (let i = 0; i < 5; i++) {
      // Wait briefly then check
      await page.waitForTimeout(2000);
      const url = page.url();
      if (/dashboard|myaccount|home|landing|fileIncomeTaxReturn/i.test(url)) break;

      // Handle dual login popup that may appear mid-retry
      const dualBtn = await page.$('button:has-text("Login Here")').catch(() => null);
      if (dualBtn && await dualBtn.isVisible().catch(() => false)) {
        log('Dual login popup — clicking Login Here...');
        await dualBtn.click();
        await page.waitForTimeout(1500);
        continue;
      }

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

// Dismiss the IT Portal's "Are you sure you want to Logout?" confirmation dialog.
// This popup appears when the SPA detects a Back/Forward/Refresh-style navigation.
async function dismissLogoutPopup(page, log) {
  try {
    const noBtn = await page.$('button:has-text("No"), button:has-text("NO"), button:has-text("no")');
    if (noBtn && await noBtn.isVisible().catch(() => false)) {
      log('Logout confirmation popup detected — clicking No...');
      await noBtn.click();
      await page.waitForTimeout(1000);
      return true;
    }
  } catch {}
  return false;
}

// Navigate to a hash route within the IT Portal without triggering the logout popup.
// page.goto() causes a full navigation which the SPA treats as Back/Forward/Refresh.
// Using JS location.hash avoids that.
async function portalHashNav(page, hash, log) {
  log('Hash-navigating to ' + hash + '...');
  await page.evaluate((h) => {
    // The portal is a SPA — change hash without full reload
    if (window.location.hash !== h) window.location.hash = h;
  }, hash).catch(() => null);
  await page.waitForTimeout(2000);

  // If the popup appeared anyway (sometimes happens), dismiss it
  await dismissLogoutPopup(page, log);
  await page.waitForTimeout(1000);
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
// TRACES ZIP password = DOB in ddmmyyyy format (e.g. "06051999" for 6-May-1999)
// dob may arrive as "1999-05-06" (ISO) or "06051999" (ddmmyyyy) — normalise below.
function extract26ASFromZip(zipPath, pan, dob, log) {
  // DOB arrives as ddmmyyyy from portal-credentials API (e.g. "06051999")
  // Only convert if it looks like ISO yyyy-mm-dd or yyyymmdd
  let dobRaw = (dob || '').replace(/\D/g, '');
  if (dobRaw.length === 8 && /^(19|20)\d{2}/.test(dobRaw)) {
    // yyyymmdd → ddmmyyyy
    dobRaw = dobRaw.slice(6, 8) + dobRaw.slice(4, 6) + dobRaw.slice(0, 4);
  }
  log('ZIP password: ' + dobRaw);

  // Strategy 1: 7-Zip via 7zip-bin (handles AES-256 encrypted ZIPs)
  try {
    const sevenZip = require('7zip-bin').path7za;
    if (sevenZip && dobRaw) {
      const outDir = zipPath + '_extracted';
      fs.mkdirSync(outDir, { recursive: true });
      const result = require('child_process').spawnSync(sevenZip, [
        'e', zipPath, '-o' + outDir, '-p' + dobRaw, '-y',
      ], { encoding: 'utf8', timeout: 30000 });
      log('7z exit: ' + result.status + ' | ' + (result.stdout || '').slice(0, 200));
      const files = fs.readdirSync(outDir);
      log('Extracted files: ' + files.join(', '));
      for (const f of files) {
        if (/\.(txt|html|htm|csv)$/i.test(f)) {
          const text = fs.readFileSync(path.join(outDir, f), 'utf8');
          if (text.length > 100) {
            log('✓ 26AS extracted via 7z (' + text.length + ' chars) — ' + f);
            return text;
          }
        }
      }
    }
  } catch (e) { log('7z extraction error: ' + e.message); }

  // Strategy 2: adm-zip with Buffer password (ZipCrypto)
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    log('ZIP entries: ' + entries.map(e => e.entryName).join(', '));
    for (const entry of entries) {
      if (/\.(txt|html|htm|csv)$/i.test(entry.entryName)) {
        for (const pwd of [dobRaw ? Buffer.from(dobRaw) : null, null]) {
          try {
            const data = pwd ? zip.readFile(entry, pwd) : zip.readFile(entry);
            if (data && data.length > 100) {
              const text = data.toString('utf8');
              log('✓ 26AS via adm-zip (' + text.length + ' chars)');
              return text;
            }
          } catch { /* try next */ }
        }
      }
    }
    log('adm-zip: no readable entry found');
  } catch (e) { log('adm-zip error: ' + e.message); }

  return null;
}

async function fetch26AS({ pan, password, dob, assessmentYear, onStatus }) {
  const log = m => { console.log('[26as]', m); onStatus?.(m); };

  // Always compute AY from current date — April onwards = new AY
  const now = new Date();
  const ayStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const ay = `${ayStart}-${String(ayStart + 1).slice(-2)}`;

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

  // NOTE: We do NOT use addLocatorHandler here for the logout popup.
  // It fires too eagerly and clicks "No" BEFORE the TRACES tab can open, cancelling navigation.
  // Instead we dismiss the popup manually at points where we know it's safe to do so.

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

    // Handle "Dual Login Detected" popup — click "Login Here" to force-login
    await page.waitForTimeout(1500);
    const dualLoginBtn26 = await waitFor(page, ['button:has-text("Login Here")', 'button:has-text("login here")'], 3000);
    if (dualLoginBtn26) {
      log('Dual login popup detected — clicking Login Here...');
      await dualLoginBtn26.click();
      await page.waitForTimeout(1500);
    }

    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(2000);
      const url = page.url();
      if (/dashboard|myaccount|home|landing|fileIncomeTaxReturn/i.test(url)) break;

      // Handle dual login popup mid-retry
      const dualBtn = await page.$('button:has-text("Login Here")').catch(() => null);
      if (dualBtn && await dualBtn.isVisible().catch(() => false)) {
        log('Dual login popup — clicking Login Here...');
        await dualBtn.click();
        await page.waitForTimeout(1500);
        continue;
      }

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

    // ── STEP 2: Navigate to View Form 26AS via menu ──────────────────────────
    log('Navigating to View Form 26AS...');
    await page.waitForTimeout(1500);

    // Step 2a: Open e-File side panel
    await clickMenuItem(page, /^e-file$/i, log, 'e-File menu');
    // Wait for the e-File submenu items to render in the DOM
    await page.waitForSelector('text=/income tax returns/i', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(500);

    // Step 2b: Hover "Income Tax Returns" to reveal submenu, then click "View Form 26AS".
    // Playwright locators move the mouse naturally — no evaluate() calls between hover and click.
    var tracesTabPromise = context.waitForEvent('page', { timeout: 60000 }).catch(() => null);
    try {
      const itrLocator = page.locator('text=/^Income Tax Returns$/i').first();
      await itrLocator.hover({ timeout: 8000 });
      log('Hovered Income Tax Returns');
      await page.waitForTimeout(600);

      const view26Locator = page.locator('text=/^View Form 26AS$/i').first();
      await view26Locator.click({ timeout: 5000 });
      log('Clicked View Form 26AS via locator');
    } catch (e) {
      log('Locator approach failed: ' + e.message);
      // Fallback: log visible items for debugging
      const texts = await page.evaluate(() => {
        const out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let n; while ((n = w.nextNode())) { const t = n.textContent.trim(); if (t.length > 3 && t.length < 60) out.push(t); }
        return [...new Set(out)].slice(0, 60);
      }).catch(() => []);
      log('DOM text nodes: ' + texts.join(' | '));
      await page.screenshot({ path: path.join(SS_DIR, '26as-02b-no-view26as.png'), fullPage: true }).catch(() => null);
    }

    // Wait for TRACES tab BEFORE dismissing any popup — dismissing "No" cancels the navigation
    log('Waiting up to 10s for TRACES tab to open...');
    let tracesPage = await Promise.race([
      tracesTabPromise,
      new Promise(r => setTimeout(r, 10000, null)),
    ]);

    // NOW it's safe to dismiss the logout popup (TRACES tab already open or will be found below)
    await dismissLogoutPopup(page, log);

    await page.screenshot({ path: path.join(SS_DIR, '26as-02-after-menu-nav.png') }).catch(() => null);
    log('After click, main page URL: ' + page.url());
    log('TRACES tab captured: ' + (tracesPage ? tracesPage.url() : 'none yet'));

    // Step 2d: If we landed on an IT Portal intermediate page with a "Proceed to TRACES" button, click it
    if (!/traces\.gov\.in|tdscpc\.gov\.in/i.test(page.url())) {
      log('Checking for SSO proceed / View Form 26AS button...');
      await page.screenshot({ path: path.join(SS_DIR, '26as-02b-sso-page.png') }).catch(() => null);
      const ssoClicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')]
          .find(e => /proceed|view.*form.*26as|form.*26as|annual tax statement|go to traces/i.test(
            (e.textContent || e.value || '').trim()
          ) && e.getBoundingClientRect().width > 0);
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return (e => e.textContent?.trim() || e.value)(el); }
        return null;
      }).catch(() => null);
      if (ssoClicked) {
        log('Clicked: ' + ssoClicked + ' — waiting for TRACES...');
        await page.waitForTimeout(1000);
        await dismissLogoutPopup(page, log);
        await page.waitForTimeout(4000);
      }
    }

    await page.screenshot({ path: path.join(SS_DIR, '26as-03-after-nav.png') }).catch(() => null);
    log('After SSO check, URL: ' + page.url());

    // ── STEP 3: Locate the TRACES tab ───────────────────────────────────────
    log('Checking for TRACES portal...');
    // tracesPage may already be captured from Step 2d above
    if (!tracesPage || !/traces\.gov\.in|tdscpc\.gov\.in/i.test(tracesPage.url())) {
      if (/traces\.gov\.in|tdscpc\.gov\.in/i.test(page.url())) {
        tracesPage = page;
        log('Current page redirected to TRACES');
      } else {
        tracesPage = context.pages().find(p => /traces\.gov\.in|tdscpc\.gov\.in/i.test(p.url())) ?? null;
        if (tracesPage) log('Found TRACES in existing tabs: ' + tracesPage.url());
      }
    }

    if (!tracesPage) {
      // Last resort: retry the whole navigation sequence
      log('TRACES not opened — retrying menu navigation...');
      const retryTabPromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);

      await dismissLogoutPopup(page, log); // clear any popup first
      await clickMenuItem(page, /^e-file$/i, log, 'e-File (retry)');
      await page.waitForTimeout(1200);

      // Hover ITR via TreeWalker coords
      const retryItrCoords = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
          if (/^income tax returns$/i.test(node.textContent.trim())) {
            const el = node.parentElement;
            if (el) { const r = el.getBoundingClientRect(); if (r.width > 0) return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; }
          }
        }
        return null;
      }).catch(() => null);
      if (retryItrCoords) {
        await page.mouse.move(retryItrCoords.x, retryItrCoords.y, { steps: 10 });
        await page.waitForTimeout(1200);
      }

      // Click View Form 26AS with real mouse
      const retryCoords = await page.evaluate(() => {
        const el = [...document.querySelectorAll('a,li,span,button')]
          .find(e => { const t = e.textContent.trim(); return /view.*26as|form.*26as/i.test(t) && t.length < 80 && e.getBoundingClientRect().width > 0; });
        if (el) { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; }
        return null;
      }).catch(() => null);
      if (retryCoords) await page.mouse.click(retryCoords.x, retryCoords.y);

      tracesPage = await Promise.race([retryTabPromise, new Promise(r => setTimeout(r, 8000, null))]);
      await dismissLogoutPopup(page, log);
      if (!tracesPage) tracesPage = context.pages().find(p => /traces\.gov\.in|tdscpc\.gov\.in/i.test(p.url())) ?? null;
      if (!tracesPage && /traces\.gov\.in|tdscpc\.gov\.in/i.test(page.url())) tracesPage = page;
    }

    if (!tracesPage) {
      await page.screenshot({ path: path.join(SS_DIR, '26as-no-traces.png') }).catch(() => null);
      throw new Error('TRACES portal did not open. Please check that the browser navigated to e-File → Income Tax Returns → View Form 26AS and try again.');
    }

    await tracesPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => null);
    await tracesPage.bringToFront().catch(() => null);
    log('TRACES portal opened: ' + tracesPage.url());

    // TRACES loads slowly over SSO — wait for any visible content
    await tracesPage.waitForTimeout(2000);
    for (let i = 0; i < 10; i++) {
      const hasContent = await tracesPage.evaluate(() =>
        document.body && document.body.innerText.trim().length > 50
      ).catch(() => false);
      if (hasContent) break;
      await tracesPage.waitForTimeout(1000);
    }
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-05-traces.png') }).catch(() => null);
    log('TRACES page text (first 200): ' + (await tracesPage.evaluate(() => document.body?.innerText?.slice(0, 200)).catch(() => '')));

    // ── STEP 3b: If on TRACES auth dashboard, click Compliance tab then 26AS card ──
    if (/authBridge\/dashboard/i.test(tracesPage.url())) {
      log('TRACES auth dashboard detected — URL: ' + tracesPage.url());

      // Wait up to 15s for the page to render, then log all visible links/tabs
      await tracesPage.waitForTimeout(3000);
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-05b-auth-dashboard.png') }).catch(() => null);
      const dashTexts = await tracesPage.evaluate(() =>
        [...document.querySelectorAll('a, li, button, span, div')]
          .filter(e => e.getBoundingClientRect().width > 0 && e.children.length === 0)
          .map(e => e.textContent?.trim()).filter(t => t && t.length > 2 && t.length < 80)
          .filter((v, i, a) => a.indexOf(v) === i).slice(0, 30)
      ).catch(() => []);
      log('Dashboard elements: ' + dashTexts.join(' | '));

      // Click "Compliance under Income-tax Act, 1961" tab — try multiple strategies
      let compTabClicked = false;
      // Strategy 1: exact text match via evaluate
      compTabClicked = await tracesPage.evaluate(() => {
        const all = [...document.querySelectorAll('a, li, button, span, td, div')];
        const el = all.find(e => /compliance\s+under\s+income/i.test(e.textContent?.trim()) &&
          e.getBoundingClientRect().width > 0 && e.children.length < 3);
        if (el) { el.click(); return true; }
        return false;
      }).catch(() => false);
      log('Compliance tab click (strategy 1): ' + compTabClicked);

      if (!compTabClicked) {
        // Strategy 2: Playwright locator with partial text
        try {
          await tracesPage.locator(':text("Compliance under")').first().click({ timeout: 5000 });
          compTabClicked = true;
          log('Compliance tab click (strategy 2): true');
        } catch (e2) { log('Strategy 2 failed: ' + e2.message); }
      }

      await tracesPage.waitForTimeout(2500);
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-05c-after-compliance.png') }).catch(() => null);
      log('After Compliance tab, URL: ' + tracesPage.url());

      // Click 26AS card
      const cardTexts = await tracesPage.evaluate(() =>
        [...document.querySelectorAll('a, div, li')]
          .filter(e => e.getBoundingClientRect().width > 0)
          .map(e => e.textContent?.trim()).filter(t => t && t.length > 2 && t.length < 100)
          .filter((v, i, a) => a.indexOf(v) === i).slice(0, 20)
      ).catch(() => []);
      log('Cards on page: ' + cardTexts.join(' | '));

      let card26Clicked = await tracesPage.evaluate(() => {
        // Find anchor with href pointing to 26AS — most reliable
        const byHref = [...document.querySelectorAll('a')]
          .find(a => /welcome26AS|26as/i.test(a.getAttribute('href') || a.getAttribute('ng-href') || ''));
        if (byHref) { byHref.click(); return 'href:' + (byHref.getAttribute('href') || byHref.getAttribute('ng-href')); }
        // Fallback: find the card containing "26AS" text but not "15CA" or "Bulk"
        const all = [...document.querySelectorAll('a, button, div[onclick], div[ng-click]')];
        const el = all.find(e => {
          const t = e.textContent?.trim() ?? '';
          return /26\s*AS/i.test(t) && !/15\s*CA|bulk|filed\s+forms/i.test(t) &&
            e.getBoundingClientRect().width > 0 && t.length < 100;
        });
        if (el) { el.click(); return 'text:' + el.textContent?.trim().slice(0, 60); }
        return null;
      }).catch(() => null);
      log('26AS card click: ' + (card26Clicked || 'not found'));

      await tracesPage.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);
      await tracesPage.waitForTimeout(2000);
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-05d-after-card.png') }).catch(() => null);
      log('After 26AS card, URL: ' + tracesPage.url());
    }

    // ── STEP 4: "I agree" checkbox ──────────────────────────────────────────
    log('Looking for "I agree" checkbox...');
    for (let attempt = 0; attempt < 6; attempt++) {
      const result = await tracesPage.evaluate(() => {
        // Strategy 1: checkbox inside/near a label with "agree" text
        const allChk = [...document.querySelectorAll('input[type="checkbox"]')];
        for (const chk of allChk) {
          const label = chk.closest('label') ||
            chk.parentElement ||
            document.querySelector(`label[for="${chk.id}"]`);
          const txt = label?.textContent || chk.nextSibling?.textContent || chk.parentElement?.textContent || '';
          if (/agree|accept|usage/i.test(txt)) {
            if (!chk.checked) { chk.click(); return 'clicked-labeled'; }
            return 'already-checked';
          }
        }
        // Strategy 2: any unchecked checkbox on the page (TRACES only has one)
        const anyChk = document.querySelector('input[type="checkbox"]:not(:checked)');
        if (anyChk) { anyChk.click(); return 'clicked-any'; }
        // Already checked
        if (document.querySelector('input[type="checkbox"]:checked')) return 'already-checked';
        return null;
      }).catch(() => null);

      if (result) { log('I agree checkbox: ' + result); break; }
      await tracesPage.waitForTimeout(1500);
      await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-06-agree-attempt' + attempt + '.png') }).catch(() => null);
    }

    await tracesPage.waitForTimeout(500);
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-07-after-agree.png') }).catch(() => null);

    // ── STEP 5: Click "Proceed" button ──────────────────────────────────────
    log('Clicking Proceed...');
    for (let attempt = 0; attempt < 4; attempt++) {
      const clicked = await tracesPage.evaluate(() => {
        const el = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a')]
          .find(e => {
            const t = (e.value || e.textContent || '').trim();
            return /^proceed$/i.test(t) && e.getBoundingClientRect().width > 0;
          });
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return (el.value || el.textContent).trim(); }
        // Fallback: any submit button
        const sub = [...document.querySelectorAll('input[type="submit"], button[type="submit"]')]
          .find(e => e.getBoundingClientRect().width > 0);
        if (sub) { sub.click(); return 'submit-fallback: ' + (sub.value || sub.textContent).trim(); }
        return null;
      }).catch(() => null);
      if (clicked) { log('Proceed clicked: ' + clicked); break; }
      await tracesPage.waitForTimeout(1500);
    }

    await tracesPage.waitForTimeout(3000);
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-08-after-proceed.png') }).catch(() => null);
    log('After Proceed, URL: ' + tracesPage.url());

    // ── STEP 6: Click "View Tax Credit (Form 26AS/Annual Tax Statement)" link ──
    log('Looking for "View Tax Credit" link...');
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-09-before-view-credit.png') }).catch(() => null);
    log('Page text before Step 6: ' + (await tracesPage.evaluate(() => document.body?.innerText?.slice(0, 400)).catch(() => '')));

    let step6Done = false;
    // Strategy 1: Playwright locator on <a> with exact text — most reliable
    try {
      const vtcLocator = tracesPage.locator('a:has-text("View Tax Credit")').first();
      await vtcLocator.waitFor({ state: 'visible', timeout: 8000 });
      await vtcLocator.click();
      log('Clicked View Tax Credit via locator');
      step6Done = true;
    } catch (e) { log('Step 6 locator failed: ' + e.message); }

    if (!step6Done) {
      // Strategy 2: evaluate — find <a> whose text contains "View Tax Credit" or href contains view26AS
      for (let attempt = 0; attempt < 4; attempt++) {
        const clicked = await tracesPage.evaluate(() => {
          const anchors = [...document.querySelectorAll('a')];
          const el = anchors.find(a =>
            /view\s*tax\s*credit/i.test(a.textContent?.trim() ?? '') ||
            /view26AS|viewTaxCredit/i.test(a.getAttribute('href') ?? '')
          );
          if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return el.textContent?.trim().slice(0, 80); }
          return null;
        }).catch(() => null);
        if (clicked) { log('Clicked View Tax Credit (evaluate): ' + clicked); step6Done = true; break; }
        await tracesPage.waitForTimeout(2000);
        log('Step 6 attempt ' + (attempt + 1) + ' — page text: ' + (await tracesPage.evaluate(() => document.body?.innerText?.slice(0, 200)).catch(() => '')));
      }
    }

    await tracesPage.waitForTimeout(2500);
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-10-after-view-credit.png') }).catch(() => null);
    log('After View Tax Credit, URL: ' + tracesPage.url());

    // ── STEP 7: Select Assessment Year ──────────────────────────────────────
    log('Selecting Assessment Year: ' + ay);
    await tracesPage.waitForTimeout(1500);
    await tracesPage.waitForSelector('select', { timeout: 10000 }).catch(() => null);

    // Log every select and its options so we know exactly what's on the page
    const allSelects = await tracesPage.evaluate(() =>
      [...document.querySelectorAll('select')].map(s => ({
        id: s.id, name: s.name,
        opts: [...s.options].map(o => o.text.trim() + '=' + o.value),
      }))
    ).catch(() => []);
    log('Selects: ' + JSON.stringify(allSelects));

    // From logs: select IDs are #AssessmentYearDropDown and #viewType
    // AY label "2026-27" has value "2026" (start year), View As "Text" has value "Text"
    const [start] = ay.split('-');
    const ayValue = start; // e.g. "2026" for AY 2026-27

    // Select Assessment Year by ID
    let ayDone = false;
    for (const sel of ['#AssessmentYearDropDown', 'select[name="AssessmentYearDropDown"]']) {
      try {
        await tracesPage.locator(sel).selectOption({ value: ayValue });
        log('AY selected: ' + ayValue); ayDone = true; break;
      } catch {}
      try {
        await tracesPage.locator(sel).selectOption({ label: new RegExp(ay.replace('-', '[-–]')) });
        log('AY selected by label: ' + ay); ayDone = true; break;
      } catch {}
    }
    if (!ayDone) log('WARNING: AY not selected');
    await tracesPage.waitForTimeout(300);

    // ── STEP 8: Select "View As" = Text ─────────────────────────────────────
    log('Selecting View As = Text...');
    let viewAsDone = false;
    for (const sel of ['#viewType', 'select[name="viewType"]']) {
      try {
        await tracesPage.locator(sel).selectOption({ value: 'Text' });
        log('View As: Text'); viewAsDone = true; break;
      } catch {}
      try {
        await tracesPage.locator(sel).selectOption({ label: /text/i });
        log('View As: text by label'); viewAsDone = true; break;
      } catch {}
    }
    if (!viewAsDone) log('WARNING: View As not selected');
    await tracesPage.screenshot({ path: path.join(SS_DIR, '26as-12-view-as.png') }).catch(() => null);

    // ── STEP 9: Click "View / Download" ─────────────────────────────────────
    log('Clicking View/Download...');
    const dlPromise = tracesPage.waitForEvent('download', { timeout: 120000 }).catch(() => null);
    await tracesPage.waitForTimeout(500);

    // The button is <input type="submit" value="View / Download"> on this JSF page
    let viewDlClicked = false;
    const btnSelectors = [
      'input[type="submit"][value="View / Download"]',
      'input[type="submit"][value*="View"]',
      'input[type="button"][value*="View"]',
      'button:has-text("View")',
    ];
    for (const sel of btnSelectors) {
      try {
        await tracesPage.locator(sel).first().click({ timeout: 4000 });
        log('View/Download clicked: ' + sel);
        viewDlClicked = true;
        break;
      } catch {}
    }
    if (!viewDlClicked) {
      // Last resort: click first visible submit button
      await tracesPage.evaluate(() => {
        const btn = [...document.querySelectorAll('input[type="submit"], button[type="submit"]')]
          .find(e => e.getBoundingClientRect().width > 0);
        if (btn) btn.click();
      }).catch(() => null);
      log('View/Download: fallback submit click');
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
        log('Extracting ZIP with DOB password (ddmmyyyy)');
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
// Login, navigate e-File → Income Tax Returns → File Income Tax Return,
// select AY, choose Online + Prefill mode, intercept the prefill JSON.
// Returns { prefill: { ... } }.
async function fetchPrefillJson({ pan, password, assessmentYear, formType, onStatus }) {
  // NOTE: index.js already does console.log('[prefill]', msg) via the onStatus handler.
  // Do NOT add another console.log here — it causes every message to print twice.
  const log = m => { onStatus?.(m); };

  // Compute current applicable AY from system date if not provided
  function currentAY() {
    const now = new Date();
    const yr = now.getFullYear();
    const mo = now.getMonth() + 1;
    const start = mo >= 4 ? yr : yr - 1;
    return `${start}-${String(start + 1).slice(-2)}`;
  }

  const ay   = assessmentYear || currentAY();   // e.g. "2026-27"
  const form = formType || 'ITR-1';
  // AY start year (e.g. 2026 for "2026-27") — used to match ?ay=YYYY in URL
  const ayYear = parseInt(ay.split('-')[0]) || new Date().getFullYear();

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
        log('✓ Prefill JSON intercepted from: ' + url.split('?')[0].slice(-60));
      }
    } catch {}
  });

  try {
    // ── LOGIN ────────────────────────────────────────────────────────────────
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

    // Poll for up to 60s after clicking login — handle dual login dialog and
    // not-authenticated retries before confirming dashboard is reached.
    log('Waiting for login to complete...');
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1500);
      const url = page.url();

      // Success: on dashboard and not on login page
      if (/dashboard|myaccount|home|landing/i.test(url) && !/login|password/i.test(url)) {
        log('Dashboard reached: ' + url);
        break;
      }

      // "Dual Login Detected!" — click "Login Here" via JS evaluate (most reliable)
      const dualHandled = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
          .find(b => /login\s*here/i.test((b.textContent || '').trim()));
        if (btn) { btn.click(); return true; }
        return false;
      }).catch(() => false);
      if (dualHandled) { log('Dual login dialog — clicked Login Here'); continue; }

      // "Request not authenticated" — re-submit the login form
      const notAuth = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')]
          .find(e => e.getBoundingClientRect().width > 0 &&
                     /request.*not.*authenticated/i.test(e.textContent) &&
                     e.children.length === 0);
        return el ? el.textContent.trim() : null;
      }).catch(() => null);
      if (notAuth) {
        log('Not authenticated — retrying (' + i + ')...');
        const btn = await waitFor(page, ['button:has-text("Continue")', 'button:has-text("Login")', 'button[type="submit"]'], 2000);
        if (btn) await btn.click(); else await page.keyboard.press('Enter');
      }
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    log('Logged in! URL: ' + page.url());
    await page.screenshot({ path: path.join(SS_DIR, 'prefill-01-dashboard.png') }).catch(() => null);

    // ── Step 1: Navigate to Download Prefilled Data page ──────────────────────
    // Direct URL navigation is the most reliable approach — avoids multi-level
    // hover menus that are fragile. Angular routing handles it since we're logged in.
    log('Navigating to Download Prefilled Data page...');

    const PREFILL_URL = 'https://eportal.incometax.gov.in/iec/foservices/#/dashboard/downloadPreFilledData';
    await page.goto(PREFILL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    // The portal shows a "Back/Forward/Refresh disabled — Logout?" security dialog
    // on direct navigation. Wait for it and click "No" using Playwright locator.
    log('Waiting for logout dialog...');
    try {
      // Wait up to 4s for the "No" button to appear in the dialog
      const noBtn = page.getByRole('button', { name: 'No' });
      await noBtn.waitFor({ state: 'visible', timeout: 4000 });
      await noBtn.click();
      log('Clicked No — dismissed logout dialog');
      await page.waitForTimeout(1000);
    } catch {
      // Dialog may not appear on every run — that's fine
      log('No logout dialog detected — proceeding');
    }
    await page.waitForTimeout(500);

    log('After nav, URL: ' + page.url());
    await page.screenshot({ path: path.join(SS_DIR, 'prefill-02-file-itr.png') }).catch(() => null);

    // If direct URL didn't land on the right page (portal may redirect logged-out users),
    // fall back to menu navigation
    if (!/downloadPreFilledData/i.test(page.url())) {
      log('Direct URL redirected — trying menu navigation...');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // Click e-File nav item (exact text match in the blue nav bar only)
      log('Clicking e-File...');
      const eFileEl = await page.evaluate(() => {
        // Only look in the nav/header, avoid other page areas
        const nav = document.querySelector('nav, header, [role="navigation"], .navbar, .nav-menu');
        const scope = nav || document;
        const el = [...scope.querySelectorAll('a, button, li, span')]
          .find(e => {
            const t = (e.textContent || '').trim();
            return /^e-?file$/i.test(t) && e.getBoundingClientRect().width > 0;
          });
        if (el) { el.click(); return (el.textContent || '').trim(); }
        return null;
      });
      log(eFileEl ? 'Clicked e-File: ' + eFileEl : '⚠ e-File not found in nav');
      await page.waitForTimeout(700);

      // Hover Income Tax Returns to open its sub-menu
      try {
        const itrEl = page.getByText('Income Tax Returns', { exact: true }).first();
        await itrEl.waitFor({ state: 'visible', timeout: 5000 });
        const box = await itrEl.boundingBox();
        if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        log('Hovered Income Tax Returns');
        await page.waitForTimeout(700);
      } catch (e) { log('Income Tax Returns hover: ' + e.message.split('\n')[0]); }

      // Click Download Pre-Filled Data
      try {
        const dlEl = page.getByText('Download Pre-Filled Data', { exact: true }).first();
        await dlEl.waitFor({ state: 'visible', timeout: 4000 });
        await dlEl.click();
        log('Clicked Download Pre-Filled Data');
      } catch {
        await page.evaluate(() => {
          const el = [...document.querySelectorAll('a, li, span, div')]
            .find(e => /download.*pre.?filled?\s*data/i.test((e.textContent || '').trim()));
          if (el) el.click();
        });
        log('Download Pre-Filled Data clicked (JS fallback)');
      }

      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      await page.waitForTimeout(2000);
      log('After menu nav, URL: ' + page.url());
      await page.screenshot({ path: path.join(SS_DIR, 'prefill-02-file-itr.png') }).catch(() => null);
    }

    // ── Step 2: Select Assessment Year ─────────────────────────────────────────
    // AY is auto-computed from today's date — no manual input needed.
    log('Selecting AY: ' + ay + ' (auto from current date)');

    // Wait for the dropdown to appear
    await page.waitForSelector('select, mat-select', { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SS_DIR, 'prefill-03-ay-selected.png') }).catch(() => null);

    let aySelected = false;

    // Find the AY dropdown by position — it must be in the main content area (y > 250px),
    // NOT in the header where the language selector (English/Hindi mat-select) lives.
    const ayDropdown = await page.evaluate(() => {
      // Look for select or mat-select elements below y=250 (i.e., in the page body, not header)
      const els = [...document.querySelectorAll('select, mat-select, ng-select')]
        .filter(e => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top > 250;
        });
      if (els.length === 0) return null;
      return els[0].tagName.toLowerCase();
    });
    log('AY dropdown element: ' + (ayDropdown || 'not found'));

    if (ayDropdown === 'select') {
      // Native select — Playwright selectOption is most reliable
      const opts = await page.evaluate(() => {
        const all = [...document.querySelectorAll('select')]
          .filter(s => s.getBoundingClientRect().top > 250);
        const s = all[0];
        return s ? [...s.options].map(o => o.text.trim() + '=' + o.value) : [];
      });
      log('AY options: ' + opts.join(' | '));

      try {
        // Target the select that's in the page body (not header)
        const sel = page.locator('select').filter(async el => {
          const box = await el.boundingBox();
          return box ? box.y > 250 : false;
        }).first();
        try { await sel.selectOption({ label: ay }); }
        catch { await sel.selectOption({ value: ay }); }
        log('AY selected: ' + ay);
        aySelected = true;
      } catch {
        const picked = await page.evaluate((yr) => {
          const s = [...document.querySelectorAll('select')].find(el => el.getBoundingClientRect().top > 250);
          const o = [...(s?.options || [])].find(op => op.text.includes(String(yr)) || op.value.includes(String(yr)));
          if (o && s) {
            s.value = o.value;
            ['input', 'change'].forEach(ev => s.dispatchEvent(new Event(ev, { bubbles: true })));
            return o.text.trim();
          }
          return null;
        }, ayYear);
        if (picked) { log('AY selected (JS): ' + picked); aySelected = true; }
      }
    } else if (ayDropdown === 'mat-select') {
      // Angular Material — click to open panel, then click the correct mat-option
      try {
        // Click only the mat-select in the content area (y > 250)
        await page.evaluate(() => {
          const el = [...document.querySelectorAll('mat-select')]
            .find(e => e.getBoundingClientRect().top > 250);
          if (el) el.click();
        });
        await page.waitForTimeout(700);
        // Click the mat-option that contains the AY year
        await page.locator('mat-option').filter({ hasText: String(ayYear) }).first().click({ timeout: 4000 });
        log('AY selected via mat-option: ' + ayYear);
        aySelected = true;
      } catch (e) { log('mat-select error: ' + e.message.split('\n')[0]); }
    }

    if (!aySelected) log('⚠ AY not selected — check prefill-03-ay-selected.png');
    await page.waitForTimeout(800);

    // ── Step 3: Click the Download button ──────────────────────────────────────
    log('Clicking Download...');
    // Wait for the button to become enabled (it's greyed out before AY is chosen)
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => /download/i.test(b.textContent || ''));
      return btn && !btn.disabled && btn.getBoundingClientRect().width > 0;
    }, { timeout: 8000 }).catch(() => null);

    try {
      await page.getByRole('button', { name: /download/i }).first().click({ timeout: 5000 });
      log('Clicked Download button');
    } catch {
      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button, a')]
          .find(e => /download/i.test((e.textContent || '').trim()) && !e.disabled && e.getBoundingClientRect().width > 0);
        if (btn) { btn.click(); return (btn.textContent || '').trim(); }
        return null;
      });
      log(clicked ? 'Download clicked (JS): ' + clicked : '⚠ Download button not clickable');
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(2000);

    // ── Step 4: Wait for prefill JSON to be intercepted ───────────────────────
    log('Waiting for prefill data (up to 45s)...');
    await page.screenshot({ path: path.join(SS_DIR, 'prefill-04-form-selected.png') }).catch(() => null);

    for (let i = 0; i < 45; i++) {
      if (capturedPrefill) break;
      await page.waitForTimeout(1000);
      // Dismiss any blocking "get started" / "let's proceed" prompts
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
          .filter(e => e.getBoundingClientRect().width > 0 && !e.disabled)
          .find(b => /get started|let'?s go|continue|proceed/i.test(b.textContent ?? ''));
        if (btn) btn.click();
      }).catch(() => null);
    }

    await page.screenshot({ path: path.join(SS_DIR, 'prefill-05-done.png') }).catch(() => null);

    if (capturedPrefill) {
      log('✓ Prefill JSON captured (' + JSON.stringify(capturedPrefill).length + ' bytes)');
      return { prefill: capturedPrefill };
    } else {
      log('⚠ Prefill JSON not captured — check screenshots in local-portal-agent/screenshots/');
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
