"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowRight,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  Moon,
  RefreshCw,
  Share2,
  Star,
  Sun,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

import { states, stateProfiles } from "./data/stateProfiles";
import { utilityProviders } from "./data/utilityProviders";
import type { QuoteForm, SavedQuote, Step, Tone } from "./types/quote";
import { buildAnalysis } from "./lib/analysis";
import { buildReportData } from "./lib/report";
import { buildQuoteChecklist, buildInstallerQuestions, buildNextStepsAfterReview } from "./lib/blueprint";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { clamp, formatDecimal, formatMoney, formatWhole } from "./lib/format";
import { cn } from "./utils/cn";
import { trackEvent } from "./lib/analytics";
import { validateQuoteForm } from "./lib/validation";
import { generateShareableLink, parseShareableLink } from "./lib/share";
import { exportToCSV } from "./lib/export";

type ParsedQuote = Partial<QuoteForm>;

const STEP_ORDER: Step[] = ["intake", "breakdown", "performance", "financial", "audit", "blueprint"];

const stepLabels: Record<Step, string> = {
  intake: "Intake",
  breakdown: "Breakdown",
  performance: "Performance",
  financial: "Financial",
  audit: "Audit",
  blueprint: "Blueprint",
};

const TONE_COPY: Record<Tone, string> = {
  polite:
    "Thanks for the proposal. I reviewed the quote and would like a fully itemized cash comparison, confirmation of the dealer fee, and a clear explanation of the production assumptions before I move forward.",
  firm:
    "I reviewed the numbers and the quote needs revision. Please send an itemized cash proposal, separate the battery pricing, explain the financing spread, and provide the benchmark assumptions used for production and pricing.",
  skeptical:
    "The current proposal appears inflated relative to the benchmark range. I need a cash-only comparison, line-by-line pricing, the dealer fee disclosed explicitly, and a revised proposal without pressure tactics before I consider signing.",
};

const INITIAL_FORM: QuoteForm = {
  zipCode: "94110",
  state: "CA",
  utilityProvider: "PG&E (California)",
  utilityRate: 0.45,
  netMeteringType: "Full retail / NEM-style",
  systemSize: 9.8,
  cashPrice: 32800,
  financedPrice: 43750,
  monthlyPayment: 189,
  batteryIncluded: true,
  batteryCost: 12500,
  batteryPurpose: "Backup first",
  annualProduction: 14100,
  warrantyYears: 25,
  roofType: "Composite shingle",
  panelBrand: "REC",
  inverterBrand: "Enphase",
};

function getStepIndex(step: Step) {
  return STEP_ORDER.indexOf(step);
}

function getVerdictClass(score: number) {
  if (score <= 20) return { label: "Clean", className: "text-emerald-300", ring: "stroke-emerald-400" };
  if (score <= 40) return { label: "Needs Review", className: "text-cyan-300", ring: "stroke-cyan-400" };
  if (score <= 60) return { label: "High Risk", className: "text-amber-300", ring: "stroke-amber-400" };
  return { label: "Likely Inflated", className: "text-rose-300", ring: "stroke-rose-400" };
}

