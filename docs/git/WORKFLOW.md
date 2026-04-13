# AgentFlow-AI — Team Workflow & Rules

---

## Branch Map

```
main                          ← production (protected, PRs only)
 └── dev                      ← integration (protected, PRs only)
      ├── feature/researcher-agent    ← Developer 1
      ├── feature/crawler-agent       ← Developer 2
      └── feature/critic-agent        ← Developer 3
```

---

## Who Owns What

| Developer | Branch | Folder | Touches |
|-----------|--------|--------|---------|
| Dev 1 | `feature/researcher-agent` | `backend/researcher-agent/` | Gemini intent analysis, query generation |
| Dev 2 | `feature/crawler-agent` | `backend/crawler-agent/` | YouTube, Google, web scraper |
| Dev 3 | `feature/critic-agent` | `backend/critic-agent/` | Filter, rank, summarise results |

---

## Daily Workflow (Every Developer)

```
Morning                          Evening
───────                          ───────
1. git pull origin dev           5. git add your-folder/
2. git merge dev                 6. git commit -m "feat: ..."
3. Write code in YOUR folder     7. git push origin your-branch
4. Test locally                  8. Open PR → dev (if ready)
```

### Full commands

```powershell
# ── MORNING ──────────────────────────────────────────────────────────────────
git checkout dev
git pull origin dev
git checkout feature/YOUR-AGENT
git merge dev

# ── EVENING ──────────────────────────────────────────────────────────────────
git add backend/YOUR-AGENT/
git commit -m "feat(your-agent): what you did today"
git push origin feature/YOUR-AGENT
```

---

## Pull Request Flow

```
feature/your-agent
        │
        │  PR #1  (squash merge)
        ▼
       dev    ◄── all 3 agents integrated and tested here
        │
        │  PR #2  (merge commit)
        ▼
      main    ◄── release, production-ready only
```

### PR #1 — Feature → Dev (done frequently)

| Field | Value |
|-------|-------|
| Base | `dev` |
| Compare | `feature/your-agent` |
| Merge type | Squash and merge |
| Requires | 1 teammate approval |
| When | Feature complete or end of day |

### PR #2 — Dev → Main (done for releases only)

| Field | Value |
|-------|-------|
| Base | `main` |
| Compare | `dev` |
| Merge type | Merge commit |
| Requires | All PRs merged + 1 approval + tests pass |
| When | Sprint complete, ready to ship |

---

## Commit Message Convention

### Format
```
type(scope): short description in lowercase
```

### Types

| Type | Use when |
|------|----------|
| `feat` | Adding new functionality |
| `fix` | Fixing a bug |
| `chore` | Config, packages, setup |
| `refactor` | Code restructure, no new feature |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |

### Scope = your agent name

```powershell
feat(researcher): add intent classification
feat(crawler): add YouTube parallel fetching
feat(critic): add Gemini ranking with scores 0-100
fix(crawler): retry on YouTube 429 rate limit
fix(critic): fallback rank when Gemini API fails
refactor(researcher): extract query builder to separate file
chore(crawler): upgrade axios to v1.7
docs: update README with setup instructions
```

---

## Conflict Prevention Rules

### Rule 1 — Only touch your folder
```
Dev 1 → ONLY  backend/researcher-agent/
Dev 2 → ONLY  backend/crawler-agent/
Dev 3 → ONLY  backend/critic-agent/
```

### Rule 2 — Sync every morning
```powershell
git checkout dev
git pull origin dev
git checkout feature/YOUR-AGENT
git merge dev
```

### Rule 3 — Shared folder changes require team discussion
If you need to change `backend/shared/` — post in team chat first. One person makes the change, creates a PR, everyone reviews.

### Rule 4 — Small commits, often
Commit after every small task. Do not work for 3 days and then commit everything.

---

## Handling a Conflict (Step by Step)

```powershell
# Step 1 — Sync with latest dev
git checkout dev
git pull origin dev
git checkout feature/YOUR-AGENT
git merge dev

# Step 2 — Git shows conflict files
# Example output:
# CONFLICT (content): Merge conflict in backend/shared/queue/index.js

# Step 3 — Open the conflicted file in VS Code
code backend/shared/queue/index.js

# Step 4 — You will see this inside the file:
# <<<<<<< HEAD
# your code here
# =======
# incoming code from dev
# >>>>>>> dev

# Step 5 — Keep the correct version, delete the markers
# Save the file

# Step 6 — Mark conflict resolved
git add backend/shared/queue/index.js
git commit -m "chore: resolve merge conflict with dev"
git push origin feature/YOUR-AGENT
```

---

## Useful Git Commands

```powershell
# See which branch you are on
git branch

# See all branches (local + remote)
git branch -a

# See what files you changed
git status

# See what code you changed
git diff

# See commit history
git log --oneline

# Undo last commit (keeps your changes)
git reset --soft HEAD~1

# Discard ALL local changes (dangerous!)
git checkout .

# See all remote branches
git fetch origin
git branch -r
```

---

## Emergency: Pushed Wrong Code?

```powershell
# Undo your last push (only if nobody else pulled it yet)
git revert HEAD
git push origin feature/YOUR-AGENT

# Tell the team immediately in chat
```

---

## File Rules Summary

```
✅ DO commit:
   - backend/your-agent/src/**
   - backend/your-agent/package.json
   - backend/your-agent/.env.example
   - backend/your-agent/Dockerfile

❌ NEVER commit:
   - .env  (contains real API keys)
   - node_modules/
   - dist/ or build/
   - Another agent's folder
```
