# Developer 2 — Crawler Agent Guide

**Your branch:** `feature/crawler-agent`
**Your folder:** `backend/crawler-agent/`
**Rule:** Only edit files inside your folder. Never touch other agents' code.

---

## First Time Setup (Do this ONCE)

### 1. Clone the repository

```powershell
git clone https://github.com/OneebDev/AgentFlow-AI.git
cd AgentFlow-AI
```

### 2. Switch to your branch

```powershell
git checkout feature/crawler-agent
```

### 3. Confirm you are on the right branch

```powershell
git branch
```

Output should show:
```
* feature/crawler-agent
```

### 4. Copy your env file

```powershell
Copy-Item backend\crawler-agent\.env.example backend\crawler-agent\.env
```

Then open `backend/crawler-agent/.env` and fill in:
- `YOUTUBE_API_KEY`
- `SERPAPI_KEY`

---

## Every Day — Start of Work

Run these commands every morning before writing any code:

```powershell
# Step 1 — Get latest changes from dev
git checkout dev
git pull origin dev

# Step 2 — Bring those changes into your branch
git checkout feature/crawler-agent
git merge dev

# Step 3 — You are now up to date. Start coding!
```

---

## Saving Your Work (Commit & Push)

After finishing a task or a feature:

```powershell
# Step 1 — Stage only YOUR files
git add backend/crawler-agent/

# Step 2 — Commit with a clear message
git commit -m "feat(crawler): describe what you did"

# Step 3 — Push to GitHub
git push origin feature/crawler-agent
```

---

## Commit Message Examples

```powershell
git commit -m "feat(crawler): add YouTube Data API fetcher"
git commit -m "feat(crawler): add SerpAPI Google search fetcher"
git commit -m "feat(crawler): add Cheerio web scraper"
git commit -m "fix(crawler): handle YouTube API rate limit with retry"
git commit -m "fix(crawler): fix axios timeout on slow websites"
git commit -m "refactor(crawler): run all fetchers in parallel"
git commit -m "chore(crawler): add axios-retry dependency"
```

---

## Create a Pull Request (PR)

When your feature is ready or at end of each day:

1. Go to: `https://github.com/OneebDev/AgentFlow-AI/pulls`
2. Click **"New pull request"**
3. Set:
   - **base:** `dev`
   - **compare:** `feature/crawler-agent`
4. Title: `feat(crawler): what you built`
5. Description: brief explanation of changes
6. Click **"Create pull request"**
7. Tag a teammate to review

> Wait for approval before merging.

---

## If You See a Conflict

```powershell
# Pull latest dev into your branch
git checkout dev
git pull origin dev
git checkout feature/crawler-agent
git merge dev

# Git will list files with conflicts
# Open each file and look for:
#
# <<<<<<< HEAD         ← your code
# =======
# >>>>>>> dev          ← incoming code
#
# Delete the markers, keep the correct code, save the file

# Then finish the merge
git add backend/crawler-agent/
git commit -m "chore: resolve merge conflict with dev"
git push origin feature/crawler-agent
```

---

## What NOT to Do

```
❌ git push origin main
❌ git push origin dev
❌ git add frontend/
❌ git add backend/researcher-agent/
❌ git add backend/critic-agent/
❌ Editing shared/ without telling the team
```

---

## Your Folder Structure

```
backend/
  crawler-agent/
    src/
      index.js                  ← entry point
      services/
        crawler.js              ← BullMQ worker, dispatches fetchers
      fetchers/
        youtube.js              ← YouTube Data API v3
        google.js               ← SerpAPI (Google Search)
        scraper.js              ← Cheerio HTML scraper
    package.json
    Dockerfile
    .env                        ← your secrets (never commit)
    .env.example                ← safe template (commit this)
```

---

## APIs You Use

| API | Key Variable | Get Key |
|-----|-------------|---------|
| YouTube Data API v3 | `YOUTUBE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com) |
| SerpAPI (Google) | `SERPAPI_KEY` | [serpapi.com](https://serpapi.com) |

---

## Need Help?

- Read the full workflow: [WORKFLOW.md](WORKFLOW.md)
- Check architecture: [../ARCHITECTURE.md](../ARCHITECTURE.md)
- Ask in team chat before touching `shared/` or `dev`
