# Voca

> Turn what you actually shipped this week into a LinkedIn post that sounds like you — not ChatGPT.

Voca connects to your GitHub, reads your latest commits and PRs, and generates 3 authentic LinkedIn post drafts in 3 different styles. You pick one, tweak it if you want, and post it. Core loop under 60 seconds.

---

## Live Project Board

**[Voca — Product Team B → GitHub Project #7](https://github.com/orgs/Arthakram/projects/7)**

All work is tracked there. Check it before picking up any task.

---

## Current State

| EPIC | Description | Status | Owner |
|------|-------------|--------|-------|
| EPIC 1 | GitHub OAuth + Repo Selection | ✅ Done | Aradhya |
| EPIC 2 | Data Extraction (session detection) | 🟡 Partially done | Tanishkka |
| EPIC 3 | Content Generation via Claude | 🔴 Not started | Tanishkka |
| EPIC 4 | Draft UI (display / edit / copy) | 🔴 Not started | Fenil |
| EPIC 5 | Manual Trigger + Loading/Error | 🔴 Not started | Fenil |
| EPIC 6 | QA + Demo Mode | 🔴 Not started | Both |

**Current focus:** EPIC 2 (Issue #13 — confirm JSON schema) → EPIC 3 (Issues #14, #15) → EPIC 5 (Issues #16, #17, #18) → EPIC 4 (Issues #19-23) → QA.

See `VOCA_PROGRESS.md` for the detailed engineering log.

---

## Team

| Role | Person | GitHub |
|------|--------|--------|
| Product Lead | Rishav Dewan | @rish106-hub |
| Engineering Reviewer | Aradhya Tiwari | @AradhyaTiwari10 |
| Developer — Backend & AI | Tanishkka | @Tanishkka27 |
| Developer — Frontend & UX | Fenil | @FSS3096 |

**Review policy:** every PR needs @AradhyaTiwari10 approval before merge. No exceptions.

---

## Setup

**Prerequisites:** Node 18+, npm/pnpm, a Supabase project, GitHub OAuth app, Anthropic API key.

### 1. Clone and install

```bash
git clone https://github.com/Arthakram/voca.git
cd voca
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```env
# GitHub OAuth (from github.com/settings/developers)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# NextAuth
NEXTAUTH_SECRET=                    # generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Supabase — use the IPv4 pooler (port 6543), not the direct connection
DATABASE_URL=postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true

# Anthropic
ANTHROPIC_API_KEY=                  # from console.anthropic.com
```

> **Supabase note:** Use port **6543** with `?pgbouncer=true`. Port 5432 (direct) fails on restricted networks. See `VOCA_PROGRESS.md` for the full explanation.

### 3. Database setup

```bash
npx prisma migrate dev
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. Sign in with GitHub. Select a repo. Click Generate.

---

## Project Structure

```
voca/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Landing page + demo mode
│   ├── dashboard/          # Post-auth dashboard (repo selector + trigger button)
│   └── drafts/             # Draft display page (3 variations)
├── components/             # Shared React components
│   ├── GenerateButton.tsx  # Trigger button — calls /api/generate
│   ├── LoadingView.tsx     # Step-by-step loading animation
│   ├── ErrorView.tsx       # Typed error display with retry
│   └── DraftCard.tsx       # Inline-editable draft card (copy + LinkedIn link)
├── pages/api/              # REST API handlers
│   ├── auth/               # NextAuth handler
│   ├── repos.ts            # GET list of user's repos
│   └── generate.ts         # POST trigger generation — calls activity + content services
├── services/
│   ├── activity.service.ts # GitHub data extraction (session detection — DONE)
│   └── content.service.ts  # Claude API + parallel generation (EPIC 3)
├── lib/
│   ├── auth.ts             # NextAuth config
│   ├── prisma.ts           # Prisma singleton
│   └── demo-data.ts        # Static data for landing page demo
├── types/
│   ├── activity.ts         # ActivitySummary interface
│   └── generation.ts       # GenerationResult interface
├── prisma/
│   └── schema.prisma       # DB schema
├── VOCA_PROGRESS.md        # Engineering log (more current than this README)
└── .env.example            # Environment variable template
```

---

## How to contribute (for Tanishkka and Fenil)

1. Look at the project board: https://github.com/orgs/Arthakram/projects/7
2. Pick the highest-priority open issue assigned to you
3. Move it to **In Progress** on the board
4. Create a branch: `feat/voc-{issue-number}-short-description` (e.g. `feat/voc-13-json-schema-audit`)
5. Build. Commit with the issue number in the message: `feat(voc-13): add ActivitySummary type`
6. Push, open a PR, add `Closes #13` in the PR body
7. Request review from @AradhyaTiwari10
8. After approval and merge: mark the issue Done on the board
9. Update `VOCA_PROGRESS.md` with what you shipped and any important findings

**Branch naming matters** — it connects your commits to the project board automatically.

---

## Definition of Done (applies to every issue)

Before marking any issue Done:

- [ ] All acceptance criteria in the issue body are checked off
- [ ] PR reviewed and approved by @AradhyaTiwari10
- [ ] No raw errors reachable by any user path
- [ ] Tested on desktop and mobile
- [ ] TypeScript strict mode passes (`npm run type-check` or `tsc --noEmit`)
- [ ] `VOCA_PROGRESS.md` updated

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 | App Router + Pages Router hybrid |
| Language | TypeScript (strict) | No `any` |
| Auth | NextAuth v4 | GitHub OAuth, JWT strategy |
| Database | PostgreSQL via Prisma | Hosted on Supabase |
| Styling | Tailwind CSS | Core utility classes only |
| AI | Claude API (claude-opus-4-8) | For content generation |
| Clipboard | navigator.clipboard API | With execCommand fallback |

---

## Resources

| Resource | Link |
|----------|------|
| Project Board | https://github.com/orgs/Arthakram/projects/7 |
| Full PRD | https://docs.google.com/document/d/1MMsYrnWU383izqvbg9WFS-ZGO9m3LFYVYatbf3Vseqw/edit |
| Engineering Log | [VOCA_PROGRESS.md](./VOCA_PROGRESS.md) |
| Supabase Dashboard | Ask Rishav for access |
| Anthropic Console | https://console.anthropic.com |
| Linear (archived) | https://linear.app/vocaa |

---

*Product: @rish106-hub · Engineering: @AradhyaTiwari10 · Build: @Tanishkka27, @FSS3096*
