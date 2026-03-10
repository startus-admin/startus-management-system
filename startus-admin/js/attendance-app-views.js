// ============================================
// 出欠アプリビュー管理モジュール
// ============================================
// 複数教室をグループ化した「ビュー」の CRUD を行う

import { supabase } from './supabase.js';
import { escapeHtml } from './utils.js';
import { showToast, openModal, closeModal } from './app.js';
import { getActiveClassrooms } from './classroom.js';
import { tagToName } from './class-utils.js';

let viewsCache = [];
let initialized = false;

// ============================================
// データ取得
// ============================================

export async function loadAppViews() {
  const { data, error } = await supabase
    .from('attendance_app_views')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('ビュー読み込みエラー:', error);
    viewsCache = [];
  } else {
    viewsCache = data || [];
  }
  return viewsCache;
}

export function getAppViews() {
  return viewsCache;
}

export function getActiveAppViews() {
  return viewsCache.filter(v => v.is_active);
}

// ============================================
// 初期化（タブ表示時）
// ============================================

export async function initAppViews() {
  if (!initialized) {
    initialized = true;
  }
  await loadAppViews();
  renderAppViewsScreen();
}

// ============================================
// ビュー一覧を描画
// ============================================

function renderAppViewsScreen() {
  const listEl = document.getElementById('app-views-list');
  if (!listEl) return;

  if (viewsCache.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">view_list</span>
        <p>ビューが登録されていません</p>
        <p style="color:var(--gray-400);font-size:13px">
          「追加」ボタンから出欠アプリに表示するビューを作成してください
        </p>
      </div>`;
    return;
  }

  let html = '';
  for (const v of viewsCache) {
    const classroomNames = (v.classroom_tags || [])
      .map(tag => tagToName(tag))
      .filter(Boolean);
    const statusBadge = v.is_active
      ? '<span class="cr-status-on">有効</span>'
      : '<span class="cr-status-off">無効</span>';
    const inactiveClass = v.is_active ? '' : ' av-row-inactive';

    html += `
      <div class="list-item av-row${inactiveClass}" data-id="${v.id}"
           onclick="window.memberApp.openViewEditForm('${v.id}')">
        <div class="av-row-main">
          <div class="av-row-name">
            <strong>${escapeHtml(v.name)}</strong>
            ${statusBadge}
          </div>
          <div class="av-row-classrooms">
            ${classroomNames.length > 0
              ? classroomNames.map(n => `<span class="badge badge-class">${escapeHtml(n)}</span>`).join('')
              : '<span style="color:var(--gray-400)">教室未設定</span>'}
          </div>
        </div>
        <div class="av-row-actions" onclick="event.stopPropagation()">
          <span class="av-row-order">${v.display_order}</span>
          <button class="btn-icon" title="削除"
                  onclick="window.memberApp.confirmDeleteView('${v.id}', '${escapeHtml(v.name)}')">
            <span class="material-icons" style="font-size:18px;color:var(--danger-color)">delete</span>
          </button>
        </div>
        <span class="material-icons" style="color:var(--gray-300);font-size:20px">chevron_right</span>
      </div>`;
  }

  listEl.innerHTML = html;
}

// ============================================
// 追加・編集フォーム
// ============================================

export function openViewAddForm() {
  openViewForm(null);
}

export function openViewEditForm(viewId) {
  const view = viewsCache.find(v => v.id === viewId);
  if (!view) return;
  openViewForm(view);
}

function openViewForm(view) {
  const isEdit = !!view;
  const v = view || {};
  const title = isEdit ? 'ビュー編集' : 'ビュー追加';
  const selectedTags = new Set(v.classroom_tags || []);
  const classrooms = getActiveClassrooms();

  const classroomCheckboxes = classrooms
    .filter(c => c.calendar_tag)
    .map(c => {
      const checked = selectedTags.has(c.calendar_tag) ? 'checked' : '';
      return `
        <label class="av-checkbox-label ${checked ? 'checked' : ''}">
          <input type="checkbox" name="classroom_tags" value="${escapeHtml(c.calendar_tag)}" ${checked}>
          ${escapeHtml(c.name)}
        </label>`;
    }).join('');

  const content = `
    <form id="view-form" onsubmit="return false;">
      <div class="form-group">
        <label>ビュー名 <span style="color:var(--danger-color)">*</span></label>
        <input type="text" name="name" value="${escapeHtml(v.name || '')}" required
               placeholder="例: かけっこ塾合同" class="form-control">
      </div>
      <div class="form-group">
        <label>表示順</label>
        <input type="number" name="display_order" value="${v.display_order ?? 0}" min="0"
               class="form-control" style="width:100px">
      </div>
      <div class="form-group">
        <label>含める教室</label>
        <div class="av-classroom-grid">
          ${classroomCheckboxes || '<p style="color:var(--gray-400)">アクティブな教室がありません</p>'}
        </div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" name="is_active" ${v.is_active !== false ? 'checked' : ''}
                 style="width:18px;height:18px;accent-color:var(--primary-color)">
          有効
        </label>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button type="button" class="btn btn-danger-outline"
                     onclick="window.memberApp.confirmDeleteView('${v.id}', '${escapeHtml(v.name || '')}')">
          <span class="material-icons" style="font-size:16px">delete</span>削除
        </button>` : '<span></span>'}
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-secondary"
                  onclick="window.memberApp.closeModal()">キャンセル</button>
          <button type="submit" class="btn btn-primary">
            <span class="material-icons" style="font-size:16px">save</span>保存
          </button>
        </div>
      </div>
    </form>`;

  openModal(title, content);

  setTimeout(() => {
    const form = document.getElementById('view-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveView(form, isEdit ? v.id : null);
      });
      // チェックボックスのスタイル更新
      form.querySelectorAll('.av-checkbox-label input').forEach(cb => {
        cb.addEventListener('change', () => {
          cb.parentElement.classList.toggle('checked', cb.checked);
        });
      });
    }
  }, 100);
}

