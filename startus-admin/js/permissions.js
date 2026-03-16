// ============================================================
// 権限管理モジュール
// ============================================================
// 役割テンプレートとカスタム権限によるアクセス制御
// ============================================================

// --- 権限グループ定義 ---
export const PERMISSION_GROUPS = {
  members:      { label: '会員管理',       tabs: ['members', 'fee-overview'] },
  applications: { label: '申請管理',       tabs: ['applications', 'trials', 'transfers'] },
  schedule:     { label: 'スケジュール',   tabs: ['calendar', 'schedule', 'sm'] },
  attendance:   { label: '出欠',           tabs: ['attendance', 'attendance-stats', 'app-preview'] },
  staff:        { label: 'スタッフ',       tabs: ['staff'] },
  shop:         { label: 'ショップ',       tabs: ['shop-orders', 'shop-products', 'shop-inventory', 'shop-customers'] },
  stats:        { label: '統計',           tabs: ['stats'] },
  admin:        { label: '管理（設定）',   tabs: ['master', 'settings'] },
};

// タブ → 権限グループ 逆引きマップ
const TAB_TO_GROUP = {};
for (const [group, def] of Object.entries(PERMISSION_GROUPS)) {
  for (const tab of def.tabs) {
    TAB_TO_GROUP[tab] = group;
  }
}

// 常にアクセス可能なタブ（権限チェック不要）
const ALWAYS_ACCESSIBLE = ['dashboard'];

// --- 役割テンプレート定義 ---
// V=view, E=edit, D=delete
function perm(v, e, d) { return { view: v, edit: e, delete: d }; }

export const ROLE_TEMPLATES = {
  '管理者': {
    label: '管理者（全権限）',
    permissions: {
      members:      perm(true, true, true),
      applications: perm(true, true, true),
      schedule:     perm(true, true, true),
      attendance:   perm(true, true, true),
      staff:        perm(true, true, true),
      shop:         perm(true, true, true),
      stats:        perm(true, true, true),
      admin:        perm(true, true, true),
    },
  },
  '事務局': {
    label: '事務局（会員・申請・会費管理）',
    permissions: {
      members:      perm(true, true, false),
      applications: perm(true, true, true),
      schedule:     perm(true, true, false),
      attendance:   perm(true, true, false),
      staff:        perm(true, false, false),
      shop:         perm(true, true, false),
      stats:        perm(true, false, false),
      admin:        perm(false, false, false),
    },
  },
  '指導者': {
    label: '指導者（出欠・スケジュール・会員閲覧）',
    permissions: {
      members:      perm(true, false, false),
      applications: perm(true, false, false),
      schedule:     perm(true, true, false),
      attendance:   perm(true, true, false),
      staff:        perm(true, false, false),
      shop:         perm(false, false, false),
      stats:        perm(true, false, false),
      admin:        perm(false, false, false),
    },
  },
  'コーチ': {
    label: 'コーチ（出欠・スケジュール閲覧）',
    permissions: {
      members:      perm(true, false, false),
      applications: perm(false, false, false),
      schedule:     perm(true, false, false),
      attendance:   perm(true, false, false),
      staff:        perm(true, false, false),
      shop:         perm(false, false, false),
      stats:        perm(true, false, false),
      admin:        perm(false, false, false),
    },
  },
};

// --- 現在のユーザー権限 ---
let currentPermissions = null;

/**
 * ログイン時にスタッフレコードから権限を初期化する
 * @param {Object} staffRecord - { is_admin, role, permissions (JSONB or null) }
 */
export function initPermissions(staffRecord) {
  if (!staffRecord) {
    currentPermissions = null;
    return;
  }

  // カスタム権限が設定されていればそちらを使用
  if (staffRecord.permissions) {
    currentPermissions = staffRecord.permissions;
    return;
  }

  // is_admin が true の場合は管理者テンプレートを使用（role に関わらず）
  if (staffRecord.is_admin) {
    currentPermissions = ROLE_TEMPLATES['管理者'].permissions;
    return;
  }

  // 役割テンプレートからデフォルト権限を取得
  const role = staffRecord.role || 'スタッフ';
  const template = ROLE_TEMPLATES[role];
  if (template) {
    currentPermissions = template.permissions;
  } else {
    // テンプレートにない役職 → コーチと同等（最小権限）
    currentPermissions = ROLE_TEMPLATES['コーチ'].permissions;
  }
}

/**
 * 現在のユーザーの有効な権限オブジェクトを返す
 */
export function getEffectivePermissions() {
  return currentPermissions;
}

/**
 * 指定グループの閲覧権限をチェック
 */
export function canView(group) {
  if (!currentPermissions) return false;
  return !!(currentPermissions[group] && currentPermissions[group].view);
}

/**
 * 指定グループの編集権限をチェック
 */
export function canEdit(group) {
  if (!currentPermissions) return false;
  return !!(currentPermissions[group] && currentPermissions[group].edit);
}

/**
 * 指定グループの削除権限をチェック
 */
export function canDelete(group) {
  if (!currentPermissions) return false;
  return !!(currentPermissions[group] && currentPermissions[group].delete);
}

/**
 * 指定タブの閲覧権限をチェック
 */
export function canViewTab(tabName) {
  if (ALWAYS_ACCESSIBLE.includes(tabName)) return true;
  const group = TAB_TO_GROUP[tabName];
  if (!group) return true; // マッピングにないタブは許可
  return canView(group);
}

/**
 * 役割テンプレートの権限を取得（UI用）
 */
export function getRoleTemplate(roleName) {
  const template = ROLE_TEMPLATES[roleName];
  return template ? template.permissions : null;
}

/**
 * 権限グループのキー一覧を返す
 */
export function getPermissionGroupKeys() {
  return Object.keys(PERMISSION_GROUPS);
}
