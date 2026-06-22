'use strict';

const DATA_URL = 'https://raw.githubusercontent.com/pixcel-bit/map/main/data.json';
const REPO     = 'pixcel-bit/map';
const ADD_WORKFLOW    = 'add-spot.yml';
const UPDATE_WORKFLOW = 'update-spot.yml';

const CATEGORY_ICONS = {
  '公園': '🌿',
  '動物園': '🐘',
  '水族館': '🐠',
  '乗り物体験': '🚂',
  '博物館': '🏛️',
  '食事': '🍜',
  'その他': '📍',
};

const filters = {
  environment: 'all',
  unvisited: false,
  category: 'all',
  area: 'all',
  ageGroup: 'all',
};

let allSpots = [];

// === Config (GitHub PAT) ===

function getToken() {
  return localStorage.getItem('ryosei_map_config') || '';
}

// === GitHub workflow dispatch ===

async function callWorkflow(workflow, inputs) {
  const token = getToken();
  if (!token) {
    alert('設定画面でGitHub Personal Access Tokenを入力してください。');
    return false;
  }
  const resp = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    }
  );
  if (!resp.ok) {
    const txt = await resp.text();
    console.error('workflow dispatch failed', resp.status, txt);
    alert(`エラー: ${resp.status}\n${txt}`);
    return false;
  }
  return true;
}

// === Notion property parsers ===

function title(prop) {
  return prop?.title?.map(t => t.plain_text).join('') ?? '';
}

function select(prop) {
  return prop?.select?.name ?? '';
}

function checkbox(prop) {
  return prop?.checkbox ?? false;
}

function url(prop) {
  return prop?.url ?? '';
}

function number(prop) {
  return prop?.number ?? null;
}

function richText(prop) {
  return prop?.rich_text?.map(t => t.plain_text).join('') ?? '';
}

function date(prop) {
  return prop?.date?.start ?? '';
}

function parseSpot(page) {
  const p = page.properties ?? {};
  return {
    id:          page.id,
    name:        title(p['スポット名']),
    mapUrl:      url(p['Google マップ URL']),
    category:    select(p['カテゴリ']),
    area:        select(p['エリア']),
    accessMemo:  richText(p['アクセスメモ']),
    environment: select(p['屋内 / 屋外']),
    hasVehicle:  checkbox(p['乗り物要素あり']),
    ageGroup:    select(p['年齢適性']),
    visited:     checkbox(p['行ったことある']),
    lastVisit:   date(p['最後に行った日']),
    rating:      number(p['楽しさ評価']),
    memo:        richText(p['メモ']),
    carMinutes:  page._car_minutes ?? null,
    transitUrl:  page._transit_url ?? null,
    carDirUrl:   page._car_dir_url ?? null,
  };
}

// === Filtering ===

function matchEnv(spot) {
  if (filters.environment === 'all') return true;
  return spot.environment.includes(filters.environment);
}

function applyFilters(spots) {
  return spots.filter(spot => {
    if (!matchEnv(spot)) return false;
    if (filters.unvisited && spot.visited) return false;
    if (filters.category !== 'all' && spot.category !== filters.category) return false;
    if (filters.area !== 'all' && spot.area !== filters.area) return false;
    if (filters.ageGroup !== 'all' && spot.ageGroup !== filters.ageGroup) return false;
    return true;
  });
}

// === Rendering ===

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? raw : '';
  } catch {
    return '';
  }
}

function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${y}/${m}/${d}`;
}

function renderStars(rating) {
  if (rating === null) return '';
  let html = '<div class="rating">';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= rating ? 'on' : 'off'}">${i <= rating ? '★' : '☆'}</span>`;
  }
  return html + '</div>';
}

function renderEnvBadge(env) {
  if (env.includes('屋内')) return '<span class="env-badge env-indoor">🏠 屋内</span>';
  if (env.includes('屋外')) return '<span class="env-badge env-outdoor">🌳 屋外</span>';
  return '';
}

