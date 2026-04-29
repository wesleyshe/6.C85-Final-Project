// ============ HELPERS ============
function formatCurrency(n) {
  return '$' + n.toLocaleString('en-US');
}

function countUp(el, start, end, duration, isCurrency) {
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    el.textContent = isCurrency ? formatCurrency(current) : current.toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ============ GLOBALS ============
const slides = document.querySelectorAll('.slide');
const dotsContainer = document.getElementById('dots');
let userGuessSlide2 = 500000;
let userBudget = 500000;
let currentSlideIdx = 0;
let isTransitioning = false;

// Selection-driven median + mortgage state (set by showReality)
const MORTGAGE_RATE = 0.07;          // Freddie Mac PMMS ~2024
const STANDARD_TERM = 30;            // standard US 30-year mortgage (the "real" contract length)
const DOWN_PAYMENT_PCT = 0.20;       // conventional 20% down
const REAL_WAGE_GROWTH = 0.012;      // ~1.2% real wage growth above inflation (BLS / FRED)
let selectedMedian = MEDIAN_PRICE;
let selectedMonthly = 0;

function getSelectedMedian() {
  const district = document.querySelector('.selector-row[data-group="district"] .selector-pill.active')?.dataset.value;
  const type = document.querySelector('.selector-row[data-group="type"] .selector-pill.active')?.dataset.value;
  const beds = parseInt(document.querySelector('.selector-row[data-group="beds"] .selector-pill.active')?.dataset.value, 10);
  return medianPrices?.[district]?.[type]?.[beds] ?? MEDIAN_PRICE;
}

function calcMonthlyMortgage(price, termYears = STANDARD_TERM) {
  const principal = price * (1 - DOWN_PAYMENT_PCT);
  const r = MORTGAGE_RATE / 12;
  const n = termYears * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}


// ============ DOT INDICATORS ============
slides.forEach((_, i) => {
  const d = document.createElement('div');
  d.className = 'dot' + (i === 0 ? ' active' : '');
  d.addEventListener('click', () => goToSlide(i));
  dotsContainer.appendChild(d);
});

function updateDots(idx) {
  document.querySelectorAll('.dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
  });
}

// ============ SLIDE NAVIGATION ============
const TRANSITION_DURATION = 1600; // ms lock between scroll navigations

function goToSlide(i, force) {
  if (i < 0 || i >= slides.length) return;
  if (!force && (i === currentSlideIdx || isTransitioning)) return;

  isTransitioning = true;
  currentSlideIdx = i;

  slides[i].scrollIntoView({ behavior: 'smooth' });
  updateDots(i);
  onSlideEnter(slides[i]);

  // Lock out further scroll/wheel/key navigation until transition completes
  setTimeout(() => { isTransitioning = false; }, TRANSITION_DURATION);
}

// Button-initiated navigation always forces through (bypasses transition lock)
function scrollToSlide(i) { goToSlide(i, true); }

function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const idx = Array.from(slides).indexOf(el);
  if (idx >= 0) goToSlide(idx, true);
}

function nextSlide() {
  goToSlide(currentSlideIdx + 1);
}

function prevSlide() {
  goToSlide(currentSlideIdx - 1);
}

// ============ SLIDE ENTER TRIGGERS ============
let donutAnimated = false;
let barsAnimated = false;
let medianAnimated = false;
let mortgageAnimated = false;
let shiftAnimated = false;
let mapAutoPlayed = false;
let introStarted = false;

function onSlideEnter(slide) {
  slide.querySelectorAll('.anim').forEach(el => el.classList.add('visible'));

  if (slide.id === 'slide-competitors') animateDonut();
  if (slide.id === 'slide-competition-advantage') animateAdvantageBars();
  if (slide.id === 'slide-reality') {
    // If the user reached this slide by scrolling (not via "Show Me"), refresh
    // the selection-derived state so the median card matches the iso boxes.
    refreshRealityFromSelections();
    animateMedianPrice();
    renderShrinkingHome();
    triggerShrinkAnim();
  }
  if (slide.id === 'slide-mortgage') {
    animateMortgage();
    staggerMilestones();
  }
  if (slide.id === 'slide-share') {
    renderShrinkingHome();
    updateCostOfTime();
  }

  if (slide.id === 'slide-map-intro' && !introStarted) {
    introStarted = true;
    setTimeout(runIntroSequence, 400);
  }

  if (slide.id === 'slide-map') {
    updateMap(parseInt(document.getElementById('yearSlider').value));
    if (!mapAutoPlayed) {
      mapAutoPlayed = true;
      setTimeout(togglePlay, 800);
    }
  }

  if (slide.id === 'slide-shift' && !shiftAnimated) {
    shiftAnimated = true;
    animateShiftBars();
  }
}

// ============ KEYBOARD NAVIGATION ============
document.addEventListener('keydown', (e) => {
  // Don't hijack keys when user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    nextSlide();
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    prevSlide();
  }
});

// ============ WHEEL NAVIGATION ============
let wheelAccum = 0;
let wheelTimer = null;
const WHEEL_THRESHOLD = 80;

document.addEventListener('wheel', (e) => {
  // Don't hijack wheel when user is interacting with form controls
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  e.preventDefault();
  if (isTransitioning) return;

  wheelAccum += e.deltaY;
  if (wheelAccum > WHEEL_THRESHOLD) {
    wheelAccum = 0;
    nextSlide();
  } else if (wheelAccum < -WHEEL_THRESHOLD) {
    wheelAccum = 0;
    prevSlide();
  }

  // Decay accumulated scroll to prevent drift
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheelAccum = 0; }, 200);
}, { passive: false });

// ============ PRICE SLIDER (Slide 2) ============
const priceSlider = document.getElementById('priceSlider');
const priceDisplay = document.getElementById('priceDisplay');

priceSlider.addEventListener('input', () => {
  const val = parseInt(priceSlider.value);
  userGuessSlide2 = val;
  priceDisplay.textContent = formatCurrency(val);
});

// ============ REVEAL PRICE (Slide 2) ============
function revealPrice() {
  const btn = document.getElementById('revealBtn');
  const sliderArea = document.getElementById('sliderArea');
  const revealArea = document.getElementById('revealArea');

  btn.style.display = 'none';
  sliderArea.style.display = 'none';
  priceDisplay.style.display = 'none';
  document.querySelector('#slide-guess .subheadline').style.display = 'none';

  revealArea.classList.add('show');
  revealArea.querySelectorAll('.anim').forEach(el => el.classList.add('visible'));

  document.getElementById('userGuessStrike').textContent = 'Your guess: ' + formatCurrency(userGuessSlide2);
  countUp(document.getElementById('actualPriceEl'), 0, ACTUAL_PRICE, 1500, true);
}

// ============ DONUT CHART (Slide 3) ============
const donutOrder = [
  { key: 'nonInvestor', id: 'seg-nonInvestor' },
  { key: 'small', id: 'seg-small' },
  { key: 'medium', id: 'seg-medium' },
  { key: 'large', id: 'seg-large' },
  { key: 'institutional', id: 'seg-institutional' }
];

function pct(value, total) {
  return total === 0 ? 0 : (value / total) * 100;
}

function roundedPct(value, total) {
  return Math.round(pct(value, total));
}

function drawDonut(data) {
  const C = 2 * Math.PI * 82;
  let offset = 0;

  donutOrder.forEach(seg => {
    const el = document.getElementById(seg.id);
    if (!el) return;

    const segmentPct = pct(data[seg.key], data.total);
    const len = (segmentPct / 100) * C;
    const gap = C - len;

    el.style.strokeDasharray = `${len} ${gap}`;
    el.style.strokeDashoffset = -offset;
    offset += len;
  });
}

