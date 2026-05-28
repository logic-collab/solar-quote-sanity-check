# Solar Quote Sanity Check — Forensic Solar Quote Analysis

> Interactive tool that helps homeowners analyze, compare, and verify solar installation quotes — catching hidden costs and inflated pricing before signing.

**Stack:** React · TypeScript · Vite · Tailwind CSS

**Status:** Active development

---

## Overview

Solar installers have a massive information advantage over homeowners. The Solar Quote Sanity Check closes that gap. Enter details from one or multiple solar quotes, and the tool analyzes pricing, equipment, financing terms, and installation line items — flagging anything that doesn't add up.

---

## Key Features

### 🔍 Quote Forensic Analysis
Upload or enter quote details and the tool scans for:
- Inflated equipment pricing vs. market rates
- Unnecessary panel upgrades
- Hidden financing fees and dealer fees
- Overpriced labor line items
- Missing warranty details
- Lease vs. buy cost comparisons over 25 years

### 📊 Multi-Quote Comparison
Side-by-side comparison of up to 5 quotes with:
- Per-watt pricing breakdown
- Equipment quality scoring
- Installer reputation cross-reference
- Total 25-year cost projection

### 📈 Payback Period Calculator
Real payback calculation using:
- Your actual utility rate (not national averages)
- Local net metering policies
- Degradation rates
- Electricity inflation projections
- Available tax credits and incentives

### ⚠️ Red Flag Detector
Automatically flags common solar sales tactics:
- "Free solar" lease traps
- Inflated utility rate projections
- Missing production guarantees
- Dealer fee financing that eats equity
- "You qualify for" pressure tactics

---

## Tech Stack

| Category | Technology |
|---|---|
| **Build Tool** | Vite |
| **Language** | TypeScript |
| **UI** | React, Tailwind CSS |
| **Linting** | ESLint with TypeScript |

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/logic-collab/solar-quote-sanity-check.git
cd solar-quote-sanity-check

# 2. Install dependencies
npm install

# 3. Run development server
npm run dev
```

---

## Related Repositories

- [solarlogic](https://github.com/logic-collab/solarlogic) — Main EV & solar intelligence platform
- [ev-command-center](https://github.com/logic-collab/ev-command-center) — Interactive EV ownership dashboard

---

**Built by Logic Forge · Lagos, Nigeria**
