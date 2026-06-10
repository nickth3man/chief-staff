const messagesEl = document.getElementById('messages');
const composer = document.getElementById('composer');
const inputEl = document.getElementById('input');
const hitlEl = document.getElementById('hitl');
const hitlQ = document.getElementById('hitl-question');
const hitlInput = document.getElementById('hitl-input');
const hitlSubmit = document.getElementById('hitl-submit');
const tabBody = document.getElementById('tab-body');
const tabButtons = document.querySelectorAll('.tab');

let history = [];
let activeTab = 'tasks';

function append(role, content) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = content;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function pollHitl() {
  try {
    const r = await fetch('/api/prompt');
    const j = await r.json();
    if (j.prompt) {
      hitlEl.classList.remove('hidden');
      hitlQ.textContent = j.prompt.question + (j.prompt.options ? ` (${j.prompt.options.join('/')})` : '');
    } else {
      hitlEl.classList.add('hidden');
    }
  } catch {}
}

setInterval(pollHitl, 1500);

hitlSubmit.addEventListener('click', async () => {
  const answer = hitlInput.value.trim();
  if (!answer) return;
  hitlInput.value = '';
  await fetch('/api/prompt/answer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  });
});

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  history.push({ role: 'user', content: text });
  append('user', text);

  append('assistant', '...');
  const lastAssistant = messagesEl.lastChild;

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const j = await r.json();
    lastAssistant.remove();
    if (j.result.kind === 'chat') {
      history.push({ role: 'assistant', content: j.result.content });
      append('assistant', j.result.content);
    } else if (j.result.kind === 'dispatch') {
      const { subAgent, rationale } = j.decision;
      const payload = JSON.stringify(j.result.payload, null, 2).slice(0, 1500);
      history.push({ role: 'assistant', content: `Dispatched to ${subAgent}.\n\n${rationale}\n\n${payload}` });
      append('tool', `→ ${subAgent}\n${rationale}\n\n${payload}`);
      await loadTab();
    }
  } catch (err) {
    lastAssistant.remove();
    append('assistant', 'Error: ' + err.message);
  }
});

document.querySelectorAll('.quick button').forEach((b) => {
  b.addEventListener('click', () => {
    inputEl.value = b.dataset.q;
    inputEl.focus();
  });
});

tabButtons.forEach((b) => {
  b.addEventListener('click', () => {
    tabButtons.forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    activeTab = b.dataset.tab;
    loadTab();
  });
});

async function loadTab() {
  tabBody.innerHTML = '<p class="meta">Loading...</p>';
  if (activeTab === 'tasks' || activeTab === 'kanban' || activeTab === 'context' || activeTab === 'feeds') {
    const r = await fetch(`/api/csv?which=${activeTab}`);
    const j = await r.json();
    if (!j.rows || j.rows.length === 0) {
      tabBody.innerHTML = '<p class="meta">No rows.</p>';
      return;
    }
    tabBody.innerHTML = j.rows
      .map(
        (row) =>
          `<div class="row">${Object.entries(row)
            .map(([k, v]) => `<div><strong>${k}:</strong> ${escapeHtml(String(v))}</div>`)
            .join('')}</div>`
      )
      .join('');
  } else if (activeTab === 'runs') {
    const r = await fetch('/api/runs');
    const j = await r.json();
    if (!j.rows || j.rows.length === 0) {
      tabBody.innerHTML = '<p class="meta">No runs yet.</p>';
      return;
    }
    tabBody.innerHTML = j.rows
      .map(
        (row) =>
          `<div class="row"><div><strong>${escapeHtml(row.workflow)}</strong> — ${escapeHtml(row.status)}</div><div class="meta">${escapeHtml(row.startedAt)} → ${escapeHtml(row.endedAt || '')} | $${escapeHtml(row.costUsd || '0')}</div></div>`
      )
      .join('');
  } else {
    const r = await fetch(`/api/files?kind=${activeTab}`);
    const j = await r.json();
    if (!j.entries || j.entries.length === 0) {
      tabBody.innerHTML = '<p class="meta">Empty.</p>';
      return;
    }
    tabBody.innerHTML = j.entries
      .map(
        (e) =>
          `<div class="row"><div><strong>${escapeHtml(e.name)}</strong></div><div class="meta">${escapeHtml(e.kind)}</div></div>`
      )
      .join('');
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

append('assistant', 'Welcome. I am your Chief of Staff. Tell me what you need, or pick a quick action below.');
loadTab();
