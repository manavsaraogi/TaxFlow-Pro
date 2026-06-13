/**
 * POST /api/portal/fetch-ais
 *
 * The Income Tax portal (incometax.gov.in) blocks server-to-server HTTP requests
 * via Akamai bot protection. Direct API calls from Vercel always return 403/502.
 *
 * This route now returns a clear explanation so the UI can guide the user
 * to download AIS manually and use the Upload File option.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    error: 'PORTAL_BLOCKED',
    message:
      'The Income Tax portal blocks automated server-side access (bot protection). ' +
      'Please log in to incometax.gov.in manually, download the AIS JSON, and upload it using the "Upload File" button.',
  }, { status: 503 });
}
