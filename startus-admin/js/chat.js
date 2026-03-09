// --- 業務チャット (Slack風UI) ---

import { supabase } from './supabase.js';
import { escapeHtml } from './utils.js';
import { showToast } from './app.js';
import { getStaffById, getStaffByEmail, getAllActiveStaff } from './staff.js';

// --- State ---

let currentView = 'channel-list'; // 'channel-list' | 'message-thread'
let currentChannelId = null;
let channels = [];
let messages = [];
let currentStaff = null;
let realtimeSubscription = null;
let unreadCounts = {};
let isOpen = false;
let pollTimer = null;

// --- Slack UI State ---

let sectionCollapsed = { channels: false, dms: false };
let dmPartnerNames = {};
let dmPartnerIds = {};

// --- Constants ---

const MESSAGE_LIMIT = 50;
const POLL_INTERVAL = 30000;

const AVATAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
];

// --- Avatar Helpers ---

function getInitials(name) {
  if (!name) return '?';
  const trimmed = name.trim();
  if (/^[a-zA-Z]/.test(trimmed)) {
    return trimmed.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  return trimmed.charAt(0);
}

function getAvatarColor(staffId) {
  if (!staffId) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < staffId.length; i++) {
    hash = staffId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function renderAvatar(staffId, size = 32) {
  const staff = getStaffById(staffId);
  const name = staff ? staff.name : '?';
  const initials = getInitials(name);
  const color = getAvatarColor(staffId);
  const fontSize = size <= 24 ? '0.65rem' : '0.8rem';
  return `<div class="chat-avatar" style="width:${size}px;height:${size}px;background:${color};font-size:${fontSize}">${escapeHtml(initials)}</div>`;
}

// --- Date Helpers ---

function formatDateSeparator(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - msgDay) / 86400000);

  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];

  if (y === now.getFullYear()) return `${m}月${dd}日（${weekday}）`;
  return `${y}年${m}月${dd}日（${weekday}）`;
}

function formatChatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');

  if (isToday) return `${hh}:${mm}`;

  const m = d.getMonth() + 1;
  const dd = d.getDate();
  return `${m}/${dd} ${hh}:${mm}`;
}

// --- Message Grouping ---

function groupMessages(msgs) {
  if (!msgs || msgs.length === 0) return [];

  const result = [];
  let prevSenderId = null;
  let prevDate = null;
  let prevTimestamp = null;

  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    const msgDate = new Date(msg.created_at);
    const dateStr = msgDate.toDateString();

    // Insert date separator if date changed
    if (dateStr !== prevDate) {
      result.push({
        type: 'date-separator',
        date: msg.created_at,
        label: formatDateSeparator(msg.created_at),
      });
      prevSenderId = null;
    }

    // System and task messages always break grouping
    if (msg.message_type === 'system' || msg.message_type === 'task') {
      result.push({ type: 'message', msg, grouped: false });
      prevSenderId = null;
      prevDate = dateStr;
      prevTimestamp = msgDate;
      continue;
    }

    // Group: same sender, same date, within 5 minutes
    const timeDiff = prevTimestamp ? (msgDate - prevTimestamp) / 60000 : Infinity;
    const isGrouped = (
      msg.sender_id === prevSenderId &&
      dateStr === prevDate &&
      timeDiff < 5
    );

    result.push({ type: 'message', msg, grouped: isGrouped });

    prevSenderId = msg.sender_id;
    prevDate = dateStr;
    prevTimestamp = msgDate;
  }

  return result;
}

// --- Section Collapse ---

function loadSectionState() {
  try {
    const saved = localStorage.getItem('chat-section-collapsed');
    if (saved) sectionCollapsed = JSON.parse(saved);
  } catch (e) { /* ignore */ }
}

function toggleSection(key) {
  sectionCollapsed[key] = !sectionCollapsed[key];
  localStorage.setItem('chat-section-collapsed', JSON.stringify(sectionCollapsed));
  renderChannelList();
}

