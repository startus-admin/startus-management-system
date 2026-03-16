import { supabase } from './supabase.js';
import { escapeHtml, formatDate } from './utils.js';
import { showToast, openModal, closeModal, setModalWide } from './app.js';
import { isAdmin } from './auth.js';
import { canEdit, canDelete, canView, ROLE_TEMPLATES, PERMISSION_GROUPS, getRoleTemplate, getPermissionGroupKeys } from './permissions.js';
import { getActiveClassrooms } from './classroom.js';
import { tagToName, getSubClassesFromArray } from './class-utils.js';

let allStaff = [];
let filteredStaff = [];

// フィルタ・検索の状態
let searchQuery = '';
let filters = {
  role: [],
  status: ['在籍'],
  classes: []
};
let staffSortKey = 'role';

// --- データ取得 ---

export async function loadStaff() {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .order('name');

  if (error) {
    console.error('スタッフデータ読み込みエラー:', error);
    allStaff = [];
  } else {
    allStaff = data || [];
  }
  applyFiltersAndRender();
}

// --- 外部参照用 getter ---

export function getJimukyokuStaff() {
  return allStaff.filter(s => s.role === '事務局' && s.status === '在籍');
}

export function getAllActiveStaff() {
  return allStaff.filter(s => s.status === '在籍');
}

export function getStaffById(id) {
  return allStaff.find(s => s.id === id) || null;
}

export function getStaffByEmail(email) {
  return allStaff.find(s => s.email === email) || null;
}

// --- フィルタ・検索・ソート ---

function applyFiltersAndRender() {
  let result = [...allStaff];

  // 検索フィルタ
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.furigana || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
    );
  }

  // 役職フィルタ
  if (filters.role.length > 0) {
    result = result.filter(s => filters.role.includes(s.role));
  }

  // ステータスフィルタ
  if (filters.status.length > 0) {
    result = result.filter(s => filters.status.includes(s.status));
  }

  // 教室フィルタ
  if (filters.classes.length > 0) {
    result = result.filter(s => {
      const staffClasses = s.classes || [];
      return filters.classes.some(c => staffClasses.includes(c));
    });
  }

  // ソート
  const ROLE_ORDER = { '事務局': 0, '指導者': 1, 'メインコーチ': 2, 'サブコーチ': 3, 'アシスタント': 4, 'スタッフ': 5 };
  result.sort((a, b) => {
    switch (staffSortKey) {
      case 'role': return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || (a.name || '').localeCompare(b.name || '', 'ja');
      case 'name':
      default: return (a.name || '').localeCompare(b.name || '', 'ja');
    }
  });

  filteredStaff = result;
  updateStaffFilterBadge();
  renderStaffList();
  updateStaffClassFilter();
}

function updateStaffFilterBadge() {
  const defaultStatus = filters.status.length === 1 && filters.status[0] === '在籍';
  const count = filters.role.length + (defaultStatus ? 0 : filters.status.length) + filters.classes.length;
  const btn = document.getElementById('staff-filter-toggle');
  if (!btn) return;
  const existing = btn.querySelector('.filter-badge');
  if (existing) existing.remove();
  btn.classList.toggle('has-filters', count > 0);
  if (count > 0) {
    btn.insertAdjacentHTML('beforeend', `<span class="filter-badge">${count}</span>`);
  }
}

export function resetStaffFilters() {
  filters = { role: [], status: ['在籍'], classes: [] };
  searchQuery = '';
  // UIリセット
  document.querySelectorAll('#staff-filter-panel input[type="checkbox"]').forEach(cb => {
    cb.checked = cb.value === '在籍';
  });
  const searchInput = document.getElementById('staff-search-input');
  if (searchInput) searchInput.value = '';
  applyFiltersAndRender();
}

export function initStaffSort() {
  const sel = document.getElementById('staff-sort-select');
  if (sel) {
    sel.value = staffSortKey;
    sel.addEventListener('change', () => {
      staffSortKey = sel.value;
      applyFiltersAndRender();
    });
  }
}

// --- 表示 ---

