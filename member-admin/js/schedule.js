// --- 開催スケジュールカレンダー ---

import { SCHEDULE_API_URL, CALENDAR_START_HOUR, CALENDAR_END_HOUR } from './config.js';
import { supabase } from './supabase.js';
import { escapeHtml } from './utils.js';
import { showToast, openModal, closeModal, setModalWide } from './app.js';
import { getClassrooms } from './classroom.js';

// --- State ---

let currentDate = new Date();
let currentView = 'week'; // 'day' | 'week' | 'month' | 'year'
let cachedScheduleEvents = {}; // { cacheKey: items[] }
let cachedAppData = null;      // { trials, joins, withdrawals }
let allFetchedEvents = [];     // flat array of all fetched events

// --- Constants ---

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const HOUR_HEIGHT = 60;
const TOTAL_HOURS = CALENDAR_END_HOUR - CALENDAR_START_HOUR;
const VIEW_LABELS = { day: '日', week: '週', month: '月', year: '年' };

// --- Description Parser ---

function parseEventDescription(desc) {
  if (!desc) return { taikenOk: true, furikaeOk: true, capacity: null, memo: '' };

  let taikenOk = true;
  let furikaeOk = true;
  let capacity = null;
  const memoLines = [];

  const lines = desc.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#class=/i.test(trimmed)) continue;
    if (/^#taiken=/i.test(trimmed)) {
      taikenOk = !/NG/i.test(trimmed);
      continue;
    }
    if (/^#furikae=/i.test(trimmed)) {
      furikaeOk = !/N[OG]/i.test(trimmed);
      continue;
    }
    if (/^#cap=/i.test(trimmed)) {
      const m = trimmed.match(/#cap=(\d+)/i);
      if (m) capacity = parseInt(m[1], 10);
      continue;
    }
    if (trimmed) memoLines.push(trimmed);
  }

  return { taikenOk, furikaeOk, capacity, memo: memoLines.join('\n') };
}

// --- Data Fetching: GAS API ---

async function fetchScheduleEvents(startDate, endDate) {
  const startStr = toISODate(startDate);
  const endStr = toISODate(endDate);
  const cacheKey = `${startStr}_${endStr}`;

  if (cachedScheduleEvents[cacheKey]) return cachedScheduleEvents[cacheKey];

  const url = `${SCHEDULE_API_URL}?start_date=${startStr}&end_date=${endStr}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const items = data.items || [];
    cachedScheduleEvents[cacheKey] = items;
    allFetchedEvents = items;
    return items;
  } catch (fetchErr) {
    // Fallback to JSONP
    try {
      const data = await fetchViaJsonp(url);
      const items = data.items || [];
      cachedScheduleEvents[cacheKey] = items;
      allFetchedEvents = items;
      return items;
    } catch (jsonpErr) {
      console.error('Schedule API error:', fetchErr, jsonpErr);
      showToast('スケジュールの読み込みに失敗しました', 'error');
      return [];
    }
  }
}

function fetchViaJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `_schJsonp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const script = document.createElement('script');

    const cleanup = () => {
      delete window[callbackName];
      if (script.parentNode) script.remove();
    };

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP request failed'));
    };

    const sep = url.includes('?') ? '&' : '?';
    script.src = `${url}${sep}callback=${callbackName}`;
    document.head.appendChild(script);

    setTimeout(() => {
      if (window[callbackName]) {
        cleanup();
        reject(new Error('JSONP timeout'));
      }
    }, 15000);
  });
}

// --- Data Fetching: Application Counts ---

