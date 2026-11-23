// Every source the app pulls from. Only well-known, verifiable outlets are listed,
// so everything in the feed traces back to an original, checkable post.
//
// tier tells you how much to trust a story on its own:
//   official  - the AI lab / company itself (most reliable)
//   research  - papers and researcher write-ups
//   press     - established tech newsrooms
//   creator   - trusted YouTube explainers
//   community - Reddit / Hacker News (fast, but verify before posting)
//
// filter: true  -> the feed covers more than AI, so keep only AI-related items.
//
// To add a YouTube channel: https://www.youtube.com/feeds/videos.xml?channel_id=<ID>

const yt = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
const reddit = (subs) => `https://www.reddit.com/r/${subs}/top/.rss?t=day&limit=50`;

export const SOURCES = [
  // ---- Official lab / company announcements ----
  { id: 'openai', name: 'OpenAI', tier: 'official', type: 'rss', url: 'https://openai.com/news/rss.xml' },
  { id: 'deepmind', name: 'Google DeepMind', tier: 'official', type: 'rss', url: 'https://deepmind.google/blog/rss.xml' },
  { id: 'googleai', name: 'Google AI Blog', tier: 'official', type: 'rss', url: 'https://blog.google/technology/ai/rss/' },
  { id: 'googleresearch', name: 'Google Research', tier: 'official', type: 'rss', url: 'https://research.google/blog/rss/' },
  { id: 'msresearch', name: 'Microsoft Research', tier: 'official', type: 'rss', url: 'https://www.microsoft.com/en-us/research/feed/', filter: true },
  { id: 'nvidia', name: 'NVIDIA Blog', tier: 'official', type: 'rss', url: 'https://blogs.nvidia.com/feed/', filter: true },
  { id: 'aws', name: 'AWS Machine Learning', tier: 'official', type: 'rss', url: 'https://aws.amazon.com/blogs/machine-learning/feed/' },
  { id: 'huggingface', name: 'Hugging Face', tier: 'official', type: 'rss', url: 'https://huggingface.co/blog/feed.xml' },
  { id: 'anthropic-yt', name: 'Anthropic (YouTube)', tier: 'official', type: 'rss', url: yt('UCrDwWp7EBBv4NwvScIpBDOA'), video: true },
  { id: 'openai-yt', name: 'OpenAI (YouTube)', tier: 'official', type: 'rss', url: yt('UCXZCJLdBC09xxGZ6gcdrc6A'), video: true },
  { id: 'deepmind-yt', name: 'Google DeepMind (YouTube)', tier: 'official', type: 'rss', url: yt('UCP7jMXSY2xbc3KCAE0MHQ-A'), video: true },

  // ---- Research ----
  { id: 'hfpapers', name: 'HF Daily Papers', tier: 'research', type: 'hfpapers', url: 'https://huggingface.co/api/daily_papers?limit=50' },
  { id: 'simonw', name: 'Simon Willison', tier: 'research', type: 'rss', url: 'https://simonwillison.net/atom/everything/', filter: true },
  { id: 'bair', name: 'Berkeley AI Research', tier: 'research', type: 'rss', url: 'https://bair.berkeley.edu/blog/feed.xml' },

  // ---- Established press ----
  { id: 'techcrunch', name: 'TechCrunch', tier: 'press', type: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { id: 'verge', name: 'The Verge', tier: 'press', type: 'rss', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { id: 'venturebeat', name: 'VentureBeat', tier: 'press', type: 'rss', url: 'https://venturebeat.com/category/ai/feed/' },
  { id: 'mittr', name: 'MIT Technology Review', tier: 'press', type: 'rss', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { id: 'ars', name: 'Ars Technica', tier: 'press', type: 'rss', url: 'https://arstechnica.com/ai/feed/' },
  { id: 'wired', name: 'WIRED', tier: 'press', type: 'rss', url: 'https://www.wired.com/feed/tag/ai/latest/rss' },

  // ---- Trusted YouTube creators ----
  { id: 'twominutepapers', name: 'Two Minute Papers', tier: 'creator', type: 'rss', url: yt('UCbfYPyITQ-7l4upoX8nvctg'), video: true },
  { id: 'aiexplained', name: 'AI Explained', tier: 'creator', type: 'rss', url: yt('UCNJ1Ymd5yFuUPtn21xtRbbw'), video: true },
  { id: 'mattwolfe', name: 'Matt Wolfe', tier: 'creator', type: 'rss', url: yt('UChpleBmo18P08aKCIgti38g'), video: true },
  { id: 'yannic', name: 'Yannic Kilcher', tier: 'creator', type: 'rss', url: yt('UCZHmQk67mSJgfCCTn7xBfew'), video: true },
  { id: 'fireship', name: 'Fireship', tier: 'creator', type: 'rss', url: yt('UCsBjURrPoezykLs9EqgamOA'), video: true, filter: true },

  // ---- Community (fast but unverified) ----
  { id: 'hn', name: 'Hacker News', tier: 'community', type: 'hn' },
  // One combined request (Reddit rate-limits many separate ones). Edit the list to add subreddits.
  { id: 'reddit', name: 'Reddit', tier: 'community', type: 'reddit', url: reddit('LocalLLaMA+MachineLearning+OpenAI+ClaudeAI+artificial+StableDiffusion') },
];
