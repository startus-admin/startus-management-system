import { getAllMembers } from './members.js';
import { escapeHtml } from './utils.js';
import { openModal, copyToClipboard } from './app.js';
import { getClassrooms } from './classroom.js';

export function openEmailListModal() {
  const members = getAllMembers();

  // 教室マスタから取得（calendar_tagをvalueに使用）
  const classroomList = getClassrooms();

  const classOptions = classroomList.map(c =>
    `<label class="filter-pill"><input type="checkbox" value="${escapeHtml(c.calendar_tag || c.name)}" class="email-class-filter">${escapeHtml(c.name)}</label>`
  ).join('');

  const html = `
    <div style="margin-bottom:12px">
      <div style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin-bottom:6px">ステータス</div>
      <div class="filter-checkboxes" id="email-status-filter">
        <label class="filter-pill"><input type="checkbox" value="在籍" checked class="email-status-filter">在籍</label>
        <label class="filter-pill"><input type="checkbox" value="休会" class="email-status-filter">休会</label>
        <label class="filter-pill"><input type="checkbox" value="退会" class="email-status-filter">退会</label>
      </div>
    </div>
    ${classroomList.length > 0 ? `
    <div style="margin-bottom:12px">
      <div style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin-bottom:6px">教室（未選択＝全教室）</div>
      <div class="filter-checkboxes" id="email-class-filter">${classOptions}</div>
    </div>` : ''}
    <div style="margin-bottom:8px">
      <div style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin-bottom:6px">
        メールアドレス一覧 <span id="email-count" style="font-weight:400;color:var(--gray-400)"></span>
      </div>
      <textarea class="email-list-output" id="email-list-output" readonly></textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="window.memberApp.closeModal()">閉じる</button>
      <button class="btn btn-primary" onclick="window.memberApp.copyEmailList()">
        <span class="material-icons">content_copy</span>コピー
      </button>
    </div>`;

  openModal('メールアドレス一覧', html);

  setTimeout(() => {
    updateEmailList();
    document.querySelectorAll('.email-status-filter, .email-class-filter').forEach(cb => {
      cb.addEventListener('change', updateEmailList);
    });
  }, 100);
}

function updateEmailList() {
  const members = getAllMembers();

  // ステータスフィルタ
  const statusChecked = [...document.querySelectorAll('.email-status-filter:checked')].map(c => c.value);
  // クラスフィルタ
  const classChecked = [...document.querySelectorAll('.email-class-filter:checked')].map(c => c.value);

  let filtered = members;
  if (statusChecked.length > 0) {
    filtered = filtered.filter(m => statusChecked.includes(m.status));
  }
  if (classChecked.length > 0) {
    filtered = filtered.filter(m => {
      const mc = m.classes || [];
      return classChecked.some(c => mc.includes(c));
    });
  }

  const emails = filtered
    .map(m => m.email)
    .filter(Boolean)
    .filter((e, i, arr) => arr.indexOf(e) === i);

  const output = document.getElementById('email-list-output');
  const count = document.getElementById('email-count');
  if (output) output.value = emails.join('; ');
  if (count) count.textContent = `(${emails.length}件)`;
}

export function copyEmailList() {
  const output = document.getElementById('email-list-output');
  if (output && output.value) {
    copyToClipboard(output.value);
  }
}