async function fetchApplicationCounts(startDate, endDate) {
  if (cachedAppData) return cachedAppData;

  const startStr = toISODate(startDate);
  const endStr = toISODate(endDate);

  const [trialsRes, joinsRes, withdrawalsRes] = await Promise.all([
    supabase
      .from('applications')
      .select('id, type, status, form_data, created_at')
      .eq('type', 'trial')
      .gte('created_at', `${startStr}T00:00:00`)
      .lte('created_at', `${endStr}T23:59:59`),
    supabase
      .from('applications')
      .select('id, type, status, form_data, created_at')
      .eq('type', 'join')
      .gte('created_at', `${startStr}T00:00:00`)
      .lte('created_at', `${endStr}T23:59:59`),
    supabase
      .from('applications')
      .select('id, type, status, form_data, created_at')
      .eq('type', 'withdrawal')
      .gte('created_at', `${startStr}T00:00:00`)
      .lte('created_at', `${endStr}T23:59:59`),
  ]);

  cachedAppData = {
    trials: trialsRes.data || [],
    joins: joinsRes.data || [],
    withdrawals: withdrawalsRes.data || [],
  };

  return cachedAppData;
}

// --- Enrichment ---

function enrichEvent(event) {
  const classrooms = getClassrooms();
  const classroom = classrooms.find(c => c.calendar_tag === event.class) || null;
  const parsed = parseEventDescription(event.description);

  return {
    ...event,
    classroom,
    classroomName: classroom?.name || '',
    eventTitle: event.title || '',
    venue: event.location || classroom?.venue || '',
    mainCoach: classroom?.main_coach || '',
    patrolCoach: classroom?.patrol_coach || '',
    timeSlot: formatTimeRange(new Date(event.start), new Date(event.end)),
    taikenOk: parsed.taikenOk,
    furikaeOk: parsed.furikaeOk,
    capacity: parsed.capacity ?? classroom?.capacity ?? null,
    memo: parsed.memo,
  };
}

