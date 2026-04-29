// ============ BUILD MAP ============
// Flip to false to revert to the original hand-drawn shapes.
const USE_GEOJSON = true;

function buildMap() {
  return USE_GEOJSON ? buildMapGeoJSON() : buildMapHandDrawn();
}

function shortLabel(name) {
  if (name === 'South Boston Waterfront') return 'SB Waterfront';
  if (name === 'Jamaica Plain') return 'JP';
  if (name === 'South Boston') return 'S. Boston';
  if (name === 'East Boston') return 'E. Boston';
  if (name === 'West Roxbury') return 'W. Roxbury';
  return name;
}

function attachPathHandlers(path, name) {
  path.addEventListener('mouseenter', (e) => showTooltip(e, name));
  path.addEventListener('mousemove', (e) => moveTooltip(e));
  path.addEventListener('mouseleave', hideTooltip);
  path.addEventListener('click', () => selectNeighborhood(name));
}

// ---------- GeoJSON-based map (real Boston neighborhood shapes) ----------
// Reads from inlined BOSTON_NEIGHBORHOODS_GEOJSON in js/geojson.js — no fetch
// needed, so double-clicking index.html works (file:// blocks fetch).
function buildMapGeoJSON() {
  const container = document.getElementById('mapSvgWrap');
  container.innerHTML = '';

  const geojson = BOSTON_NEIGHBORHOODS_GEOJSON;

  // Skip Harbor Islands (offshore, no corp data).
  const features = geojson.features.filter(f =>
    f.properties.blockgr2020_ctr_neighb_name !== 'Harbor Islands'
  );

  // Mercator-ish projection: scale longitude by cos(centerLat) to correct
  // the north-south stretch that plain lat/lon would cause at Boston's latitude.
  const centerLat = 42.31;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  const proj = ([lon, lat]) => [lon * cosLat, -lat]; // negate lat so north is up

  // Compute bounding box across all features in projected space.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  features.forEach(f => {
    const polys = f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates
      : [f.geometry.coordinates];
    polys.forEach(poly => poly.forEach(ring => ring.forEach(c => {
      const [x, y] = proj(c);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    })));
  });

  // Fit into the existing viewBox preserving aspect ratio.
  const VB_X = 40, VB_Y = 60, VB_W = 400, VB_H = 430;
  const dataW = maxX - minX;
  const dataH = maxY - minY;
  const scale = Math.min(VB_W / dataW, VB_H / dataH);
  const offsetX = VB_X + (VB_W - dataW * scale) / 2;
  const offsetY = VB_Y + (VB_H - dataH * scale) / 2;
  const toSvg = (c) => {
    const [x, y] = proj(c);
    return [offsetX + (x - minX) * scale, offsetY + (y - minY) * scale];
  };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${VB_X} ${VB_Y} ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  features.forEach(feature => {
    const name = feature.properties.blockgr2020_ctr_neighb_name;
    const polys = feature.geometry.type === 'MultiPolygon'
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];

    // Build SVG path "d" string from all polygons (and their outer + holes).
    let d = '';
    polys.forEach(poly => {
      poly.forEach(ring => {
        ring.forEach((coord, i) => {
          const [px, py] = toSvg(coord);
          d += (i === 0 ? 'M' : 'L') + px.toFixed(2) + ',' + py.toFixed(2);
        });
        d += 'Z';
      });
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'neighborhood-path');
    path.setAttribute('data-name', name);
    path.setAttribute('fill', '#1a2a3a');
    attachPathHandlers(path, name);
    svg.appendChild(path);

    // Label position: pick largest polygon (by bbox area). Track its width in
    // SVG units so we can auto-size the font for small neighborhoods.
    let largestPoly = polys[0];
    let largestArea = 0;
    let largestBboxW = 0;
    polys.forEach(poly => {
      let lminX = Infinity, lmaxX = -Infinity, lminY = Infinity, lmaxY = -Infinity;
      poly[0].forEach(c => {
        const [x, y] = proj(c);
        if (x < lminX) lminX = x;
        if (x > lmaxX) lmaxX = x;
        if (y < lminY) lminY = y;
        if (y > lmaxY) lmaxY = y;
      });
      const area = (lmaxX - lminX) * (lmaxY - lminY);
      if (area > largestArea) {
        largestArea = area;
        largestPoly = poly;
        largestBboxW = (lmaxX - lminX) * scale;
      }
    });

    // Area-weighted centroid (shoelace formula) — lands inside the shape
    // instead of drifting to whichever side has more vertices.
    const ring = largestPoly[0].map(toSvg);
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      A += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    A /= 2;
    cx /= (6 * A);
    cy /= (6 * A);

    const label = shortLabel(name);
    let fontSize;
    if (largestBboxW < 25) fontSize = 4;
    else if (largestBboxW < 40) fontSize = 5;
    else if (label.length > 12) fontSize = 6;
    else fontSize = 7;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', cx);
    text.setAttribute('y', cy);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', 'rgba(255,255,255,0.5)');
    text.setAttribute('font-size', fontSize);
    text.setAttribute('font-family', 'Montserrat, sans-serif');
    text.setAttribute('font-weight', '700');
    text.setAttribute('pointer-events', 'none');
    text.textContent = label;
    svg.appendChild(text);
  });

  container.appendChild(svg);

  // Apply current year coloring once paths are in the DOM.
  const yearSlider = document.getElementById('yearSlider');
  if (yearSlider) updateMap(parseInt(yearSlider.value));
}

