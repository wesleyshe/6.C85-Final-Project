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
  if (slide.id === 'slide-reality') animateMedianPrice();
  if (slide.id === 'slide-mortgage') animateMortgage();

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

// ============ SELECTOR PILLS (Slide 8) ============
document.querySelectorAll('.selector-row').forEach(row => {
  row.querySelectorAll('.selector-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      row.querySelectorAll('.selector-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });
});

// ============ TOGGLE PILLS (Slide 10) ============
document.querySelectorAll('.toggle-row .toggle-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.toggle-row .toggle-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
  });
});

// ============ CURRENCY INPUT (Slide 8) ============
const budgetInput = document.getElementById('budgetInput');
budgetInput.addEventListener('input', () => {
  let raw = budgetInput.value.replace(/[^0-9]/g, '');
  if (raw === '') { budgetInput.value = ''; userBudget = 0; return; }
  userBudget = parseInt(raw);
  budgetInput.value = formatCurrency(userBudget);
});

budgetInput.addEventListener('focus', () => {
  let raw = budgetInput.value.replace(/[^0-9]/g, '');
  budgetInput.value = raw;
});

budgetInput.addEventListener('blur', () => {
  let raw = budgetInput.value.replace(/[^0-9]/g, '');
  if (raw === '') return;
  userBudget = parseInt(raw);
  budgetInput.value = formatCurrency(userBudget);
});

// ============ SHOW REALITY (Slide 8 → 9) ============
function showReality() {
  document.getElementById('guessComparison').textContent = 'You guessed ' + formatCurrency(userBudget);
  const diff = Math.abs(MEDIAN_PRICE - userBudget);
  document.getElementById('guessDiff').textContent = 'You were ' + formatCurrency(diff) + ' off';

  document.getElementById('shareGuess').innerHTML =
    formatCurrency(userBudget) + ' &rarr; <span class="neon">' + formatCurrency(ACTUAL_PRICE) + '</span>';

  scrollToId('slide-reality');
}

// ============ ANIMATE MEDIAN PRICE (Slide 9) ============
function animateMedianPrice() {
  if (medianAnimated) return;
  medianAnimated = true;
  countUp(document.getElementById('medianPrice'), 0, MEDIAN_PRICE, 1500, true);
}

// ============ ANIMATE MORTGAGE (Slide 10) ============
function animateMortgage() {
  if (mortgageAnimated) return;
  mortgageAnimated = true;

  countUp(document.getElementById('yearsNumber'), 0, 27, 1500, false);
  countUp(document.getElementById('monthlyPayment'), 0, 3847, 1500, true);

  setTimeout(() => {
    document.getElementById('timelineFill').style.width = '56%';
  }, 300);
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

// ============ SHARE (Slide 11) ============
function shareCard() {
  if (navigator.share) {
    navigator.share({
      title: 'Boston Housing Wrapped 2024',
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
