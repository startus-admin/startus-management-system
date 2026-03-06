// sm-ics.js
// スケジュール管理タブ Google Calendar ICSインポート

import { escapeHtml, getFiscalYear, formatDateJP, parseTimeSlot } from './sm-utils.js';
import { getClassrooms } from './classroom.js';
import { getSmClassroomByName, getSmCurrentFY, smReloadAndRender } from './sm-manager.js';
import { smBulkCreateSchedules } from './sm-store.js';
import { showToast, openModal, closeModal } from './app.js';

// --- .ics パーサー（RRULE展開対応） ---

const DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseICS(text, fiscalYear) {
  const lines = unfoldLines(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));

  const rawEvents = [];
  let inEvent = false;
  let current = {};
  let currentExdates = [];

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true; current = {}; currentExdates = [];
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false; current._exdates = currentExdates; rawEvents.push(current);
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const keyPart = line.substring(0, colonIdx);
    const value   = line.substring(colonIdx + 1);
    const key     = keyPart.split(';')[0].toUpperCase();

    if (key === 'EXDATE') {
      value.split(',').forEach(v => {
        const parsed = parseICSDate(v.trim());
        if (parsed) currentExdates.push(parsed);
      });
    } else {
      current[key] = value;
    }
  }

  const fyStart = `${fiscalYear}-04-01`;
  const fyEnd   = `${parseInt(fiscalYear) + 1}-03-31`;

  const overrides = new Map();
  const masterEvents = [];

  for (const raw of rawEvents) {
    if (raw['RECURRENCE-ID']) {
      const uid = raw.UID || '';
      const overrideDate = parseICSDate(raw['RECURRENCE-ID']);
      if (uid && overrideDate) overrides.set(uid + '_' + overrideDate, raw);
    } else {
      masterEvents.push(raw);
    }
  }

  const expanded = [];

  for (const raw of masterEvents) {
    const summary  = unescapeICS(raw.SUMMARY  || '');
    const location = unescapeICS(raw.LOCATION || '');
    const uid      = raw.UID || '';
    const classTags = extractClassTags(raw.DESCRIPTION || '');
    const dtStart  = parseICSDateTime(raw.DTSTART || '');
    const dtEnd    = parseICSDateTime(raw.DTEND   || '');
    const exdateSet = new Set(raw._exdates || []);

    if (!dtStart.date) continue;

    if (raw.RRULE) {
      const instances = expandRRule(raw.RRULE, dtStart, fyStart, fyEnd, exdateSet);
      for (const instDate of instances) {
        const overrideKey = uid + '_' + instDate;
        if (overrides.has(overrideKey)) {
          const ov = overrides.get(overrideKey);
          const ovStart = parseICSDateTime(ov.DTSTART || '');
          const ovEnd   = parseICSDateTime(ov.DTEND   || '');
          const ovTags  = extractClassTags(ov.DESCRIPTION || '');
          expanded.push({
            summary: unescapeICS(ov.SUMMARY || summary),
            location: unescapeICS(ov.LOCATION || location),
            uid, classTags: ovTags.length ? ovTags : classTags,
            date: ovStart.date || instDate,
            startTime: ovStart.time || dtStart.time,
            endTime: ovEnd.time || dtEnd.time,
          });
        } else {
          expanded.push({ summary, location, uid, classTags, date: instDate, startTime: dtStart.time, endTime: dtEnd.time });
        }
      }
    } else {
      if (dtStart.date >= fyStart && dtStart.date <= fyEnd) {
        expanded.push({ summary, location, uid, classTags, date: dtStart.date, startTime: dtStart.time, endTime: dtEnd.time });
      }
    }
  }

  for (const [, raw] of overrides) {
    const ovStart = parseICSDateTime(raw.DTSTART || '');
    if (ovStart.date && ovStart.date >= fyStart && ovStart.date <= fyEnd) {
      const uid = raw.UID || '';
      const alreadyAdded = expanded.some(e => e.uid === uid && e.date === ovStart.date);
      if (!alreadyAdded) {
        const ovEnd  = parseICSDateTime(raw.DTEND || '');
        const ovTags = extractClassTags(raw.DESCRIPTION || '');
        expanded.push({
          summary: unescapeICS(raw.SUMMARY || ''), location: unescapeICS(raw.LOCATION || ''),
          uid, classTags: ovTags, date: ovStart.date, startTime: ovStart.time, endTime: ovEnd.time,
        });
      }
    }
  }

  expanded.sort((a, b) => a.date.localeCompare(b.date));
  return expanded;
}

