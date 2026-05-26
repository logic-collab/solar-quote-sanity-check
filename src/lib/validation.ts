import type { QuoteForm } from "../types/quote";

export function validateQuoteForm(form: QuoteForm) {
  const errors: Partial<Record<keyof QuoteForm, string>> = {};

  if (form.systemSize < 1 || form.systemSize > 100) {
    errors.systemSize = 'System size should be 1–100 kW';
  }

  if (form.cashPrice < 1000) {
    errors.cashPrice = 'Cash price seems too low';
  }

  if (form.financedPrice < form.cashPrice) {
    errors.financedPrice = 'Financed price should be ≥ cash price';
  }

  if (form.annualProduction < 1000 || form.annualProduction > 50000) {
    errors.annualProduction = 'Production seems unrealistic (1,000–50,000 kWh)';
  }

  if (form.warrantyYears < 5 || form.warrantyYears > 30) {
    errors.warrantyYears = 'Warranty should be 5–30 years';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}