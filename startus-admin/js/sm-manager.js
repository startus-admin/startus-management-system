// sm-manager.js
// スケジュール管理タブ メインオーケストレーター
// member-manager の toast / modal / auth / classrooms を利用

import { showToast, openModal, closeModal } from './app.js';
import { isAdmin } from './auth.js';
import { canEdit } from './permissions.js';
import { getClassrooms, getActiveClassrooms, loadClassrooms } from './classroom.js';
import {
  smLoadSchedules, smGetSchedules, smGetProgressByClass,
  smPatchCache, smRemoveFromCache,
  smCreateSchedule, smUpdateSchedule, smDeleteSchedule,
  smBulkCreateSchedules, smBulkDeleteSchedules,
  smBulkUpdateStatus, smBulkUpdatePublish,
} from './sm-store.js';
import { isGCalReady } from './sm-gcal-stub.js';
import {
  renderSmDashboard, renderSmProgressBars, renderSmScheduleList,
  getSmSelectedIds, clearSmSelection,
} from './sm-views.js';
import { initSmCalendar, refreshSmCalendarEvents, setSmCalendarDate } from './sm-calendar-view.js';
import { openSmGenerateForm } from './sm-generator.js';
import { openSmICSImportForm } from './sm-ics.js';
import {
  escapeHtml, getFiscalYear, getCurrentFiscalYear,
  getFiscalYearRange, parseTimeSlot,
} from './sm-utils.js';

// --- ロールヘルパー ---
export function smIsAdmin() { return canEdit('schedule'); }
export function smIsCoach() { return !canEdit('schedule'); }

// --- 状態 ---
let smCurrentTab  = 'list';
let smCurrentFY   = '';
let smCalendarInitialized = false;

let classFilters   = new Set();
let monthFilters   = new Set();
let statusFilters  = new Set();

let calendarStatusFilters = new Set(['tentative', 'confirmed', 'canceled', 'published']);
let calendarClassFilter   = '';

let statsClassFilters       = new Set();
let statsAchievementFilter  = 'all';

// --- getter（sm-views / sm-calendar-view から参照） ---

export function getSmCurrentFY()  { return smCurrentFY; }
export function getSmCurrentTab() { return smCurrentTab; }

export function getSmFilters() {
  return {
    classNames: [...classFilters],
    months:     [...monthFilters],
    statuses:   [...statusFilters],
  };
}

export function getSmCalendarClassFilter()   { return calendarClassFilter; }
export function getSmCalendarStatusFilters() { return calendarStatusFilters; }

export function getSmStatsFilters() {
  return {
    classNames:  [...statsClassFilters],
    achievement: statsAchievementFilter,
  };
}

// --- 教室ドロップダウン生成ヘルパー ---

