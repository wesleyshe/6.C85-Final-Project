// ============ HELPERS ============
function formatCurrency(n) {
  return '$' + n.toLocaleString('en-US');
}

function countUp(el, start, end, duration, isCurrency) {
  // Hooks into the settle tracker (defined later) so the scroll-cue waits
  // until this count-up finishes, not just CSS transitions.
  if (typeof beginAnim === 'function') beginAnim();
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    el.textContent = isCurrency ? formatCurrency(current) : current.toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
    else if (typeof endAnim === 'function') endAnim();
  }
  requestAnimationFrame(tick);
}

// ============ GLOBALS ============
const slides = document.querySelectorAll('.slide');
let userGuessSlide2 = 500000;
let userBudget = 500000;
let currentSlideIdx = 0;
let isTransitioning = false;

// ============ PROPERTY DATA (Slide 3) ============
const propertyPool = [
    {
        img: "asset/dorchester_chelmsford.png",
        label: "12 Chelmsford St, Dorchester • 6 Bed • 2 Bath",
        price2026: 1245000,
        price2013: 388800,
        price2003: 280000
    },
    {
        img: "asset/east_boston_brooks.png",
        label: "54 Brooks St, East Boston • 11 Bed • 3 Bath",
        price2026: 1430000,
        price2013: 310000,
        price2003: 185000
    },
    {
        img: "asset/fenway_queensberry.png",
        label: "60 Queensberry St, Fenway • 1 Bed • 1 Bath",
        price2026: 552500,
        price2013: 285000,
        price2003: 220000
    },
    {
        img: "asset/roxbury_st_james.png",
        label: "16 Saint James St, Roxbury • 3 Bed • 2 Bath",
        price2026: 550000,
        price2013: 240000,
        price2003: 165000
    },
    {
        img: "asset/southie_linden.png",
        label: "19 Linden St, South Boston • 5 Bed • 3 Bath",
        price2026: 1635000,
        price2013: 580000,
        price2003: 395000
    },
    {
        img: "asset/seaport_blvd.png",
        label: "133 Seaport Blvd, Seaport • 1 Bed • 1 Bath",
        price2026: 1294000,
        price2013: 0,
        price2003: 0
    }
];

// Slide-guess random property pick (chosen once on load).
let selectedPropertySlide3 = null;

// Mortgage model — used by computeCostOfTime + refreshRealityFromSelections.
const MORTGAGE_RATE    = 0.07;   // Freddie Mac PMMS ~2024
const STANDARD_TERM    = 30;     // standard US 30-year mortgage
const DOWN_PAYMENT_PCT = 0.20;   // conventional 20% down
const REAL_WAGE_GROWTH = 0.012;  // ~1.2%/yr real wage growth (BLS/FRED)

// Live median price for the user's hunt selection. Re-derived on each
// hunt change and on slide-reality / slide-mortgage entry.
let selectedMedian = MEDIAN_PRICE;

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


// ============ CHAPTER CHIP ============
// A single bottom-right chip showing the current chapter only. Updated on every
// slide navigation. Slides carry a data-chapter="1..4" attribute. The chip is
// hidden on Chapter 4 share/resources slides (final outcome, no nav chrome).
const CHAPTER_TITLES = {
  '1': 'Background',
  '2': 'Current Status',
  '3': 'Reasons Behind',
  '4': 'The Cost'
};

const chapterChip       = document.getElementById('chapterChip');
const chapterChipNum    = document.getElementById('chapterChipNum');
const chapterChipName   = document.getElementById('chapterChipName');
const chapterChipProg   = document.getElementById('chapterChipProgress');
const chapterChipMenu   = document.getElementById('chapterChipMenu');

// Group slide indices by chapter, preserving DOM order.
const chapterGroups = (() => {
  const groups = new Map();
  slides.forEach((s, i) => {
    const ch = s.dataset.chapter || '1';
    if (!groups.has(ch)) groups.set(ch, []);
    groups.get(ch).push(i);
  });
  return groups;
})();

// Build the hover menu once — one item per chapter, themed with that
// chapter's accent. Click jumps to the first slide of the chapter.
(function buildChipMenu() {
  if (!chapterChipMenu) return;
  chapterGroups.forEach((slideIndices, chapter) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chip-menu-item';
    item.dataset.chapter = chapter;
    item.setAttribute('role', 'menuitem');
    item.setAttribute('aria-label', `Jump to chapter ${chapter}: ${CHAPTER_TITLES[chapter] || ''}`);
    item.innerHTML =
      `<span class="chip-menu-num">${chapter.padStart(2, '0')}</span>` +
      `<span class="chip-menu-name">${CHAPTER_TITLES[chapter] || ''}</span>`;
    item.addEventListener('click', () => {
      goToSlide(slideIndices[0], true);
      chapterChip?.classList.remove('open');
    });
    chapterChipMenu.appendChild(item);
  });
})();