function getTrialsForEvent(enrichedEvent, appData) {
  if (!appData || !enrichedEvent.classroom) return [];
  const eventDate = toISODate(new Date(enrichedEvent.start));
  const classroomName = enrichedEvent.classroomName;

  return appData.trials.filter(t => {
    const fd = t.form_data || {};
    const desiredDate = fd.desired_date || '';
    const desiredClasses = Array.isArray(fd.desired_classes)
      ? fd.desired_classes
      : [fd.desired_classes].filter(Boolean);

    const dateMatch = desiredDate === eventDate ||
      desiredDate.replace(/\//g, '-') === eventDate;
    const classMatch = classroomName && desiredClasses.some(c =>
      c === classroomName || c.includes(classroomName) || classroomName.includes(c)
    );

    return dateMatch && classMatch;
  });
}

function getJoinsForClass(enrichedEvent, appData) {
  if (!appData || !enrichedEvent.classroom) return [];
  const classroomName = enrichedEvent.classroomName;

  return appData.joins.filter(j => {
    const fd = j.form_data || {};
    const desiredClasses = Array.isArray(fd.desired_classes)
      ? fd.desired_classes
      : [fd.desired_classes].filter(Boolean);
    return classroomName && desiredClasses.some(c =>
      c === classroomName || c.includes(classroomName) || classroomName.includes(c)
    );
  });
}

function getWithdrawalsForClass(enrichedEvent, appData) {
  if (!appData || !enrichedEvent.classroom) return [];
  const classroomName = enrichedEvent.classroomName;

  return appData.withdrawals.filter(w => {
    const fd = w.form_data || {};
    const classes = fd.classes || fd.desired_classes || [];
    const classList = Array.isArray(classes) ? classes : [classes].filter(Boolean);
    return classroomName && classList.some(c =>
      c === classroomName || c.includes(classroomName) || classroomName.includes(c)
    );
  });
}

// --- Main Render ---

export async function renderSchedule() {
  const container = document.getElementById('schedule-content');
  if (!container) return;

  // Show loading
  container.innerHTML = `
    <div class="sch-loading">
      <span class="material-icons cal-spinner" style="font-size:32px;color:var(--gray-300)">sync</span>
      <p>スケジュールを読み込み中...</p>
    </div>`;

  const { start, end } = getDateRange(currentDate, currentView);
  // Extend range a bit for month boundary events
  const fetchStart = new Date(start);
  fetchStart.setDate(fetchStart.getDate() - 7);
  const fetchEnd = new Date(end);
  fetchEnd.setDate(fetchEnd.getDate() + 7);

  try {
    const [events, appData] = await Promise.all([
      fetchScheduleEvents(fetchStart, fetchEnd),
      fetchApplicationCounts(fetchStart, fetchEnd),
    ]);

    const toolbar = renderScheduleToolbar();
    let viewHtml = '';

    switch (currentView) {
      case 'day':
        viewHtml = renderDayView(events, appData);
        break;
      case 'week':
        viewHtml = renderWeekView(events, appData);
        break;
      case 'month':
        viewHtml = renderMonthView(events, appData);
        break;
      case 'year':
        viewHtml = renderYearView(events, appData);
        break;
    }

    container.innerHTML = toolbar + viewHtml;
  } catch (err) {
    console.error('Schedule render error:', err);
    container.innerHTML = `
      <div class="sch-loading">
        <span class="material-icons" style="font-size:48px;color:var(--gray-300)">error_outline</span>
        <p>スケジュールの読み込みに失敗しました</p>
        <button class="btn btn-primary" onclick="window.memberApp.refreshSchedule()" style="margin-top:12px">
          <span class="material-icons">refresh</span>再試行
        </button>
      </div>`;
  }
}

// --- Toolbar ---

function renderScheduleToolbar() {
  const dateLabel = getDateLabel(currentDate, currentView);
  const viewBtns = Object.entries(VIEW_LABELS).map(([key, label]) =>
    `<button class="sch-view-btn ${currentView === key ? 'active' : ''}"
      onclick="window.memberApp.changeScheduleView('${key}')">${label}</button>`
  ).join('');

  return `
    <div class="sch-toolbar">
      <div class="sch-toolbar-left">
        <button class="btn btn-secondary" onclick="window.memberApp.goToScheduleToday()">
          <span class="material-icons">today</span>今日
        </button>
        <button class="btn-icon" onclick="window.memberApp.navigateSchedule(-1)" title="前へ">
          <span class="material-icons">chevron_left</span>
        </button>
        <button class="btn-icon" onclick="window.memberApp.navigateSchedule(1)" title="次へ">
          <span class="material-icons">chevron_right</span>
        </button>
        <span class="sch-date-label">${escapeHtml(dateLabel)}</span>
      </div>
      <div class="sch-toolbar-right">
        <div class="sch-view-toggle">${viewBtns}</div>
        <button class="btn-icon" onclick="window.memberApp.refreshSchedule()" title="更新">
          <span class="material-icons">refresh</span>
        </button>
      </div>
    </div>`;
}

// --- Day View ---

function renderDayView(events, appData) {
  const dayEvents = events
    .filter(e => isSameDay(new Date(e.start), currentDate))
    .map(e => enrichEvent(e))
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const gridHeight = TOTAL_HOURS * HOUR_HEIGHT;

  // Time labels
  let timeLabelsHtml = '';
  let hourLinesHtml = '';
  for (let h = CALENDAR_START_HOUR; h < CALENDAR_END_HOUR; h++) {
    const top = (h - CALENDAR_START_HOUR) * HOUR_HEIGHT;
    timeLabelsHtml += `<div class="cal-time-label" style="top:${top}px">${String(h).padStart(2, '0')}:00</div>`;
    hourLinesHtml += `<div class="cal-hour-line" style="top:${(h - CALENDAR_START_HOUR) * HOUR_HEIGHT}px"></div>`;
  }

  // Event blocks
  const eventBlocksHtml = dayEvents.map(e => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const startMin = (start.getHours() - CALENDAR_START_HOUR) * 60 + start.getMinutes();
    const endMin = (end.getHours() - CALENDAR_START_HOUR) * 60 + end.getMinutes();
    const top = Math.max(0, startMin) * (HOUR_HEIGHT / 60);
    const height = Math.max(80, (Math.min(endMin, TOTAL_HOURS * 60) - Math.max(0, startMin)) * (HOUR_HEIGHT / 60));

    const trials = getTrialsForEvent(e, appData);
    const joins = getJoinsForClass(e, appData);
    const withdrawals = getWithdrawalsForClass(e, appData);

    return `
      <div class="sch-event-block" style="top:${top}px;min-height:${height}px"
           onclick="window.memberApp.showScheduleEventDetail('${escapeHtml(e.id)}')">
        <div class="sch-event-title">${escapeHtml(e.eventTitle)}</div>
        ${e.classroomName ? `<div class="sch-event-classroom">${escapeHtml(e.classroomName)}</div>` : ''}
        <div class="sch-event-time">${escapeHtml(e.timeSlot)}</div>
        ${e.venue ? `<div class="sch-event-venue"><span class="material-icons" style="font-size:14px">place</span>${escapeHtml(e.venue)}</div>` : ''}
        <div class="sch-event-staff">
          ${e.mainCoach ? `<span class="sch-coach-badge">担当: ${escapeHtml(e.mainCoach)}</span>` : ''}
          ${e.patrolCoach ? `<span class="sch-patrol-badge">巡回: ${escapeHtml(e.patrolCoach)}</span>` : ''}
        </div>
        <div class="sch-event-tags">
          ${!e.taikenOk ? '<span class="sch-tag-ng">体験NG</span>' : '<span class="sch-tag-ok">体験OK</span>'}
          ${!e.furikaeOk ? '<span class="sch-tag-ng">振替NG</span>' : ''}
          ${e.capacity != null ? `<span class="sch-tag-cap">定員${e.capacity}</span>` : ''}
        </div>
        <div class="sch-event-counts">
          ${trials.length > 0 ? `<span class="sch-count sch-count-trial">体験 ${trials.length}</span>` : ''}
          ${joins.length > 0 ? `<span class="sch-count sch-count-join">入会 ${joins.length}</span>` : ''}
          ${withdrawals.length > 0 ? `<span class="sch-count sch-count-withdrawal">退会 ${withdrawals.length}</span>` : ''}
        </div>
        ${e.memo ? `<div class="sch-event-memo">${escapeHtml(e.memo)}</div>` : ''}
      </div>`;
  }).join('');

  // Now line
  let nowLineHtml = '';
  if (isSameDay(currentDate, new Date())) {
    const now = new Date();
    const nowMin = (now.getHours() - CALENDAR_START_HOUR) * 60 + now.getMinutes();
    if (nowMin >= 0 && nowMin < TOTAL_HOURS * 60) {
      const nowTop = nowMin * (HOUR_HEIGHT / 60);
      nowLineHtml = `<div class="cal-now-line" style="top:${nowTop}px"></div>`;
    }
  }

  return `
    <div class="sch-day-grid">
      <div class="sch-day-time-col">
        <div class="cal-time-labels" style="height:${gridHeight}px;position:relative">
          ${timeLabelsHtml}
        </div>
      </div>
      <div class="sch-day-events-col" style="height:${gridHeight}px;position:relative">
        ${hourLinesHtml}
        ${eventBlocksHtml}
        ${nowLineHtml}
      </div>
    </div>`;
}