export function buildSmClassroomOptions(selectedName = '') {
  return getClassrooms().map(c =>
    `<option value="${c.name}" ${c.name === selectedName ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');
}

export function getSmClassroomByName(name) {
  return getClassrooms().find(c => c.name === name) || null;
}

// --- サブタブ切替 ---

function switchSmTab(tabName) {
  smCurrentTab = tabName;

  document.querySelectorAll('.sm-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const listEl  = document.getElementById('sm-list-screen');
  const statsEl = document.getElementById('sm-stats-screen');
  const calEl   = document.getElementById('sm-calendar-screen');

  if (listEl)  listEl.style.display  = tabName === 'list'     ? '' : 'none';
  if (statsEl) statsEl.style.display = tabName === 'stats'    ? '' : 'none';
  if (calEl)   calEl.style.display   = tabName === 'calendar' ? '' : 'none';

  if (tabName === 'stats') {
    renderSmProgressBars(smGetSchedules(), getClassrooms());
  }

  if (tabName === 'calendar') {
    requestAnimationFrame(() => {
      if (!smCalendarInitialized) {
        initSmCalendar();
        smCalendarInitialized = true;
      }
      refreshSmCalendarEvents();
    });
  }
}

// --- 年度セレクト ---

function buildSmFYOptions() {
  const now = new Date();
  const thisYear = now.getFullYear();
  const options = [];
  for (let y = thisYear - 2; y <= thisYear + 2; y++) {
    options.push(
      `<option value="${y}" ${String(y) === smCurrentFY ? 'selected' : ''}>${y}年度</option>`
    );
  }
  return options.join('');
}

function populateSmFYSelects() {
  const html = buildSmFYOptions();
  ['sm-fy-select', 'sm-list-fy-select', 'sm-calendar-fy-select'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function syncSmFYSelects(fy) {
  ['sm-fy-select', 'sm-list-fy-select', 'sm-calendar-fy-select'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = fy;
  });
}

// --- データ再読み込み＆再レンダリング ---

export async function smReloadAndRender() {
  await smLoadSchedules(smCurrentFY);
  const schedules  = smGetSchedules();
  const classrooms = getClassrooms();

  renderSmProgressBars(schedules, classrooms);
  renderSmScheduleList(schedules);

  if (smCalendarInitialized) refreshSmCalendarEvents();
}

// キャッシュから再描画（楽観的UI更新後の即時反映用）
export function smRenderFromCache() {
  const schedules  = smGetSchedules();
  const classrooms = getClassrooms();
  renderSmScheduleList(schedules);
  if (smCurrentTab === 'stats') renderSmProgressBars(schedules, classrooms);
  if (smCalendarInitialized) refreshSmCalendarEvents();
}

// --- イベントハンドラ ---

async function onSmFYChange() {
  smCurrentFY = document.getElementById('sm-fy-select').value;
  syncSmFYSelects(smCurrentFY);
  monthFilters.clear();
  renderSmMonthFilterChips();
  await smReloadAndRender();
}

async function onSmListFYChange() {
  smCurrentFY = document.getElementById('sm-list-fy-select').value;
  syncSmFYSelects(smCurrentFY);
  monthFilters.clear();
  renderSmMonthFilterChips();
  await smReloadAndRender();
}

async function onSmCalendarFYChange() {
  smCurrentFY = document.getElementById('sm-calendar-fy-select').value;
  syncSmFYSelects(smCurrentFY);
  monthFilters.clear();
  renderSmMonthFilterChips();
  await smReloadAndRender();
  setSmCalendarDate(new Date(parseInt(smCurrentFY, 10), 3, 1));
}

function onSmFilterChange() {
  renderSmScheduleList(smGetSchedules());
}

// --- リスト用フィルター ---

function populateSmFilters() {
  renderSmClassFilterChips();
  renderSmMonthFilterChips();
  renderSmStatusFilterChips();
  renderSmCalendarClassFilterChips();
  renderSmStatsClassFilterChips();
}

function renderSmClassFilterChips() {
  const container = document.getElementById('sm-filter-class-chips');
  if (!container) return;
  container.innerHTML = getClassrooms().map(c => {
    const name = escapeHtml(c.name);
    return `<button class="filter-chip${classFilters.has(c.name) ? ' active' : ''}" data-filter="${name}">${name}</button>`;
  }).join('');
  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleSmClassFilter(chip.dataset.filter));
  });
  updateSmFilterBtn();
}

function renderSmMonthFilterChips() {
  const container = document.getElementById('sm-filter-month-chips');
  if (!container) return;
  const fy = parseInt(smCurrentFY, 10);
  const months = [];
  for (let m = 4; m <= 12; m++) months.push({ value: `${fy}-${String(m).padStart(2,'0')}`, label: `${m}月` });
  for (let m = 1; m <= 3;  m++) months.push({ value: `${fy+1}-${String(m).padStart(2,'0')}`, label: `${m}月` });
  container.innerHTML = months.map(({ value, label }) =>
    `<button class="filter-chip${monthFilters.has(value) ? ' active' : ''}" data-filter="${value}">${label}</button>`
  ).join('');
  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleSmMonthFilter(chip.dataset.filter));
  });
  updateSmFilterBtn();
}

function renderSmStatusFilterChips() {
  const container = document.getElementById('sm-filter-status-chips');
  if (!container) return;
  const statuses = [
    { value: 'tentative', label: '暫定' },
    { value: 'confirmed', label: '確定' },
    { value: 'canceled',  label: '中止' },
  ];
  container.innerHTML = statuses.map(({ value, label }) =>
    `<button class="filter-chip filter-chip-status filter-chip-${value}${statusFilters.has(value) ? ' active' : ''}" data-filter="${value}">${label}</button>`
  ).join('');
  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleSmStatusFilter(chip.dataset.filter));
  });
  updateSmFilterBtn();
}

function updateSmFilterBtn() {
  const total = classFilters.size + monthFilters.size + statusFilters.size;
  const badge = document.getElementById('sm-filter-active-badge');
  const btn   = document.getElementById('sm-filter-toggle-btn');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? '' : 'none'; }
  if (btn)   btn.classList.toggle('has-filter', total > 0);
  const clsClr = document.getElementById('sm-class-filter-clear-btn');
  const monClr = document.getElementById('sm-month-filter-clear-btn');
  const stClr  = document.getElementById('sm-status-filter-clear-btn');
  if (clsClr) clsClr.style.display = classFilters.size > 0 ? '' : 'none';
  if (monClr) monClr.style.display = monthFilters.size > 0 ? '' : 'none';
  if (stClr)  stClr.style.display  = statusFilters.size > 0 ? '' : 'none';
}

function toggleSmClassFilter(name) {
  classFilters.has(name) ? classFilters.delete(name) : classFilters.add(name);
  renderSmClassFilterChips();
  onSmFilterChange();
}

function clearSmClassFilter() {
  classFilters.clear(); renderSmClassFilterChips(); onSmFilterChange();
}

function toggleSmMonthFilter(value) {
  monthFilters.has(value) ? monthFilters.delete(value) : monthFilters.add(value);
  renderSmMonthFilterChips();
  onSmFilterChange();
}

function clearSmMonthFilter() {
  monthFilters.clear(); renderSmMonthFilterChips(); onSmFilterChange();
}

function toggleSmStatusFilter(value) {
  statusFilters.has(value) ? statusFilters.delete(value) : statusFilters.add(value);
  renderSmStatusFilterChips();
  onSmFilterChange();
}

function clearSmStatusFilter() {
  statusFilters.clear(); renderSmStatusFilterChips(); onSmFilterChange();
}

function clearSmAllFilters() {
  classFilters.clear(); monthFilters.clear(); statusFilters.clear();
  renderSmClassFilterChips(); renderSmMonthFilterChips(); renderSmStatusFilterChips();
  onSmFilterChange();
}

function toggleSmFilterPanel() {
  const panel = document.getElementById('sm-filter-panel');
  const arrow = document.getElementById('sm-filter-toggle-arrow');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (arrow) arrow.textContent = open ? 'expand_less' : 'expand_more';
}

function closeSmFilterPanel() {
  const panel = document.getElementById('sm-filter-panel');
  const arrow = document.getElementById('sm-filter-toggle-arrow');
  if (panel) panel.classList.remove('open');
  if (arrow) arrow.textContent = 'expand_more';
}

// --- カレンダーフィルター ---

function renderSmCalendarClassFilterChips() {
  const container = document.getElementById('sm-cal-filter-class-chips');
  if (!container) return;
  container.innerHTML = getClassrooms().map(c => {
    const name   = escapeHtml(c.name);
    const active = calendarClassFilter === c.name ? ' active' : '';
    return `<button class="filter-chip cal-class-chip${active}" data-filter="${name}">${name}</button>`;
  }).join('');
  container.querySelectorAll('.cal-class-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      calendarClassFilter = calendarClassFilter === chip.dataset.filter ? '' : chip.dataset.filter;
      renderSmCalendarClassFilterChips();
      updateSmCalendarFilterBtn();
      refreshSmCalendarEvents();
    });
  });
  updateSmCalendarFilterBtn();
}

function updateSmCalendarFilterBtn() {
  const classActive  = calendarClassFilter !== '';
  const statusActive = calendarStatusFilters.size < 4;
  const total = (classActive ? 1 : 0) + (statusActive ? 1 : 0);
  const badge = document.getElementById('sm-cal-filter-active-badge');
  const btn   = document.getElementById('sm-cal-filter-toggle-btn');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? '' : 'none'; }
  if (btn)   btn.classList.toggle('has-filter', total > 0);
  const clsClr = document.getElementById('sm-cal-class-filter-clear-btn');
  if (clsClr) clsClr.style.display = classActive ? '' : 'none';
}

function toggleSmCalendarFilterPanel() {
  const panel = document.getElementById('sm-cal-filter-panel');
  const arrow = document.getElementById('sm-cal-filter-toggle-arrow');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (arrow) arrow.textContent = open ? 'expand_less' : 'expand_more';
}

function closeSmCalendarFilterPanel() {
  const panel = document.getElementById('sm-cal-filter-panel');
  const arrow = document.getElementById('sm-cal-filter-toggle-arrow');
  if (panel) panel.classList.remove('open');
  if (arrow) arrow.textContent = 'expand_more';
}

function clearSmCalendarClassFilter() {
  calendarClassFilter = '';
  renderSmCalendarClassFilterChips();
  refreshSmCalendarEvents();
}

function clearSmCalendarFilters() {
  calendarClassFilter = '';
  calendarStatusFilters = new Set(['tentative', 'confirmed', 'canceled', 'published']);
  renderSmCalendarClassFilterChips();
  document.querySelectorAll('.sm-cal-status-chip').forEach(chip => {
    chip.classList.add('active');
  });
  updateSmCalendarFilterBtn();
  refreshSmCalendarEvents();
}

function toggleSmCalendarStatus(status) {
  if (calendarStatusFilters.has(status)) {
    calendarStatusFilters.delete(status);
  } else {
    calendarStatusFilters.add(status);
  }
  document.querySelectorAll('.sm-cal-status-chip').forEach(chip => {
    chip.classList.toggle('active', calendarStatusFilters.has(chip.dataset.status));
  });
  updateSmCalendarFilterBtn();
  refreshSmCalendarEvents();
}

// --- 統計フィルター ---

function renderSmStatsClassFilterChips() {
  const container = document.getElementById('sm-stats-filter-class-chips');
  if (!container) return;
  container.innerHTML = getClassrooms().map(c => {
    const name = escapeHtml(c.name);
    return `<button class="filter-chip${statsClassFilters.has(c.name) ? ' active' : ''}" data-filter="${name}">${name}</button>`;
  }).join('');
  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleSmStatsClassFilter(chip.dataset.filter));
  });
  updateSmStatsFilterBtn();
}

export function renderSmStatsFilterChips() {
  renderSmStatsClassFilterChips();
}

function updateSmStatsFilterBtn() {
  const total = statsClassFilters.size + (statsAchievementFilter !== 'all' ? 1 : 0);
  const badge = document.getElementById('sm-stats-filter-active-badge');
  const btn   = document.getElementById('sm-stats-filter-toggle-btn');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? '' : 'none'; }
  if (btn)   btn.classList.toggle('has-filter', total > 0);
  const clsClr = document.getElementById('sm-stats-class-filter-clear-btn');
  if (clsClr) clsClr.style.display = statsClassFilters.size > 0 ? '' : 'none';
}

function toggleSmStatsClassFilter(name) {
  statsClassFilters.has(name) ? statsClassFilters.delete(name) : statsClassFilters.add(name);
  renderSmStatsClassFilterChips();
  renderSmProgressBars(smGetSchedules(), getClassrooms());
}

function clearSmStatsClassFilter() {
  statsClassFilters.clear();
  renderSmStatsClassFilterChips();
  renderSmProgressBars(smGetSchedules(), getClassrooms());
}

function setSmStatsAchievementFilter(filter) {
  statsAchievementFilter = filter;
  document.querySelectorAll('.sm-stats-achievement-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.achievement === filter);
  });
  updateSmStatsFilterBtn();
  renderSmProgressBars(smGetSchedules(), getClassrooms());
}

function clearSmStatsFilters() {
  statsClassFilters.clear();
  statsAchievementFilter = 'all';
  renderSmStatsClassFilterChips();
  document.querySelectorAll('.sm-stats-achievement-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.achievement === 'all');
  });
  updateSmStatsFilterBtn();
  renderSmProgressBars(smGetSchedules(), getClassrooms());
}

function toggleSmStatsFilterPanel() {
  const panel = document.getElementById('sm-stats-filter-panel');
  const arrow = document.getElementById('sm-stats-filter-toggle-arrow');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (arrow) arrow.textContent = open ? 'expand_less' : 'expand_more';
}

function closeSmStatsFilterPanel() {
  const panel = document.getElementById('sm-stats-filter-panel');
  const arrow = document.getElementById('sm-stats-filter-toggle-arrow');
  if (panel) panel.classList.remove('open');
  if (arrow) arrow.textContent = 'expand_more';
}

// --- 一括操作 ---

async function bulkSmConfirm() {
  const ids = getSmSelectedIds();
  if (!ids.length) return;
  const { error } = await smBulkUpdateStatus(ids, 'confirmed');
  if (!error) {
    showToast(`${ids.length}件を確定しました`, 'success');
    clearSmSelection();
    await smReloadAndRender();
  } else {
    showToast('一括確定に失敗しました', 'error');
  }
}

async function bulkSmTentative() {
  const ids = getSmSelectedIds();
  if (!ids.length) return;
  const { error } = await smBulkUpdateStatus(ids, 'tentative');
  if (!error) {
    showToast(`${ids.length}件を暫定に戻しました`, 'success');
    clearSmSelection();
    await smReloadAndRender();
  } else {
    showToast('一括変更に失敗しました', 'error');
  }
}

async function bulkSmPublish() {
  const ids = getSmSelectedIds();
  if (!ids.length) return;
  const { error } = await smBulkUpdatePublish(ids, true);
  if (!error) {
    showToast(`${ids.length}件を公開しました`, 'success');
    clearSmSelection();
    await smReloadAndRender();
  } else {
    showToast('一括公開に失敗しました', 'error');
  }
}

async function bulkSmUnpublish() {
  const ids = getSmSelectedIds();
  if (!ids.length) return;
  const { error } = await smBulkUpdatePublish(ids, false);
  if (!error) {
    showToast(`${ids.length}件を非公開にしました`, 'success');
    clearSmSelection();
    await smReloadAndRender();
  } else {
    showToast('一括非公開に失敗しました', 'error');
  }
}

async function bulkSmCancel() {
  const ids = getSmSelectedIds();
  if (!ids.length) return;
  const { error } = await smBulkUpdateStatus(ids, 'canceled');
  if (!error) {
    showToast(`${ids.length}件を中止にしました`, 'success');
    clearSmSelection();
    await smReloadAndRender();
  } else {
    showToast('一括中止に失敗しました', 'error');
  }
}

async function bulkSmDelete() {
  const ids = getSmSelectedIds();
  if (!ids.length) return;
  const content = `
    <p>${ids.length}件のスケジュールを削除しますか？</p>
    <p class="text-warning">この操作は元に戻せません。</p>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="window.app.closeModal()">キャンセル</button>
      <button class="btn btn-danger" onclick="window.app.executeSmBulkDelete()">
        <span class="material-icons">delete</span>削除
      </button>
    </div>`;
  openModal('一括削除の確認', content);
}

async function executeSmBulkDelete() {
  const ids = getSmSelectedIds();
  closeModal();
  const { error } = await smBulkDeleteSchedules(ids);
  if (!error) {
    showToast(`${ids.length}件を削除しました`, 'success');
    clearSmSelection();
    await smReloadAndRender();
  } else {
    showToast('一括削除に失敗しました', 'error');
  }
}

function clearSmBulkSelection() {
  clearSmSelection();
  renderSmScheduleList(smGetSchedules());
}

// --- 個別追加フォーム ---

function openSmAddScheduleForm(presetDate = '') {
  const classOptions = buildSmClassroomOptions();

  const content = `
    <form id="sm-schedule-form" onsubmit="return false;">
      <div class="form-grid">
        <div class="form-group">
          <label>教室名 <span class="required">*</span></label>
          <select name="class_name" required>
            <option value="">選択してください</option>
            ${classOptions}
          </select>
        </div>
        <div class="form-group">
          <label>日付 <span class="required">*</span></label>
          <input type="date" name="date" value="${presetDate}" required>
        </div>
        <div class="form-group">
          <label>開始時間</label>
          <input type="time" name="start_time">
        </div>
        <div class="form-group">
          <label>終了時間</label>
          <input type="time" name="end_time">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>会場</label>
          <input type="text" name="venue" placeholder="会場名">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">キャンセル</button>
        <button type="submit" class="btn btn-primary">
          <span class="material-icons">save</span>保存
        </button>
      </div>
    </form>`;

  openModal('スケジュール追加', content);

  setTimeout(() => {
    const form = document.getElementById('sm-schedule-form');
    if (!form) return;

    const classSelect = form.querySelector('[name="class_name"]');
    classSelect?.addEventListener('change', () => {
      const cls = getSmClassroomByName(classSelect.value);
      if (!cls) return;
      const venue = form.querySelector('[name="venue"]');
      if (venue && !venue.value) venue.value = cls.venue || '';
      // time_slot → start_time / end_time
      const { start, end } = parseTimeSlot(cls.time_slot);
      const st = form.querySelector('[name="start_time"]');
      const et = form.querySelector('[name="end_time"]');
      if (st && !st.value) st.value = start;
      if (et && !et.value) et.value = end;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveSmNewSchedule(form);
    });
  }, 100);
}

async function saveSmNewSchedule(form) {
  const fd = new FormData(form);
  const dateVal    = fd.get('date');
  const className  = fd.get('class_name');

  if (!className || !dateVal) {
    showToast('教室名と日付は必須です', 'warning');
    return;
  }

  const cls = getSmClassroomByName(className);

  const record = {
    class_name:   className,
    class_id:     cls?.id     || null,
    coach_name:   cls?.main_coach || null,
    date:         dateVal,
    start_time:   fd.get('start_time') || null,
    end_time:     fd.get('end_time')   || null,
    venue:        fd.get('venue')      || null,
    status:       'tentative',
    is_published: false,
    is_trial_ok:  true,
    fiscal_year:  getFiscalYear(dateVal),
  };

  const { error } = await smCreateSchedule(record);
  if (error) {
    showToast('保存に失敗しました', 'error');
    return;
  }

  showToast('スケジュールを追加しました', 'success');
  closeModal();
  await smReloadAndRender();
}

// --- 初期化（member-manager の tab callback から呼ばれる） ---

export async function initScheduleManager() {
  if (smCurrentFY) return; // 重複初期化防止

  smCurrentFY = getCurrentFiscalYear();

  populateSmFYSelects();

  // 教室・スケジュールを並列取得
  await Promise.all([loadClassrooms(), smLoadSchedules(smCurrentFY)]);
  populateSmFilters();

  renderSmDashboard();

  // 外部クリックでフィルターパネルを閉じる
  document.addEventListener('click', (e) => {
    if (!e.target.isConnected) return;
    const listDrop  = document.getElementById('sm-filter-dropdown');
    const statsDrop = document.getElementById('sm-stats-filter-dropdown');
    const calDrop   = document.getElementById('sm-cal-filter-dropdown');
    if (listDrop  && !listDrop.contains(e.target))  closeSmFilterPanel();
    if (statsDrop && !statsDrop.contains(e.target)) closeSmStatsFilterPanel();
    if (calDrop   && !calDrop.contains(e.target))   closeSmCalendarFilterPanel();
  });
}

// --- window.app へ公開 ---
// HTML onclick ハンドラが window.app.xxx() で呼べるように登録

setTimeout(() => {
  window.app = Object.assign(window.app || {}, {
    // タブ / FY
    switchSmTab,
    onSmFYChange,
    onSmListFYChange,
    onSmCalendarFYChange,
    // モーダル（member-manager のものを橋渡し）
    closeModal,
    showToast,
    // フィルター (リスト)
    toggleSmFilterPanel,
    closeSmFilterPanel,
    clearSmClassFilter,
    clearSmMonthFilter,
    clearSmStatusFilter,
    clearSmAllFilters,
    // フィルター (カレンダー)
    toggleSmCalendarFilterPanel,
    closeSmCalendarFilterPanel,
    clearSmCalendarClassFilter,
    clearSmCalendarFilters,
    toggleSmCalendarStatus,
    // フィルター (統計)
    toggleSmStatsFilterPanel,
    closeSmStatsFilterPanel,
    clearSmStatsClassFilter,
    clearSmStatsFilters,
    setSmStatsAchievementFilter,
    // 一括操作
    bulkSmConfirm,
    bulkSmTentative,
    bulkSmCancel,
    bulkSmPublish,
    bulkSmUnpublish,
    bulkSmDelete,
    executeSmBulkDelete,
    clearSmBulkSelection,
    // 個別追加
    openSmAddScheduleForm,
    // 一括生成 / ICSインポート
    openSmGenerateForm,
    openSmICSImportForm,
    // 外部から参照される reloadAndRender
    smReloadAndRender,
  });
}, 0);
