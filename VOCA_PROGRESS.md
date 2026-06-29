## EPIC 1 - Milestone 1.1 (Project Setup)

### Completed:

* Next.js app initialized
* TailwindCSS configured
* shadcn/ui setup completed
* Prisma ORM connected to Supabase
* Clean scalable folder structure created

### Tech Stack:

* Next.js 14
* TypeScript
* Supabase (PostgreSQL)
* Prisma ORM

### Notes:

* Initial project setup completed successfully

### Status:

✅ Ready for next milestone

## EPIC 1 - Milestone 1.2 (GitHub OAuth)

### Completed:

* NextAuth.js configured with GitHub provider
* GitHub OAuth login working
* User stored in Supabase via Prisma
* Access token stored securely
* Protected dashboard route implemented

### Notes:

* Authentication flow tested successfully

### Risks:

* Token refresh handling not implemented yet

### Status:

✅ Auth system ready

## EPIC 1 - Milestone 1.3 (Repo Fetch & Selection)

### Completed:

* GitHub repo fetching implemented
* Secure API route created (/api/repos)
* Repo selection UI built
* Selected repo stored in database

### Notes:

* GitHub API integration stable

### Risks:

* Large repo lists may need pagination later

### Status:

✅ Repo selection working

### Issues Faced:

- Fetch API returned HTML instead of JSON due to missing credentials in frontend request
- Prisma failed to connect to Supabase using direct DB URL (IPv6 issue)
- Incorrect Supabase pooler port used initially (5432 instead of 6543)
- Prisma connection repeatedly failed due to VPN interference

### Fixes Applied:

- Added `credentials: 'same-origin'` in frontend fetch requests
- Ensured API returns JSON (401) instead of redirect
- Switched to Supabase IPv4 pooler connection
- Corrected port to 6543 for pooler
- Disabled VPN to allow database connection

### Infra Learnings:

- Supabase direct DB connections may fail on IPv6-restricted networks
- Prisma requires special handling with Supabase pooler (`pgbouncer=true`)
- Network conditions (VPN, firewall) can silently break DB connectivity
- Always validate API responses (HTML vs JSON) when debugging auth issues

### Improvements (Future):

- Add repo pagination for large accounts
- Cache repo list to reduce GitHub API calls
- Add retry handling for GitHub API failures

## EPIC 1 - Milestone 1.4 (Repo Selection Redirects & Commits)

### Completed:

* `RepoSelector` now navigates to the dynamic commits route after selection (`/${"owner"}/${"repo"}/commits`).
* `POST /api/repos/select` returns a `redirect` hint and `Location` header pointing to `/{owner}/{repo}/commits`.
* `saveSelectedRepo` now updates existing selection for a user (upsert-like behavior) to avoid duplicate records.
* `GET /api/commits` accepts `?owner=...&repo=...` and returns `repoFullName` with commits so clients can route to the dynamic page.
* Added dynamic commits page at `/[owner]/[repo]/commits` to display commits for any repo.
* Legacy `/commits` page now redirects to the dynamic route when a selected repo exists.

### Notes / Fixes:

* Fixed an issue where previously-selected repos would persist and always show the same repo — selection now updates the user's saved record.
* Addressed 404s by adding the dynamic commits route and ensuring API returns the repo path for client-side navigation.

### Status:

✅ Implemented — manual verification recommended

### Quick Verification Steps:

1. Start the dev server:
```bash
npm run dev
```
2. Sign in and visit `/dashboard`.
3. Choose a repository and click "Confirm Selection" — you should be redirected to `/{owner}/{repo}/commits`.
4. Visiting `/commits` will redirect to the selected repo's dynamic commits page if a selection exists.

### Next Actions (optional):

- Add unit/integration tests for selection and redirect flows.
- Harden error handling for GitHub API rate limits.
- Add UI feedback while redirecting (toast/snackbar).

## EPIC 2 - Milestone 2.3.1 (Session-Based Activity Grouping)

### Completed:

* Replaced time-window filtering (24h) with session-based grouping
* Implemented `detectLatestSession()` function for intelligent commit grouping
  - Groups commits based on time proximity (3-hour window)
  - Respects session size limits (max 8 commits, max 4-hour gap)
* Implemented `extractSessionTimeRange()` helper to calculate session time boundaries
* Updated `generateActivitySummary()` to use sessions instead of fixed time windows
* Integrated PR filtering based on session time range (mergedAt/createdAt within range)
* Maintained noise filtering (trivial messages, duplicates)
* Proper edge case handling: fallback to PRs if no commits, return null if both empty
* Full TypeScript type safety with `SessionTimeRange` and proper return types

### Algorithm Details:

Session Detection:
* Sort commits by date (descending)
* Start grouping from most recent commit
* Include commits within 3-hour window from previous commit
* Stop if: more than 8 commits collected OR time gap > 4 hours
* Returns the latest meaningful session

### Notes:

* Session-based grouping preserves context better than arbitrary 24-hour windows
* Activity summaries now reflect meaningful developer sessions
* PR/commit correlation based on actual session timing improves relevance
* No AI changes; logic remains deterministic and reusable

### Risks:

* Session heuristics (3h window, 4h gap, 8 commits) may need tuning based on real usage
* Edge case: fast-paced development may group into fewer, larger sessions

### Status:

✅ Context-aware activity detection implemented

### Files Modified:

* `/services/activity.service.ts` — core refactoring with new session logic
* `VOCA_PROGRESS.md` — documentation

### Code Structure:

* `detectLatestSession(commits)` — identifies latest coherent session
* `extractSessionTimeRange(sessionCommits)` — calculates time boundaries
* `isDateInRange(dateStr, range)` — helper for PR time filtering
* `classifyText(texts)` — activity classification (unchanged)
* `generateActivitySummary(repoFullName, accessToken)` — main orchestration using sessions

### Future Improvements:

* Make session parameters configurable (window size, max commits, gap threshold)
* Add telemetry to track actual session patterns and tune heuristics
* Consider multiple sessions for trend analysis
* Implement activity timeline visualization

## VOC-124 - Activity Summary Schema Gate

### Audit Result:

* Existing `generateActivitySummary()` output diverged from the Claude prompt schema.
* Old output used `{ summary: { type, highlights, counts } }` and returned wrapper objects for empty states.
* Required output is a direct `ActivitySummary | null` shape with six fields: `what_changed`, `why_it_changed`, `pr_title`, `pr_description`, `commit_count`, and `notable_commits`.

### Completed:

* Added exported `ActivitySummary` interface in `types/activity.ts`.
* Updated `generateActivitySummary()` to return `ActivitySummary | null`.
* Preserved existing session detection, session time range extraction, PR correlation, and noise filtering logic.
* Mapped PR and commit activity into the required downstream schema.
* Ensured `pr_description` and `why_it_changed` are strings, using `''` when a PR body is empty.
* Limited `notable_commits` to meaningful commit messages, max 5.
* Updated `/api/activity` to handle the new nullable summary shape.
* Added a recent PR guard for PR-only fallback so stale PRs do not count as current activity.

### Verification:

* Mocked end-to-end harness covered merged PR + commits, empty PR body, PR-only fallback, stale/no recent PRs, all commits filtered, and max notable commit limits.
* Full `npx tsc --noEmit` no longer reports errors in `pages/api/activity/index.ts`; remaining TypeScript errors are pre-existing session typing issues in repos/commits routes.
* Real GitHub audit still requires a valid `GITHUB_TOKEN` in the local environment.

### Status:

✅ VOC-124 schema gate implemented and ready for PR review by @AradhyaTiwari10
