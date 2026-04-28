import prisma from '@/lib/prisma'

type RepoItem = {
  name: string
  full_name: string
  private: boolean
  updated_at: string
}

export async function fetchUserRepos(accessToken: string) {
  const res = await fetch('https://api.github.com/user/repos?per_page=100', {
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API error: ${res.status} - ${text}`)
  }
  const data = (await res.json()) as RepoItem[]
  return data.map((r) => ({ name: r.name, full_name: r.full_name, private: r.private, updated_at: r.updated_at }))
}

export async function saveSelectedRepo(userId: string, repoName: string, repoFullName: string) {
  return prisma.repo.create({ data: { userId, repoName, repoFullName } })
}

// Fetch pull requests for given repoFullName (owner/repo)
export type PRItem = {
  title: string
  body: string | null
  state: string
  created_at: string
  merged_at: string | null
  user_login: string
}

export async function fetchPullRequests(repoFullName: string, accessToken: string) {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) throw new Error('Invalid repoFullName')
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?per_page=50&state=all`, {
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub PRs error: ${res.status} - ${text}`)
  }
  const data = await res.json()
  const prs: PRItem[] = (data as any[])
    .map((p) => ({
      title: p.title ?? '',
      body: p.body ?? null,
      state: p.state ?? '',
      created_at: p.created_at ?? '',
      merged_at: p.merged_at ?? null,
      user_login: p.user?.login ?? 'unknown',
    }))
    .filter((p) => p.title && p.title.length >= 5)
  // prefer merged PRs and limit to last 10
  prs.sort((a, b) => {
    const aTime = new Date(a.merged_at ?? a.created_at).getTime()
    const bTime = new Date(b.merged_at ?? b.created_at).getTime()
    return bTime - aTime
  })
  return prs.slice(0, 10)
}

// Fetch commits for a given repoFullName (owner/repo)
export type CommitItem = {
  message: string
  date: string
  author_login: string
}

export async function fetchCommits(repoFullName: string, accessToken: string) {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) throw new Error('Invalid repoFullName')
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, {
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub commits error: ${res.status} - ${text}`)
  }
  const data = await res.json()
  const raw = (data as any[])
    .map((c) => ({
      message: c.commit?.message ?? '',
      date: c.commit?.author?.date ?? '',
      author_login: c.author?.login ?? c.commit?.author?.name ?? 'unknown',
    }))
    .filter((c) => c.message && c.message.length >= 5)
  // Exclude trivial messages
  const trivial = new Set(['fix', 'update', 'test', 'wip'])
  const filtered = raw.filter((c) => !trivial.has(c.message.trim().toLowerCase()))
  // Remove duplicates by message+author+date
  const seen = new Set<string>()
  const unique: CommitItem[] = []
  for (const c of filtered) {
    const key = `${c.message}||${c.author_login}||${c.date}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(c)
    }
  }
  // Sort by date desc and limit to 20
  unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return unique.slice(0, 20)
}
