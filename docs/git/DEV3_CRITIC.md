# Developer 3 — Critic Agent Guide

**Your branch:** `feature/critic-agent`
**Your folder:** `backend/critic-agent/`
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
git checkout feature/critic-agent
```

### 3. Confirm you are on the right branch

```powershell
git branch
```

Output should show:
```
* feature/critic-agent
```

### 4. Copy your env file

```powershell
Copy-Item backend\critic-agent\.env.example backend\critic-agent\.env
```

Then open `backend/critic-agent/.env` and fill in:
- `GEMINI_API_KEY`

---

## Every Day — Start of Work

Run these commands every morning before writing any code:

```powershell
# Step 1 — Get latest changes from dev
git checkout dev
git pull origin dev

# Step 2 — Bring those changes into your branch
git checkout feature/critic-agent
git merge dev

# Step 3 — You are now up to date. Start coding!
```

---

## Saving Your Work (Commit & Push)

After finishing a task or a feature:

```powershell
# Step 1 — Stage only YOUR files
git add backend/critic-agent/

# Step 2 — Commit with a clear message
git commit -m "feat(critic): describe what you did"

# Step 3 — Push to GitHub
git push origin feature/critic-agent
```

---

## Commit Message Examples

```powershell
git commit -m "feat(critic): add Gemini result ranking with scores"
git commit -m "feat(critic): add duplicate URL filter"
git commit -m "feat(critic): add AI summary generation"
git commit -m "fix(critic): handle empty results from crawler"
git commit -m "fix(critic): fallback to heuristic rank when Gemini fails"
git commit -m "refactor(critic): separate filter and ranker into own files"
git commit -m "chore(critic): add @google/generative-ai dependency"
```

---

## Create a Pull Request (PR)

When your feature is ready or at end of each day:

1. Go to: `https://github.com/OneebDev/AgentFlow-AI/pulls`
2. Click **"New pull request"**
3. Set:
   - **base:** `dev`
   - **compare:** `feature/critic-agent`
4. Title: `feat(critic): what you built`
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
git checkout feature/critic-agent
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
git add backend/critic-agent/
git commit -m "chore: resolve merge conflict with dev"
git push origin feature/critic-agent
```

---

## What NOT to Do

```
❌ git push origin main
❌ git push origin dev
❌ git add frontend/
❌ git add backend/researcher-agent/
❌ git add backend/crawler-agent/
❌ Editing shared/ without telling the team
```

---

## Your Folder Structure

```
backend/
  critic-agent/
    src/
      index.js                  ← entry point
      services/
        critic.js               ← BullMQ worker
      processors/
        filter.js               ← deduplicate + intent filter
        ranker.js               ← Gemini scoring and ranking
    package.json
    Dockerfile
    .env                        ← your secrets (never commit)
    .env.example                ← safe template (commit this)
```

---

## API You Use

| API | Key Variable | Get Key |
|-----|-------------|---------|
| Google Gemini | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

---

## Need Help?

- Read the full workflow: [WORKFLOW.md](WORKFLOW.md)
- Check architecture: [../ARCHITECTURE.md](../ARCHITECTURE.md)
- Ask in team chat before touching `shared/` or `dev`