// --- Init / Destroy ---

export async function initChat(staffInfo) {
  currentStaff = staffInfo;
  if (!currentStaff) {
    console.warn('initChat: スタッフ情報がありません');
    return;
  }

  loadSectionState();
  console.log('initChat: 開始', currentStaff.id, currentStaff.name);
  await loadChannels();
  console.log('initChat: loadChannels後', channels.length, '件');
  await ensureSelfChannel();
  console.log('initChat: ensureSelfChannel後', channels.length, '件');
  await ensureGroupMembership();
  console.log('initChat: ensureGroupMembership後', channels.length, '件');
  await loadUnreadCounts();
  updateUnreadBadge();
  subscribeRealtime();
}

export function destroyChat() {
  unsubscribeRealtime();
  stopPollingFallback();
  currentStaff = null;
  channels = [];
  messages = [];
  unreadCounts = {};
  isOpen = false;
}

// --- Toggle Sidebar ---

export function toggleChat() {
  isOpen = !isOpen;
  const sidebar = document.getElementById('chat-sidebar');
  const overlay = document.getElementById('chat-sidebar-overlay');
  const fab = document.getElementById('chat-fab');

  if (sidebar) sidebar.classList.toggle('open', isOpen);
  if (overlay) overlay.classList.toggle('active', isOpen);
  if (fab) fab.classList.toggle('chat-fab-hidden', isOpen);

  if (isOpen) {
    if (currentView === 'channel-list') {
      renderChannelList();
    } else {
      renderMessageThread();
    }
  }
}

// --- Channel Navigation ---

export async function openChannel(channelId) {
  currentChannelId = channelId;
  currentView = 'message-thread';
  await loadMessages(channelId);
  await markAsRead(channelId);
  unreadCounts[channelId] = 0;
  updateUnreadBadge();
  renderMessageThread();
  scrollToBottom();
}

export function backToChannelList() {
  currentView = 'channel-list';
  currentChannelId = null;
  messages = [];
  loadChannels().then(() => {
    loadUnreadCounts().then(() => {
      renderChannelList();
      updateUnreadBadge();
    });
  });
}

// --- Send Message ---

export async function sendMessage() {
  if (!currentStaff || !currentChannelId) return;

  const input = document.getElementById('chat-message-input');
  if (!input) return;

  const body = input.value.trim();
  if (!body) return;

  input.value = '';
  input.style.height = 'auto';
  input.focus();

  const { data: inserted, error } = await supabase.from('chat_messages').insert({
    channel_id: currentChannelId,
    sender_id: currentStaff.id,
    message_type: 'text',
    body,
  }).select().single();

  if (error) {
    console.error('メッセージ送信エラー:', error);
    showToast('送信に失敗しました', 'error');
    input.value = body;
    return;
  }

  if (inserted && !messages.find(m => m.id === inserted.id)) {
    messages.push(inserted);
    appendMessageToThread(inserted);
    scrollToBottom();
    markAsRead(currentChannelId);
  }
}

export async function sendTaskMessage(targetStaffId, refType, refId, refLabel, body) {
  if (!currentStaff) return;

  let channelId;
  if (targetStaffId) {
    channelId = await ensureDmChannel(targetStaffId);
  } else {
    const group = channels.find(c => c.slug === 'jimukyoku');
    if (!group) return;
    channelId = group.id;
  }

  if (!channelId) return;

  const { error } = await supabase.from('chat_messages').insert({
    channel_id: channelId,
    sender_id: currentStaff.id,
    message_type: 'task',
    body,
    metadata: { ref_type: refType, ref_id: refId, ref_label: refLabel, action: 'assign' },
  });

  if (error) {
    console.error('タスクメッセージ送信エラー:', error);
  }
}

// --- Open Reference from Chat ---

