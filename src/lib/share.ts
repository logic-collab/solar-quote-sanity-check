import type { QuoteForm } from "../types/quote";

export function generateShareableLink(form: QuoteForm) {
  const simplified = {
    s: form.state,
    sz: form.systemSize,
    c: form.cashPrice,
    f: form.financedPrice,
    p: form.annualProduction,
    b: form.batteryIncluded ? 1 : 0,
    bc: form.batteryCost,
  };

  const compressed = btoa(JSON.stringify(simplified));
  return `${window.location.origin}?q=${compressed}`;
}

export function parseShareableLink(urlParams: URLSearchParams): Partial<QuoteForm> {
  const q = urlParams.get('q');
  if (!q) return {};

  try {
    const decoded = JSON.parse(atob(q));
    return {
      state: decoded.s,
      systemSize: decoded.sz,
      cashPrice: decoded.c,
      financedPrice: decoded.f,
      annualProduction: decoded.p,
      batteryIncluded: decoded.b === 1,
      batteryCost: decoded.bc,
    };
  } catch {
    return {};
  }
}