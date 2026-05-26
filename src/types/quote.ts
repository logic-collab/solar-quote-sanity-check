export type Step = "intake" | "breakdown" | "performance" | "financial" | "audit" | "blueprint";

export type Tone = "polite" | "firm" | "skeptical";

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export type StateProfile = {
  label: string;
  priceLow: number;
  priceHigh: number;
  productionLow: number;
  productionHigh: number;
  note: string;
};

export type UtilityProvider = {
  name: string;
  region: string;
  peak: number;
  offPeak: number;
};

export type QuoteForm = {
  zipCode: string;
  state: string;
  utilityProvider: string;
  utilityRate: number;
  netMeteringType: string;
  systemSize: number;
  cashPrice: number;
  financedPrice: number;
  monthlyPayment: number;
  batteryIncluded: boolean;
  batteryCost: number;
  batteryPurpose: string;
  annualProduction: number;
  warrantyYears: number;
  roofType: string;
  panelBrand: string;
  inverterBrand: string;
};

export type RiskFlag = {
  severity: RiskSeverity;
  title: string;
  detail: string;
  action: string;
};

export type AnalysisResult = {
  profile: StateProfile;
  pricePerW: number;
  financeGap: number;
  financeGapPct: number;
  dealerFeePct: number;
  expectedProductionLow: number;
  expectedProductionHigh: number;
  batteryCostPerKw: number;
  pricingRisk: number;
  financingRisk: number;
  productionRisk: number;
  batteryRisk: number;
  qualityRisk: number;
  salesRisk: number;
  totalRisk: number;
  verdict: string;
  verdictTone: string;
  verdictToneLight: string;
  flags: RiskFlag[];
  topConcern: RiskFlag;
  nextSteps: string[];
  summary: string;
  confidence: number;
  maximums: Record<string, number>;
  annualSavingsEstimate: number;
  batteryROIText: string;
  fairInstallLow: number;
  fairInstallHigh: number;
  simplePaybackYears: number;
  chartData: Array<{ year: number; base: number; inflated: number }>;
};

export type SavedQuote = QuoteForm & {
  id: string;
  name: string;
  timestamp: number;
  analysis: AnalysisResult;
};