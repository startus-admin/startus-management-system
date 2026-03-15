// --- 業務チャット ---

import { supabase } from './supabase.js';
import { escapeHtml } from './utils.js';
import { showToast } from './app.js';
import { getStaffById, getStaffByEmail } from './staff.js';
import { initAiChat, renderAiChat, aiChatBack } from './ai-chat.js';

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

// --- Constants ---

const MESSAGE_LIMIT = 50;
const POLL_INTERVAL = 30000;

const CHANNEL_ICONS = {
  group: 'groups',
  self: 'note',
  dm: 'person',
};

// --- Init / Destroy ---

export async function initChat(staffInfo) {
  currentStaff = staffInfo;
  if (!currentStaff) {
    console.warn('initChat: スタッフ情報がありません');
    return;
  }

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

  // AIチャット初期化
  initAiChat(currentStaff);

  // チャンネルリストに戻る関数をAIチャットに公開
  window._chatNav = { backToChannelList };
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

  // 送信成功 → 即座に画面に表示（Realtime を待たない）
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
    // グループチャンネルに送信
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

  // DM チャンネルの相手名を読み込む
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

  // Check if channel exists but user not a member
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

  // Add self as member
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

  // Search existing DM channels
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

  // Create new DM channel
  const otherStaff = getStaffById(otherStaffId);
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

  // Check if this message belongs to a channel we're in
  const myChannelIds = channels.map(c => c.id);
  if (!myChannelIds.includes(msg.channel_id)) {
    // Might be a new DM channel — reload channels
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
    // Currently viewing this channel — 重複チェック
    if (messages.find(m => m.id === msg.id)) return;
    messages.push(msg);
    appendMessageToThread(msg);
    scrollToBottom();
    markAsRead(msg.channel_id);
  } else {
    // Different channel — increment unread
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

// --- Rendering: Channel List ---

function renderChannelList() {
  const body = document.getElementById('chat-sidebar-body');
  const title = document.getElementById('chat-sidebar-title');
  if (!body) return;
  if (title) title.textContent = 'チャット';

  // Sort: group first, then self, then DM
  const typeOrder = { group: 0, self: 1, dm: 2 };
  const sorted = [...channels].sort((a, b) => (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9));

  const items = sorted.map(ch => {
    const unread = unreadCounts[ch.id] || 0;
    const icon = CHANNEL_ICONS[ch.type] || 'chat';
    const displayName = getChannelDisplayName(ch);

    return `
      <div class="chat-channel-item ${unread > 0 ? 'chat-channel-unread' : ''}"
           onclick="window.memberApp.chatOpenChannel('${ch.id}')">
        <span class="material-icons chat-channel-icon">${icon}</span>
        <div class="chat-channel-info">
          <div class="chat-channel-name">${escapeHtml(displayName)}</div>
        </div>
        ${unread > 0 ? `<span class="chat-unread-dot">${unread}</span>` : ''}
      </div>`;
  }).join('');

  // AIアシスタントチャンネル（常に先頭に表示）
  const aiChannelItem = `
    <div class="chat-channel-item ai-channel-item"
         onclick="window.memberApp.openAiChat()">
      <span class="material-icons chat-channel-icon" style="color:#8b5cf6">smart_toy</span>
      <div class="chat-channel-info">
        <div class="chat-channel-name">AI アシスタント</div>
        <div class="chat-channel-desc">不具合・改善要望を報告</div>
      </div>
    </div>`;

  body.innerHTML = `
    <div class="chat-channel-list">
      ${aiChannelItem}
      ${items || ''}
    </div>`;
}

function getChannelDisplayName(ch) {
  if (ch.type === 'group') return ch.name || 'グループ';
  if (ch.type === 'self') return '自分メモ';
  if (ch.type === 'dm') {
    // Find the other person's name
    return getDmPartnerName(ch.id);
  }
  return ch.name || 'チャット';
}

function getDmPartnerName(channelId) {
  // We need to look up the other member — for now use a cached approach
  // This will be resolved when we fetch channel members
  return dmPartnerNames[channelId] || 'DM';
}

// Cache for DM partner names (populated during loadChannels)
let dmPartnerNames = {};

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
    }
  }
}

