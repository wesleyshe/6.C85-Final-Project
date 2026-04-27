// ============ CONSTANTS ============
const ACTUAL_PRICE = 847000;
const MEDIAN_PRICE = 785000;

// ============ MEDIAN SALE PRICE LOOKUP ============
// Keys: district → type → bedrooms (1, 2, 3, 4 = "4+")
// Calibrated to ~2023–2024 Boston neighborhood medians (Zillow / Redfin / MLS-derived).
// Where district × type × bed-count is a thin or essentially nonexistent market
// (e.g. 1BR single-family in Back Bay, 4BR condo in Dorchester), the value is an
// educated guess flagged in the README of this file (see comment block below).
const medianPrices = {
  backbay: {
    condo:  { 1:  750000, 2: 1400000, 3: 2500000, 4: 4500000 },
    single: { 1: 1500000, 2: 2500000, 3: 4000000, 4: 7000000 },
    multi:  { 1: 1200000, 2: 2000000, 3: 3500000, 4: 5000000 }
  },
  southboston: {
    condo:  { 1: 550000, 2:  800000, 3: 1100000, 4: 1500000 },
    single: { 1: 700000, 2:  950000, 3: 1300000, 4: 1800000 },
    multi:  { 1: 650000, 2: 1100000, 3: 1500000, 4: 2000000 }
  },
  dorchester: {
    condo:  { 1: 400000, 2: 525000, 3: 650000, 4:  800000 },
    single: { 1: 450000, 2: 600000, 3: 750000, 4:  900000 },
    multi:  { 1: 500000, 2: 750000, 3: 950000, 4: 1150000 }
  },
  jp: {
    condo:  { 1: 475000, 2: 650000, 3:  850000, 4: 1050000 },
    single: { 1: 650000, 2: 850000, 3: 1100000, 4: 1400000 },
    multi:  { 1: 700000, 2: 950000, 3: 1200000, 4: 1500000 }
  },
  eastboston: {
    condo:  { 1: 525000, 2: 700000, 3:  850000, 4: 1050000 },
    single: { 1: 500000, 2: 650000, 3:  800000, 4:  950000 },
    multi:  { 1: 575000, 2: 800000, 3: 1000000, 4: 1300000 }
  }
};

// ============ MEDIAN PRICE / SQFT LOOKUP (2014 vs 2024) ============
// Used by Slide 10's "Same budget, shrinking home" iso comparison.
// 2014 is chosen as the post-financial-crisis recovery anchor — a market
// low point before the 2017–2024 run-up.
//
// All values are educated guesses calibrated to publicly reported Boston
// neighborhood medians (Zillow / Redfin / MAPC ~2014 and ~2023–24). At the
// district × type granularity, no single authoritative published number
// exists, so every cell here is approximate. Rough heuristics used:
//   - condo $/sqft is the most reliable anchor (most sold, most reported)
//   - single-family $/sqft is roughly 0.75–1.15× the condo number
//     (higher in scarce-detached areas, lower in dense areas)
//   - multi-family $/sqft is roughly 0.60–0.75× the condo number
//     (more total sqft per transaction → lower per-sqft)
//   - 2024 ≈ 1.7×–2.3× 2014 (Boston roughly doubled in this period;
//     East Boston and South Boston ran the hottest)
const medianPpsf = {
  backbay: {
    condo:  { 2014:  750, 2024: 1400 },
    single: { 2014:  900, 2024: 1700 },
    multi:  { 2014:  700, 2024: 1300 }
  },
  southboston: {
    condo:  { 2014: 475, 2024:  900 },
    single: { 2014: 525, 2024: 1000 },
    multi:  { 2014: 400, 2024:  800 }
  },
  dorchester: {
    condo:  { 2014: 300, 2024: 525 },
    single: { 2014: 240, 2024: 425 },
    multi:  { 2014: 200, 2024: 375 }
  },
  jp: {
    condo:  { 2014: 375, 2024: 650 },
    single: { 2014: 350, 2024: 600 },
    multi:  { 2014: 280, 2024: 500 }
  },
  eastboston: {
    condo:  { 2014: 310, 2024: 700 },
    single: { 2014: 275, 2024: 575 },
    multi:  { 2014: 230, 2024: 525 }
  }
};

// Maps total sqft to a bedroom-count label (Boston market norms).
function bedroomFromSqft(sqft) {
  if (sqft < 550)  return 'Studio';
  if (sqft < 800)  return '1BR';
  if (sqft < 1100) return '2BR';
  if (sqft < 1500) return '3BR';
  if (sqft < 2200) return '4BR';
  return '5BR+';
}

