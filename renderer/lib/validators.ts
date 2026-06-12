/**
 * validators.ts
 * Centralised validation utilities for TaxFlow Pro.
 * All functions are pure and dependency-free.
 *
 * Each validator returns a ValidationResult:
 *   { valid: true }  — passes
 *   { valid: false, message: string }  — fails with reason
 */

// ─── Core type ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const pass: ValidationResult = { valid: true };
const fail = (message: string): ValidationResult => ({ valid: false, message });

// ─── PAN ──────────────────────────────────────────────────────────────────────

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Validate a PAN number.
 * Format: 5 uppercase letters + 4 digits + 1 uppercase letter
 * e.g. ABCDE1234F
 */
export function validatePAN(value: string | null | undefined): ValidationResult {
  if (!value?.trim()) return fail("PAN is required.");
  const upper = value.trim().toUpperCase();
  if (upper.length !== 10) return fail("PAN must be exactly 10 characters.");
  if (!PAN_REGEX.test(upper)) return fail("Invalid PAN format. Expected: AAAAA0000A");
  return pass;
}

/**
 * Detect the type of entity from the 4th character of a PAN.
 * Returns a human-readable label or null if unrecognised.
 *
 * 4th char mapping per Income Tax rules:
 * P — Individual, H — HUF, C — Company, F — Firm,
 * A — AOP/AJP, T — Trust, B — BOI, L — Local Authority,
 * J — Artificial Juridical Person, G — Government
 */
export function panEntityType(pan: string): string | null {
  const upper = pan.trim().toUpperCase();
  if (upper.length < 4) return null;
  const map: Record<string, string> = {
    P: "Individual",
    H: "HUF",
    C: "Company",
    F: "Firm",
    A: "AOP / AJP",
    T: "Trust",
    B: "BOI",
    L: "Local Authority",
    J: "Artificial Juridical Person",
    G: "Government",
  };
  return map[upper[3]] ?? null;
}

// ─── Aadhaar ──────────────────────────────────────────────────────────────────

/**
 * Validate a 12-digit Aadhaar number using the Verhoeff algorithm.
 * First digit cannot be 0 or 1.
 */
export function validateAadhaar(value: string | null | undefined): ValidationResult {
  if (!value?.trim()) return fail("Aadhaar number is required.");
  const digits = value.replace(/\s|-/g, "");
  if (!/^\d{12}$/.test(digits)) return fail("Aadhaar must be a 12-digit number.");
  if (digits[0] === "0" || digits[0] === "1")
    return fail("Aadhaar number cannot start with 0 or 1.");
  if (!verhoeff(digits)) return fail("Invalid Aadhaar number (checksum failed).");
  return pass;
}

/** Verhoeff checksum — used by UIDAI for Aadhaar validation */
function verhoeff(num: string): boolean {
  const d = [
    [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0],
  ];
  const p = [
    [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
  ];
  const inv = [0,4,3,2,1,5,6,7,8,9];
  let c = 0;
  const reversed = num.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = d[c][p[i % 8][parseInt(reversed[i], 10)]];
  }
  return inv[c] === 0;
}

// ─── IFSC ─────────────────────────────────────────────────────────────────────

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Validate an IFSC code.
 * Format: 4 letters (bank) + "0" + 6 alphanumeric (branch)
 * e.g. SBIN0001234
 */
export function validateIFSC(value: string | null | undefined): ValidationResult {
  if (!value?.trim()) return fail("IFSC code is required.");
  const upper = value.trim().toUpperCase().replace(/\s/g, "");
  if (upper.length !== 11) return fail("IFSC must be 11 characters.");
  if (!IFSC_REGEX.test(upper)) return fail("Invalid IFSC format. Expected: AAAA0XXXXXX");
  return pass;
}

/**
 * Extract the bank code (first 4 chars) from an IFSC.
 */
export function ifscBankCode(ifsc: string): string {
  return ifsc.trim().toUpperCase().slice(0, 4);
}

// ─── Email ────────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate an email address.
 */
export function validateEmail(
  value: string | null | undefined,
  required = false
): ValidationResult {
  if (!value?.trim()) {
    return required ? fail("Email address is required.") : pass;
  }
  if (!EMAIL_REGEX.test(value.trim())) return fail("Enter a valid email address.");
  if (value.trim().length > 254) return fail("Email address is too long.");
  return pass;
}

// ─── Mobile ───────────────────────────────────────────────────────────────────

const MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * Validate an Indian mobile number (10 digits, starts with 6-9).
 */
