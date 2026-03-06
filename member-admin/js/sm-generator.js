// sm-generator.js
// スケジュール管理タブ 繰り返し一括生成

import { escapeHtml, getFiscalYear, getFiscalYearRange, getDayIndex, formatDateJP, parseTimeSlot } from './sm-utils.js';
import { getSmClassroomByName, buildSmClassroomOptions, getSmCurrentFY, smReloadAndRender } from './sm-manager.js';
import { smBulkCreateSchedules } from './sm-store.js';
import { showToast, openModal, closeModal } from './app.js';
import { getClassrooms } from './classroom.js';

// --- 生成プレビュー状態 ---
let previewDates = [];

// --- 繰り返し生成フォーム ---

export function openSmGenerateForm() {
  const fy    = getSmCurrentFY();
  const range = getFiscalYearRange(fy);
  const classOptions = buildSmClassroomOptions();

  const content = `
    <form id="sm-generate-form" onsubmit="return false;">
      <div class="form-grid">
        <div class="form-group">
          <label>教室名 <span class="required">*</span></label>
          <select name="class_name" id="sm-gen-class" required>
            <option value="">選択してください</option>
            ${classOptions}
          </select>
        </div>
        <div class="form-group">
          <label>曜日 <span class="required">*</span></label>
          <select name="day_of_week" id="sm-gen-day" required>
            <option value="">選択してください</option>
            <option value="月">月曜日</option>
            <option value="火">火曜日</option>
            <option value="水">水曜日</option>
            <option value="木">木曜日</option>
            <option value="金">金曜日</option>
            <option value="土">土曜日</option>
            <option value="日">日曜日</option>
          </select>
        </div>
        <div class="form-group">
          <label>開始時間</label>
          <input type="time" name="start_time" id="sm-gen-start-time">
        </div>
        <div class="form-group">
          <label>終了時間</label>
          <input type="time" name="end_time" id="sm-gen-end-time">
        </div>
        <div class="form-group">
          <label>期間開始 <span class="required">*</span></label>
          <input type="date" name="period_start" value="${range.start}" required>
        </div>
        <div class="form-group">
          <label>期間終了 <span class="required">*</span></label>
          <input type="date" name="period_end" value="${range.end}" required>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>会場</label>
          <input type="text" name="venue" id="sm-gen-venue" placeholder="会場名">
        </div>
      </div>

      <div class="generate-preview" id="sm-generate-preview" style="display:none">
        <h4>生成プレビュー</h4>
        <div id="sm-preview-summary"></div>
        <div class="preview-select-actions">
          <button type="button" class="btn btn-sm btn-outline" onclick="window.app.smPreviewSelectAll()">全選択</button>
          <button type="button" class="btn btn-sm btn-outline" onclick="window.app.smPreviewDeselectAll()">全解除</button>
        </div>
        <div class="preview-dates-list" id="sm-preview-dates"></div>
        <div id="sm-preview-selected-count"></div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">キャンセル</button>
        <button type="button" class="btn btn-outline" id="sm-btn-preview" onclick="window.app.smPreviewGenerate()">
          <span class="material-icons">preview</span>プレビュー
        </button>
        <button type="submit" class="btn btn-primary" id="sm-btn-generate" disabled>
          <span class="material-icons">auto_fix_high</span>一括生成
        </button>
      </div>
    </form>`;

  openModal('繰り返し予定の一括生成', content);

  setTimeout(() => {
    const form = document.getElementById('sm-generate-form');
    if (!form) return;

    const classSelect = form.querySelector('[name="class_name"]');
    classSelect?.addEventListener('change', () => {
      const cls = getSmClassroomByName(classSelect.value);
      if (!cls) return;

      const venue = form.querySelector('[name="venue"]');
      if (venue) venue.value = cls.venue || '';

      if (cls.day_of_week && cls.day_of_week.length > 0) {
        const daySelect = form.querySelector('[name="day_of_week"]');
        if (daySelect) daySelect.value = cls.day_of_week[0];
      }

      // time_slot → start_time / end_time
      const { start, end } = parseTimeSlot(cls.time_slot);
      const st = form.querySelector('[name="start_time"]');
      const et = form.querySelector('[name="end_time"]');
      if (st) st.value = start;
      if (et) et.value = end;

      smResetPreview();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await smExecuteGenerate(form);
    });
  }, 100);
}

// --- プレビュー ---

