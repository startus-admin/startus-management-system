// sm-utils.js
// スケジュール管理タブ用ユーティリティ関数
// member-manager の utils.js にない関数を補完

export { escapeHtml } from './utils.js';

// --- 日付フォーマット ---

export function formatDateJP(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${m}/${day}(${dow})`;
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  return timeStr.slice(0, 5); // "HH:MM:SS" → "HH:MM"
}

// --- 年度計算（4月始まり） ---

export function getFiscalYear(date) {
  const d = date instanceof Date ? date : new Date(date + 'T00:00:00');
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month >= 4 ? String(year) : String(year - 1);
}

export function getCurrentFiscalYear() {
  return getFiscalYear(new Date());
}

export function getFiscalYearRange(fy) {
  const year = parseInt(fy, 10);
  return {
    start: `${year}-04-01`,
    end: `${year + 1}-03-31`,
  };
}

// --- 曜日ヘルパー ---

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export function getDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES[d.getDay()];
}

export function getDayIndex(dayName) {
  return DAY_NAMES.indexOf(dayName);
}

// --- 時刻スロット解析（classroom.time_slot "19:00〜20:30" → {start, end}） ---

export function parseTimeSlot(timeSlot) {
  if (!timeSlot) return { start: '', end: '' };
  const parts = timeSlot.split(/[〜~\-ー]/);
  const start = (parts[0] || '').trim();
  const end   = (parts[1] || '').trim();
  return { start, end };
}
