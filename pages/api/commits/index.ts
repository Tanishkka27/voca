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

  // Resolve user record from DB if session.user.id missing
  let currentUser = null
  if (userLookup.id) {
    currentUser = await prisma.user.findUnique({ where: { id: userLookup.id } })
  } else if (userLookup.email) {
    currentUser = await prisma.user.findUnique({ where: { email: userLookup.email } })
  } else if (userLookup.githubId) {
    currentUser = await prisma.user.findUnique({ where: { githubId: userLookup.githubId } })
  }

  if (!currentUser) {
    console.log('Could not resolve current user from session:', session.user)
    return res.status(403).json({ error: 'Unable to resolve user' })
  }

  // If owner/repo provided as query parameters, use them; otherwise fall back to user's selected repo in DB
  const { owner, repo: repoParam } = req.query as { owner?: string; repo?: string }

  let repoFullName: string | null = null
  if (owner && repoParam) {
    repoFullName = `${owner}/${repoParam}`
  } else {
    // Try to find selected repo for this user
    let repo = await prisma.repo.findFirst({ where: { userId: currentUser.id } })
    if (!repo) return res.status(404).json({ error: 'No repository selected' })
    repoFullName = repo.repoFullName
  }

  const user = currentUser
  if (!user || !user.accessToken) return res.status(403).json({ error: 'Missing token' })

  try {
    const commits = await fetchCommits(repoFullName, user.accessToken)
    const out = commits.map((c) => ({ message: c.message, date: c.date, author: c.author_login }))
    return res.status(200).json({ commits: out, repoFullName })
  } catch (e: any) {
    return res.status(502).json({ error: e.message || 'Failed to fetch commits' })
  }
}