function expandRRule(rruleStr, dtStart, fyStart, fyEnd, exdateSet) {
  const params = {};
  for (const part of rruleStr.split(';')) {
    const [k, v] = part.split('=');
    if (k && v) params[k.toUpperCase()] = v;
  }

  const freq = params.FREQ;
  if (freq !== 'WEEKLY') {
    if (dtStart.date >= fyStart && dtStart.date <= fyEnd) {
      return exdateSet.has(dtStart.date) ? [] : [dtStart.date];
    }
    return [];
  }

  let untilDate = fyEnd;
  if (params.UNTIL) { const parsed = parseICSDate(params.UNTIL); if (parsed) untilDate = parsed; }

  const maxCount = params.COUNT ? parseInt(params.COUNT) : Infinity;
  const byDay = params.BYDAY
    ? params.BYDAY.split(',').map(d => DAY_MAP[d.trim()])
    : [new Date(dtStart.date + 'T00:00:00').getDay()];
  const interval = params.INTERVAL ? parseInt(params.INTERVAL) : 1;

  const results = [];
  const startD    = new Date(dtStart.date + 'T00:00:00');
  const endD      = new Date(untilDate + 'T23:59:59');
  const fyStartD  = new Date(fyStart + 'T00:00:00');
  const fyEndD    = new Date(fyEnd   + 'T23:59:59');
  let currentWeekStart = getWeekStart(startD);
  let count = 0;

  while (currentWeekStart <= endD && count < maxCount) {
    for (const dayNum of byDay) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + ((dayNum - d.getDay() + 7) % 7));
      if (d < startD || d > endD) continue;
      if (count >= maxCount) break;
      count++;
      const dateStr = toDateStr(d);
      if (exdateSet.has(dateStr)) continue;
      if (d >= fyStartD && d <= fyEndD) results.push(dateStr);
    }
    currentWeekStart.setDate(currentWeekStart.getDate() + 7 * interval);
  }
  return results;
}

function getWeekStart(d) {
  const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function unfoldLines(text) {
  const raw = text.split('\n');
  const result = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && result.length > 0) {
      result[result.length - 1] += line.substring(1);
    } else {
      result.push(line);
    }
  }
  return result;
}

function parseICSDateTime(str) {
  if (!str) return { date: null, time: null };
  if (str.includes(':')) str = str.split(':').pop();
  if (str.length === 8) return { date: formatICSDate(str), time: null };
  const match = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!match) return { date: null, time: null };
  const [, y, mo, d, h, mi] = match;
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

