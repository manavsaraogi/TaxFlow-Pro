'use strict';

const express = require('express');
const cors = require('cors');
const { fetchPortalData, fetch26AS } = require('./portal');

const app = express();
const PORT = 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

let currentJob = null;
let current26ASJob = null;

function isJobBlocking(job) {
  if (!job) return false;
  if (job.status !== 'running') return false;
  const age = Date.now() - (job._startedAt || 0);
  return age < 10 * 60 * 1000;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '1.2.0', busy: isJobBlocking(currentJob), status: currentJob?.status ?? 'idle' });
});

app.post('/reset', (_req, res) => {
  currentJob = null;
  current26ASJob = null;
  res.json({ ok: true });
});

app.post('/fetch-portal-data', async (req, res) => {
  const { pan, password, dob, assessmentYear, force } = req.body ?? {};

  if (!pan || !password) {
    return res.status(400).json({ error: 'pan and password are required' });
  }

  if (isJobBlocking(currentJob) && !force) {
    return res.status(429).json({ error: 'A fetch is already in progress. Please wait.' });
  }

  currentJob = null;
  currentJob = { status: 'running', log: [], result: null, error: null, _startedAt: Date.now() };
  const jobRef = currentJob;

  fetchPortalData({
    pan, password, dob: dob || null, assessmentYear: assessmentYear || '2025-26',
    onStatus: (msg) => { console.log('[portal]', msg); jobRef.log.push(msg); },
  }).then((data) => {
    jobRef.status = 'done'; jobRef.result = data;
    setTimeout(() => { if (currentJob === jobRef) currentJob = null; }, 120000);
  }).catch((err) => {
    jobRef.status = 'error'; jobRef.error = err.message;
    setTimeout(() => { if (currentJob === jobRef) currentJob = null; }, 5000);
  });

  res.json({ started: true, message: 'Browser opened. Check the browser window for any prompts.' });
});

app.get('/status', (_req, res) => {
  if (!currentJob) return res.json({ status: 'idle' });
  res.json({ status: currentJob.status, log: currentJob.log, result: currentJob.status === 'done' ? currentJob.result : null, error: currentJob.error });
});

app.post('/fetch-26as', async (req, res) => {
  const { pan, password, dob, assessmentYear, force } = req.body ?? {};

  if (!pan || !password) {
    return res.status(400).json({ error: 'pan and password are required' });
  }

  if (isJobBlocking(current26ASJob) && !force) {
    return res.status(429).json({ error: 'A 26AS fetch is already in progress. Please wait.' });
  }

  current26ASJob = null;
  current26ASJob = { status: 'running', log: [], result: null, error: null, _startedAt: Date.now() };
  const jobRef = current26ASJob;

  fetch26AS({
    pan, password, dob: dob || null, assessmentYear: assessmentYear || '2025-26',
    onStatus: (msg) => { console.log('[26as]', msg); jobRef.log.push(msg); },
  }).then((data) => {
    jobRef.status = 'done'; jobRef.result = data;
    setTimeout(() => { if (current26ASJob === jobRef) current26ASJob = null; }, 120000);
  }).catch((err) => {
    jobRef.status = 'error'; jobRef.error = err.message;
    setTimeout(() => { if (current26ASJob === jobRef) current26ASJob = null; }, 5000);
  });

  res.json({ started: true, message: 'Browser opened for 26AS. Check for TRACES portal.' });
});

app.get('/status-26as', (_req, res) => {
  if (!current26ASJob) return res.json({ status: 'idle' });
  res.json({ status: current26ASJob.status, log: current26ASJob.log, result: current26ASJob.status === 'done' ? current26ASJob.result : null, error: current26ASJob.error });
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