export function openRefFromChat(refType, refId) {
  if (refType === 'application') {
    window.memberApp.showApplicationDetail(refId);
  } else if (refType === 'trial') {
    window.memberApp.showTrialDetail(refId);
  }
}

// --- Open DM with Staff ---

export async function openDmWithStaff(staffId) {
  const channelId = await ensureDmChannel(staffId);
  if (channelId) {
    if (!isOpen) toggleChat();
    await openChannel(channelId);
  }
}

// --- Data Loading ---

async function loadChannels() {
  if (!currentStaff) return;

  const { data: memberships, error: memErr } = await supabase
    .from('chat_channel_members')
    .select('channel_id')
    .eq('staff_id', currentStaff.id);

  if (memErr) {
    console.error('chat_channel_members 取得エラー:', memErr);
    channels = [];
    return;
  }

  if (!memberships || memberships.length === 0) {
    channels = [];
    return;
  }

  const channelIds = memberships.map(m => m.channel_id);

  const { data, error: chErr } = await supabase
    .from('chat_channels')
    .select('*')
    .in('id', channelIds)
    .order('created_at', { ascending: true });

  if (chErr) {
    console.error('chat_channels 取得エラー:', chErr);
  }
  channels = data || [];

  await loadDmPartnerNames();
}

async function loadMessages(channelId) {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(MESSAGE_LIMIT);

  messages = data || [];
}

async function markAsRead(channelId) {
  if (!currentStaff) return;

  await supabase
    .from('chat_channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('staff_id', currentStaff.id);
}

export async function loadUnreadCounts() {
  if (!currentStaff) return;

  const { data: memberships } = await supabase
    .from('chat_channel_members')
    .select('channel_id, last_read_at')
    .eq('staff_id', currentStaff.id);

  if (!memberships) return;

  const counts = {};
  for (const m of memberships) {
    const { count } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', m.channel_id)
      .gt('created_at', m.last_read_at)
      .neq('sender_id', currentStaff.id);

    counts[m.channel_id] = count || 0;
  }

  unreadCounts = counts;
}

// --- Channel Management ---

async function ensureSelfChannel() {
  if (!currentStaff) return;

  const slug = `self-${currentStaff.id}`;
  const existing = channels.find(c => c.slug === slug);
  if (existing) return;

  const { data: existingChannel, error: selfErr } = await supabase
    .from('chat_channels')
    .select('id')
    .eq('slug', slug)
    .single();

  if (selfErr && selfErr.code !== 'PGRST116') {
    console.error('self channel 検索エラー:', selfErr);
  }

  let channelId;
  if (existingChannel) {
    channelId = existingChannel.id;
  } else {
    const { data: newChannel } = await supabase
      .from('chat_channels')
      .insert({ type: 'self', name: '自分メモ', slug, created_by: currentStaff.id })
      .select()
      .single();

    if (!newChannel) return;
    channelId = newChannel.id;
  }

  await supabase.from('chat_channel_members').upsert({
    channel_id: channelId,
    staff_id: currentStaff.id,
  }, { onConflict: 'channel_id,staff_id' });

  await loadChannels();
}

async function ensureGroupMembership() {
  if (!currentStaff) return;

  const { data: groupChannel, error: grpErr } = await supabase
    .from('chat_channels')
    .select('id')
    .eq('slug', 'jimukyoku')
    .single();

  if (grpErr) {
    console.error('jimukyoku channel 検索エラー:', grpErr);
  }
  if (!groupChannel) return;

  await supabase.from('chat_channel_members').upsert({
    channel_id: groupChannel.id,
    staff_id: currentStaff.id,
  }, { onConflict: 'channel_id,staff_id' });

  await loadChannels();
}

async function ensureDmChannel(otherStaffId) {
  if (!currentStaff || otherStaffId === currentStaff.id) return null;

  const myDms = channels.filter(c => c.type === 'dm');
  for (const dm of myDms) {
    const { data: otherMember } = await supabase
      .from('chat_channel_members')
      .select('staff_id')
      .eq('channel_id', dm.id)
      .eq('staff_id', otherStaffId)
      .single();

    if (otherMember) return dm.id;
  }

  const { data: newChannel } = await supabase
    .from('chat_channels')
    .insert({
      type: 'dm',
      name: '',
      slug: '',
      created_by: currentStaff.id,
    })
    .select()
    .single();

  if (!newChannel) return null;

  await supabase.from('chat_channel_members').insert([
    { channel_id: newChannel.id, staff_id: currentStaff.id },
    { channel_id: newChannel.id, staff_id: otherStaffId },
  ]);

  await loadChannels();
  return newChannel.id;
}

// --- DM Partner Cache ---

async function loadDmPartnerNames() {
  if (!currentStaff) return;
  const dmChannels = channels.filter(c => c.type === 'dm');

  for (const ch of dmChannels) {
    const { data: members } = await supabase
      .from('chat_channel_members')
      .select('staff_id')
      .eq('channel_id', ch.id)
      .neq('staff_id', currentStaff.id);

    if (members && members.length > 0) {
      const partner = getStaffById(members[0].staff_id);
      dmPartnerNames[ch.id] = partner ? partner.name : '不明';
      dmPartnerIds[ch.id] = members[0].staff_id;
    }
  }
}

function getChannelDisplayName(ch) {
  if (ch.type === 'group') return ch.name || 'グループ';
  if (ch.type === 'self') return '自分メモ';
  if (ch.type === 'dm') return dmPartnerNames[ch.id] || 'DM';
  return ch.name || 'チャット';
}

// --- Realtime ---

function subscribeRealtime() {
  unsubscribeRealtime();

  realtimeSubscription = supabase
    .channel('chat-messages-rt')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
    }, handleNewMessage)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        stopPollingFallback();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Chat realtime failed, using polling fallback');
        startPollingFallback();
      }
    });
}