// Touch / tap support — hover doesn't fire on touch devices, so tapping
// the chip body (not the sub-dots inside the progress strip, and not a
// menu item) toggles the menu. A document-level tap-outside listener
// closes it again.
chapterChip?.addEventListener('click', (e) => {
  if (e.target.closest('.chip-dot') || e.target.closest('.chip-menu-item')) return;
  chapterChip.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!chapterChip) return;
  if (!chapterChip.contains(e.target)) chapterChip.classList.remove('open');
});

function updateDots(idx) {
  // Update the chapter chip + body[data-chapter] so per-chapter palettes apply.
  const slide = slides[idx];
  const chapter = slide?.dataset.chapter || '1';
  document.body.setAttribute('data-chapter', chapter);

  if (!chapterChip) return;
  chapterChip.dataset.chapter = chapter;
  chapterChipNum.textContent  = chapter.padStart(2, '0');
  chapterChipName.textContent = CHAPTER_TITLES[chapter] || '';

  // Rebuild sub-dots whenever the chapter changes (cheap — ≤6 dots).
  const slideIndices = chapterGroups.get(chapter) || [];
  if (chapterChipProg.childElementCount !== slideIndices.length) {
    chapterChipProg.innerHTML = '';
    slideIndices.forEach(slideIdx => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'chip-dot';
      d.dataset.slideIdx = slideIdx;
      d.setAttribute('aria-label', `Slide ${slideIdx + 1}`);
      d.addEventListener('click', () => goToSlide(slideIdx, true));
      chapterChipProg.appendChild(d);
    });
  }
  chapterChipProg.querySelectorAll('.chip-dot').forEach(dot => {
    dot.classList.toggle('active', parseInt(dot.dataset.slideIdx, 10) === idx);
  });

  // Hover-menu: highlight whichever item matches the current chapter.
  chapterChipMenu?.querySelectorAll('.chip-menu-item').forEach(item => {
    item.classList.toggle('current', item.dataset.chapter === chapter);
  });

  // Bottom progress bar — accent matches the current chapter.
  const progressBar = document.getElementById('progressBar');
  const progressBarFill = document.getElementById('progressBarFill');
  if (progressBar) progressBar.dataset.chapter = chapter;
  if (progressBarFill && slides.length) {
    const pct = ((idx + 1) / slides.length) * 100;
    progressBarFill.style.width = pct.toFixed(2) + '%';
  }
}

updateDots(0);

// ============ SCROLL CUE + SETTLE TRACKER ============
// Goal: show "Scroll to continue" exactly 500ms after the current slide has
// genuinely stopped animating (not a hardcoded guess). We count active
// CSS transitions/animations scoped to the current slide via
// transitionstart/end and animationstart/end events. JS-driven animations
// (rAF count-ups, the map autoplay loop, the intro sequence) call the
// beginAnim / endAnim helpers explicitly so they're tracked too.
const scrollCueEl    = document.getElementById('scrollCue');
const scrollCueLabel = document.getElementById('scrollCueLabel');

const SETTLE_IDLE_MS = 500;    // how long the slide must be quiet before cue
const SETTLE_MAX_MS  = 15000;  // hard fallback (infinite animations safety)

let settleActive    = 0;
let settleIdleTimer = null;
let settleMaxTimer  = null;
let cueShownForIdx  = -1;

// Slides whose action button must be clicked before the scroll-cue may appear.
// Each entry checks whether the action's "completed" state element is visible.
function isCueGatedByAction(slide) {
  if (slide.id === 'slide-welcome') return !welcomeStarted; // Begin button click
  if (slide.id === 'slide-hunt') {
    return !document.getElementById('huntTypeDesc')?.classList.contains('confirmed');
  }
  if (slide.id === 'slide-guess') {
    return !document.getElementById('revealArea')?.classList.contains('show');
  }
  return false;
}

