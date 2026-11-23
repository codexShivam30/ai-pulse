'use strict';

const TIERS = {
  all: 'All', official: '✅ Official', research: '🔬 Research', press: '📰 Press',
  creator: '▶️ YouTube', community: '💬 Community',
};
const TIER_LABEL = { official: 'OFFICIAL', research: 'RESEARCH', press: 'PRESS', creator: 'YOUTUBE', community: 'COMMUNITY' };
const TIMES = { 24: 'Last 24h', 48: '2 days', 168: 'This week' };

// Official accounts to follow manually (X / Instagram don't allow apps to read them for free).
const SOCIAL = [
  ['OpenAI', 'https://x.com/OpenAI'], ['Anthropic', 'https://x.com/AnthropicAI'], ['Google DeepMind', 'https://x.com/GoogleDeepMind'],
  ['Meta AI', 'https://x.com/AIatMeta'], ['xAI', 'https://x.com/xai'], ['Mistral AI', 'https://x.com/MistralAI'],
  ['Hugging Face', 'https://x.com/huggingface'], ['Sam Altman', 'https://x.com/sama'], ['Andrej Karpathy', 'https://x.com/karpathy'],
  ['Demis Hassabis', 'https://x.com/demishassabis'], ['OpenAI (Instagram)', 'https://www.instagram.com/openai/'],
];

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

const state = {
  view: 'top', tier: 'all', hours: 48, q: '',
  data: null,
  saved: store.get('saved', {}),           // id -> item
  lastVisit: store.get('lastVisit', 0),
};

const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
}