function renderCard(spot) {
  const catIcon = CATEGORY_ICONS[spot.category] ?? '📍';

  const features = [];
  if (spot.hasVehicle) features.push('🚃 乗り物');

  let ageBadge = '';
  if (spot.ageGroup === '今向き') {
    ageBadge = '<span class="badge badge-age-now">👶 今向き</span>';
  } else if (spot.ageGroup === 'もう少し大きくなってから') {
    ageBadge = '<span class="badge badge-age-later">📅 後で</span>';
  }

  const safe = safeUrl(spot.mapUrl);
  const mapBtn = safe
    ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer" class="map-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5"/>
        </svg>
        地図
      </a>`
    : '';

  const memoHtml = spot.memo
    ? `<p class="card-memo">💬 ${esc(spot.memo)}</p>`
    : '';

  const accessHtml = spot.accessMemo
    ? `<p class="card-access">🚃 ${esc(spot.accessMemo)}</p>`
    : '';

  let travelHtml = '';
  if (spot.carMinutes !== null || spot.transitUrl) {
    const carPart = spot.carMinutes !== null && spot.carDirUrl
      ? `<a href="${esc(spot.carDirUrl)}" target="_blank" rel="noopener noreferrer" class="travel-link travel-car">🚗 ${spot.carMinutes}分</a>`
      : spot.carMinutes !== null
        ? `<span class="travel-link travel-car">🚗 ${spot.carMinutes}分</span>`
        : '';
    const transitPart = spot.transitUrl
      ? `<a href="${esc(spot.transitUrl)}" target="_blank" rel="noopener noreferrer" class="travel-link travel-transit">🚃 ルート</a>`
      : '';
    travelHtml = `<div class="card-travel">${carPart}${transitPart}</div>`;
  }

  const visitedBtn = `<button class="btn-action btn-visited${spot.visited ? ' is-visited' : ''}" data-id="${esc(spot.id)}" data-visited="${spot.visited}" title="${spot.visited ? '訪問済み' : '未訪問'}">${spot.visited ? '✅' : '⬜'}</button>`;
  const commentBtn = `<button class="btn-action btn-comment" data-id="${esc(spot.id)}" data-memo="${esc(spot.memo)}" title="コメント編集">💬</button>`;

  return `
<div class="spot-card${spot.visited ? ' visited' : ''}">
  <div class="card-header">
    <h2 class="spot-name">${esc(spot.name)}</h2>
    ${renderEnvBadge(spot.environment)}
  </div>
  <div class="card-badges">
    ${spot.category ? `<span class="badge badge-category">${catIcon} ${esc(spot.category)}</span>` : ''}
    ${spot.area     ? `<span class="badge badge-area">📍 ${esc(spot.area)}</span>` : ''}
    ${features.map(f => `<span class="badge badge-feature">${esc(f)}</span>`).join('')}
    ${ageBadge}
  </div>
  ${memoHtml}
  ${accessHtml}
  ${travelHtml}
  <div class="card-footer">
    <div class="footer-left">
      ${spot.lastVisit ? `<span class="visited-label">✅ 訪問済 (${fmtDate(spot.lastVisit)})</span>` : ''}
      ${renderStars(spot.rating)}
    </div>
    <div class="footer-actions">
      ${visitedBtn}
      ${commentBtn}
      ${mapBtn}
    </div>
  </div>
</div>`;
}

function render() {
  const grid    = document.getElementById('cardGrid');
  const empty   = document.getElementById('emptyState');
  const countEl = document.getElementById('spotCount');

  const filtered = applyFilters(allSpots);
  countEl.textContent = `${filtered.length}件`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = filtered.map(renderCard).join('');
  }
}

// === Card action buttons (event delegation) ===

function setupCardActions() {
  const grid = document.getElementById('cardGrid');

  grid.addEventListener('click', async e => {
    const visitedBtn = e.target.closest('.btn-visited');
    if (visitedBtn) {
      const spotId  = visitedBtn.dataset.id;
      const current = visitedBtn.dataset.visited === 'true';
      const next    = !current;

      visitedBtn.dataset.visited = String(next);
      visitedBtn.textContent     = next ? '✅' : '⬜';
      visitedBtn.classList.toggle('is-visited', next);
      const card = visitedBtn.closest('.spot-card');
      if (card) card.classList.toggle('visited', next);

      const spot = allSpots.find(s => s.id === spotId);
      if (spot) spot.visited = next;

      await callWorkflow(UPDATE_WORKFLOW, { spotId, visited: String(next), memo: '__SKIP__' });
      return;
    }

    const commentBtn = e.target.closest('.btn-comment');
    if (commentBtn) {
      openCommentModal(commentBtn.dataset.id, commentBtn.dataset.memo);
    }
  });
}

// === Comment modal ===

let _commentSpotId = '';

function openCommentModal(spotId, currentMemo) {
  _commentSpotId = spotId;
  document.getElementById('commentText').value = currentMemo || '';
  document.getElementById('commentModal').style.display = 'flex';
  document.getElementById('commentText').focus();
}

function setupCommentModal() {
  document.getElementById('closeCommentModal')?.addEventListener('click', () => {
    document.getElementById('commentModal').style.display = 'none';
  });

  document.getElementById('commentModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('commentModal')) {
      document.getElementById('commentModal').style.display = 'none';
    }
  });

  document.getElementById('saveComment')?.addEventListener('click', async () => {
    const memo  = document.getElementById('commentText').value;
    const modal = document.getElementById('commentModal');
    modal.style.display = 'none';

    const ok = await callWorkflow(UPDATE_WORKFLOW, {
      spotId: _commentSpotId,
      visited: '',
      memo,
    });

    if (ok) {
      const spot = allSpots.find(s => s.id === _commentSpotId);
      if (spot) {
        spot.memo = memo;
        render();
      }
    }
  });
}

// === Settings modal ===

function setupSettings() {
  const settingsBtn = document.getElementById('settingsBtn');
  const modal       = document.getElementById('settingsModal');
  const closeBtn    = document.getElementById('closeSettings');
  const saveBtn     = document.getElementById('saveSettings');
  const input       = document.getElementById('tokenInput');

  settingsBtn?.addEventListener('click', () => {
    input.value = getToken();
    modal.style.display = 'flex';
  });

  closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal?.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });

  saveBtn?.addEventListener('click', () => {
    localStorage.setItem('ryosei_map_config', input.value.trim());
    modal.style.display = 'none';
  });
}

// === Add-spot modal ===

function setupAddSpot() {
  const addBtn   = document.getElementById('addSpotBtn');
  const modal    = document.getElementById('addModal');
  const closeBtn = document.getElementById('closeAddModal');
  const form     = document.getElementById('addSpotForm');

  addBtn?.addEventListener('click', () => {
    form?.reset();
    modal.style.display = 'flex';
  });

  closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal?.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const ok = await callWorkflow(ADD_WORKFLOW, {
      spotName:    data.spotName || '',
      mapUrl:      data.mapUrl || '',
      category:    data.category || '',
      area:        data.area || '',
      environment: data.environment || '',
      ageGroup:    data.ageGroup || '',
      hasVehicle:  data.hasVehicle ? 'true' : 'false',
    });
    if (ok) {
      modal.style.display = 'none';
      alert('スポットを追加しました！\nGitHub Actionsが完了すると（約1〜2分後）データが更新されます。');
    }
  });
}

// === Filter event wiring ===

function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type  = btn.dataset.filter;
      const value = btn.dataset.value;

      if (type === 'unvisited') {
        filters.unvisited = !filters.unvisited;
        btn.classList.toggle('active', filters.unvisited);
      } else {
        filters[type] = value;
        document.querySelectorAll(`.filter-btn[data-filter="${type}"]`).forEach(b => {
          b.classList.toggle('active', b.dataset.value === value);
        });
      }

      render();
    });
  });

  document.getElementById('resetFilters')?.addEventListener('click', resetAllFilters);

  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    loadData(true);
  });
}

function resetAllFilters() {
  filters.environment = 'all';
  filters.unvisited   = false;
  filters.category    = 'all';
  filters.area        = 'all';
  filters.ageGroup    = 'all';

  document.querySelectorAll('.filter-btn').forEach(btn => {
    const isDefault = btn.dataset.value === 'all';
    const isToggle  = btn.dataset.filter === 'unvisited';
    btn.classList.toggle('active', isDefault && !isToggle);
    if (isToggle) btn.classList.remove('active');
  });

  render();
}

// === Data loading ===

async function loadData(forceRefresh = false) {
  const loading    = document.getElementById('loadingState');
  const grid       = document.getElementById('cardGrid');
  const refreshBtn = document.getElementById('refreshBtn');

  loading.style.display = 'flex';
  grid.innerHTML = '';
  document.getElementById('emptyState').style.display = 'none';
  refreshBtn?.classList.add('spinning');

  try {
    const cacheBust = forceRefresh ? `?t=${Date.now()}` : '';
    const resp = await fetch(DATA_URL + cacheBust);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    allSpots = (data.results ?? [])
      .map(parseSpot)
      .filter(s => s.name)
      .sort((a, b) => {
        if (a.visited !== b.visited) return a.visited ? 1 : -1;
        if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
        return a.name.localeCompare(b.name, 'ja');
      });

    loading.style.display = 'none';
    render();
  } catch (err) {
    loading.innerHTML = `
      <div class="error-state">
        <p>⚠️ データの読み込みに失敗しました</p>
        <p class="error-detail">${esc(err.message)}</p>
        <p class="error-detail" style="margin-top:8px">GitHub Actions でデータを取得してから再読み込みしてください</p>
      </div>`;
  } finally {
    refreshBtn?.classList.remove('spinning');
  }
}

// === Boot ===

setupFilters();
setupCardActions();
setupCommentModal();
setupSettings();
setupAddSpot();
loadData();
