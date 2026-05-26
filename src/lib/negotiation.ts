import type { AnalysisResult, QuoteForm, Tone } from "../types/quote";
import { formatDecimal, formatMoney } from "./format";

const toneCopy: Record<Tone, string> = {
  polite:
    "Thanks for the proposal. I reviewed the quote and would like a fully itemized cash comparison, confirmation of the dealer fee, and a clear explanation of the production assumptions before I move forward.",
  firm:
    "I reviewed the numbers and the quote needs revision. Please send an itemized cash proposal, separate the battery pricing, explain the financing spread, and provide the benchmark assumptions used for production and pricing.",
  skeptical:
    "The current proposal appears inflated relative to the benchmark range. I need a cash-only comparison, line-by-line pricing, the dealer fee disclosed explicitly, and a revised proposal without pressure tactics before I consider signing.",
};

export function buildNegotiationScript(tone: Tone) {
  return toneCopy[tone];
}

export function buildEmailDraft(tone: Tone, form: QuoteForm, analysis: AnalysisResult) {
  return `
Hello,

I've reviewed the proposal for the ${formatDecimal(form.systemSize, 1)}kW solar system and have a few questions before moving forward:

${toneCopy[tone]}

Key concerns from my analysis:
• Price per watt: ${formatMoney(analysis.pricePerW, 2)} (benchmark: ${formatMoney(analysis.profile.priceLow, 2)}-${formatMoney(analysis.profile.priceHigh, 2)})
• Finance premium: ${formatMoney(analysis.financeGap)} (${formatDecimal(analysis.financeGapPct * 100, 1)}%)
• Estimated dealer fee: ${formatDecimal(analysis.dealerFeePct, 1)}%
${form.batteryIncluded ? `• Battery cost: ${formatMoney(form.batteryCost)}` : ""}

I'd appreciate a revised proposal addressing these points.

Best regards
  `.trim();
}