/*
  Reliability notes for medianPrices (which entries are educated guesses):

  HIGH CONFIDENCE (calibrated against published 2023–24 neighborhood medians):
    - All "condo, 2BR" entries across the 5 districts (the most reported number).
    - "single, 3BR" for Dorchester, JP, East Boston, South Boston.
    - "multi, 3BR" (the canonical Boston triple-decker by-unit count) for Dorchester, JP, East Boston, South Boston.

  MEDIUM CONFIDENCE (interpolated/extrapolated from the 2BR + 3BR anchors):
    - All other condo bedrooms (1BR, 3BR, 4BR) in all 5 districts.
    - "single, 2BR" and "single, 4BR" in South Boston, Dorchester, JP, East Boston.
    - "multi, 2BR" and "multi, 4BR" in South Boston, Dorchester, JP, East Boston.

  EDUCATED GUESSES (thin or essentially nonexistent markets — flag these in copy):
    - backbay.single.* — Back Bay has very few "single family" detached homes;
      most are converted brownstones/townhouses. All 4 bedroom counts are guesses.
    - backbay.multi.*  — multi-family is rare in Back Bay; all 4 are guesses.
    - backbay.condo.4  — 4+ BR condos exist but transactions are rare; guess.
    - *.single.1 (all districts) — 1BR single-family homes are an unusual category;
      treat as approximate floor.
    - *.multi.1  (all districts) — 1BR triple-decker units sold as a whole building
      are rare; numbers reflect smallest-unit duplex/condo-style sales.
    - dorchester.condo.4, eastboston.single.4 — 4+BR in these submarkets is thin.
*/

// ============ NEIGHBORHOOD BUYER MIX ============

const neighborhoodMix = {
  "Allston": {
    "total": 1642,
    "nonInvestor": 1170,
    "small": 132,
    "medium": 150,
    "large": 79,
    "institutional": 111
  },
  "Back Bay": {
    "total": 3970,
    "nonInvestor": 3452,
    "small": 216,
    "medium": 114,
    "large": 118,
    "institutional": 70
  },
  "Beacon Hill": {
    "total": 2076,
    "nonInvestor": 1822,
    "small": 131,
    "medium": 67,
    "large": 42,
    "institutional": 14
  },
  "Brighton": {
    "total": 4034,
    "nonInvestor": 3258,
    "small": 311,
    "medium": 237,
    "large": 156,
    "institutional": 72
  },
  "Charlestown": {
    "total": 3977,
    "nonInvestor": 3626,
    "small": 175,
    "medium": 90,
    "large": 44,
    "institutional": 42
  },
  "Chinatown": {
    "total": 157,
    "nonInvestor": 129,
    "small": 7,
    "medium": 11,
    "large": 3,
    "institutional": 7
  },
  "Dorchester": {
    "total": 10261,
    "nonInvestor": 7724,
    "small": 660,
    "medium": 575,
    "large": 486,
    "institutional": 816
  },
  "Downtown": {
    "total": 2845,
    "nonInvestor": 2486,
    "small": 169,
    "medium": 96,
    "large": 50,
    "institutional": 44
  },
  "East Boston": {
    "total": 3518,
    "nonInvestor": 2766,
    "small": 226,
    "medium": 202,
    "large": 113,
    "institutional": 211
  },
  "Fenway": {
    "total": 2034,
    "nonInvestor": 1523,
    "small": 142,
    "medium": 116,
    "large": 86,
    "institutional": 167
  },
  "Hyde Park": {
    "total": 3147,
    "nonInvestor": 2617,
    "small": 100,
    "medium": 110,
    "large": 72,
    "institutional": 248
  },
  "Jamaica Plain": {
    "total": 5266,
    "nonInvestor": 4729,
    "small": 200,
    "medium": 143,
    "large": 96,
    "institutional": 98
  },
  "Longwood": {
    "total": 286,
    "nonInvestor": 208,
    "small": 16,
    "medium": 11,
    "large": 10,
    "institutional": 41
  },
  "Mattapan": {
    "total": 1608,
    "nonInvestor": 1209,
    "small": 71,
    "medium": 54,
    "large": 79,
    "institutional": 195
  },
  "Mission Hill": {
    "total": 415,
    "nonInvestor": 314,
    "small": 34,
    "medium": 23,
    "large": 22,
    "institutional": 22
  },
  "North End": {
    "total": 1644,
    "nonInvestor": 1460,
    "small": 92,
    "medium": 57,
    "large": 24,
    "institutional": 11
  },
  "Roslindale": {
    "total": 2896,
    "nonInvestor": 2556,
    "small": 102,
    "medium": 77,
    "large": 60,
    "institutional": 101
  },
  "Roxbury": {
    "total": 3046,
    "nonInvestor": 2068,
    "small": 219,
    "medium": 247,
    "large": 152,
    "institutional": 360
  },
  "South Boston": {
    "total": 7627,
    "nonInvestor": 6653,
    "small": 435,
    "medium": 289,
    "large": 155,
    "institutional": 95
  },
  "South Boston Waterfront": {
    "total": 725,
    "nonInvestor": 676,
    "small": 27,
    "medium": 19,
    "large": 2,
    "institutional": 1
  },
  "South End": {
    "total": 5810,
    "nonInvestor": 5259,
    "small": 234,
    "medium": 153,
    "large": 104,
    "institutional": 60
  },
  "West End": {
    "total": 543,
    "nonInvestor": 489,
    "small": 27,
    "medium": 19,
    "large": 4,
    "institutional": 4
  },
  "West Roxbury": {
    "total": 3844,
    "nonInvestor": 3383,
    "small": 161,
    "medium": 125,
    "large": 62,
    "institutional": 113
  }
};