function unsubscribeRealtime() {
  if (realtimeSubscription) {
    supabase.removeChannel(realtimeSubscription);
    realtimeSubscription = null;
  }
}

function handleNewMessage(payload) {
  const msg = payload.new;
  if (!msg || !currentStaff) return;

  const myChannelIds = channels.map(c => c.id);
  if (!myChannelIds.includes(msg.channel_id)) {
    loadChannels().then(() => {
      const ids = channels.map(c => c.id);
      if (ids.includes(msg.channel_id)) {
        unreadCounts[msg.channel_id] = (unreadCounts[msg.channel_id] || 0) + 1;
        updateUnreadBadge();
        if (currentView === 'channel-list' && isOpen) renderChannelList();
      }
    });
    return;
  }

  if (msg.channel_id === currentChannelId && isOpen) {
    if (messages.find(m => m.id === msg.id)) return;
    messages.push(msg);
    appendMessageToThread(msg);
    scrollToBottom();
    markAsRead(msg.channel_id);
  } else {
    if (msg.sender_id !== currentStaff.id) {
      unreadCounts[msg.channel_id] = (unreadCounts[msg.channel_id] || 0) + 1;
      updateUnreadBadge();
    }
    if (currentView === 'channel-list' && isOpen) renderChannelList();
  }
}

// --- Polling Fallback ---

function startPollingFallback() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    await loadUnreadCounts();
    updateUnreadBadge();
    if (isOpen && currentView === 'message-thread' && currentChannelId) {
      await loadMessages(currentChannelId);
      renderMessageThread();
    }
  }, POLL_INTERVAL);
}

function stopPollingFallback() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ===== Rendering: Channel List (Slack-style) =====

