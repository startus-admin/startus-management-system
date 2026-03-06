import { supabase } from './supabase.js';
import { getAllMembers } from './members.js';
import { loadAllFees, getCurrentFiscalYear } from './fees.js';
import { escapeHtml } from './utils.js';
import { showToast, openModal, closeModal, setModalWide } from './app.js';

const MONTHS = ['04','05','06','07','08','09','10','11','12','01','02','03'];
const MONTH_LABELS = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];

let bulkFeeData = [];
let bulkFeeMap = {};
let bulkSelectedMonth = '';
let bulkFiscalYear = 0;

function getCurrentMonthKey() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return m;
}

export async function openBulkFeeCheck() {
  bulkFiscalYear = getCurrentFiscalYear();
  bulkSelectedMonth = getCurrentMonthKey();

  const members = getAllMembers().filter(m => m.status === '在籍');
  if (members.length === 0) {
    showToast('在籍会員がいません', 'warning');
    return;
  }

  const allFees = await loadAllFees(bulkFiscalYear);
  bulkFeeMap = {};
  allFees.forEach(f => { bulkFeeMap[f.member_id] = f; });
  bulkFeeData = members;

  renderBulkFeeModal();
}

function renderBulkFeeModal() {
  const monthOptions = MONTHS.map((m, i) =>
    `<option value="${m}" ${m === bulkSelectedMonth ? 'selected' : ''}>${MONTH_LABELS[i]}</option>`
  ).join('');

  let html = `<div style="margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div>
      <label style="font-size:0.85rem;font-weight:600;color:var(--gray-600)">対象月：</label>
      <select id="bulk-fee-month" class="fee-year-select" onchange="window.memberApp.onBulkMonthChange(this.value)">
        ${monthOptions}
      </select>
    </div>
    <div style="font-size:0.85rem;color:var(--gray-500)">${bulkFiscalYear}年度</div>
    <button class="fee-edit-btn" onclick="window.memberApp.toggleBulkFeeAll()" style="margin-left:auto">全選択/解除</button>
  </div>`;

  html += '<div class="import-table-wrap"><table class="import-table"><thead><tr>';
  html += '<th style="width:40px">納入</th><th>氏名</th><th>月謝額</th><th>状態</th></tr></thead><tbody>';

  bulkFeeData.forEach(m => {
    const fee = bulkFeeMap[m.id] || {};
    const paid = fee[`month_${bulkSelectedMonth}`] || false;
    const amount = fee.monthly_fee_amount || 0;

    html += `<tr>
      <td><input type="checkbox" class="bulk-fee-check" data-id="${m.id}" ${paid ? 'checked' : ''}></td>
      <td>${escapeHtml(m.name)}</td>
      <td>${amount ? Number(amount).toLocaleString() + '円' : '-'}</td>
      <td>${paid ? '<span style="color:var(--success-color)">納入済</span>' : '<span style="color:var(--gray-400)">未納</span>'}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  html += `<div class="form-actions" style="margin-top:12px">
    <button class="btn btn-secondary" onclick="window.memberApp.closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="window.memberApp.saveBulkFee()">
      <span class="material-icons">save</span>一括保存
    </button>
  </div>`;

  openModal('会費一括チェック', html);
  setModalWide(true);
}

export function onBulkMonthChange(month) {
  bulkSelectedMonth = month;
  renderBulkFeeModal();
}

export function toggleBulkFeeAll() {
  const checks = document.querySelectorAll('.bulk-fee-check');
  const allChecked = [...checks].every(c => c.checked);
  checks.forEach(c => { c.checked = !allChecked; });
}

export async function saveBulkFee() {
  const checks = document.querySelectorAll('.bulk-fee-check');
  let updated = 0;
  let errors = 0;

  for (const cb of checks) {
    const memberId = cb.dataset.id;
    const newPaid = cb.checked;
    const fee = bulkFeeMap[memberId] || {};
    const oldPaid = fee[`month_${bulkSelectedMonth}`] || false;

    if (newPaid === oldPaid) continue;

    const record = {
      member_id: memberId,
      fiscal_year: bulkFiscalYear,
      [`month_${bulkSelectedMonth}`]: newPaid,
    };

    const { error } = await supabase
      .from('member_fees')
      .upsert(record, { onConflict: 'member_id,fiscal_year' });

    if (error) {
      console.error('一括保存エラー:', error);
      errors++;
    } else {
      updated++;
    }
  }

  closeModal();
  setModalWide(false);

  if (errors > 0) {
    showToast(`${updated}件更新、${errors}件エラー`, 'warning');
  } else if (updated === 0) {
    showToast('変更はありませんでした', 'info');
  } else {
    showToast(`${updated}件更新しました`, 'success');
  }
}
