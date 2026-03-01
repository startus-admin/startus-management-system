import { getAllMembers } from './members.js';
import { loadAllFees, getCurrentFiscalYear } from './fees.js';
import { escapeHtml } from './utils.js';

const MONTHS = ['04','05','06','07','08','09','10','11','12','01','02','03'];
const MONTH_LABELS = ['4','5','6','7','8','9','10','11','12','1','2','3'];

let currentOverviewYear = null;

export async function renderFeeOverview() {
  const year = currentOverviewYear || getCurrentFiscalYear();
  currentOverviewYear = year;

  // 年度セレクタ更新
  const sel = document.getElementById('fee-overview-year');
  if (sel && sel.options.length === 0) {
    const cy = getCurrentFiscalYear();
    for (let y = cy; y >= cy - 2; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y}年度`;
      if (y === year) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      onFeeOverviewYearChange(parseInt(sel.value, 10));
    });
  }

  const wrap = document.getElementById('fee-overview-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="fee-loading">読み込み中...</div>';

  const members = getAllMembers().filter(m => m.status === '在籍');
  const allFees = await loadAllFees(year);
  const feeMap = {};
  allFees.forEach(f => { feeMap[f.member_id] = f; });

  if (members.length === 0) {
    wrap.innerHTML = '<p class="text-muted">在籍会員がいません</p>';
    return;
  }

  let html = '<table class="fee-overview-table"><thead><tr>';
  html += '<th class="name-cell">氏名</th><th>月謝</th>';
  MONTH_LABELS.forEach(l => { html += `<th>${l}月</th>`; });
  html += '<th>納入</th></tr></thead><tbody>';

  members.forEach(m => {
    const fee = feeMap[m.id] || {};
    const paidCount = MONTHS.filter(mo => fee[`month_${mo}`]).length;

    html += `<tr><td class="name-cell">${escapeHtml(m.name)}</td>`;
    html += `<td>${fee.monthly_fee_amount ? Number(fee.monthly_fee_amount).toLocaleString() : '-'}</td>`;
    MONTHS.forEach(mo => {
      const paid = fee[`month_${mo}`];
      html += `<td class="${paid ? 'paid-mark' : 'unpaid-mark'}">${paid ? '○' : '-'}</td>`;
    });
    html += `<td><strong>${paidCount}</strong>/12</td></tr>`;
  });

  // 集計行
  html += '<tr class="fee-overview-summary"><td class="name-cell"><strong>合計</strong></td><td></td>';
  MONTHS.forEach(mo => {
    const paidCount = members.filter(m => {
      const fee = feeMap[m.id];
      return fee && fee[`month_${mo}`];
    }).length;
    html += `<td><strong>${paidCount}</strong>/${members.length}</td>`;
  });
  const totalPaid = members.reduce((sum, m) => {
    const fee = feeMap[m.id] || {};
    return sum + MONTHS.filter(mo => fee[`month_${mo}`]).length;
  }, 0);
  html += `<td><strong>${totalPaid}</strong>/${members.length * 12}</td>`;
  html += '</tr></tbody></table>';

  wrap.innerHTML = html;
}

export async function onFeeOverviewYearChange(year) {
  currentOverviewYear = year;
  await renderFeeOverview();
}
