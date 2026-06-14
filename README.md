# Voca

**GitHub activity → authentic founder content.**

Voca watches your GitHub repos and turns your real engineering work (PRs, commits) into LinkedIn posts that sound like you — not ChatGPT.

---

## Full Product Requirements Document
 
**[Voca PRD (Complete)](https://docs.google.com/document/d/1MMsYrnWU383izqvbg9WFS-ZGO9m3LFYVYatbf3Vseqw/edit?tab=t.5byza0t4hfw0)** — comprehensive spec covering positioning, ICP, architecture, all 7 EPICs, Phase 2 scope, GTM plan, and open questions.
 
---

## What We're Building

Founders who build in public struggle to post consistently. They're shipping every day but never talking about it. Voca closes that gap: connect your GitHub, pick a repo, and get 3 draft posts generated from your latest PR — ready to copy, edit, and publish.

**MVP success criteria:**
- 5 users complete the full flow (connect GitHub → generate post)
- 2 users say "this actually sounds like me"
- 1 user posts publicly

**Target launch:** Product Hunt, May 11 2026

---

## Architecture (7 EPICs)

```
GitHub OAuth → Repo Selection → Data Extraction → Content Generation → Draft UI → Manual Trigger
                                                                                        ↓
                                                                               Automation (Phase 2)
                                                                               Voice Personalization (optional)
```

| EPIC | Description | Status |
|------|-------------|--------|
| 1 | GitHub Integration — OAuth, repo selection, token storage | ✅ Done |
| 2 | Data Extraction — fetch PRs + commits, filter noise, structure signal | 🔲 Next |
| 3 | Content Generation — prompt v1, 3 structurally different variations | 🔲 Next |
| 5 | Manual Trigger — "Generate Post from Latest PR" button | 🔲 Next |
| 4 | Draft UI — display, edit, copy, regenerate | 🔲 Next |
| 6 | Automation — daily cron, quality gate, stored drafts | 🔲 Phase 2 |
| 7 | Voice Personalization — writing style input, tone selector | 🔲 Optional |

> Build order: 1 → 2 → 3 → 5 → 4 → validate with users → 6 → 7 if needed

---

## What's Done

### EPIC 1: GitHub Integration ✅
- [x] GitHub OAuth setup (VOC-116)
- [x] Store GitHub access token securely in DB (VOC-117)
- [x] Fetch user repositories from GitHub API (VOC-118)
- [x] Repo selection UI (VOC-119)
- [x] Persist selected repo to DB (VOC-120)

**Current state:** User can sign in with GitHub, browse their repos, and save a selected repo. Auth token stored server-side only (never exposed to client). Prisma + PostgreSQL backing everything.

---

## What's Left (in build order)

### EPIC 2: Data Extraction
- [ ] Fetch PRs from last 7 days — title + description (VOC-121)
- [ ] Fetch commits — last 24h and PR-linked (VOC-122)
- [ ] Filter low-quality commits from data pipeline (VOC-123)
- [ ] Structure extracted data into "what changed" / "why it changed" (VOC-124)

### EPIC 3: Content Generation
- [ ] Prompt v1 — constraints-first content generation (VOC-125)
- [ ] Generate 3 structurally different post variations (VOC-126)

### EPIC 5: Manual Trigger (first version)
- [ ] "Generate Post from Latest PR" trigger button (VOC-131)
- [ ] Loading state and generation progress indicator (VOC-132)
- [ ] Error handling — no PR found in last 7 days (VOC-133)

### EPIC 4: Draft UI
- [ ] Draft display screen — show all 3 variations (VOC-127)
- [ ] Manual text editing per draft (VOC-128)
- [ ] Copy to clipboard button (VOC-129)
- [ ] Regenerate button — re-run generation from same PR data (VOC-130)

### EPIC 6: Automation (Phase 2, post-validation)
- [ ] 24h cron job for automated generation (VOC-134)
- [ ] Activity quality check — skip if nothing meaningful (VOC-135)
- [ ] Store auto-generated drafts in DB (VOC-136)
- [ ] Notify user when auto-generated drafts are ready (VOC-137)

### EPIC 7: Voice Personalization (optional, build on evidence)
- [ ] Writing style input — "How do you usually write?" (VOC-138)
- [ ] Paste past posts as style reference (VOC-139)
- [ ] Tone selector — casual / technical / storytelling (VOC-140)

---

## Milestones

| Milestone | Target | Progress |
|-----------|--------|----------|
| M1 — Core Build (EPICs 1–5) | Apr 28 2026 | 18% |
| M2 — Loop & Retention (EPIC 6) | May 5 2026 | 0% |
| M3 — QA & Launch-Ready | May 10 2026 | 0% |
| Product Hunt Launch | May 11 2026 | — |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router + Pages Router hybrid) |
| Language | TypeScript (strict) |
| Auth | NextAuth v4 — GitHub OAuth, JWT strategy |
| Database | PostgreSQL via Prisma ORM |
| Styling | Tailwind CSS |
| AI (planned) | Claude API — content generation |

---

## Local Setup

```bash
npm install

# copy and fill: DATABASE_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL
cp .env.example .env

npm run prisma:migrate
npm run dev
```

---

## Project Structure

```
app/              # Next.js App Router — pages, layouts, NextAuth route
components/       # React UI components
lib/              # Server-side utils (auth config, Prisma singleton)
pages/api/        # REST API handlers (repo list, repo selection)
prisma/           # DB schema + migrations
services/         # GitHub API calls + DB write abstractions
types/            # TypeScript declarations
```

---

## Linear

All work tracked in Linear (Vocaa workspace):
- **Voca - Engineering** — all technical EPICs and tasks
- **Voca - Product & Strategy** — positioning, copy, PH assets
- **Voca - GTM & Launch** — PH listing, hunter outreach, launch day
- **Voca - Beta & Feedback** — beta sessions, testimonials