// --- Rendering: Message Thread ---

function renderMessageThread() {
  const body = document.getElementById('chat-sidebar-body');
  const title = document.getElementById('chat-sidebar-title');
  if (!body) return;

  const channel = channels.find(c => c.id === currentChannelId);
  const channelName = channel ? getChannelDisplayName(channel) : 'チャット';
  if (title) title.textContent = channelName;

  const messagesHtml = messages.map(msg => renderMessage(msg)).join('');

  body.innerHTML = `
    <div class="chat-thread-container">
      <div class="chat-thread-header">
        <button class="btn-icon" onclick="window.memberApp.chatBackToList()">
          <span class="material-icons">arrow_back</span>
        </button>
        <span class="chat-thread-title">${escapeHtml(channelName)}</span>
      </div>
      <div class="chat-messages-scroll" id="chat-messages-scroll">
        ${messagesHtml || '<div class="chat-empty">メッセージがありません</div>'}
      </div>
      <div class="chat-input-area">
        <textarea id="chat-message-input" class="chat-input" rows="1"
          placeholder="メッセージを入力..."
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.memberApp.chatSendMessage()}"></textarea>
        <button class="chat-send-btn" onclick="window.memberApp.chatSendMessage()">
          <span class="material-icons">send</span>
        </button>
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

function renderMessage(msg) {
  if (msg.message_type === 'system') return renderSystemMessage(msg);
  if (msg.message_type === 'task') return renderTaskMessage(msg);

  const isSelf = msg.sender_id === currentStaff?.id;
  const sender = getStaffById(msg.sender_id);
  const senderName = sender ? sender.name : '不明';
  const time = formatChatTime(msg.created_at);

  return `
    <div class="chat-message ${isSelf ? 'chat-message-self' : 'chat-message-other'}">
      ${!isSelf ? `<div class="chat-message-sender">${escapeHtml(senderName)}</div>` : ''}
      <div class="chat-bubble">
        <div class="chat-bubble-text">${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div>
        <div class="chat-bubble-time">${time}</div>
      </div>
    </div>`;
}

function renderTaskMessage(msg) {
  const meta = msg.metadata || {};
  const sender = getStaffById(msg.sender_id);
  const senderName = sender ? sender.name : '不明';
  const time = formatChatTime(msg.created_at);
  const refLabel = meta.ref_label || '';
  const refType = meta.ref_type || '';
  const refId = meta.ref_id || '';

  return `
    <div class="chat-message chat-message-other">
      <div class="chat-message-sender">${escapeHtml(senderName)}</div>
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
        <div class="chat-bubble-time">${time}</div>
      </div>
    </div>`;
}

function renderSystemMessage(msg) {
  const time = formatChatTime(msg.created_at);
  return `
    <div class="chat-message chat-message-system">
      <div class="chat-system-text">${escapeHtml(msg.body)}</div>
      <div class="chat-bubble-time">${time}</div>
    </div>`;
}

function appendMessageToThread(msg) {
  const scroll = document.getElementById('chat-messages-scroll');
  if (!scroll) return;

  // Remove empty state if present
  const empty = scroll.querySelector('.chat-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.innerHTML = renderMessage(msg);
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

// --- Helpers ---

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

// --- AI Chat ---

export function openAiChat() {
  currentView = 'ai-chat';
  currentChannelId = null;
  renderAiChat();
}

// --- Exported aliases for window.memberApp ---

export const chatOpenChannel = (id) => openChannel(id);
export const chatBackToList = () => backToChannelList();
export const chatSendMessage = () => sendMessage();

