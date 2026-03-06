// sm-views.js
// スケジュール管理タブ ビュー（リスト + 統計）

import { escapeHtml, formatDateJP, formatTime } from './sm-utils.js';
import {
  smGetSchedules, smGetProgressByClass,
  smUpdateSchedule, smDeleteSchedule,
  smPatchCache, smRemoveFromCache,
} from './sm-store.js';
import {
  getSmFilters, getSmStatsFilters, renderSmStatsFilterChips,
  smRenderFromCache, smReloadAndRender,
} from './sm-manager.js';
import { showToast, openModal, closeModal } from './app.js';
import { isGCalReady } from './sm-gcal-stub.js';

const SM_TARGET_COUNT = 36; // 年間目標回数

// --- 選択状態 ---
let selectedIds = new Set();

export function getSmSelectedIds() { return [...selectedIds]; }

export function clearSmSelection() {
  selectedIds.clear();
  updateSmBulkBar();
}

// --- メインレンダー ---

export function renderSmDashboard() {
  renderSmScheduleList(smGetSchedules());
}

// --- プログレスバー ---

export function renderSmProgressBars(schedules, classrooms) {
  const container = document.getElementById('sm-progress-bars');
  if (!container) return;

  renderSmStatsFilterChips();

  const progress = smGetProgressByClass(schedules);

  if (classrooms.length === 0) {
    container.innerHTML = '<p class="text-muted">教室マスタが登録されていません</p>';
    return;
  }

  let okCount = 0, warnCount = 0, lowCount = 0;
  classrooms.forEach(c => {
    const p = progress[c.name] || { total: 0 };
    if (p.total >= SM_TARGET_COUNT) okCount++;
    else if (p.total >= SM_TARGET_COUNT * 0.7) warnCount++;
    else lowCount++;
  });

  const { classNames, achievement } = getSmStatsFilters();
  let filtered = classrooms;
  if (classNames.length > 0) filtered = filtered.filter(c => classNames.includes(c.name));
  if (achievement !== 'all') {
    filtered = filtered.filter(c => {
      const p = progress[c.name] || { total: 0 };
      if (achievement === 'ok')   return p.total >= SM_TARGET_COUNT;
      if (achievement === 'warn') return p.total >= SM_TARGET_COUNT * 0.7 && p.total < SM_TARGET_COUNT;
      if (achievement === 'low')  return p.total < SM_TARGET_COUNT * 0.7;
      return true;
    });
  }

  const summaryHtml = `
    <div class="progress-summary">
      <span class="progress-summary-ok"><span class="material-icons">check_circle</span> 達成 ${okCount}件</span>
      <span class="progress-summary-warn"><span class="material-icons">schedule</span> 進行中 ${warnCount}件</span>
      <span class="progress-summary-low"><span class="material-icons">warning</span> 要注意 ${lowCount}件</span>
      <span class="progress-summary-total">全${classrooms.length}教室</span>
    </div>`;

  if (filtered.length === 0) {
    container.innerHTML = summaryHtml + '<p class="text-muted" style="padding:20px 0">条件に一致する教室がありません</p>';
    return;
  }

  const headerHtml = `
    <div class="stats-list-header">
      <div class="stats-cell stats-cell-name">教室名</div>
      <div class="stats-cell stats-cell-counts">確定 / 暫定</div>
      <div class="stats-cell stats-cell-bar">進捗</div>
      <div class="stats-cell stats-cell-total">合計</div>
      <div class="stats-cell stats-cell-status">状況</div>
    </div>`;

  const rowsHtml = filtered.map(c => {
    const p = progress[c.name] || { confirmed: 0, tentative: 0, total: 0 };
    const confirmedPct = Math.min((p.confirmed / SM_TARGET_COUNT) * 100, 100);
    const tentativePct = Math.min((p.tentative / SM_TARGET_COUNT) * 100, 100 - confirmedPct);
    const key   = p.total >= SM_TARGET_COUNT ? 'ok' : p.total >= SM_TARGET_COUNT * 0.7 ? 'warn' : 'low';
    const label = { ok: '達成', warn: '進行中', low: '要注意' }[key];
    const icon  = { ok: 'check_circle', warn: 'schedule', low: 'warning' }[key];
    return `
      <div class="stats-row">
        <div class="stats-cell stats-cell-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</div>
        <div class="stats-cell stats-cell-counts">
          <span class="stats-count-confirmed">確定&nbsp;<strong>${p.confirmed}</strong></span>
          <span class="stats-count-sep"> / </span>
          <span class="stats-count-tentative">暫定&nbsp;<strong>${p.tentative}</strong></span>
        </div>
        <div class="stats-cell stats-cell-bar">
          <div class="stats-bar-track">
            <div class="stats-bar-confirmed" style="width:${confirmedPct}%"></div>
            <div class="stats-bar-tentative" style="width:${tentativePct}%"></div>
          </div>
        </div>
        <div class="stats-cell stats-cell-total">${p.total}<span class="stats-total-target">/${SM_TARGET_COUNT}</span></div>
        <div class="stats-cell stats-cell-status">
          <span class="stats-status-badge stats-badge-${key}">
            <span class="material-icons">${icon}</span>${label}
          </span>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = summaryHtml + `<div class="stats-list">${headerHtml}${rowsHtml}</div>`;
}

// --- スケジュールリスト（ページネーション付き） ---

const PAGE_SIZE = 50;
let currentPage = 1;
let lastFiltered = [];

export function renderSmScheduleList(schedules) {
  const filters = getSmFilters();
  let filtered = [...schedules];
  if (filters.classNames?.length) filtered = filtered.filter(s => filters.classNames.includes(s.class_name));
  if (filters.months?.length)     filtered = filtered.filter(s => filters.months.some(m => s.date.startsWith(m)));
  if (filters.statuses?.length)   filtered = filtered.filter(s => filters.statuses.includes(s.status));

  lastFiltered = filtered;
  currentPage = 1;
  _renderSmListPage();
}

function goToSmListPage(n) {
  currentPage = n;
  _renderSmListPage();
}

function _renderSmListPage() {
  const container = document.getElementById('sm-schedule-list');
  if (!container) return;

  const filtered = lastFiltered;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.max(1, Math.min(currentPage, totalPages));

  if (total === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">event_busy</span>
        <p>スケジュールが見つかりません</p>
      </div>`;
    container.onclick = null;
    container.onchange = null;
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);
  const allChecked = filtered.length > 0 && filtered.every(s => selectedIds.has(s.id));

  const headerHtml = `
    <div class="list-header">
      <div class="list-cell list-cell-check">
        <input type="checkbox" id="sm-select-all" ${allChecked ? 'checked' : ''}>
      </div>
      <div class="list-cell list-cell-date">日付</div>
      <div class="list-cell list-cell-class">教室名</div>
      <div class="list-cell list-cell-time">時間</div>
      <div class="list-cell list-cell-venue">会場</div>
      <div class="list-cell list-cell-status">ステータス</div>
      <div class="list-cell list-cell-publish">公開</div>
    </div>`;

  const rowsHtml = pageItems.map(s => {
    const timeStr = s.start_time && s.end_time
      ? `${formatTime(s.start_time)}〜${formatTime(s.end_time)}`
      : formatTime(s.start_time) || '';
    return `
      <div class="list-row row-status-${s.status}" data-id="${s.id}">
        <div class="list-cell list-cell-check">
          <input type="checkbox" class="row-check" data-id="${s.id}" ${selectedIds.has(s.id) ? 'checked' : ''}>
        </div>
        <div class="list-cell list-cell-date">${formatDateJP(s.date)}</div>
        <div class="list-cell list-cell-class">${escapeHtml(s.class_name)}</div>
        <div class="list-cell list-cell-time">${timeStr}</div>
        <div class="list-cell list-cell-venue">${escapeHtml(s.venue || '')}</div>
        <div class="list-cell list-cell-status">${getSmInlineStatusBtn(s)}</div>
        <div class="list-cell list-cell-publish">${getSmInlinePublishBtn(s)}</div>
      </div>`;
  }).join('');

  const paginationHtml = totalPages > 1 ? `
    <div class="list-pagination">
      <button class="btn-page" onclick="window.app.goToSmListPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>
        <span class="material-icons">chevron_left</span>
      </button>
      <span class="page-info">${start + 1}〜${Math.min(start + PAGE_SIZE, total)} / ${total}件</span>
      <button class="btn-page" onclick="window.app.goToSmListPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
        <span class="material-icons">chevron_right</span>
      </button>
    </div>` : `<div class="list-pagination"><span class="page-info">${total}件</span></div>`;

  container.innerHTML = headerHtml + rowsHtml + paginationHtml;

  // change 委譲
  container.onchange = (e) => {
    if (e.target.id === 'sm-select-all') {
      const checked = e.target.checked;
      filtered.forEach(s => { if (checked) selectedIds.add(s.id); else selectedIds.delete(s.id); });
      container.querySelectorAll('.row-check').forEach(cb => cb.checked = checked);
      updateSmBulkBar();
    } else if (e.target.classList.contains('row-check')) {
      e.stopPropagation();
      const id = e.target.dataset.id;
      if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
      updateSmBulkBar();
      const sa = document.getElementById('sm-select-all');
      if (sa) sa.checked = filtered.every(s => selectedIds.has(s.id));
    }
  };

  // click 委譲
  container.onclick = (e) => {
    if (e.target.closest('.list-pagination')) return;
    const row = e.target.closest('.list-row');
    if (!row) return;
    const cb = row.querySelector('.row-check');

    if (e.target.closest('.list-cell-check')) {
      if (cb && e.target !== cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    if (selectedIds.size > 0) {
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const id = actionBtn.dataset.id;
      if (actionBtn.dataset.action === 'toggle-status') {
        smInlineSetStatus(id, actionBtn.classList.contains('badge-tentative') ? 'confirmed' : 'tentative');
      } else if (actionBtn.dataset.action === 'toggle-publish') {
        smInlineSetPublish(id, !actionBtn.classList.contains('badge-published'));
      }
      return;
    }
    openSmScheduleDetail(row.dataset.id);
  };
}

// --- インラインボタン ---

function getSmInlineStatusBtn(s) {
  if (s.status === 'canceled') {
    return '<span class="badge badge-canceled"><span class="material-icons badge-icon">cancel</span>中止</span>';
  }
  const icon  = s.status === 'tentative' ? 'schedule' : 'check_circle';
  const label = s.status === 'tentative' ? '暫定' : '確定';
  return `<button class="btn-inline badge-${s.status}" data-action="toggle-status" data-id="${s.id}"><span class="material-icons btn-inline-icon">${icon}</span>${label}</button>`;
}

function getSmInlinePublishBtn(s) {
  if (s.is_published) {
    return `<button class="btn-inline badge-published" data-action="toggle-publish" data-id="${s.id}"><span class="material-icons btn-inline-icon">visibility</span>公開</button>`;
  }
  return `<button class="btn-inline badge-unpublished" data-action="toggle-publish" data-id="${s.id}"><span class="material-icons btn-inline-icon">visibility_off</span>非公開</button>`;
}

// --- インライン操作（楽観的UI更新） ---

async function smInlineSetStatus(id, newStatus) {
  const schedule = smGetSchedules().find(s => s.id === id);
  if (!schedule) return;
  const prev = schedule.status;
  smPatchCache(id, { status: newStatus });
  smRenderFromCache();
  const { error } = await smUpdateSchedule(id, { status: newStatus });
  if (error) {
    smPatchCache(id, { status: prev });
    smRenderFromCache();
    showToast('ステータス変更に失敗しました', 'error');
    return;
  }
  showToast(newStatus === 'confirmed' ? '確定しました' : '暫定に戻しました', 'success');
}

async function smInlineSetPublish(id, isPublished) {
  const schedule = smGetSchedules().find(s => s.id === id);
  if (!schedule) return;
  const prev = schedule.is_published;
  smPatchCache(id, { is_published: isPublished });
  smRenderFromCache();
  const { error } = await smUpdateSchedule(id, { is_published: isPublished });
  if (error) {
    smPatchCache(id, { is_published: prev });
    smRenderFromCache();
    showToast('公開状態の変更に失敗しました', 'error');
    return;
  }
  showToast(isPublished ? '公開しました' : '非公開にしました', 'success');
}

// --- 一括操作バー ---

function updateSmBulkBar() {
  const bar   = document.getElementById('sm-bulk-bar');
  const count = document.getElementById('sm-bulk-count');
  if (!bar || !count) return;
  if (selectedIds.size > 0) {
    bar.style.display = '';
    count.textContent = selectedIds.size;
  } else {
    bar.style.display = 'none';
  }
}

// --- 詳細モーダル ---

export function openSmScheduleDetail(id) {
  const s = smGetSchedules().find(s => s.id === id);
  if (!s) return;

  const timeStr = s.start_time && s.end_time
    ? `${formatTime(s.start_time)} 〜 ${formatTime(s.end_time)}`
    : formatTime(s.start_time) || '未設定';

  const trialBadge = s.is_trial_ok !== false
    ? '<span class="badge badge-trial-ok">体験OK</span>'
    : '<span class="badge badge-trial-ng">体験不可</span>';

  const content = `
    <div class="detail-grid">
      <div class="detail-item">
        <label>教室名</label>
        <p>${escapeHtml(s.class_name)}</p>
      </div>
      <div class="detail-item">
        <label>担当コーチ</label>
        <p>${escapeHtml(s.coach_name || '未設定')}</p>
      </div>
      <div class="detail-item">
        <label>日付</label>
        <p>${formatDateJP(s.date)}</p>
      </div>
      <div class="detail-item">
        <label>時間</label>
        <p>${timeStr}</p>
      </div>
      <div class="detail-item">
        <label>会場</label>
        <p>${escapeHtml(s.venue || '未設定')}</p>
      </div>
      <div class="detail-item">
        <label>体験参加</label>
        <p>${trialBadge}</p>
      </div>
      <div class="detail-item">
        <label>ステータス</label>
        <p>${getSmStatusBadge(s.status)}</p>
      </div>
      <div class="detail-item">
        <label>公開状態</label>
        <p>${s.is_published ? '<span class="badge badge-published">公開</span>' : '<span class="badge badge-unpublished">非公開</span>'}</p>
      </div>
    </div>

    <div class="detail-actions">
      <div class="detail-actions-left">
        <button class="btn btn-danger-outline" onclick="window.app.confirmSmDeleteSchedule('${s.id}')">
          <span class="material-icons">delete</span>削除
        </button>
        <button class="btn btn-sm btn-outline" onclick="window.app.smToggleTrialOk('${s.id}', ${!s.is_trial_ok})">
          <span class="material-icons">${s.is_trial_ok !== false ? 'person_off' : 'person_add'}</span>
          ${s.is_trial_ok !== false ? '体験不可に' : '体験OKに'}
        </button>
      </div>
      <div class="detail-actions-right">
        ${s.status === 'tentative'
          ? `<button class="btn btn-confirm" onclick="window.app.smSetStatus('${s.id}', 'confirmed')">
              <span class="material-icons">check_circle</span>確定にする
            </button>`
          : `<button class="btn btn-tentative" onclick="window.app.smSetStatus('${s.id}', 'tentative')">
              <span class="material-icons">schedule</span>暫定に戻す
            </button>`
        }
        ${s.is_published
          ? `<button class="btn btn-secondary" onclick="window.app.smSetPublish('${s.id}', false)">
              <span class="material-icons">visibility_off</span>非公開
            </button>`
          : `<button class="btn btn-publish" onclick="window.app.smSetPublish('${s.id}', true)">
              <span class="material-icons">visibility</span>公開
            </button>`
        }
      </div>
    </div>`;

  openModal('スケジュール詳細', content);
}

function getSmStatusBadge(status) {
  switch (status) {
    case 'tentative': return '<span class="badge badge-tentative">暫定</span>';
    case 'confirmed': return '<span class="badge badge-confirmed">確定</span>';
    case 'canceled':  return '<span class="badge badge-canceled">中止</span>';
    default: return '';
  }
}

// --- 個別操作（楽観的UI更新） ---

async function smSetStatus(id, newStatus) {
  const schedule = smGetSchedules().find(s => s.id === id);
  if (!schedule) return;
  const prev = schedule.status;
  smPatchCache(id, { status: newStatus });
  closeModal();
  smRenderFromCache();
  const { error } = await smUpdateSchedule(id, { status: newStatus });
  if (error) {
    smPatchCache(id, { status: prev });
    smRenderFromCache();
    showToast('ステータス変更に失敗しました', 'error');
    return;
  }
  showToast(newStatus === 'confirmed' ? '確定しました' : '暫定に戻しました', 'success');
}

async function smSetPublish(id, isPublished) {
  const schedule = smGetSchedules().find(s => s.id === id);
  if (!schedule) return;
  const prev = schedule.is_published;
  smPatchCache(id, { is_published: isPublished });
  closeModal();
  smRenderFromCache();
  const { error } = await smUpdateSchedule(id, { is_published: isPublished });
  if (error) {
    smPatchCache(id, { is_published: prev });
    smRenderFromCache();
    showToast('公開状態の変更に失敗しました', 'error');
    return;
  }
  showToast(isPublished ? '公開しました' : '非公開にしました', 'success');
}

function confirmSmDeleteSchedule(id) {
  const content = `
    <p>このスケジュールを削除しますか？</p>
    <p class="text-warning">この操作は元に戻せません。</p>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="window.app.closeModal()">キャンセル</button>
      <button class="btn btn-danger" onclick="window.app.executeSmDeleteSchedule('${id}')">
        <span class="material-icons">delete</span>削除
      </button>
    </div>`;
  openModal('削除の確認', content);
}

async function executeSmDeleteSchedule(id) {
  smRemoveFromCache(id);
  closeModal();
  smRenderFromCache();
  const { error } = await smDeleteSchedule(id);
  if (error) {
    showToast('削除に失敗しました', 'error');
    await smReloadAndRender();
    return;
  }
  showToast('削除しました', 'success');
}

async function smToggleTrialOk(id, isTrialOk) {
  const schedule = smGetSchedules().find(s => s.id === id);
  if (!schedule) return;
  const prev = schedule.is_trial_ok;
  smPatchCache(id, { is_trial_ok: isTrialOk });
  closeModal();
  smRenderFromCache();
  const { error } = await smUpdateSchedule(id, { is_trial_ok: isTrialOk });
  if (error) {
    smPatchCache(id, { is_trial_ok: prev });
    smRenderFromCache();
    showToast('体験参加の変更に失敗しました', 'error');
    return;
  }
  showToast(isTrialOk ? '体験OKにしました' : '体験不可にしました', 'success');
}

// --- window.app に追加登録 ---
setTimeout(() => {
  window.app = Object.assign(window.app || {}, {
    smSetStatus,
    smSetPublish,
    confirmSmDeleteSchedule,
    executeSmDeleteSchedule,
    smToggleTrialOk,
    goToSmListPage,
  });
}, 0);