// ============ CITYWIDE BUYER MIX (2018–2022) ============
// Source: City of Boston / MAPC, Residential Sales Data 2000–2023
// (A2_EDA_Residential.csv), buyer entity flags, filtered to 2018–2022.
// n = 9,558 transactions. Categories are mutually exclusive:
//   Individual = no LLC, trust, business, bank, or GSE flag
//   LLC/Corp   = buyer_llc_ind == 1
//   Trust      = buyer_trst_ind == 1
//   Other      = buyer_bus_ind, buyer_bnk_ind, or buyer_gse_ind == 1
const citywideMix = {
  individual: 78,
  llc: 13,
  trust: 8,
  other: 1
};

// Neighborhood pills are kept for context callouts but share the same
// citywide buyer breakdown — the residential sales dataset does not have
// enough per-neighborhood transactions to compute reliable splits.
// Corporate *ownership* rates per neighborhood are shown on the map slide.
const neighborhoodCallouts = {
  'Dorchester': 'Citywide, <span>1 in 5 buyers</span> is an LLC, trust, or corporate entity.',
  'Roxbury':    'Citywide, <span>1 in 5 buyers</span> is an LLC, trust, or corporate entity.',
  'South Boston': 'Citywide, <span>1 in 5 buyers</span> is an LLC, trust, or corporate entity.',
  'JP':         'Citywide, <span>1 in 5 buyers</span> is an LLC, trust, or corporate entity.'
};

// const neighborhoodMix = {
//   'Dorchester': {
//     individual: 42,
//     llc: 31,
//     trust: 15,
//     investor: 12,
//     callout: 'In <span>Dorchester</span>, <span>1 in 3 buyers</span> is a corporate entity.'
//   },
//   'Roxbury': {
//     individual: 39,
//     llc: 34,
//     trust: 14,
//     investor: 13,
//     callout: 'In <span>Roxbury</span>, corporate buyers make up an even larger share of the market.'
//   },
//   'South Boston': {
//     individual: 45,
//     llc: 27,
//     trust: 13,
//     investor: 15,
//     callout: 'In <span>South Boston</span>, individual buyers remain the biggest group, but investor presence is still substantial.'
//   },
//   'JP': {
//     individual: 48,
//     llc: 24,
//     trust: 16,
//     investor: 12,
//     callout: 'In <span>JP</span>, the buyer mix looks somewhat more resident-heavy, though non-individual ownership remains visible.'
//   }
// };

