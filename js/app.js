'use strict';

const DB_ID = '386b60f29e4580e39941ea594643adc3';
const CONFIG_KEY = 'ryosei_map_config';

const CATEGORY_ICONS = {
  '公園': '🌿', '動物園': '🐘', '水族館': '🐠',
  '乗り物体験': '🚂', '博物館': '🏛️', '食事': '🍜', 'その他': '📍',
};

const CATEGORIES = ['公園', '動物園', '水族館', '乗り物体験', '博物館', '食事', 'その他'];
const AREAS      = ['都内', '埼玉', '神奈川', '千葉', '群馬', 'その他'];
const AGE_GROUPS = ['今向き', 'もう少し大きくなってから'];

const filters = { environment: 'all', unvisited: false, category: 'all', area: 'all', ageGroup: 'all' };
let allSpots = [];

// === Config ===
function getConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch { return {}; }
}
function saveConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }

// === Notion API via Cloudflare Worker ===
async function notionFetch(path, options = {}) {
  const { workerUrl } = getConfig();
  if (!workerUrl) throw new Error('WORKER_URL_NOT_SET');
  const resp = await fetch(workerUrl.replace(/\/$/, '') + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function fetchAllSpots() {
  const data = await notionFetch(`/databases/${DB_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      sorts: [
        { property: '行ったことある', direction: 'ascending' },
        { property: '楽しさ評価',     direction: 'descending' },
      ],
      page_size: 100,
    }),
  });
  return (data.results ?? []).map(parseSpot).filter(s => s.name);
}

async function createSpot(formData) {
  return notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: DB_ID },
      properties: buildNotionProperties(formData),
    }),
  });
}

// === Notion property parsers (read) ===
function title(p)    { return p?.title?.map(t => t.plain_text).join('') ?? ''; }
function sel(p)      { return p?.select?.name ?? ''; }
function chk(p)      { return p?.checkbox ?? false; }
function urlProp(p)  { return p?.url ?? ''; }
function num(p)      { return p?.number ?? null; }
function rt(p)       { return p?.rich_text?.map(t => t.plain_text).join('') ?? ''; }
function dt(p)       { return p?.date?.start ?? ''; }

function parseSpot(page) {
  const p = page.properties ?? {};
  return {
    id:          page.id,
    name:        title(p['スポット名']),
    mapUrl:      urlProp(p['Google マップ URL']),
    category:    sel(p['カテゴリ']),
    area:        sel(p['エリア']),
    accessMemo:  rt(p['アクセスメモ']),
    environment: sel(p['屋内 / 屋外']),
    hasVehicle:  chk(p['乗り物要素あり']),
    hasCreature: chk(p['虫・生き物要素あり']),
    ageGroup:    sel(p['年齢適性']),
    visited:     chk(p['行ったことある']),
    lastVisit:   dt(p['最後に行った日']),
    rating:      num(p['楽しさ評価']),
    memo:        rt(p['メモ']),
  };
}

// === Notion property builder (write) ===
function buildNotionProperties(f) {
  const p = {};
  p['スポット名'] = { title: [{ text: { content: f.name } }] };
  if (f.mapUrl)      p['Google マップ URL'] = { url: f.mapUrl };
  if (f.category)    p['カテゴリ'] = { select: { name: f.category } };
  if (f.area)        p['エリア'] = { select: { name: f.area } };
  if (f.environment) p['屋内 / 屋外'] = { select: { name: f.environment } };
  p['乗り物要素あり']   = { checkbox: !!f.hasVehicle };
  p['虫・生き物要素あり'] = { checkbox: !!f.hasCreature };
  if (f.ageGroup)    p['年齢適性'] = { select: { name: f.ageGroup } };
  p['行ったことある'] = { checkbox: !!f.visited };
  if (f.accessMemo)  p['アクセスメモ'] = { rich_text: [{ text: { content: f.accessMemo } }] };
  if (f.memo)        p['メモ'] = { rich_text: [{ text: { content: f.memo } }] };
  return p;
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
  if (spot.hasVehicle)  features.push('🚃 乗り物');
  if (spot.hasCreature) features.push('🐛 生き物');

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

  const visitedHtml = spot.visited
    ? `<span class="visited-label">✅ 訪問済${spot.lastVisit ? ' (' + fmtDate(spot.lastVisit) + ')' : ''}</span>`
    : '<span class="visited-label unvisited">✨ 未訪問</span>';

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
  ${spot.memo       ? `<p class="card-memo">💬 ${esc(spot.memo)}</p>` : ''}
  ${spot.accessMemo ? `<p class="card-access">🚃 ${esc(spot.accessMemo)}</p>` : ''}
  <div class="card-footer">
    <div class="footer-left">${visitedHtml}${renderStars(spot.rating)}</div>
    ${mapBtn}
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
    const isDefault = btn.dataset.value === 'all';
    const isToggle  = btn.dataset.filter === 'unvisited';
    btn.classList.toggle('active', isDefault && !isToggle);
    if (isToggle) btn.classList.remove('active');
  });
  render();
}

// === Settings Modal ===
function showSettings() {
  const modal = document.getElementById('settingsModal');
  const input = document.getElementById('workerUrlInput');
  input.value = getConfig().workerUrl ?? '';
  modal.style.display = 'flex';
}

function setupSettings() {
  document.getElementById('saveSettings').addEventListener('click', () => {
    const url = document.getElementById('workerUrlInput').value.trim();
    if (!url) { alert('Worker URLを入力してください'); return; }
    saveConfig({ ...getConfig(), workerUrl: url });
    document.getElementById('settingsModal').style.display = 'none';
    loadData();
  });
  document.getElementById('settingsBtn').addEventListener('click', showSettings);
}

// === Add Spot Modal ===
function setupAddModal() {
  const modal   = document.getElementById('addModal');
  const fab     = document.getElementById('addBtn');
  const closeBtn = document.getElementById('closeAddModal');
  const form    = document.getElementById('addForm');

  fab.addEventListener('click', () => { form.reset(); modal.style.display = 'flex'; });
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
      mapUrl:      fd.get('mapUrl')?.trim() || null,
      category:    fd.get('category') || null,
      area:        fd.get('area') || null,
      environment: fd.get('environment') || null,
      ageGroup:    fd.get('ageGroup') || null,
      hasVehicle:  fd.get('hasVehicle') === 'on',
      hasCreature: fd.get('hasCreature') === 'on',
      visited:     fd.get('visited') === 'on',
      accessMemo:  fd.get('accessMemo')?.trim() || null,
      memo:        fd.get('memo')?.trim() || null,
    };

    if (!formData.name) { alert('スポット名は必須です'); submitBtn.disabled = false; submitBtn.textContent = '登録する'; return; }

    try {
      await createSpot(formData);
      modal.style.display = 'none';
      await loadData(true);
    } catch (err) {
      alert(`登録に失敗しました:\n${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '登録する';
    }
  });
}

// === Data loading ===
async function loadData(forceRefresh = false) {
  const loading    = document.getElementById('loadingState');
  const grid       = document.getElementById('cardGrid');
  const refreshBtn = document.getElementById('refreshBtn');

  const { workerUrl } = getConfig();
  if (!workerUrl) { showSettings(); return; }

  loading.innerHTML = '<div class="loading-spinner"></div><p>読み込み中...</p>';
  loading.style.display = 'flex';
  grid.innerHTML = '';
  document.getElementById('emptyState').style.display = 'none';
  refreshBtn?.classList.add('spinning');

  try {
    allSpots = await fetchAllSpots();
    loading.style.display = 'none';
    render();
  } catch (err) {
    loading.innerHTML = `
      <div class="error-state">
        <p>⚠️ データの読み込みに失敗しました</p>
        <p class="error-detail">${esc(err.message)}</p>
        <button class="btn btn-secondary" id="retrySettings" style="margin-top:12px">⚙️ 設定を確認</button>
      </div>`;
    document.getElementById('retrySettings')?.addEventListener('click', showSettings);
  } finally {
    refreshBtn?.classList.remove('spinning');
  }
}

// === Boot ===
setupFilters();
setupSettings();
setupAddModal();
loadData();
