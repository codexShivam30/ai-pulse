// Pulls the latest AI news from every source in sources.mjs, removes duplicates,
// groups stories covered by several outlets ("confirmed by N sources"), and
// writes app/data/news.json for the phone app to read.
//
// Run: node fetcher/fetch.mjs        (needs Node 18+, no npm install needed)

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT_FILE || join(ROOT, 'app', 'data', 'news.json');
const MAX_AGE_DAYS = 7;
const PER_SOURCE = 25;
const UA = 'Mozilla/5.0 (compatible; AIPulseNewsReader/1.0; +https://github.com)';
const now = Date.now();

const AI_WORDS = /\b(ai|a\.i\.|artificial intelligence|machine learning|deep learning|llms?|gpt[-\w]*|chatgpt|openai|anthropic|claude|gemini|deepmind|llama|mistral|copilot|neural|transformer|diffusion|genai|generative|agents?|agentic|inference|fine-?tun\w*|rag|embeddings?|grok|xai|deepseek|qwen|hugging ?face|nvidia|gpu|robotics?|sora|midjourney|stable diffusion|perplexity|multimodal|reasoning model|foundation model)\b/i;

// ---------- tiny XML helpers (RSS 2.0 + Atom) ----------
const decode = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
const stripHtml = (s = '') =>
  decode(decode(s)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
};
const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);

function parseFeed(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    let link = stripHtml(tag(b, 'link'));
    if (!link || !/^https?:/.test(link)) {
      const alt = b.match(/<link\b[^>]*rel="alternate"[^>]*>/i)?.[0] || b.match(/<link\b[^>]*>/i)?.[0] || '';
      link = attr(alt, 'link', 'href');
    }
    const date = stripHtml(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'dc:date') || tag(b, 'updated'));
    const videoId = stripHtml(tag(b, 'yt:videoId'));
    const image = videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : attr(b, 'media:thumbnail', 'url') || attr(b, 'media:content', 'url') ||
        (/image/.test(attr(b, 'enclosure', 'type')) ? attr(b, 'enclosure', 'url') : '');
    const summary = stripHtml(tag(b, 'media:description') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    return { title: stripHtml(tag(b, 'title')), link, date, image, summary };
  });
}

