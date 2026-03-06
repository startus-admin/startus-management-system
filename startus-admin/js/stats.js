import { getAllMembers } from './members.js';
import { loadAllFees, getCurrentFiscalYear } from './fees.js';
import { supabase } from './supabase.js';

const MONTHS = ['04','05','06','07','08','09','10','11','12','01','02','03'];

export async function renderStats() {
  const container = document.getElementById('stats-content');
  if (!container) return;

  container.innerHTML = '<div class="fee-loading">集計中...</div>';

  const all = getAllMembers();
  const active = all.filter(m => m.status === '在籍');
  const suspended = all.filter(m => m.status === '休会');
  const withdrawn = all.filter(m => m.status === '退会');

  // 種別集計
  const typeMap = {};
  active.forEach(m => {
    typeMap[m.member_type] = (typeMap[m.member_type] || 0) + 1;
  });

  // 教室集計
  const classMap = {};
  active.forEach(m => {
    (m.classes || []).forEach(c => {
      classMap[c] = (classMap[c] || 0) + 1;
    });
  });

  // 学年集計
  const gradeMap = {};
  active.forEach(m => {
    if (m.grade) gradeMap[m.grade] = (gradeMap[m.grade] || 0) + 1;
  });

  // 会費集計
  const year = getCurrentFiscalYear();
  const fees = await loadAllFees(year);
  const feeMap = {};
  fees.forEach(f => { feeMap[f.member_id] = f; });

  const totalMonths = active.length * 12;
  let paidMonths = 0;
  active.forEach(m => {
    const fee = feeMap[m.id] || {};
    MONTHS.forEach(mo => {
      if (fee[`month_${mo}`]) paidMonths++;
    });
  });
  const feeRate = totalMonths > 0 ? Math.round((paidMonths / totalMonths) * 100) : 0;

  let html = '<div class="stats-grid">';

  // 在籍数カード
  html += statCard('在籍', active.length, '人', 'people', 'primary');
  html += statCard('休会', suspended.length, '人', 'pause_circle', 'warning');
  html += statCard('退会', withdrawn.length, '人', 'cancel', 'gray');
  html += statCard(`会費徴収率 (${year}年度)`, `${feeRate}%`, `${paidMonths}/${totalMonths}月`, 'payments', feeRate >= 80 ? 'success' : feeRate >= 50 ? 'warning' : 'danger');

  html += '</div>';

  // 種別内訳
  html += '<div class="stat-card"><div class="stat-card-title">種別内訳（在籍者）</div>';
  const sortedTypes = Object.entries(typeMap).sort((a, b) => b[1] - a[1]);
  sortedTypes.forEach(([type, count]) => {
    const pct = active.length > 0 ? Math.round((count / active.length) * 100) : 0;
    html += `<div class="stat-list-item">
      <span>${type}</span>
      <span><strong>${count}</strong>人（${pct}%）</span>
    </div>
    <div class="stat-bar"><div class="stat-bar-fill stat-bar-fill-primary" style="width:${pct}%"></div></div>`;
  });
  html += '</div>';

  // 教室内訳
  if (Object.keys(classMap).length > 0) {
    html += '<div class="stat-card" style="margin-top:16px"><div class="stat-card-title">教室別（在籍者）</div>';
    const sortedClasses = Object.entries(classMap).sort((a, b) => b[1] - a[1]);
    sortedClasses.forEach(([cls, count]) => {
      const pct = active.length > 0 ? Math.round((count / active.length) * 100) : 0;
      html += `<div class="stat-list-item">
        <span>${cls}</span>
        <span><strong>${count}</strong>人</span>
      </div>
      <div class="stat-bar"><div class="stat-bar-fill stat-bar-fill-success" style="width:${pct}%"></div></div>`;
    });
    html += '</div>';
  }

  // 学年内訳
  if (Object.keys(gradeMap).length > 0) {
    html += '<div class="stat-card" style="margin-top:16px"><div class="stat-card-title">学年別（在籍者）</div>';
    const sortedGrades = Object.entries(gradeMap).sort((a, b) => b[1] - a[1]);
    sortedGrades.forEach(([grade, count]) => {
      const pct = active.length > 0 ? Math.round((count / active.length) * 100) : 0;
      html += `<div class="stat-list-item">
        <span>${grade}</span>
        <span><strong>${count}</strong>人</span>
      </div>
      <div class="stat-bar"><div class="stat-bar-fill stat-bar-fill-warning" style="width:${pct}%"></div></div>`;
    });
    html += '</div>';
  }

  // 体験転換率セクション
  html += '<div id="trial-stats-section"></div>';

  container.innerHTML = html;

  // 体験統計を非同期で描画
  await renderTrialStatsSection();
}

