// ─────────────────────────────────────────────
//  HalluciCheck — content.js
//  Runs on: ChatGPT, Perplexity, Gemini, Copilot
// ─────────────────────────────────────────────

const BACKEND = 'http://localhost:3000/check';

// ── Site-specific selectors ──────────────────
const SITES = {
  'chatgpt.com': {
    container : '[data-message-author-role="assistant"]',
    text      : '[data-message-author-role="assistant"] .markdown',
    anchor    : '[data-message-author-role="assistant"] .markdown'
  },
  'chat.openai.com': {
    container : '[data-message-author-role="assistant"]',
    text      : '[data-message-author-role="assistant"] .markdown',
    anchor    : '[data-message-author-role="assistant"] .markdown'
  },
  'perplexity.ai': {
    container : '.prose',
    text      : '.prose',
    anchor    : '.prose'
  },
  'gemini.google.com': {
    container : 'message-content',
    text      : 'message-content .markdown',
    anchor    : 'message-content .markdown'
  },
  'copilot.microsoft.com': {
    container : '[data-testid="assistant-message"]',
    text      : '[data-testid="assistant-message"] .ac-textBlock',
    anchor    : '[data-testid="assistant-message"] .ac-textBlock'
  }
};

// ── Detect current site ──────────────────────
const hostname = location.hostname.replace('www.', '');
const SITE = Object.keys(SITES).find(k => hostname.includes(k));
if (!SITE) {
  console.log('[HalluciCheck] Site not supported:', hostname);
} else {
  console.log('[HalluciCheck] Active on:', hostname);
  init();
}

// ── Debounce helper ──────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Main init ────────────────────────────────
function init() {
  const cfg = SITES[SITE];

  const debouncedScan = debounce(() => scanResponses(cfg), 1800);

  const observer = new MutationObserver(debouncedScan);
  observer.observe(document.body, { childList: true, subtree: true });

  // Also scan on load in case page already has responses
  setTimeout(() => scanResponses(cfg), 2000);
}

// ── Find all AI responses and check new ones ─
const checkedIds = new Set();

function scanResponses(cfg) {
  const anchors = document.querySelectorAll(cfg.anchor);

  anchors.forEach((anchorEl) => {
    const text = anchorEl.innerText?.trim();
    if (!text || text.length < 80) return;

    // Create a stable ID from text content
    const id = 'hc-' + simpleHash(text.slice(0, 120));
    if (checkedIds.has(id)) return;
    checkedIds.add(id);

    // Remove any old panel for this same anchor
    const existing = anchorEl.parentElement?.querySelector('.hc-panel');
    if (existing) existing.remove();

    injectLoadingPanel(anchorEl, id);
    checkText(text, id);
  });
}

// ── Inject a loading skeleton ────────────────
function injectLoadingPanel(anchorEl, id) {
  const panel = document.createElement('div');
  panel.className = 'hc-panel hc-loading';
  panel.id = id;
  panel.innerHTML = `
    <div class="hc-header">
      <div class="hc-logo">
        <span class="hc-logo-icon">🔍</span>
        <span class="hc-logo-text">HalluciCheck</span>
      </div>
      <span class="hc-status-text">Verifying claims with Google Search…</span>
    </div>
    <div class="hc-skeleton">
      <div class="hc-skel-bar" style="width:70%"></div>
      <div class="hc-skel-bar" style="width:55%"></div>
      <div class="hc-skel-bar" style="width:65%"></div>
    </div>
  `;
  anchorEl.insertAdjacentElement('afterend', panel);
}

// ── Call backend ─────────────────────────────
async function checkText(text, id) {
  try {
    const res  = await fetch(BACKEND, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ text, source: hostname })
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);
    renderPanel(id, data);

  } catch (err) {
    renderError(id, err.message);
  }
}

