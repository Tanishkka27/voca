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

function withinLastHours(dateStr: string, hours = 24) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const cutoff = Date.now() - hours * 3600 * 1000
  return d.getTime() >= cutoff
}

function classifyText(texts: string[]) {
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
  if (types.length === 1) return types[0]
  return 'mixed'
}

export async function generateActivitySummary(repoFullName: string, accessToken: string) {
  if (!repoFullName) throw new Error('Invalid repoFullName')
  // fetch data
  const prs = (await fetchPullRequests(repoFullName, accessToken)) as PRItem[]
  const commits = (await fetchCommits(repoFullName, accessToken)) as CommitItem[]

  // filter last 24 hours
  const recentPRs = prs.filter((p) => withinLastHours(p.created_at ?? p.merged_at ?? '', 24))
  const recentCommits = commits.filter((c) => withinLastHours(c.date, 24))

  const texts: string[] = []
  // prefer merged PRs as highlights
  const mergedPRs = recentPRs.filter((p) => p.merged_at)
  mergedPRs.forEach((p) => texts.push(p.title))
  // then other PRs
  recentPRs.filter((p) => !p.merged_at).forEach((p) => texts.push(p.title))
  // commits
  recentCommits.forEach((c) => texts.push(c.message))

  // remove empties and duplicates
  const uniq = Array.from(new Set(texts.filter((t) => t && t.trim().length >= 5)))

  if (uniq.length === 0) {
    return { summary: null, message: 'No meaningful activity in last 24 hours' }
  }

  // classify
  const cls = classifyText(uniq as string[])
  let type: ActivityType | null = null
  if (!cls) type = null
  else if (cls === 'bug') type = 'bugfix'
  else if (cls === 'feature') type = 'feature'
  else if (cls === 'refactor') type = 'mixed'
  else type = 'mixed'

  // highlights: top 3-5 — prefer merged PRs and longer messages
  const scored = uniq.map((t) => ({ t, score: t.length }))
  scored.sort((a, b) => b.score - a.score)
  const highlights = scored.slice(0, Math.min(5, scored.length)).map((s) => s.t)

  const summary: ActivitySummary = {
    type,
    highlights,
    counts: { prs: recentPRs.length, commits: recentCommits.length },
  }

  return { summary }
}

export type { ActivitySummary }
