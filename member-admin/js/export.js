import { showToast } from './app.js';
import { getFilteredMembers } from './members.js';
import { getFilteredApplications } from './applications.js';
import { getFilteredTrials } from './trials.js';
import { getStaffById } from './staff.js';
import { formatDate } from './utils.js';
import { getCurrentFiscalYear, loadAllFees } from './fees.js';

const APP_TYPE_LABELS = { join: '入会', withdrawal: '退会', suspension: '休会', reinstatement: '復会', change: '変更' };
const APP_STATUS_LABELS = { pending: '未対応', reviewed: '確認済み', approved: '承認', rejected: '却下' };
const TRIAL_STATUS_LABELS = { pending: '未対応', reviewed: '受付済み', approved: '体験済み', enrolled: '入会済み', rejected: 'キャンセル' };

export async function exportCSV() {
  const members = getFilteredMembers();
  if (members.length === 0) {
    showToast('エクスポートするデータがありません', 'warning');
    return;
  }

  const fiscalYear = getCurrentFiscalYear();
  const allFees = await loadAllFees(fiscalYear);
  const feeMap = {};
  allFees.forEach(f => { feeMap[f.member_id] = f; });

  const monthLabels = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];
  const monthKeys = ['04','05','06','07','08','09','10','11','12','01','02','03'];

  const headers = [
    '会員番号', '氏名', 'フリガナ', '種別', 'ステータス',
    '生年月日', '性別', '住所', '電話番号', 'メール',
    '教室', '学年', '学校', '保護者名', '障がい情報', 'メモ',
    '月謝金額', '入会金', '年会費', '保険料入金', '保険手続', '保険完了',
    ...monthLabels
  ];

  const rows = members.map(m => {
    const fee = feeMap[m.id] || {};
    return [
      m.member_number || '',
      m.name || '',
      m.furigana || '',
      m.member_type || '',
      m.status || '',
      formatDate(m.birthdate),
      m.gender || '',
      m.address || '',
      m.phone || '',
      m.email || '',
      (m.classes || []).join('・'),
      m.grade || '',
      m.school || '',
      m.guardian_name || '',
      m.disability_info || '',
      m.note || '',
      fee.monthly_fee_amount || 0,
      fee.enrollment_fee || 0,
      fee.annual_fee || 0,
      fee.insurance_payment || 0,
      fee.insurance_procedure ? '済' : '',
      fee.insurance_complete ? '済' : '',
      ...monthKeys.map(k => fee[`month_${k}`] ? '○' : ''),
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // UTF-8 BOM
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filename = `会員一覧_${dateStr}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`${members.length}件エクスポートしました`, 'success');
}