// ── Render results panel ─────────────────────
function renderPanel(id, data) {
  const panel = document.getElementById(id);
  if (!panel) return;

  const { summary, claims } = data;
  const score = summary?.score ?? 50;
  const scoreColor = score >= 70 ? '#166534' : score >= 40 ? '#92400e' : '#991b1b';
  const scoreBg    = score >= 70 ? '#dcfce7' : score >= 40 ? '#fef9c3' : '#fee2e2';

  let claimsHtml = '';
  (claims || []).forEach(c => {
    const vi = verdictInfo(c.verdict);
    const conf = Math.round(c.confidence ?? 50);
    claimsHtml += `
      <div class="hc-claim">
        <div class="hc-claim-top">
          <span class="hc-type">${(c.type || 'fact').toUpperCase()}</span>
          <span class="hc-claim-text">${esc(c.claim)}</span>
        </div>
        <div class="hc-claim-bottom">
          <span class="hc-verdict ${vi.cls}">${vi.icon} ${vi.label}</span>
          <span class="hc-reason">${esc(c.reason || '')}</span>
          <div class="hc-conf">
            <div class="hc-conf-track">
              <div class="hc-conf-fill" style="width:${conf}%;background:${vi.color}"></div>
            </div>
            <span class="hc-conf-pct">${conf}%</span>
          </div>
        </div>
      </div>`;
  });

  panel.className = 'hc-panel';
  panel.innerHTML = `
    <div class="hc-header">
      <div class="hc-logo">
        <span class="hc-logo-icon">🔍</span>
        <span class="hc-logo-text">HalluciCheck</span>
      </div>
      <div class="hc-score" style="color:${scoreColor};background:${scoreBg}">
        ${score}/100
      </div>
    </div>

    <div class="hc-summary">
      <div class="hc-stat hc-stat-g">
        <span class="hc-stat-n">${summary?.verified ?? 0}</span>
        <span class="hc-stat-l">Verified</span>
      </div>
      <div class="hc-stat hc-stat-r">
        <span class="hc-stat-n">${summary?.hallucinated ?? 0}</span>
        <span class="hc-stat-l">Hallucinated</span>
      </div>
      <div class="hc-stat hc-stat-a">
        <span class="hc-stat-n">${summary?.unverifiable ?? 0}</span>
        <span class="hc-stat-l">Unverifiable</span>
      </div>
    </div>

    <div class="hc-claims-wrap">
      <div class="hc-claims-label">${(claims || []).length} claims detected</div>
      ${claimsHtml}
    </div>

    <div class="hc-footer">
      Powered by Gemini 2.5 Flash + Google Search · <a href="#" class="hc-recheck" data-id="${id}">Re-check</a>
    </div>
  `;
}

// ── Render error state ───────────────────────
function renderError(id, msg) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.className = 'hc-panel hc-error-panel';
  panel.innerHTML = `
    <div class="hc-header">
      <div class="hc-logo">
        <span class="hc-logo-icon">🔍</span>
        <span class="hc-logo-text">HalluciCheck</span>
      </div>
    </div>
    <div class="hc-error">⚠ ${esc(msg)}<br><small>Make sure your backend is running: <code>npm start</code></small></div>
  `;
}

// ── Helpers ──────────────────────────────────
function verdictInfo(v) {
  if (!v) return { label: 'Unverifiable', cls: 'hc-u', color: '#b45309', icon: '⚠️' };
  const vl = v.toLowerCase();
  if (vl.includes('verified') || vl.includes('true') || vl.includes('accurate'))
    return { label: 'Verified',      cls: 'hc-v', color: '#15803d', icon: '✅' };
  if (vl.includes('hallucin') || vl.includes('false') || vl.includes('incorrect') || vl.includes('fabricat'))
    return { label: 'Hallucinated',  cls: 'hc-h', color: '#dc2626', icon: '❌' };
  return { label: 'Unverifiable',    cls: 'hc-u', color: '#b45309', icon: '⚠️' };
}

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}