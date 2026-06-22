'use strict';

const REPO            = 'pixcel-bit/map';
const DATA_URL        = `https://raw.githubusercontent.com/${REPO}/main/data.json`;
const ADD_WORKFLOW    = 'add-spot.yml';
const UPDATE_WORKFLOW = 'update-spot.yml';
const CONFIG_KEY      = 'ryosei_map_config';

const CATEGORY_ICONS = {
  '公園': '🌿', '動物園': '🐘', '水族館': '🐠',
  '乗り物体験': '🚂', '博物館': '🏛️', '食事': '🍜', 'その他': '📍',
};

const filters = { environment: 'all', unvisited: false, category: 'all', area: 'all', ageGroup: 'all' };
let allSpots = [];
let currentCommentSpotId = null;

// === Config ===
function getConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch { return {}; }
}
function saveConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }

// === GitHub API helper ===
async function callWorkflow(workflow, inputs) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GITHUB_TOKEN_NOT_SET');

  const resp = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    }
  );
  if (resp.status === 401) throw new Error('トークンが無効です。設定を確認してください');
  if (resp.status === 404) throw new Error('ワークフローが見つかりません');
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
}

// === Data fetch ===
async function fetchAllSpots() {
  const resp = await fetch(`${DATA_URL}?t=${Date.now()}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.results ?? [])
    .map(parseSpot)
    .filter(s => s.name)
    .sort((a, b) => {
      if (a.visited !== b.visited) return a.visited ? 1 : -1;
      if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
      return a.name.localeCompare(b.name, 'ja');
    });
}

// === Notion property parsers ===
function title(p)  { return p?.title?.map(t => t.plain_text).join('') ?? ''; }
function sel(p)    { return p?.select?.name ?? ''; }
function chk(p)    { return p?.checkbox ?? false; }
function urlP(p)   { return p?.url ?? ''; }
function num(p)    { return p?.number ?? null; }
function rt(p)     { return p?.rich_text?.map(t => t.plain_text).join('') ?? ''; }
function dt(p)     { return p?.date?.start ?? ''; }

function parseSpot(page) {
  const p = page.properties ?? {};
  return {
    id:          page.id,
    name:        title(p['スポット名']),
    mapUrl:      urlP(p['Google マップ URL']),
    category:    sel(p['カテゴリ']),
    area:        sel(p['エリア']),
    accessMemo:  rt(p['アクセスメモ']),
    environment: sel(p['屋内 / 屋外']),
    hasVehicle:  chk(p['乗り物要素あり']),
    ageGroup:    sel(p['年齢適性']),
    visited:     chk(p['行ったことある']),
    lastVisit:   dt(p['最後に行った日']),
    rating:      num(p['楽しさ評価']),
    memo:        rt(p['メモ']),
    carMinutes:  page._car_minutes ?? null,
    transitUrl:  page._transit_url ?? null,
    carDirUrl:   page._car_dir_url  ?? null,
  };
}

// === Filtering ===
function applyFilters(spots) {
  return spots.filter(spot => {
    if (filters.environment !== 'all' && !spot.environment.includes(filters.environment)) return false;
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? raw : '';
  } catch { return ''; }
}

function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${y}/${m}/${d}`;
}

function renderStars(rating) {
  if (rating === null) return '';
  let html = '<div class="rating">';
  for (let i = 1; i <= 5; i++)
    html += `<span class="star ${i <= rating ? 'on' : 'off'}">${i <= rating ? '★' : '☆'}</span>`;
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
  if (spot.ageGroup === '今向き')
    ageBadge = '<span class="badge badge-age-now">👶 今向き</span>';
  else if (spot.ageGroup === 'もう少し大きくなってから')
    ageBadge = '<span class="badge badge-age-later">📅 後で</span>';

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

  const pendingBadge = spot._pending
    ? '<span class="badge badge-pending">⏳ Notion反映中</span>'
    : '';

  // Travel time row
  let travelHtml = '';
  if (spot.carMinutes || spot.transitUrl) {
    const carPart = spot.carMinutes
      ? `<a href="${esc(spot.carDirUrl || '#')}" target="_blank" rel="noopener" class="travel-link travel-car">🚗 紎${spot.carMinutes}分</a>`
      : '';
    const transitPart = spot.transitUrl
      ? `<a href="${esc(spot.transitUrl)}" target="_blank" rel="noopener" class="travel-link travel-transit">🚃 ルート</a>`
      : '';
    if (carPart || transitPart) {
      travelHtml = `<div class="card-travel">${carPart}${transitPart}</div>`;
    }
  }

  // Action buttons (not for pending spots)
  const visitedBtn = spot._pending ? '' :
    `<button class="btn-action btn-visited${spot.visited ? ' is-visited' : ''}" data-id="${esc(spot.id)}" title="${spot.visited ? '未訪問に戻す' : '訪問済みにする'}">
      ${spot.visited ? '✅' : '⬜'}
    </button>`;

  const commentBtn = spot._pending ? '' :
    `<button class="btn-action btn-comment" data-id="${esc(spot.id)}" title="コメントを編集">💬</button>`;

  const lastVisitText = spot.visited && spot.lastVisit ? ` (${fmtDate(spot.lastVisit)})` : '';
  const visitedLabel = spot.visited
    ? `<span class="visited-label">✅ 訪問済${lastVisitText}</span>`
    : '<span class="visited-label unvisited">✨ 未訪問</span>';

  return `
<div class="spot-card${spot.visited ? ' visited' : ''}${spot._pending ? ' pending' : ''}">
  <div class="card-header">
    <h2 class="spot-name">${esc(spot.name)}</h2>
    ${renderEnvBadge(spot.environment)}
  </div>
  <div class="card-badges">
    ${spot.category ? `<span class="badge badge-category">${catIcon} ${esc(spot.category)}</span>` : ''}
    ${spot.area     ? `<span class="badge badge-area">📍 ${esc(spot.area)}</span>` : ''}
    ${features.map(f => `<span class="badge badge-feature">${esc(f)}</span>`).join('')}
    ${ageBadge}
    ${pendingBadge}
  </div>
  ${travelHtml}
  ${spot.memo       ? `<p class="card-memo">💬 ${esc(spot.memo)}</p>` : ''}
  ${spot.accessMemo ? `<p class="card-access">🚃 ${esc(spot.accessMemo)}</p>` : ''}
  <div class="card-footer">
    <div class="footer-left">${visitedLabel}${renderStars(spot.rating)}</div>
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

// === Toast ===
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// === Filters ===
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
        document.querySelectorAll(`.filter-btn[data-filter="${type}"]`).forEach(b =>
          b.classList.toggle('active', b.dataset.value === value));
      }
      render();
    });
  });
  document.getElementById('resetFilters')?.addEventListener('click', resetAllFilters);
  document.getElementById('refreshBtn')?.addEventListener('click', () => loadData(true));
}

function resetAllFilters() {
  filters.environment = 'all'; filters.unvisited = false;
  filters.category = 'all'; filters.area = 'all'; filters.ageGroup = 'all';
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'all' && btn.dataset.filter !== 'unvisited');
    if (btn.dataset.filter === 'unvisited') btn.classList.remove('active');
  });
  render();
}

// === Settings Modal ===
function showSettings() {
  const modal = document.getElementById('settingsModal');
  document.getElementById('githubTokenInput').value = getConfig().githubToken ?? '';
  modal.style.display = 'flex';
}

function setupSettings() {
  document.getElementById('saveSettings').addEventListener('click', () => {
    const token = document.getElementById('githubTokenInput').value.trim();
    if (!token) { alert('GitHub Tokenを入力してください'); return; }
    saveConfig({ ...getConfig(), githubToken: token });
    document.getElementById('settingsModal').style.display = 'none';
    loadData();
  });
  document.getElementById('settingsBtn').addEventListener('click', showSettings);
}

// === Add Spot Modal ===
function setupAddModal() {
  const modal    = document.getElementById('addModal');
  const fab      = document.getElementById('addBtn');
  const closeBtn = document.getElementById('closeAddModal');
  const form     = document.getElementById('addForm');

  fab.addEventListener('click', () => {
    if (!getConfig().githubToken) { showSettings(); return; }
    form.reset();
    modal.style.display = 'flex';
  });
  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = form.querySelector('.btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '登録中...';

    const fd = new FormData(form);
    const formData = {
      name:        fd.get('name')?.trim(),
      mapUrl:      fd.get('mapUrl')?.trim()      || null,
      category:    fd.get('category')            || null,
      area:        fd.get('area')                || null,
      environment: fd.get('environment')         || null,
      ageGroup:    fd.get('ageGroup')            || null,
      hasVehicle:  fd.get('hasVehicle')  === 'on',
      visited:     fd.get('visited')     === 'on',
      accessMemo:  fd.get('accessMemo')?.trim()  || null,
      memo:        fd.get('memo')?.trim()        || null,
    };

    if (!formData.name) {
      alert('スポット名は必須です');
      submitBtn.disabled = false;
      submitBtn.textContent = '登録する';
      return;
    }

    try {
      await callWorkflow(ADD_WORKFLOW, {
        name:        formData.name,
        category:    formData.category    || '',
        area:        formData.area        || '',
        environment: formData.environment || '',
        mapUrl:      formData.mapUrl      || '',
        hasVehicle:  formData.hasVehicle  ? 'true' : 'false',
        ageGroup:    formData.ageGroup    || '',
        visited:     formData.visited     ? 'true' : 'false',
        accessMemo:  formData.accessMemo  || '',
        memo:        formData.memo        || '',
      });

      const pending = {
        id:          `pending-${Date.now()}`,
        _pending:    true,
        name:        formData.name,
        mapUrl:      formData.mapUrl      ?? '',
        category:    formData.category    ?? '',
        area:        formData.area        ?? '',
        accessMemo:  formData.accessMemo  ?? '',
        environment: formData.environment ?? '',
        hasVehicle:  formData.hasVehicle,
        ageGroup:    formData.ageGroup    ?? '',
        visited:     formData.visited,
        lastVisit:   '',
        rating:      null,
        memo:        formData.memo        ?? '',
        carMinutes:  null,
        transitUrl:  null,
        carDirUrl:   null,
      };
      allSpots = [pending, ...allSpots];
      render();

      modal.style.display = 'none';
      showToast('✅ Notionに登録しました！\n1。2分後にデータが更新されます');
    } catch (err) {
      if (err.message === 'GITHUB_TOKEN_NOT_SET') {
        modal.style.display = 'none';
        showSettings();
      } else {
        alert(`登録に失敗しました：\n${err.message}`);
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '登録する';
    }
  });
}

// === Comment Modal ===
function setupCommentModal() {
  const modal = document.getElementById('commentModal');
  document.getElementById('closeCommentModal').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  document.getElementById('saveComment').addEventListener('click', async () => {
    const memo = document.getElementById('commentText').value.trim();
    const btn  = document.getElementById('saveComment');
    btn.disabled = true;
    btn.textContent = '保存中...';
    try {
      await callWorkflow(UPDATE_WORKFLOW, {
        spotId: currentCommentSpotId,
        memo:   memo || '',
      });
      const spot = allSpots.find(s => s.id === currentCommentSpotId);
      if (spot) { spot.memo = memo; render(); }
      modal.style.display = 'none';
      showToast('💬 コメントを保存しました！\n1。2分後に反映されます');
    } catch (err) {
      if (err.message === 'GITHUB_TOKEN_NOT_SET') { modal.style.display = 'none'; showSettings(); }
      else alert(`保存失敗：\n${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  });
}