function renderChannelList() {
  const body = document.getElementById('chat-sidebar-body');
  const title = document.getElementById('chat-sidebar-title');
  const backBtn = document.getElementById('chat-back-btn');
  if (!body) return;
  if (title) title.textContent = 'チャット';
  if (backBtn) backBtn.style.display = 'none';

  const selfChannel = channels.find(c => c.type === 'self');
  const groupChannels = channels.filter(c => c.type === 'group');
  const dmChannels = channels.filter(c => c.type === 'dm');

  let html = '';

  // 1. Pinned self-memo
  if (selfChannel) {
    const unread = unreadCounts[selfChannel.id] || 0;
    html += `
      <div class="chat-pinned-item ${currentChannelId === selfChannel.id ? 'chat-channel-active' : ''} ${unread > 0 ? 'chat-channel-unread' : ''}"
           onclick="window.memberApp.chatOpenChannel('${selfChannel.id}')">
        <span class="material-icons" style="font-size:18px;color:var(--gray-400)">bookmark</span>
        <span class="chat-channel-name">自分メモ</span>
        ${unread > 0 ? `<span class="chat-unread-dot">${unread}</span>` : ''}
      </div>`;
  }

  // 2. Channels section
  html += renderSection('channels', 'チャンネル', groupChannels);

  // 3. DM section (with + button)
  html += renderSection('dms', 'ダイレクトメッセージ', dmChannels, true);

  body.innerHTML = `<div class="chat-channel-list">${html}</div>`;
}

function renderSection(key, label, items, showAddBtn = false) {
  const collapsed = sectionCollapsed[key];
  const chevron = collapsed ? 'chevron_right' : 'expand_more';

  const addBtnHtml = showAddBtn
    ? `<button class="chat-new-dm-btn" onclick="event.stopPropagation();window.memberApp.chatShowNewDmPicker()" title="新しいメッセージ">
        <span class="material-icons">add</span>
      </button>`
    : '';

  const itemsHtml = items.map(ch => {
    const unread = unreadCounts[ch.id] || 0;
    const displayName = getChannelDisplayName(ch);
    const isActive = ch.id === currentChannelId;

    if (ch.type === 'group') {
      return `
        <div class="chat-channel-item ${isActive ? 'chat-channel-active' : ''} ${unread > 0 ? 'chat-channel-unread' : ''}"
             onclick="window.memberApp.chatOpenChannel('${ch.id}')">
          <span class="chat-channel-hash">#</span>
          <span class="chat-channel-name">${escapeHtml(displayName)}</span>
          ${unread > 0 ? `<span class="chat-unread-dot">${unread}</span>` : ''}
        </div>`;
    } else {
      const partnerId = dmPartnerIds[ch.id];
      return `
        <div class="chat-channel-item ${isActive ? 'chat-channel-active' : ''} ${unread > 0 ? 'chat-channel-unread' : ''}"
             onclick="window.memberApp.chatOpenChannel('${ch.id}')">
          ${renderAvatar(partnerId, 24)}
          <span class="chat-channel-name">${escapeHtml(displayName)}</span>
          ${unread > 0 ? `<span class="chat-unread-dot">${unread}</span>` : ''}
        </div>`;
    }
  }).join('');

  return `
    <div class="chat-section">
      <div class="chat-section-header ${collapsed ? 'collapsed' : ''}"
           onclick="window.memberApp.chatToggleSection('${key}')">
        <span class="material-icons chat-section-chevron">${chevron}</span>
        <span class="chat-section-label">${label}</span>
        ${addBtnHtml}
      </div>
      <div class="chat-section-items ${collapsed ? 'collapsed' : ''}">
        ${itemsHtml || '<div class="chat-section-empty">なし</div>'}
      </div>
    </div>`;
}

// ===== Rendering: Message Thread (Slack-style) =====