// ============================================
// 保存
// ============================================

async function saveView(form, id) {
  const fd = new FormData(form);
  const checkboxes = form.querySelectorAll('[name="classroom_tags"]:checked');
  const classroomTags = Array.from(checkboxes).map(cb => cb.value);

  const data = {
    name: fd.get('name').trim(),
    display_order: parseInt(fd.get('display_order'), 10) || 0,
    classroom_tags: classroomTags,
    is_active: form.querySelector('[name="is_active"]').checked,
  };

  if (!data.name) {
    showToast('ビュー名を入力してください', 'warning');
    return;
  }

  let error;
  if (id) {
    ({ error } = await supabase.from('attendance_app_views').update(data).eq('id', id));
  } else {
    ({ error } = await supabase.from('attendance_app_views').insert(data));
  }

  if (error) {
    console.error('ビュー保存エラー:', error);
    showToast('保存に失敗しました', 'error');
    return;
  }

  showToast('保存しました', 'success');
  closeModal();
  await loadAppViews();
  renderAppViewsScreen();
}

// ============================================
// 削除
// ============================================

export function confirmDeleteView(id, name) {
  const content = `
    <p>「${escapeHtml(name)}」を削除しますか？</p>
    <p style="color:var(--danger-color);font-size:13px">このビューに紐づく出欠イベントのビュー情報がクリアされます。</p>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-danger" onclick="window.memberApp.deleteView('${id}')">削除</button>
      <button class="btn btn-secondary" onclick="window.memberApp.closeModal()">キャンセル</button>
    </div>`;
  openModal('ビュー削除の確認', content);
}

export async function deleteView(id) {
  const { error } = await supabase
    .from('attendance_app_views')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('ビュー削除エラー:', error);
    showToast('削除に失敗しました', 'error');
    return;
  }

  showToast('削除しました', 'success');
  closeModal();
  await loadAppViews();
  renderAppViewsScreen();
}
