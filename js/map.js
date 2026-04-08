// ============ BUILD MAP ============
function buildMap() {
  const container = document.getElementById('mapSvgWrap');
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

    let label = name;
    if (name === 'South Boston Waterfront') label = 'SB Waterfront';
    else if (name === 'Jamaica Plain') label = 'JP';
    else if (name === 'South Boston') label = 'S. Boston';
    else if (name === 'East Boston') label = 'E. Boston';
    else if (name === 'West Roxbury') label = 'W. Roxbury';
    text.textContent = label;

    path.addEventListener('mouseenter', (e) => showTooltip(e, name));
    path.addEventListener('mousemove', (e) => moveTooltip(e));
    path.addEventListener('mouseleave', hideTooltip);
    path.addEventListener('click', () => selectNeighborhood(name));

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
    return lerpColor([231, 76, 60], [139, 0, 0], s);
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
  const delta = entry && early
    ? ((entry.corp_own_rate - early.corp_own_rate) * 100).toFixed(1)
    : '?';
  document.getElementById('selectedDetail').textContent = `+${delta}pp since 2004`;

  const statsHtml = entry ? `
    <div class="stat-row">
      <span class="stat-label">Corp Ownership (${year})</span>
      <span class="stat-value red">${(entry.corp_own_rate * 100).toFixed(1)}%</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Owner-Occupied</span>
      <span class="stat-value">${(entry.own_occ_rate * 100).toFixed(0)}%</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Renter/Absentee</span>
      <span class="stat-value orange">${((1 - entry.own_occ_rate) * 100).toFixed(0)}%</span>
    </div>
    ${early ? `<div class="stat-row">
      <span class="stat-label">Corp in 2004</span>
      <span class="stat-value" style="opacity:0.5">${(early.corp_own_rate * 100).toFixed(1)}%</span>
    </div>` : ''}
  ` : '<div class="selected-detail">No data for this year</div>';
  document.getElementById('selectedStats').innerHTML = statsHtml;

  if (demo) {
    const pctNonwhite = ((1 - demo.white / demo.total) * 100).toFixed(0);
    const pctWhite = ((demo.white / demo.total) * 100).toFixed(0);
    const vacRate = ((demo.vacant / demo.tot_unit) * 100).toFixed(1);
    document.getElementById('demoContent').innerHTML = `
      <div class="demo-bar-wrap">
        <div class="demo-bar-label"><span>White ${pctWhite}%</span><span>Non-white ${pctNonwhite}%</span></div>
        <div class="demo-bar">
          <div class="demo-bar-fill" style="width:${pctNonwhite}%;background:linear-gradient(90deg,var(--coral),var(--neon-red))"></div>
        </div>
      </div>
      <div class="stat-row">
        <span class="stat-label">Population</span>
        <span class="stat-value">${demo.total.toLocaleString()}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Housing Units</span>
        <span class="stat-value">${demo.tot_unit.toLocaleString()}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Vacancy Rate</span>
        <span class="stat-value orange">${vacRate}%</span>
      </div>
    `;
  }
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
    if (selectedHood) selectNeighborhood(selectedHood);
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
    if (selectedHood) selectNeighborhood(selectedHood);
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