function renderMessageThread() {
  const body = document.getElementById('chat-sidebar-body');
  const title = document.getElementById('chat-sidebar-title');
  const backBtn = document.getElementById('chat-back-btn');
  if (!body) return;

  const channel = channels.find(c => c.id === currentChannelId);
  const channelName = channel ? getChannelDisplayName(channel) : 'チャット';
  if (title) title.textContent = channelName;
  if (backBtn) backBtn.style.display = '';

  // Group messages
  const grouped = groupMessages(messages);

  const messagesHtml = grouped.map(item => {
    if (item.type === 'date-separator') {
      return `<div class="chat-date-separator"><span>${escapeHtml(item.label)}</span></div>`;
    }
    return renderSlackMessage(item.msg, item.grouped);
  }).join('');

  const placeholder = channel
    ? `メッセージを送信 ${channel.type === 'group' ? '#' : ''}${channelName}`
    : 'メッセージを入力...';

  body.innerHTML = `
    <div class="chat-thread-container">
      <div class="chat-messages-scroll" id="chat-messages-scroll">
        ${messagesHtml || '<div class="chat-empty">メッセージがありません</div>'}
      </div>
      <div class="chat-input-area">
        <div class="chat-input-container">
          <textarea id="chat-message-input" class="chat-input" rows="1"
            placeholder="${escapeHtml(placeholder)}"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.memberApp.chatSendMessage()}"></textarea>
          <button class="chat-send-btn" onclick="window.memberApp.chatSendMessage()">
            <span class="material-icons">send</span>
          </button>
        </div>
      </div>
    </div>`;

  // Auto-resize textarea
  const textarea = document.getElementById('chat-message-input');
  if (textarea) {
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    });
  }

  scrollToBottom();
}

// --- Slack-style Message Rendering ---

function renderSlackMessage(msg, isGrouped) {
  if (msg.message_type === 'system') return renderSystemDivider(msg);
  if (msg.message_type === 'task') return renderTaskCard(msg);

  const sender = getStaffById(msg.sender_id);
  const senderName = sender ? sender.name : '不明';
  const time = formatChatTime(msg.created_at);

  if (isGrouped) {
    return `
      <div class="chat-msg chat-msg--grouped">
        <div class="chat-msg-avatar-spacer"></div>
        <div class="chat-msg-content">
          <div class="chat-msg-body">${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div>
        </div>
        <span class="chat-msg-hover-time">${time}</span>
      </div>`;
  }

  return `
    <div class="chat-msg">
      <div class="chat-msg-avatar">${renderAvatar(msg.sender_id, 36)}</div>
      <div class="chat-msg-content">
        <div class="chat-msg-header">
          <span class="chat-msg-sender">${escapeHtml(senderName)}</span>
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-body">${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div>
      </div>
    </div>`;
}

function renderTaskCard(msg) {
  const meta = msg.metadata || {};
  const sender = getStaffById(msg.sender_id);
  const senderName = sender ? sender.name : '不明';
  const time = formatChatTime(msg.created_at);
  const refLabel = meta.ref_label || '';
  const refType = meta.ref_type || '';
  const refId = meta.ref_id || '';

  return `
    <div class="chat-msg">
      <div class="chat-msg-avatar">${renderAvatar(msg.sender_id, 36)}</div>
      <div class="chat-msg-content">
        <div class="chat-msg-header">
          <span class="chat-msg-sender">${escapeHtml(senderName)}</span>
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-task-card">
          <div class="chat-task-header">
            <span class="material-icons" style="font-size:18px;color:var(--primary-color)">assignment</span>
            <span class="chat-task-label">${escapeHtml(refLabel)}</span>
          </div>
          <div class="chat-task-body">${escapeHtml(msg.body)}</div>
          ${refType && refId ? `
            <button class="btn btn-secondary chat-task-btn"
                    onclick="window.memberApp.openRefFromChat('${escapeHtml(refType)}', '${escapeHtml(refId)}')">
              <span class="material-icons" style="font-size:16px">open_in_new</span>詳細を開く
            </button>` : ''}
        </div>
      </div>
    </div>`;
}

function renderSystemDivider(msg) {
  return `
    <div class="chat-system-divider">
      <span>${escapeHtml(msg.body)}</span>
    </div>`;
}