// ============ CORP OWNERSHIP CSV DATA ============
const RAW_CORP = `Neighborhood,Year,own_occ_rate,corp_own_rate
Allston,2004,0.29,0.07
Allston,2005,0.3,0.07
Allston,2006,0.29,0.08
Allston,2007,0.31,0.08
Allston,2008,0.31,0.09
Allston,2009,0.31,0.09
Allston,2010,0.3,0.09
Allston,2011,0.3,0.1
Allston,2012,0.28,0.1
Allston,2013,0.27,0.11
Allston,2014,0.26,0.12
Allston,2015,0.25,0.13
Allston,2016,0.24,0.14
Allston,2017,0.24,0.16
Allston,2018,0.23,0.17
Allston,2019,0.23,0.18
Allston,2020,0.22,0.22
Allston,2021,0.22,0.24
Allston,2022,0.23,0.25
Allston,2023,0.23,0.28
Allston,2024,0.22,0.3
Beacon Hill,2004,0.34,0.05
Beacon Hill,2005,0.34,0.06
Beacon Hill,2006,0.32,0.06
Beacon Hill,2007,0.33,0.07
Beacon Hill,2008,0.33,0.07
Beacon Hill,2009,0.32,0.08
Beacon Hill,2010,0.32,0.07
Beacon Hill,2011,0.3,0.07
Beacon Hill,2012,0.29,0.08
Beacon Hill,2013,0.29,0.08
Beacon Hill,2014,0.28,0.09
Beacon Hill,2015,0.27,0.1
Beacon Hill,2016,0.26,0.11
Beacon Hill,2017,0.25,0.12
Beacon Hill,2018,0.25,0.14
Beacon Hill,2019,0.24,0.15
Beacon Hill,2020,0.24,0.18
Beacon Hill,2021,0.23,0.2
Beacon Hill,2022,0.23,0.21
Beacon Hill,2023,0.22,0.23
Beacon Hill,2024,0.22,0.25
Brighton,2004,0.33,0.06
Brighton,2005,0.33,0.06
Brighton,2006,0.32,0.07
Brighton,2007,0.32,0.07
Brighton,2008,0.33,0.08
Brighton,2009,0.32,0.08
Brighton,2010,0.31,0.09
Brighton,2011,0.31,0.09
Brighton,2012,0.3,0.1
Brighton,2013,0.29,0.11
Brighton,2014,0.27,0.12
Brighton,2015,0.26,0.13
Brighton,2016,0.25,0.14
Brighton,2017,0.24,0.15
Brighton,2018,0.23,0.16
Brighton,2019,0.22,0.17
Brighton,2020,0.22,0.2
Brighton,2021,0.22,0.22
Brighton,2022,0.22,0.23
Brighton,2023,0.22,0.25
Brighton,2024,0.21,0.27
Charlestown,2004,0.38,0.07
Charlestown,2005,0.37,0.08
Charlestown,2006,0.37,0.08
Charlestown,2007,0.37,0.09
Charlestown,2008,0.37,0.09
Charlestown,2009,0.37,0.1
Charlestown,2010,0.36,0.1
Charlestown,2011,0.35,0.1
Charlestown,2012,0.34,0.11
Charlestown,2013,0.33,0.12
Charlestown,2014,0.32,0.13
Charlestown,2015,0.31,0.15
Charlestown,2016,0.3,0.16
Charlestown,2017,0.29,0.17
Charlestown,2018,0.28,0.19
Charlestown,2019,0.28,0.2
Charlestown,2020,0.27,0.22
Charlestown,2021,0.27,0.24
Charlestown,2022,0.27,0.25
Charlestown,2023,0.27,0.28
Charlestown,2024,0.26,0.29
Chinatown,2004,0.14,0.09
Chinatown,2005,0.14,0.09
Chinatown,2006,0.14,0.1
Chinatown,2007,0.14,0.1
Chinatown,2008,0.14,0.1
Chinatown,2009,0.14,0.11
Chinatown,2010,0.14,0.11
Chinatown,2011,0.13,0.12
Chinatown,2012,0.13,0.12
Chinatown,2013,0.13,0.13
Chinatown,2014,0.12,0.14
Chinatown,2015,0.12,0.15
Chinatown,2016,0.12,0.16
Chinatown,2017,0.11,0.17
Chinatown,2018,0.11,0.18
Chinatown,2019,0.11,0.19
Chinatown,2020,0.11,0.21
Chinatown,2021,0.1,0.22
Chinatown,2022,0.1,0.22
Chinatown,2023,0.1,0.24
Chinatown,2024,0.1,0.25
Dorchester,2004,0.29,0.06
Dorchester,2005,0.29,0.06
Dorchester,2006,0.28,0.06
Dorchester,2007,0.29,0.07
Dorchester,2008,0.29,0.07
Dorchester,2009,0.28,0.07
Dorchester,2010,0.28,0.07
Dorchester,2011,0.28,0.07
Dorchester,2012,0.27,0.08
Dorchester,2013,0.26,0.08
Dorchester,2014,0.26,0.09
Dorchester,2015,0.25,0.1
Dorchester,2016,0.25,0.1
Dorchester,2017,0.24,0.11
Dorchester,2018,0.24,0.12
Dorchester,2019,0.23,0.13
Dorchester,2020,0.23,0.15
Dorchester,2021,0.23,0.16
Dorchester,2022,0.23,0.17
Dorchester,2023,0.22,0.18
Dorchester,2024,0.22,0.19
Downtown,2004,0.16,0.11
Downtown,2005,0.16,0.11
Downtown,2006,0.16,0.12
Downtown,2007,0.16,0.12
Downtown,2008,0.16,0.12
Downtown,2009,0.16,0.13
Downtown,2010,0.16,0.13
Downtown,2011,0.15,0.13
Downtown,2012,0.15,0.14
Downtown,2013,0.14,0.14
Downtown,2014,0.14,0.15
Downtown,2015,0.13,0.16
Downtown,2016,0.13,0.17
Downtown,2017,0.12,0.18
Downtown,2018,0.12,0.2
Downtown,2019,0.12,0.21
Downtown,2020,0.11,0.24
Downtown,2021,0.11,0.26
Downtown,2022,0.11,0.26
Downtown,2023,0.11,0.28
Downtown,2024,0.11,0.3
East Boston,2004,0.27,0.05
East Boston,2005,0.27,0.06
East Boston,2006,0.26,0.06
East Boston,2007,0.26,0.06
East Boston,2008,0.27,0.07
East Boston,2009,0.26,0.07
East Boston,2010,0.25,0.07
East Boston,2011,0.25,0.07
East Boston,2012,0.24,0.08
East Boston,2013,0.24,0.08
East Boston,2014,0.23,0.09
East Boston,2015,0.22,0.1
East Boston,2016,0.21,0.12
East Boston,2017,0.21,0.14
East Boston,2018,0.2,0.16
East Boston,2019,0.19,0.18
East Boston,2020,0.19,0.22
East Boston,2021,0.18,0.24
East Boston,2022,0.18,0.25
East Boston,2023,0.18,0.28
East Boston,2024,0.18,0.3
Fenway,2004,0.1,0.09
Fenway,2005,0.1,0.09
Fenway,2006,0.09,0.1
Fenway,2007,0.1,0.1
Fenway,2008,0.1,0.11
Fenway,2009,0.1,0.11
Fenway,2010,0.09,0.11
Fenway,2011,0.09,0.12
Fenway,2012,0.09,0.13
Fenway,2013,0.09,0.13
Fenway,2014,0.08,0.15
Fenway,2015,0.08,0.17
Fenway,2016,0.07,0.19
Fenway,2017,0.07,0.2
Fenway,2018,0.07,0.23
Fenway,2019,0.06,0.24
Fenway,2020,0.06,0.28
Fenway,2021,0.06,0.3
Fenway,2022,0.06,0.31
Fenway,2023,0.06,0.33
Fenway,2024,0.06,0.35
Hyde Park,2004,0.49,0.04
Hyde Park,2005,0.49,0.04
Hyde Park,2006,0.48,0.04
Hyde Park,2007,0.48,0.04
Hyde Park,2008,0.49,0.05
Hyde Park,2009,0.48,0.05
Hyde Park,2010,0.47,0.05
Hyde Park,2011,0.47,0.05
Hyde Park,2012,0.46,0.05
Hyde Park,2013,0.45,0.06
Hyde Park,2014,0.44,0.06
Hyde Park,2015,0.43,0.06
Hyde Park,2016,0.42,0.07
Hyde Park,2017,0.42,0.07
Hyde Park,2018,0.41,0.08
Hyde Park,2019,0.41,0.08
Hyde Park,2020,0.41,0.09
Hyde Park,2021,0.4,0.1
Hyde Park,2022,0.4,0.1
Hyde Park,2023,0.4,0.11
Hyde Park,2024,0.4,0.11
Jamaica Plain,2004,0.33,0.05
Jamaica Plain,2005,0.33,0.05
Jamaica Plain,2006,0.32,0.05
Jamaica Plain,2007,0.33,0.06
Jamaica Plain,2008,0.33,0.06
Jamaica Plain,2009,0.32,0.06
Jamaica Plain,2010,0.31,0.07
Jamaica Plain,2011,0.31,0.07
Jamaica Plain,2012,0.3,0.07
Jamaica Plain,2013,0.29,0.08
Jamaica Plain,2014,0.28,0.09
Jamaica Plain,2015,0.27,0.1
Jamaica Plain,2016,0.27,0.11
Jamaica Plain,2017,0.26,0.12
Jamaica Plain,2018,0.25,0.13
Jamaica Plain,2019,0.25,0.14
Jamaica Plain,2020,0.24,0.17
Jamaica Plain,2021,0.24,0.18
Jamaica Plain,2022,0.24,0.19
Jamaica Plain,2023,0.23,0.21
Jamaica Plain,2024,0.23,0.22
Longwood,2004,0.05,0.09
Longwood,2005,0.05,0.09
Longwood,2006,0.05,0.1
Longwood,2007,0.05,0.1
Longwood,2008,0.05,0.1
Longwood,2009,0.05,0.11
Longwood,2010,0.05,0.11
Longwood,2011,0.05,0.12
Longwood,2012,0.05,0.13
Longwood,2013,0.05,0.14
Longwood,2014,0.04,0.15
Longwood,2015,0.04,0.17
Longwood,2016,0.04,0.18
Longwood,2017,0.04,0.19
Longwood,2018,0.04,0.21
Longwood,2019,0.04,0.22
Longwood,2020,0.04,0.25
Longwood,2021,0.03,0.27
Longwood,2022,0.03,0.28
Longwood,2023,0.03,0.3
Longwood,2024,0.03,0.32
Mattapan,2004,0.39,0.04
Mattapan,2005,0.39,0.04
Mattapan,2006,0.38,0.04
Mattapan,2007,0.38,0.04
Mattapan,2008,0.38,0.05
Mattapan,2009,0.38,0.05
Mattapan,2010,0.38,0.05
Mattapan,2011,0.37,0.05
Mattapan,2012,0.37,0.06
Mattapan,2013,0.36,0.06
Mattapan,2014,0.35,0.07
Mattapan,2015,0.35,0.07
Mattapan,2016,0.34,0.08
Mattapan,2017,0.34,0.08
Mattapan,2018,0.34,0.09
Mattapan,2019,0.33,0.09
Mattapan,2020,0.33,0.11
Mattapan,2021,0.32,0.12
Mattapan,2022,0.32,0.12
Mattapan,2023,0.32,0.13
Mattapan,2024,0.32,0.13
North End,2004,0.3,0.06
North End,2005,0.3,0.06
North End,2006,0.28,0.07
North End,2007,0.29,0.07
North End,2008,0.29,0.08
North End,2009,0.29,0.08
North End,2010,0.28,0.08
North End,2011,0.27,0.09
North End,2012,0.27,0.1
North End,2013,0.26,0.1
North End,2014,0.25,0.11
North End,2015,0.24,0.13
North End,2016,0.24,0.14
North End,2017,0.23,0.15
North End,2018,0.22,0.17
North End,2019,0.22,0.18
North End,2020,0.21,0.21
North End,2021,0.21,0.23
North End,2022,0.2,0.24
North End,2023,0.2,0.26
North End,2024,0.2,0.28
Roslindale,2004,0.43,0.04
Roslindale,2005,0.43,0.04
Roslindale,2006,0.42,0.04
Roslindale,2007,0.42,0.04
Roslindale,2008,0.42,0.05
Roslindale,2009,0.42,0.05
Roslindale,2010,0.41,0.05
Roslindale,2011,0.41,0.05
Roslindale,2012,0.4,0.06
Roslindale,2013,0.39,0.06
Roslindale,2014,0.38,0.07
Roslindale,2015,0.38,0.07
Roslindale,2016,0.37,0.08
Roslindale,2017,0.36,0.09
Roslindale,2018,0.36,0.09
Roslindale,2019,0.35,0.1
Roslindale,2020,0.35,0.12
Roslindale,2021,0.35,0.13
Roslindale,2022,0.35,0.13
Roslindale,2023,0.35,0.14
Roslindale,2024,0.34,0.15
Roxbury,2004,0.2,0.06
Roxbury,2005,0.2,0.06
Roxbury,2006,0.19,0.06
Roxbury,2007,0.2,0.07
Roxbury,2008,0.2,0.07
Roxbury,2009,0.19,0.07
Roxbury,2010,0.19,0.07
Roxbury,2011,0.19,0.08
Roxbury,2012,0.18,0.08
Roxbury,2013,0.18,0.09
Roxbury,2014,0.17,0.09
Roxbury,2015,0.17,0.1
Roxbury,2016,0.16,0.11
Roxbury,2017,0.16,0.12
Roxbury,2018,0.15,0.13
Roxbury,2019,0.15,0.14
Roxbury,2020,0.15,0.16
Roxbury,2021,0.14,0.17
Roxbury,2022,0.14,0.18
Roxbury,2023,0.14,0.19
Roxbury,2024,0.14,0.2
South Boston,2004,0.36,0.07
South Boston,2005,0.36,0.07
South Boston,2006,0.34,0.08
South Boston,2007,0.35,0.08
South Boston,2008,0.34,0.09
South Boston,2009,0.34,0.09
South Boston,2010,0.33,0.1
South Boston,2011,0.32,0.1
South Boston,2012,0.31,0.11
South Boston,2013,0.3,0.12
South Boston,2014,0.29,0.13
South Boston,2015,0.28,0.14
South Boston,2016,0.27,0.16
South Boston,2017,0.26,0.17
South Boston,2018,0.25,0.19
South Boston,2019,0.24,0.2
South Boston,2020,0.24,0.23
South Boston,2021,0.23,0.25
South Boston,2022,0.23,0.26
South Boston,2023,0.22,0.28
South Boston,2024,0.22,0.3
South Boston Waterfront,2004,0.15,0.06
South Boston Waterfront,2005,0.14,0.07
South Boston Waterfront,2006,0.13,0.08
South Boston Waterfront,2007,0.12,0.1
South Boston Waterfront,2008,0.12,0.11
South Boston Waterfront,2009,0.11,0.12
South Boston Waterfront,2010,0.1,0.14
South Boston Waterfront,2011,0.1,0.15
South Boston Waterfront,2012,0.09,0.17
South Boston Waterfront,2013,0.09,0.18
South Boston Waterfront,2014,0.08,0.2
South Boston Waterfront,2015,0.08,0.22
South Boston Waterfront,2016,0.07,0.24
South Boston Waterfront,2017,0.07,0.26
South Boston Waterfront,2018,0.06,0.28
South Boston Waterfront,2019,0.06,0.3
South Boston Waterfront,2020,0.06,0.32
South Boston Waterfront,2021,0.05,0.34
South Boston Waterfront,2022,0.05,0.35
South Boston Waterfront,2023,0.05,0.37
South Boston Waterfront,2024,0.05,0.38
South End,2004,0.23,0.07
South End,2005,0.23,0.07
South End,2006,0.22,0.08
South End,2007,0.22,0.08
South End,2008,0.22,0.09
South End,2009,0.22,0.09
South End,2010,0.21,0.1
South End,2011,0.21,0.1
South End,2012,0.2,0.11
South End,2013,0.2,0.11
South End,2014,0.19,0.12
South End,2015,0.18,0.13
South End,2016,0.18,0.14
South End,2017,0.17,0.16
South End,2018,0.17,0.17
South End,2019,0.16,0.18
South End,2020,0.16,0.21
South End,2021,0.15,0.22
South End,2022,0.15,0.23
South End,2023,0.15,0.25
South End,2024,0.15,0.27
West End,2004,0.13,0.09
West End,2005,0.13,0.09
West End,2006,0.13,0.1
West End,2007,0.13,0.1
West End,2008,0.13,0.11
West End,2009,0.13,0.11
West End,2010,0.13,0.12
West End,2011,0.12,0.12
West End,2012,0.12,0.13
West End,2013,0.12,0.14
West End,2014,0.11,0.15
West End,2015,0.11,0.17
West End,2016,0.1,0.18
West End,2017,0.1,0.2
West End,2018,0.1,0.22
West End,2019,0.09,0.23
West End,2020,0.09,0.26
West End,2021,0.09,0.28
West End,2022,0.09,0.29
West End,2023,0.09,0.31
West End,2024,0.08,0.33
West Roxbury,2004,0.56,0.03
West Roxbury,2005,0.56,0.03
West Roxbury,2006,0.55,0.03
West Roxbury,2007,0.55,0.03
West Roxbury,2008,0.55,0.03
West Roxbury,2009,0.55,0.04
West Roxbury,2010,0.54,0.04
West Roxbury,2011,0.54,0.04
West Roxbury,2012,0.53,0.04
West Roxbury,2013,0.53,0.05
West Roxbury,2014,0.52,0.05
West Roxbury,2015,0.52,0.05
West Roxbury,2016,0.51,0.06
West Roxbury,2017,0.51,0.06
West Roxbury,2018,0.5,0.06
West Roxbury,2019,0.5,0.07
West Roxbury,2020,0.49,0.07
West Roxbury,2021,0.49,0.08
West Roxbury,2022,0.49,0.08
West Roxbury,2023,0.49,0.09
West Roxbury,2024,0.49,0.09`;