// ---------- data ----------
async function load(manual) {
  $('#refreshBtn').classList.add('spin');
  try {
    const res = await fetch(`data/news.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
    if (manual) toast('Up to date ✓');
  } catch {
    if (!state.data) $('#list').innerHTML = '<div class="empty">Couldn\'t load news. Check your connection and tap ⟳.</div>';
    else toast('Offline – showing last saved news');
  } finally {
    $('#refreshBtn').classList.remove('spin');
  }
  if (state.data) {
    $('#updated').textContent = `Updated ${ago(Date.parse(state.data.generatedAt))} · ${state.data.items.length} stories`;
    render();
  }
}

// One card per story: when several outlets cover the same story, keep the most trusted one.
const TRUST = { official: 5, research: 4, press: 3, creator: 2, community: 1 };
function dedupe(items) {
  const best = new Map();
  for (const it of items) {
    const key = it.cluster || it.id;
    const cur = best.get(key);
    if (!cur || TRUST[it.tier] > TRUST[cur.tier]) best.set(key, it);
  }
  return [...best.values()];
}

function filtered() {
  const cutoff = Date.now() - state.hours * 3600e3;
  const q = state.q.toLowerCase().trim();
  let items = state.data.items.filter((it) =>
    it.ts >= cutoff &&
    (state.tier === 'all' || it.tier === state.tier) &&
    (!q || `${it.title} ${it.summary} ${it.source} ${it.category}`.toLowerCase().includes(q)));
  items = dedupe(items);
  return state.view === 'top' ? items.sort((a, b) => b.score - a.score) : items.sort((a, b) => b.ts - a.ts);
}

// ---------- rendering ----------
function card(it) {
  const isNew = state.lastVisit && it.ts > state.lastVisit;
  const saved = !!state.saved[it.id];
  const trust = it.confirmations > 1
    ? `<span class="badge good">✓ Confirmed by ${it.confirmations} sources</span>`
    : it.tier === 'community' ? '<span class="badge warn">⚠ Unverified – check before posting</span>'
    : it.tier === 'official' ? '<span class="badge good">✓ Official source</span>' : '';
  const related = it.related?.length
    ? `<details class="related"><summary>Also covered by ${it.related.length} more</summary>${it.related.map((r) =>
        `<a href="${esc(safeUrl(r.link))}" target="_blank" rel="noopener"><b>${esc(r.source)}</b> – ${esc(r.title)}</a>`).join('')}</details>` : '';
  return `
  <article class="card${isNew ? ' new' : ''}" data-id="${esc(it.id)}">
    ${it.image ? `<a href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener"><img class="thumb" loading="lazy" src="${esc(safeUrl(it.image))}" alt="" onerror="this.remove()"></a>` : ''}
    <div class="body">
      <div class="meta">
        <span class="tier ${it.tier}">${TIER_LABEL[it.tier]}</span>
        <span class="src">${esc(it.source)}</span><span>·</span><span>${ago(it.ts)}</span>
        ${it.category !== 'General' ? `<span>· ${esc(it.category)}</span>` : ''}
        ${isNew ? '<span class="newdot">· NEW</span>' : ''}
      </div>
      <h2><a href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener">${it.video ? '▶ ' : ''}${esc(it.title)}</a></h2>
      ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ''}
      <div class="badges">${trust}</div>
      ${related}
    </div>
    <div class="actions">
      <a href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener">Open ↗</a>
      ${it.discussion ? `<a href="${esc(safeUrl(it.discussion))}" target="_blank" rel="noopener">Discuss</a>` : ''}
      <button data-act="copy">Copy</button>
      <button data-act="share">Share</button>
      <button data-act="save" class="${saved ? 'on' : ''}">${saved ? '★ Saved' : '☆ Save'}</button>
    </div>
  </article>`;
}

function renderSources() {
  const rows = state.data.sources.map((s) => `
    <div class="src-row"><div>${esc(s.name)}<br><small>${TIER_LABEL[s.tier]}</small></div>
    <div>${s.ok ? `<span class="ok">● ${s.count} new</span>` : `<span class="bad" title="${esc(s.error)}">● unavailable</span>`}</div></div>`).join('');
  const social = SOCIAL.map(([n, u]) => `<div class="src-row"><a href="${u}" target="_blank" rel="noopener">${esc(n)}</a><small>open ↗</small></div>`).join('');
  return `
    <div class="note">Every story links to its original post. <b>Official</b> = straight from the AI company. <b>Confirmed by N sources</b> = several outlets reported it independently. <b>Community</b> posts are fast but can be rumours – double-check before you post them.</div>
    <div class="section-label">Live sources</div>${rows}
    <div class="section-label">Follow on X / Instagram</div>
    <div class="note">X and Instagram don't let apps read posts for free, so here are the official accounts to follow directly. Big announcements from them also show up in the feed via their blogs and the press.</div>
    ${social}`;
}

function render() {
  const list = $('#list');
  $('#filters').style.display = state.view === 'sources' ? 'none' : '';
  if (!state.data) return;
  if (state.view === 'sources') { list.innerHTML = renderSources(); return; }

  let items;
  if (state.view === 'saved') {
    items = Object.values(state.saved).sort((a, b) => b.ts - a.ts);
    const q = state.q.toLowerCase().trim();
    if (q) items = items.filter((it) => `${it.title} ${it.summary}`.toLowerCase().includes(q));
  } else {
    items = filtered();
  }
  state.visible = new Map(items.map((it) => [it.id, it]));
  list.innerHTML = items.length
    ? items.slice(0, 150).map(card).join('')
    : `<div class="empty">${state.view === 'saved' ? 'Nothing saved yet. Tap ☆ Save on a story to keep it for your next post.' : 'No stories match. Try a wider time range or another filter.'}</div>`;
}

function renderChips() {
  $('#tierChips').innerHTML = Object.entries(TIERS).map(([k, v]) =>
    `<button class="chip${state.tier === k ? ' active' : ''}" data-tier="${k}">${v}</button>`).join('');
  $('#timeChips').innerHTML = Object.entries(TIMES).map(([k, v]) =>
    `<button class="chip${state.hours === +k ? ' active' : ''}" data-hours="${k}">${v}</button>`).join('');
}

const captionFor = (it) =>
  `${it.title}\n\n${it.summary ? it.summary.replace(/^▲ \d+ · /, '') + '\n\n' : ''}Source: ${it.source}${it.confirmations > 1 ? ` (+${it.confirmations - 1} more outlets)` : ''}\n${it.link}`;

// ---------- events ----------
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
  state.view = b.dataset.view;
  render(); window.scrollTo(0, 0);
});
$('#filters').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return;
  if (c.dataset.tier) state.tier = c.dataset.tier;
  if (c.dataset.hours) state.hours = +c.dataset.hours;
  renderChips(); render();
});
$('#search').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('#refreshBtn').addEventListener('click', () => load(true));

$('#digestBtn').addEventListener('click', async () => {
  if (!state.data) return;
  const day = Date.now() - 24 * 3600e3;
  const top = dedupe(state.data.items.filter((it) => it.ts >= day && it.tier !== 'community'))
    .sort((a, b) => b.score - a.score).slice(0, 10);
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const text = `🤖 Today in AI – ${date}\n\n` + top.map((it, i) => `${i + 1}. ${it.title} (${it.source})`).join('\n') +
    '\n\nSources:\n' + top.map((it, i) => `${i + 1}. ${it.link}`).join('\n');
  await copy(text);
  toast('Top 10 of the last 24h copied 📋');
});

$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const id = btn.closest('.card').dataset.id;
  const it = state.visible.get(id) || state.saved[id]; if (!it) return;
  if (btn.dataset.act === 'copy') { await copy(captionFor(it)); toast('Copied – paste into your caption'); }
  if (btn.dataset.act === 'share') {
    if (navigator.share) navigator.share({ title: it.title, text: it.title, url: it.link }).catch(() => {});
    else { await copy(it.link); toast('Link copied'); }
  }
  if (btn.dataset.act === 'save') {
    if (state.saved[id]) delete state.saved[id]; else state.saved[id] = it;
    store.set('saved', state.saved);
    const on = !!state.saved[id];
    btn.classList.toggle('on', on); btn.textContent = on ? '★ Saved' : '☆ Save';
    toast(on ? 'Saved for later' : 'Removed');
    if (state.view === 'saved' && !on) render();
  }
});

// Remember when you last opened the app, so new stories get a "NEW" tag next time.
addEventListener('visibilitychange', () => { if (document.hidden) store.set('lastVisit', Date.now()); });
addEventListener('pagehide', () => store.set('lastVisit', Date.now()));
// Pull fresh news whenever the app comes back to the foreground.
addEventListener('visibilitychange', () => { if (!document.hidden && state.data && Date.now() - Date.parse(state.data.generatedAt) > 15 * 60e3) load(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

renderChips();
load();
