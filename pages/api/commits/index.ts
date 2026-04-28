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

  // Try to find selected repo for this user
  let repo = await prisma.repo.findFirst({ where: { userId: currentUser.id } })
  if (!repo) {
    // No repo linked to this user — attempt to find a repo by full name and re-link it
    const candidate = await prisma.repo.findFirst({ where: { repoFullName: { contains: '' } } })
    // If a matching repoFullName exists we can choose to relink; safer approach: try to find exact repoFullName from recent entries
    const all = await prisma.repo.findMany({ where: { repoFullName: { contains: '' } }, take: 50 })
    // Log and attempt to find a repo that matches the actor's GitHub username if available
    console.log('Attempting to auto-relink: user=', currentUser.id, 'session.user=', session.user)
    if ((session.user as any).username) {
      const match = await prisma.repo.findFirst({ where: { repoFullName: { contains: (session.user as any).username } } })
      if (match) {
        console.log('Auto-relinking repo', match.repoFullName, 'to user', currentUser.id)
        await prisma.repo.update({ where: { id: match.id }, data: { userId: currentUser.id } })
        repo = match
      }
    }
  }

  if (!repo) return res.status(404).json({ error: 'No repository selected' })

  // Step 3: compare is visible in logs above

  const user = currentUser
  if (!user || !user.accessToken) return res.status(403).json({ error: 'Missing token' })

  try {
    const commits = await fetchCommits(repo.repoFullName, user.accessToken)
    const out = commits.map((c) => ({ message: c.message, date: c.date, author: c.author_login }))
    return res.status(200).json({ commits: out })
  } catch (e: any) {
    return res.status(502).json({ error: e.message || 'Failed to fetch commits' })
  }
}
