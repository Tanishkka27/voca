import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { fetchCommits } from '@/services/github.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any)
  if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' })

  // Step 1: Log session user id
  try {
    console.log('SESSION USER ID:', (session.user as any).id)
  } catch (e) {
    console.log('SESSION USER ID: <unavailable>')
  }

  // Resolve user lookup robustly: prefer id, fall back to email or githubId
  const userLookup: any = {}
  if (session.user.id) userLookup.id = session.user.id
  else if (session.user.email) userLookup.email = session.user.email
  else if ((session.user as any).githubId) userLookup.githubId = (session.user as any).githubId

  // Step 2: Log repo table
  try {
    const allRepos = await prisma.repo.findMany()
    console.log('ALL REPOS:', allRepos)
  } catch (e) {
    console.log('ALL REPOS: <error fetching repos>', e)
  }

  const repo = await prisma.repo.findFirst({ where: { userId: userLookup.id ?? (session.user.email ?? (session.user as any).githubId) } })
  if (!repo) return res.status(404).json({ error: 'No repository selected' })

  // Step 3: compare is visible in logs above

  const user = await prisma.user.findUnique({ where: userLookup })
  if (!user || !user.accessToken) return res.status(403).json({ error: 'Missing token' })

  try {
    const commits = await fetchCommits(repo.repoFullName, user.accessToken)
    const out = commits.map((c) => ({ message: c.message, date: c.date, author: c.author_login }))
    return res.status(200).json({ commits: out })
  } catch (e: any) {
    return res.status(502).json({ error: e.message || 'Failed to fetch commits' })
  }
}
