import type { UtilityProvider } from "../types/quote";

export const utilityProviders: UtilityProvider[] = [
  { name: "PG&E (California)", peak: 0.45, offPeak: 0.12, region: "California" },
  { name: "SCE (Southern California)", peak: 0.42, offPeak: 0.13, region: "California" },
  { name: "ConEd (New York)", peak: 0.38, offPeak: 0.1, region: "New York" },
  { name: "ERCOT (Texas Average)", peak: 0.28, offPeak: 0.08, region: "Texas" },
  { name: "FPL (Florida)", peak: 0.15, offPeak: 0.08, region: "Florida" },
  { name: "Dominion Energy", peak: 0.18, offPeak: 0.07, region: "Virginia / Southeast" },
  { name: "Duke Energy", peak: 0.2, offPeak: 0.08, region: "Carolinas / Midwest" },
  { name: "National Grid", peak: 0.32, offPeak: 0.11, region: "Northeast" },
  { name: "Xcel Energy", peak: 0.22, offPeak: 0.07, region: "Mountain West" },
  { name: "Generic / National Average", peak: 0.25, offPeak: 0.09, region: "National" },
];