// --- Week View ---

function renderWeekView(events, appData) {
  const weekStart = getWeekStart(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const columnsHtml = days.map(day => {
    const dayEvents = events
      .filter(e => isSameDay(new Date(e.start), day))
      .map(e => enrichEvent(e))
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    const isToday = isSameDay(day, new Date());
    const dayLabel = `${day.getMonth() + 1}/${day.getDate()}`;
    const dowLabel = DAY_NAMES[day.getDay()];

    const eventCards = dayEvents.map(e => {
      const trials = getTrialsForEvent(e, appData);

      return `
        <div class="sch-week-card" onclick="window.memberApp.showScheduleEventDetail('${escapeHtml(e.id)}')">
          <div class="sch-week-card-title">${escapeHtml(e.eventTitle)}</div>
          <div class="sch-week-card-time">${escapeHtml(e.timeSlot)}</div>
          ${e.venue ? `<div class="sch-week-card-venue">${escapeHtml(e.venue)}</div>` : ''}
          <div class="sch-week-card-meta">
            ${e.mainCoach ? `<span class="sch-meta-coach">${escapeHtml(e.mainCoach)}</span>` : ''}
            ${trials.length > 0 ? `<span class="sch-count sch-count-trial">体験${trials.length}</span>` : ''}
            ${!e.taikenOk ? '<span class="sch-tag-ng-sm">体験NG</span>' : ''}
            ${!e.furikaeOk ? '<span class="sch-tag-ng-sm">振替NG</span>' : ''}
          </div>
          ${e.memo ? `<div class="sch-week-card-memo">${escapeHtml(e.memo)}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="sch-week-col ${isToday ? 'sch-week-today' : ''}">
        <div class="sch-week-header">
          <span class="sch-week-dow">${dowLabel}</span>
          <span class="sch-week-date ${isToday ? 'sch-today-circle' : ''}">${dayLabel}</span>
        </div>
        <div class="sch-week-body">
          ${eventCards || '<div class="sch-week-empty"></div>'}
        </div>
      </div>`;
  }).join('');

  return `<div class="sch-week-grid">${columnsHtml}</div>`;
}

// --- Month View ---

function renderMonthView(events, appData) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);

  // Start from Monday
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - startOffset);

  let cellsHtml = '';
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(cellDate.getDate() + i);
    const isCurrentMonth = cellDate.getMonth() === month;
    const isToday = isSameDay(cellDate, new Date());

    const dayEvents = events
      .filter(e => isSameDay(new Date(e.start), cellDate))
      .map(e => enrichEvent(e));

    const chips = dayEvents.slice(0, 3).map(e =>
      `<div class="sch-month-chip" onclick="event.stopPropagation();window.memberApp.showScheduleEventDetail('${escapeHtml(e.id)}')" title="${escapeHtml(e.eventTitle)} ${escapeHtml(e.timeSlot)}">
        ${escapeHtml(truncate(e.eventTitle, 10))}
      </div>`
    ).join('');
    const more = dayEvents.length > 3
      ? `<div class="sch-month-more">+${dayEvents.length - 3}件</div>`
      : '';

    const dateNum = cellDate.getDate();
    const dateStr = toISODate(cellDate);

    cellsHtml += `
      <div class="sch-month-cell ${isCurrentMonth ? '' : 'sch-month-other'} ${isToday ? 'sch-month-today' : ''}"
           onclick="window.memberApp.navigateScheduleToDate('${dateStr}','day')">
        <div class="sch-month-date">${dateNum}</div>
        ${chips}${more}
      </div>`;
  }

  const headerHtml = ['月', '火', '水', '木', '金', '土', '日'].map(d =>
    `<div class="sch-month-header-cell">${d}</div>`
  ).join('');

  return `
    <div class="sch-month-grid">
      <div class="sch-month-header-row">${headerHtml}</div>
      <div class="sch-month-body">${cellsHtml}</div>
    </div>`;
}

// --- Year View ---

function renderYearView(events) {
  const year = currentDate.getFullYear();

  const monthsHtml = Array.from({ length: 12 }, (_, m) => {
    const lastDay = new Date(year, m + 1, 0).getDate();

    // Day of week offset for first day (Monday = 0)
    const firstDow = (new Date(year, m, 1).getDay() + 6) % 7;
    const blanks = Array.from({ length: firstDow }, () =>
      '<div class="sch-year-day sch-year-blank"></div>'
    ).join('');

    const dayCells = Array.from({ length: lastDay }, (_, d) => {
      const date = new Date(year, m, d + 1);
      const count = events.filter(e => isSameDay(new Date(e.start), date)).length;
      const intensity = count === 0 ? '' : count <= 2 ? 'sch-year-low' : count <= 5 ? 'sch-year-mid' : 'sch-year-high';
      const isToday = isSameDay(date, new Date());
      const dateStr = toISODate(date);

      return `<div class="sch-year-day ${intensity} ${isToday ? 'sch-year-today' : ''}"
        title="${m + 1}/${d + 1}: ${count}件"
        onclick="window.memberApp.navigateScheduleToDate('${dateStr}','day')">${d + 1}</div>`;
    }).join('');

    // Weekday header
    const dowHeader = ['月', '火', '水', '木', '金', '土', '日'].map(d =>
      `<div class="sch-year-dow-header">${d}</div>`
    ).join('');

    return `
      <div class="sch-year-month" onclick="window.memberApp.navigateScheduleToDate('${year}-${String(m + 1).padStart(2, '0')}-01','month')">
        <div class="sch-year-month-label">${m + 1}月</div>
        <div class="sch-year-dow-row">${dowHeader}</div>
        <div class="sch-year-days">${blanks}${dayCells}</div>
      </div>`;
  }).join('');

  return `<div class="sch-year-grid">${monthsHtml}</div>`;
}

// --- Event Detail Modal ---

export function showScheduleEventDetail(eventId) {
  const event = allFetchedEvents.find(e => e.id === eventId);
  if (!event) return;

  const e = enrichEvent(event);
  const trials = cachedAppData ? getTrialsForEvent(e, cachedAppData) : [];
  const joins = cachedAppData ? getJoinsForClass(e, cachedAppData) : [];
  const withdrawals = cachedAppData ? getWithdrawalsForClass(e, cachedAppData) : [];

  const eventDate = new Date(e.start);
  const dateLabel = `${eventDate.getFullYear()}年${eventDate.getMonth() + 1}月${eventDate.getDate()}日（${DAY_NAMES[eventDate.getDay()]}）`;

  const trialRows = trials.length > 0
    ? trials.map(t => `
        <div class="sch-detail-app-row" onclick="window.memberApp.showTrialDetail('${t.id}')">
          <span>${escapeHtml(t.form_data?.name || '---')}</span>
          <span class="badge badge-app-${t.status}">${escapeHtml(statusLabel(t.status))}</span>
        </div>`).join('')
    : '<p class="text-muted">なし</p>';

  const joinRows = joins.length > 0
    ? joins.map(j => `
        <div class="sch-detail-app-row" onclick="window.memberApp.showApplicationDetail('${j.id}')">
          <span>${escapeHtml(j.form_data?.name || '---')}</span>
          <span class="badge badge-app-${j.status}">${escapeHtml(statusLabel(j.status))}</span>
        </div>`).join('')
    : '<p class="text-muted">なし</p>';

  const withdrawalRows = withdrawals.length > 0
    ? withdrawals.map(w => `
        <div class="sch-detail-app-row" onclick="window.memberApp.showApplicationDetail('${w.id}')">
          <span>${escapeHtml(w.form_data?.name || '---')}</span>
          <span class="badge badge-app-${w.status}">${escapeHtml(statusLabel(w.status))}</span>
        </div>`).join('')
    : '<p class="text-muted">なし</p>';

  const content = `
    <div class="sch-detail">
      <div class="sch-detail-header">
        <h3>${escapeHtml(e.eventTitle)}</h3>
        <p class="text-muted">${escapeHtml(dateLabel)}</p>
      </div>

      <div class="detail-grid">
        ${e.classroomName ? `<div class="detail-row"><span class="detail-label">教室</span><span class="detail-value"><strong>${escapeHtml(e.classroomName)}</strong></span></div>` : ''}
        <div class="detail-row"><span class="detail-label">時間</span><span class="detail-value">${escapeHtml(e.timeSlot)}</span></div>
        <div class="detail-row"><span class="detail-label">会場</span><span class="detail-value">${escapeHtml(e.venue || '---')}</span></div>
        <div class="detail-row"><span class="detail-label">担当コーチ</span><span class="detail-value">${escapeHtml(e.mainCoach || '---')}</span></div>
        <div class="detail-row"><span class="detail-label">巡回者</span><span class="detail-value">${escapeHtml(e.patrolCoach || '---')}</span></div>
        <div class="detail-row"><span class="detail-label">体験</span><span class="detail-value">${e.taikenOk ? '<span class="sch-tag-ok">OK</span>' : '<span class="sch-tag-ng">NG</span>'}</span></div>
        <div class="detail-row"><span class="detail-label">振替</span><span class="detail-value">${e.furikaeOk ? '<span class="sch-tag-ok">OK</span>' : '<span class="sch-tag-ng">NG</span>'}</span></div>
        ${e.capacity != null ? `<div class="detail-row"><span class="detail-label">定員</span><span class="detail-value">${e.capacity}名</span></div>` : ''}
      </div>

      ${e.memo ? `
        <div class="sch-detail-section">
          <h4>メモ</h4>
          <p class="sch-detail-memo-text">${escapeHtml(e.memo)}</p>
        </div>` : ''}

      <div class="sch-detail-section">
        <h4>体験申込 (${trials.length}件)</h4>
        ${trialRows}
      </div>

      <div class="sch-detail-section">
        <h4>入会申請 (${joins.length}件)</h4>
        ${joinRows}
      </div>

      <div class="sch-detail-section">
        <h4>退会申請 (${withdrawals.length}件)</h4>
        ${withdrawalRows}
      </div>
    </div>`;

  openModal('スケジュール詳細', content);
  setModalWide(false);
}

// --- Navigation ---

export function navigateSchedule(offset) {
  switch (currentView) {
    case 'day':
      currentDate.setDate(currentDate.getDate() + offset);
      break;
    case 'week':
      currentDate.setDate(currentDate.getDate() + offset * 7);
      break;
    case 'month':
      currentDate.setMonth(currentDate.getMonth() + offset);
      break;
    case 'year':
      currentDate.setFullYear(currentDate.getFullYear() + offset);
      break;
  }
  renderSchedule();
}

export function goToScheduleToday() {
  currentDate = new Date();
  renderSchedule();
}

export function refreshSchedule() {
  cachedScheduleEvents = {};
  cachedAppData = null;
  allFetchedEvents = [];
  renderSchedule();
}

export function changeScheduleView(view) {
  if (currentView === view) return;
  currentView = view;
  renderSchedule();
}

export function navigateScheduleToDate(dateStr, view) {
  currentDate = new Date(dateStr + 'T00:00:00');
  if (view) currentView = view;
  renderSchedule();
}

// --- Helpers ---

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTimeRange(start, end) {
  return `${formatTime(start)}〜${formatTime(end)}`;
}

function formatTime(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getDateLabel(date, view) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dow = DAY_NAMES[date.getDay()];

  switch (view) {
    case 'day':
      return `${y}年${m}月${d}日（${dow}）`;
    case 'week': {
      const ws = getWeekStart(date);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      const wsm = ws.getMonth() + 1;
      const wem = we.getMonth() + 1;
      if (wsm === wem) {
        return `${ws.getFullYear()}年${wsm}月${ws.getDate()}日〜${we.getDate()}日`;
      }
      return `${ws.getFullYear()}年${wsm}月${ws.getDate()}日〜${wem}月${we.getDate()}日`;
    }
    case 'month':
      return `${y}年${m}月`;
    case 'year':
      return `${y}年`;
  }
}

function getDateRange(date, view) {
  switch (view) {
    case 'day':
      return { start: new Date(date), end: new Date(date) };
    case 'week': {
      const start = getWeekStart(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start, end };
    }
    case 'month': {
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return { start, end };
    }
    case 'year': {
      const start = new Date(date.getFullYear(), 0, 1);
      const end = new Date(date.getFullYear(), 11, 31);
      return { start, end };
    }
  }
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function statusLabel(status) {
  const labels = {
    pending: '未対応',
    reviewed: '確認済み',
    approved: '承認',
    rejected: '却下',
    enrolled: '入会済み',
  };
  return labels[status] || status;
}
