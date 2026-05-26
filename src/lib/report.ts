import type { AnalysisResult, QuoteForm, Tone } from "../types/quote";
import { buildEmailDraft, buildNegotiationScript } from "./negotiation";

export function buildReportData(form: QuoteForm, analysis: AnalysisResult, tone: Tone) {
  return {
    title: "Solar Quote Sanity Check Report",
    summary: analysis.summary,
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    form,
    analysis,
    negotiationScript: buildNegotiationScript(tone),
    emailDraft: buildEmailDraft(tone, form, analysis),
  };
}