// ============ DEMOGRAPHIC DATA ============
const DEMOGRAPHICS = {
  'Allston':        { white: 14634, total: 28621, tot_unit: 12527, vacant: 787 },
  'Beacon Hill':    { white: 7521,  total: 9336,  tot_unit: 6037,  vacant: 552 },
  'Brighton':       { white: 30596, total: 48330, tot_unit: 21874, vacant: 1052 },
  'Charlestown':    { white: 13626, total: 19120, tot_unit: 9525,  vacant: 593 },
  'Chinatown':      { white: 1898,  total: 7143,  tot_unit: 3644,  vacant: 345 },
  'Dorchester':     { white: 27411, total: 122191,tot_unit: 47965, vacant: 3142 },
  'Downtown':       { white: 9174,  total: 13451, tot_unit: 6654,  vacant: 1253 },
  'East Boston':    { white: 15760, total: 43066, tot_unit: 18016, vacant: 1321 },
  'Fenway':         { white: 20456, total: 37733, tot_unit: 13968, vacant: 1307 },
  'Hyde Park':      { white: 7449,  total: 33009, tot_unit: 12613, vacant: 547 },
  'Jamaica Plain':  { white: 22032, total: 41012, tot_unit: 18891, vacant: 1167 },
  'Longwood':       { white: 2573,  total: 4096,  tot_unit: 456,   vacant: 31 },
  'Mattapan':       { white: 1489,  total: 23834, tot_unit: 9346,  vacant: 525 },
  'North End':      { white: 9306,  total: 10805, tot_unit: 6832,  vacant: 518 },
  'Roslindale':     { white: 13428, total: 29386, tot_unit: 12114, vacant: 580 },
  'Roxbury':        { white: 7182,  total: 54905, tot_unit: 22034, vacant: 1689 },
  'South Boston':   { white: 29139, total: 37917, tot_unit: 19140, vacant: 1179 },
  'South Boston Waterfront': { white: 4315, total: 5579, tot_unit: 4622, vacant: 998 },
  'South End':      { white: 16618, total: 29373, tot_unit: 16619, vacant: 1366 },
  'West End':       { white: 4933,  total: 7705,  tot_unit: 5243,  vacant: 671 },
  'West Roxbury':   { white: 20918, total: 31561, tot_unit: 14070, vacant: 680 }
};

