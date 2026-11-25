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
    if (data.ollama_model_missing) {
      els.statusText.textContent = data.ollama_ready
        ? `مدل فعال «${data.active_model}» نصب نیست`
        : `Ollama در دسترس نیست (مدل فعال: ${data.active_model})`;
      els.providerLabel.textContent = 'مدل فعال آماده نیست';
    }
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

/* ------------------------------------------------------------------ مدل‌ها */
const modelLogLines = [];

function modelLog(line) {
  const stamp = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  modelLogLines.push(`[${stamp}] ${line}`);
  if (modelLogLines.length > 60) modelLogLines.shift();
  const box = document.getElementById('model-log');
  box.textContent = modelLogLines.join('\n');
  box.scrollTop = box.scrollHeight;
}

function setModelsState(text, tone = '') {
  const node = document.getElementById('models-state');
  node.textContent = text;
  node.className = tone ? `small ${tone}` : 'muted small';
}

function modelButton(label, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

async function useModel(name) {
  const res = await fetch('/api/models/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name }),
  });
  const data = await res.json();
  if (!res.ok) {
    modelLog(`✗ فعال‌سازی ${name} ناموفق: ${data.error || res.status}`);
    return;
  }
  modelLog(`✅ مدل فعال: ${name}`);
  document.getElementById('models-overlay').classList.add('hidden');
  loadStatus();
}

let pullController = null;

async function installModel(name, card) {
  const stateEl = card.querySelector('.catalog-state');
  const bar = card.querySelector('.catalog-progress i');
  card.classList.add('pulling');
  modelLog(`شروع دانلود و نصب ${name}…`);
  stateEl.textContent = 'در حال شروع…';

  const controller = new AbortController();
  pullController = controller;
  let note = '';
  const actions = card.querySelector('.catalog-actions');
  const installBtn = actions ? actions.querySelector('button') : null;
  if (installBtn) installBtn.disabled = true;
  if (actions) actions.appendChild(modelButton('لغو', 'btn', () => controller.abort()));

  try {
    const res = await fetch('/api/models/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`خطای شبکه (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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

        if (event.type === 'progress') {
          if (event.percent) bar.style.width = `${event.percent}%`;
          stateEl.textContent = [event.status, event.percent ? `${event.percent}٪` : ''].filter(Boolean).join(' · ');
        } else if (event.type === 'error') {
          note = `ناموفق: ${event.message}`;
          modelLog(`✗ ${event.message}`);
          stateEl.textContent = note;
        } else if (event.type === 'done') {
          bar.style.width = '100%';
          modelLog(`✅ ${name} نصب شد`);
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) {
      bar.style.width = '0%';
      note = 'لغو شد';
      stateEl.textContent = note;
      modelLog(`⏹ دانلود ${name} لغو شد`);
    } else {
      note = `ناموفق: ${error.message}`;
      modelLog(`✗ نصب ${name} ناموفق: ${error.message}`);
      stateEl.textContent = note;
    }
  } finally {
    if (pullController === controller) pullController = null;
    card.classList.remove('pulling');
    await loadModels();
    if (note) {
      const fresh = document.querySelector(`.catalog-item[data-model-id="${name}"] .catalog-state`);
      if (fresh) fresh.textContent = note;
    }
  }
}

function renderModels(data) {
  const installed = data.installed || [];
  setModelsState(
    data.ollama_ready
      ? `Ollama آماده · ${installed.length} مدل نصب‌شده`
      : 'Ollama در دسترس نیست؛ برای نصب و اجرا، ollama serve را اجرا کنید.',
    data.ollama_ready ? 'ok-text' : 'error'
  );

  const list = document.getElementById('installed-models');
  list.innerHTML = '';
  if (!installed.length) {
    const item = document.createElement('li');
    item.className = 'model-empty';
    item.textContent = 'هنوز مدلی نصب نیست؛ از فهرست پایین یکی را دانلود کنید.';
    list.appendChild(item);
  }
  installed.forEach((model) => {
    const item = document.createElement('li');
    item.className = 'model-item';
    const name = document.createElement('strong');
    name.dir = 'ltr';
    name.textContent = model.name;
    const meta = document.createElement('span');
    meta.className = 'muted small';
    const gb = model.size ? (model.size / 1024 ** 3).toFixed(1) : '';
    meta.textContent = [gb ? `${gb} GB` : '', model.params].filter(Boolean).join(' · ');
    const actions = document.createElement('span');
    actions.className = 'model-actions';
    actions.appendChild(modelButton('استفاده', 'btn primary', () => useModel(model.name)));
    item.append(name, meta, actions);
    list.appendChild(item);
  });

  const catalog = document.getElementById('model-catalog');
  catalog.innerHTML = '';
  const names = new Set(installed.map((m) => m.name));
  (data.catalog || []).forEach((model) => {
    const ready = names.has(model.id) || names.has(`${model.id}:latest`);
    const card = document.createElement('div');
    card.className = 'catalog-item';
    card.dataset.modelId = model.id;

    const head = document.createElement('div');
    head.className = 'catalog-head';
    const title = document.createElement('strong');
    title.dir = 'ltr';
    title.textContent = model.label;
    const size = document.createElement('span');
    size.className = 'muted small';
    size.textContent = `${model.size} · رم ${model.ram}`;
    head.append(title, size);

    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = model.note;

    const progress = document.createElement('div');
    progress.className = 'catalog-progress';
    progress.appendChild(document.createElement('i'));

    const state = document.createElement('div');
    state.className = 'catalog-state small muted';

    const actions = document.createElement('div');
    actions.className = 'catalog-actions';
    if (ready) {
      actions.appendChild(modelButton('استفاده', 'btn primary', () => useModel(model.id)));
    } else {
      actions.appendChild(modelButton('دانلود و نصب', 'btn', () => installModel(model.id, card)));
    }

    card.append(head, note, progress, state, actions);
    catalog.appendChild(card);
  });
}

async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    renderModels(data);
  } catch (error) {
    setModelsState(`خواندن فهرست مدل‌ها ناموفق بود: ${error.message}`, 'error');
  }
}

document.getElementById('open-models').addEventListener('click', () => {
  document.getElementById('models-overlay').classList.remove('hidden');
  loadModels();
});
document.getElementById('close-models').addEventListener('click', () => {
  document.getElementById('models-overlay').classList.add('hidden');
});
document.getElementById('models-overlay').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden');
});

loadStatus();
loadChats();