export function validateMobile(
  value: string | null | undefined,
  required = false
): ValidationResult {
  if (!value?.trim()) {
    return required ? fail("Mobile number is required.") : pass;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return fail("Mobile number must be 10 digits.");
  if (!MOBILE_REGEX.test(digits)) return fail("Enter a valid Indian mobile number (starts with 6–9).");
  return pass;
}

// ─── Pincode ──────────────────────────────────────────────────────────────────

const PINCODE_REGEX = /^\d{6}$/;

/**
 * Validate a 6-digit Indian PIN code.
 */
export function validatePincode(
  value: string | null | undefined,
  required = false
): ValidationResult {
  if (!value?.trim()) {
    return required ? fail("Pincode is required.") : pass;
  }
  if (!PINCODE_REGEX.test(value.trim())) return fail("Pincode must be exactly 6 digits.");
  if (value.trim().startsWith("0")) return fail("Pincode cannot start with 0.");
  return pass;
}

// ─── GST ─────────────────────────────────────────────────────────────────────

const GST_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

/**
 * Validate a 15-character GST Identification Number (GSTIN).
 * Format: 2 digits (state) + PAN (10) + entity number (1) + Z + checksum (1)
 */
export function validateGSTIN(value: string | null | undefined): ValidationResult {
  if (!value?.trim()) return fail("GSTIN is required.");
  const upper = value.trim().toUpperCase().replace(/\s/g, "");
  if (upper.length !== 15) return fail("GSTIN must be 15 characters.");
  if (!GST_REGEX.test(upper)) return fail("Invalid GSTIN format.");
  // Cross-check embedded PAN
  const embeddedPAN = upper.slice(2, 12);
  const panCheck = validatePAN(embeddedPAN);
  if (!panCheck.valid) return fail("GSTIN contains an invalid PAN segment.");
  return pass;
}

// ─── TAN ─────────────────────────────────────────────────────────────────────

const TAN_REGEX = /^[A-Z]{4}\d{5}[A-Z]$/;

/**
 * Validate a Tax Deduction Account Number (TAN).
 * Format: 4 letters + 5 digits + 1 letter
 * e.g. ABCD12345E
 */
export function validateTAN(value: string | null | undefined): ValidationResult {
  if (!value?.trim()) return fail("TAN is required.");
  const upper = value.trim().toUpperCase();
  if (upper.length !== 10) return fail("TAN must be exactly 10 characters.");
  if (!TAN_REGEX.test(upper)) return fail("Invalid TAN format. Expected: AAAA00000A");
  return pass;
}

// ─── Bank account number ──────────────────────────────────────────────────────

/**
 * Validate an Indian bank account number.
 * Rules: 9–18 digits, no leading zeros.
 */
export function validateAccountNumber(value: string | null | undefined): ValidationResult {
  if (!value?.trim()) return fail("Account number is required.");
  const digits = value.replace(/\s/g, "");
  if (!/^\d+$/.test(digits)) return fail("Account number must contain digits only.");
  if (digits.length < 9 || digits.length > 18)
    return fail("Account number must be between 9 and 18 digits.");
  if (digits.startsWith("0")) return fail("Account number cannot start with 0.");
  return pass;
}

// ─── Assessment Year ──────────────────────────────────────────────────────────

const AY_REGEX = /^\d{4}-\d{2}$/;

/**
 * Validate an Assessment Year string like "2024-25".
 * The suffix must equal the last 2 digits of (start year + 1).
 */
export function validateAY(value: string | null | undefined): ValidationResult {
  if (!value?.trim()) return fail("Assessment Year is required.");
  const ay = value.trim();
  if (!AY_REGEX.test(ay)) return fail("AY format must be YYYY-YY (e.g. 2024-25).");
  const [startStr, suffixStr] = ay.split("-");
  const start = parseInt(startStr, 10);
  const suffix = parseInt(suffixStr, 10);
  const expectedSuffix = (start + 1) % 100;
  if (suffix !== expectedSuffix)
    return fail(`AY suffix should be ${String(expectedSuffix).padStart(2, "0")} for year ${start}.`);
  if (start < 2000 || start > 2099)
    return fail("Assessment Year must be in the range 2000–2099.");
  return pass;
}

// ─── Password strength ────────────────────────────────────────────────────────

export type PasswordStrength = "weak" | "fair" | "strong" | "very_strong";

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0–4
  feedback: string[];
}

/**
 * Assess password strength for the portal password field.
 * Returns a score (0–4) and actionable feedback messages.
 */
export function assessPasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (!password) {
    return { strength: "weak", score: 0, feedback: ["Password is required."] };
  }

  if (password.length >= 8)  score++;
  else feedback.push("Use at least 8 characters.");

  if (password.length >= 12) score++;
  else if (password.length < 8) {} // already flagged
  else feedback.push("12+ characters makes it stronger.");

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  else feedback.push("Mix uppercase and lowercase letters.");

  if (/\d/.test(password)) score++;
  else feedback.push("Add at least one number.");

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push("Add a special character (e.g. @, #, !).");

  // Cap at 4
  score = Math.min(score, 4);

  const strengthMap: PasswordStrength[] =
    ["weak", "weak", "fair", "strong", "very_strong"];

  return {
    strength: strengthMap[score],
    score,
    feedback: feedback.slice(0, 2), // surface top 2 tips
  };
}

// ─── Generic required ─────────────────────────────────────────────────────────

/**
 * Assert a value is non-empty. Works for strings, arrays, and numbers.
 */
export function validateRequired(
  value: unknown,
  fieldName = "This field"
): ValidationResult {
  if (value == null) return fail(`${fieldName} is required.`);
  if (typeof value === "string" && !value.trim()) return fail(`${fieldName} is required.`);
  if (Array.isArray(value) && value.length === 0) return fail(`${fieldName} is required.`);
  return pass;
}

// ─── Composite form validator ─────────────────────────────────────────────────

export type FieldValidators<T> = {
  [K in keyof T]?: (value: T[K]) => ValidationResult;
};

/**
 * Run a map of field validators over a form object.
 * Returns a Record<fieldName, errorMessage> for failed fields only.
 *
 * Usage:
 *   const errors = validateForm(formData, {
 *     pan: (v) => validatePAN(v),
 *     email: (v) => validateEmail(v),
 *   });
 */
export function validateForm<T extends Record<string, unknown>>(
  data: T,
  validators: FieldValidators<T>
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const key in validators) {
    const fn = validators[key];
    if (!fn) continue;
    const result = fn(data[key] as T[typeof key]);
    if (!result.valid && result.message) {
      errors[key] = result.message;
    }
  }
  return errors;
}
