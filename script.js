'use strict';

/* ── Constants ─────────────────────────────────────────────── */
const ROUND_NAMES  = ['Round of 64','Round of 32','Round of 16','Quarterfinals','Semifinals','Final'];
const ROUND_SHORT  = ['R64','R32','R16','QF','SF','Final','🏆'];
const ROUND_COUNTS = [32, 16, 8, 4, 2, 1];
const LS_KEY = 'botb_bracket';
const IS_ADMIN = new URLSearchParams(location.search).has('admin');
if (IS_ADMIN) document.body.classList.add('admin-mode');

/* ── State ─────────────────────────────────────────────────── */
let data = null;          // loaded from data.json
let state = null;         // results array; persisted to localStorage
let currentRound = 0;

/* ── Data helpers ──────────────────────────────────────────── */
const getBand = id => (id !== null && id !== undefined) ? (data.bands[id] ?? null) : null;

function getMatchBands(round, matchIdx) {
  if (round === 0) {
    return [data.bands[matchIdx * 2], data.bands[matchIdx * 2 + 1]];
  }
  const prev = state[round - 1];
  const idA  = prev[matchIdx * 2]     ?? null;
  const idB  = prev[matchIdx * 2 + 1] ?? null;
  return [getBand(idA), getBand(idB)];
}

const isRoundDone = r => state[r]?.every(v => v !== null) ?? false;

/* ── Persistence ───────────────────────────────────────────── */
function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try { state = JSON.parse(raw); return; } catch (_) { /* fall through */ }
  }
  // Deep-copy results from data.json as initial state
  state = JSON.parse(JSON.stringify(data.results));
}

const saveState = () => localStorage.setItem(LS_KEY, JSON.stringify(state));

function clearDownstream(round, matchIdx) {
  let r = round + 1, m = Math.floor(matchIdx / 2);
  while (r <= 5) {
    state[r][m] = null;
    m = Math.floor(m / 2);
    r++;
  }
}

/* ── Rendering ─────────────────────────────────────────────── */
function renderTabs() {
  const nav = document.getElementById('round-tabs');
  nav.innerHTML = '';
  ROUND_SHORT.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.textContent = label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-label', i < 6 ? ROUND_NAMES[i] : 'Champion');
    btn.setAttribute('aria-selected', String(i === currentRound));
    if (i === currentRound) btn.classList.add('active');
    if (i < 6 && isRoundDone(i)) btn.classList.add('done');
    if (i === 6 && state[5][0] !== null) btn.classList.add('done');
    btn.addEventListener('click', () => {
      currentRound = i;
      renderTabs();
      i === 6 ? renderChampion() : renderRound(i);
    });
    nav.appendChild(btn);
  });
}

function slotHTML(band, won, lost, round, matchIdx) {
  const id      = band?.id ?? null;
  const name    = band?.name || 'TBD';
  const isTBD   = !band || !band.name;
  const canClick = !isTBD && id !== null;

  const cls = ['band-slot', won && 'winner', lost && 'loser', isTBD && 'tbd', canClick && 'clickable']
    .filter(Boolean).join(' ');

  const dAttrs = canClick
    ? `data-round="${round}" data-match="${matchIdx}" data-bid="${id}" tabindex="0" role="button"`
    : '';

  const imgEl = band?.image
    ? `<img src="${band.image}" alt="${name}" class="band-img" loading="lazy">`
    : `<div class="band-img-ph" aria-hidden="true"></div>`;

  const badge = won
    ? `<span class="badge won" aria-label="Winner">&#9819;</span>`
    : `<span class="badge"></span>`;

  return `<div class="${cls}" ${dAttrs} aria-label="${name}${won ? ' — winner' : ''}">
    ${imgEl}
    <span class="band-name">${name}</span>
    ${badge}
  </div>`;
}