function parseQuoteText(text: string): ParsedQuote {
  const t = text.trim();
  const partial: ParsedQuote = {};
  const number = (val?: string | null) => (val ? Number(val.replace(/,/g, "")) : undefined);

  const systemSize = t.match(/(\d+(?:\.\d+)?)\s*kW/i);
  if (systemSize) partial.systemSize = number(systemSize[1]);

  const cashPrice = t.match(/(?:cash(?:\s+price)?|total cash|cash-only)[^\d$]*\$?([\d,]+(?:\.\d+)?)/i);
  if (cashPrice) partial.cashPrice = number(cashPrice[1]);

  const financedPrice = t.match(/(?:financed|loan|finance)[^\d$]*\$?([\d,]+(?:\.\d+)?)/i);
  if (financedPrice) partial.financedPrice = number(financedPrice[1]);

  const monthlyPayment = t.match(/(?:monthly payment|payment)[^\d$]*\$?([\d,]+(?:\.\d+)?)/i);
  if (monthlyPayment) partial.monthlyPayment = number(monthlyPayment[1]);

  const batteryCost = t.match(/battery[^\d$]*\$?([\d,]+(?:\.\d+)?)/i);
  if (batteryCost) partial.batteryCost = number(batteryCost[1]);

  const annualProduction = t.match(/([\d,]+)\s*kWh(?:\s*\/\s*year|(?:\s*per\s*year)?)/i);
  if (annualProduction) partial.annualProduction = number(annualProduction[1]);

  const warrantyYears = t.match(/(\d{1,2})\s*year\s*warranty/i);
  if (warrantyYears) partial.warrantyYears = number(warrantyYears[1]);

  const utilityRate = t.match(/(?:\$|usd)\s?([\d.]+)\s*\/\s*kWh/i);
  if (utilityRate) partial.utilityRate = number(utilityRate[1]);

  const utilityMatch = [
    { key: "PG&E (California)", regex: /pge|pg&e/i, rate: 0.45 },
    { key: "SCE (Southern California)", regex: /sce|southern california edison/i, rate: 0.42 },
    { key: "ConEd (New York)", regex: /coned|con ed/i, rate: 0.38 },
    { key: "ERCOT (Texas Average)", regex: /ercot|texas/i, rate: 0.28 },
    { key: "FPL (Florida)", regex: /fpl|florida power/i, rate: 0.15 },
    { key: "Dominion Energy", regex: /dominion/i, rate: 0.18 },
    { key: "Duke Energy", regex: /duke/i, rate: 0.2 },
    { key: "National Grid", regex: /national grid/i, rate: 0.32 },
    { key: "Xcel Energy", regex: /xcel/i, rate: 0.22 },
  ].find((item) => item.regex.test(t));

  if (utilityMatch) {
    partial.utilityProvider = utilityMatch.key;
    if (!partial.utilityRate) partial.utilityRate = utilityMatch.rate;
  }

  const statesMap: Record<string, string> = {
    california: "CA", arizona: "AZ", texas: "TX", florida: "FL",
    newyork: "NY", "new york": "NY", colorado: "CO", washington: "WA",
    carolina: "NC", "north carolina": "NC",
    nc: "NC", ca: "CA", az: "AZ", tx: "TX", fl: "FL", ny: "NY", co: "CO", wa: "WA",
  };

  const matchedState = Object.entries(statesMap).find(([key]) => {
    const re = new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`, "i");
    return re.test(t);
  });
  if (matchedState) partial.state = matchedState[1];

  if (/battery|powerwall|backup/i.test(t)) partial.batteryIncluded = true;

  const roofType = t.match(/roof(?:\s*type)?[:\s-]*([A-Za-z0-9+\- ]{3,30})/i);
  if (roofType) partial.roofType = roofType[1].trim();

  const panelBrand = t.match(/panel\s*brand[:\s-]*([A-Za-z0-9+\- ]{2,30})/i);
  if (panelBrand) partial.panelBrand = panelBrand[1].trim();

  const inverterBrand = t.match(/inverter\s*brand[:\s-]*([A-Za-z0-9+\- ]{2,30})/i);
  if (inverterBrand) partial.inverterBrand = inverterBrand[1].trim();

  return partial;
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="space-y-2">
      <p className="kicker">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="section-copy max-w-2xl">{description}</p>
    </div>
  );
}

function Field({ label, hint, tooltip, children }: { label: string; hint?: string; tooltip?: string; children: ReactNode }) {
  return (
    <label className="space-y-2 block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <div className="flex items-center gap-2">
          {hint ? <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{hint}</span> : null}
          {tooltip ? <InfoBubble text={tooltip} /> : null}
        </div>
      </div>
      {children}
    </label>
  );
}

function InfoBubble({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button type="button" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-[10px] text-cyan-300">?</button>
      <AnimatePresence>
        {show && (
          <motion.div initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }} className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-2xl border border-white/15 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300 shadow-2xl">{text}</motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field-input", className)} />;
}

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("field-input", className)} />;
}

function ToggleButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full border px-4 py-2 text-sm font-medium transition cursor-pointer", active ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10")}>
      {children}
    </button>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <p className="mt-3 text-lg font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{hint}</p>
    </div>
  );
}

function SummaryBlock({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="flex items-center gap-3"><span className={cn("h-2.5 w-2.5 rounded-full", accent)} /><p className="text-sm font-medium text-white">{label}</p></div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function Row({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-2 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn("font-medium", compact ? "text-slate-800" : "text-inherit")}>{value}</dd>
    </div>
  );
}

// ─── ANIMATED SCORE & GAUGE ──────────────────────────────────────────────────

function ScoreNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const from = display;
    const start = performance.now();
    const duration = 550;
    const tick = (now: number) => {
      const progress = clamp((now - start) / duration, 0, 1);
      setDisplay(from + (value - from) * progress);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">{Math.round(display)}</span>;
}

function Gauge({ score }: { score: number }) {
  const verdict = getVerdictClass(score);
  const radius = 54;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * (1 - clamp(score / 100, 0, 1));
  const [isPulsing, setIsPulsing] = useState(false);
  const prevScore = useRef(score);

  useEffect(() => {
    if (score !== prevScore.current) {
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 700);
      prevScore.current = score;
    }
  }, [score]);

  return (
    <div className={cn("relative flex items-center justify-center transition-transform duration-300", isPulsing && "scale-105")}>
      {isPulsing && <motion.div initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.7 }} className="absolute inset-0 rounded-full border-4 border-cyan-400" />}
      <svg className="h-36 w-36 -rotate-90 sm:h-44 sm:w-44" viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r={radius} className="fill-none stroke-white/10" strokeWidth={stroke} />
        <circle cx="70" cy="70" r={radius} className={cn("fill-none transition-all duration-700 ease-out", verdict.ring)} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={progress} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Risk score</span>
        <div className="mt-2 flex items-end gap-1"><ScoreNumber value={score} /><span className="pb-1 text-sm font-medium text-slate-400">/100</span></div>
        <span className={cn("mt-2 text-sm font-semibold", verdict.className)}>{verdict.label}</span>
      </div>
    </div>
  );
}

// ─── METER BAR ────────────────────────────────────────────────────────────────

function MeterBar({ label, value, min, max, accent = "from-cyan-400 via-sky-400 to-indigo-500", valueFormatter, rangeFormatter }: {
  label: string; value: number; min: number; max: number; accent?: string; valueFormatter?: (v: number) => string; rangeFormatter?: (v: number) => string;
}) {
  const pct = clamp(((value - min) / Math.max(max - min, 0.01)) * 100, 0, 100);
  const rv = valueFormatter ?? ((c: number) => formatMoney(c, 2));
  const rr = rangeFormatter ?? ((c: number) => formatMoney(c, 2));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-300">{label}</span><span className="font-medium text-white">{rv(value)}</span></div>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/8"><div className="absolute inset-0 bg-linear-to-r from-white/5 to-white/0" /><div className={cn("h-full rounded-full bg-linear-to-r transition-all duration-700", accent)} style={{ width: `${pct}%` }} /></div>
      <div className="flex justify-between text-[11px] uppercase tracking-[0.2em] text-slate-500"><span>{rr(min)}</span><span>{rr(max)}</span></div>
    </div>
  );
}

// ─── FLAGS & AUDIT ────────────────────────────────────────────────────────────

function FlagRow({ severity, title, detail, action }: { severity: "critical" | "high" | "medium" | "low"; title: string; detail: string; action: string }) {
  const styles = { critical: "border-rose-400/20 bg-rose-400/8 text-rose-200", high: "border-amber-400/20 bg-amber-400/8 text-amber-100", medium: "border-cyan-400/20 bg-cyan-400/8 text-cyan-100", low: "border-emerald-400/20 bg-emerald-400/8 text-emerald-100" } as const;
  return (
    <div className={cn("rounded-3xl border p-4", styles[severity])}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-white/70">{detail}</p></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-white/60">{severity}</span></div>
      <p className="mt-3 text-sm leading-6 text-white/85">Next step: {action}</p>
    </div>
  );
}

function RiskAuditCard({ analysis }: { analysis: ReturnType<typeof buildAnalysis> }) {
  return <div className="space-y-3">{analysis.flags.map((flag) => <FlagRow key={flag.title} severity={flag.severity} title={flag.title} detail={flag.detail} action={flag.action} />)}</div>;
}

// ─── FORM PROGRESS ────────────────────────────────────────────────────────────

function FormProgress({ form }: { form: QuoteForm }) {
  const required = ["state", "systemSize", "cashPrice", "financedPrice", "annualProduction", "warrantyYears"] as const;
  const optional = ["utilityProvider", "utilityRate", "panelBrand", "inverterBrand", "batteryPurpose", "roofType"] as const;
  const rDone = required.filter((k) => { const v = form[k]; return typeof v === "number" ? v > 0 : Boolean(String(v).trim()); }).length;
  const oDone = optional.filter((k) => { const v = form[k]; return typeof v === "number" ? v > 0 : Boolean(String(v).trim()); }).length;
  const pct = ((rDone + oDone) / (required.length + optional.length)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Analysis strength</span><span className="font-medium text-white">{Math.round(pct)}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} className="h-full bg-linear-to-r from-cyan-400 to-emerald-400" /></div>
      {rDone < required.length && <p className="text-xs text-amber-300">Fill {required.length - rDone} more required field{required.length - rDone !== 1 ? "s" : ""} for full analysis.</p>}
    </div>
  );
}

// ─── TERMINAL LOADER ──────────────────────────────────────────────────────────

function TerminalLoader({ messages, onComplete }: { messages: string[]; onComplete: () => void }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (idx < messages.length) { const t = setTimeout(() => setIdx((v) => v + 1), 420); return () => clearTimeout(t); }
    const done = setTimeout(onComplete, 500); return () => clearTimeout(done);
  }, [idx, messages.length, onComplete]);
  return (
    <div className="panel-strong p-6 md:p-8 font-mono text-sm">
      {messages.slice(0, idx).map((msg, i) => <div key={i} className="mb-2 flex items-center gap-2"><span className="text-cyan-300 font-bold">&gt;</span><span className="text-slate-300">{msg}</span><CheckCircle2 className="h-3 w-3 text-emerald-400" /></div>)}
      {idx < messages.length ? <div className="flex items-center gap-2 animate-pulse"><span className="text-cyan-300 font-bold">&gt;</span><span className="text-slate-400">{messages[idx]}</span><div className="h-4 w-2 bg-cyan-300 animate-blink" /></div> : null}
    </div>
  );
}

// ─── SMART PASTE ──────────────────────────────────────────────────────────────

function SmartPastePanel({ value, onChange, onParse, toast }: { value: string; onChange: (v: string) => void; onParse: () => void; toast?: string | null }) {
  return (
    <div className="space-y-3 rounded-4xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">Smart paste</p><h3 className="mt-1 text-lg font-semibold text-white">Paste the whole quote or email</h3></div><Clipboard className="h-5 w-5 text-cyan-300" /></div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="Example: 9.8kW system in California, cash $32,800, financed $43,750..." className="min-h-35 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-400/10" />
      <button type="button" onClick={onParse} className="btn-primary w-full">Auto-fill from pasted quote</button>
      <p className="text-xs leading-6 text-slate-400">Supported: system size, cash price, financed price, battery cost, annual production, warranty, brands, state, utility.</p>
      {toast ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100">{toast}</div> : null}
    </div>
  );
}

// ─── REPORT BLOCK ─────────────────────────────────────────────────────────────

function ReportBlock({ analysis, form, compact = false }: { analysis: ReturnType<typeof buildAnalysis>; form: QuoteForm; compact?: boolean }) {
  return (
    <div className={cn("rounded-4xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl", compact && "bg-white text-slate-900")}>
      <div className="flex items-start justify-between gap-6">
        <div><p className={cn("text-[10px] uppercase tracking-[0.4em]", compact ? "text-slate-500" : "text-cyan-300/80")}>Report preview</p><h3 className={cn("mt-2 text-2xl font-semibold tracking-tight", compact ? "text-slate-900" : "text-white")}>Solar Quote Sanity Check</h3><p className={cn("mt-2 text-sm leading-6", compact ? "text-slate-600" : "text-slate-400")}>{analysis.summary}</p></div>
        <div className={cn("rounded-3xl border px-4 py-3 text-right", compact ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}><p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Risk</p><p className={cn("mt-1 text-3xl font-semibold", compact ? "text-slate-900" : "text-white")}>{Math.round(analysis.totalRisk)}/100</p><p className={cn("mt-1 text-sm font-medium", compact ? analysis.verdictToneLight : analysis.verdictTone)}>{analysis.verdict}</p></div>
      </div>
      <div className={cn("mt-6 grid gap-4 md:grid-cols-2", compact ? "text-slate-800" : "text-white")}>
        <div className={cn("rounded-3xl border p-4", compact ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}><p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Snapshot</p><dl className="mt-4 space-y-3 text-sm"><Row label="ZIP" value={form.zipCode} compact={compact} /><Row label="System" value={`${formatDecimal(form.systemSize, 1)} kW`} compact={compact} /><Row label="$ / W" value={`${formatMoney(analysis.pricePerW, 2)}`} compact={compact} /><Row label="Dealer fee" value={`${formatDecimal(analysis.dealerFeePct, 1)}%`} compact={compact} /></dl></div>
        <div className={cn("rounded-3xl border p-4", compact ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}><p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Top concern</p><p className="mt-3 text-base font-semibold">{analysis.topConcern.title}</p><p className={cn("mt-2 text-sm leading-6", compact ? "text-slate-600" : "text-slate-300")}>{analysis.topConcern.detail}</p></div>
      </div>
      <div className={cn("mt-6 rounded-3xl border p-4", compact ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Risk breakdown</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <SummaryBlock label="Pricing" value={`${Math.round(analysis.pricingRisk)}/${analysis.maximums.pricing}`} accent={compact ? "bg-slate-900" : "bg-cyan-400"} />
          <SummaryBlock label="Financing" value={`${Math.round(analysis.financingRisk)}/${analysis.maximums.financing}`} accent={compact ? "bg-slate-900" : "bg-amber-400"} />
          <SummaryBlock label="Production" value={`${Math.round(analysis.productionRisk)}/${analysis.maximums.production}`} accent={compact ? "bg-slate-900" : "bg-rose-400"} />
        </div>
      </div>
      <div className={cn("mt-6 rounded-3xl border p-4", compact ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}><p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Next steps</p><ol className="mt-4 space-y-2 text-sm leading-6 text-slate-300">{analysis.nextSteps.map((s) => <li key={s} className={cn("rounded-2xl px-3 py-2", compact ? "bg-white text-slate-700" : "bg-white/5 text-slate-200")}>{s}</li>)}</ol></div>
    </div>
  );
}

// ─── CHART ────────────────────────────────────────────────────────────────────

function SavingsChart({ data }: { data: Array<{ year: number; base: number; inflated: number }> }) {
  return (
    <div className="h-60 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>
      <defs><linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} /><stop offset="95%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient><linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.35} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#222" /><XAxis dataKey="year" stroke="#444" fontSize={10} tickFormatter={(v) => `Yr ${v}`} /><YAxis stroke="#444" fontSize={10} tickFormatter={(v) => `$${v}`} />
      <RechartsTooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333", color: "#fff", fontSize: "11px" }} formatter={(value) => [`$${Number(value).toLocaleString()}`]} />
      <Area type="monotone" dataKey="base" stroke="#22d3ee" fill="url(#gB)" /><Area type="monotone" dataKey="inflated" stroke="#34d399" fill="url(#gI)" />
    </AreaChart></ResponsiveContainer></div>
  );
}

// ─── COMPARISON TABLE ─────────────────────────────────────────────────────────

function QuoteComparison({ quotes }: { quotes: SavedQuote[] }) {
  const sorted = [...quotes].sort((a, b) => a.analysis.totalRisk - b.analysis.totalRisk);
  const best = sorted[0];
  return (
    <div className="panel p-6">
      <h3 className="text-xl font-semibold text-white mb-6">Saved Quotes Comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-white/10"><th className="text-left py-3 text-slate-400">Quote</th><th className="text-right py-3 text-slate-400">Risk</th><th className="text-right py-3 text-slate-400">Cash</th><th className="text-right py-3 text-slate-400">$/W</th><th className="text-right py-3 text-slate-400">Gap</th></tr></thead>
          <tbody>{sorted.map((q) => <tr key={q.id} className={cn("border-b border-white/5", q.id === best.id && "bg-emerald-400/10")}><td className="py-3"><div className="flex items-center gap-2">{q.id === best.id && <span className="text-emerald-400">★</span>}<span className="text-white font-medium">{q.name}</span></div></td><td className="text-right py-3 font-semibold text-white">{Math.round(q.analysis.totalRisk)}</td><td className="text-right py-3 text-slate-300">{formatMoney(q.cashPrice)}</td><td className="text-right py-3 text-slate-300">{formatMoney(q.analysis.pricePerW, 2)}</td><td className="text-right py-3 text-slate-300">{formatMoney(q.analysis.financeGap)}</td></tr>)}</tbody>
        </table>
      </div>
      {best && <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4"><p className="text-sm font-semibold text-emerald-200">★ Best Value: {best.name}</p><p className="mt-2 text-sm text-emerald-100/80">Lowest risk ({Math.round(best.analysis.totalRisk)}/100) at {formatMoney(best.analysis.pricePerW, 2)}/W</p></div>}
    </div>
  );
}

// ─── KEYBOARD HINTS ───────────────────────────────────────────────────────────

function KeyboardHints() {
  return (
    <div className="fixed bottom-4 right-4 rounded-2xl border border-white/10 bg-black/80 p-4 text-xs text-slate-400 backdrop-blur-xl no-print z-50 hidden xl:block">
      <p className="mb-2 font-semibold text-white">Shortcuts</p>
      <div className="space-y-1"><div>⌘→ Next</div><div>⌘← Back</div><div>⌘P Print</div><div>⌘E Edit</div></div>
    </div>
  );
}

// ─── STEP COMPONENTS ─────────────────────────────────────────────────────────

function IntakeStep({ form, onChange, onParse, pasteText, setPasteText, parseToast, onAnalyze, errors }: {
  form: QuoteForm; onChange: <K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) => void; onParse: () => void; pasteText: string; setPasteText: (v: string) => void; parseToast: string | null; onAnalyze: () => void; errors: Partial<Record<keyof QuoteForm, string>>;
}) {
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [whatIfForm, setWhatIfForm] = useState<QuoteForm>(form);
  const whatIfAnalysis = useMemo(() => buildAnalysis(whatIfForm), [whatIfForm]);

  return (
    <div className="space-y-6">
      <SmartPastePanel value={pasteText} onChange={setPasteText} onParse={onParse} toast={parseToast} />
      <div className="panel p-6">
        <SectionTitle eyebrow="Step 1 — Intake" title="Enter the quote details." description="Compares pricing, financing, production, and battery against benchmarks." />
        <div className="mt-6"><FormProgress form={form} /></div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="ZIP code" hint="Location"><Input value={form.zipCode} onChange={(e) => onChange("zipCode", e.target.value)} /></Field>
          <Field label="State" hint="Benchmark"><Select value={form.state} onChange={(e) => onChange("state", e.target.value)}>{states.map((s) => <option key={s} value={s}>{stateProfiles[s].label}</option>)}</Select></Field>
          <Field label="Utility" hint="Grid"><Select value={form.utilityProvider} onChange={(e) => onChange("utilityProvider", e.target.value)}>{utilityProviders.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</Select></Field>
          <Field label="Utility rate" hint="$/kWh" tooltip="Use your utility average if unsure."><Input type="number" step="0.01" value={form.utilityRate} onChange={(e) => onChange("utilityRate", Number(e.target.value) || 0)} /></Field>
          <Field label="System size" hint="kW"><Input type="number" step="0.1" value={form.systemSize} onChange={(e) => onChange("systemSize", Number(e.target.value) || 0)} className={errors.systemSize ? "field-input-error" : ""} />{errors.systemSize && <p className="mt-1 text-xs text-rose-300">{errors.systemSize}</p>}</Field>
          <Field label="Warranty" hint="Years"><Input type="number" value={form.warrantyYears} onChange={(e) => onChange("warrantyYears", Number(e.target.value) || 0)} className={errors.warrantyYears ? "field-input-error" : ""} />{errors.warrantyYears && <p className="mt-1 text-xs text-rose-300">{errors.warrantyYears}</p>}</Field>
          <Field label="Cash price" hint="Installed"><Input type="number" value={form.cashPrice} onChange={(e) => onChange("cashPrice", Number(e.target.value) || 0)} className={errors.cashPrice ? "field-input-error" : ""} />{errors.cashPrice && <p className="mt-1 text-xs text-rose-300">{errors.cashPrice}</p>}</Field>
          <Field label="Financed price" hint="Loan"><Input type="number" value={form.financedPrice} onChange={(e) => onChange("financedPrice", Number(e.target.value) || 0)} className={errors.financedPrice ? "field-input-error" : ""} />{errors.financedPrice && <p className="mt-1 text-xs text-rose-300">{errors.financedPrice}</p>}</Field>
          <Field label="Monthly payment" hint="Loan"><Input type="number" value={form.monthlyPayment} onChange={(e) => onChange("monthlyPayment", Number(e.target.value) || 0)} /></Field>
          <Field label="Annual production" hint="kWh/yr"><Input type="number" value={form.annualProduction} onChange={(e) => onChange("annualProduction", Number(e.target.value) || 0)} className={errors.annualProduction ? "field-input-error" : ""} />{errors.annualProduction && <p className="mt-1 text-xs text-rose-300">{errors.annualProduction}</p>}</Field>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Panel brand"><Input value={form.panelBrand} onChange={(e) => onChange("panelBrand", e.target.value)} /></Field>
          <Field label="Inverter brand"><Input value={form.inverterBrand} onChange={(e) => onChange("inverterBrand", e.target.value)} /></Field>
          <Field label="Roof type"><Input value={form.roofType} onChange={(e) => onChange("roofType", e.target.value)} /></Field>
          <Field label="Net metering"><Input value={form.netMeteringType} onChange={(e) => onChange("netMeteringType", e.target.value)} /></Field>
        </div>
        <div className="mt-6 rounded-3xl border border-white/10 bg-black/15 p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-200">Battery included?</p><div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1"><ToggleButton active={form.batteryIncluded} onClick={() => onChange("batteryIncluded", true)}>Yes</ToggleButton><ToggleButton active={!form.batteryIncluded} onClick={() => onChange("batteryIncluded", false)}>No</ToggleButton></div></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Battery cost"><Input type="number" value={form.batteryCost} onChange={(e) => onChange("batteryCost", Number(e.target.value) || 0)} /></Field>
            <Field label="Battery purpose"><Select value={form.batteryPurpose} onChange={(e) => onChange("batteryPurpose", e.target.value)}><option>Backup first</option><option>Bill savings</option><option>Both</option><option>Unsure</option></Select></Field>
          </div>
        </div>

        {/* WHAT-IF MODE */}
        <div className="mt-6 rounded-3xl border border-purple-400/20 bg-purple-400/8 p-4">
          <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-purple-200">What-if mode</p><p className="text-xs text-purple-100/80 mt-1">Test different scenarios without changing your saved quote</p></div><ToggleButton active={showWhatIf} onClick={() => setShowWhatIf(!showWhatIf)}>{showWhatIf ? "Active" : "Off"}</ToggleButton></div>
          {showWhatIf && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="What-if cash price"><Input type="number" value={whatIfForm.cashPrice} onChange={(e) => setWhatIfForm({ ...whatIfForm, cashPrice: Number(e.target.value) || 0 })} /></Field>
                <Field label="What-if financed price"><Input type="number" value={whatIfForm.financedPrice} onChange={(e) => setWhatIfForm({ ...whatIfForm, financedPrice: Number(e.target.value) || 0 })} /></Field>
              </div>
              <div className="rounded-2xl bg-black/20 p-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-purple-300">Original risk:</p><p className="text-lg font-bold text-white mt-1">{Math.round(buildAnalysis(form).totalRisk)}</p></div>
                  <div><p className="text-purple-300">What-if risk:</p><p className="text-lg font-bold text-white mt-1">{Math.round(whatIfAnalysis.totalRisk)}</p></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="panel p-6 text-center">
        <p className="text-sm text-slate-400 mb-4">When you're ready, analyze the quote.</p>
        <button type="button" onClick={onAnalyze} className="btn-mega">Analyze This Quote <ArrowRight className="ml-3 h-5 w-5" /></button>
      </div>
    </div>
  );
}

function BreakdownStep({ analysis }: { analysis: ReturnType<typeof buildAnalysis> }) {
  return (
    <div className="space-y-6"><div className="panel p-6">
      <SectionTitle eyebrow="Step 2 — Breakdown" title="What the numbers say." description="The score is transparent, the benchmark is local, and the flags are tied to a next step." />
      <div className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center"><Gauge score={analysis.totalRisk} /><div className="space-y-4">
        <MeterBar label="Pricing pressure" value={analysis.pricingRisk} min={0} max={30} accent="from-cyan-400 to-sky-500" valueFormatter={(c) => `${Math.round(c)} / 30`} rangeFormatter={(c) => `${Math.round(c)}`} />
        <MeterBar label="Financing spread" value={analysis.financingRisk} min={0} max={25} accent="from-amber-300 to-orange-500" valueFormatter={(c) => `${Math.round(c)} / 25`} rangeFormatter={(c) => `${Math.round(c)}`} />
        <MeterBar label="Production realism" value={analysis.productionRisk} min={0} max={15} accent="from-rose-300 to-pink-500" valueFormatter={(c) => `${Math.round(c)} / 15`} rangeFormatter={(c) => `${Math.round(c)}`} />
      </div></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Cash price / W" value={`${formatMoney(analysis.pricePerW, 2)}/W`} hint="Benchmark check" />
        <MetricCard label="Finance gap" value={formatMoney(analysis.financeGap)} hint={`${formatDecimal(analysis.financeGapPct * 100, 1)}% premium`} />
        <MetricCard label="Dealer fee" value={`${formatDecimal(analysis.dealerFeePct, 1)}%`} hint="Hidden markup" />
        <MetricCard label="Fair range" value={`${formatMoney(analysis.fairInstallLow)} - ${formatMoney(analysis.fairInstallHigh)}`} hint="Market band" />
        <MetricCard label="Confidence" value={`${analysis.confidence}%`} hint="Data strength" />
        <MetricCard label="Verdict" value={analysis.verdict} hint={analysis.summary} />
      </div>
    </div></div>
  );
}

function PerformanceStep({ analysis }: { analysis: ReturnType<typeof buildAnalysis> }) {
  return (
    <div className="space-y-6"><div className="panel p-6">
      <SectionTitle eyebrow="Step 3 — Performance" title="Production and battery logic." description="Checks production realism and battery intent." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <MetricCard label="Expected production" value={`${formatWhole(analysis.expectedProductionLow)} - ${formatWhole(analysis.expectedProductionHigh)} kWh`} hint="Benchmark band" />
        <MetricCard label="Battery cost / kW" value={formatMoney(analysis.batteryCostPerKw, 0)} hint="Backup premium" />
        <MetricCard label="Battery ROI" value={analysis.batteryROIText} hint="Backup vs economics" />
        <MetricCard label="Market note" value={analysis.profile.note} hint={analysis.profile.label} />
      </div>
    </div></div>
  );
}

function FinancialStep({ analysis }: { analysis: ReturnType<typeof buildAnalysis> }) {
  return (
    <div className="space-y-6"><div className="panel p-6">
      <SectionTitle eyebrow="Step 4 — Financial" title="Bill offset and simple payback." description="How much of the quote is padded through financing." />
      <div className="mt-6"><SavingsChart data={analysis.chartData} /></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <MetricCard label="Annual savings" value={formatMoney(analysis.annualSavingsEstimate)} hint="Utility rate × production" />
        <MetricCard label="Simple payback" value={analysis.simplePaybackYears > 0 ? `${formatDecimal(analysis.simplePaybackYears, 1)} yr` : "n/a"} hint="Sanity check" />
        <MetricCard label="Cash vs financed" value={formatMoney(analysis.financeGap)} hint="Pressure-test this" />
        <MetricCard label="Dealer fee" value={`${formatDecimal(analysis.dealerFeePct, 1)}%`} hint="Hidden markup" />
      </div>
    </div></div>
  );
}

function AuditStep({ analysis, tone, setTone, report, copiedTone, onCopyTone, onPrint }: {
  analysis: ReturnType<typeof buildAnalysis>; tone: Tone; setTone: (t: Tone) => void; report: ReturnType<typeof buildReportData>; copiedTone: Tone | null; onCopyTone: (t: Tone) => void; onPrint: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="panel p-6"><SectionTitle eyebrow="Step 5 — Audit" title="The stuff worth pushing back on." description="Sorted by severity. Each flag has an action item." /><div className="mt-6"><RiskAuditCard analysis={analysis} /></div></div>
      <div className="panel p-6">
        <SectionTitle eyebrow="Negotiation kit" title="The message you can send today." description="Switch tone, copy, and send." />
        <div className="mt-6 flex flex-wrap gap-2">
          <ToggleButton active={tone === "polite"} onClick={() => { setTone("polite"); trackEvent('Tone', 'Selected', 'polite'); }}>Polite</ToggleButton>
          <ToggleButton active={tone === "firm"} onClick={() => { setTone("firm"); trackEvent('Tone', 'Selected', 'firm'); }}>Firm</ToggleButton>
          <ToggleButton active={tone === "skeptical"} onClick={() => { setTone("skeptical"); trackEvent('Tone', 'Selected', 'skeptical'); }}>Skeptical</ToggleButton>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tone} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }} className="mt-6 rounded-[28px] border border-white/10 bg-black/15 p-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Copy and send</p>
            <p className="mt-3 text-sm leading-7 text-slate-200">{report.negotiationScript}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => onCopyTone(tone)} className="btn-primary">{copiedTone === tone ? "Copied" : "Copy script"}</button>
              <button type="button" onClick={onPrint} className="btn-secondary">Print report</button>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4"><p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Email draft</p><pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-300 font-mono">{report.emailDraft}</pre></div>
      </div>
    </div>
  );
}

function BlueprintStep({ analysis, report, onRestart, onPrint }: {
  analysis: ReturnType<typeof buildAnalysis>; report: ReturnType<typeof buildReportData>; onRestart: () => void; onPrint: () => void;
}) {
  const checklist = buildQuoteChecklist();
  const questions = buildInstallerQuestions();
  const nextSteps = buildNextStepsAfterReview();
  return (
    <div className="space-y-6"><div className="panel-strong p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none"><Zap className="w-48 md:w-64 h-48 md:h-64 text-cyan-300" /></div>
      <div className="flex flex-col md:flex-row justify-between items-start gap-4"><div><p className="kicker">Step 6 — Blueprint</p><h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Official <span className="text-cyan-300">Blueprint</span></h2><p className="mt-2 text-[10px] font-mono text-cyan-300/80 uppercase tracking-widest">Ready for review</p></div><div className="text-right"><div className="text-[10px] font-mono text-slate-500 uppercase">Confidence</div><div className="text-sm font-bold text-white">{analysis.confidence}%</div></div></div>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="space-y-4"><ReportBlock analysis={analysis} form={report.form} compact /></div>
        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5"><p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">Checklist</p><ul className="mt-4 space-y-2 text-sm text-slate-300 leading-6">{checklist.map((item) => <li key={item}>• {item}</li>)}</ul></div>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5"><p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">Questions</p><ul className="mt-4 space-y-2 text-sm text-slate-300 leading-6">{questions.map((item) => <li key={item}>• {item}</li>)}</ul></div>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5"><p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">Next steps</p><ul className="mt-4 space-y-2 text-sm text-slate-300 leading-6">{nextSteps.map((item) => <li key={item}>• {item}</li>)}</ul></div>
        </div>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2 no-print"><button onClick={onPrint} className="btn-mega"><Download className="mr-2 h-4 w-4" />Print / Save PDF</button><button onClick={onRestart} className="btn-secondary"><RefreshCw className="mr-2 h-4 w-4" />Restart</button></div>
    </div></div>
  );
}

// ─── HERO ─────────────────────────────────────────────────────────────────────

function HeroSection({ analysis, onAnalyzeClick, onSampleClick, onPrint }: { analysis: ReturnType<typeof buildAnalysis>; onAnalyzeClick: () => void; onSampleClick: () => void; onPrint: () => void }) {
  return (
    <section className="grid gap-8 py-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-center xl:py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="space-y-6">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-slate-300">Quote defense system</div>
        <div className="max-w-3xl space-y-4"><h2 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">Paste the quote.<span className="block text-cyan-300">See the markup.</span></h2><p className="max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">See hidden markup, finance traps, production claims, and red flags before you sign.</p></div>
        <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={onAnalyzeClick} className="btn-primary">Inspect the quote</button><button type="button" onClick={onSampleClick} className="btn-secondary">Load sample</button><button type="button" onClick={onPrint} className="btn-secondary">Print report</button></div>
        <div className="grid gap-4 text-sm text-slate-400 sm:grid-cols-3"><p className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">Price per watt against benchmark.</p><p className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">Hidden financing costs visible.</p><p className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">Negotiation script ready.</p></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.97, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.08 }} className="rounded-[34px] border border-white/10 bg-white/6 p-6 shadow-[0_30px_100px_rgba(2,6,23,0.45)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-6"><div><p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">Live verdict</p><h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{analysis.verdict}</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{analysis.summary}</p></div><div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-right"><p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Confidence</p><p className="text-2xl font-semibold text-white">{analysis.confidence}%</p></div></div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center"><Gauge score={analysis.totalRisk} /><div className="space-y-4">
          <MeterBar label="Pricing" value={analysis.pricingRisk} min={0} max={30} accent="from-cyan-400 to-sky-500" valueFormatter={(c) => `${Math.round(c)} / 30`} rangeFormatter={(c) => `${Math.round(c)}`} />
          <MeterBar label="Financing" value={analysis.financingRisk} min={0} max={25} accent="from-amber-300 to-orange-500" valueFormatter={(c) => `${Math.round(c)} / 25`} rangeFormatter={(c) => `${Math.round(c)}`} />
          <MeterBar label="Production" value={analysis.productionRisk} min={0} max={15} accent="from-rose-300 to-pink-500" valueFormatter={(c) => `${Math.round(c)} / 15`} rangeFormatter={(c) => `${Math.round(c)}`} />
        </div></div>
        <div className="mt-6 rounded-3xl border border-white/10 bg-black/15 p-4"><div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Cash / finance gap" value={formatMoney(analysis.financeGap)} note={`${formatDecimal(analysis.financeGapPct * 100, 1)}% premium`} />
          <MiniStat label="State benchmark" value={`${formatMoney(analysis.profile.priceLow, 2)} - ${formatMoney(analysis.profile.priceHigh, 2)}/W`} note={analysis.profile.label} />
          <MiniStat label="Expected production" value={`${formatWhole(analysis.expectedProductionLow)} - ${formatWhole(analysis.expectedProductionHigh)} kWh`} note="Range check" />
        </div></div>
      </motion.div>
    </section>
  );
}

// ─── PAYMENT GATE ──────────────────────────────────────────────────────────────

function PaymentGate({
  codeInput,
  setCodeInput,
  codeError,
  setCodeError,
  onUnlock,
}: {
  codeInput: string;
  setCodeInput: (value: string) => void;
  codeError: boolean;
  setCodeError: (value: boolean) => void;
  onUnlock: () => void;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput === "SOLAR2026PRO") {
      localStorage.setItem("solar_access", "true");
      onUnlock();
    } else {
      setCodeError(true);
      setCodeInput("");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-slate-950 flex items-center justify-center px-6 py-16"
    >
      <div className="max-w-lg w-full space-y-8">
        {/* Logo & Title */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
              <ShieldCheck className="h-8 w-8" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">SOLAR QUOTE SANITY CHECK</h1>
          <p className="text-sm text-slate-400">Consumer Reports for solar quotes</p>
        </div>

        {/* Headline */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-white">Before You Sign a $25,000+ Solar Contract</h2>
          <p className="text-slate-300">Run this free forensic audit first.</p>
        </div>

        {/* Benefits */}
        <div className="space-y-3 bg-white/5 rounded-2xl border border-white/10 p-6">
          {[
            "Price per watt vs state benchmark",
            "Hidden dealer fee detection",
            "Negotiation script ready to send",
          ].map((benefit) => (
            <div key={benefit} className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-cyan-300" />
              </div>
              <p className="text-sm text-slate-200">{benefit}</p>
            </div>
          ))}
        </div>

        {/* Code Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value);
              if (codeError) setCodeError(false);
            }}
            placeholder="Enter access code"
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-all"
          />
          {codeError && (
            <p className="text-sm text-rose-300">Invalid code. Purchase access below.</p>
          )}
          <button
            type="submit"
            className="w-full bg-cyan-300 text-slate-950 font-bold py-3 rounded-lg hover:bg-cyan-200 transition-all"
          >
            Unlock Tool →
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-slate-500 font-medium">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Purchase Button */}
        <a
          href="https://suby.fi/YOUR_SOLAR_PRODUCT_LINK"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full border-2 border-cyan-300 text-cyan-300 font-bold py-4 rounded-full text-center hover:bg-cyan-300 hover:text-slate-950 transition-all"
        >
          Get Access — $49 →
        </a>

        {/* Trust Line */}
        <p className="text-center text-xs text-slate-500">
          🔒 One-time purchase · Lifetime access
        </p>
      </div>
    </motion.div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [hasAccess, setHasAccess] = useState(() => {
    try {
      if (localStorage.getItem("solar_access") === "true") return true;
      const params = new URLSearchParams(window.location.search);
      if (params.get("code") === "SOLAR2026PRO") return true;
    } catch {}
    return false;
  });
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);

  const [form, setForm] = useLocalStorage<QuoteForm>("solar-quote-form", INITIAL_FORM);
  const [step, setStep] = useLocalStorage<Step>("solar-quote-step", "intake");
  const [tone, setTone] = useLocalStorage<Tone>("solar-quote-tone", "firm");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedTone, setCopiedTone] = useState<Tone | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteToast, setPasteToast] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Partial<Record<keyof QuoteForm, string>>>({});
  const [savedQuotes, setSavedQuotes] = useLocalStorage<SavedQuote[]>("saved-quotes", []);
  const [saveToast, setSaveToast] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('theme', 'dark');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const analysis = useMemo(() => buildAnalysis(form), [form]);
  const report = useMemo(() => buildReportData(form, analysis, tone), [form, analysis, tone]);

  // ─── 11. Browser Tab Title
  useEffect(() => {
    document.title = `${analysis.verdict} (${Math.round(analysis.totalRisk)}/100) - Solar Quote Sanity Check`;
  }, [analysis]);

  // ─── 12. Theme Toggle
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light');
  }, [theme]);

  // ─── 7. Parse Share Link (once on mount)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = parseShareableLink(params);
    if (Object.keys(shared).length > 0) {
      setForm((prev) => ({ ...prev, ...shared }));
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 14. Register Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // ─── 10. Confetti on Clean Score
  useEffect(() => {
    if (analysis.totalRisk <= 20 && step === 'breakdown') {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#22d3ee', '#34d399', '#a5f3fc'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => { if (!copiedTone) return; const t = setTimeout(() => setCopiedTone(null), 1400); return () => clearTimeout(t); }, [copiedTone]);
  useEffect(() => { if (!pasteToast) return; const t = setTimeout(() => setPasteToast(null), 2200); return () => clearTimeout(t); }, [pasteToast]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  // ─── 3. Save Draft Toast — triggered from update, NOT from effect
  const update = <K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) => {
    setForm((c) => ({ ...c, [key]: value }));
    setSaveToast(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveToast(false), 2000);
  };

  const applyPastedQuote = () => {
    const parsed = parseQuoteText(pasteText);
    const keys = Object.keys(parsed) as Array<keyof ParsedQuote>;
    if (keys.length === 0) { setPasteToast("No fields detected. Try pasting the full email."); return; }
    setForm((c) => ({ ...c, ...parsed }));
    setPasteToast(`Auto-filled ${keys.length} field${keys.length !== 1 ? "s" : ""}.`);
    trackEvent('Quote', 'SmartPaste', keys.length.toString());
  };

  const handlePrint = () => window.print();

  const handleRestart = () => { setForm(INITIAL_FORM); setStep("intake"); setTone("firm"); setPasteText(""); setPasteToast(null); setIsProcessing(false); setValidationErrors({}); setShareLink(null); };

  const handleAnalyze = () => {
    const validation = validateQuoteForm(form);
    if (!validation.isValid) { setValidationErrors(validation.errors); trackEvent('Quote', 'ValidationFailed'); return; }
    setValidationErrors({});
    setIsProcessing(true);
    trackEvent('Quote', 'Analyzed', form.state);
  };

  const handleProcessingComplete = () => { setIsProcessing(false); setStep("breakdown"); trackEvent('Navigation', 'Step', 'breakdown'); };

  const handleNext = () => { const idx = getStepIndex(step); if (idx < STEP_ORDER.length - 1) { const next = STEP_ORDER[idx + 1]; setStep(next); trackEvent('Navigation', 'Step', next); } };
  const handleBack = () => { const idx = getStepIndex(step); if (idx > 0) { const prev = STEP_ORDER[idx - 1]; setStep(prev); trackEvent('Navigation', 'Step', prev); } };

  const handleCopyTone = async (t: Tone) => { try { await navigator.clipboard.writeText(TONE_COPY[t]); setCopiedTone(t); trackEvent('Tone', 'Copied', t); } catch { setCopiedTone(null); } };

  const jumpToForm = () => document.getElementById("quote-flow")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ─── 5. Save Quote for Comparison
  const saveCurrentQuote = () => {
    const newQ: SavedQuote = { ...form, id: crypto.randomUUID(), name: `Quote ${savedQuotes.length + 1}`, timestamp: Date.now(), analysis };
    setSavedQuotes([...savedQuotes, newQ]);
    trackEvent('Quote', 'Saved', newQ.name);
  };

  // ─── 7. Share Link
  const handleShare = () => { const link = generateShareableLink(form); navigator.clipboard.writeText(link); setShareLink(link); trackEvent('Quote', 'Shared'); };

  // ─── 1. Keyboard Shortcuts — AFTER all handler declarations
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'ArrowRight' && step !== 'blueprint') { e.preventDefault(); handleNext(); }
        if (e.key === 'ArrowLeft' && step !== 'intake') { e.preventDefault(); handleBack(); }
        if (e.key === 'p') { e.preventDefault(); handlePrint(); }
        if (e.key === 'e') { e.preventDefault(); jumpToForm(); }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const selectedUtility = utilityProviders.find((u) => u.name === form.utilityProvider) ?? utilityProviders[0];
  const showIntake = step === "intake" && !isProcessing;
  const showProcessing = isProcessing;
  const showAnalysis = step !== "intake" && !isProcessing;

  if (!hasAccess) {
    return (
      <PaymentGate
        codeInput={codeInput}
        setCodeInput={setCodeInput}
        codeError={codeError}
        setCodeError={setCodeError}
        onUnlock={() => setHasAccess(true)}
      />
    );
  }

  return (
    <main className="page-shell">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-15" />
      <div className="pointer-events-none absolute inset-0 bg-glow" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-500/18 blur-3xl bg-drift" />
      <div className="pointer-events-none absolute left-[-10%] top-24 h-80 w-80 rounded-full bg-amber-300/12 blur-3xl bg-drift [animation-delay:-4s]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-112 w-md rounded-full bg-indigo-500/20 blur-3xl bg-drift [animation-delay:-8s]" />

      <div className="relative z-10">
        <header className="page-container flex flex-wrap items-center justify-between gap-4 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 shadow-[0_0_40px_rgba(34,211,238,0.15)]"><ShieldCheck className="h-5 w-5" /></div>
            <div><p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Consumer Reports for solar quotes</p><h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Solar Quote Sanity Check</h1></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn-secondary px-3 py-2.5">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300">Live risk review</div>
            <button type="button" onClick={handlePrint} className="btn-primary"><FileText className="mr-2 h-4 w-4" />Print</button>
          </div>
        </header>

        <div className="page-container py-6">
          <div className="no-print flex gap-2 mb-8 md:mb-12">
            {STEP_ORDER.map((s, i) => <div key={s} className="flex-1"><div className={`h-1.5 rounded-full mb-2 transition-all duration-300 ${i <= getStepIndex(step) ? "bg-cyan-300" : "bg-white/10"}`} /><div className={`text-[8px] md:text-[10px] uppercase tracking-widest font-bold transition-colors duration-300 ${i <= getStepIndex(step) ? "text-cyan-300" : "text-slate-600"}`}>{stepLabels[s]}</div></div>)}
          </div>

          <HeroSection analysis={analysis} onAnalyzeClick={jumpToForm} onSampleClick={() => setForm(INITIAL_FORM)} onPrint={handlePrint} />

          <div id="quote-flow" className="mt-8">
            {showIntake && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-4xl mx-auto">
                <IntakeStep form={form} onChange={update} onParse={applyPastedQuote} pasteText={pasteText} setPasteText={setPasteText} parseToast={pasteToast} onAnalyze={handleAnalyze} errors={validationErrors} />
              </motion.div>
            )}

            {showProcessing && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto">
                <TerminalLoader messages={["Reading quote inputs...", "Benchmarking price per watt...", "Comparing finance spread...", "Checking production realism...", "Calculating battery logic...", "Generating negotiation plan..."]} onComplete={handleProcessingComplete} />
              </motion.div>
            )}

            {showAnalysis && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
                  <aside className="lg:sticky lg:top-6 lg:self-start no-print space-y-4">
                    <div className="panel p-5 space-y-4">
                      <p className="kicker">Context</p>
                      <div className="space-y-3">
                        <MetricCard label="State" value={stateProfiles[form.state]?.label ?? form.state} hint="Benchmark" />
                        <MetricCard label="Utility" value={selectedUtility.name} hint={selectedUtility.region} />
                        <MetricCard label="System" value={`${form.systemSize} kW`} hint="Size" />
                        <MetricCard label="Risk" value={`${Math.round(analysis.totalRisk)}/100`} hint={analysis.verdict} />
                      </div>
                      <div className="space-y-2">
                        <button onClick={saveCurrentQuote} className="btn-secondary w-full text-sm"><Star className="mr-2 h-3 w-3" />Save for comparison</button>
                        <button onClick={handleShare} className="btn-secondary w-full text-sm"><Share2 className="mr-2 h-3 w-3" />Copy share link</button>
                        {savedQuotes.length > 0 && <button onClick={() => exportToCSV(savedQuotes)} className="btn-secondary w-full text-sm"><Download className="mr-2 h-3 w-3" />Export CSV</button>}
                        <button onClick={handleRestart} className="btn-secondary w-full text-sm"><RefreshCw className="mr-2 h-3 w-3" />Start over</button>
                      </div>
                      {shareLink && <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3"><p className="text-xs text-cyan-200 mb-1">Link copied!</p><code className="block text-[10px] text-white font-mono break-all">{shareLink}</code></div>}
                    </div>
                  </aside>

                  <section className="space-y-6">
                    <AnimatePresence mode="wait">
                      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-6">
                        {step === "breakdown" && <BreakdownStep analysis={analysis} />}
                        {step === "performance" && <PerformanceStep analysis={analysis} />}
                        {step === "financial" && <FinancialStep analysis={analysis} />}
                        {step === "audit" && <AuditStep analysis={analysis} tone={tone} setTone={setTone} report={report} copiedTone={copiedTone} onCopyTone={handleCopyTone} onPrint={handlePrint} />}
                        {step === "blueprint" && <BlueprintStep analysis={analysis} report={report} onRestart={handleRestart} onPrint={handlePrint} />}
                      </motion.div>
                    </AnimatePresence>

                    {savedQuotes.length > 1 && <QuoteComparison quotes={savedQuotes} />}

                    <div className="flex gap-4 no-print pt-4">
                      <button onClick={handleBack} className="rounded-lg border border-white/10 px-6 py-4 font-bold hover:bg-white/5 transition-colors text-sm">BACK</button>
                      <button onClick={handleNext} disabled={step === "blueprint"} className={cn("flex-1 flex items-center justify-center rounded-lg font-bold transition-colors text-sm", step === "blueprint" ? "border border-white/10 text-slate-500 cursor-not-allowed" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200")}>{step === "blueprint" ? "Complete" : "NEXT"} <ArrowRight className="ml-2 h-5 w-5" /></button>
                    </div>
                  </section>

                  <aside className="lg:sticky lg:top-6 lg:self-start no-print space-y-4">
                    <div className="panel p-5 space-y-4">
                      <p className="kicker">Live summary</p>
                      <div className="space-y-3">
                        <MetricCard label="Risk" value={`${Math.round(analysis.totalRisk)}/100`} hint={analysis.verdict} />
                        <MetricCard label="Confidence" value={`${analysis.confidence}%`} hint="Data strength" />
                        <MetricCard label="Price / W" value={`${formatMoney(analysis.pricePerW, 2)}/W`} hint="Market" />
                        <MetricCard label="Battery" value={analysis.batteryROIText} hint="ROI check" />
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-black/15 p-4"><p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Quick take</p><p className="mt-3 text-sm leading-6 text-slate-300">{analysis.summary}</p></div>
                      <button onClick={jumpToForm} className="btn-secondary w-full text-sm">Edit quote details</button>
                    </div>
                    <div className="panel p-5"><p className="kicker">Why this matters</p><p className="mt-3 text-sm leading-6 text-slate-400">This is the moment most homeowners sign too quickly.</p><div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-400/8 p-4 text-sm leading-7 text-amber-100">If the quote feels expensive but you can't prove it, this tool gives you the proof.</div></div>
                  </aside>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <footer className="page-container mt-12 md:mt-20 text-center border-t border-white/5 pt-8 md:pt-12 pb-10">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] mb-4">Solar Quote Sanity Check // Engineering Verified</div>
          <p className="max-w-xl mx-auto text-[10px] text-slate-600 leading-relaxed uppercase">Disclaimer: Estimates based on benchmarks and user data. Confirm final decisions with qualified professionals.</p>
        </footer>
      </div>

      {/* 3. Save Draft Toast */}
      <AnimatePresence>
        {saveToast && step === 'intake' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-4 py-2 text-sm font-medium text-emerald-100 backdrop-blur-xl no-print">✓ Draft saved</motion.div>
        )}
      </AnimatePresence>

      {/* 1. Keyboard Hints */}
      <KeyboardHints />
    </main>
  );
}