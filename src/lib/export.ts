import type { SavedQuote } from "../types/quote";

export function exportToCSV(quotes: SavedQuote[]) {
  const headers = [
    'Quote Name',
    'Date',
    'State',
    'System Size (kW)',
    'Cash Price',
    'Financed Price',
    'Price per Watt',
    'Finance Gap',
    'Dealer Fee %',
    'Risk Score',
    'Verdict',
    'Annual Production',
    'Simple Payback (years)',
  ];

  const rows = quotes.map(q => [
    `"${q.name}"`,
    new Date(q.timestamp).toLocaleDateString(),
    q.state,
    q.systemSize,
    q.cashPrice,
    q.financedPrice,
    q.analysis.pricePerW.toFixed(2),
    q.analysis.financeGap,
    q.analysis.dealerFeePct.toFixed(1),
    Math.round(q.analysis.totalRisk),
    `"${q.analysis.verdict}"`,
    q.annualProduction,
    q.analysis.simplePaybackYears.toFixed(1),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `solar-quotes-comparison-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}