function statCard(title, value, sub, icon, color) {
  const colorMap = {
    primary: 'var(--primary-color)',
    success: 'var(--success-color)',
    warning: 'var(--warning-color)',
    danger: 'var(--danger-color)',
    gray: 'var(--gray-400)',
  };
  return `<div class="stat-card">
    <div class="stat-card-title">
      <span class="material-icons" style="font-size:18px;color:${colorMap[color] || colorMap.primary};vertical-align:middle;margin-right:4px">${icon}</span>
      ${title}
    </div>
    <div class="stat-card-value" style="color:${colorMap[color] || colorMap.primary}">${value}</div>
    ${sub ? `<div style="font-size:0.8rem;color:var(--gray-400);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

// ===== 体験転換率統計 =====

const TRIAL_STATUS_LABELS = {
  pending: '未対応', reviewed: '受付済み', approved: '体験済み',
  enrolled: '入会済み', rejected: 'キャンセル'
};

const TRIAL_STATUS_BADGE = {
  pending: 'badge-app-pending', reviewed: 'badge-app-reviewed',
  approved: 'badge-app-approved', enrolled: 'badge-enrolled',
  rejected: 'badge-app-rejected'
};

const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const MONTH_LABELS = { 4:'4月', 5:'5月', 6:'6月', 7:'7月', 8:'8月', 9:'9月',
                       10:'10月', 11:'11月', 12:'12月', 1:'1月', 2:'2月', 3:'3月' };

let selectedTrialFY = null;
let cachedTrials = [];

function getFiscalYearFromDate(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  return month >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

function getTrialMonth(dateStr) {
  return new Date(dateStr).getMonth() + 1;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadTrialStatsData() {
  const { data: trials } = await supabase
    .from('applications')
    .select('*')
    .eq('type', 'trial')
    .order('created_at', { ascending: false });

  cachedTrials = trials || [];
}

async function renderTrialStatsSection() {
  const el = document.getElementById('trial-stats-section');
  if (!el) return;

  await loadTrialStatsData();

  if (cachedTrials.length === 0) {
    el.innerHTML = `
      <h3 style="margin-top:32px;margin-bottom:12px;font-size:1.1rem;color:var(--gray-700)">
        <span class="material-icons" style="font-size:20px;vertical-align:middle;margin-right:4px">directions_run</span>
        体験→入会 転換率
      </h3>
      <p class="text-muted">体験データがありません</p>`;
    return;
  }

  // 利用可能な年度
  const fySet = new Set(cachedTrials.map(t => getFiscalYearFromDate(t.created_at)));
  const fiscalYears = [...fySet].sort((a, b) => b - a);

  if (selectedTrialFY === null) selectedTrialFY = getCurrentFiscalYear();

  // 年度セレクタ
  const fyOptions = fiscalYears.map(fy =>
    `<option value="${fy}" ${fy === selectedTrialFY ? 'selected' : ''}>${fy}年度</option>`
  ).join('');

  // 選択期間のデータ
  const trials = selectedTrialFY === 'all'
    ? cachedTrials
    : cachedTrials.filter(t => getFiscalYearFromDate(t.created_at) === selectedTrialFY);

  const total = trials.length;

  // ステータス別集計
  const byStatus = {};
  trials.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });

  // 入会数
  const enrolledCount = trials.filter(t =>
    t.status === 'enrolled' || t.linked_application_id
  ).length;

  // 体験済み以上
  const completedCount = trials.filter(t =>
    t.status === 'approved' || t.status === 'enrolled'
  ).length;

  const conversionRate = completedCount > 0
    ? Math.round((enrolledCount / completedCount) * 100) : 0;
  const overallRate = total > 0
    ? Math.round((enrolledCount / total) * 100) : 0;

  // 月別内訳テーブル
  let monthlyTableHtml = '';
  if (selectedTrialFY !== 'all' && total > 0) {
    const monthlyRows = FY_MONTHS.map(m => {
      const monthTrials = trials.filter(t => getTrialMonth(t.created_at) === m);
      const monthTotal = monthTrials.length;
      const monthEnrolled = monthTrials.filter(t =>
        t.status === 'enrolled' || t.linked_application_id
      ).length;
      const monthRate = monthTotal > 0 ? Math.round((monthEnrolled / monthTotal) * 100) + '%' : '-';
      return `<tr>
        <td>${MONTH_LABELS[m]}</td>
        <td style="text-align:right">${monthTotal}</td>
        <td style="text-align:right">${monthEnrolled}</td>
        <td style="text-align:right">${monthRate}</td>
      </tr>`;
    }).join('');

    monthlyTableHtml = `
      <div class="trial-stats-section" style="margin-bottom:16px">
        <h4>月別内訳</h4>
        <table class="trial-monthly-table">
          <thead><tr>
            <th>月</th>
            <th style="text-align:right">体験数</th>
            <th style="text-align:right">入会数</th>
            <th style="text-align:right">転換率</th>
          </tr></thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </div>`;
  }

  // ステータス別バー
  const statusBars = Object.entries(TRIAL_STATUS_LABELS).map(([key, label]) => {
    const count = byStatus[key] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="stat-bar-row">
        <span class="stat-bar-label">${escapeHtml(label)}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill ${TRIAL_STATUS_BADGE[key]}" style="width:${pct}%"></div></div>
        <span class="stat-bar-value">${count}</span>
      </div>`;
  }).join('');

  // 紹介元集計
  const byRoute = {};
  trials.forEach(t => {
    const route = t.form_data?.route || '不明';
    const routes = route.split(/[,、]/).map(r => r.trim()).filter(Boolean);
    routes.forEach(r => { byRoute[r] = (byRoute[r] || 0) + 1; });
  });

  const routeRows = Object.entries(byRoute)
    .sort((a, b) => b[1] - a[1])
    .map(([route, count]) => `
      <div class="stat-bar-row">
        <span class="stat-bar-label">${escapeHtml(route)}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round((count / total) * 100)}%;background:var(--primary-color)"></div></div>
        <span class="stat-bar-value">${count}</span>
      </div>`)
    .join('');

  // 教室別集計
  const byClass = {};
  trials.forEach(t => {
    const classes = t.form_data?.desired_classes || [];
    const classArr = Array.isArray(classes) ? classes : [classes];
    classArr.forEach(c => { if (c) byClass[c] = (byClass[c] || 0) + 1; });
  });

  const classRows = Object.entries(byClass)
    .sort((a, b) => b[1] - a[1])
    .map(([cls, count]) => `
      <div class="stat-bar-row">
        <span class="stat-bar-label">${escapeHtml(cls)}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round((count / total) * 100)}%;background:var(--info-color, #3b82f6)"></div></div>
        <span class="stat-bar-value">${count}</span>
      </div>`)
    .join('');

  el.innerHTML = `
    <h3 style="margin-top:32px;margin-bottom:12px;font-size:1.1rem;color:var(--gray-700)">
      <span class="material-icons" style="font-size:20px;vertical-align:middle;margin-right:4px">directions_run</span>
      体験→入会 転換率
    </h3>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
      <select id="trial-stats-fy" onchange="window.memberApp.changeStatsFY(this.value)"
              style="padding:6px 8px;border:1px solid var(--gray-200);border-radius:var(--radius-sm)">
        ${fyOptions}
        <option value="all" ${selectedTrialFY === 'all' ? 'selected' : ''}>全期間</option>
      </select>
    </div>

    ${total === 0 ? '<p class="text-muted">選択期間のデータがありません</p>' : `
    <div class="trial-stats-grid">
      <div class="stat-card">
        <div class="stat-card-title">体験数</div>
        <div class="stat-card-value">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">入会数</div>
        <div class="stat-card-value">${enrolledCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">転換率（体験済み対比）</div>
        <div class="stat-card-value">${conversionRate}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">転換率（全体対比）</div>
        <div class="stat-card-value">${overallRate}%</div>
      </div>
    </div>

    ${monthlyTableHtml}

    <div class="trial-stats-sections">
      <div class="trial-stats-section">
        <h4>ステータス別</h4>
        ${statusBars}
      </div>
      <div class="trial-stats-section">
        <h4>紹介元</h4>
        ${routeRows || '<p class="text-muted">データなし</p>'}
      </div>
      <div class="trial-stats-section">
        <h4>教室別</h4>
        ${classRows || '<p class="text-muted">データなし</p>'}
      </div>
    </div>`}`;
}

export function changeStatsFY(value) {
  selectedTrialFY = value === 'all' ? 'all' : parseInt(value, 10);
  renderTrialStatsSection();
}
