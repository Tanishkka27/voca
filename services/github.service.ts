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