const STAFF_GRID_HEADER = `
  <div class="staff-grid-header">
    <span>氏名</span>
    <span>役割</span>
    <span>権限</span>
    <span>教室</span>
    <span>ステータス</span>
    <span>連絡先</span>
    <span></span>
  </div>`;

function getPermissionLabel(s) {
  if (s.permissions) return 'カスタム';
  if (s.is_admin) return '管理者';
  if (ROLE_TEMPLATES[s.role]) return s.role;
  return 'コーチ';
}

function getPermissionBadgeClass(label) {
  switch (label) {
    case '管理者': return 'badge-perm-admin';
    case '事務局': return 'badge-perm-jimukyoku';
    case '指導者': return 'badge-perm-instructor';
    case 'カスタム': return 'badge-perm-custom';
    default: return 'badge-perm-default';
  }
}

function buildStaffGridRow(s) {
  const roleClass = getRoleClass(s.role);
  const roleBadge = `<span class="badge badge-type badge-type-${roleClass}">${escapeHtml(s.role)}</span>`;
  const permLabel = getPermissionLabel(s);
  const permBadge = `<span class="badge ${getPermissionBadgeClass(permLabel)}">${escapeHtml(permLabel)}</span>`;
  const statusBadge = s.status !== '在籍'
    ? `<span class="badge badge-status badge-status-withdrawn">${escapeHtml(s.status)}</span>`
    : `<span class="badge badge-status badge-status-active">${escapeHtml(s.status)}</span>`;
  const classBadges = (s.classes || []).map(c =>
    `<span class="badge badge-class">${escapeHtml(tagToName(c))}</span>`
  ).join('');

  return `
    <div class="list-item" data-id="${s.id}" onclick="window.memberApp.showStaffDetail('${s.id}')">
      <div class="grid-cell grid-cell-name">
        <strong>${escapeHtml(s.name)}</strong>
      </div>
      <div class="grid-cell">${roleBadge}</div>
      <div class="grid-cell">${permBadge}</div>
      <div class="grid-cell grid-cell-badges">${classBadges}</div>
      <div class="grid-cell">${statusBadge}</div>
      <div class="grid-cell grid-cell-contact">
        ${s.phone ? `<span>${escapeHtml(s.phone)}</span>` : ''}
        ${s.email ? `<span>${escapeHtml(s.email)}</span>` : ''}
      </div>
      <div class="grid-cell grid-cell-arrow">
        <span class="material-icons list-item-arrow">chevron_right</span>
      </div>
    </div>`;
}