function parseICSDate(str) {
  if (!str) return null;
  if (str.includes(':')) str = str.split(':').pop();
  const match = str.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatICSDate(str) {
  return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}`;
}

function extractClassTags(description) {
  const text = unescapeICS(description);
  const matches = text.match(/#class=([a-z0-9_-]+)/g);
  if (!matches) return [];
  return matches.map(m => m.replace('#class=', ''));
}

function unescapeICS(str) {
  return str.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

// --- インポートUI ---

let parsedEvents = [];
let classMapping = {};
let selectedFY   = '';

export function openSmICSImportForm() {
  selectedFY = getSmCurrentFY();

  const content = `
    <div class="ics-import-container">
      <div class="ics-upload-area" id="sm-ics-upload-area">
        <span class="material-icons ics-upload-icon">upload_file</span>
        <p>Google Calendar からエクスポートした .ics ファイルを選択</p>
        <p class="text-muted ics-upload-hint">Google Calendar → 設定 → エクスポート で取得できます</p>
        <div class="ics-fy-selector">
          <label>インポート対象年度:</label>
          <select id="sm-ics-fy-select" class="fy-select">
            ${buildSmFYOptions(selectedFY)}
          </select>
        </div>
        <input type="file" id="sm-ics-file-input" accept=".ics,.ical,.ifb" style="display:none">
        <button type="button" class="btn btn-outline" id="sm-ics-file-btn">
          <span class="material-icons">folder_open</span>ファイルを選択
        </button>
      </div>
      <div id="sm-ics-parse-result" style="display:none">
        <div id="sm-ics-summary"></div>
        <div id="sm-ics-mapping-area"></div>
        <div id="sm-ics-preview-list"></div>
        <div id="sm-ics-import-actions" class="form-actions" style="display:none">
          <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">キャンセル</button>
          <button type="button" class="btn btn-primary" id="sm-btn-ics-import">
            <span class="material-icons">cloud_upload</span>インポート実行
          </button>
        </div>
      </div>
      <div id="sm-ics-initial-actions" class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">キャンセル</button>
      </div>
    </div>`;

  openModal('Google Calendar インポート (.ics)', content);

  setTimeout(() => {
    const fileInput  = document.getElementById('sm-ics-file-input');
    const fileBtn    = document.getElementById('sm-ics-file-btn');
    const uploadArea = document.getElementById('sm-ics-upload-area');
    const fySelect   = document.getElementById('sm-ics-fy-select');

    fileBtn?.addEventListener('click', () => fileInput?.click());

    fySelect?.addEventListener('change', () => { selectedFY = fySelect.value; });

    uploadArea?.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea?.addEventListener('dragleave', () => { uploadArea.classList.remove('drag-over'); });
    uploadArea?.addEventListener('drop', (e) => {
      e.preventDefault(); uploadArea.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleSmICSFile(file);
    });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) handleSmICSFile(file);
    });
  }, 100);
}

function buildSmFYOptions(currentFY) {
  const cy = parseInt(currentFY);
  const years = [];
  for (let y = cy - 2; y <= cy + 1; y++) years.push(y);
  return years.map(y =>
    `<option value="${y}" ${y === cy ? 'selected' : ''}>${y}年度 (${y}/4〜${y+1}/3)</option>`
  ).join('');
}

function handleSmICSFile(file) {
  if (!file.name.match(/\.(ics|ical|ifb)$/i)) {
    showToast('.ics ファイルを選択してください', 'warning');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    showToast('ファイルを解析中...', 'info');
    setTimeout(() => {
      parsedEvents = parseICS(e.target.result, selectedFY);
      if (parsedEvents.length === 0) {
        showToast(`${selectedFY}年度のイベントが見つかりませんでした`, 'warning');
        return;
      }
      showSmParseResult();
    }, 50);
  };
  reader.readAsText(file, 'UTF-8');
}

function showSmParseResult() {
  const resultEl       = document.getElementById('sm-ics-parse-result');
  const summaryEl      = document.getElementById('sm-ics-summary');
  const uploadArea     = document.getElementById('sm-ics-upload-area');
  const initialActions = document.getElementById('sm-ics-initial-actions');

  if (!resultEl || !summaryEl) return;
  if (uploadArea)     uploadArea.style.display     = 'none';
  if (initialActions) initialActions.style.display = 'none';

  const titleMap = {};
  for (const ev of parsedEvents) {
    const title = ev.summary || '（タイトルなし）';
    if (!titleMap[title]) titleMap[title] = 0;
    titleMap[title]++;
  }
  const titleEntries = Object.entries(titleMap).sort((a, b) => b[1] - a[1]);

  summaryEl.innerHTML = `<p>${selectedFY}年度のイベント: <strong>${parsedEvents.length}件</strong>（${titleEntries.length}種類）</p>`;

  showSmMappingUI(titleEntries);
  resultEl.style.display = '';
}

function autoMatchByTag(events, classrooms) {
  const tagIndex = {};
  for (const c of classrooms) {
    if (c.calendar_tag) tagIndex[c.calendar_tag] = c.name;
  }
  const titleTagMap = {};
  for (const ev of events) {
    const title = ev.summary || '（タイトルなし）';
    if (!titleTagMap[title] && ev.classTags && ev.classTags.length > 0) {
      const tag = ev.classTags[0];
      if (tagIndex[tag]) titleTagMap[title] = tagIndex[tag];
    }
  }
  return titleTagMap;
}

function autoMatchTitle(title, classrooms, tagMatchMap) {
  if (tagMatchMap[title]) return tagMatchMap[title];
  const cleanTitle = title
    .replace(/^[\(（](?:未定|予定)[\)）]\s*/, '')
    .replace(/^い/, '')
    .replace(/^\s+/, '')
    .trim();
  const exactMatch = classrooms.find(c => c.name === cleanTitle);
  if (exactMatch) return exactMatch.name;
  const partialMatch = classrooms.find(c => cleanTitle.includes(c.name) || c.name.includes(cleanTitle));
  return partialMatch ? partialMatch.name : '';
}

function showSmMappingUI(titleEntries) {
  const mappingEl  = document.getElementById('sm-ics-mapping-area');
  if (!mappingEl) return;

  const classrooms = getClassrooms();
  const tagMatchMap = autoMatchByTag(parsedEvents, classrooms);

  classMapping = {};
  for (const [title] of titleEntries) {
    classMapping[title] = autoMatchTitle(title, classrooms, tagMatchMap);
  }

  const rows = titleEntries.map(([title, count]) => {
    const selected = classMapping[title];
    const options = '<option value="">-- スキップ --</option>' +
      classrooms.map(c =>
        `<option value="${escapeHtml(c.name)}" ${c.name === selected ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
      ).join('');
    return `
      <div class="ics-mapping-row">
        <div class="ics-mapping-title">
          <strong>${escapeHtml(title)}</strong>
          <span class="text-muted">(${count}件)</span>
        </div>
        <div class="ics-mapping-arrow">&rarr;</div>
        <select class="ics-mapping-select" data-title="${escapeHtml(title)}">
          ${options}
        </select>
      </div>`;
  }).join('');

  mappingEl.innerHTML = `
    <h4>教室マッピング</h4>
    <p class="text-muted">Google Calendar のイベントタイトルを教室名に対応付けてください。「スキップ」にするとインポートしません。</p>
    <div class="ics-mapping-list">${rows}</div>`;

  mappingEl.querySelectorAll('.ics-mapping-select').forEach(select => {
    select.addEventListener('change', () => {
      classMapping[select.dataset.title] = select.value;
      updateSmICSPreview();
    });
  });

  updateSmICSPreview();
}