function renderRound(roundIdx) {
  const main   = document.getElementById('bracket-view');
  const count  = ROUND_COUNTS[roundIdx];
  const picked = state[roundIdx].filter(v => v !== null).length;

  let html = `<div class="round-header">
    <span class="rnd-label">${ROUND_NAMES[roundIdx]}</span>
    <span class="rnd-progress">${picked}&thinsp;/&thinsp;${count}</span>
  </div><div class="matchups">`;

  for (let i = 0; i < count; i++) {
    const [bA, bB] = getMatchBands(roundIdx, i);
    const winner = state[roundIdx][i];
    const aWon = winner !== null && winner === bA?.id;
    const bWon = winner !== null && winner === bB?.id;
    html += `<div class="match-card">
      ${slotHTML(bA, aWon, bWon, roundIdx, i)}
      <div class="vs-bar"><span>VS</span></div>
      ${slotHTML(bB, bWon, aWon, roundIdx, i)}
    </div>`;
  }

  html += '</div>';
  main.innerHTML = html;

  // Attach handlers to clickable slots
  main.querySelectorAll('.band-slot.clickable').forEach(slot => {
    const pick = () => {
      const round = +slot.dataset.round;
      const match = +slot.dataset.match;
      const bid   = +slot.dataset.bid;
      // Toggle off if clicking the current winner; otherwise set new winner
      state[round][match] = (state[round][match] === bid) ? null : bid;
      clearDownstream(round, match);
      saveState();
      renderTabs();
      renderRound(round);
    };
    slot.addEventListener('click', pick);
    slot.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
  });
}

function renderChampion() {
  const main   = document.getElementById('bracket-view');
  const winner = getBand(state[5][0]);

  if (!winner || !winner.name) {
    main.innerHTML = `<div class="champ-view">
      <div class="champ-empty">
        <span class="trophy-icon">&#127942;</span>
        <p>El campeón aún no ha sido coronado.</p>
      </div>
    </div>`;
    return;
  }

  const imgEl = winner.image
    ? `<img src="${winner.image}" alt="${winner.name}" class="champ-img">`
    : `<div class="champ-img-ph" aria-hidden="true"></div>`;

  main.innerHTML = `<div class="champ-view">
    <div class="champ-card">
      <div class="champ-card-label">CHAMPION</div>
      ${imgEl}
      <div class="champ-name">${winner.name}</div>
      <span class="champ-trophy">&#127942;</span>
    </div>
  </div>`;
}

/* ── Export ────────────────────────────────────────────────── */
function openExport() {
  const out = { ...data, results: state };
  document.getElementById('export-ta').value = JSON.stringify(out, null, 2);
  document.getElementById('export-modal').classList.remove('hidden');
}

/* ── Init ──────────────────────────────────────────────────── */
async function init() {
  const view = document.getElementById('bracket-view');
  view.innerHTML = '<div class="loading-state"><p>Loading bracket…</p></div>';

  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error(res.statusText);
    data = await res.json();
  } catch (err) {
    view.innerHTML = `<div class="error-state">
      <p>&#9888; Could not load <code>data.json</code>.</p>
      <p class="hint">Serve via a local server (<code>npx serve .</code>) or deploy to GitHub Pages.</p>
    </div>`;
    return;
  }

  document.title = data.title || 'Tournament Bracket';
  document.getElementById('tournament-title').textContent = data.title || 'Battle of the Bands';

  loadState();
  renderTabs();
  renderRound(0);
}

/* ── Event listeners (DOM is ready because script is deferred) */

// Rules modal
document.getElementById('rules-btn').addEventListener('click', () =>
  document.getElementById('rules-modal').classList.remove('hidden'));
document.getElementById('close-rules-btn').addEventListener('click', () =>
  document.getElementById('rules-modal').classList.add('hidden'));

// Export modal
document.getElementById('export-btn').addEventListener('click', openExport);

document.getElementById('reset-btn').addEventListener('click', () => {
  if (confirm('¿Deshacer todos los cambios al último estado guardado?')) {
    localStorage.removeItem(LS_KEY);
    location.reload();
  }
});

document.getElementById('copy-btn').addEventListener('click', () => {
  const ta  = document.getElementById('export-ta');
  const btn = document.getElementById('copy-btn');
  navigator.clipboard.writeText(ta.value).then(() => {
    btn.textContent = '✓ ¡Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar al Portapapeles'; }, 2200);
  }).catch(() => {
    ta.select();
    document.execCommand('copy'); // fallback for older browsers
    btn.textContent = '✓ ¡Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar al Portapapeles'; }, 2200);
  });
});

document.getElementById('close-modal').addEventListener('click', () =>
  document.getElementById('export-modal').classList.add('hidden'));

// Close any modal when clicking its backdrop
document.querySelectorAll('.modal').forEach(modal => {
  modal.querySelector('.modal-backdrop').addEventListener('click', () =>
    modal.classList.add('hidden'));
});

init();