function renderStaffList() {
  const container = document.getElementById('staff-list');
  const countEl = document.getElementById('staff-count');
  if (countEl) {
    const total = allStaff.length;
    const shown = filteredStaff.length;
    countEl.textContent = total === shown ? `${shown}名` : `${total}名中 ${shown}名表示`;
  }

  if (!container) return;

  if (filteredStaff.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">badge</span>
        <p>スタッフデータがありません</p>
      </div>`;
    return;
  }

  container.innerHTML = STAFF_GRID_HEADER + filteredStaff.map(buildStaffGridRow).join('');
}

function getRoleClass(role) {
  switch (role) {
    case '指導者': return 'instructor';
    case '事務局': return 'jimukyoku';
    case 'スタッフ': return 'staff';
    default: return 'staff';
  }
}

// --- 教室フィルタ動的生成 ---

function updateStaffClassFilter() {
  const container = document.getElementById('staff-class-filter');
  if (!container) return;

  const classroomSet = new Set();
  allStaff.forEach(s => {
    (s.classes || []).forEach(c => classroomSet.add(c));
  });

  const classTags = [...classroomSet].sort((a, b) => tagToName(a).localeCompare(tagToName(b), 'ja'));
  container.innerHTML = classTags.map(c => {
    const checked = filters.classes.includes(c) ? 'checked' : '';
    return `<label class="filter-pill"><input type="checkbox" value="${escapeHtml(c)}" ${checked}>${escapeHtml(tagToName(c))}</label>`;
  }).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = [...container.querySelectorAll('input:checked')].map(el => el.value);
      filters.classes = checked;
      applyFiltersAndRender();
    });
  });
}

// --- 詳細モーダル ---

export function showStaffDetail(id) {
  const s = allStaff.find(st => st.id === id);
  if (!s) return;

  const classesDisplay = (s.classes || []).map(c =>
    `<span class="badge badge-class">${escapeHtml(tagToName(c))}</span>`
  ).join(' ') || '-';

  const photoHtml = s.photo_url
    ? `<img class="detail-photo" src="${escapeHtml(s.photo_url)}" alt="${escapeHtml(s.name)}">`
    : `<span class="detail-photo-default material-icons">account_circle</span>`;

  const phoneCopy = s.phone
    ? `<button class="btn-icon btn-copy" onclick="event.stopPropagation();window.memberApp.copyToClipboard('${escapeHtml(s.phone)}')" title="コピー"><span class="material-icons" style="font-size:16px">content_copy</span></button>`
    : '';
  const emailCopy = s.email
    ? `<button class="btn-icon btn-copy" onclick="event.stopPropagation();window.memberApp.copyToClipboard('${escapeHtml(s.email)}')" title="コピー"><span class="material-icons" style="font-size:16px">content_copy</span></button>`
    : '';

  const content = `
    ${photoHtml}
    <div class="detail-grid">
      <div class="detail-row"><span class="detail-label">氏名</span><span class="detail-value">${escapeHtml(s.name)}</span></div>
      <div class="detail-row"><span class="detail-label">フリガナ</span><span class="detail-value">${escapeHtml(s.furigana) || '-'}</span></div>
      <div class="detail-row"><span class="detail-label">役職</span><span class="detail-value">${escapeHtml(s.role)}</span></div>
      <div class="detail-row"><span class="detail-label">管理者権限</span><span class="detail-value">${s.is_admin ? '<span class="badge badge-admin">管理者</span>' : 'なし'}</span></div>
      <div class="detail-row"><span class="detail-label">ステータス</span><span class="detail-value">${escapeHtml(s.status)}</span></div>
      <div class="detail-row"><span class="detail-label">電話番号</span><span class="detail-value">${escapeHtml(s.phone) || '-'}${phoneCopy}</span></div>
      <div class="detail-row"><span class="detail-label">メール</span><span class="detail-value">${escapeHtml(s.email) || '-'}${emailCopy}</span></div>
      <div class="detail-row"><span class="detail-label">担当教室</span><span class="detail-value">${classesDisplay}</span></div>
      <div class="detail-row"><span class="detail-label">サブクラス</span><span class="detail-value">${getSubClassesFromArray(s.classes).join(' / ') || '-'}</span></div>
      <div class="detail-row"><span class="detail-label">出欠アプリ表示</span><span class="detail-value">${s.show_in_attendance !== false ? '<span class="badge badge-status badge-status-active">表示</span>' : '<span class="badge badge-status badge-status-withdrawn">非表示</span>'}</span></div>
      <div class="detail-row"><span class="detail-label">登録日</span><span class="detail-value">${formatDate(s.joined_date) || '-'}</span></div>
      <div class="detail-row"><span class="detail-label">メモ</span><span class="detail-value">${escapeHtml(s.note) || '-'}</span></div>
    </div>
    ${canEdit('staff') || canDelete('staff') ? `<div class="modal-detail-actions">
      ${canEdit('staff') ? `<button class="btn btn-primary" onclick="window.memberApp.openStaffEditForm('${s.id}')">
        <span class="material-icons">edit</span>編集
      </button>` : ''}
      ${canDelete('staff') ? `<button class="btn btn-danger" onclick="window.memberApp.confirmDeleteStaff('${s.id}', '${escapeHtml(s.name)}')">
        <span class="material-icons">delete</span>削除
      </button>` : ''}
    </div>` : ''}`;

  setModalWide(true);
  openModal('スタッフ詳細', content);
}

// --- 追加/編集フォーム ---

export function openStaffAddForm() {
  openStaffForm(null);
}

export function openStaffEditForm(id) {
  const s = allStaff.find(st => st.id === id);
  if (!s) return;
  closeModal();
  setTimeout(() => openStaffForm(s), 200);
}

function openStaffForm(staff) {
  const isEdit = !!staff;
  const title = isEdit ? 'スタッフ編集' : 'スタッフ追加';
  const s = staff || {};

  const staffClasses = s.classes || [];
  const staffSubClasses = getSubClassesFromArray(staffClasses);
  const classroomCheckboxes = getActiveClassrooms().map(c => {
    const tag = c.calendar_tag || c.name;
    const checked = staffClasses.includes(tag) ? 'checked' : '';
    const subClasses = c.sub_classes || [];
    let subClassHtml = '';
    if (subClasses.length > 0) {
      const selectedSub = staffSubClasses.find(sc => subClasses.includes(sc)) || '';
      const radios = subClasses.map(sc => {
        const scChecked = sc === selectedSub ? 'checked' : '';
        return `<label class="sub-class-radio"><input type="radio" name="sub_${tag}" value="${escapeHtml(sc)}" ${scChecked}>${escapeHtml(sc)}</label>`;
      }).join('');
      subClassHtml = `<div class="sub-class-options" data-tag="${escapeHtml(tag)}" style="${checked ? '' : 'display:none'}">${radios}</div>`;
    }
    return `<div class="classroom-cb-wrap">
      <label class="filter-pill"><input type="checkbox" name="staff_classroom_cb" value="${escapeHtml(tag)}" ${checked}>${escapeHtml(c.name)}</label>
      ${subClassHtml}
    </div>`;
  }).join('');

  const content = `
    <form id="staff-form" onsubmit="return false;">
      <div class="form-group">
        <label>氏名 <span class="required">*</span></label>
        <input type="text" name="name" value="${escapeHtml(s.name || '')}" required>
      </div>
      <div class="form-group">
        <label>フリガナ</label>
        <input type="text" name="furigana" value="${escapeHtml(s.furigana || '')}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>役職</label>
          <select name="role">
            <option value="スタッフ" ${s.role === 'スタッフ' || !s.role ? 'selected' : ''}>スタッフ</option>
            <option value="指導者" ${s.role === '指導者' ? 'selected' : ''}>指導者</option>
            <option value="メインコーチ" ${s.role === 'メインコーチ' ? 'selected' : ''}>メインコーチ</option>
            <option value="サブコーチ" ${s.role === 'サブコーチ' ? 'selected' : ''}>サブコーチ</option>
            <option value="アシスタント" ${s.role === 'アシスタント' ? 'selected' : ''}>アシスタント</option>
            <option value="事務局" ${s.role === '事務局' ? 'selected' : ''}>事務局</option>
          </select>
        </div>
        <div class="form-group">
          <label>ステータス</label>
          <select name="status">
            <option value="在籍" ${s.status === '在籍' || !s.status ? 'selected' : ''}>在籍</option>
            <option value="退職" ${s.status === '退職' ? 'selected' : ''}>退職</option>
          </select>
        </div>
      </div>
      ${canView('admin') ? buildPermissionUI(s) : ''}
      <div class="form-group">
        <label>電話番号</label>
        <input type="tel" name="phone" value="${escapeHtml(s.phone || '')}">
      </div>
      <div class="form-group">
        <label>メールアドレス</label>
        <input type="email" name="email" value="${escapeHtml(s.email || '')}">
      </div>
      <div class="form-group">
        <label>担当教室</label>
        <div class="classroom-checkboxes-scroll" id="staff-classroom-checkboxes">
          ${classroomCheckboxes}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>登録日</label>
          <input type="date" name="joined_date" value="${s.joined_date || ''}">
        </div>
        <div class="form-group">
          <label>カレンダー色</label>
          <input type="color" name="calendar_color" value="${s.calendar_color || '#3b82f6'}">
        </div>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" name="show_in_attendance" ${s.show_in_attendance !== false ? 'checked' : ''}>
          出欠アプリに指導者として表示する
        </label>
        <p class="form-hint">オフにすると出欠アプリの指導者一覧に表示されません</p>
      </div>
      <div class="form-group">
        <label>メモ</label>
        <textarea name="note" rows="3">${escapeHtml(s.note || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="window.memberApp.closeModal()">キャンセル</button>
        <button type="submit" class="btn btn-primary">
          <span class="material-icons">save</span>保存
        </button>
      </div>
    </form>`;

  setModalWide(true);
  openModal(title, content);

  setTimeout(() => {
    const form = document.getElementById('staff-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveStaff(form, isEdit ? s.id : null);
      });
    }
    // Show/hide sub-class options when classroom checkbox changes
    document.querySelectorAll('#staff-classroom-checkboxes input[name="staff_classroom_cb"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const subOpts = cb.closest('.classroom-cb-wrap')?.querySelector('.sub-class-options');
        if (subOpts) subOpts.style.display = cb.checked ? '' : 'none';
      });
    });

    // 権限テンプレート選択イベント
    initPermissionFormEvents(s);
  }, 100);
}

async function saveStaff(form, id) {
  const fd = new FormData(form);
  const classroomTags = [...document.querySelectorAll('#staff-classroom-checkboxes input[name="staff_classroom_cb"]:checked')]
    .map(cb => cb.value);
  // Collect selected sub-classes for each checked classroom
  const subClasses = [];
  for (const tag of classroomTags) {
    const selected = document.querySelector(`input[name="sub_${tag}"]:checked`);
    if (selected && selected.value) subClasses.push(selected.value);
  }
  const classesArray = [...classroomTags, ...subClasses];

  const data = {
    name: fd.get('name'),
    furigana: fd.get('furigana') || '',
    role: fd.get('role') || 'スタッフ',
    status: fd.get('status') || '在籍',
    phone: fd.get('phone') || '',
    email: fd.get('email') || '',
    classes: classesArray,
    joined_date: fd.get('joined_date') || null,
    note: fd.get('note') || '',
    calendar_color: fd.get('calendar_color') || '',
    show_in_attendance: !!fd.get('show_in_attendance'),
  };

  // 管理者権限がある場合のみ権限設定を更新
  if (canView('admin')) {
    const permData = collectPermissionFormData(form);
    data.is_admin = permData.isAdmin;
    data.permissions = permData.permissions;
  }

  let error;
  if (id) {
    ({ error } = await supabase.from('staff').update(data).eq('id', id));
  } else {
    ({ error } = await supabase.from('staff').insert(data));
  }

  if (error) {
    console.error('保存エラー:', error);
    showToast('保存に失敗しました', 'error');
    return;
  }

  closeModal();
  showToast('保存しました', 'success');
  await loadStaff();
}

// --- 削除 ---

export function confirmDeleteStaff(id, name) {
  closeModal();
  setTimeout(() => {
    const content = `
      <p>「${escapeHtml(name)}」を削除しますか？</p>
      <p class="text-warning">この操作は元に戻せません</p>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="window.memberApp.closeModal()">キャンセル</button>
        <button class="btn btn-danger" onclick="window.memberApp.deleteStaff('${id}')">
          <span class="material-icons">delete</span>削除
        </button>
      </div>`;
    openModal('確認', content);
  }, 200);
}

export async function deleteStaff(id) {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) {
    console.error('削除エラー:', error);
    showToast('削除に失敗しました', 'error');
    return;
  }
  closeModal();
  showToast('削除しました', 'success');
  await loadStaff();
}

// --- 権限設定UI ---

/**
 * スタッフ編集フォーム用の権限設定UIを生成
 */
function buildPermissionUI(staff) {
  const s = staff || {};
  const currentRole = s.role || 'スタッフ';
  const hasCustom = !!s.permissions;

  // テンプレートに合致する役割を判定
  const matchedTemplate = hasCustom ? '_custom' : (ROLE_TEMPLATES[currentRole] ? currentRole : '_custom');

  // テンプレート選択肢
  const templateOptions = Object.entries(ROLE_TEMPLATES).map(([key, tmpl]) => {
    const selected = key === matchedTemplate ? 'selected' : '';
    return `<option value="${escapeHtml(key)}" ${selected}>${escapeHtml(tmpl.label)}</option>`;
  }).join('');

  // 有効な権限を計算
  const effectivePerms = s.permissions || (ROLE_TEMPLATES[currentRole]?.permissions) || ROLE_TEMPLATES['コーチ'].permissions;

  // 権限チェックボックスグリッド
  const groupKeys = getPermissionGroupKeys();
  const permRows = groupKeys.map(group => {
    const def = PERMISSION_GROUPS[group];
    const gp = effectivePerms[group] || { view: false, edit: false, delete: false };
    return `
      <tr>
        <td class="perm-group-label">${escapeHtml(def.label)}</td>
        <td class="perm-cb-cell"><input type="checkbox" name="perm_view_${group}" ${gp.view ? 'checked' : ''} ${hasCustom ? '' : 'disabled'}></td>
        <td class="perm-cb-cell"><input type="checkbox" name="perm_edit_${group}" ${gp.edit ? 'checked' : ''} ${hasCustom ? '' : 'disabled'}></td>
        <td class="perm-cb-cell"><input type="checkbox" name="perm_delete_${group}" ${gp.delete ? 'checked' : ''} ${hasCustom ? '' : 'disabled'}></td>
      </tr>`;
  }).join('');

  return `
      <div class="form-group perm-section">
        <label>アクセス権限</label>
        <div class="perm-template-row">
          <select name="perm_template" id="perm-template-select">
            ${templateOptions}
            <option value="_custom" ${matchedTemplate === '_custom' ? 'selected' : ''}>カスタム</option>
          </select>
          <button type="button" class="btn btn-sm btn-secondary" id="perm-customize-btn" ${hasCustom ? 'style="display:none"' : ''}>
            <span class="material-icons" style="font-size:16px">tune</span>カスタマイズ
          </button>
        </div>
        <table class="perm-grid" id="perm-grid">
          <thead>
            <tr><th></th><th>閲覧</th><th>編集</th><th>削除</th></tr>
          </thead>
          <tbody>
            ${permRows}
          </tbody>
        </table>
      </div>`;
}

/**
 * 権限フォームのイベントハンドラを初期化
 */
function initPermissionFormEvents(staff) {
  const templateSelect = document.getElementById('perm-template-select');
  const customizeBtn = document.getElementById('perm-customize-btn');
  const permGrid = document.getElementById('perm-grid');
  if (!templateSelect || !permGrid) return;

  // テンプレート選択変更時
  templateSelect.addEventListener('change', () => {
    const val = templateSelect.value;
    if (val === '_custom') {
      enablePermCheckboxes(true);
      if (customizeBtn) customizeBtn.style.display = 'none';
    } else {
      const tmpl = getRoleTemplate(val);
      if (tmpl) applyTemplateToGrid(tmpl);
      enablePermCheckboxes(false);
      if (customizeBtn) customizeBtn.style.display = '';
    }
  });

  // カスタマイズボタン
  if (customizeBtn) {
    customizeBtn.addEventListener('click', () => {
      templateSelect.value = '_custom';
      enablePermCheckboxes(true);
      customizeBtn.style.display = 'none';
    });
  }

  // edit がチェックされたら view も自動チェック
  // delete がチェックされたら edit + view も自動チェック
  permGrid.addEventListener('change', (e) => {
    if (!e.target.matches('input[type="checkbox"]')) return;
    const name = e.target.name;
    if (!name) return;
    const parts = name.match(/^perm_(view|edit|delete)_(.+)$/);
    if (!parts) return;
    const [, op, group] = parts;

    if (op === 'edit' && e.target.checked) {
      const viewCb = permGrid.querySelector(`[name="perm_view_${group}"]`);
      if (viewCb) viewCb.checked = true;
    }
    if (op === 'delete' && e.target.checked) {
      const viewCb = permGrid.querySelector(`[name="perm_view_${group}"]`);
      const editCb = permGrid.querySelector(`[name="perm_edit_${group}"]`);
      if (viewCb) viewCb.checked = true;
      if (editCb) editCb.checked = true;
    }
    // view を外したら edit, delete も外す
    if (op === 'view' && !e.target.checked) {
      const editCb = permGrid.querySelector(`[name="perm_edit_${group}"]`);
      const deleteCb = permGrid.querySelector(`[name="perm_delete_${group}"]`);
      if (editCb) editCb.checked = false;
      if (deleteCb) deleteCb.checked = false;
    }
    // edit を外したら delete も外す
    if (op === 'edit' && !e.target.checked) {
      const deleteCb = permGrid.querySelector(`[name="perm_delete_${group}"]`);
      if (deleteCb) deleteCb.checked = false;
    }
  });
}

/**
 * テンプレートの値をグリッドに反映
 */
function applyTemplateToGrid(tmpl) {
  const permGrid = document.getElementById('perm-grid');
  if (!permGrid) return;
  for (const group of getPermissionGroupKeys()) {
    const gp = tmpl[group] || { view: false, edit: false, delete: false };
    const viewCb = permGrid.querySelector(`[name="perm_view_${group}"]`);
    const editCb = permGrid.querySelector(`[name="perm_edit_${group}"]`);
    const deleteCb = permGrid.querySelector(`[name="perm_delete_${group}"]`);
    if (viewCb) viewCb.checked = gp.view;
    if (editCb) editCb.checked = gp.edit;
    if (deleteCb) deleteCb.checked = gp.delete;
  }
}

/**
 * チェックボックスの有効/無効を切り替え
 */
function enablePermCheckboxes(enabled) {
  const permGrid = document.getElementById('perm-grid');
  if (!permGrid) return;
  permGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.disabled = !enabled;
  });
}

/**
 * フォームから権限データを収集
 */
function collectPermissionFormData(form) {
  const templateSelect = form.querySelector('#perm-template-select');
  const templateVal = templateSelect ? templateSelect.value : '';

  // テンプレート選択時（カスタムでない場合）→ permissions = null
  if (templateVal && templateVal !== '_custom') {
    // is_admin は管理者テンプレートの場合 true
    return {
      isAdmin: templateVal === '管理者',
      permissions: null,
    };
  }

  // カスタム → JSONB を構築
  const permissions = {};
  for (const group of getPermissionGroupKeys()) {
    const viewCb = form.querySelector(`[name="perm_view_${group}"]`);
    const editCb = form.querySelector(`[name="perm_edit_${group}"]`);
    const deleteCb = form.querySelector(`[name="perm_delete_${group}"]`);
    permissions[group] = {
      view: viewCb ? viewCb.checked : false,
      edit: editCb ? editCb.checked : false,
      delete: deleteCb ? deleteCb.checked : false,
    };
  }

  // admin グループに権限があれば is_admin = true
  const isAdmin = !!(permissions.admin && permissions.admin.view);

  return { isAdmin, permissions };
}

// --- 初期化 ---

export function initStaffSearch() {
  const input = document.getElementById('staff-search-input');
  if (input) {
    input.addEventListener('input', () => {
      searchQuery = input.value;
      applyFiltersAndRender();
    });
  }
}

export function initStaffFilters() {
  // 役職フィルタ
  const roleContainer = document.getElementById('staff-role-filter');
  if (roleContainer) {
    roleContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = [...roleContainer.querySelectorAll('input:checked')].map(el => el.value);
        filters.role = checked;
        applyFiltersAndRender();
      });
    });
  }

  // ステータスフィルタ
  const statusContainer = document.getElementById('staff-status-filter');
  if (statusContainer) {
    statusContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = [...statusContainer.querySelectorAll('input:checked')].map(el => el.value);
        filters.status = checked;
        applyFiltersAndRender();
      });
    });
  }
}

export function toggleStaffFilterPanel() {
  const panel = document.getElementById('staff-filter-panel');
  if (panel) panel.classList.toggle('open');
}
