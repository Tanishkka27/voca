/**
 * VOC-126 — End-to-End Pipeline Test (no OAuth, no Prisma, no DB required)
 *
 * Replicates the exact chain POST /api/generate calls:
 *   GitHub API → ActivitySummary → generateAllDrafts(activity)
 *
 * Inlines the GitHub fetch + activity-summary logic so we never import
 * github.service.ts or activity.service.ts (both transitively pull in
 * @prisma/client which fails without a generated client).
 *
 * Only import: generateAllDrafts from content.service.ts (no Prisma there).
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxxx REPO=owner/repo npx tsx scripts/e2e-voc126.ts
 */

import { config } from 'dotenv';
config();

// Only import the generation layer — no Prisma dependency
import { generateAllDrafts } from '../services/content.service';
import type { ActivitySummary } from '../types/activity';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const REPO = process.env.REPO ?? 'Tanishkka27/voca';

if (!GITHUB_TOKEN) {
  console.error('\n❌  GITHUB_TOKEN env var is required.');
  console.error('    Usage: GITHUB_TOKEN=ghp_xxxx REPO=owner/repo npx tsx scripts/e2e-voc126.ts\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types (mirrors github.service.ts without the prisma import)
// ---------------------------------------------------------------------------

type PRItem = {
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  merged_at: string | null;
};

type CommitItem = {
  message: string;
  date: string;
  author_login: string;
};

type SessionTimeRange = { startTime: Date; endTime: Date };

// ---------------------------------------------------------------------------
// GitHub fetch helpers (mirrors github.service.ts)
// ---------------------------------------------------------------------------

async function fetchPRs(repoFullName: string, token: string): Promise<PRItem[]> {
  const [owner, repo] = repoFullName.split('/');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?per_page=50&state=all`,
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } },
  );
  if (!res.ok) throw new Error(`GitHub PRs error: ${res.status} — ${await res.text()}`);
  const data = (await res.json()) as Record<string, unknown>[];
  return data
    .map(p => ({
      title: String(p['title'] ?? ''),
      body: p['body'] != null ? String(p['body']) : null,
      state: String(p['state'] ?? ''),
      created_at: String(p['created_at'] ?? ''),
      merged_at: p['merged_at'] != null ? String(p['merged_at']) : null,
    }))
    .filter(p => p.title.length >= 5)
    .sort((a, b) =>
      new Date(b.merged_at ?? b.created_at).getTime() -
      new Date(a.merged_at ?? a.created_at).getTime(),
    )
    .slice(0, 10);
}

async function fetchCommits(repoFullName: string, token: string): Promise<CommitItem[]> {
  const [owner, repo] = repoFullName.split('/');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`,
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } },
  );
  if (!res.ok) throw new Error(`GitHub commits error: ${res.status} — ${await res.text()}`);
  const data = (await res.json()) as Record<string, unknown>[];
  const trivial = new Set(['fix', 'update', 'test', 'wip']);
  const seen = new Set<string>();
  const unique: CommitItem[] = [];
  for (const c of data) {
    const commit = c['commit'] as Record<string, unknown> | undefined;
    const authorBlock = commit?.['author'] as Record<string, unknown> | undefined;
    const ghAuthor = c['author'] as Record<string, unknown> | undefined;
    const item: CommitItem = {
      message: String(commit?.['message'] ?? ''),
      date: String(authorBlock?.['date'] ?? ''),
      author_login: String(ghAuthor?.['login'] ?? authorBlock?.['name'] ?? 'unknown'),
    };
    const key = `${item.message}||${item.author_login}||${item.date}`;
    if (
      item.message.length >= 5 &&
      !trivial.has(item.message.trim().toLowerCase()) &&
      !seen.has(key)
    ) {
      seen.add(key);
      unique.push(item);
    }
  }
  unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return unique.slice(0, 20);
}

// ---------------------------------------------------------------------------
// Activity summary builder (mirrors activity.service.ts)
// ---------------------------------------------------------------------------

