import { supabase } from './supabase.js';
import { escapeHtml } from './utils.js';
import { showToast, openModal, closeModal } from './app.js';
import { showDetail } from './members.js';

export const MONTHS = ['04','05','06','07','08','09','10','11','12','01','02','03'];
export const MONTH_LABELS = ['4','5','6','7','8','9','10','11','12','1','2','3'];

// --- ユーティリティ ---

export function getCurrentFiscalYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

function formatYen(amount) {
  if (!amount) return '0';
  return Number(amount).toLocaleString();
}

// --- データ層 ---

async function loadFee(memberId, fiscalYear) {
  const { data, error } = await supabase
    .from('member_fees')
    .select('*')
    .eq('member_id', memberId)
    .eq('fiscal_year', fiscalYear)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('会費データ読み込みエラー:', error);
  }
  return data || null;
}

export async function saveFee(memberId, fiscalYear, feeData) {
  const record = {
    member_id: memberId,
    fiscal_year: fiscalYear,
    ...feeData
  };

  const { error } = await supabase
    .from('member_fees')
    .upsert(record, { onConflict: 'member_id,fiscal_year' });

  return error;
}

// --- 詳細モーダル内の会費セクション ---

export function renderFeeSection(member) {
  const currentYear = getCurrentFiscalYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 2; y--) {
    years.push(y);
  }

  const yearOptions = years.map(y =>
    `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}年度</option>`
  ).join('');

  return `
    <div class="fee-section">
      <div class="fee-section-header">
        <span class="fee-section-title">
          <span class="material-icons">payments</span>会費情報
        </span>
        <select class="fee-year-select" id="fee-year-select"
          onchange="window.memberApp.onFiscalYearChange('${member.id}', this.value)">
          ${yearOptions}
        </select>
      </div>
      <div id="fee-content">
        <div class="fee-loading">読み込み中...</div>
      </div>
    </div>`;
}

export async function initFeeSection(memberId) {
  const year = getCurrentFiscalYear();
  await renderFeeContent(memberId, year);
}

export async function onFiscalYearChange(memberId, fiscalYear) {
  await renderFeeContent(memberId, parseInt(fiscalYear, 10));
}