function scrollCueFire() {
  if (cueShownForIdx === currentSlideIdx) return;
  const slide = slides[currentSlideIdx];
  if (!slide || !scrollCueEl) return;
  // Last slide has nowhere to go.
  if (slide.id === 'slide-credits') return;
  // Required-action slides: don't show until the button has been clicked.
  if (isCueGatedByAction(slide)) return;
  cueShownForIdx = currentSlideIdx;
  if (scrollCueLabel) scrollCueLabel.textContent = 'Scroll to continue';
  scrollCueEl.classList.add('show');
}

function settleCheck() {
  clearTimeout(settleIdleTimer);
  if (settleActive > 0) return;
  settleIdleTimer = setTimeout(scrollCueFire, SETTLE_IDLE_MS);
}

function beginAnim() {
  settleActive++;
  clearTimeout(settleIdleTimer);
}
function endAnim() {
  settleActive = Math.max(0, settleActive - 1);
  settleCheck();
}

// Scope event tracking to the CURRENT slide only — stray events from
// off-screen slides (or the chip / progress bar) don't count.
function _evtIsOnCurrentSlide(e) {
  if (!e.target || !e.target.closest) return false;
  return e.target.closest('.slide') === slides[currentSlideIdx];
}
['transitionstart', 'animationstart'].forEach(t =>
  document.addEventListener(t, e => { if (_evtIsOnCurrentSlide(e)) beginAnim(); })
);
['transitionend', 'transitioncancel', 'animationend', 'animationcancel'].forEach(t =>
  document.addEventListener(t, e => { if (_evtIsOnCurrentSlide(e)) endAnim(); })
);

function hideScrollCue() {
  clearTimeout(settleIdleTimer);
  clearTimeout(settleMaxTimer);
  cueShownForIdx = -1;
  scrollCueEl?.classList.remove('show');
}

function scheduleScrollCue(slide) {
  hideScrollCue();
  // Fresh per-slide settle state — stale counts from the previous slide
  // (events that fired after we navigated away) get reset here.
  settleActive = 0;
  if (!slide || !scrollCueEl) return;
  // Skip slides where the cue is replaced by an explicit button (welcome →
  // "Begin") or there's no "continue" target (final resources slide).
  if (slide.id === 'slide-welcome' || slide.id === 'slide-credits') return;
  // Kick off the idle countdown. For action-gated slides (hunt, guess) the
  // cue stays hidden until the button is clicked — handled in scrollCueFire.
  settleCheck();
  settleMaxTimer = setTimeout(scrollCueFire, SETTLE_MAX_MS);
}

// ============ SLIDE NAVIGATION ============
const TRANSITION_DURATION = 1600; // ms lock between scroll navigations

function goToSlide(i, force) {
  if (i < 0 || i >= slides.length) return;
  if (!force && (i === currentSlideIdx || isTransitioning)) return;

  isTransitioning = true;
  currentSlideIdx = i;
  hideScrollCue();

  slides[i].scrollIntoView({ behavior: 'smooth' });
  updateDots(i);
  onSlideEnter(slides[i]);
  scheduleScrollCue(slides[i]);

  // Lock out further scroll/wheel/key navigation until transition completes
  setTimeout(() => { isTransitioning = false; }, TRANSITION_DURATION);
}

// Forward scroll/key/touch is BLOCKED on slides that have a required action
// button. The user must click that button to advance — scroll alone does not
// trigger it. Returns true to swallow the scroll without navigating.
let welcomeStarted = false;
function consumePendingAction() {
  const id = slides[currentSlideIdx]?.id;

  // Landing slide: must click the "Begin" button.
  if (id === 'slide-welcome' && !welcomeStarted) return true;

  // Hunt: must click Confirm (which marks #huntTypeDesc as .confirmed).
  if (id === 'slide-hunt') {
    const desc = document.getElementById('huntTypeDesc');
    if (desc && !desc.classList.contains('confirmed')) return true;
  }

  // Guess: must click Reveal (which reveals #revealArea).
  if (id === 'slide-guess') {
    const revealArea = document.getElementById('revealArea');
    if (revealArea && !revealArea.classList.contains('show')) return true;
  }

  return false;
}

