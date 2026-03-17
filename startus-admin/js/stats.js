import { getAllMembers } from './members.js';
import { loadAllFees, getCurrentFiscalYear } from './fees.js';
import { supabase } from './supabase.js';
import { tagToName } from './class-utils.js';

const MONTHS = ['04','05','06','07','08','09','10','11','12','01','02','03'];

// Chart.js インスタンス管理
let chartInstances = [];

function destroyAllCharts() {
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
}

// カラーパレット
const COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  gray: '#94a3b8',
  indigo: '#6366f1',
  purple: '#8b5cf6',
  pink: '#ec4899',
  teal: '#14b8a6',
  orange: '#f97316',
  cyan: '#06b6d4',
  lime: '#84cc16',
};
const CHART_PALETTE = [
  COLORS.primary, COLORS.success, COLORS.warning, COLORS.danger,
  COLORS.indigo, COLORS.purple, COLORS.pink, COLORS.teal,
  COLORS.orange, COLORS.cyan, COLORS.lime, COLORS.gray
];

// Chart.js 共通設定
function setupChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#64748b';
  Chart.defaults.animation.duration = 800;
  Chart.defaults.animation.easing = 'easeOutQuart';
}

// カウントアップアニメーション
function animateCount(el, target, suffix = '', duration = 800) {
  const isPercent = suffix === '%';
  let startTime = null;
  const step = (ts) => {
    if (!startTime) startTime = ts;
    const progress = Math.min((ts - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target + suffix;
  };
  requestAnimationFrame(step);
}

// 強化カード生成
function statCardEnhanced(title, value, sub, icon, color, animateId) {
  const colorClass = `color-${color}`;
  const bgClass = `bg-${color}`;
  const colorMap = {
    primary: 'var(--primary-color)', success: 'var(--success-color)',
    warning: 'var(--warning-color)', danger: 'var(--danger-color)',
    gray: 'var(--gray-400)',
  };
  return `<div class="stat-card stat-card-enhanced ${colorClass} stats-animate">
    <div class="stat-card-icon-wrap ${bgClass}">
      <span class="material-icons">${icon}</span>
    </div>
    <div class="stat-card-title">${title}</div>
    <div class="stat-card-value" style="color:${colorMap[color] || colorMap.primary}" data-animate-count="${animateId}">${value}</div>
    ${sub ? `<div style="font-size:0.8rem;color:var(--gray-400);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

// チャート生成ヘルパー
function createChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const chart = new Chart(canvas, config);
  chartInstances.push(chart);
  return chart;
}

export async function renderStats() {
  const container = document.getElementById('stats-content');
  if (!container) return;

  destroyAllCharts();
  setupChartDefaults();

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
  const feeColor = feeRate >= 80 ? 'success' : feeRate >= 50 ? 'warning' : 'danger';

  // ===== HTML構築 =====
  let html = '';

  // サマリーカード
  html += '<div class="stats-grid">';
  html += statCardEnhanced('在籍', active.length, '人', 'people', 'primary', 'active');
  html += statCardEnhanced('休会', suspended.length, '人', 'pause_circle', 'warning', 'suspended');
  html += statCardEnhanced('退会', withdrawn.length, '人', 'cancel', 'gray', 'withdrawn');
  html += statCardEnhanced(`会費徴収率 (${year}年度)`, `${feeRate}%`, `${paidMonths}/${totalMonths}月`, 'payments', feeColor, 'feeRate');
  html += '</div>';

  // チャートセクション
  html += '<div class="stats-section-header"><span class="material-icons">analytics</span>会員分析</div>';
  html += '<div class="stats-charts-grid">';

  // 種別内訳 Doughnut
  html += `<div class="stats-chart-card stats-animate">
    <h4><span class="material-icons">pie_chart</span>種別内訳（在籍者）</h4>
    <div class="chart-wrap"><canvas id="chart-member-type"></canvas></div>
  </div>`;

  // 学年別 Bar
  html += `<div class="stats-chart-card stats-animate">
    <h4><span class="material-icons">school</span>学年別（在籍者）</h4>
    <div class="chart-wrap"><canvas id="chart-grade"></canvas></div>
  </div>`;

  // 教室別 Horizontal Bar (全幅)
  html += `<div class="stats-chart-card stats-animate full-width">
    <h4><span class="material-icons">meeting_room</span>教室別（在籍者）</h4>
    <div class="chart-wrap" style="height:${Math.max(320, Object.keys(classMap).length * 28)}px"><canvas id="chart-classroom"></canvas></div>
  </div>`;

  html += '</div>'; // stats-charts-grid

  // 体験転換率セクション
  html += '<div id="trial-stats-section"></div>';

  container.innerHTML = html;

  // ===== カウントアップアニメーション =====
  const countTargets = {
    active: { value: active.length, suffix: '' },
    suspended: { value: suspended.length, suffix: '' },
    withdrawn: { value: withdrawn.length, suffix: '' },
    feeRate: { value: feeRate, suffix: '%' },
  };

  Object.entries(countTargets).forEach(([key, { value, suffix }]) => {
    const el = container.querySelector(`[data-animate-count="${key}"]`);
    if (el) animateCount(el, value, suffix);
  });

  // ===== Chart.js チャート描画 =====
  if (typeof Chart !== 'undefined') {
    // 種別内訳 Doughnut
    const sortedTypes = Object.entries(typeMap).sort((a, b) => b[1] - a[1]);
    createChart('chart-member-type', {
      type: 'doughnut',
      data: {
        labels: sortedTypes.map(([t]) => t),
        datasets: [{
          data: sortedTypes.map(([, c]) => c),
          backgroundColor: CHART_PALETTE.slice(0, sortedTypes.length),
          borderWidth: 2,
          borderColor: '#fff',
          hoverBorderWidth: 3,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'right',
            labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = Math.round((ctx.raw / total) * 100);
                return ` ${ctx.label}: ${ctx.raw}人 (${pct}%)`;
              }
            }
          }
        }
      }
    });

    // 学年別 Bar
    const sortedGrades = Object.entries(gradeMap).sort((a, b) => b[1] - a[1]);
    createChart('chart-grade', {
      type: 'bar',
      data: {
        labels: sortedGrades.map(([g]) => g),
        datasets: [{
          data: sortedGrades.map(([, c]) => c),
          backgroundColor: sortedGrades.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length] + '99'),
          borderColor: sortedGrades.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
          borderWidth: 1.5,
          borderRadius: 6,
          barPercentage: 0.7,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.raw}人` }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 5 },
            grid: { color: '#f1f5f9' }
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          }
        }
      }
    });

    // 教室別 Horizontal Bar
    const sortedClasses = Object.entries(classMap).sort((a, b) => b[1] - a[1]);
    createChart('chart-classroom', {
      type: 'bar',
      data: {
        labels: sortedClasses.map(([cls]) => tagToName(cls)),
        datasets: [{
          data: sortedClasses.map(([, c]) => c),
          backgroundColor: COLORS.primary + '80',
          borderColor: COLORS.primary,
          borderWidth: 1.5,
          borderRadius: 4,
          barPercentage: 0.65,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.raw}人` }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { stepSize: 5 },
            grid: { color: '#f1f5f9' }
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          }
        }
      }
    });
  }

  // 体験統計を非同期で描画
  await renderTrialStatsSection();
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