function smPreviewGenerate() {
  const form = document.getElementById('sm-generate-form');
  if (!form) return;

  const fd = new FormData(form);
  const className   = fd.get('class_name');
  const dayName     = fd.get('day_of_week');
  const periodStart = fd.get('period_start');
  const periodEnd   = fd.get('period_end');

  if (!className || !dayName || !periodStart || !periodEnd) {
    showToast('教室名、曜日、期間を入力してください', 'warning');
    return;
  }

  previewDates = smGenerateDates(dayName, periodStart, periodEnd);

  const previewEl = document.getElementById('sm-generate-preview');
  const summaryEl = document.getElementById('sm-preview-summary');
  const datesEl   = document.getElementById('sm-preview-dates');
  const btnGen    = document.getElementById('sm-btn-generate');

  if (previewDates.length === 0) {
    summaryEl.innerHTML = '<p class="text-warning">指定条件に該当する日付がありません</p>';
    datesEl.innerHTML   = '';
    previewEl.style.display = '';
    btnGen.disabled = true;
    return;
  }

  summaryEl.innerHTML = `
    <p><strong>${escapeHtml(className)}</strong> × 毎週<strong>${escapeHtml(dayName)}</strong>曜日</p>
    <p>全候補日数: <strong>${previewDates.length}件</strong></p>`;

  datesEl.innerHTML = previewDates.map((d, i) => {
    const hint = smGetDateHint(d);
    return `
      <label class="preview-date-item">
        <input type="checkbox" class="sm-preview-date-check" data-index="${i}" checked>
        <span class="preview-date-label">${formatDateJP(d)}</span>
        ${hint ? `<span class="preview-date-hint">${escapeHtml(hint)}</span>` : ''}
      </label>`;
  }).join('');

  smUpdatePreviewCount();
  previewEl.style.display = '';
  btnGen.disabled = false;

  datesEl.querySelectorAll('.sm-preview-date-check').forEach(cb => {
    cb.addEventListener('change', smUpdatePreviewCount);
  });
}

function smUpdatePreviewCount() {
  const checks  = document.querySelectorAll('.sm-preview-date-check');
  const checked = document.querySelectorAll('.sm-preview-date-check:checked');
  const countEl = document.getElementById('sm-preview-selected-count');
  const btnGen  = document.getElementById('sm-btn-generate');
  if (countEl) countEl.innerHTML = `<p>生成件数: <strong>${checked.length}</strong> / ${checks.length}件</p>`;
  if (btnGen)  btnGen.disabled = checked.length === 0;
}

function smPreviewSelectAll() {
  document.querySelectorAll('.sm-preview-date-check').forEach(cb => cb.checked = true);
  smUpdatePreviewCount();
}

function smPreviewDeselectAll() {
  document.querySelectorAll('.sm-preview-date-check').forEach(cb => cb.checked = false);
  smUpdatePreviewCount();
}

// --- 日付ヒント ---

function smGetDateHint(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  if (m === 8 && d >= 13 && d <= 16) return 'お盆';
  if (m === 12 && d >= 28) return '年末';
  if (m === 1 && d <= 3) return '年始';
  if (m === 5 && d >= 3 && d <= 5) return 'GW';
  return '';
}

function smResetPreview() {
  const previewEl = document.getElementById('sm-generate-preview');
  const btnGen    = document.getElementById('sm-btn-generate');
  if (previewEl) previewEl.style.display = 'none';
  if (btnGen)    btnGen.disabled = true;
  previewDates = [];
}

// --- 日付生成アルゴリズム ---

function smGenerateDates(dayName, startStr, endStr) {
  const targetDayIndex = getDayIndex(dayName);
  if (targetDayIndex < 0) return [];

  const dates   = [];
  const current = new Date(startStr + 'T00:00:00');
  const end     = new Date(endStr   + 'T00:00:00');

  while (current <= end) {
    if (current.getDay() === targetDayIndex) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// --- 一括生成実行 ---

async function smExecuteGenerate(form) {
  const fd        = new FormData(form);
  const className = fd.get('class_name');
  const startTime = fd.get('start_time') || null;
  const endTime   = fd.get('end_time')   || null;
  const venue     = fd.get('venue')      || null;

  const checkedDates = [];
  document.querySelectorAll('.sm-preview-date-check:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.index, 10);
    if (previewDates[idx]) checkedDates.push(previewDates[idx]);
  });

  if (checkedDates.length === 0) {
    showToast('生成する日付がありません', 'warning');
    return;
  }

  const cls          = getSmClassroomByName(className);
  const classId      = cls?.id         || null;
  const coachName    = cls?.main_coach || null;
  const batchGroupId = crypto.randomUUID();

  const records = checkedDates.map(date => ({
    class_name:     className,
    class_id:       classId,
    coach_name:     coachName,
    date,
    start_time:     startTime,
    end_time:       endTime,
    venue,
    status:         'tentative',
    is_published:   false,
    is_trial_ok:    true,
    batch_group_id: batchGroupId,
    fiscal_year:    getFiscalYear(date),
  }));

  const { data, error } = await smBulkCreateSchedules(records);
  if (error) {
    showToast('一括生成に失敗しました', 'error');
    return;
  }

  showToast(`${checkedDates.length}件のスケジュールを生成しました`, 'success');
  closeModal();
  await smReloadAndRender();
}

// --- window.app に追加 ---
setTimeout(() => {
  window.app = Object.assign(window.app || {}, {
    smPreviewGenerate,
    smPreviewSelectAll,
    smPreviewDeselectAll,
  });
}, 0);