// ---------- Original hand-drawn map (kept for fallback) ----------
function buildMapHandDrawn() {
  const container = document.getElementById('mapSvgWrap');
  container.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '40 60 400 430');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  neighborhoods.forEach(name => {
    const pathStr = NEIGHBORHOOD_PATHS[name];
    if (!pathStr) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathStr);
    path.setAttribute('class', 'neighborhood-path');
    path.setAttribute('data-name', name);
    path.setAttribute('fill', '#1a2a3a');

    const center = getPathCenter(pathStr);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', center.x);
    text.setAttribute('y', center.y);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', 'rgba(255,255,255,0.5)');
    text.setAttribute('font-size', name.length > 12 ? '6' : '7');
    text.setAttribute('font-family', 'Montserrat, sans-serif');
    text.setAttribute('font-weight', '700');
    text.setAttribute('pointer-events', 'none');
    text.textContent = shortLabel(name);

    attachPathHandlers(path, name);
    svg.appendChild(path);
    svg.appendChild(text);
  });

  container.appendChild(svg);
}

function getPathCenter(d) {
  const nums = d.match(/[\d.]+/g).map(Number);
  let sumX = 0, sumY = 0, count = 0;
  for (let i = 0; i < nums.length; i += 2) {
    sumX += nums[i];
    sumY += nums[i + 1];
    count++;
  }
  return { x: sumX / count, y: sumY / count };
}

// ============ COLOR SCALE ============
function corpColor(rate) {
  const t = Math.min(rate / 0.40, 1);
  if (t < 0.33) {
    const s = t / 0.33;
    return lerpColor([26, 42, 58], [230, 126, 34], s);
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return lerpColor([230, 126, 34], [231, 76, 60], s);
  } else {
    const s = (t - 0.66) / 0.34;
    // Top stop brightened from dark red (#8B0000) to neon red (#FF3B3B) so the
    // highest-corp neighborhoods pop against the dark blue background instead
    // of blending in. Eye goes to the brightest = the most severe.
    return lerpColor([231, 76, 60], [255, 59, 59], s);
  }
}

