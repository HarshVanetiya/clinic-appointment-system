/**
 * Indian mobile numbers. Accepts common ways people type them:
 * "98765 43210", "098765-43210", "+91 98765 43210", "91 9876543210".
 * Stored as E.164 (+919876543210); displayed as "+91 98765 43210".
 */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+91')) return null
    digits = digits.slice(3)
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2)
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}

export function formatIndianMobile(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164)
  return m ? `+91 ${m[1]} ${m[2]}` : e164
}
