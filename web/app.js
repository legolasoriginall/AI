const els = {
  chatList: document.getElementById('chat-list'),
  messages: document.getElementById('messages'),
  welcome: document.getElementById('welcome'),
  input: document.getElementById('input'),
  composer: document.getElementById('composer'),
  send: document.getElementById('send'),
  stop: document.getElementById('stop'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  providerLabel: document.getElementById('provider-label'),
  modelLabel: document.getElementById('model-label'),
  sidebar: document.getElementById('sidebar'),
  overlay: document.getElementById('settings-overlay'),
};

let currentChatId = null;
let controller = null;

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

function renderMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre dir="ltr"><code>${code.replace(/\n$/, '')}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code dir="ltr">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return html.replace(/\n/g, '<br>');
}

function scrollDown() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function addMessage(role, text) {
  els.welcome?.classList.add('hidden');
  const row = document.createElement('div');
  row.className = `msg ${role}`;
  row.innerHTML = `
    <div class="avatar">${role === 'user' ? 'ش' : '◆'}</div>
    <div class="bubble"><div class="content">${renderMarkdown(text)}</div></div>`;
  els.messages.appendChild(row);
  scrollDown();
  return row.querySelector('.content');
}

function addToolCard(tool, args) {
  els.welcome?.classList.add('hidden');
  const card = document.createElement('div');
  card.className = 'tool-card pending';
  card.innerHTML = `
    <div class="tool-head"><span class="tool-name">⚙ ${escapeHtml(tool)}</span><span class="tool-state">در حال اجرا…</span></div>
    <pre class="tool-args" dir="ltr">${escapeHtml(JSON.stringify(args, null, 2))}</pre>
    <pre class="tool-result hidden" dir="ltr"></pre>`;
  els.messages.appendChild(card);
  scrollDown();
  return card;
}

/* ------------------------------------------------------------------ وضعیت */
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.ollama_ready) {
      els.statusDot.classList.add('ok');
      els.statusText.textContent = 'آفلاین آماده — Ollama';
      els.providerLabel.textContent = 'Ollama (آفلاین)';
    } else if (data.gemini_ready || data.openai_ready) {
      els.statusDot.classList.add('ok');
      els.statusText.textContent = 'آنلاین آماده';
      els.providerLabel.textContent = data.gemini_ready ? 'Gemini' : 'API آنلاین';
    } else {
      els.statusDot.classList.add('warn');
      els.statusText.textContent = 'مدلی پیدا نشد';
      els.providerLabel.textContent = 'بدون مدل';
    }
    els.modelLabel.textContent = data.ollama_model || data.model || '';
  } catch {
    els.statusText.textContent = 'سرور در دسترس نیست';
  }
}

/* ------------------------------------------------------------------ گفتگوها */
async function loadChats(selectFirst = true) {
  const res = await fetch('/api/chats');
  const data = await res.json();
  els.chatList.innerHTML = '';
  data.chats.forEach((chat) => {
    const item = document.createElement('button');
    item.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
    item.dataset.id = chat.id;
    item.innerHTML = `<span class="chat-title">${escapeHtml(chat.title)}</span><span class="chat-del" title="حذف">✕</span>`;
    item.addEventListener('click', (event) => {
      if (event.target.classList.contains('chat-del')) {
        deleteChat(chat.id);
        return;
      }
      openChat(chat.id);
    });
    els.chatList.appendChild(item);
  });
  if (selectFirst && !currentChatId && data.chats.length) openChat(data.chats[0].id);
}