function updateSmICSPreview() {
  const previewEl  = document.getElementById('sm-ics-preview-list');
  const actionsEl  = document.getElementById('sm-ics-import-actions');
  if (!previewEl) return;

  const mapped = parsedEvents.filter(ev => {
    const title = ev.summary || '（タイトルなし）';
    return classMapping[title] && classMapping[title] !== '';
  });

  if (mapped.length === 0) {
    previewEl.innerHTML = '<p class="text-muted">マッピングされたイベントがありません。教室を対応付けてください。</p>';
    if (actionsEl) actionsEl.style.display = 'none';
    return;
  }

  mapped.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const classCountMap = {};
  for (const ev of mapped) {
    const cn = classMapping[ev.summary || '（タイトルなし）'];
    if (!classCountMap[cn]) classCountMap[cn] = 0;
    classCountMap[cn]++;
  }
  const classSummary = Object.entries(classCountMap).map(([cn, c]) => `${cn}: ${c}件`).join('、');

  previewEl.innerHTML = `
    <h4>インポートプレビュー (${mapped.length}件)</h4>
    <p class="text-muted">${classSummary}</p>
    <div class="ics-preview-table">
      <div class="ics-preview-header">
        <div class="ics-preview-cell">日付</div>
        <div class="ics-preview-cell">教室名</div>
        <div class="ics-preview-cell">時間</div>
        <div class="ics-preview-cell">会場</div>
      </div>
      ${mapped.slice(0, 100).map(ev => {
        const cn      = classMapping[ev.summary || '（タイトルなし）'];
        const timeStr = ev.startTime && ev.endTime ? `${ev.startTime}〜${ev.endTime}` : ev.startTime || '';
        return `
          <div class="ics-preview-row">
            <div class="ics-preview-cell">${ev.date ? formatDateJP(ev.date) : '不明'}</div>
            <div class="ics-preview-cell">${escapeHtml(cn)}</div>
            <div class="ics-preview-cell">${timeStr}</div>
            <div class="ics-preview-cell">${escapeHtml(ev.location || '')}</div>
          </div>`;
      }).join('')}
      ${mapped.length > 100 ? `<p class="text-muted">…他 ${mapped.length - 100}件</p>` : ''}
    </div>`;

  if (actionsEl) {
    actionsEl.style.display = '';
    const btn = document.getElementById('sm-btn-ics-import');
    if (btn) btn.onclick = () => executeSmICSImport(mapped);
  }
}

async function executeSmICSImport(mapped) {
  const btn = document.getElementById('sm-btn-ics-import');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons rotating">sync</span>インポート中...'; }

  const batchGroupId = crypto.randomUUID();

  const records = mapped
    .filter(ev => ev.date)
    .map(ev => {
      const title     = ev.summary || '（タイトルなし）';
      const className = classMapping[title];
      const cls       = getSmClassroomByName(className);
      const { start: clsStart, end: clsEnd } = parseTimeSlot(cls?.time_slot || '');

      return {
        class_name:     className,
        class_id:       cls?.id         || null,
        coach_name:     cls?.main_coach || null,
        date:           ev.date,
        start_time:     ev.startTime || clsStart || null,
        end_time:       ev.endTime   || clsEnd   || null,
        venue:          ev.location  || cls?.venue || null,
        status:         'tentative',
        is_published:   false,
        is_trial_ok:    true,
        batch_group_id: batchGroupId,
        fiscal_year:    selectedFY,
      };
    });

  if (records.length === 0) {
    showToast('インポートするレコードがありません', 'warning');
    return;
  }

  let imported = 0;
  const batchSize = 50;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await smBulkCreateSchedules(batch);
    if (error) {
      showToast(`インポート中にエラーが発生しました (${imported}件まで完了)`, 'error');
      closeModal();
      await smReloadAndRender();
      return;
    }
    imported += batch.length;
  }

  showToast(`${imported}件のスケジュールをインポートしました`, 'success');
  closeModal();
  await smReloadAndRender();
}
