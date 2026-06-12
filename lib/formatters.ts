/**
 * formatters.ts
 * Centralised formatting utilities for TaxFlow Pro.
 * All functions are pure and dependency-free.
 */

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Format a number as Indian Rupees.
 * e.g. 1234567.89 → "₹12,34,567.89"
 */
export function formatCurrency(
  amount: number | null | undefined,
  opts: { decimals?: number; compact?: boolean } = {}
): string {
  if (amount == null || isNaN(amount)) return "₹0";

  const { decimals = 2, compact = false } = opts;

  if (compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000)    return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
    if (abs >= 1_000)       return `${sign}₹${(abs / 1_000).toFixed(1)} K`;
    return `${sign}₹${abs.toFixed(decimals)}`;
  }

  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a raw number with Indian comma grouping, no currency symbol.
 * e.g. 1234567 → "12,34,567"
 */
export function formatNumber(
  value: number | null | undefined,
  decimals = 0
): string {
  if (value == null || isNaN(value)) return "0";
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parse a formatted currency string back to a number.
 * Strips ₹, commas, spaces, Cr/L/K suffixes.
 */
export function parseCurrency(value: string): number {
  const clean = value.replace(/[₹,\s]/g, "");
  if (/Cr$/i.test(clean)) return parseFloat(clean) * 1_00_00_000;
  if (/L$/i.test(clean))  return parseFloat(clean) * 1_00_000;
  if (/K$/i.test(clean))  return parseFloat(clean) * 1_000;
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

// ─── Date ─────────────────────────────────────────────────────────────────────

/**
 * Format an ISO date string or Date to DD/MM/YYYY.
 * e.g. "1985-07-15" → "15/07/1985"
 */
export function formatDate(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return fallback;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return fallback;
  }
}

/**
 * Format an ISO datetime string to "DD/MM/YYYY, HH:MM" (24-hour, IST label).
 * e.g. "2025-03-10T14:30:00Z" → "10/03/2025, 14:30"
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return fallback;
    const date = formatDate(d);
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${date}, ${hh}:${min}`;
  } catch {
    return fallback;
  }
}

/**
 * Format a date as a relative string ("Today", "Yesterday", "3 days ago",
 * or DD/MM/YYYY if older than 30 days).
 */
export function formatRelativeDate(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return fallback;

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7)   return `${diffDays} days ago`;
    if (diffDays < 30)  return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
    return formatDate(d);
  } catch {
    return fallback;
  }
}

/**
 * Format a date of birth as "DD/MM/YYYY (Age: N years)".
 */
export function formatDOBWithAge(
  value: string | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;
  try {
    const dob = new Date(value);
    if (isNaN(dob.getTime())) return fallback;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const mDiff = now.getMonth() - dob.getMonth();
    if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) age--;
    return `${formatDate(dob)} (Age: ${age})`;
  } catch {
    return fallback;
  }
}

// ─── Assessment Year ──────────────────────────────────────────────────────────

/**
 * Convert a financial year start to an AY label.
 * e.g. 2024 → "AY 2024-25"
 */
export function formatAY(fyStart: number): string {
  return `AY ${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

/**
 * Parse an AY string like "2024-25" and return the FY start year.
 */
export function parseAY(ay: string): number | null {
  const match = ay.match(/^(\d{4})-\d{2}$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Return the current Assessment Year label based on today's date.
 * AY starts on 1 April each year.
 */
export function currentAY(): string {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

// ─── PAN ──────────────────────────────────────────────────────────────────────

/**
 * Format a raw PAN string for display — uppercase, with a subtle space
 * grouping for readability: "ABCDE 1234 F".
 */
export function formatPAN(pan: string | null | undefined, fallback = "—"): string {
  if (!pan) return fallback;
  const upper = pan.toUpperCase().replace(/\s/g, "");
  if (upper.length !== 10) return upper || fallback;
  return `${upper.slice(0, 5)} ${upper.slice(5, 9)} ${upper.slice(9)}`;
}

/**
 * Mask a PAN for display in non-sensitive contexts: "ABCDE****F"
 */
export function maskPAN(pan: string | null | undefined, fallback = "—"): string {
  if (!pan) return fallback;
  const upper = pan.toUpperCase().replace(/\s/g, "");
  if (upper.length !== 10) return fallback;
  return `${upper.slice(0, 5)}****${upper.slice(9)}`;
}

// ─── IFSC ─────────────────────────────────────────────────────────────────────

/**
 * Format IFSC with separator after bank code for readability.
 * e.g. "SBIN0001234" → "SBIN 0 001234"
 */
export function formatIFSC(ifsc: string | null | undefined, fallback = "—"): string {
  if (!ifsc) return fallback;
  const upper = ifsc.toUpperCase().replace(/\s/g, "");
  if (upper.length !== 11) return upper || fallback;
  return `${upper.slice(0, 4)} ${upper[4]} ${upper.slice(5)}`;
}

// ─── Phone ────────────────────────────────────────────────────────────────────

/**
 * Format a 10-digit Indian mobile number with a space after area code.
 * e.g. "9876543210" → "+91 98765 43210"
 */
export function formatMobile(
  mobile: string | null | undefined,
  fallback = "—"
): string {
  if (!mobile) return fallback;
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return mobile;
}

// ─── Assessee type ────────────────────────────────────────────────────────────

const ASSESSEE_LABELS: Record<string, string> = {
  Individual:          "Individual",
  HUF:                 "HUF",
  Firm:                "Firm",
  LLP:                 "LLP",
  Company_Domestic:    "Company (Domestic)",
  Company_Foreign:     "Company (Foreign)",
  AOP:                 "AOP",
  BOI:                 "BOI",
  AJP:                 "AJP",
  Trust:               "Trust",
  LocalAuthority:      "Local Authority",
  CooperativeSociety:  "Co-op Society",
};

export function formatAssesseeType(type: string | null | undefined, fallback = "—"): string {
  if (!type) return fallback;
  return ASSESSEE_LABELS[type] ?? type;
}

// ─── Residential status ───────────────────────────────────────────────────────

const RESIDENTIAL_LABELS: Record<string, string> = {
  Resident:                       "Resident",
  NonResident:                    "Non-Resident (NRI)",
  ResidentNotOrdinarilyResident:  "RNOR",
};

export function formatResidentialStatus(
  status: string | null | undefined,
  fallback = "—"
): string {
  if (!status) return fallback;
  return RESIDENTIAL_LABELS[status] ?? status;
}

// ─── File size ────────────────────────────────────────────────────────────────

/**
 * Format bytes to human-readable file size.
 * e.g. 1536 → "1.5 KB"
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val % 1 === 0 ? val : val.toFixed(1)} ${units[i]}`;
}

// ─── Percentage ───────────────────────────────────────────────────────────────

/**
 * Format a decimal fraction as a percentage string.
 * e.g. 0.2375 → "23.75%"
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 2,
  fallback = "—"
): string {
  if (value == null || isNaN(value)) return fallback;
  return `${(value * 100).toFixed(decimals)}%`;
}

// ─── Account number ───────────────────────────────────────────────────────────

/**
 * Mask all but the last 4 digits of an account number.
 * e.g. "1234567890" → "XXXXXX7890"
 */
export function maskAccountNumber(acct: string | null | undefined, fallback = "—"): string {
  if (!acct) return fallback;
  if (acct.length <= 4) return acct;
  return "X".repeat(acct.length - 4) + acct.slice(-4);
}
