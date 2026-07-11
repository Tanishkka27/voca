import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateActivitySummary } from '@/services/activity.service'
import { generateAllDrafts } from '@/services/content.service'
import type { GenerationResult } from '@/types/generation'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check
  const session = await getServerSession(req, res, authOptions as any)
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Resolve user from session
  let user = null
  const sessionUser = (session as any).user
  if (sessionUser.id) {
    user = await prisma.user.findUnique({ where: { id: sessionUser.id } })
  } else if (sessionUser.email) {
    user = await prisma.user.findUnique({ where: { email: sessionUser.email } })
  } else if (sessionUser.githubId) {
    user = await prisma.user.findUnique({ where: { githubId: sessionUser.githubId } })
  }

  if (!user || !user.accessToken) {
    return res.status(403).json({ error: 'Missing access token' })
  }

  // Get selected repo
  const repo = await prisma.repo.findFirst({ where: { userId: user.id } })
  if (!repo) {
    return res.status(404).json({ error: 'No repository selected' })
  }

  try {
    // Get activity summary from GitHub
    const activity = await generateActivitySummary(repo.repoFullName, user.accessToken)

    // No recent activity found
    if (!activity) {
      return res.status(200).json({ noActivity: true, message: 'No recent activity found' })
    }

    // Generate all 3 drafts in parallel
    const result: GenerationResult = await generateAllDrafts(activity)

    return res.status(200).json(result)
  } catch (e: any) {
    return res.status(502).json({ error: e.message || 'Failed to generate drafts' })
  }
}