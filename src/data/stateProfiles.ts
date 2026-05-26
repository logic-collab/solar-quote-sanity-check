import type { StateProfile } from "../types/quote";

export const stateProfiles: Record<string, StateProfile> = {
  CA: {
    label: "California",
    priceLow: 2.95,
    priceHigh: 3.8,
    productionLow: 1450,
    productionHigh: 1650,
    note: "High utility rates can justify premium pricing, but financing should still be crisp.",
  },
  AZ: {
    label: "Arizona",
    priceLow: 2.55,
    priceHigh: 3.15,
    productionLow: 1500,
    productionHigh: 1750,
    note: "Strong sun exposure usually supports healthy production numbers and tighter price pressure.",
  },
  TX: {
    label: "Texas",
    priceLow: 2.6,
    priceHigh: 3.2,
    productionLow: 1350,
    productionHigh: 1600,
    note: "Utility structure matters a lot here; the battery story can be real, but not always financial.",
  },
  FL: {
    label: "Florida",
    priceLow: 2.65,
    priceHigh: 3.2,
    productionLow: 1350,
    productionHigh: 1550,
    note: "Storm backup value can matter more than pure payback math.",
  },
  NY: {
    label: "New York",
    priceLow: 3.0,
    priceHigh: 4.0,
    productionLow: 1100,
    productionHigh: 1350,
    note: "Higher labor and permitting costs are common, but quotes still need a clean benchmark.",
  },
  CO: {
    label: "Colorado",
    priceLow: 2.75,
    priceHigh: 3.35,
    productionLow: 1300,
    productionHigh: 1550,
    note: "Often a good middle-ground market where the cash-to-finance gap should be easy to explain.",
  },
  WA: {
    label: "Washington",
    priceLow: 2.95,
    priceHigh: 3.7,
    productionLow: 950,
    productionHigh: 1150,
    note: "Lower solar yield means aggressive production claims should be treated with extra caution.",
  },
  NC: {
    label: "North Carolina",
    priceLow: 2.7,
    priceHigh: 3.25,
    productionLow: 1250,
    productionHigh: 1500,
    note: "A balanced market where itemization and financing clarity separate strong quotes from weak ones.",
  },
  NATIONAL: {
    label: "National",
    priceLow: 2.7,
    priceHigh: 3.2,
    productionLow: 1250,
    productionHigh: 1500,
    note: "Use this when the state is unknown. It is conservative enough to catch inflated quotes.",
  },
};

export const states = ["CA", "AZ", "TX", "FL", "NY", "CO", "WA", "NC", "NATIONAL"];