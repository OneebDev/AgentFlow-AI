# Developer 1 — Researcher Agent Guide

**Your branch:** `feature/researcher-agent`
**Your folder:** `backend/researcher-agent/`
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
git checkout feature/researcher-agent
```

### 3. Confirm you are on the right branch

```powershell
git branch
```

Output should show:
```
* feature/researcher-agent
```

### 4. Copy your env file

```powershell
Copy-Item backend\researcher-agent\.env.example backend\researcher-agent\.env
```

Then open `backend/researcher-agent/.env` and fill in your API keys.

---

## Every Day — Start of Work

Run these commands every morning before writing any code:

```powershell
# Step 1 — Get latest changes from dev
git checkout dev
git pull origin dev

# Step 2 — Bring those changes into your branch
git checkout feature/researcher-agent
git merge dev

# Step 3 — You are now up to date. Start coding!
```

---

## Saving Your Work (Commit & Push)

After finishing a task or a feature:

```powershell
# Step 1 — Stage only YOUR files
git add backend/researcher-agent/

# Step 2 — Commit with a clear message
git commit -m "feat(researcher): describe what you did"

# Step 3 — Push to GitHub
git push origin feature/researcher-agent
```

---

## Commit Message Examples

```powershell
git commit -m "feat(researcher): add Gemini intent analysis"
git commit -m "feat(researcher): generate 5 optimised search queries"
git commit -m "fix(researcher): handle empty query input"
git commit -m "refactor(researcher): split queryProcessor into smaller functions"
git commit -m "chore(researcher): add dotenv dependency"
```

---

## Create a Pull Request (PR)

When your feature is ready or at end of each day:

1. Go to: `https://github.com/OneebDev/AgentFlow-AI/pulls`
2. Click **"New pull request"**
3. Set:
   - **base:** `dev`
   - **compare:** `feature/researcher-agent`
4. Title: `feat(researcher): what you built`
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
git checkout feature/researcher-agent
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
git add backend/researcher-agent/
git commit -m "chore: resolve merge conflict with dev"
git push origin feature/researcher-agent
```

---

## What NOT to Do

```
❌ git push origin main
❌ git push origin dev
❌ git add frontend/
❌ git add backend/crawler-agent/
❌ git add backend/critic-agent/
❌ Editing shared/ without telling the team
```

---

## Your Folder Structure

```
backend/
  researcher-agent/
    src/
      index.js                  ← entry point
      services/
        researcher.js           ← BullMQ worker
      processors/
        queryProcessor.js       ← Gemini intent analysis
    package.json
    Dockerfile
    .env                        ← your secrets (never commit)
    .env.example                ← safe template (commit this)
```

---

## Need Help?

- Read the full workflow: [WORKFLOW.md](WORKFLOW.md)
- Check architecture: [../ARCHITECTURE.md](../ARCHITECTURE.md)
- Ask in team chat before touching `shared/` or `dev`