async function openChat(id) {
  currentChatId = id;
  document.querySelectorAll('.chat-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  const res = await fetch(`/api/chats/${id}`);
  const data = await res.json();
  els.messages.querySelectorAll('.msg, .tool-card').forEach((el) => el.remove());
  if (!data.messages.length) {
    els.welcome?.classList.remove('hidden');
  } else {
    els.welcome?.classList.add('hidden');
    data.messages.forEach((m) => addMessage(m.role, m.content));
  }
  loadChats(false);
}

async function deleteChat(id) {
  if (!confirm('این گفتگو حذف شود؟')) return;
  await fetch(`/api/chats/${id}`, { method: 'DELETE' });
  if (id === currentChatId) currentChatId = null;
  loadChats();
}

/* ------------------------------------------------------------------ ارسال */
async function sendMessage(text) {
  const message = (text ?? els.input.value).trim();
  if (!message || controller) return;

  els.input.value = '';
  els.input.style.height = 'auto';
  addMessage('user', message);

  let bubble = addMessage('assistant', '');
  bubble.parentElement.classList.add('typing');
  let toolCard = null;
  bubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';

  els.send.classList.add('hidden');
  els.stop.classList.remove('hidden');
  controller = new AbortController();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: currentChatId, message }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`خطای شبکه (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let first = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        if (event.type === 'delta') {
          if (first) {
            bubble.parentElement.classList.remove('typing');
            bubble.innerHTML = '';
            first = false;
          }
          answer += event.text;
          bubble.innerHTML = renderMarkdown(answer);
          scrollDown();
        } else if (event.type === 'tool_call') {
          bubble.parentElement.classList.remove('typing');
          bubble.innerHTML = '';
          first = true;
          toolCard = addToolCard(event.tool, event.args);
        } else if (event.type === 'tool_result' && toolCard) {
          toolCard.classList.remove('pending');
          toolCard.querySelector('.tool-state').textContent = 'تمام شد';
          const result = toolCard.querySelector('.tool-result');
          result.textContent = event.result;
          result.classList.remove('hidden');
          scrollDown();
        } else if (event.type === 'error') {
          bubble.parentElement.classList.remove('typing');
          bubble.innerHTML = `<span class="error">${escapeHtml(event.message)}</span>`;
          first = false;
        } else if (event.type === 'end' && event.chat_id) {
          if (event.chat_id !== currentChatId) {
            currentChatId = event.chat_id;
          }
        }
      }
    }

    if (first) {
      bubble.parentElement.classList.remove('typing');
      bubble.innerHTML = '<span class="muted">(پاسخی دریافت نشد)</span>';
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      bubble.parentElement.classList.remove('typing');
      bubble.innerHTML = `<span class="error">${escapeHtml(error.message)}</span>`;
    }
  } finally {
    controller = null;
    els.send.classList.remove('hidden');
    els.stop.classList.add('hidden');
    loadChats(false);
  }
}

/* ------------------------------------------------------------------ رویدادها */
els.composer.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});

els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

els.input.addEventListener('input', () => {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
});

els.stop.addEventListener('click', () => controller?.abort());

document.getElementById('new-chat').addEventListener('click', async () => {
  const res = await fetch('/api/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const chat = await res.json();
  currentChatId = chat.id;
  els.messages.querySelectorAll('.msg, .tool-card').forEach((el) => el.remove());
  els.welcome?.classList.remove('hidden');
  els.input.focus();
  loadChats(false);
});

document.getElementById('toggle-sidebar').addEventListener('click', () => {
  els.sidebar.classList.toggle('hidden');
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    els.input.value = chip.dataset.prompt || '';
    els.input.focus();
  });
});

/* تنظیمات */
document.getElementById('open-settings').addEventListener('click', async () => {
  const res = await fetch('/api/settings');
  const s = await res.json();
  document.getElementById('provider').value = s.provider || 'auto';
  document.getElementById('ollama-url').value = s.ollama_url || '';
  document.getElementById('ollama-model').value = s.ollama_model || '';
  document.getElementById('online-model').value = s.model || '';
  document.getElementById('system-prompt').value = s.system_prompt || '';
  els.overlay.classList.remove('hidden');
});
document.getElementById('close-settings').addEventListener('click', () => els.overlay.classList.add('hidden'));
els.overlay.addEventListener('click', (event) => {
  if (event.target === els.overlay) els.overlay.classList.add('hidden');
});
document.getElementById('save-settings').addEventListener('click', async () => {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: document.getElementById('provider').value,
      ollama_url: document.getElementById('ollama-url').value.trim(),
      ollama_model: document.getElementById('ollama-model').value.trim(),
      model: document.getElementById('online-model').value.trim(),
      system_prompt: document.getElementById('system-prompt').value,
    }),
  });
  els.overlay.classList.add('hidden');
  loadStatus();
});

loadStatus();
loadChats();