function updateCompetitionCards(name) {
  const data = neighborhoodMix[name];
  if (!data) return;

  const nonInvestorPct = roundedPct(data.nonInvestor, data.total);
  const smallPct = roundedPct(data.small, data.total);
  const mediumPct = roundedPct(data.medium, data.total);
  const largePct = roundedPct(data.large, data.total);
  const institutionalPct = roundedPct(data.institutional, data.total);

  const investorTotal =
    data.small + data.medium + data.large + data.institutional;
  const investorPct = roundedPct(investorTotal, data.total);

  document.getElementById('legend-nonInvestor').textContent = `Non-investors ${nonInvestorPct}%`;
  document.getElementById('legend-small').textContent = `Small investors ${smallPct}%`;
  document.getElementById('legend-medium').textContent = `Medium investors ${mediumPct}%`;
  document.getElementById('legend-large').textContent = `Large investors ${largePct}%`;
  document.getElementById('legend-institutional').textContent = `Institutional ${institutionalPct}%`;

  document.getElementById('nonInvestorCard').textContent = `${nonInvestorPct}%`;
  document.getElementById('smallCard').textContent = `${smallPct}%`;
  document.getElementById('mediumCard').textContent = `${mediumPct}%`;
  document.getElementById('largeCard').textContent = `${largePct}%`;
  document.getElementById('institutionalCard').textContent = `${institutionalPct}%`;

  document.getElementById('competitionCallout').innerHTML =
    `In <span>${name}</span>, <span>${investorPct}%</span> of buyers are investors.`;

  if (donutAnimated) drawDonut(data);
}

function animateDonut() {
  if (donutAnimated) return;
  donutAnimated = true;
  drawDonut(neighborhoodMix['Dorchester']);
}

document.querySelectorAll('.neighborhood-pills .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.neighborhood-pills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    updateCompetitionCards(pill.dataset.hood);
  });
});

// ============ ADVANTAGE BARS (Slide 4) ============
let advantageMetrics = null;

function loadAdvantageData() {
  fetch('data/boston_residential_sales.csv')
    .then(res => res.text())
    .then(csvText => {
      const rows = parseCSV(csvText);
      advantageMetrics = processAdvantageData(rows);
      updateAdvantageSlide('repeat');
    })
    .catch(err => {
      console.error('Could not load advantage data:', err);
    });

}

function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const headers = parseCSVLine(lines[0]).map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};

    headers.forEach((h, i) => {
      row[h] = values[i] ? values[i].trim() : '';
    });

    return row;
  });
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || value.trim() === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function processAdvantageData(rows) {
  const allowedTypes = ['APT', 'R1F', 'R2F', 'R3F', 'RES', 'CNR', 'RCD', 'R14', 'R25'];

const clean = rows
  .filter(d => {
    const type = (d.proptype || '').trim().toUpperCase();
    const prevPrice = toOptionalNumber(d.prslpr);

    return (
      allowedTypes.includes(type) &&
      Number.isFinite(prevPrice) &&
      prevPrice > 50000
    );
  })
  .map(d => {
    const investorType = d.investor_type_purchase;
    const isInvestor = investorType && investorType !== 'Non-investor';

    const price = toOptionalNumber(d.price);
    const previousPrice = toOptionalNumber(d.prslpr);

    const priceDiff =
      Number.isFinite(price) && Number.isFinite(previousPrice)
        ? price - previousPrice
        : NaN;

    const priceDiffPct =
      Number.isFinite(priceDiff) && previousPrice > 0
        ? (priceDiff / previousPrice) * 100
        : NaN;

    return {
      group: isInvestor ? 'Investors' : 'Non-investors',
      cashSale: toNumber(d.cash_sale),
      repeatBuyer: toNumber(d.buyer_purchases) > 1 ? 1 : 0,
      flip: toNumber(d.flip_ind),
      flipHorizon: toNumber(d.flip_horizon) / 30.44,
      price,
      previousPrice,
      priceDiff,
      priceDiffPct
    };
  });

  const resaleData = clean.filter(d =>
  Number.isFinite(d.priceDiffPct)
  );

  console.log(
  clean.filter(d => d.flip === 1).slice(0, 10)
  );


  const nonInvestors = clean.filter(d => d.group === 'Non-investors');
  const investors = clean.filter(d => d.group === 'Investors');


  function avg(group, key) {
    if (!group.length) return 0;
    return group.reduce((sum, d) => sum + d[key], 0) / group.length;
  }

function avgFlipHorizon(group) {
  const flips = group.filter(d =>
    d.flip === 1 &&
    Number.isFinite(d.flipHorizon) &&
    d.flipHorizon > 0
  );

  if (!flips.length) return 0;

  return flips.reduce((sum, d) => sum + d.flipHorizon, 0) / flips.length;
}

function medianPriceChange(group) {
  const valid = group
    .map(d => d.priceDiffPct)
    .filter(v => Number.isFinite(v))
    .sort((a, b) => a - b);

  if (!valid.length) return 0;

  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0
    ? (valid[mid - 1] + valid[mid]) / 2
    : valid[mid];
}


function avgPriceChange(group) {
  const valid = group
    .map(d => d.priceDiffPct)
    .filter(v => Number.isFinite(v));  // ✅ ONLY keep valid numbers

  if (!valid.length) return 0;

  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

console.log('Average resale price change:', {
  nonInvestors: avgPriceChange(nonInvestors),
  investors: avgPriceChange(investors)
});

console.log(
  'Sample price changes:',
  clean
    .map(d => d.priceDiffPct)
    .filter(v => Number.isFinite(v))
    .slice(0, 20)
);

console.log(
  'Extreme values:',
  clean
    .map(d => d.priceDiffPct)
    .filter(v => Number.isFinite(v))
    .sort((a, b) => b - a)
    .slice(0, 10)
);

console.log('Rows after filtering:', clean.length);

  return {
    cash: {
      title: 'Cash sale rate',
      nonInvestor: avg(nonInvestors, 'cashSale'),
      investor: avg(investors, 'cashSale'),
      format: 'percent'
    },
    repeat: {
      title: 'Repeat buyer rate',
      nonInvestor: avg(nonInvestors, 'repeatBuyer'),
      investor: avg(investors, 'repeatBuyer'),
      format: 'percent'
    },
    flip: {
      title: 'Flip rate',
      nonInvestor: avg(nonInvestors, 'flip'),
      investor: avg(investors, 'flip'),
      format: 'percent'
    },
    horizon: {
      title: 'Average flip horizon',
      nonInvestor: avgFlipHorizon(nonInvestors),
      investor: avgFlipHorizon(investors),
      format: 'months'
    },
    priceChange: {
  title: 'Average resale price change',
  nonInvestor: avgPriceChange(nonInvestors),
  investor: avgPriceChange(investors),
  format: 'percentWhole'
}
  };
}

function updateAdvantageSlide(metricKey) {
  if (!advantageMetrics) return;

  const metric = advantageMetrics[metricKey];
  const metricDescriptions = {
  repeat: '<strong>Repeat buyers:</strong> Share of buyers who appear more than once in the transaction data. This is the clearest difference between the two groups: investors are much more likely to show up repeatedly.',
  flip: '<strong>Flips:</strong>Share of transactions where the property was resold within two years. Here, investors and non-investors look very similar, suggesting flipping frequency is not the main difference.',
  horizon: '<strong>Flip speed:</strong> Average time between purchase and resale among flipped properties. Lower values mean faster resale. The timelines are close, so speed is not a strong differentiator.',
  priceChange: '<strong>Price increase:</strong> Average percent change between sale price and prior sale price, using selected residential property types with valid prior sale prices. This is an average, so it can be influenced by holding period and unusual high-growth cases.'
};

const explanation = document.getElementById('metricExplanation');
if (explanation) {
  explanation.innerHTML = metricDescriptions[metricKey] || '';
}
  const bars = document.querySelectorAll('.advantage-bar');
  const values = document.querySelectorAll('.bar-value');

  const nonInvestorValue = metric.nonInvestor;
  const investorValue = metric.investor;

let maxValue;
if (metric.format === 'percent') {
  maxValue = 1;
} else if (metric.format === 'percentWhole') {
  maxValue = Math.max(nonInvestorValue, investorValue, 100);
} else {
  maxValue = Math.max(nonInvestorValue, investorValue, 1);
}

  const displayRows = [
    nonInvestorValue,
    investorValue
  ];

  bars.forEach((bar, i) => {
    if (i > 1) {
      bar.closest('.bar-row').style.display = 'none';
      return;
    }

    bar.closest('.bar-row').style.display = 'grid';

    const width = (displayRows[i] / maxValue) * 100;
    bar.dataset.width = `${width}%`;
    bar.style.width = `${width}%`;
  });

  values.forEach((value, i) => {
    if (i > 1) return;

    const rawValue = displayRows[i];

    if (metric.format === 'percent') {
  value.textContent = `${Math.round(rawValue * 100)}%`;
} else if (metric.format === 'percentWhole') {
  value.textContent = `${Math.round(rawValue)}%`;
} else {
  value.textContent = `${Math.round(rawValue)} mo.`;
}
  });
}

function animateAdvantageBars() {
  if (barsAnimated) return;
  barsAnimated = true;

  document.querySelectorAll('.advantage-bar').forEach(bar => {
    requestAnimationFrame(() => {
      bar.style.width = bar.dataset.width;
    });
  });
}

document.querySelectorAll('.metric-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.metric-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    const metricKey = pill.dataset.metric;
    updateAdvantageSlide(metricKey);
  });
});

