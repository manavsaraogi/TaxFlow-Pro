'use strict';

const express = require('express');
const cors = require('cors');
const { fetchPortalData } = require('./portal');

const app = express();
const PORT = 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

let currentJob = null;

function isJobBlocking() {
  if (!currentJob) return false;
  // Only block if actively running and less than 10 minutes old
  if (currentJob.status !== 'running') return false;
  const age = Date.now() - (currentJob._startedAt || 0);
  return age < 10 * 60 * 1000;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '1.1.0', busy: isJobBlocking(), status: currentJob?.status ?? 'idle' });
});

app.post('/reset', (_req, res) => {
  currentJob = null;
  res.json({ ok: true });
});

app.post('/fetch-portal-data', async (req, res) => {
  const { pan, password, dob, assessmentYear, force } = req.body ?? {};

  if (!pan || !password) {
    return res.status(400).json({ error: 'pan and password are required' });
  }

  // Block only if a job is actively running AND not forced
  if (isJobBlocking() && !force) {
    return res.status(429).json({ error: 'A fetch is already in progress. Please wait.' });
  }

  // Clear any previous job (done/error/stale)
  currentJob = null;

  currentJob = { status: 'running', log: [], result: null, error: null, _startedAt: Date.now() };
  const jobRef = currentJob;

  fetchPortalData({
    pan,
    password,
    dob: dob || null,
    assessmentYear: assessmentYear || '2025-26',
    onStatus: (msg) => {
      console.log('[portal]', msg);
      jobRef.log.push(msg);
    },
  }).then((data) => {
    jobRef.status = 'done';
    jobRef.result = data;
    // Keep result for 2 min then clear
    setTimeout(() => { if (currentJob === jobRef) currentJob = null; }, 120000);
  }).catch((err) => {
    jobRef.status = 'error';
    jobRef.error = err.message;
    // Clear error immediately after 5s so next click works right away
    setTimeout(() => { if (currentJob === jobRef) currentJob = null; }, 5000);
  });

  res.json({ started: true, message: 'Browser opened. Check the browser window for any prompts.' });
});

app.get('/status', (_req, res) => {
  if (!currentJob) return res.json({ status: 'idle' });
  res.json({
    status: currentJob.status,
    log: currentJob.log,
    result: currentJob.status === 'done' ? currentJob.result : null,
    error: currentJob.error,
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nTaxFlow Portal Agent running on http://localhost:${PORT}`);
  console.log('Keep this window open while using TaxFlow Pro.');
  console.log('Press Ctrl+C to stop.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nERROR: Port ${PORT} is already in use. Killing old process...`);
    process.exit(1);
  } else {
    console.error('\nERROR starting server:', err.message);
    process.exit(1);
  }
});
