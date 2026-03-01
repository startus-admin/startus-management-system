// --- タブナビゲーション ---

let currentTab = 'members';
let onTabChange = null;

export function initTabs(callback) {
  onTabChange = callback;
}

export function switchTab(tabName) {
  if (currentTab === tabName) return;
  currentTab = tabName;

  // タブボタンの切り替え
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // 画面の切り替え
  const screens = ['members-screen', 'fee-overview-screen', 'applications-screen', 'trials-screen', 'stats-screen', 'staff-screen', 'calendar-screen', 'schedule-screen', 'master-screen'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const target = document.getElementById(`${tabName}-screen`);
  if (target) target.style.display = 'block';

  if (onTabChange) onTabChange(tabName);
}

export function getCurrentTab() { return currentTab; }