// ============ SELECTOR PILLS (Slide 9) ============
document.querySelectorAll('.selector-row').forEach(row => {
  row.querySelectorAll('.selector-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      row.querySelectorAll('.selector-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const g = row.dataset.group;
      if (g === 'district') updateHuntDistrict();
      if (g === 'type')     updateHuntType();
    });
  });
});

// ============ HUNT-RIGHT PREVIEW (Slide 9) ============
// District-pill value → canonical neighborhood name (matches NEIGHBORHOOD_PATHS keys)
const HUNT_DISTRICT_NAME = {
  backbay:     'Back Bay',
  southboston: 'South Boston',
  dorchester:  'Dorchester',
  jp:          'Jamaica Plain',
  eastboston:  'East Boston'
};

const HUNT_TYPE_INFO = {
  condo: {
    label: 'Condo',
    desc: 'A unit you own inside a larger building. You hold the deed to your unit plus a share of common areas — hallways, roof, lobby. Lower maintenance, no land.'
  },
  single: {
    label: 'Single Family',
    desc: 'A standalone house on its own lot. You own the building and the land underneath. Most space and privacy, highest upkeep.'
  },
  multi: {
    label: 'Multi-Family',
    desc: 'A building with 2–3 separate units — the iconic Boston triple-decker. You own the whole building; live in one unit and rent the others, or use it as an investment.'
  }
};

// Build the Boston silhouette once at init using pre-projected GeoJSON paths.
// All neighborhoods render with the same uniform fill so they read as a single
// city outline (not 24 distinct polygons). The active district is highlighted
// with a bright neon dot at its centroid.
function buildHuntMap() {
  const wrap = document.getElementById('huntMapWrap');
  if (!wrap || typeof BOSTON_GEO_PATHS === 'undefined') return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  Object.keys(BOSTON_GEO_PATHS).forEach(name => {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', BOSTON_GEO_PATHS[name]);
    path.setAttribute('class', 'hunt-geo-path');
    path.setAttribute('data-name', name);
    svg.appendChild(path);
  });

  // Highlight: outer ring + filled dot, both positioned at the active centroid
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('id', 'huntGeoDotRing');
  ring.setAttribute('class', 'hunt-geo-dot-ring');
  ring.setAttribute('r', '6');
  svg.appendChild(ring);

  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('id', 'huntGeoDot');
  dot.setAttribute('class', 'hunt-geo-dot');
  dot.setAttribute('r', '3');
  svg.appendChild(dot);

  wrap.innerHTML = '';
  wrap.appendChild(svg);

  // Tighten the viewBox to the actual rendered Boston shape so the silhouette
  // fills the wrap (eliminates large blank margins inside the SVG).
  // Hide the dot+ring during measurement so they don't expand the bbox.
  dot.style.display = 'none';
  ring.style.display = 'none';
  const bbox = svg.getBBox();
  dot.style.display = '';
  ring.style.display = '';
  const pad = 4;
  svg.setAttribute('viewBox',
    `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + 2 * pad} ${bbox.height + 2 * pad}`
  );
}

function updateHuntDistrict() {
  const v = document.querySelector('.selector-row[data-group="district"] .selector-pill.active')?.dataset.value;
  const canonical = HUNT_DISTRICT_NAME[v];
  if (!canonical) return;
  const c = (typeof BOSTON_GEO_CENTROIDS !== 'undefined') ? BOSTON_GEO_CENTROIDS[canonical] : null;
  const dot = document.getElementById('huntGeoDot');
  const ring = document.getElementById('huntGeoDotRing');
  if (c && dot)  { dot.setAttribute('cx', c[0]);  dot.setAttribute('cy', c[1]); }
  if (c && ring) { ring.setAttribute('cx', c[0]); ring.setAttribute('cy', c[1]); }
  const nameEl = document.getElementById('huntDistrictName');
  if (nameEl) nameEl.textContent = canonical;
}

