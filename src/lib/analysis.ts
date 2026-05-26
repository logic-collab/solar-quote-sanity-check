import type { AnalysisResult, QuoteForm, RiskFlag, RiskSeverity } from "../types/quote";
import { stateProfiles } from "../data/stateProfiles";
import { clamp, formatDecimal, formatMoney, formatWhole } from "./format";

function getVerdict(score: number) {
  if (score <= 20) return { label: "Clean", tone: "text-emerald-300", toneLight: "text-emerald-700" };
  if (score <= 40) return { label: "Needs Review", tone: "text-cyan-300", toneLight: "text-cyan-700" };
  if (score <= 60) return { label: "High Risk", tone: "text-amber-300", toneLight: "text-amber-700" };
  return { label: "Likely Inflated", tone: "text-rose-300", toneLight: "text-rose-700" };
}

export function buildAnalysis(form: QuoteForm): AnalysisResult {
  const profile = stateProfiles[form.state] ?? stateProfiles.NATIONAL;

  const systemWatt = form.systemSize * 1000;
  const pricePerW = form.cashPrice / Math.max(systemWatt, 1);
  const financeGap = Math.max(form.financedPrice - form.cashPrice, 0);
  const financeGapPct = financeGap / Math.max(form.cashPrice, 1);
  const dealerFeePct = financeGapPct * 100;

  const expectedProductionLow = form.systemSize * profile.productionLow;
  const expectedProductionHigh = form.systemSize * profile.productionHigh;
  const batteryCostPerKw = form.batteryCost / Math.max(form.systemSize, 1);

  const fairInstallLow = profile.priceLow * systemWatt;
  const fairInstallHigh = profile.priceHigh * systemWatt;

  const pricingRisk =
    pricePerW <= profile.priceLow
      ? clamp((profile.priceLow - pricePerW) * 8, 0, 4)
      : pricePerW <= profile.priceHigh
        ? 4 + ((pricePerW - profile.priceLow) / Math.max(profile.priceHigh - profile.priceLow, 0.01)) * 8
        : clamp(12 + (pricePerW - profile.priceHigh) * 36, 12, 30);

  const financingRisk =
    financeGap <= 500
      ? 0
      : financeGapPct < 0.1
        ? 6 + financeGapPct * 40
        : financeGapPct < 0.2
          ? 11 + financeGapPct * 55
          : clamp(18 + financeGapPct * 55, 18, 25);

  const productionRisk =
    form.annualProduction <= 0
      ? 8
      : form.annualProduction > expectedProductionHigh
        ? clamp(((form.annualProduction - expectedProductionHigh) / Math.max(expectedProductionHigh, 1)) * 80, 4, 15)
        : form.annualProduction < expectedProductionLow * 0.88
          ? 2
          : 1.5;

  const batteryRisk = !form.batteryIncluded
    ? 0
    : clamp(
        (form.batteryPurpose.toLowerCase().includes("backup") ? 3 : form.batteryPurpose.toLowerCase().includes("both") ? 5 : 8) +
          (batteryCostPerKw > 1400 ? 2 : 0) +
          (batteryCostPerKw > 1800 ? 2 : 0),
        1,
        10
      );

  const populatedSignals = [
    form.utilityProvider,
    form.panelBrand,
    form.inverterBrand,
    form.zipCode,
    form.roofType,
  ].filter((entry) => String(entry).trim().length > 0).length;

  const qualityRisk = clamp(10 - populatedSignals * 1.2 + (form.warrantyYears < 25 ? 2.5 : 0), 0, 10);

  const salesRisk = clamp(
    (financeGapPct * 70 + (pricePerW > profile.priceHigh ? 2 : 0) + (form.monthlyPayment < 1 ? 2 : 0)) / 2,
    0,
    10
  );

  const totalRisk = clamp(pricingRisk + financingRisk + productionRisk + batteryRisk + qualityRisk + salesRisk, 0, 100);

  const verdict = getVerdict(totalRisk);

  const annualSavingsEstimate = form.annualProduction * (form.utilityRate > 0 ? form.utilityRate : 0.18);

  const simplePaybackYears = annualSavingsEstimate > 0 ? form.cashPrice / annualSavingsEstimate : 0;

  const batteryROIText = form.batteryIncluded
    ? form.batteryPurpose.toLowerCase().includes("backup")
      ? "The battery may be justified for backup, but the financial payback is probably weak."
      : "The battery appears to be doing more financial sales work than backup work."
    : "No battery premium in the quote, which keeps solar economics easier to judge.";

  const flags: RiskFlag[] = [
    {
      severity: (pricingRisk > 18 ? "critical" : pricingRisk > 10 ? "high" : "medium") as RiskSeverity,
      title: pricePerW > profile.priceHigh ? "Price per watt is above benchmark" : "Price per watt is within the market band",
      detail:
        pricePerW > profile.priceHigh
          ? `Your quote lands at ${formatMoney(pricePerW, 2)}/W, above the ${profile.label} benchmark range of ${formatMoney(profile.priceLow, 2)} to ${formatMoney(profile.priceHigh, 2)}/W.`
          : `Your quote lands at ${formatMoney(pricePerW, 2)}/W, inside the ${profile.label} range. That does not make it cheap, but it is not an immediate red flag.`,
      action:
        pricePerW > profile.priceHigh
          ? "Ask for a cash-only comparison and a line-by-line explanation of every premium line item."
          : "Keep the cash comparison on the table and pressure-test the dealer fee next.",
    },
    {
      severity: (financeGapPct > 0.18 ? "critical" : financeGapPct > 0.1 ? "high" : "medium") as RiskSeverity,
      title: financeGap > 0 ? "Finance premium detected" : "Cash and financed prices are close",
      detail:
        financeGap > 0
          ? `The financed proposal is ${formatMoney(financeGap)} above cash, which implies about ${formatDecimal(financeGapPct * 100, 1)}% in added financing cost.`
          : "There is no finance premium in the current numbers, which makes the quote easier to defend.",
      action:
        financeGap > 0
          ? "Request the dealer fee, the APR, and an apples-to-apples cash proposal from the same installer."
          : "Keep the financing terms under review, but the headline markup is not coming from the loan.",
    },
    {
      severity: (productionRisk > 8 ? "high" : productionRisk > 3 ? "medium" : "low") as RiskSeverity,
      title: form.annualProduction > expectedProductionHigh ? "Production claim looks optimistic" : "Production estimate is plausible",
      detail:
        form.annualProduction > expectedProductionHigh
          ? `Quoted production of ${formatWhole(form.annualProduction)} kWh/year is above the expected ${formatWhole(expectedProductionLow)} to ${formatWhole(expectedProductionHigh)} kWh band for this system.`
          : `Quoted production of ${formatWhole(form.annualProduction)} kWh/year sits near the expected ${formatWhole(expectedProductionLow)} to ${formatWhole(expectedProductionHigh)} kWh band for ${profile.label}.`,
      action:
        form.annualProduction > expectedProductionHigh
          ? "Ask for shading, orientation, and loss assumptions in writing."
          : "Keep this as a supporting data point and focus on pricing plus financing.",
    },
    {
      severity: (batteryRisk > 7 ? "high" : batteryRisk > 3 ? "medium" : "low") as RiskSeverity,
      title: form.batteryIncluded ? "Battery economics need context" : "No battery premium in this quote",
      detail: form.batteryIncluded
        ? `Battery spend is ${formatMoney(form.batteryCost)} and the stated purpose is ${form.batteryPurpose.toLowerCase()}. That can be justified for backup, but the ROI story may still be weak.`
        : "The quote does not currently depend on a battery add-on, which keeps the pricing easier to benchmark.",
      action: form.batteryIncluded
        ? "Ask for a battery-less version so you can separate backup value from solar ROI."
        : "If backup matters, request a separate battery proposal so the economics stay transparent.",
    },
    {
      severity: (qualityRisk > 6 ? "medium" : "low") as RiskSeverity,
      title: "Quote quality and documentation",
      detail:
        form.panelBrand && form.inverterBrand
          ? `Panel and inverter brands are named, and the warranty is ${form.warrantyYears} years. That helps, but the quote still needs a written itemization.`
          : "Some equipment details are missing. That lowers confidence and makes the proposal harder to defend later.",
      action: "Ask for model numbers, warranty terms, and a cash-only version with every line item listed.",
    },
  ].sort((a, b) => {
    const rank: Record<RiskSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return rank[b.severity] - rank[a.severity];
  });

  const topConcern = flags[0];

  const summary =
    totalRisk <= 20
      ? "This quote looks clean on the surface, with no major pricing or financing alarm bells."
      : totalRisk <= 40
        ? "The quote is usable, but the financing and documentation deserve a second pass before you sign."
        : totalRisk <= 60
          ? "The quote needs review. The math is not fatal, but the pricing and/or finance spread is worth challenging."
          : "The quote looks aggressively priced or padded. The hidden costs deserve pushback before any signature.";

  const nextSteps = [
    "Ask for a cash-only, line-by-line proposal before you discuss financing.",
    "Compare this quote against at least two more installers in the same market.",
    form.batteryIncluded
      ? "Request a battery-less version so backup value does not blur the solar price."
      : "If backup matters, request a separate battery quote.",
    pricePerW > profile.priceHigh
      ? "Challenge the price per watt and ask the seller to justify any premium above the benchmark."
      : "Use the benchmark to negotiate the finance terms and the paperwork clarity.",
  ];

  const confidence = clamp(
    60 +
      (form.zipCode ? 6 : 0) +
      (form.state ? 6 : 0) +
      (form.utilityProvider ? 8 : 0) +
      (form.systemSize > 0 ? 5 : 0) +
      (form.cashPrice > 0 ? 5 : 0) +
      (form.financedPrice > 0 ? 5 : 0) +
      (form.annualProduction > 0 ? 7 : 0) +
      (form.warrantyYears >= 20 ? 4 : 0) -
      (form.batteryIncluded && !form.batteryPurpose ? 6 : 0),
    45,
    98
  );

  const chartData = Array.from({ length: 5 }).map((_, index) => {
    const year = index + 1;
    const inflation = Math.pow(1.03, year);
    return {
      year,
      base: Math.round(annualSavingsEstimate * year),
      inflated: Math.round(annualSavingsEstimate * year * inflation),
    };
  });

  return {
    profile,
    pricePerW,
    financeGap,
    financeGapPct,
    dealerFeePct,
    expectedProductionLow,
    expectedProductionHigh,
    batteryCostPerKw,
    pricingRisk,
    financingRisk,
    productionRisk,
    batteryRisk,
    qualityRisk,
    salesRisk,
    totalRisk,
    verdict: verdict.label,
    verdictTone: verdict.tone,
    verdictToneLight: verdict.toneLight,
    flags,
    topConcern,
    nextSteps,
    summary,
    confidence,
    maximums: {
      pricing: 30,
      financing: 25,
      production: 15,
      battery: 10,
      quality: 10,
      sales: 10,
    },
    annualSavingsEstimate,
    batteryROIText,
    fairInstallLow,
    fairInstallHigh,
    simplePaybackYears,
    chartData,
  };
}