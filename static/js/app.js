/* ═══════════════════════════════════════════════════════
   AtlasKB — Frontend App
   ═══════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /* ─────────────────────────────────────────
     DOM helpers
  ───────────────────────────────────────── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ─────────────────────────────────────────
     State
  ───────────────────────────────────────── */
  const state = {
    documents:   [],
    theme:       'dark',
    searchMode:  'hybrid',
    isThinking:  false,
    recognition: null,
    isListening: false,
    synth:       window.speechSynthesis || null,
    autoSpeak:   false,
    activePanel: 'docs', // mobile panel switch
  };

  /* ─────────────────────────────────────────
     Utils
  ───────────────────────────────────────── */
  function bytesToSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, units = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function timeFmt(d = new Date()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function stripHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent || d.innerText || '';
  }

  /* ─────────────────────────────────────────
     API helper
  ───────────────────────────────────────── */
  async function api(path, { method = 'GET', body = null } = {}) {
    const opts = { method, headers: {} };
    if (body instanceof FormData) {
      opts.body = body;
    } else if (body !== null && body !== undefined) {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, opts);
    const ct  = res.headers.get('content-type') || '';
    let data  = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);

    if (!res.ok) {
      const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data   = data;
      throw err;
    }
    return data;
  }

  /* ─────────────────────────────────────────
     Toast Notifications
  ───────────────────────────────────────── */
  function toast(type, title, message = '', timeout = 3600) {
    const container = $('#toastContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <div class="toast-top">
        <span class="toast-icon" aria-hidden="true"></span>
        <div class="toast-title">${escHtml(title)}</div>
        <button class="toast-x" type="button" aria-label="Dismiss">&times;</button>
      </div>
      ${message ? `<div class="toast-msg">${escHtml(message)}</div>` : ''}`;

    const dismiss = () => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px) scale(.95)';
      el.style.transition = 'opacity 180ms, transform 180ms';
      setTimeout(() => el.remove(), 200);
    };

    $('.toast-x', el).addEventListener('click', dismiss);
    container.appendChild(el);
    setTimeout(dismiss, timeout);
  }

  /* ─────────────────────────────────────────
     Theme
  ───────────────────────────────────────── */
  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('atlaskb_theme', theme);

    const body = document.body;
    const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
    const resolved = theme === 'system' ? (mqDark.matches ? 'dark' : 'light') : theme;

    body.setAttribute('data-theme', resolved);

    $$('.theme-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.theme === theme);
    });
  }

  function initTheme() {
    const saved = localStorage.getItem('atlaskb_theme') || 'dark';
    applyTheme(saved);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.theme === 'system') applyTheme('system');
    });

    $('#themeLight').addEventListener('click',  () => applyTheme('light'));
    $('#themeDark').addEventListener('click',   () => applyTheme('dark'));
    $('#themeSystem').addEventListener('click', () => applyTheme('system'));
  }

  /* ─────────────────────────────────────────
     Sidebar (mobile off-canvas)
  ───────────────────────────────────────── */
  function initSidebar() {
    const sidebar   = $('#sidebar');
    const backdrop  = $('#sidebarBackdrop');
    const hamburger = $('#hamburger');
    const closeBtn  = $('#sidebarClose');

    function openSidebar() {
      sidebar.classList.add('is-open');
      backdrop.classList.add('is-visible');
      hamburger.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-visible');
      hamburger.setAttribute('aria-expanded', 'false');
    }

    hamburger.addEventListener('click', () => {
      sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar();
    });

    closeBtn && closeBtn.addEventListener('click', closeSidebar);
    backdrop.addEventListener('click', closeSidebar);

    $$('.nav-item', sidebar).forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.nav-item', sidebar).forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        if (window.innerWidth <= 900) closeSidebar();
      });
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeSidebar();
    });
  }

  /* ─────────────────────────────────────────
     Mobile Panel Switch (Docs ↔ Chat)
  ───────────────────────────────────────── */
  function initMobileTabs() {
    const tabs     = $$('.mobile-tab');
    const docsPane = $('#docsPanel');
    const chatPane = $('#chatPanel');

    function switchPanel(panel) {
      state.activePanel = panel;
      tabs.forEach(t => t.classList.toggle('is-active', t.dataset.panel === panel));

      if (window.innerWidth <= 900) {
        if (panel === 'docs') {
          docsPane.classList.remove('is-hidden-panel');
          chatPane.classList.add('is-hidden-panel');
        } else {
          chatPane.classList.remove('is-hidden-panel');
          docsPane.classList.add('is-hidden-panel');
        }
      }
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => switchPanel(tab.dataset.panel));
    });

    // On resize, always restore both panels on desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        docsPane.classList.remove('is-hidden-panel');
        chatPane.classList.remove('is-hidden-panel');
      } else {
        switchPanel(state.activePanel);
      }
    });
  }

  /* ─────────────────────────────────────────
     Overlay
  ───────────────────────────────────────── */
  function showOverlay(title = 'Working…', desc = 'Please wait.') {
    $('#overlayTitle').textContent = title;
    $('#overlayDesc').textContent  = desc;
    $('#loadingOverlay').classList.remove('is-hidden');
  }

  function hideOverlay() {
    $('#loadingOverlay').classList.add('is-hidden');
  }

  function setThinking(on) {
    state.isThinking = on;
    const el = $('#thinkingIndicator');
    if (el) el.classList.toggle('is-hidden', !on);
  }

  /* ─────────────────────────────────────────
     Response Formatter (Markdown → HTML)
  ───────────────────────────────────────── */
  function formatAI(raw) {
    const text = String(raw || '').replace(/\r\n/g, '\n');

    // 1. Extract fenced code blocks
    const codeBlocks = [];
    const fenceRe = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let working = text.replace(fenceRe, (_, lang, code) => {
      const key = `\x00CB${codeBlocks.length}\x00`;
      codeBlocks.push({ lang: lang || '', code });
      return key;
    });

    // 2. Escape HTML
    working = escHtml(working);

    // 3. Inline code
    working = working.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 4. Headings
    working = working
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm,  '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm,   '<h1>$1</h1>');

    // 5. Bold & Italic
    working = working
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g,     '<em>$1</em>');

    // 6. Blockquote
    working = working.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // 7. List processing
    const lines = working.split('\n');
    const out   = [];
    let inUl = false, inOl = false;

    const flushLists = () => {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    };

    for (const line of lines) {
      const t = line.trim();
      if (!t) { flushLists(); out.push(''); continue; }

      const ulMatch = /^[-•*]\s+(.+)$/.exec(t);
      const olMatch = /^\d+\.\s+(.+)$/.exec(t);

      if (ulMatch) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${ulMatch[1]}</li>`);
      } else if (olMatch) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${olMatch[1]}</li>`);
      } else if (/^<(h[1-3]|blockquote)/.test(t)) {
        flushLists(); out.push(t);
      } else {
        flushLists();
        out.push(`<p>${t}</p>`);
      }
    }
    flushLists();

    let html = out.join('\n');

    // 8. Restore code blocks
    codeBlocks.forEach((b, i) => {
      const langLabel = b.lang
        ? `<span class="code-lang">${escHtml(b.lang)}</span>` : '';
      html = html.replace(
        escHtml(`\x00CB${i}\x00`),
        `<pre>${langLabel}<code>${escHtml(b.code)}</code></pre>`
      );
    });

    return html;
  }

  /* ─────────────────────────────────────────
     Chat UI
  ───────────────────────────────────────── */
  function scrollToBottom() {
    const el = $('#messages');
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  function ensureEmptyState() {
    const msgs = $$('.msg', $('#messages'));
    const empty = $('#chatEmpty');
    if (empty) empty.classList.toggle('is-hidden', msgs.length > 0);
  }

  function renderMessage({ role, text, html, sources }) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role === 'user' ? 'msg-user' : 'msg-assistant'}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const bodyHTML = role === 'assistant'
      ? (html || formatAI(text || ''))
      : escHtml(text || '');

    bubble.innerHTML = `
      <div class="bubble-meta">
        <div class="bubble-role">${role === 'user' ? 'You' : 'Assistant'}</div>
        <div class="bubble-time">${timeFmt()}</div>
      </div>
      <div class="bubble-body${role === 'assistant' ? ' ai-content' : ''}"></div>`;

    const bodyEl = $('.bubble-body', bubble);
    if (role === 'assistant') {
      bodyEl.innerHTML = bodyHTML;
    } else {
      bodyEl.textContent = text || '';
    }

    // Sources
    if (role === 'assistant' && Array.isArray(sources) && sources.length) {
      const srcBlock = document.createElement('div');
      srcBlock.className = 'sources-block';

      sources.slice(0, 5).forEach((s, idx) => {
        const card = document.createElement('div');
        card.className = 'source-card';
        card.innerHTML = `
          <div class="source-top">
            <div class="source-id">SRC ${idx + 1}</div>
            <div class="source-file" title="${escHtml(s.filename || '')}">
              ${escHtml(s.filename || '')}${s.chunk_id !== undefined ? ` · chunk ${escHtml(String(s.chunk_id))}` : ''}
            </div>
          </div>
          ${s.preview ? `<div class="source-preview">${escHtml(s.preview)}</div>` : ''}
          <div class="source-actions">
            <button class="btn btn-ghost btn-xs" data-act="speak">🔊 Speak</button>
            <button class="btn btn-ghost btn-xs" data-act="copy">⎘ Copy</button>
          </div>`;

        $$('[data-act]', card).forEach(btn => {
          btn.addEventListener('click', () => {
            const act = btn.dataset.act;
            if (act === 'speak') speakText(stripHtml(bodyEl.innerHTML));
            if (act === 'copy') {
              navigator.clipboard?.writeText(stripHtml(bodyEl.innerHTML))
                .then(() => toast('success', 'Copied', 'Answer copied to clipboard.'))
                .catch(() => toast('error', 'Copy failed', 'Could not access clipboard.'));
            }
          });
        });

        srcBlock.appendChild(card);
      });

      bubble.appendChild(srcBlock);
    }

    wrap.appendChild(bubble);
    $('#messages').appendChild(wrap);
    ensureEmptyState();
    scrollToBottom();

    // Auto-switch to chat panel on mobile when message arrives
    if (role === 'assistant' && window.innerWidth <= 900) {
      const tabs = $$('.mobile-tab');
      const chatTab = tabs.find(t => t.dataset.panel === 'chat');
      if (chatTab) chatTab.click();
    }
  }

  /* ─────────────────────────────────────────
     Documents
  ───────────────────────────────────────── */
  function fileExt(filename) {
    return (filename || '').split('.').pop().toLowerCase();
  }

  function renderDocs() {
    const docs    = state.documents || [];
    const indexed = docs.filter(d => d.indexed).length;

    $('#statDocs').textContent    = String(docs.length);
    $('#statIndexed').textContent = String(indexed);

    const empty = $('#docsEmpty');
    if (empty) empty.classList.toggle('is-hidden', docs.length > 0);

    // Sidebar status
    const dot  = $('#kbStatusDot');
    const lbl  = $('#kbStatusText');
    const sub  = $('#kbStatusSub');

    if (docs.length === 0) {
      dot.className = 'status-dot warn';
      lbl.textContent = 'No documents';
      sub.textContent = 'Upload a file to start.';
    } else if (indexed > 0) {
      dot.className = 'status-dot good';
      lbl.textContent = `Ready · ${indexed} indexed`;
      sub.textContent = 'Ask questions in chat.';
    } else {
      dot.className = 'status-dot warn';
      lbl.textContent = 'Not indexed yet';
      sub.textContent = 'Reprocess to build index.';
    }

    const list = $('#docsList');
    list.innerHTML = '';

    docs.forEach(doc => {
      const ext = fileExt(doc.filename);
      const badgeCls = doc.indexed ? 'badge badge-green' : 'badge badge-amber';
      const badgeTxt = doc.indexed ? 'Indexed' : 'Not indexed';

      const row = document.createElement('div');
      row.className = 'doc-row';
      row.innerHTML = `
        <div class="doc-row-top">
          <div class="doc-type-badge ${ext}">${ext.toUpperCase()}</div>
          <div class="doc-info">
            <div class="doc-name" title="${escHtml(doc.filename)}">${escHtml(doc.filename)}</div>
            <div class="doc-meta">
              <span>${escHtml(bytesToSize(doc.size || 0))}</span>
              <span>·</span>
              <span class="${badgeCls}">${badgeTxt}</span>
              ${doc.chunks ? `<span class="badge">${doc.chunks} chunks</span>` : ''}
            </div>
          </div>
        </div>
        <div class="doc-row-actions">
          <button class="btn btn-sm btn-summarize" data-action="summarize" type="button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Summarize
          </button>
          <button class="btn btn-sm btn-reindex" data-action="reprocess" type="button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Re-index
          </button>
        </div>`;

      $('[data-action="summarize"]', row).addEventListener('click', () => summarizeDoc(doc.filename));
      $('[data-action="reprocess"]', row).addEventListener('click', () => reprocessDoc(doc.filename));

      list.appendChild(row);
    });
  }

  async function loadDocuments({ silent = false } = {}) {
    try {
      if (!silent) showOverlay('Loading documents…', 'Fetching your library.');
      const data = await api('/api/documents');
      state.documents = data.documents || [];
      renderDocs();
    } catch (e) {
      toast('error', 'Failed to load documents', e.message || 'Unknown error');
    } finally {
      if (!silent) hideOverlay();
    }
  }

  /* ─────────────────────────────────────────
     Upload / Dropzone
  ───────────────────────────────────────── */
  function setUploadBar(on, pct = 20, label = 'Uploading…') {
    const bar   = $('#uploadProgress');
    const fill  = $('#uploadBarFill');
    const lbl   = $('#uploadBarLabel');
    if (!bar) return;
    bar.classList.toggle('is-hidden', !on);
    if (fill) fill.style.width  = `${Math.max(4, Math.min(100, pct))}%`;
    if (lbl)  lbl.textContent   = label;
  }

  async function uploadFile(file) {
    const name = file?.name || 'file';
    const ext  = fileExt(name);

    if (!['pdf','docx','txt'].includes(ext)) {
      toast('error', 'Unsupported file type', 'Please upload a PDF, DOCX, or TXT file.');
      return;
    }

    const fd = new FormData();
    fd.append('file', file);

    try {
      setUploadBar(true, 20, `Uploading ${name}…`);
      showOverlay('Indexing document…', 'Processing and building vector index…');
      const data = await api('/api/process', { method: 'POST', body: fd });
      setUploadBar(true, 100, `Indexed: ${data.filename} (${data.chunks} chunks)`);
      toast('success', 'Document indexed', `${data.filename} is ready for queries.`);
      await loadDocuments({ silent: true });
    } catch (e) {
      toast('error', 'Upload failed', e.message || 'Unknown error');
    } finally {
      hideOverlay();
      setTimeout(() => setUploadBar(false), 1400);
    }
  }

  function initDropzone() {
    const dz    = $('#dropzone');
    const input = $('#fileInput');
    if (!dz || !input) return;

    input.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) uploadFile(f);
      input.value = '';
    });

    // Click on dropzone opens file picker
    dz.addEventListener('click', (e) => {
      // Don't trigger if user clicked the btn-primary label above
      input.click();
    });

    dz.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });

    ['dragenter','dragover'].forEach(ev => {
      dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('is-dragover'); });
    });
    ['dragleave','drop'].forEach(ev => {
      dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('is-dragover'); });
    });
    dz.addEventListener('drop', e => {
      const f = e.dataTransfer?.files?.[0];
      if (f) uploadFile(f);
    });

    // Also allow drag/drop anywhere on page
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f && ['pdf','docx','txt'].includes(fileExt(f.name))) uploadFile(f);
    });
  }

  /* ─────────────────────────────────────────
     Chat Actions
  ───────────────────────────────────────── */
  async function sendQuestion() {
    const input = $('#questionInput');
    const q = (input?.value || '').trim();
    if (!q || state.isThinking) return;

    renderMessage({ role: 'user', text: q });
    input.value = '';
    autosizeTA(input);
    setThinking(true);

    try {
      const data = await api('/api/chat', {
        method: 'POST',
        body: { question: q, mode: state.searchMode },
      });
      renderMessage({
        role: 'assistant',
        text: data.answer || '',
        html: formatAI(data.answer || ''),
        sources: data.sources || [],
      });
      if (state.autoSpeak) speakText(data.answer || '');
    } catch (e) {
      renderMessage({ role: 'assistant', text: `⚠ ${e.message || 'Unknown error. Please try again.'}` });
      toast('error', 'Chat error', e.message || 'Unknown error');
    } finally {
      setThinking(false);
    }
  }

  async function clearChat() {
    try {
      await api('/api/clear_chat', { method: 'POST', body: {} });
      $$('.msg', $('#messages')).forEach(m => m.remove());
      ensureEmptyState();
      toast('success', 'Chat cleared', 'History has been reset.');
    } catch (e) {
      toast('error', 'Clear failed', e.message || 'Unknown error');
    }
  }

  async function summarizeDoc(filename) {
    // Auto-switch to chat panel on mobile
    if (window.innerWidth <= 900) {
      const chatTab = $$('.mobile-tab').find(t => t.dataset.panel === 'chat');
      if (chatTab) chatTab.click();
    }
    try {
      showOverlay('Summarizing…', `Generating AI summary for "${filename}"…`);
      const data = await api('/api/summarize', { method: 'POST', body: { filename } });
      if (!data?.success) throw new Error(data?.error || 'Summary failed.');
      if (!data.summary)  throw new Error('No summary returned. Document may be empty.');

      renderMessage({
        role: 'assistant',
        text: data.summary,
        html: formatAI(data.summary),
        sources: [{
          id: 'DOC',
          filename,
          chunk_id: 'summary',
          preview: `AI-generated summary of "${filename}" via Groq.`,
        }],
      });
      toast('success', 'Summary ready', `"${filename}" summarized.`);
    } catch (e) {
      toast('error', 'Summarize failed', e.message || 'Check your GROQ_API_KEY and try again.');
    } finally {
      hideOverlay();
    }
  }

  async function reprocessDoc(filename) {
    try {
      showOverlay('Reprocessing…', `Rebuilding vector index for ${filename}.`);
      const data = await api(`/api/process-existing/${encodeURIComponent(filename)}`);
      toast('success', 'Reprocessed', `${data.filename} re-indexed (${data.chunks} chunks).`);
      await loadDocuments({ silent: true });
    } catch (e) {
      toast('error', 'Reprocess failed', e.message || 'Unknown error');
    } finally {
      hideOverlay();
    }
  }

  /* ─────────────────────────────────────────
     Voice — Speech Recognition
  ───────────────────────────────────────── */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let _voiceBase = '';

  function setMicUI(listening) {
    state.isListening = listening;
    const micBtn = $('#micBtn');
    const pill   = $('#listeningPill');
    if (!micBtn) return;

    micBtn.classList.toggle('is-listening', listening);
    micBtn.setAttribute('aria-pressed', String(listening));
    micBtn.title = listening
      ? 'Listening… click to stop'
      : 'Voice input — click to speak (Chrome/Edge on localhost)';

    if (pill) pill.classList.toggle('is-hidden', !listening);
  }

  function buildRecognition() {
    if (!SR) return null;
    const rec = new SR();
    rec.lang            = navigator.language || 'en-US';
    rec.interimResults  = true;
    rec.continuous      = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setMicUI(true);
    };

    rec.onresult = (e) => {
      const input = $('#questionInput');
      if (!input) return;
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = e.results[i][0].transcript;
        if (e.results[i].isFinal) final   += seg;
        else                       interim += seg;
      }
      input.value = [_voiceBase, final + interim].filter(Boolean).join(' ');
      autosizeTA(input);
      if (final) {
        _voiceBase = [_voiceBase, final].filter(Boolean).join(' ').trim();
      }
    };

    rec.onerror = (ev) => {
      console.error('[Voice] SR error:', ev.error);
      state.recognition = null;
      setMicUI(false);

      const errMap = {
        'not-allowed':   'Microphone permission denied. Click the lock icon in the address bar → allow microphone.',
        'no-speech':     'No speech detected. Please speak closer to your microphone.',
        'network':       'Speech recognition needs an internet connection.',
        'audio-capture': 'No microphone found. Please connect a microphone.',
        'aborted':       null,
      };
      const msg = errMap[ev.error];
      if (msg === undefined) toast('error', 'Voice error', `Speech recognition failed: ${ev.error}`);
      else if (msg !== null) toast('error', 'Voice error', msg);
    };

    rec.onend = () => {
      state.recognition = null;
      setMicUI(false);
      const input = $('#questionInput');
      if (input && input.value.trim()) {
        input.focus();
        const len = input.value.length;
        try { input.setSelectionRange(len, len); } catch (_) {}
      }
    };

    return rec;
  }

  function initSpeechRecognition() {
    const micBtn = $('#micBtn');
    if (!micBtn) return;

    if (!SR) {
      micBtn.title = 'Speech recognition not available. Use Chrome or Edge.';
      micBtn.style.opacity = '0.35';
      micBtn.style.cursor  = 'not-allowed';
      micBtn.setAttribute('aria-disabled', 'true');
      micBtn.addEventListener('click', e => {
        e.stopImmediatePropagation();
        toast('info', 'Not supported', 'Speech recognition requires Chrome or Edge browser.');
      }, true);
      return;
    }

    const host = location.hostname;
    const secure = location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
    if (!secure) {
      micBtn.title = 'Voice input requires localhost or HTTPS.';
      micBtn.style.opacity = '0.38';
      micBtn.style.cursor  = 'not-allowed';
      micBtn.setAttribute('aria-disabled', 'true');
      micBtn.addEventListener('click', e => {
        e.stopImmediatePropagation();
        toast('error', 'Needs localhost/HTTPS', 'Open via http://localhost:5000 for voice to work.');
      }, true);
      return;
    }

    // Check mic permission silently
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' }).then(status => {
        if (status.state === 'denied') {
          micBtn.style.opacity = '0.40';
          micBtn.title = 'Microphone permission denied. Check browser site settings.';
        }
        status.onchange = () => {
          micBtn.style.opacity = status.state === 'denied' ? '0.40' : '1';
        };
      }).catch(() => {/* Permissions API not supported for mic — ignore */});
    }
  }

  function toggleListening() {
    // Stop if already listening
    if (state.isListening && state.recognition) {
      try { state.recognition.stop(); } catch (_) {}
      return;
    }

    if (!SR) {
      toast('info', 'Not supported', 'Speech recognition requires Chrome or Edge.');
      return;
    }

    const host = location.hostname;
    const secure = location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
    if (!secure) {
      toast('error', 'Needs HTTPS', 'Open via http://localhost:5000 for voice to work.');
      return;
    }

    // Snapshot current input text as base
    const input = $('#questionInput');
    _voiceBase = (input?.value || '').trim();

    // Build fresh instance (one-use by spec)
    const rec = buildRecognition();
    if (!rec) return;
    state.recognition = rec;

    // Show UI immediately
    setMicUI(true);

    try {
      rec.start();
    } catch (err) {
      state.recognition = null;
      setMicUI(false);
      if (err.name !== 'InvalidStateError') {
        toast('error', 'Mic error', `Could not start: ${err.message}`);
      }
    }
  }

  /* ─────────────────────────────────────────
     Voice — Speech Synthesis
  ───────────────────────────────────────── */
  function speakText(text) {
    if (!state.synth) {
      toast('info', 'Not available', 'Your browser does not support speech synthesis.');
      return;
    }
    try {
      state.synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text || '').slice(0, 5000));
      u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
      state.synth.speak(u);
    } catch (_) { /* ignore */ }
  }

  function stopSpeaking() {
    try { state.synth?.cancel(); } catch (_) {}
  }

  /* ─────────────────────────────────────────
     Composer / Input
  ───────────────────────────────────────── */
  function autosizeTA(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(160, el.scrollHeight) + 'px';
  }

  function initComposer() {
    const input   = $('#questionInput');
    const sendBtn = $('#sendBtn');
    if (!input || !sendBtn) return;

    autosizeTA(input);
    input.addEventListener('input', () => autosizeTA(input));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
    });

    sendBtn.addEventListener('click', sendQuestion);

    // Mic button
    const micBtn = $('#micBtn');
    if (micBtn) micBtn.addEventListener('click', () => toggleListening());

    // Clear chat
    const clearBtn = $('#clearChatBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearChat);

    // Stop speech
    const stopBtn = $('#stopSpeechBtn');
    if (stopBtn) stopBtn.addEventListener('click', () => {
      stopSpeaking();
      toast('info', 'Voice stopped', 'Speech playback stopped.');
    });

    // Auto-speak toggle
    const autoSpeak = $('#autoSpeakToggle');
    if (autoSpeak) {
      state.autoSpeak = localStorage.getItem('atlaskb_autospeak') === '1';
      autoSpeak.checked = state.autoSpeak;
      autoSpeak.addEventListener('change', e => {
        state.autoSpeak = !!e.target.checked;
        localStorage.setItem('atlaskb_autospeak', state.autoSpeak ? '1' : '0');
        toast('info', `Auto-speak ${state.autoSpeak ? 'on' : 'off'}`,
          state.autoSpeak ? 'AI will read responses aloud.' : 'Auto-speak disabled.');
      });
    }

    // Mode pills
    $$('.mode-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        $$('.mode-pill').forEach(p => p.classList.remove('is-active'));
        pill.classList.add('is-active');
        state.searchMode = pill.dataset.mode || 'hybrid';

        const hints = {
          semantic: 'Semantic uses FAISS vector similarity for deep meaning matching.',
          keyword:  'Keyword scores token overlap — good for exact term searches.',
          hybrid:   'Hybrid blends vector + keyword for best accuracy.',
        };
        const hint = $('#modeHint');
        if (hint) hint.textContent = hints[state.searchMode] || hints.hybrid;
      });
    });

    // Quick chips
    $$('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt || '';
        if (input) {
          input.value = prompt;
          autosizeTA(input);
          input.focus();
        }
      });
    });

    // Refresh docs
    const refreshBtn = $('#refreshDocsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadDocuments());
  }

  /* ─────────────────────────────────────────
     Boot
  ───────────────────────────────────────── */
  function init() {
    initTheme();
    initSidebar();
    initMobileTabs();
    initDropzone();
    initComposer();
    initSpeechRecognition();

    ensureEmptyState();
    loadDocuments({ silent: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