// Build a small isometric "building type" diagram (different per type)
function buildHuntTypeSvg(type) {
  const COS = ISO_COS30, SIN = ISO_SIN30;
  const fmt = (n) => n.toFixed(1);
  const ptStr = (p) => `${fmt(p[0])},${fmt(p[1])}`;
  const polyPts = (...pts) => pts.map(ptStr).join(' ');

  function box(cx, cy, W, D, H) {
    const dx = D * COS, dy = D * SIN;
    return {
      FBL: [cx,         cy],
      FBR: [cx + W,     cy],
      FTL: [cx,         cy - H],
      FTR: [cx + W,     cy - H],
      BBR: [cx + W + dx,cy - dy],
      BTL: [cx + dx,    cy - H - dy],
      BTR: [cx + W + dx,cy - H - dy]
    };
  }
  function box3Faces(v) {
    return (
      `<polygon class="ht-shape ht-front" points="${polyPts(v.FBL, v.FBR, v.FTR, v.FTL)}"/>` +
      `<polygon class="ht-shape ht-right" points="${polyPts(v.FBR, v.BBR, v.BTR, v.FTR)}"/>` +
      `<polygon class="ht-shape ht-top"   points="${polyPts(v.FTL, v.FTR, v.BTR, v.BTL)}"/>`
    );
  }

  let inner = '';
  if (type === 'condo') {
    // Tall apartment building, the user's unit on the front face highlighted
    const W = 90, D = 70, H = 130;
    const cx = -W / 2, cy = 0;
    const v = box(cx, cy, W, D, H);
    inner += box3Faces(v);
    // Floor lines (5 floors)
    for (let i = 1; i <= 4; i++) {
      const y = -H * (i / 5);
      inner += `<line class="ht-line" x1="${fmt(cx)}" y1="${fmt(y)}" x2="${fmt(cx + W)}" y2="${fmt(y)}"/>`;
      const rx2 = cx + W + D * COS;
      const ry2 = y - D * SIN;
      inner += `<line class="ht-line" x1="${fmt(cx + W)}" y1="${fmt(y)}" x2="${fmt(rx2)}" y2="${fmt(ry2)}"/>`;
    }
    // Windows on each floor (front face) — highlight one as "your unit"
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const wW = W / 5, wH = H / 5 * 0.55;
        const wx = cx + (j * 1.5 + 0.7) * (W / 5);
        const wy = -H * ((i + 1) / 5) + (H / 5) * 0.22;
        const isYours = (i === 2 && j === 1);
        const cls = isYours ? 'ht-detail ht-yours' : 'ht-detail';
        inner += `<rect class="${cls}" x="${fmt(wx)}" y="${fmt(wy)}" width="${fmt(wW)}" height="${fmt(wH)}"/>`;
      }
    }
  }
  else if (type === 'single') {
    // Pitched-roof house with door + windows
    const W = 100, D = 95, H = 60, roofH = 42;
    const cx = -W / 2, cy = 0;
    const v = box(cx, cy, W, D, H);
    inner += box3Faces(v);
    // Ridge
    const rfx = (v.FTL[0] + v.FTR[0]) / 2;
    const rfy = (v.FTL[1] + v.FTR[1]) / 2 - roofH;
    const rbx = (v.BTL[0] + v.BTR[0]) / 2;
    const rby = (v.BTL[1] + v.BTR[1]) / 2 - roofH;
    // Front gable
    inner += `<polygon class="ht-shape ht-roof" points="${polyPts(v.FTL, v.FTR, [rfx, rfy])}"/>`;
    // Right roof slope
    inner += `<polygon class="ht-shape ht-roof" points="${polyPts(v.FTR, [rfx, rfy], [rbx, rby], v.BTR)}"/>`;
    // Door (centered front)
    const dW = W * 0.16, dH = H * 0.55;
    inner += `<rect class="ht-detail" x="${fmt(cx + W * 0.42)}" y="${fmt(-dH)}" width="${fmt(dW)}" height="${fmt(dH)}"/>`;
    // Two windows flanking the door
    const wW = W * 0.18, wH = H * 0.30;
    inner += `<rect class="ht-detail" x="${fmt(cx + W * 0.10)}" y="${fmt(-H * 0.70)}" width="${fmt(wW)}" height="${fmt(wH)}"/>`;
    inner += `<rect class="ht-detail" x="${fmt(cx + W * 0.72)}" y="${fmt(-H * 0.70)}" width="${fmt(wW)}" height="${fmt(wH)}"/>`;
  }
  else if (type === 'multi') {
    // Tall narrow flat-roof box with 3 floor bands — Boston triple-decker
    const W = 70, D = 80, H = 130;
    const cx = -W / 2, cy = 0;
    const v = box(cx, cy, W, D, H);
    inner += box3Faces(v);
    // Two horizontal floor-divider lines on front + right
    for (let i = 1; i <= 2; i++) {
      const y = -H * (i / 3);
      inner += `<line class="ht-line" x1="${fmt(cx)}" y1="${fmt(y)}" x2="${fmt(cx + W)}" y2="${fmt(y)}"/>`;
      const rx2 = cx + W + D * COS;
      const ry2 = y - D * SIN;
      inner += `<line class="ht-line" x1="${fmt(cx + W)}" y1="${fmt(y)}" x2="${fmt(rx2)}" y2="${fmt(ry2)}"/>`;
    }
    // One large bay-window per floor (front)
    for (let i = 0; i < 3; i++) {
      const wW = W * 0.50, wH = H / 3 * 0.55;
      const wx = cx + (W - wW) / 2;
      const wy = -H * ((i + 1) / 3) + (H / 3) * 0.20;
      inner += `<rect class="ht-detail" x="${fmt(wx)}" y="${fmt(wy)}" width="${fmt(wW)}" height="${fmt(wH)}"/>`;
    }
  }

  return `
    <svg viewBox="0 0 240 220" preserveAspectRatio="xMidYMax meet">
      <g transform="translate(120, 200)">${inner}</g>
    </svg>
  `;
}

function updateHuntType() {
  const v = document.querySelector('.selector-row[data-group="type"] .selector-pill.active')?.dataset.value;
  const info = HUNT_TYPE_INFO[v];
  if (!info) return;
  const wrap = document.getElementById('huntTypeWrap');
  wrap.innerHTML = buildHuntTypeSvg(v);
  document.getElementById('huntTypeName').textContent = info.label;
  document.getElementById('huntTypeDesc').textContent = info.desc;

  // Tighten viewBox to the building's actual bbox so it sits centered in the wrap
  const svg = wrap.querySelector('svg');
  if (svg) {
    const bbox = svg.getBBox();
    const pad = 6;
    svg.setAttribute('viewBox',
      `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + 2 * pad} ${bbox.height + 2 * pad}`
    );
  }
}

// ============ TOGGLE PILLS (Slide 11) ============
// Each .toggle-row has data-mode="radio" (single-select within row) or
// data-mode="multi" (independent on/off per pill).
document.querySelectorAll('.toggle-row').forEach(row => {
  const mode = row.dataset.mode || 'radio';
  row.querySelectorAll('.toggle-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      if (mode === 'radio') {
        row.querySelectorAll('.toggle-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      } else {
        pill.classList.toggle('active');
      }
      // Cost-of-time slide reacts to any toggle change
      const g = row.dataset.group;
      if (g === 'income' || g === 'kids' || g === 'burdens') {
        updateCostOfTime();
      }
    });
  });
});

// ============ BUDGET SLIDER (Slide 9) ============
const budgetSlider = document.getElementById('budgetSlider');
const budgetDisplay = document.getElementById('budgetDisplay');
budgetSlider.addEventListener('input', () => {
  userBudget = parseInt(budgetSlider.value, 10);
  budgetDisplay.textContent = formatCurrency(userBudget);
});

// ============ REALITY CHECK (Slides 9 → 10) ============
// Refresh the selection-derived state (median, monthly, comparison copy) and
// mirror it into the share card. Called by both the explicit "Show Me" button
// and the slide-reality enter hook (so scrolling past Hunt still works).
function refreshRealityFromSelections() {
  selectedMedian = getSelectedMedian();
  selectedMonthly = calcMonthlyMortgage(selectedMedian, STANDARD_TERM);

  const diff = Math.abs(selectedMedian - userBudget);
  const diffCopy = diff === 0
    ? 'You nailed it'
    : userBudget < selectedMedian
      ? formatCurrency(diff) + ' under budget'
      : formatCurrency(diff) + ' over budget';

  document.getElementById('guessComparison').textContent = 'You guessed ' + formatCurrency(userBudget);
  document.getElementById('guessDiff').textContent = diffCopy;

  document.getElementById('shareGuess').innerHTML =
    formatCurrency(userBudget) + ' &rarr; <span class="neon">' + formatCurrency(selectedMedian) + '</span>';
}

function showReality() {
  refreshRealityFromSelections();

  // Reset animation flags so slides 10/11 re-animate to the newly selected values.
  medianAnimated = false;
  mortgageAnimated = false;
  document.getElementById('medianPrice').textContent = '$0';
  document.getElementById('yearsNumber').textContent = '0';
  document.getElementById('monthlyPayment').textContent = '$0';

  // Build the shrinking-home iso pair before the slide enters so it's ready to animate
  renderShrinkingHome();

  scrollToId('slide-reality');
}

// ============ ANIMATE MEDIAN PRICE (Slide 9) ============
function animateMedianPrice() {
  if (medianAnimated) return;
  medianAnimated = true;
  countUp(document.getElementById('medianPrice'), 0, selectedMedian, 1500, true);
}

