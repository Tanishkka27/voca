import { fetchPullRequests, PRItem, fetchCommits, CommitItem } from './github.service'
import type { ActivitySummary } from '../types/activity'

type SessionTimeRange = {
  startTime: Date
  endTime: Date
}

const RECENT_ACTIVITY_DAYS = 7

/**
 * Detects the latest activity session from commits.
 * 
 * Algorithm:
 * - Sort commits by date (descending)
 * - Start from most recent and group commits into a session
 * - Include commits within 3-hour window from previous commit
 * - Stop grouping if:
 *   - More than 8 commits collected OR
 *   - Time gap between commits > 4 hours
 * 
 * @param commits - Array of commits sorted by date
 * @returns Array of commits belonging to the latest session
 */
function detectLatestSession(commits: CommitItem[]): CommitItem[] {
  if (commits.length === 0) return []

  // Sort by date descending (most recent first)
  const sorted = [...commits].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const session: CommitItem[] = []
  const MAX_COMMITS = 8
  const MAX_GAP_HOURS = 4
  const TIME_WINDOW_HOURS = 3

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]
    const currentTime = new Date(current.date).getTime()

    // First commit in session
    if (session.length === 0) {
      session.push(current)
      continue
    }

    // Check if we've exceeded session size
    if (session.length >= MAX_COMMITS) {
      break
    }

    // Get previous commit in session (most recent one)
    const previous = session[session.length - 1]
    const previousTime = new Date(previous.date).getTime()

    // Calculate time gap in hours
    const gapMs = previousTime - currentTime
    const gapHours = gapMs / (1000 * 3600)

    // Condition 1: If gap is within 3-hour window, include it
    if (gapHours <= TIME_WINDOW_HOURS) {
      session.push(current)
    }
    // Condition 2: If gap exceeds 4 hours, stop grouping
    else if (gapHours > MAX_GAP_HOURS) {
      break
    }
    // Gap is between 3-4 hours: include but check next commit
    else {
      session.push(current)
      // Continue to next commit to see if it's in range
    }
  }

  return session
}

/**
 * Extracts the time range of a session based on commits.
 * 
 * @param sessionCommits - Array of commits in the session
 * @returns Object with startTime (oldest) and endTime (newest) of the session
 */
function extractSessionTimeRange(sessionCommits: CommitItem[]): SessionTimeRange | null {
  if (sessionCommits.length === 0) return null

  const times = sessionCommits.map((c) => new Date(c.date).getTime())
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)

  return {
    startTime: new Date(minTime),
    endTime: new Date(maxTime),
  }
}

/**
 * Checks if a date falls within a given time range.
 * 
 * @param dateStr - ISO date string
 * @param range - Time range with startTime and endTime
 * @returns True if date is within the range
 */
function isDateInRange(dateStr: string | null, range: SessionTimeRange | null): boolean {
  if (!dateStr || !range) return false
  const d = new Date(dateStr).getTime()
  return d >= range.startTime.getTime() && d <= range.endTime.getTime()
}

function getPRActivityTime(pr: PRItem): number {
  return new Date(pr.merged_at ?? pr.created_at).getTime()
}

function filterRecentPRs(prs: PRItem[]): PRItem[] {
  const cutoff = Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000
  return prs.filter((pr) => getPRActivityTime(pr) >= cutoff)
}

export async function generateActivitySummary(
  repoFullName: string,
  accessToken: string
): Promise<ActivitySummary | null> {
  if (!repoFullName) throw new Error('Invalid repoFullName')

  // Fetch data
  const prs = (await fetchPullRequests(repoFullName, accessToken)) as PRItem[]
  const commits = (await fetchCommits(repoFullName, accessToken)) as CommitItem[]
  const recentPRs = filterRecentPRs(prs)

  // Detect latest session from commits
  const sessionCommits = detectLatestSession(commits)
  const sessionTimeRange = extractSessionTimeRange(sessionCommits)

  // If no commits in session, fallback to PRs
  if (sessionCommits.length === 0) {
    if (recentPRs.length === 0) {
      return null
    }

    const primaryPR = recentPRs[0]
    const prDescription = primaryPR.body ?? ''

    return {
      what_changed: primaryPR.title,
      why_it_changed: prDescription,
      pr_title: primaryPR.title,
      pr_description: prDescription,
      commit_count: 0,
      notable_commits: [],
    }
  }

  // Filter PRs that fall within session time range
  const sessionPRs = prs.filter((p) => {
    const mergedDate = p.merged_at
    const createdDate = p.created_at
    return isDateInRange(mergedDate, sessionTimeRange) || isDateInRange(createdDate, sessionTimeRange)
  })

  // Collect texts from session commits and related PRs
  const texts: string[] = []

  // Prefer merged PRs as highlights
  const mergedPRs = sessionPRs.filter((p) => p.merged_at)
  mergedPRs.forEach((p) => texts.push(p.title))

  // Then other PRs
  sessionPRs.filter((p) => !p.merged_at).forEach((p) => texts.push(p.title))

  // Then commits
  sessionCommits.forEach((c) => texts.push(c.message))

  // Remove empties, duplicates, and filter trivial messages
  const trivialKeywords = new Set(['fix', 'update', 'test', 'wip'])
  const uniq = Array.from(
    new Set(
      texts.filter((t) => {
        if (!t || t.trim().length < 5) return false
        const lower = t.trim().toLowerCase()
        // Skip if message is just a trivial keyword
        return !trivialKeywords.has(lower)
      })
    )
  )

  if (uniq.length === 0) {
    return null
  }

  // Highlights: top 3-5, prefer longer/more descriptive messages
  const scored = uniq.map((t) => ({ t, score: t.length }))
  scored.sort((a, b) => b.score - a.score)
  const highlights = scored.slice(0, Math.min(5, scored.length)).map((s) => s.t)

  const notableCommits = Array.from(
    new Set(
      sessionCommits
        .map((c) => c.message)
        .filter((message) => {
          if (!message || message.trim().length < 5) return false
          const lower = message.trim().toLowerCase()
          return !trivialKeywords.has(lower)
        })
    )
  ).slice(0, 5)

  const primaryPR = sessionPRs[0] ?? recentPRs[0] ?? null
  const prTitle = primaryPR?.title ?? ''
  const prDescription = primaryPR?.body ?? ''

  const summary: ActivitySummary = {
    what_changed: prTitle || highlights[0] || '',
    why_it_changed: prDescription,
    pr_title: prTitle,
    pr_description: prDescription,
    commit_count: sessionCommits.length,
    notable_commits: notableCommits,
  }

  return summary
}