async function renderFeeContent(memberId, fiscalYear) {
  const container = document.getElementById('fee-content');
  if (!container) return;

  container.innerHTML = '<div class="fee-loading">読み込み中...</div>';

  const fee = await loadFee(memberId, fiscalYear);

  if (!fee) {
    container.innerHTML = `
      <div class="fee-empty">
        <p>この年度の会費データはありません</p>
        <button class="fee-edit-btn" onclick="window.memberApp.openFeeEditForm('${memberId}', ${fiscalYear})">
          <span class="material-icons" style="font-size:16px">add</span>作成
        </button>
      </div>`;
    return;
  }

  const paidCount = MONTHS.filter(m => fee[`month_${m}`]).length;

  const monthHeaders = MONTH_LABELS.map(l =>
    `<div class="fee-monthly-cell fee-monthly-cell-header">${l}月</div>`
  ).join('');

  const monthValues = MONTHS.map(m => {
    const paid = fee[`month_${m}`];
    return `<div class="fee-monthly-cell fee-monthly-cell-value ${paid ? 'paid' : 'unpaid'}">
      <span class="material-icons" style="font-size:16px">${paid ? 'check' : 'remove'}</span>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="detail-grid" style="margin-bottom:8px">
      <div class="detail-row">
        <span class="detail-label">月謝金額</span>
        <span class="detail-value">${formatYen(fee.monthly_fee_amount)}円</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">入会金</span>
        <span class="detail-value">${formatYen(fee.enrollment_fee)}円</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">年会費</span>
        <span class="detail-value">${formatYen(fee.annual_fee)}円</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">保険料入金</span>
        <span class="detail-value">${formatYen(fee.insurance_payment)}円</span>
      </div>
    </div>
    <div class="fee-insurance-row">
      <span class="fee-insurance-item ${fee.insurance_procedure ? 'done' : 'pending'}">
        <span class="material-icons">${fee.insurance_procedure ? 'check_circle' : 'radio_button_unchecked'}</span>
        保険手続
      </span>
      <span class="fee-insurance-item ${fee.insurance_complete ? 'done' : 'pending'}">
        <span class="material-icons">${fee.insurance_complete ? 'check_circle' : 'radio_button_unchecked'}</span>
        保険完了
      </span>
    </div>
    <div style="margin-top:10px">
      <div style="font-size:0.82rem;color:var(--gray-500);font-weight:600;margin-bottom:4px">
        月謝納入（${paidCount}/12）
      </div>
      <div class="fee-monthly-grid">
        ${monthHeaders}${monthValues}
      </div>
    </div>
    ${fee.note ? `<div class="detail-row" style="margin-top:4px"><span class="detail-label">メモ</span><span class="detail-value">${escapeHtml(fee.note)}</span></div>` : ''}
    <div style="text-align:right;margin-top:8px">
      <button class="fee-edit-btn" onclick="window.memberApp.openFeeEditForm('${memberId}', ${fiscalYear})">
        <span class="material-icons" style="font-size:16px">edit</span>会費編集
      </button>
    </div>`;
}

// --- 会費編集モーダル ---

export async function openFeeEditForm(memberId, fiscalYear) {
  closeModal();

  setTimeout(async () => {
    const fee = await loadFee(memberId, parseInt(fiscalYear, 10)) || {};

    const monthCheckboxes = MONTHS.map((m, i) => {
      const checked = fee[`month_${m}`] ? 'checked' : '';
      return `<div class="fee-monthly-checkbox">
        <div style="font-size:0.75rem;color:var(--gray-500);margin-bottom:2px">${MONTH_LABELS[i]}月</div>
        <input type="checkbox" name="month_${m}" ${checked}>
      </div>`;
    }).join('');

    const content = `
      <form id="fee-form" onsubmit="return false;">
        <div class="form-row">
          <div class="form-group">
            <label>月謝金額（円）</label>
            <input type="number" name="monthly_fee_amount" value="${fee.monthly_fee_amount || 0}" min="0">
          </div>
          <div class="form-group">
            <label>入会金（円）</label>
            <input type="number" name="enrollment_fee" value="${fee.enrollment_fee || 0}" min="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>年会費（円）</label>
            <input type="number" name="annual_fee" value="${fee.annual_fee || 0}" min="0">
          </div>
          <div class="form-group">
            <label>保険料入金（円）</label>
            <input type="number" name="insurance_payment" value="${fee.insurance_payment || 0}" min="0">
          </div>
        </div>
        <div class="fee-insurance-row" style="margin:12px 0">
          <label class="fee-insurance-check">
            <input type="checkbox" name="insurance_procedure" ${fee.insurance_procedure ? 'checked' : ''}>
            保険手続済み
          </label>
          <label class="fee-insurance-check">
            <input type="checkbox" name="insurance_complete" ${fee.insurance_complete ? 'checked' : ''}>
            保険完了
          </label>
        </div>
        <div style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin-bottom:6px">月謝納入</div>
        <div class="fee-monthly-grid fee-monthly-grid-edit">
          ${monthCheckboxes}
        </div>
        <div class="form-group" style="margin-top:12px">
          <label>メモ</label>
          <textarea name="note" rows="2">${escapeHtml(fee.note || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="window.memberApp.cancelFeeEdit('${memberId}')">キャンセル</button>
          <button type="submit" class="btn btn-primary">
            <span class="material-icons">save</span>保存
          </button>
        </div>
      </form>`;

    openModal(`会費編集（${fiscalYear}年度）`, content);

    setTimeout(() => {
      const form = document.getElementById('fee-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          submitFeeForm(memberId, parseInt(fiscalYear, 10), form);
        });
      }
    }, 100);
  }, 200);
}

async function submitFeeForm(memberId, fiscalYear, form) {
  const fd = new FormData(form);

  const feeData = {
    monthly_fee_amount: parseInt(fd.get('monthly_fee_amount') || '0', 10),
    enrollment_fee: parseInt(fd.get('enrollment_fee') || '0', 10),
    annual_fee: parseInt(fd.get('annual_fee') || '0', 10),
    insurance_payment: parseInt(fd.get('insurance_payment') || '0', 10),
    insurance_procedure: !!form.querySelector('[name="insurance_procedure"]').checked,
    insurance_complete: !!form.querySelector('[name="insurance_complete"]').checked,
    note: fd.get('note') || '',
  };

  MONTHS.forEach(m => {
    feeData[`month_${m}`] = !!form.querySelector(`[name="month_${m}"]`).checked;
  });

  const error = await saveFee(memberId, fiscalYear, feeData);
  if (error) {
    console.error('会費保存エラー:', error);
    showToast('保存に失敗しました', 'error');
    return;
  }

  closeModal();
  showToast('保存しました', 'success');
  setTimeout(() => showDetail(memberId), 200);
}

export function cancelFeeEdit(memberId) {
  closeModal();
  setTimeout(() => showDetail(memberId), 200);
}

// --- エクスポート用: 会費データ一括取得 ---

export async function loadAllFees(fiscalYear) {
  const { data, error } = await supabase
    .from('member_fees')
    .select('*')
    .eq('fiscal_year', fiscalYear);

  if (error) {
    console.error('会費データ一括読み込みエラー:', error);
    return [];
  }
  return data || [];
}