// ============ ISOMETRIC FLOOR PLAN (Slide 10 — Shrinking Home) ============
//
// Top-down iso projection of a parametric floor plan. Each unit is drawn as
// an iso parallelogram footprint subdivided into rooms, with the outer wall
// extruded slightly upward for a 3D dollhouse look.
//
// Floor coordinates: (x, y) where x = right (along width W), y = back (along depth D).
// Iso projection: screen_x = (x - y) * cos30,  screen_y = (x + y) * sin30.
// Origin (0,0) = back-left corner of the unit — projects to the top of the SVG.
const ISO_COS30 = Math.cos(Math.PI / 6);
const ISO_SIN30 = Math.sin(Math.PI / 6);
const WALL_HEIGHT = 14;  // svg units of upward extrusion for outer walls

function isoProj(x, y) {
  return [(x - y) * ISO_COS30, (x + y) * ISO_SIN30];
}

// ----- Room layouts (normalized 0–1 coords, x=width, y=depth) -----
// Each entry: { x, y, w, h, label }
const ROOM_LAYOUTS = {
  Studio: [
    { x: 0,    y: 0,    w: 0.62, h: 1.00, label: 'Open Living' },
    { x: 0.62, y: 0,    w: 0.38, h: 0.50, label: 'Kitchen' },
    { x: 0.62, y: 0.50, w: 0.38, h: 0.50, label: 'Bath' }
  ],
  '1BR': [
    { x: 0,    y: 0,    w: 0.55, h: 0.50, label: 'Bedroom' },
    { x: 0.55, y: 0,    w: 0.45, h: 0.50, label: 'Bath' },
    { x: 0,    y: 0.50, w: 0.65, h: 0.50, label: 'Living' },
    { x: 0.65, y: 0.50, w: 0.35, h: 0.50, label: 'Kitchen' }
  ],
  '2BR': [
    { x: 0,    y: 0,    w: 0.50, h: 0.50, label: 'Bedroom' },
    { x: 0.50, y: 0,    w: 0.50, h: 0.50, label: 'Bedroom' },
    { x: 0,    y: 0.50, w: 0.40, h: 0.50, label: 'Living' },
    { x: 0.40, y: 0.50, w: 0.30, h: 0.50, label: 'Kitchen' },
    { x: 0.70, y: 0.50, w: 0.30, h: 0.50, label: 'Bath' }
  ],
  '3BR': [
    { x: 0,    y: 0,    w: 0.34, h: 0.50, label: 'Bedroom' },
    { x: 0.34, y: 0,    w: 0.33, h: 0.50, label: 'Bedroom' },
    { x: 0.67, y: 0,    w: 0.33, h: 0.50, label: 'Bedroom' },
    { x: 0,    y: 0.50, w: 0.40, h: 0.50, label: 'Living' },
    { x: 0.40, y: 0.50, w: 0.30, h: 0.50, label: 'Kitchen' },
    { x: 0.70, y: 0.50, w: 0.30, h: 0.50, label: 'Bath' }
  ],
  '4BR': [
    { x: 0,    y: 0,    w: 0.25, h: 0.50, label: 'Bed' },
    { x: 0.25, y: 0,    w: 0.25, h: 0.50, label: 'Bed' },
    { x: 0.50, y: 0,    w: 0.25, h: 0.50, label: 'Bed' },
    { x: 0.75, y: 0,    w: 0.25, h: 0.50, label: 'Bed' },
    { x: 0,    y: 0.50, w: 0.40, h: 0.50, label: 'Living' },
    { x: 0.40, y: 0.50, w: 0.30, h: 0.50, label: 'Kitchen' },
    { x: 0.70, y: 0.50, w: 0.15, h: 0.50, label: 'Bath' },
    { x: 0.85, y: 0.50, w: 0.15, h: 0.50, label: 'Bath' }
  ],
  '5BR+': [
    { x: 0,    y: 0,    w: 0.20, h: 0.50, label: 'Bed' },
    { x: 0.20, y: 0,    w: 0.20, h: 0.50, label: 'Bed' },
    { x: 0.40, y: 0,    w: 0.20, h: 0.50, label: 'Bed' },
    { x: 0.60, y: 0,    w: 0.20, h: 0.50, label: 'Bed' },
    { x: 0.80, y: 0,    w: 0.20, h: 0.50, label: 'Bed' },
    { x: 0,    y: 0.50, w: 0.45, h: 0.50, label: 'Living' },
    { x: 0.45, y: 0.50, w: 0.30, h: 0.50, label: 'Kitchen' },
    { x: 0.75, y: 0.50, w: 0.25, h: 0.50, label: 'Bath' }
  ]
};

// ----- Build SVG for a single floor plan footprint -----
function buildFloorPlan(W, D, bedroomLabel) {
  const rooms = ROOM_LAYOUTS[bedroomLabel] || ROOM_LAYOUTS['1BR'];
  const fmt = (n) => n.toFixed(1);

  // Outer footprint corners (back-left → back-right → front-right → front-left)
  const out = {
    BL: isoProj(0, 0),
    BR: isoProj(W, 0),
    FR: isoProj(W, D),
    FL: isoProj(0, D)
  };
  // Top of outer walls (extruded upward = decrease screen_y)
  const top = {
    BL: [out.BL[0], out.BL[1] - WALL_HEIGHT],
    BR: [out.BR[0], out.BR[1] - WALL_HEIGHT],
    FR: [out.FR[0], out.FR[1] - WALL_HEIGHT],
    FL: [out.FL[0], out.FL[1] - WALL_HEIGHT]
  };
  const ptStr = (p) => `${fmt(p[0])},${fmt(p[1])}`;
  const polyPts = (...pts) => pts.map(ptStr).join(' ');

  let svg = '';

  // Floor (the iso parallelogram base)
  svg += `<polygon class="fp-floor" points="${polyPts(out.BL, out.BR, out.FR, out.FL)}"/>`;

  // Each room as a sub-parallelogram on the floor + a label
  rooms.forEach(r => {
    const x0 = r.x * W,         y0 = r.y * D;
    const x1 = (r.x + r.w) * W, y1 = (r.y + r.h) * D;
    const c = [
      isoProj(x0, y0), isoProj(x1, y0),
      isoProj(x1, y1), isoProj(x0, y1)
    ];
    svg += `<polygon class="fp-room" points="${polyPts(...c)}"/>`;
    // Center label at the iso-projected room center
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const [lx, ly] = isoProj(cx, cy);
    svg += `<text class="fp-label" x="${fmt(lx)}" y="${fmt(ly)}">${r.label}</text>`;
  });

  // Outer walls — extruded as 4 vertical-edge strips (front-left + front-right visible)
  svg += `<polygon class="fp-wall fp-wall-fl" points="${polyPts(out.FL, out.BL, top.BL, top.FL)}"/>`;
  svg += `<polygon class="fp-wall fp-wall-fr" points="${polyPts(out.FR, out.BR, top.BR, top.FR)}"/>`;
  svg += `<polygon class="fp-wall fp-wall-front" points="${polyPts(out.FL, out.FR, top.FR, top.FL)}"/>`;
  // Top capping line for outer walls
  svg += `<polyline class="fp-wall-top" points="${polyPts(top.FL, top.BL, top.BR, top.FR, top.FL)}"/>`;

  return { svg, W, D };
}

