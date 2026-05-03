import { fetchPullRequests, PRItem, fetchCommits, CommitItem } from './github.service'

type ActivityType = 'bugfix' | 'feature' | 'mixed'

type ActivitySummary = {
  type: ActivityType | null
  highlights: string[]
  counts: {
    prs: number
    commits: number
  }
}

type SessionTimeRange = {
  startTime: Date
  endTime: Date
}

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

function classifyText(texts: string[]): 'bug' | 'feature' | 'refactor' | 'mixed' | null {
  const kBug = ['fix', 'bug', 'error', 'issue']
  const kFeature = ['add', 'implement', 'feature', 'create']
  const kRefactor = ['refactor', 'cleanup', 'optimize']

  let counts = { bug: 0, feature: 0, refactor: 0 }
  for (const t of texts) {
    const low = t.toLowerCase()
    for (const k of kBug) if (low.includes(k)) counts.bug++
    for (const k of kFeature) if (low.includes(k)) counts.feature++
    for (const k of kRefactor) if (low.includes(k)) counts.refactor++
  }
  const types = [] as string[]
  if (counts.bug > 0) types.push('bug')
  if (counts.feature > 0) types.push('feature')
  if (counts.refactor > 0) types.push('refactor')

  if (types.length === 0) return null
  if (types.length === 1) return types[0] as 'bug' | 'feature' | 'refactor'
  return 'mixed'
}

export async function generateActivitySummary(repoFullName: string, accessToken: string) {
  if (!repoFullName) throw new Error('Invalid repoFullName')

  // Fetch data
  const prs = (await fetchPullRequests(repoFullName, accessToken)) as PRItem[]
  const commits = (await fetchCommits(repoFullName, accessToken)) as CommitItem[]

  // Detect latest session from commits
  const sessionCommits = detectLatestSession(commits)
  const sessionTimeRange = extractSessionTimeRange(sessionCommits)

  // If no commits in session, fallback to PRs
  if (sessionCommits.length === 0) {
    if (prs.length === 0) {
      return { summary: null, message: 'No recent activity detected' }
    }

    // Fallback: use top PRs as highlights
    const texts: string[] = prs.slice(0, 5).map((p) => p.title)
    const type: ActivityType | null = 'mixed'

    return {
      summary: {
        type,
        highlights: texts,
        counts: { prs: prs.length, commits: 0 },
      },
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
    return { summary: null, message: 'No meaningful activity in latest session' }
  }

  // Classify activity type
  const cls = classifyText(uniq as string[])
  let type: ActivityType | null = null
  if (!cls) type = null
  else if (cls === 'bug') type = 'bugfix'
  else if (cls === 'feature') type = 'feature'
  else type = 'mixed'

  // Highlights: top 3-5, prefer longer/more descriptive messages
  const scored = uniq.map((t) => ({ t, score: t.length }))
  scored.sort((a, b) => b.score - a.score)
  const highlights = scored.slice(0, Math.min(5, scored.length)).map((s) => s.t)

  const summary: ActivitySummary = {
    type,
    highlights,
    counts: { prs: sessionPRs.length, commits: sessionCommits.length },
  }

  return { summary }
}

export type { ActivitySummary }