// === Card action event delegation ===
function setupCardActions() {
  document.getElementById('cardGrid').addEventListener('click', async e => {
    // Visited toggle
    const visitedBtn = e.target.closest('.btn-visited');
    if (visitedBtn) {
      const spotId = visitedBtn.dataset.id;
      const spot = allSpots.find(s => s.id === spotId);
      if (!spot || spot._pending) return;
      if (!getConfig().githubToken) { showSettings(); return; }

      const newVisited = !spot.visited;
      visitedBtn.textContent = '⏳';
      visitedBtn.disabled = true;
      try {
        await callWorkflow(UPDATE_WORKFLOW, {
          spotId,
          visited: newVisited ? 'true' : 'false',
        });
        spot.visited = newVisited;
        render();
        showToast(newVisited ? '✅ 訪問済みにしました！' : '⬜ 未訪問に戻しました');
      } catch (err) {
        if (err.message === 'GITHUB_TOKEN_NOT_SET') showSettings();
        else alert(`更新失敗：\n${err.message}`);
        visitedBtn.textContent = spot.visited ? '✅' : '⬜';
        visitedBtn.disabled = false;
      }
      return;
    }

    // Comment button
    const commentBtn = e.target.closest('.btn-comment');
    if (commentBtn) {
      const spotId = commentBtn.dataset.id;
      const spot = allSpots.find(s => s.id === spotId);
      if (!spot || spot._pending) return;
      if (!getConfig().githubToken) { showSettings(); return; }

      currentCommentSpotId = spotId;
      document.getElementById('commentText').value = spot.memo || '';
      document.getElementById('commentModal').style.display = 'flex';
    }
  });
}

// === Data loading ===
async function loadData(forceRefresh = false) {
  const loading    = document.getElementById('loadingState');
  const grid       = document.getElementById('cardGrid');
  const refreshBtn = document.getElementById('refreshBtn');

  loading.innerHTML = '<div class="loading-spinner"></div><p>読み込み中...</p>';
  loading.style.display = 'flex';
  grid.innerHTML = '';
  document.getElementById('emptyState').style.display = 'none';
  refreshBtn?.classList.add('spinning');

  try {
    allSpots = await fetchAllSpots();
    loading.style.display = 'none';
    render();
    if (!getConfig().githubToken) showSettings();
  } catch (err) {
    loading.innerHTML = `
      <div class="error-state">
        <p>⚠️ データの読み込みに失敗しました</p>
        <p class="error-detail">${esc(err.message)}</p>
      </div>`;
  } finally {
    refreshBtn?.classList.remove('spinning');
  }
}

// === Boot ===
setupFilters();
setupSettings();
setupAddModal();
setupCommentModal();
setupCardActions();
loadData();