// ----- Type-specific composition (single = + roof outline, multi = stacked floors) -----
function buildIsoSvg(type, scale, sqft) {
  // Footprint dimensions: scale with sqrt(sqft) for visual area-fidelity.
  // BASE constants tuned so that ~1500 sqft fills nicely at scale=1.
  const sqftSafe = Math.max(120, sqft);
  const baseSide = Math.sqrt(sqftSafe) * 1.55;  // svg units, tunable

  const bedroom = bedroomFromSqft(sqftSafe);
  let inner = '';

  if (type === 'condo') {
    // Single floor, slightly wider than deep
    const W = baseSide * 1.1, D = baseSide * 0.85;
    const fp = buildFloorPlan(W, D, bedroom);
    inner = fp.svg;
  }
  else if (type === 'single') {
    // Square footprint + small roof outline above the wall extrusion
    const W = baseSide * 0.95, D = baseSide * 0.95;
    const fp = buildFloorPlan(W, D, bedroom);
    inner = fp.svg;
    // Roof: connect ridge-line above the top-of-wall corners (pyramid-ish hip)
    const top = {
      BL: [...isoProj(0, 0)], BR: [...isoProj(W, 0)],
      FR: [...isoProj(W, D)], FL: [...isoProj(0, D)]
    };
    Object.keys(top).forEach(k => top[k][1] -= WALL_HEIGHT);
    // Ridge midpoint (above center of footprint)
    const [cx, cy] = isoProj(W / 2, D / 2);
    const ridge = [cx, cy - WALL_HEIGHT - Math.min(W, D) * 0.42];
    const fmt = (n) => n.toFixed(1);
    const ptStr = (p) => `${fmt(p[0])},${fmt(p[1])}`;
    // Front-right and front-left roof slopes
    inner += `<polygon class="fp-roof" points="${ptStr(top.FL)} ${ptStr(top.FR)} ${ptStr(ridge)}"/>`;
    inner += `<polygon class="fp-roof" points="${ptStr(top.FR)} ${ptStr(top.BR)} ${ptStr(ridge)}"/>`;
  }
  else if (type === 'multi') {
    // Triple-decker: 3 stacked floor plans, narrow on street.
    // Bedrooms are PER UNIT; each floor is one unit. The displayed bedroom
    // count from bedroomFromSqft applies to ONE unit (sqft / 3).
    const perUnitSqft = sqftSafe / 3;
    const perUnitBR = bedroomFromSqft(perUnitSqft);
    const perUnitSide = Math.sqrt(perUnitSqft) * 1.55;
    const W = perUnitSide * 0.85, D = perUnitSide * 1.10;
    // Build one floor plan, then stack 3 copies vertically with offsets
    const fp = buildFloorPlan(W, D, perUnitBR);
    inner = '';
    for (let i = 2; i >= 0; i--) {
      // Top floor first (i=2), down to ground (i=0). Each floor offset upward by (WALL_HEIGHT * i).
      const yOffset = -WALL_HEIGHT * i * 1.6;
      // Bottom 2 floors are slightly faded
      const opacity = i === 0 ? 1 : (i === 1 ? 0.78 : 0.6);
      inner += `<g transform="translate(0, ${yOffset.toFixed(1)})" opacity="${opacity}">${fp.svg}</g>`;
    }
  }

  // Center the unit at viewBox (100, 200), scale around bottom-center
  return `
    <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMax meet" class="iso-svg">
      <g transform="translate(120, 220) scale(${scale.toFixed(3)})">
        ${inner}
      </g>
    </svg>
  `;
}

// ============ SHRINKING HOME RENDER (Slide 10) ============
const TYPE_LABEL = { condo: 'Condo', single: 'Single Family', multi: 'Multi-Family' };

// Round a sqft value to the nearest 25 for cleaner display
function roundSqft(n) { return Math.round(n / 25) * 25; }

// For multi-family the "bedrooms" label is per-unit (each floor = one unit)
function effectiveBedroomLabel(type, sqft) {
  return type === 'multi'
    ? bedroomFromSqft(sqft / 3) + '/unit'
    : bedroomFromSqft(sqft);
}

// ---- Nested iso-box renderer ----
// True isometric projection (axes 120° apart on screen, none face-on).
//
// FLOOR represents sqft: square footprint with side = √sqft (in feet),
// rendered at a chosen SVG-per-foot scale.
// HEIGHT is FIXED at 10 ft (standard residential ceiling), independent of sqft,
// rendered using the SAME SVG-per-foot scale so the box looks proportional.
//
// Both boxes use the SAME svg-per-ft scale, so:
//   - outer floor side ∝ √(sqft_2014)
//   - inner floor side ∝ √(sqft_2024) (= outer × linearRatio)
//   - both heights are equal in SVG (since real-world ceiling = 10 ft for both)
const SHRINK_BASE = 130;     // outer floor side in SVG units (anchor)
const CEILING_FT  = 10;      // real-world ceiling height (constant)

function buildShrinkBox(W, D, H) {
  const C = ISO_COS30, S = ISO_SIN30;
  const v = {
    F:   [0,            0],
    R:   [W * C,       -W * S],
    L:   [-D * C,      -D * S],
    B:   [(W - D) * C, -(W + D) * S],
    F_T: [0,           -H],
    R_T: [W * C,       -W * S - H],
    L_T: [-D * C,      -D * S - H],
    B_T: [(W - D) * C, -(W + D) * S - H]
  };
  const pt = p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const poly = (cls, ...keys) =>
    `<polygon class="shrink-face ${cls}" points="${keys.map(k => pt(v[k])).join(' ')}"/>`;
  // Render order: top first (sits "behind" from the perspective of side walls),
  // then the two front walls layered on top.
  return (
    poly('shrink-top',   'F_T', 'R_T', 'B_T', 'L_T') +
    poly('shrink-right', 'F',   'R',   'R_T', 'F_T') +
    poly('shrink-front', 'F',   'L',   'L_T', 'F_T')
  );
}

function buildShrinkIsoSvg(linearRatio, heightSvg) {
  const outerSide = SHRINK_BASE;
  const innerSide = SHRINK_BASE * linearRatio;
  // Height (heightSvg) is identical for both boxes — it's 10 real-world ft
  // converted via the same SVG-per-ft scale derived from the outer floor.
  return `
    <svg preserveAspectRatio="xMidYMid meet">
      <g class="shrink-box shrink-box-outer">${buildShrinkBox(outerSide, outerSide, heightSvg)}</g>
      <g class="shrink-box shrink-box-inner"
         data-ratio="${linearRatio.toFixed(4)}"
         data-h="${heightSvg.toFixed(2)}">
        ${buildShrinkBox(innerSide, innerSide, heightSvg)}
      </g>
    </svg>
  `;
}

