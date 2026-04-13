# AgentFlow-AI — Repository Setup Guide
> Run this ONCE by the project owner before sharing the repo with the team.

---

## Prerequisites

- Git installed → [Download Git](https://git-scm.com/downloads)
- GitHub account with access to `OneebDev/AgentFlow-AI`
- Docker Desktop installed and running

---

## Step 1 — Open PowerShell in the project folder

```powershell
cd "D:\Coderatory\AgentFlow AI"
```

---

## Step 2 — Initialize Git and push to GitHub

```powershell
git init
git add .
git commit -m "chore: initial project setup with all agents"
git branch -M main
git remote add origin https://github.com/OneebDev/AgentFlow-AI.git
git push -u origin main
```

---

## Step 3 — Create the `dev` integration branch

```powershell
git checkout -b dev
git push -u origin dev
```

---

## Step 4 — Create all 3 feature branches

```powershell
# Researcher Agent branch
git checkout dev
git checkout -b feature/researcher-agent
git push -u origin feature/researcher-agent

# Crawler Agent branch
git checkout dev
git checkout -b feature/crawler-agent
git push -u origin feature/crawler-agent

# Critic Agent branch
git checkout dev
git checkout -b feature/critic-agent
git push -u origin feature/critic-agent

# Go back to dev when done
git checkout dev
```

---

## Step 5 — Verify all branches exist

```powershell
git branch -a
```

You should see:
```
  dev
  feature/crawler-agent
  feature/critic-agent
  feature/researcher-agent
* main
  remotes/origin/dev
  remotes/origin/feature/crawler-agent
  remotes/origin/feature/critic-agent
  remotes/origin/feature/researcher-agent
  remotes/origin/main
```

---

## Step 6 — Protect branches on GitHub

1. Go to: `https://github.com/OneebDev/AgentFlow-AI/settings/branches`
2. Click **"Add branch protection rule"**
3. Apply these settings to **both `main` and `dev`**:

```
Branch name pattern:  main   (then repeat for dev)

✅ Require a pull request before merging
✅ Require at least 1 approving review before merging
✅ Do not allow bypassing the above settings
```

> This means nobody can push directly — all changes go through Pull Requests.

---

## Step 7 — Share with your team

Send each developer their guide:

| Developer | Send this file |
|-----------|---------------|
| Dev 1 — Researcher | `docs/git/DEV1_RESEARCHER.md` |
| Dev 2 — Crawler    | `docs/git/DEV2_CRAWLER.md` |
| Dev 3 — Critic     | `docs/git/DEV3_CRITIC.md` |

---

## Branch Map

```
main              ← production only (protected)
 └── dev          ← integration (protected)
      ├── feature/researcher-agent   ← Dev 1
      ├── feature/crawler-agent      ← Dev 2
      └── feature/critic-agent       ← Dev 3
```

---

## Setup Complete ✅

Share the repo link with the team and tell each developer to read their own guide.