const TRIAL_STATUS_COLORS = {
  pending: '#f59e0b',
  reviewed: '#3b82f6',
  approved: '#10b981',
  enrolled: '#6366f1',
  rejected: '#ef4444',
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
      <div class="stats-section-header">
        <span class="material-icons">directions_run</span>
        体験→入会 転換率
      </div>
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

  // 月別データ準備
  const monthlyData = FY_MONTHS.map(m => {
    const monthTrials = trials.filter(t => getTrialMonth(t.created_at) === m);
    const monthTotal = monthTrials.length;
    const monthEnrolled = monthTrials.filter(t =>
      t.status === 'enrolled' || t.linked_application_id
    ).length;
    return { month: m, total: monthTotal, enrolled: monthEnrolled };
  });

  // 月別内訳テーブル
  let monthlyTableHtml = '';
  if (selectedTrialFY !== 'all' && total > 0) {
    const monthlyRows = monthlyData.map(d => {
      const rate = d.total > 0 ? Math.round((d.enrolled / d.total) * 100) + '%' : '-';
      return `<tr>
        <td>${MONTH_LABELS[d.month]}</td>
        <td style="text-align:right">${d.total}</td>
        <td style="text-align:right">${d.enrolled}</td>
        <td style="text-align:right">${rate}</td>
      </tr>`;
    }).join('');

    monthlyTableHtml = `
      <div class="trial-stats-section" style="margin-bottom:16px">
        <h4><span class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:4px;color:var(--gray-400)">table_chart</span>月別内訳</h4>
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
    <div class="stats-section-header">
      <span class="material-icons">directions_run</span>
      体験→入会 転換率
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
      <select id="trial-stats-fy" onchange="window.memberApp.changeStatsFY(this.value)"
              style="padding:6px 8px;border:1px solid var(--gray-200);border-radius:var(--radius-sm)">
        ${fyOptions}
        <option value="all" ${selectedTrialFY === 'all' ? 'selected' : ''}>全期間</option>
      </select>
    </div>

    ${total === 0 ? '<p class="text-muted">選択期間のデータがありません</p>' : `
    <div class="trial-stats-grid">
      <div class="stat-card stat-card-enhanced color-primary stats-animate">
        <div class="stat-card-icon-wrap bg-primary"><span class="material-icons">group_add</span></div>
        <div class="stat-card-title">体験数</div>
        <div class="stat-card-value" style="color:var(--primary-color)">${total}</div>
      </div>
      <div class="stat-card stat-card-enhanced color-success stats-animate">
        <div class="stat-card-icon-wrap bg-success"><span class="material-icons">how_to_reg</span></div>
        <div class="stat-card-title">入会数</div>
        <div class="stat-card-value" style="color:var(--success-color)">${enrolledCount}</div>
      </div>
      <div class="stat-card stat-card-enhanced color-warning stats-animate">
        <div class="stat-card-icon-wrap bg-warning"><span class="material-icons">trending_up</span></div>
        <div class="stat-card-title">転換率（体験済み対比）</div>
        <div class="stat-card-value" style="color:var(--warning-color)">${conversionRate}%</div>
      </div>
      <div class="stat-card stat-card-enhanced color-gray stats-animate">
        <div class="stat-card-icon-wrap bg-gray"><span class="material-icons">percent</span></div>
        <div class="stat-card-title">転換率（全体対比）</div>
        <div class="stat-card-value" style="color:var(--gray-400)">${overallRate}%</div>
      </div>
    </div>

    <div class="stats-charts-grid">
      ${selectedTrialFY !== 'all' ? `
      <div class="stats-chart-card stats-animate">
        <h4><span class="material-icons">show_chart</span>月別推移</h4>
        <div class="chart-wrap"><canvas id="chart-trial-monthly"></canvas></div>
      </div>` : ''}
      <div class="stats-chart-card stats-animate">
        <h4><span class="material-icons">donut_large</span>ステータス別</h4>
        <div class="chart-wrap"><canvas id="chart-trial-status"></canvas></div>
      </div>
    </div>

    ${monthlyTableHtml}

    <div class="trial-stats-sections">
      <div class="trial-stats-section">
        <h4><span class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:4px;color:var(--gray-400)">campaign</span>紹介元</h4>
        ${routeRows || '<p class="text-muted">データなし</p>'}
      </div>
      <div class="trial-stats-section">
        <h4><span class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:4px;color:var(--gray-400)">meeting_room</span>教室別</h4>
        ${classRows || '<p class="text-muted">データなし</p>'}
      </div>
    </div>`}`;

  // ===== 体験セクションのチャート描画 =====
  if (typeof Chart !== 'undefined' && total > 0) {
    // 月別推移チャート (Mixed: bar + line)
    if (selectedTrialFY !== 'all') {
      createChart('chart-trial-monthly', {
        type: 'bar',
        data: {
          labels: FY_MONTHS.map(m => MONTH_LABELS[m]),
          datasets: [
            {
              label: '体験数',
              data: monthlyData.map(d => d.total),
              backgroundColor: COLORS.primary + '66',
              borderColor: COLORS.primary,
              borderWidth: 1.5,
              borderRadius: 4,
              order: 2,
            },
            {
              label: '入会数',
              data: monthlyData.map(d => d.enrolled),
              type: 'line',
              borderColor: COLORS.success,
              backgroundColor: COLORS.success + '22',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: COLORS.success,
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              fill: true,
              tension: 0.3,
              order: 1,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } }
            },
            tooltip: {
              callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw}件` }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1 },
              grid: { color: '#f1f5f9' }
            },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // ステータス別 Doughnut
    const statusEntries = Object.entries(TRIAL_STATUS_LABELS);
    createChart('chart-trial-status', {
      type: 'doughnut',
      data: {
        labels: statusEntries.map(([, label]) => label),
        datasets: [{
          data: statusEntries.map(([key]) => byStatus[key] || 0),
          backgroundColor: statusEntries.map(([key]) => TRIAL_STATUS_COLORS[key]),
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'right',
            labels: { padding: 12, usePointStyle: true, pointStyle: 'circle', font: { size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                return ` ${ctx.label}: ${ctx.raw}件 (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }
}

export function changeStatsFY(value) {
  // 体験セクションのチャートだけ破棄
  chartInstances = chartInstances.filter(c => {
    const id = c.canvas?.id || '';
    if (id.startsWith('chart-trial-')) {
      c.destroy();
      return false;
    }
    return true;
  });
  selectedTrialFY = value === 'all' ? 'all' : parseInt(value, 10);
  renderTrialStatsSection();
}