function renderShrinkingHome() {
  const district = document.querySelector('.selector-row[data-group="district"] .selector-pill.active')?.dataset.value;
  const type     = document.querySelector('.selector-row[data-group="type"] .selector-pill.active')?.dataset.value;
  if (!district || !type || !medianPpsf?.[district]?.[type]) return;

  const ppsf2014 = medianPpsf[district][type][2014];
  const ppsf2024 = medianPpsf[district][type][2024];
  const budget = userBudget || 500000;

  const sqftRaw2014 = budget / ppsf2014;
  const sqftRaw2024 = budget / ppsf2024;
  const sqft2014 = roundSqft(sqftRaw2014);
  const sqft2024 = roundSqft(sqftRaw2024);
  const br2014 = effectiveBedroomLabel(type, sqft2014);
  const br2024 = effectiveBedroomLabel(type, sqft2024);

  // Linear scale = sqrt(area ratio) so visual proportions match floor area
  const linearRatio = Math.sqrt(sqftRaw2024 / sqftRaw2014);

  // Real-world units: outer floor side in feet = √(sqft_2014).
  // SVG-per-foot scale = SHRINK_BASE / outer_floor_ft.
  // 10-ft ceiling in SVG = CEILING_FT × svgPerFt — same for both boxes.
  const outerFloorFt = Math.sqrt(sqftRaw2014);
  const svgPerFt = SHRINK_BASE / outerFloorFt;
  const heightSvg = CEILING_FT * svgPerFt;

  // Build the nested-iso comparison
  const wrap = document.getElementById('shrinkIsoWrap');
  wrap.innerHTML = buildShrinkIsoSvg(linearRatio, heightSvg);

  // Tighten viewBox to outer-box + person bbox (covers the full animation range:
  // the inner peaks at outer-size at the start of the shrink animation, so
  // outer's bbox is always the upper envelope). Hide the inner during measurement.
  const svg = wrap.querySelector('svg');
  if (svg) {
    const innerEl = svg.querySelector('.shrink-box-inner');
    if (innerEl) innerEl.style.display = 'none';
    const bbox = svg.getBBox();
    if (innerEl) innerEl.style.display = '';
    const pad = 10;
    svg.setAttribute('viewBox',
      `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + 2 * pad} ${bbox.height + 2 * pad}`
    );
  }

  // Compact stats below the comparison
  const typeLabel = TYPE_LABEL[type] || '';
  document.getElementById('shrinkStat2014').innerHTML = `
    <div class="shrink-stat-year">2014</div>
    <div class="shrink-stat-sqft">${sqft2014.toLocaleString()} sqft</div>
    <div class="shrink-stat-meta">${typeLabel} &middot; ${br2014} &middot; $${ppsf2014}/sqft</div>
  `;
  document.getElementById('shrinkStat2024').innerHTML = `
    <div class="shrink-stat-year">2024</div>
    <div class="shrink-stat-sqft">${sqft2024.toLocaleString()} sqft</div>
    <div class="shrink-stat-meta">${typeLabel} &middot; ${br2024} &middot; $${ppsf2024}/sqft</div>
  `;

  const shrinkPct = Math.max(0, Math.round((1 - sqft2024 / sqft2014) * 100));
  // Branch the headline so a same-bedroom-label outcome doesn't read as "2BR → 2BR".
  const sameLabel = br2014 === br2024;
  const headlineEl = document.getElementById('shrinkHeadline');
  if (sameLabel) {
    headlineEl.innerHTML =
      `Same <span class="neon">${formatCurrency(budget)}</span>, same <span class="neon">${br2014}</span> — ` +
      `but <span class="neon-red">${shrinkPct}%</span> less square footage.`;
  } else {
    headlineEl.innerHTML =
      `Same <span class="neon">${formatCurrency(budget)}</span>. ` +
      `<span class="neon">${br2014}</span> in 2014 &rarr; ` +
      `<span class="neon-red">${br2024}</span> today. ` +
      `Your home shrunk <span class="neon-red">${shrinkPct}%</span>.`;
  }

  // Mirror sqft into the slide-12 share card
  const s14 = document.getElementById('shareSqft14');
  const s24 = document.getElementById('shareSqft24');
  if (s14) s14.textContent = sqft2014.toLocaleString() + ' sqft';
  if (s24) s24.textContent = sqft2024.toLocaleString() + ' sqft';
}

// Animate inner box: floor (W = D) shrinks from outer side to inner side;
// height (heightSvg) stays absolutely fixed since the real-world ceiling is
// 10 ft regardless of sqft. Geometry is regenerated each frame because we
// can't decouple floor from height with a single CSS transform.
function triggerShrinkAnim() {
  const inner = document.querySelector('.shrink-box-inner');
  if (!inner) return;
  const ratio = parseFloat(inner.dataset.ratio);
  const heightSvg = parseFloat(inner.dataset.h);
  if (!ratio || !isFinite(ratio) || ratio >= 1) return;
  if (!heightSvg || !isFinite(heightSvg)) return;

  const startTime = performance.now();
  const duration = 1800;

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);          // ease-out cubic
    const r = 1 - eased * (1 - ratio);             // 1 → ratio
    const side = SHRINK_BASE * r;
    inner.innerHTML = buildShrinkBox(side, side, heightSvg);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============ COST OF TIME — effective mortgage years (Slide 11) ============
//
// "Effective mortgage years" — how many years you'd realistically end up
// paying once life burdens force you to refinance into longer terms.
//
// Base = standard 30-year US mortgage (the actual contract length most
// buyers sign). Life burdens push the effective length longer because:
//   - Each kid / loan / single income eats monthly capacity
//   - To keep the payment manageable you'd refinance to a longer term
//     (or take a 40-year non-QM loan, or a loan modification — all real
//     options that extend total years of payments)
//
// Each burden's year-cost is multiplied by:
//   - priceWeight: same fixed dollar burden eats a bigger share when the
//     mortgage is huge → costs more refinance-years
//   - growthDiscount: real wages grow ~1.2%/yr above inflation → your
//     future self can absorb part of the burden, so the effective term
//     extends LESS than it would if income were flat
//
// priceWeight = (selectedMedian / $785K)^0.7, clamped to [0.7, 4.0]
// growthDiscount = 1 / (1 + 0.012)^15 ≈ 0.836  (15-year midpoint of mortgage)
const COST_PARAMS = {
  baseTerm:            30,  // standard 30-year mortgage (contract length)
  singleIncomePenalty: 10,  // single earner → +10 years (at baseline price, before growth discount)
  perKid:               3,  // each kid → +3 years (at baseline)
  studentLoan:          4,  // student loans → +4 years (at baseline)
  parents:              3,  // supporting parents → +3 years (at baseline)
  baselineMedian:  785000,
  weightExp:          0.7,
  weightMin:          0.7,
  weightMax:          4.0,
  midCareerYears:      15   // typical mortgage midpoint where wage growth has compounded
};

function readCostInputs() {
  const income = document.querySelector('.toggle-row[data-group="income"] .toggle-pill.active')?.dataset.value || 'dual';
  const kids   = parseInt(document.querySelector('.toggle-row[data-group="kids"] .toggle-pill.active')?.dataset.value || '0', 10);
  const burdens = Array.from(document.querySelectorAll('.toggle-row[data-group="burdens"] .toggle-pill.active'))
                       .map(p => p.dataset.value);
  return { income, kids, burdens };
}

function priceWeight() {
  const ratio = selectedMedian / COST_PARAMS.baselineMedian;
  const w = Math.pow(ratio, COST_PARAMS.weightExp);
  return Math.max(COST_PARAMS.weightMin, Math.min(COST_PARAMS.weightMax, w));
}

function computeCostOfTime() {
  const { income, kids, burdens } = readCostInputs();
  const w = priceWeight();

  // Real wage growth eases the burden over time — by the mortgage midpoint,
  // your real income is roughly 20% higher, so burdens cost ~16% less.
  const growthDiscount = 1 / Math.pow(1 + REAL_WAGE_GROWTH, COST_PARAMS.midCareerYears);

  // Sum of burden years at baseline price, before scaling
  let burdenYears = 0;
  if (income === 'single')         burdenYears += COST_PARAMS.singleIncomePenalty;
  burdenYears += COST_PARAMS.perKid * kids;
  if (burdens.includes('loan'))    burdenYears += COST_PARAMS.studentLoan;
  if (burdens.includes('parents')) burdenYears += COST_PARAMS.parents;

  const adjustedBurden = burdenYears * w * growthDiscount;
  // baseTerm + non-negative burden ≥ baseTerm, so no floor needed; no ceiling either —
  // the model lets effective years run as long as the burdens dictate.
  const years = Math.round(COST_PARAMS.baseTerm + adjustedBurden);

  // Monthly displayed = standard 30-year payment (the bank's actual ask).
  const stdMonthly = calcMonthlyMortgage(selectedMedian, COST_PARAMS.baseTerm);

  return {
    years,
    standardTerm: COST_PARAMS.baseTerm,
    monthly: Math.round(stdMonthly / 10) * 10,           // nominal, rounded to $10
    weight: w,
    growthDiscount,
    burdenAddedYears: Math.round(adjustedBurden)
  };
}

