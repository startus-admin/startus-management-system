// --- サイドバーナビゲーション ---

let currentTab = 'dashboard';
let onTabChange = null;

const screens = [
  'dashboard-screen', 'members-screen', 'fee-overview-screen',
  'applications-screen', 'trials-screen', 'stats-screen',
  'staff-screen', 'calendar-screen', 'schedule-screen',
  'sm-screen', 'master-screen'
];

export function initTabs(callback) {
  onTabChange = callback;
}

export function switchTab(tabName) {
  if (currentTab === tabName) {
    // 同じタブをクリック → サイドバーを閉じるだけ
    closeSidebar();
    return;
  }
  currentTab = tabName;

  // サイドバーのアクティブ状態を更新
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabName);
  });

  // 画面の切り替え
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const target = document.getElementById(`${tabName}-screen`);
  if (target) target.style.display = 'block';

  // サイドバーを閉じる
  closeSidebar();

  if (onTabChange) onTabChange(tabName);
}

export function getCurrentTab() { return currentTab; }

// --- サイドバー開閉（Geminiスタイル: オーバーレイトグル） ---
export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

// toggleSidebarCollapse は互換性のため残すが、toggleSidebar にリダイレクト
export function toggleSidebarCollapse() {
  toggleSidebar();
}