async function get(url, json = false, tries = 3) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(20000),
  });
  if ((res.status === 429 || res.status >= 500) && tries > 1) {
    await new Promise((r) => setTimeout(r, 4000 + Math.random() * 4000));
    return get(url, json, tries - 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

// ---------- source-specific loaders ----------
async function loadRss(src) {
  return parseFeed(await get(src.url)).map((it) => ({ ...it, video: !!src.video }));
}

async function loadHN() {
  const since = Math.floor(now / 1000) - 2 * 86400;
  const data = await get(`https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=300&numericFilters=points>60,created_at_i>${since}`, true);
  return data.hits.map((h) => ({
    title: h.title,
    link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
    date: h.created_at,
    summary: `${h.points} points · ${h.num_comments ?? 0} comments on Hacker News`,
    engagement: h.points,
  }));
}

async function loadHFPapers(src) {
  const data = await get(src.url, true);
  return data
    .filter((p) => (p.paper?.upvotes ?? 0) >= 5)
    .map((p) => ({
      title: p.title || p.paper.title,
      link: `https://huggingface.co/papers/${p.paper.id}`,
      date: p.publishedAt || p.paper.publishedAt,
      summary: `▲ ${p.paper.upvotes} · ${stripHtml(p.paper.summary || '')}`,
      image: p.thumbnail || '',
      engagement: p.paper.upvotes,
    }));
}

// Reddit blocks anonymous bots, so use its official API when keys are provided
// (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET, stored as GitHub secrets). Otherwise try the public RSS.
async function loadRedditApi(src) {
  const auth = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20000),
  });
  if (!tokenRes.ok) throw new Error(`Reddit login failed: HTTP ${tokenRes.status} (check the Reddit keys)`);
  const { access_token } = await tokenRes.json();
  if (!access_token) throw new Error('Reddit login failed (check the Reddit keys)');
  const res = await fetch(`https://oauth.reddit.com/r/${src.subs}/top?t=day&limit=60&raw_json=1`, {
    headers: { Authorization: `Bearer ${access_token}`, 'User-Agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data.children
    .map((c) => c.data)
    .filter((p) => !p.stickied && !p.over_18 && p.score >= 50)
    .map((p) => {
      const thread = `https://www.reddit.com${p.permalink}`;
      const external = !p.is_self && p.url && !/^https?:\/\/(www\.reddit\.com|i\.redd\.it|v\.redd\.it|preview\.redd\.it)/.test(p.url);
      const img = p.preview?.images?.[0]?.source?.url || (/^https?:/.test(p.thumbnail || '') ? p.thumbnail : '');
      return {
        title: p.title,
        link: external ? p.url : thread,
        discussion: thread,
        date: new Date(p.created_utc * 1000).toISOString(),
        summary: `▲ ${p.score} · ${p.num_comments} comments${p.selftext ? ' · ' + p.selftext : ''}`,
        image: img,
        engagement: p.score,
        sourceName: p.subreddit_name_prefixed,
      };
    });
}

async function loadReddit(src) {
  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) return loadRedditApi(src);
  const xml = await get(src.url);
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return parseFeed(xml).map((it, i) => {
    const sub = attr(entries[i] || '', 'category', 'label') || src.name;
    // Reddit link posts carry the original article URL in the body; keep the thread as discussion.
    const ext = (decode(tag(entries[i] || '', 'content')).match(/href="(https?:\/\/(?!www\.reddit\.com|i\.redd\.it|v\.redd\.it|preview\.redd\.it)[^"]+)">\[link\]/) || [])[1];
    return { ...it, sourceName: sub, discussion: it.link, link: ext ? decode(ext) : it.link };
  });
}

const LOADERS = { rss: loadRss, hn: loadHN, hfpapers: loadHFPapers, reddit: loadReddit };

// ---------- categorising + duplicate detection ----------
const CATEGORIES = [
  ['Model launch', /\b(launch|launches|released?|releases|introduc\w+|unveil\w*|announc\w+|now available|open[- ]sources?|open[- ]weights?|new model|gpt-?\d|gemini \d|claude \w+ \d|llama \d|grok \d)\b/i],
  ['Research', /\b(paper|arxiv|research|benchmark|study|dataset|state[- ]of[- ]the[- ]art|sota|we propose|scaling law)\b/i],
  ['Business', /\b(funding|raises|raised|valuation|acquir\w+|acquisition|ipo|revenue|billion|million|layoffs?|hires|partnership|deal|invest\w*|stock|shares)\b/i],
  ['Policy & Safety', /\b(regulat\w+|law|lawsuit|sued|court|copyright|ban|policy|government|congress|senate|eu ai act|safety|alignment|deepfake|privacy|election)\b/i],
  ['Tools & Tips', /\b(tutorial|how to|guide|tips?|workflow|prompt\w*|plugin|extension|feature|update|app|api|sdk|integration)\b/i],
];
const categorise = (t) => CATEGORIES.find(([, re]) => re.test(t))?.[0] || 'General';

const STOP = new Set('the a an and or of to in on for with at by from is are be as its it this that new how why what your you we our has have will can now into about after over more than just via says said'.split(' '));
const tokens = (t) => new Set(t.toLowerCase().replace(/[^a-z0-9.\- ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
function similar(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const small = Math.min(a.size, b.size);
  return small <= 3 ? shared >= 2 && shared / small >= 0.66 : shared >= 3 && shared / small >= 0.5;
}

const TIER_WEIGHT = { official: 30, research: 18, press: 20, creator: 12, community: 8 };

// ---------- main ----------
const report = [];
const all = [];
await Promise.all(SOURCES.map(async (src) => {
  try {
    let items = await LOADERS[src.type](src);
    items = items
      .map((it) => ({ ...it, ts: Date.parse(it.date) }))
      .filter((it) => it.title && it.link && !isNaN(it.ts) && now - it.ts < MAX_AGE_DAYS * 86400e3 && it.ts < now + 3600e3)
      .filter((it) => !(src.filter || src.type === 'hn') || AI_WORDS.test(`${it.title} ${src.type === 'hn' ? '' : it.summary}`))
      .slice(0, PER_SOURCE);
    for (const it of items) {
      all.push({
        id: Buffer.from(it.link).toString('base64url').slice(-24),
        title: it.title,
        link: it.link,
        discussion: it.discussion,
        summary: clip(it.summary.replace(/submitted by \/u\/\S+.*$/i, '').trim(), 320),
        image: it.image || '',
        video: !!it.video,
        ts: it.ts,
        source: it.sourceName || src.name,
        sourceId: src.id,
        tier: src.tier,
        category: categorise(`${it.title} ${it.summary.slice(0, 200)}`),
        engagement: it.engagement || 0,
      });
    }
    report.push({ id: src.id, name: src.name, tier: src.tier, ok: true, count: items.length });
  } catch (e) {
    report.push({ id: src.id, name: src.name, tier: src.tier, ok: false, count: 0, error: String(e.message || e) });
  }
}));

// Drop exact duplicate links, then group similar headlines from different outlets.
const seen = new Set();
const items = all.filter((it) => !seen.has(it.link) && seen.add(it.link)).sort((a, b) => b.ts - a.ts);
const toks = items.map((it) => tokens(it.title));
const clusterOf = new Array(items.length).fill(-1);
for (let i = 0; i < items.length; i++) {
  if (clusterOf[i] === -1) clusterOf[i] = i;
  for (let j = i + 1; j < items.length; j++) {
    if (clusterOf[j] === -1 && Math.abs(items[i].ts - items[j].ts) < 3 * 86400e3 && similar(toks[i], toks[j])) clusterOf[j] = clusterOf[i];
  }
}
const groups = new Map();
items.forEach((it, i) => (groups.get(clusterOf[i]) || groups.set(clusterOf[i], []).get(clusterOf[i])).push(it));
for (const group of groups.values()) {
  const sources = [...new Set(group.map((g) => g.source))];
  const official = group.some((g) => g.tier === 'official');
  for (const it of group) {
    it.cluster = group[0].id;
    it.confirmations = sources.length;
    it.hasOfficial = official;
    it.related = group.filter((g) => g !== it).slice(0, 6).map((g) => ({ source: g.source, tier: g.tier, title: g.title, link: g.link }));
  }
}

// "Top" score = trust of source + how many outlets confirm it + engagement, fading with age.
for (const it of items) {
  const hours = (now - it.ts) / 3600e3;
  const boost = TIER_WEIGHT[it.tier] + (it.confirmations - 1) * 15 + (it.hasOfficial ? 10 : 0) + Math.min(15, Math.log10(1 + it.engagement) * 5);
  it.score = Math.round((boost / Math.pow(hours + 2, 0.8)) * 100) / 100;
}

const out = { generatedAt: new Date(now).toISOString(), sources: report.sort((a, b) => a.name.localeCompare(b.name)), items: items.slice(0, 600) };
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));

const failed = report.filter((r) => !r.ok);
console.log(`Saved ${out.items.length} stories from ${report.length - failed.length}/${report.length} sources -> ${OUT}`);
for (const f of failed) console.log(`  ! ${f.name}: ${f.error}`);