function nextSlide() {
  if (consumePendingAction()) return;
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
    // Refresh in case the user reached this slide via the chapter nav without
    // passing through Reality (which is where selectedMedian is normally set).
    refreshRealityFromSelections();
    animateMortgage();
    staggerMilestones();
  }
  if (slide.id === 'slide-share') {
    renderShrinkingHome();
    updateCostOfTime();
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

// ============ REVEAL PRICE (Slide 3) ============
function revealPrice() {
  const btn = document.getElementById('revealBtn');
  const sliderArea = document.getElementById('sliderArea');
  const revealArea = document.getElementById('revealArea');
  const priceDisplay = document.getElementById('priceDisplay');

  btn.style.display = 'none';
  sliderArea.style.display = 'none';
  priceDisplay.style.display = 'none';

  const subheadline = document.querySelector('#slide-guess .subheadline');
  if (subheadline) subheadline.style.display = 'none';

  revealArea.classList.add('show');
  revealArea.querySelectorAll('.anim').forEach(el => el.classList.add('visible'));


  const actual = selectedPropertySlide3.price2026;
  const diff = userGuessSlide2 - actual;
  const guessEl = document.getElementById('userGuessStrike');
  let deltaHtml = '';
  if (diff < 0) {
    // Guessed too low — actual price was higher. Red = "too far down".
    deltaHtml = `<span class="guess-delta guess-delta-low">−${formatCurrency(Math.abs(diff))} too low</span>`;
  } else if (diff > 0) {
    // Guessed too high — actual price was lower. Green = "too far up".
    deltaHtml = `<span class="guess-delta guess-delta-high">+${formatCurrency(diff)} too high</span>`;
  } else {
    deltaHtml = `<span class="guess-delta guess-delta-exact">Exact!</span>`;
  }
  guessEl.innerHTML =
    `<span class="strike">Your guess: ${formatCurrency(userGuessSlide2)}</span> ${deltaHtml}`;

  countUp(document.getElementById('actualPriceEl'), 0, actual, 1500, true);
  // Reveal complete — the scroll-cue may now appear once everything settles.
  scheduleScrollCue(slides[currentSlideIdx]);
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
  // Track for the donut hover handler — uses this to look up percentages.
  currentMixHood = name;

  const nonInvestorPct = roundedPct(data.nonInvestor, data.total);
  const smallPct = roundedPct(data.small, data.total);
  const mediumPct = roundedPct(data.medium, data.total);
  const largePct = roundedPct(data.large, data.total);
  const institutionalPct = roundedPct(data.institutional, data.total);

  const investorTotal =
    data.small + data.medium + data.large + data.institutional;
  const investorPct = roundedPct(investorTotal, data.total);

  // Card stats live on the "Meet the Players" slide; guard in case they're
  // ever absent (e.g. during slide-prep transitions).
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  setText('nonInvestorCard',  `${nonInvestorPct}%`);
  setText('smallCard',        `${smallPct}%`);
  setText('mediumCard',       `${mediumPct}%`);
  setText('largeCard',        `${largePct}%`);
  setText('institutionalCard',`${institutionalPct}%`);

  const callout = document.getElementById('competitionCallout');
  if (callout) callout.innerHTML =
    `In <span>${name}</span>, <span>${investorPct}%</span> of buyers are investors.`;

  if (donutAnimated) drawDonut(data);
}

function animateDonut() {
  if (donutAnimated) return;
  donutAnimated = true;
  drawDonut(neighborhoodMix['Dorchester']);
}

// ============ DONUT HOVER (Slide: Buyer breakdown) ============
// On hover over a segment, swap the center label to show that category's
// name + share for the currently-selected neighborhood. Reset on leave.
const DCL_DEFAULT_TOP = 'BUYER';
const DCL_DEFAULT_BOT = 'BREAKDOWN';

function setCenterLabel(top, bot, color) {
  const el = document.getElementById('donutCenterLabel');
  if (!el) return;
  el.querySelector('.dcl-line1').textContent = top;
  el.querySelector('.dcl-line2').textContent = bot;
  el.style.color = color || '';
}

document.querySelectorAll('.donut-segment[data-key]').forEach(seg => {
  seg.addEventListener('mouseenter', () => {
    const data = neighborhoodMix[currentMixHood];
    if (!data) return;
    const key = seg.dataset.key;
    const label = seg.dataset.label || '';
    const p = roundedPct(data[key], data.total);
    const color = seg.getAttribute('stroke') || '';
    // Resolve CSS variable strokes (var(--white) etc) at runtime.
    const resolved = color.startsWith('var(')
      ? getComputedStyle(seg).getPropertyValue('stroke').trim()
      : color;
    setCenterLabel(`${p}%`, label.toUpperCase(), resolved);
  });
  seg.addEventListener('mouseleave', () => {
    setCenterLabel(DCL_DEFAULT_TOP, DCL_DEFAULT_BOT, '');
  });
});

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

  const nonInvestors = clean.filter(d => d.group === 'Non-investors');
  const investors    = clean.filter(d => d.group === 'Investors');

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

  function avgPriceChange(group) {
    const valid = group
      .map(d => d.priceDiffPct)
      .filter(v => Number.isFinite(v));
    if (!valid.length) return 0;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
  }

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

// ============ SELECTOR PILLS (Slide: Pick Your Dream Home) ============
// When hunt selections change, invalidate downstream animation flags so the
// next visit to Reality or Mortgage re-animates with the new median.
document.querySelectorAll('.selector-row').forEach(row => {
  row.querySelectorAll('.selector-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      row.querySelectorAll('.selector-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const g = row.dataset.group;
      if (g === 'district') updateHuntDistrict();
      if (g === 'type')     updateHuntType();
      // Hunt selection changed — downstream stats are now stale.
      medianAnimated = false;
      mortgageAnimated = false;
      refreshRealityFromSelections();
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
  // Skip if bbox is degenerate (SVG in a display:none subtree returns zeros)
  // — we'll re-run this once the column becomes visible.
  dot.style.display = 'none';
  ring.style.display = 'none';
  const bbox = svg.getBBox();
  dot.style.display = '';
  ring.style.display = '';
  if (bbox.width > 1 && bbox.height > 1) {
    const pad = 4;
    svg.setAttribute('viewBox',
      `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + 2 * pad} ${bbox.height + 2 * pad}`
    );
  }
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
  // Don't overwrite the post-confirm "Remember your dream house!" message
  // even if the user toggles a Type pill afterwards.
  const desc = document.getElementById('huntTypeDesc');
  if (desc && !desc.classList.contains('confirmed')) desc.textContent = info.desc;

  // Tighten viewBox to the building's actual bbox so it sits centered in the wrap.
  // Skip when bbox is degenerate (e.g. SVG is in a display:none subtree on
  // mobile pre-confirm) — keep the default 0 0 240 220 so the shape stays
  // visible, and we'll re-call this after the column becomes visible.
  const svg = wrap.querySelector('svg');
  if (svg) {
    const bbox = svg.getBBox();
    if (bbox.width > 1 && bbox.height > 1) {
      const pad = 6;
      svg.setAttribute('viewBox',
        `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + 2 * pad} ${bbox.height + 2 * pad}`
      );
    }
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

  const diff = Math.abs(selectedMedian - userBudget);
  const diffCopy = diff === 0
    ? 'You nailed it'
    : userBudget < selectedMedian
      ? formatCurrency(diff) + ' under median'
      : formatCurrency(diff) + ' over median';

  document.getElementById('guessComparison').textContent = 'You guessed ' + formatCurrency(userBudget);
  document.getElementById('guessDiff').textContent = diffCopy;

  document.getElementById('shareGuess').innerHTML =
    formatCurrency(userBudget) + ' &rarr; <span class="neon">' + formatCurrency(selectedMedian) + '</span>';
}

// ============ BEGIN (slide-welcome) ============
// Clicking "Begin" is the only way out of the landing slide — scroll is
// blocked until welcomeStarted is true.
function beginExperience() {
  welcomeStarted = true;
  goToSlide(currentSlideIdx + 1, true);
}

// ============ HUNT CONFIRM (slide-hunt) ============
// Locks in the user's selection and bridges into the Guess slide with a
// "Remember your dream house — we'll get back to it" message. No slide change;
// the user scrolls forward when they're ready.
function confirmHunt() {
  const desc = document.getElementById('huntTypeDesc');
  const btn  = document.getElementById('huntConfirmBtn');
  if (!desc) return;

  // Save the user's intent for downstream slides (already auto-refreshed on
  // slide-reality enter, but this is also a good moment to sync explicitly).
  refreshRealityFromSelections();

  // Replace the property-type description in the right preview card with the
  // confirmation. Selectors on the left stay visible so the reader can still
  // see what they picked. The .confirmed flag is the "action done" marker.
  const newDescHTML =
    `<strong class="confirmed-title">Remember your dream house!</strong>` +
    `<span class="confirmed-sub">We'll get back to it.</span>`;
  const form = document.getElementById('huntForm');
  // Use visibility (not display:none) so the button's box still reserves
  // space — otherwise the left column shifts down once the CTA disappears.
  if (btn) { btn.style.visibility = 'hidden'; btn.style.pointerEvents = 'none'; }

  if (window.matchMedia('(max-width: 767px)').matches) {
    // Mobile: fade the left options out FIRST, then bring the right-column
    // visualization in. Otherwise both happen at once and the right column
    // visibly snaps upward when the left collapses out of the layout.
    const huntLeft = document.getElementById('huntLeft');
    if (huntLeft) {
      huntLeft.style.transition = 'opacity 0.35s ease';
      huntLeft.style.opacity = '0';
      huntLeft.style.pointerEvents = 'none';
    }
    setTimeout(() => {
      if (huntLeft) huntLeft.style.display = 'none';
      desc.innerHTML = newDescHTML;
      desc.classList.add('confirmed');
      form?.classList.add('confirmed');
      // Right column was display:none until just now, so any viewBox tightening
      // done earlier ran against a zero-bbox SVG. Re-run now that the SVGs
      // have layout — and on the next frame so styles flush first.
      requestAnimationFrame(() => {
        buildHuntMap();
        updateHuntDistrict();
        updateHuntType();
      });
    }, 380);
  } else {
    // Desktop: both columns stay visible — swap the desc immediately.
    desc.innerHTML = newDescHTML;
    desc.classList.add('confirmed');
    form?.classList.add('confirmed');
  }

  scheduleScrollCue(slides[currentSlideIdx]);
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

// ============ SHARE (Slide 12) ============
// Build the user-specific result text from the live share-card values.
function buildShareText() {
  const txt = (id) => (document.getElementById(id)?.textContent || '').trim();
  const guess  = txt('shareGuess').replace(/\s+/g, ' ');
  const years  = txt('shareYears');
  const month  = txt('shareMonthly');
  return `My Boston Housing Wrapped: ${guess}. ${month}/mo for ${years}. See your number — `;
}

function showShareToast(msg) {
  const toast = document.getElementById('shareToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showShareToast._t);
  showShareToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
}

// Primary CTA — prefers native share sheet on mobile; falls back to copy.
function shareCard() {
  const text = buildShareText();
  const url  = window.location.href;
  if (navigator.share) {
    navigator.share({ title: 'Boston Housing Wrapped 2026', text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text + url)
      .then(() => showShareToast('Link & result copied'))
      .catch(() => showShareToast('Could not copy — please copy the URL manually'));
  }
}

// Social row — each target gets its own behavior.
function shareTo(target) {
  const text = buildShareText();
  const url  = window.location.href;
  const enc  = encodeURIComponent;

  if (target === 'copy') {
    navigator.clipboard.writeText(url)
      .then(() => showShareToast('Link copied to clipboard'))
      .catch(() => showShareToast('Could not copy link'));
    return;
  }

  if (target === 'twitter') {
    const intent = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
    window.open(intent, '_blank', 'noopener,noreferrer,width=620,height=520');
    return;
  }

  if (target === 'instagram') {
    // Instagram has no public web-share intent; copy a caption the user can paste.
    navigator.clipboard.writeText(text + url)
      .then(() => showShareToast('Caption copied — paste it into your Instagram story or post'))
      .catch(() => showShareToast('Could not copy caption'));
    return;
  }

  if (target === 'sms') {
    // Native share sheet handles SMS best when available; otherwise sms: link.
    if (navigator.share) {
      navigator.share({ title: 'Boston Housing Wrapped 2026', text, url }).catch(() => {});
    } else {
      window.location.href = `sms:?&body=${enc(text + url)}`;
    }
    return;
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
  scheduleScrollCue(slides[0]);
  initSlide3Random();

  updateCompetitionCards('Dorchester');
  loadAdvantageData();

  // Map init
  await buildMap();
  buildShiftGrid();
  updateMap(2004);
  initYearSlider();

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

function initSlide3Random() {
    const randomIndex = Math.floor(Math.random() * propertyPool.length);
    selectedPropertySlide3 = propertyPool[randomIndex];

    //
    const imgEl = document.getElementById('propertyImg');
    const labelEl = document.getElementById('propertyLabel');

    if (imgEl) imgEl.src = selectedPropertySlide3.img;
    if (labelEl) labelEl.textContent = selectedPropertySlide3.label;

    //
    const p2003 = selectedPropertySlide3.price2003 > 0 ? formatCurrency(selectedPropertySlide3.price2003) : "N/A (Parking lot)";
    const p2013 = selectedPropertySlide3.price2013 > 0 ? formatCurrency(selectedPropertySlide3.price2013) : "N/A (Under development)";

    const hist2003El = document.getElementById('hist2003');
    const hist2013El = document.getElementById('hist2013');

    if (hist2003El) hist2003El.textContent = "In 2003: " + p2003;
    if (hist2013El) hist2013El.textContent = "In 2013: " + p2013;
}