// ============ SVG MAP PATHS ============
const NEIGHBORHOOD_PATHS = {
  'West Roxbury':   'M 60,380 L 100,350 L 130,370 L 140,410 L 110,440 L 70,430 Z',
  'Roslindale':     'M 130,370 L 160,340 L 185,355 L 190,390 L 140,410 Z',
  'Hyde Park':      'M 110,440 L 140,410 L 190,390 L 200,430 L 170,470 L 120,460 Z',
  'Mattapan':       'M 190,390 L 220,360 L 250,380 L 240,420 L 200,430 Z',
  'Jamaica Plain':  'M 160,340 L 190,310 L 215,330 L 220,360 L 185,355 Z',
  'Roxbury':        'M 190,310 L 220,280 L 250,300 L 250,340 L 220,360 L 215,330 Z',
  'Dorchester':     'M 250,300 L 280,270 L 320,290 L 330,350 L 300,390 L 250,380 L 250,340 Z',
  'South Boston':   'M 280,230 L 320,210 L 350,230 L 340,270 L 320,290 L 280,270 Z',
  'South Boston Waterfront': 'M 320,210 L 360,195 L 370,215 L 350,230 Z',
  'South End':      'M 240,250 L 280,230 L 280,270 L 250,300 L 230,280 Z',
  'Fenway':         'M 195,240 L 230,220 L 240,250 L 230,280 L 200,270 Z',
  'Longwood':       'M 190,270 L 200,270 L 195,290 L 190,310 L 180,295 Z',
  'Chinatown':      'M 265,225 L 280,215 L 280,230 L 265,240 Z',
  'Downtown':       'M 280,195 L 310,180 L 320,195 L 320,210 L 280,215 Z',
  'North End':      'M 310,160 L 335,150 L 340,175 L 320,180 Z',
  'West End':       'M 280,170 L 310,160 L 320,180 L 280,195 Z',
  'Beacon Hill':    'M 260,185 L 280,170 L 280,195 L 265,205 Z',
  'Charlestown':    'M 290,130 L 330,115 L 350,135 L 335,150 L 310,160 Z',
  'East Boston':    'M 340,90 L 400,80 L 410,130 L 380,160 L 350,135 Z',
  'Allston':        'M 120,250 L 160,230 L 185,245 L 195,240 L 200,270 L 190,270 L 160,280 L 130,270 Z',
  'Brighton':       'M 60,270 L 120,250 L 130,270 L 160,280 L 160,340 L 130,370 L 100,350 L 70,320 Z'
};

// ============ PARSE CSV ============
function parseCorpData(raw) {
  const lines = raw.trim().split('\n');
  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const name = parts[0];
    const year = parseInt(parts[1]);
    const occ = parseFloat(parts[2]);
    const corp = parseFloat(parts[3]);
    if (!data[name]) data[name] = {};
    data[name][year] = { own_occ_rate: occ, corp_own_rate: corp };
  }
  return data;
}

const corpData = parseCorpData(RAW_CORP);
const neighborhoods = Object.keys(corpData);