function detectLatestSession(commits: CommitItem[]): CommitItem[] {
  if (commits.length === 0) return [];
  const sorted = [...commits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const session: CommitItem[] = [];
  const MAX_COMMITS = 8;
  const MAX_GAP_HOURS = 4;
  const TIME_WINDOW_HOURS = 3;
  for (const current of sorted) {
    if (session.length >= MAX_COMMITS) break;
    if (session.length === 0) { session.push(current); continue; }
    const prev = session[session.length - 1];
    const gapHours =
      (new Date(prev.date).getTime() - new Date(current.date).getTime()) / 3_600_000;
    if (gapHours > MAX_GAP_HOURS) break;
    if (gapHours <= TIME_WINDOW_HOURS || gapHours <= MAX_GAP_HOURS) session.push(current);
  }
  return session;
}

function extractTimeRange(commits: CommitItem[]): SessionTimeRange | null {
  if (commits.length === 0) return null;
  const times = commits.map(c => new Date(c.date).getTime());
  return { startTime: new Date(Math.min(...times)), endTime: new Date(Math.max(...times)) };
}

function inRange(dateStr: string | null, range: SessionTimeRange | null): boolean {
  if (!dateStr || !range) return false;
  const t = new Date(dateStr).getTime();
  return t >= range.startTime.getTime() && t <= range.endTime.getTime();
}

function buildActivitySummary(
  prs: PRItem[],
  commits: CommitItem[],
): ActivitySummary | null {
  const RECENT_DAYS = 7;
  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const recentPRs = prs.filter(
    p => new Date(p.merged_at ?? p.created_at).getTime() >= cutoff,
  );

  const sessionCommits = detectLatestSession(commits);
  const sessionTimeRange = extractTimeRange(sessionCommits);

  if (sessionCommits.length === 0) {
    if (recentPRs.length === 0) return null;
    const pr = recentPRs[0];
    return {
      what_changed: pr.title,
      why_it_changed: pr.body ?? '',
      pr_title: pr.title,
      pr_description: pr.body ?? '',
      commit_count: 0,
      notable_commits: [],
    };
  }

  const sessionPRs = prs.filter(
    p => inRange(p.merged_at, sessionTimeRange) || inRange(p.created_at, sessionTimeRange),
  );

  const trivial = new Set(['fix', 'update', 'test', 'wip']);
  const texts = [
    ...sessionPRs.filter(p => p.merged_at).map(p => p.title),
    ...sessionPRs.filter(p => !p.merged_at).map(p => p.title),
    ...sessionCommits.map(c => c.message),
  ].filter(t => t && t.trim().length >= 5 && !trivial.has(t.trim().toLowerCase()));

  const uniq = Array.from(new Set(texts));
  if (uniq.length === 0) return null;

  const notableCommits = Array.from(
    new Set(
      sessionCommits
        .map(c => c.message)
        .filter(m => m.trim().length >= 5 && !trivial.has(m.trim().toLowerCase())),
    ),
  ).slice(0, 5);

  const primaryPR = sessionPRs[0] ?? recentPRs[0] ?? null;

  return {
    what_changed: primaryPR?.title ?? uniq[0],
    why_it_changed: primaryPR?.body ?? '',
    pr_title: primaryPR?.title ?? '',
    pr_description: primaryPR?.body ?? '',
    commit_count: sessionCommits.length,
    notable_commits: notableCommits,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sep(label: string) {
  console.log('\n' + '─'.repeat(64));
  console.log(`  ${label}`);
  console.log('─'.repeat(64));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         VOC-126 — End-to-End Pipeline Test                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nRepo     : ${REPO}`);
  console.log(`Provider : ${process.env.VOCA_PROVIDER ?? 'groq (default)'}`);
  console.log(`Time     : ${new Date().toISOString()}`);

  // ── STEP 1: GitHub API ────────────────────────────────────────────────────
  sep('STEP 1 — Fetch PRs + commits from GitHub API');

  let prs: PRItem[];
  let commits: CommitItem[];

  try {
    const t = Date.now();
    [prs, commits] = await Promise.all([
      fetchPRs(REPO, GITHUB_TOKEN),
      fetchCommits(REPO, GITHUB_TOKEN),
    ]);
    console.log(`\nGitHub fetch done in ${Date.now() - t}ms`);
    console.log(`  PRs found    : ${prs.length}`);
    console.log(`  Commits found: ${commits.length}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌  GitHub API error: ${msg}`);
    if (msg.includes('404')) console.error(`    → Repo "${REPO}" not found or token lacks access.`);
    process.exit(1);
  }

  // ── STEP 2: Build ActivitySummary ─────────────────────────────────────────
  sep('STEP 2 — Build ActivitySummary');

  const activity = buildActivitySummary(prs, commits);

  if (!activity) {
    console.log('\n⚠️   No recent activity found for this repo.');
    console.log('    API route returns: { drafts: [], errors: [], noActivity: true }');
    console.log('\n✅  noActivity path verified.');
    process.exit(0);
  }

  console.log('\nActivity summary:');
  console.log(`  pr_title      : ${activity.pr_title}`);
  console.log(`  what_changed  : ${activity.what_changed.slice(0, 80)}`);
  console.log(`  commit_count  : ${activity.commit_count}`);
  console.log(`  notable_commits: ${activity.notable_commits.slice(0, 2).join(' | ')}`);

  // ── STEP 3: Generate All Drafts ───────────────────────────────────────────
  sep('STEP 3 — generateAllDrafts (raw + polished + short in parallel)');
  console.log('\nFiring all 3 styles simultaneously via Promise.allSettled…');

  const genStart = Date.now();
  const result = await generateAllDrafts(activity);
  const genMs = Date.now() - genStart;

  console.log(`\nAll styles settled in ${genMs}ms`);
  console.log(`drafts : ${result.drafts.length}`);
  console.log(`errors : ${result.errors.length}`);
  console.log(`generatedAt: ${result.generatedAt}`);

  for (const d of result.drafts) {
    const wc = d.content.trim().split(/\s+/).length;
    console.log(`\n✅ [${d.style.toUpperCase()}]  (${wc} words)`);
    console.log('─'.repeat(40));
    console.log(d.content);
  }
  for (const e of result.errors) {
    console.log(`\n❌ [${e.style.toUpperCase()}] error: ${e.error}`);
  }

  // ── STEP 4: Acceptance Criteria ───────────────────────────────────────────
  sep('STEP 4 — Acceptance Criteria');

  const allStyles = new Set(['raw', 'polished', 'short']);
  const returnedStyles = new Set([
    ...result.drafts.map(d => d.style),
    ...result.errors.map(e => e.style),
  ]);

  const checks: { label: string; pass: boolean }[] = [
    { label: 'All 3 styles accounted for',  pass: [...allStyles].every(s => returnedStyles.has(s as 'raw' | 'polished' | 'short')) },
    { label: 'No duplicate styles',         pass: returnedStyles.size === 3 },
    { label: 'generatedAt is ISO string',   pass: /^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt) },
    { label: 'activitySummary echoed back', pass: result.activitySummary.pr_title === activity.pr_title },
    { label: 'Within 25s budget',           pass: genMs < 25_000 },
    { label: 'At least 1 draft succeeded',  pass: result.drafts.length >= 1 },
    { label: 'drafts have success: true',   pass: result.drafts.every(d => d.success === true) },
    { label: 'errors have success: false',  pass: result.errors.every(e => e.success === false) },
  ];

  let allPassed = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'}  ${c.label}`);
    if (!c.pass) allPassed = false;
  }

  sep('SUMMARY');
  console.log(`\nStyles succeeded : ${result.drafts.map(d => d.style).join(', ') || 'none'}`);
  console.log(`Styles failed    : ${result.errors.map(e => e.style).join(', ') || 'none'}`);
  console.log(`Wall time        : ${genMs}ms  (budget <25000ms) ${genMs < 25_000 ? '✅' : '❌'}`);
  console.log(`\nOverall result   : ${allPassed ? '✅ PASS' : '❌ FAIL'}\n`);

  if (!allPassed) process.exit(1);
})();
