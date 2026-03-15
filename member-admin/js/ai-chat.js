// --- AIアシスタント チャット ---

import { supabase } from './supabase.js';
import { escapeHtml } from './utils.js';
import { showToast } from './app.js';

// --- State ---

let aiMessages = []; // { role: 'user'|'assistant', content: string }
let currentStaff = null;
let isLoading = false;
let feedbackList = []; // 収集済みフィードバック

// --- Init ---

export function initAiChat(staffInfo) {
  currentStaff = staffInfo;
}

// --- Render ---

export function renderAiChat() {
  const body = document.getElementById('chat-sidebar-body');
  const title = document.getElementById('chat-sidebar-title');
  if (!body) return;
  if (title) title.textContent = 'AI アシスタント';

  const messagesHtml = aiMessages.length === 0
    ? renderWelcome()
    : aiMessages.map(msg => renderAiMessage(msg)).join('');

  body.innerHTML = `
    <div class="chat-thread-container">
      <div class="chat-thread-header">
        <button class="btn-icon" onclick="window.memberApp.aiChatBack()">
          <span class="material-icons">arrow_back</span>
        </button>
        <span class="chat-thread-title">
          <span class="material-icons" style="font-size:18px;color:#8b5cf6;vertical-align:middle">smart_toy</span>
          AI アシスタント
        </span>
      </div>
      <div class="chat-messages-scroll" id="chat-messages-scroll">
        ${messagesHtml}
        ${isLoading ? renderTypingIndicator() : ''}
      </div>
      <div class="chat-input-area">
        <textarea id="chat-message-input" class="chat-input" rows="1"
          placeholder="不具合や改善したいことを入力..."
          ${isLoading ? 'disabled' : ''}
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.memberApp.aiChatSend()}"></textarea>
        <button class="chat-send-btn" onclick="window.memberApp.aiChatSend()" ${isLoading ? 'disabled' : ''}>
          <span class="material-icons">send</span>
        </button>
      </div>
    </div>`;

  scrollToBottom();
}

function renderWelcome() {
  return `
    <div class="ai-chat-welcome">
      <span class="material-icons" style="font-size:48px;color:#8b5cf6">smart_toy</span>
      <h4>AI アシスタント</h4>
      <p>アプリの不具合や改善したい点を教えてください。<br>
      詳しくお聞きして、開発者に報告します。</p>
      <div class="ai-chat-suggestions">
        <button class="ai-suggest-btn" onclick="window.memberApp.aiChatSuggest('不具合を報告したい')">
          <span class="material-icons">bug_report</span>不具合を報告
        </button>
        <button class="ai-suggest-btn" onclick="window.memberApp.aiChatSuggest('改善してほしいことがある')">
          <span class="material-icons">lightbulb</span>改善要望
        </button>
        <button class="ai-suggest-btn" onclick="window.memberApp.aiChatSuggest('使い方がわからない')">
          <span class="material-icons">help</span>使い方の質問
        </button>
      </div>
    </div>`;
}

function renderAiMessage(msg) {
  const isUser = msg.role === 'user';
  return `
    <div class="chat-message ${isUser ? 'chat-message-self' : 'chat-message-other ai-chat-msg'}">
      ${!isUser ? '<div class="chat-message-sender"><span class="material-icons" style="font-size:14px;vertical-align:middle;color:#8b5cf6">smart_toy</span> AI</div>' : ''}
      <div class="chat-bubble ${!isUser ? 'ai-chat-bubble' : ''}">
        <div class="chat-bubble-text">${formatAiText(msg.content)}</div>
      </div>
    </div>`;
}

function renderTypingIndicator() {
  return `
    <div class="chat-message chat-message-other ai-chat-msg">
      <div class="chat-message-sender"><span class="material-icons" style="font-size:14px;vertical-align:middle;color:#8b5cf6">smart_toy</span> AI</div>
      <div class="chat-bubble ai-chat-bubble">
        <div class="ai-typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>`;
}

function formatAiText(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// --- Send Message ---

export async function sendAiMessage(text) {
  if (!text || isLoading) return;

  const userMsg = text.trim();
  if (!userMsg) return;

  // ユーザーメッセージを追加
  aiMessages.push({ role: 'user', content: userMsg });
  isLoading = true;
  renderAiChat();

  try {
    // API呼び出し
    const apiMessages = aiMessages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiMessages,
        staffName: currentStaff?.name || '職員',
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // AI返答を追加
    aiMessages.push({ role: 'assistant', content: data.reply });

    // フィードバックが構造化されていればDBに保存
    if (data.feedback) {
      await saveFeedback(data.feedback);
    }

  } catch (err) {
    console.error('AI chat error:', err);
    aiMessages.push({
      role: 'assistant',
      content: '申し訳ございません。一時的にAIに接続できませんでした。もう一度お試しください。',
    });
  } finally {
    isLoading = false;
    renderAiChat();
  }
}

export function aiChatSend() {
  const input = document.getElementById('chat-message-input');
  if (!input) return;
  const text = input.value;
  input.value = '';
  sendAiMessage(text);
}

export function aiChatSuggest(text) {
  sendAiMessage(text);
}

// --- Save Feedback ---

async function saveFeedback(feedback) {
  try {
    const { error } = await supabase.from('ai_feedback').insert({
      staff_id: currentStaff?.id || null,
      staff_name: currentStaff?.name || '不明',
      category: feedback.category,
      summary: feedback.summary,
      screen: feedback.screen || '',
      details: feedback.details || '',
      priority: feedback.priority || 'medium',
      conversation: aiMessages.slice(-10), // 直近10件の会話を保存
    });

    if (error) {
      console.error('Feedback save error:', error);
    } else {
      feedbackList.push(feedback);
      showToast('フィードバックを記録しました。ありがとうございます！', 'success');
    }
  } catch (err) {
    console.error('Feedback save error:', err);
  }
}

// --- Navigation ---

export function aiChatBack() {
  // チャンネルリストに戻る
  const { backToChannelList } = window._chatNav || {};
  if (backToChannelList) {
    backToChannelList();
  }
}

// --- Reset ---

export function resetAiChat() {
  aiMessages = [];
  feedbackList = [];
  isLoading = false;
}

// --- Helpers ---

function scrollToBottom() {
  setTimeout(() => {
    const scroll = document.getElementById('chat-messages-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, 50);
}