function lerpColor(a, b, t) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// ============ UPDATE MAP FOR YEAR ============
function updateMap(year) {
  const paths = document.querySelectorAll('.neighborhood-path');
  let totalCorp = 0, count = 0;
  let maxName = '', maxVal = 0, minName = '', minVal = 1;

  paths.forEach(path => {
    const name = path.getAttribute('data-name');
    const entry = corpData[name]?.[year];
    if (entry) {
      const rate = entry.corp_own_rate;
      path.setAttribute('fill', corpColor(rate));
      totalCorp += rate;
      count++;
      if (rate > maxVal) { maxVal = rate; maxName = name; }
      if (rate < minVal) { minVal = rate; minName = name; }
    }
  });

  document.getElementById('cityAvg').textContent = ((totalCorp / count) * 100).toFixed(1) + '%';
  document.getElementById('cityMax').textContent = maxName + ' (' + (maxVal * 100).toFixed(0) + '%)';
  document.getElementById('cityMin').textContent = minName + ' (' + (minVal * 100).toFixed(0) + '%)';
}

// ============ TOOLTIP ============
function showTooltip(e, name) {
  const tt = document.getElementById('mapTooltip');
  const year = parseInt(document.getElementById('yearSlider').value);
  const entry = corpData[name]?.[year];
  tt.querySelector('.tt-name').textContent = name;
  tt.querySelector('.tt-rate').textContent = entry
    ? (entry.corp_own_rate * 100).toFixed(1) + '% corporate-owned'
    : 'No data';
  tt.classList.add('show');
  moveTooltip(e);
}

function moveTooltip(e) {
  const tt = document.getElementById('mapTooltip');
  const container = document.getElementById('mapContainer');
  const rect = container.getBoundingClientRect();
  tt.style.left = (e.clientX - rect.left + 12) + 'px';
  tt.style.top = (e.clientY - rect.top - 10) + 'px';
}

function hideTooltip() {
  document.getElementById('mapTooltip').classList.remove('show');
}

// ============ SELECT NEIGHBORHOOD ============
let selectedHood = null;

// Stat row with optional (?) info button. If `why` is provided, hovering or
// focusing the (?) reveals a popover to the left with the explanation.
function statRow(label, value, valueClass, why) {
  const valHtml = `<span class="stat-value ${valueClass || ''}">${value}</span>`;
  const labelHtml = why
    ? `${label}<span class="info-anchor" tabindex="0" role="button" aria-label="Why this matters"><button class="info-btn" type="button" tabindex="-1">?</button><span class="info-caption">${why}</span></span>`
    : label;
  return `<div class="stat-row"><span class="stat-label">${labelHtml}</span>${valHtml}</div>`;
}