// --- Append Message (Realtime) ---

function appendMessageToThread(msg) {
  const scroll = document.getElementById('chat-messages-scroll');
  if (!scroll) return;

  const empty = scroll.querySelector('.chat-empty');
  if (empty) empty.remove();

  // Check if date separator needed
  const prevMsg = messages.length >= 2 ? messages[messages.length - 2] : null;
  const msgDate = new Date(msg.created_at);
  const prevDate = prevMsg ? new Date(prevMsg.created_at) : null;

  if (!prevDate || msgDate.toDateString() !== prevDate.toDateString()) {
    const sep = document.createElement('div');
    sep.className = 'chat-date-separator';
    sep.innerHTML = `<span>${escapeHtml(formatDateSeparator(msg.created_at))}</span>`;
    scroll.appendChild(sep);
  }

  // Determine if grouped
  let isGrouped = false;
  if (prevMsg &&
      msg.message_type === 'text' &&
      prevMsg.message_type === 'text' &&
      msg.sender_id === prevMsg.sender_id &&
      msgDate.toDateString() === (prevDate ? prevDate.toDateString() : '') &&
      prevDate && (msgDate - prevDate) / 60000 < 5) {
    isGrouped = true;
  }

  const div = document.createElement('div');
  div.innerHTML = renderSlackMessage(msg, isGrouped);
  const msgEl = div.firstElementChild;
  if (msgEl) scroll.appendChild(msgEl);
}

function scrollToBottom() {
  setTimeout(() => {
    const scroll = document.getElementById('chat-messages-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, 50);
}

// --- Unread Badge ---

export function updateUnreadBadge() {
  const badge = document.getElementById('chat-unread-badge');
  if (!badge) return;

  const total = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// --- New DM Picker ---

function showNewDmPicker() {
  const body = document.getElementById('chat-sidebar-body');
  if (!body) return;

  // Remove existing picker
  const existing = document.getElementById('chat-dm-modal');
  if (existing) { existing.remove(); return; }

  const allStaff = getAllActiveStaff();
  const existingPartnerIds = Object.values(dmPartnerIds);

  const staffItems = allStaff
    .filter(s => s.id !== currentStaff?.id)
    .map(s => {
      const hasDm = existingPartnerIds.includes(s.id);
      return `
        <div class="chat-dm-picker-item" onclick="window.memberApp.chatStartDm('${s.id}')">
          ${renderAvatar(s.id, 32)}
          <span class="chat-dm-picker-name">${escapeHtml(s.name)}</span>
          ${hasDm ? '<span class="material-icons" style="font-size:14px;color:var(--gray-400)">chat</span>' : ''}
        </div>`;
    }).join('');

  const picker = document.createElement('div');
  picker.className = 'chat-dm-modal';
  picker.id = 'chat-dm-modal';
  picker.innerHTML = `
    <div class="chat-dm-modal-header">
      <span>新しいメッセージ</span>
      <button class="btn-icon" onclick="window.memberApp.chatHideNewDmPicker()">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="chat-dm-modal-body">
      ${staffItems || '<div class="chat-empty">スタッフがいません</div>'}
    </div>`;

  body.appendChild(picker);
}

function hideNewDmPicker() {
  const picker = document.getElementById('chat-dm-modal');
  if (picker) picker.remove();
}

async function startDm(staffId) {
  hideNewDmPicker();
  await openDmWithStaff(staffId);
}

// --- Exported aliases for window.memberApp ---

export const chatOpenChannel = (id) => openChannel(id);
export const chatBackToList = () => backToChannelList();
export const chatSendMessage = () => sendMessage();
export const chatToggleSection = (key) => toggleSection(key);
export const chatShowNewDmPicker = () => showNewDmPicker();
export const chatHideNewDmPicker = () => hideNewDmPicker();
export const chatStartDm = (staffId) => startDm(staffId);
