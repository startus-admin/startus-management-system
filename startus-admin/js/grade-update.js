import { supabase } from './supabase.js';
import { getAllMembers, loadMembers } from './members.js';
import { escapeHtml } from './utils.js';
import { showToast, openModal, closeModal } from './app.js';

const GRADE_ORDER = [
  '年少', '年中', '年長',
  '小1', '小2', '小3', '小4', '小5', '小6',
  '中1', '中2', '中3',
  '高1', '高2', '高3',
  '卒業'
];

let excludedIds = new Set();

function getNextGrade(current) {
  if (!current) return '';
  const idx = GRADE_ORDER.indexOf(current);
  if (idx === -1) return current;
  if (idx >= GRADE_ORDER.length - 1) return current;
  return GRADE_ORDER[idx + 1];
}

export function openGradeUpdateModal() {
  excludedIds = new Set();
  const members = getAllMembers().filter(m => m.status === '在籍' && m.grade);

  if (members.length === 0) {
    showToast('学年が設定されている在籍会員がいません', 'warning');
    return;
  }

  let html = `<p style="font-size:0.9rem;color:var(--gray-500);margin-bottom:12px">
    在籍会員の学年を一括で進級させます。除外する会員のチェックを外してください。
  </p>
  <div class="import-table-wrap"><table class="import-table">
    <thead><tr><th style="width:40px">対象</th><th>氏名</th><th>現在</th><th>更新後</th></tr></thead>
    <tbody>`;

  members.forEach(m => {
    const next = getNextGrade(m.grade);
    const noChange = next === m.grade;
    html += `<tr class="${noChange ? 'grade-no-change' : ''}">
      <td><input type="checkbox" class="grade-check" data-id="${m.id}" ${noChange ? 'disabled' : 'checked'}></td>
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.grade)}</td>
      <td>${noChange ? '<span style="color:var(--gray-400)">変更なし</span>' : `<strong>${escapeHtml(next)}</strong>`}</td>
    </tr>`;
  });

  html += `</tbody></table></div>
  <div class="form-actions" style="margin-top:12px">
    <button class="btn btn-secondary" onclick="window.memberApp.closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="window.memberApp.executeGradeUpdate()">
      <span class="material-icons">school</span>一括更新
    </button>
  </div>`;

  openModal('学年一括更新', html);
}

export async function executeGradeUpdate() {
  const checkboxes = document.querySelectorAll('.grade-check:checked');
  const ids = [...checkboxes].map(cb => cb.dataset.id);

  if (ids.length === 0) {
    showToast('更新対象が選択されていません', 'warning');
    return;
  }

  const members = getAllMembers();
  let updated = 0;
  let errors = 0;

  for (const id of ids) {
    const m = members.find(mem => mem.id === id);
    if (!m || !m.grade) continue;
    const next = getNextGrade(m.grade);
    if (next === m.grade) continue;

    const { error } = await supabase
      .from('members')
      .update({ grade: next })
      .eq('id', id);

    if (error) {
      console.error('学年更新エラー:', error);
      errors++;
    } else {
      updated++;
    }
  }

  closeModal();
  if (errors > 0) {
    showToast(`${updated}件更新、${errors}件エラー`, 'warning');
  } else {
    showToast(`${updated}件の学年を更新しました`, 'success');
  }
  await loadMembers();
}