// Demoted variant for "context" stats — kept but visually quiet (no (?) needed).
function contextRow(label, value) {
  return `<div class="stat-row context"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

// Builds the full panel — called only when a NEW neighborhood is clicked.
// Year-dependent stat values get stable IDs so updateSelectedYear can update
// them in place during autoplay/slider scrub without rebuilding (and thus
// without closing any open (?) caption the user is reading).
function selectNeighborhood(name) {
  selectedHood = name;
  const year = parseInt(document.getElementById('yearSlider').value);
  const entry = corpData[name]?.[year];
  const early = corpData[name]?.[2004];
  const demo = DEMOGRAPHICS[name];

  document.querySelectorAll('.neighborhood-path').forEach(p => {
    p.style.strokeWidth = p.getAttribute('data-name') === name ? '3' : '1.2';
    p.style.stroke = p.getAttribute('data-name') === name
      ? 'var(--neon)' : 'rgba(255,255,255,0.15)';
  });

  document.getElementById('selectedName').textContent = name;

  if (entry) {
    const corpPct = (entry.corp_own_rate * 100).toFixed(1);
    const occPct = (entry.own_occ_rate * 100).toFixed(0);
    const rentPct = ((1 - entry.own_occ_rate) * 100).toFixed(0);
    const infoAnchor = (why) =>
      `<span class="info-anchor" tabindex="0" role="button" aria-label="Why this matters"><button class="info-btn" type="button" tabindex="-1">?</button><span class="info-caption">${why}</span></span>`;
    document.getElementById('selectedStats').innerHTML = `
      <div class="stat-row">
        <span class="stat-label"><span id="ssCorpLabel">Corp Ownership (${year})</span>${infoAnchor('Share of homes owned by LLCs, trusts, or businesses — not the people living in them.')}</span>
        <span class="stat-value red" id="ssCorpVal">${corpPct}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Owner-Occupied${infoAnchor('Owners who live in the home they own. Higher = more long-term residents with a stake in the neighborhood.')}</span>
        <span class="stat-value" id="ssOccVal">${occPct}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Renter/Absentee${infoAnchor('Renters and owners who live elsewhere. More turnover, faster rent hikes, and less neighborhood investment.')}</span>
        <span class="stat-value orange" id="ssRentVal">${rentPct}%</span>
      </div>
      ${early ? `
      <div class="stat-row">
        <span class="stat-label">Corp in 2004</span>
        <span class="stat-value" style="opacity:0.5">${(early.corp_own_rate * 100).toFixed(1)}%</span>
      </div>` : ''}
    `;
  } else {
    document.getElementById('selectedStats').innerHTML = '<div class="selected-detail">No data for this year</div>';
  }

  // Local housing stats (year-independent — only changes when neighborhood changes)
  if (demo) {
    const vacRate = ((demo.vacant / demo.tot_unit) * 100).toFixed(1);
    document.getElementById('demoContent').innerHTML = `
      ${statRow('Vacancy Rate', `${vacRate}%`, 'orange',
        'Empty homes — often held by investors as assets rather than lived in. Common in luxury developments.')}
      ${contextRow('Population', demo.total.toLocaleString())}
      ${contextRow('Housing Units', demo.tot_unit.toLocaleString())}
    `;
  }

  updateSelectedDelta();
}

// In-place update of the year-dependent values in the Selected card.
// Doesn't touch innerHTML, so any open (?) caption stays open.
function updateSelectedYear(year) {
  if (!selectedHood) return;
  const entry = corpData[selectedHood]?.[year];
  if (!entry) return;
  const labelEl = document.getElementById('ssCorpLabel');
  const corpEl = document.getElementById('ssCorpVal');
  const occEl = document.getElementById('ssOccVal');
  const rentEl = document.getElementById('ssRentVal');
  if (labelEl) labelEl.textContent = `Corp Ownership (${year})`;
  if (corpEl) corpEl.textContent = `${(entry.corp_own_rate * 100).toFixed(1)}%`;
  if (occEl) occEl.textContent = `${(entry.own_occ_rate * 100).toFixed(0)}%`;
  if (rentEl) rentEl.textContent = `${((1 - entry.own_occ_rate) * 100).toFixed(0)}%`;
  updateSelectedDelta();
}

// Position the hover popover vertically so it lines up with its (?) button.
// (CSS alone can't do this because the popover is anchored to .sidebar-card
// for horizontal positioning, which loses the per-row vertical reference.)
function positionInfoCaption(anchor) {
  const btn = anchor.querySelector('.info-btn');
  const caption = anchor.querySelector('.info-caption');
  const card = anchor.closest('.sidebar-card');
  if (!btn || !caption || !card) return;
  const btnRect = btn.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const btnCenter = (btnRect.top - cardRect.top) + btnRect.height / 2;
  caption.style.top = (btnCenter - caption.offsetHeight / 2) + 'px';
}

function initInfoPopovers() {
  const handler = (e) => {
    const anchor = e.target.closest && e.target.closest('.info-anchor');
    if (anchor) positionInfoCaption(anchor);
  };
  document.addEventListener('mouseover', handler);
  document.addEventListener('focusin', handler);
}

function updateSelectedDelta() {
  if (!selectedHood) return;
  const year = parseInt(document.getElementById('yearSlider').value);
  const entry = corpData[selectedHood]?.[year];
  const early = corpData[selectedHood]?.[2004];
  const delta = entry && early
    ? ((entry.corp_own_rate - early.corp_own_rate) * 100).toFixed(1)
    : '?';
  document.getElementById('selectedDetail').textContent = `+${delta}pp since 2004`;
}

// ============ YEAR SLIDER & PLAY ============
let playing = false;
let playInterval = null;

function initYearSlider() {
  const yearSlider = document.getElementById('yearSlider');
  const yearDisplay = document.getElementById('yearDisplay');

  yearSlider.addEventListener('input', () => {
    const year = parseInt(yearSlider.value);
    yearDisplay.textContent = year;
    updateMap(year);
    updateSelectedYear(year);
  });
}

function togglePlay() {
  const btn = document.getElementById('playBtn');
  const yearSlider = document.getElementById('yearSlider');
  const yearDisplay = document.getElementById('yearDisplay');

  if (playing) {
    clearInterval(playInterval);
    playing = false;
    btn.innerHTML = '&#9654;';
    return;
  }

  playing = true;
  btn.innerHTML = '&#9646;&#9646;';
  let year = parseInt(yearSlider.value);
  if (year >= 2024) year = 2004;

  playInterval = setInterval(() => {
    year++;
    if (year > 2024) {
      clearInterval(playInterval);
      playing = false;
      btn.innerHTML = '&#9654;';
      return;
    }
    yearSlider.value = year;
    yearDisplay.textContent = year;
    updateMap(year);
    updateSelectedYear(year);
  }, 600);
}

// ============ SHIFT GRID ============
function buildShiftGrid() {
  const grid = document.getElementById('shiftGrid');
  const shifts = neighborhoods.map(name => {
    const early = corpData[name][2004]?.corp_own_rate || 0;
    const late = corpData[name][2024]?.corp_own_rate || 0;
    return { name, early, late, delta: late - early };
  }).sort((a, b) => b.delta - a.delta);

  const top5 = shifts.slice(0, 5);
  top5.forEach((s, i) => {
    const earlyPct = (s.early * 100).toFixed(0);
    const latePct = (s.late * 100).toFixed(0);
    const deltaPct = (s.delta * 100).toFixed(0);
    const row = document.createElement('div');
    row.className = 'shift-row';
    row.style.animationDelay = `${i * 0.12}s`;
    row.innerHTML = `
      <div class="shift-rank">${i + 1}</div>
      <div class="shift-info">
        <div class="shift-header">
          <span class="shift-name">${s.name}</span>
          <span class="shift-delta">+${deltaPct}pp</span>
        </div>
        <div class="shift-bar-track">
          <div class="shift-bar-fill shift-bar-early" data-width="${earlyPct}"></div>
          <div class="shift-bar-fill shift-bar-late" data-width="${latePct}">
            <span class="shift-label shift-label-late">${latePct}% <span class="shift-year">2024</span></span>
          </div>
          <div class="shift-marker" data-pos="${earlyPct}">
            <span class="shift-marker-label">${earlyPct}% <span class="shift-year">2004</span></span>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(row);
  });
}

// Called from onSlideEnter — two-phase bar animation
function animateShiftBars() {
  const rows = document.querySelectorAll('.shift-row');
  rows.forEach((row, i) => {
    const earlyBar = row.querySelector('.shift-bar-early');
    const lateBar = row.querySelector('.shift-bar-late');
    const earlyW = earlyBar.getAttribute('data-width');
    const lateW = lateBar.getAttribute('data-width');
    const delay = i * 120;

    const marker = row.querySelector('.shift-marker');

    // Phase 1: grow to 2004 value + show marker
    setTimeout(() => {
      earlyBar.style.width = earlyW + '%';
      marker.style.left = earlyW + '%';
      marker.classList.add('show');
    }, 400 + delay);

    // Phase 2: grow the overlay to 2024 value
    setTimeout(() => {
      lateBar.style.width = lateW + '%';
      row.querySelector('.shift-label-late').classList.add('show');
      row.querySelector('.shift-delta').classList.add('show');
    }, 1200 + delay);
  });
}

// ============ PARTICLE CANVAS ============
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  const COUNT = 40;

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.3 + 0.05
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(204, 255, 0, ${p.alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}
