# AI Pulse – latest AI news on your phone

An installable phone app (works on Android and iPhone) that collects the newest AI news
every 30 minutes from trusted sources and tells you how reliable each story is.

## What's in it
- **Top / Latest** feeds, search, and filters by source type and time (24h / 2 days / week).
- **Trust labels** on every story: `OFFICIAL` (the AI company itself), `RESEARCH`, `PRESS`,
  `YOUTUBE`, `COMMUNITY` (Reddit / Hacker News – verify before posting).
- **"Confirmed by N sources"** when several outlets reported the same story independently.
- **Copy** button that formats a story as a ready-to-paste caption with the source link.
- **📋 button** copies today's top 10 stories as a list – handy for a daily recap post.
- **Save** stories for later, **NEW** tag on stories since your last visit, works offline.

Sources are listed in [fetcher/sources.mjs](fetcher/sources.mjs) – add or remove any RSS feed or YouTube channel there.

## Put it on your phone (one-time, free, ~10 minutes)

The app is hosted free on GitHub Pages, and GitHub's servers refresh the news every 30 minutes,
so your computer does not need to stay on.

1. Create a free account at https://github.com and make a **new public repository** (e.g. `ai-pulse`).
2. Upload this folder to it. In PowerShell, inside this folder:
   ```powershell
   git init -b main
   git add .
   git commit -m "AI Pulse app"
   git remote add origin https://github.com/YOUR-USERNAME/ai-pulse.git
   git push -u origin main
   ```
3. On GitHub open the repo → **Settings → Pages** → under *Build and deployment*, set **Source** to **GitHub Actions**.
4. Go to the **Actions** tab → **Update AI news** → **Run workflow**. Wait ~1 minute for the green tick.
5. On your phone open `https://YOUR-USERNAME.github.io/ai-pulse/`
   - **Android (Chrome):** ⋮ menu → **Add to Home screen / Install app**.
   - **iPhone (Safari):** Share button → **Add to Home Screen**.

It now opens like a normal app from your home screen.

## Try it on this computer
```powershell
node fetcher/fetch.mjs
npx http-server app -p 8080
```
Then open http://localhost:8080.

## About X (Twitter) and Instagram
X and Instagram don't let apps read posts without paid API access, so the feed gets those
announcements from the companies' own blogs, YouTube channels and the press (which is also more
reliable than reposts). The **Sources** tab has one-tap links to the official accounts to follow.
Reddit sometimes blocks automated reading; when it does, the other sources keep working.