function updateCostOfTime() {
  const result = computeCostOfTime();

  // Live update — no count-up animation, just snap to the new values
  document.getElementById('yearsNumber').textContent = result.years.toLocaleString();
  document.getElementById('monthlyPayment').textContent = formatCurrency(result.monthly);

  // Timeline fill: years mapped onto the 22→100 lifespan band (78 years total).
  const lifeYears = 78;
  const fillPct = Math.min(100, (result.years / lifeYears) * 100);
  document.getElementById('timelineFill').style.width = fillPct.toFixed(1) + '%';

  // Reposition the "Pay off home" milestone to wherever the years end
  const payoff = document.getElementById('milestonePayoff');
  const payoffAge = document.getElementById('milestonePayoffAge');
  if (payoff)    payoff.style.left = fillPct.toFixed(1) + '%';
  if (payoffAge) payoffAge.textContent = Math.min(100, 22 + result.years);

  // Share-card fields
  const shareYearsEl = document.getElementById('shareYears');
  if (shareYearsEl) shareYearsEl.textContent = result.years + ' years';
  const shareMonthlyEl = document.getElementById('shareMonthly');
  if (shareMonthlyEl) shareMonthlyEl.textContent = formatCurrency(result.monthly);
  return result;
}

// Auto-stagger below-bar milestones into 2 rows so close-together ages
// (e.g. Marry @30, First child @32) don't overlap. Pay off home (above)
// and the end cap (100) are excluded from the stagger.
const STAGGER_MIN_PX = 70;  // min center-to-center distance to fit a 2-line label

function staggerMilestones() {
  const bar = document.querySelector('#slide-mortgage .timeline-bar');
  if (!bar) return;
  const barWidth = bar.getBoundingClientRect().width;
  if (!barWidth) return;

  // Below-bar milestones only (not the above-bar pay-off, not the end-cap)
  const items = Array.from(document.querySelectorAll(
    '#slide-mortgage .milestones-below .milestone:not(.milestone-end)'
  ));
  // Sort left-to-right by their style.left percentage
  items.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));

  let lastRow1 = -Infinity;
  let lastRow2 = -Infinity;
  items.forEach(item => {
    const leftPct = parseFloat(item.style.left) || 0;
    const px = (leftPct / 100) * barWidth;
    item.classList.remove('milestone-row-2');
    if (px - lastRow1 >= STAGGER_MIN_PX) {
      lastRow1 = px;
    } else if (px - lastRow2 >= STAGGER_MIN_PX) {
      item.classList.add('milestone-row-2');
      lastRow2 = px;
    } else {
      // Both rows occupied within min-sep — accept overlap on row 1
      lastRow1 = px;
    }
  });
}

window.addEventListener('resize', staggerMilestones);

// Backwards-compat alias used by onSlideEnter
function animateMortgage() {
  if (mortgageAnimated) return;
  mortgageAnimated = true;
  const result = computeCostOfTime();

  countUp(document.getElementById('yearsNumber'), 0, result.years, 1500, false);
  countUp(document.getElementById('monthlyPayment'), 0, result.monthly, 1500, true);

  const lifeYears = 78;
  const fillPct = Math.min(100, (result.years / lifeYears) * 100);
  setTimeout(() => {
    document.getElementById('timelineFill').style.width = fillPct.toFixed(1) + '%';
    const payoff = document.getElementById('milestonePayoff');
    const payoffAge = document.getElementById('milestonePayoffAge');
    if (payoff)    payoff.style.left = fillPct.toFixed(1) + '%';
    if (payoffAge) payoffAge.textContent = Math.min(100, 22 + result.years);
  }, 300);

  const shareYearsEl = document.getElementById('shareYears');
  if (shareYearsEl) shareYearsEl.textContent = result.years + ' years';
  const shareMonthlyEl = document.getElementById('shareMonthly');
  if (shareMonthlyEl) shareMonthlyEl.textContent = formatCurrency(result.monthly);
}

// ============ WRAPPED INTRO SEQUENCE (Slide 5) ============
const phases = [
  document.getElementById('introPhase1'),
  document.getElementById('introPhase2'),
  document.getElementById('introPhase3'),
  document.getElementById('introPhase4')
];
let currentPhase = -1;
let introComplete = false;
const PHASE_DURATION = 2200;

function showPhase(idx) {
  phases.forEach((p, i) => {
    if (i < idx) {
      p.classList.remove('active');
      p.classList.add('exit');
    } else if (i === idx) {
      p.classList.remove('exit');
      p.classList.add('active');
    } else {
      p.classList.remove('active', 'exit');
    }
  });
}

// Show phase 0 only; user advances manually with the Next button.
function runIntroSequence() {
  currentPhase = 0;
  showPhase(0);
  const nextWrap = document.getElementById('introNextWrap');
  if (nextWrap) nextWrap.classList.remove('hidden');
}

// Step the intro forward one phase. Triggers count-up animations on entry to
// phases 1 and 2; hides the Next button on phase 3 (final headline has its own).
function advanceIntro() {
  if (currentPhase >= 3) return;
  currentPhase++;
  showPhase(currentPhase);

  if (currentPhase === 1) {
    const el = document.getElementById('statEarly');
    let val = 0;
    const timer = setInterval(() => {
      val++;
      el.textContent = val + '%';
      if (val >= 5) clearInterval(timer);
    }, 80);
  } else if (currentPhase === 2) {
    const el = document.getElementById('statNow');
    let val = 0;
    const timer = setInterval(() => {
      val += 2;
      if (val > 38) val = 38;
      el.textContent = val + '%';
      if (val >= 38) clearInterval(timer);
    }, 40);
  } else if (currentPhase === 3) {
    introComplete = true;
    const nextWrap = document.getElementById('introNextWrap');
    if (nextWrap) nextWrap.classList.add('hidden');
  }
}

// ============ SHARE (Slide 12) ============
function shareCard() {
  if (navigator.share) {
    navigator.share({
      title: 'Boston Housing Wrapped 2026',
      text: 'I just took the Boston Housing Wrapped quiz. Can you outbid the investors?',
      url: window.location.href
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const btn = document.querySelector('#slide-share .btn');
      btn.textContent = 'Link Copied!';
      setTimeout(() => btn.textContent = 'Share', 2000);
    }).catch(() => {});
  }
}

// ============ TOUCH NAVIGATION ============
let touchStartY = 0;
document.addEventListener('touchstart', e => {
  // Don't track touch on interactive controls
  if (e.target.closest('input, button, .slider-container, .year-slider-wrap, .currency-input-wrap')) return;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (e.target.closest('input, button, .slider-container, .year-slider-wrap, .currency-input-wrap')) return;
  const diff = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(diff) < 50) return;
  if (diff > 0) nextSlide();
  else prevSlide();
}, { passive: true });

// ============ INIT ============
window.addEventListener('load', async () => {
  // Trigger first slide animations
  onSlideEnter(slides[0]);
  updateCompetitionCards('Dorchester');
  loadAdvantageData();

  // Map init
  await buildMap();
  buildShiftGrid();
  updateMap(2004);
  initYearSlider();
  initParticles();

  // Seed slide 10's iso pair with default selections so direct dot-nav has content
  renderShrinkingHome();

  // Hunt-right preview (slide 9)
  buildHuntMap();
  updateHuntDistrict();
  updateHuntType();

  // Stagger life-stage milestones (slide 11)
  staggerMilestones();

  initInfoPopovers();
});

function toggleOverlay(show) {
  const overlay = document.getElementById('resourceOverlay');
  if (show) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}
