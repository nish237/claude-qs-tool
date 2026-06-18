// localStorage-backed rate library and company defaults
const RATE_KEY    = 'qs-rate-library-v1';
const COMPANY_KEY = 'qs-company-defaults-v1';

export function saveRatesToLibrary(rates) {
  if (typeof localStorage === 'undefined') return;
  try {
    const existing = loadRateLibrary();
    localStorage.setItem(RATE_KEY, JSON.stringify({ ...existing, ...rates }));
  } catch {}
}

export function loadRateLibrary() {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(RATE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function clearRateLibrary() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(RATE_KEY);
}

export function saveCompanyDefaults(data) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(COMPANY_KEY, JSON.stringify(data));
  } catch {}
}

export function loadCompanyDefaults() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(COMPANY_KEY) || 'null');
  } catch {
    return null;
  }
}
