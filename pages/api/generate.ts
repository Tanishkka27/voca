import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateActivitySummary } from '@/services/activity.service'
import { generateAllDrafts } from '@/services/content.service'
import type { GenerationResult } from '@/types/generation'

type ErrorResponse = { error: string }
type NoActivityResponse = { noActivity: true; message: string }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerationResult | ErrorResponse | NoActivityResponse>,
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check — session exists but accessToken is NOT in the JWT payload exposed
  // to the session object (deliberately excluded in auth.ts callbacks.session).
  // We resolve it from the DB using the session user identifiers instead.
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Resolve the full User record (which holds the GitHub access token)
  const { id, email } = session.user as { id?: string; email?: string | null }

  const user = id
    ? await prisma.user.findUnique({ where: { id } })
    : email
    ? await prisma.user.findUnique({ where: { email } })
    : null

  if (!user || !user.accessToken) {
    return res.status(403).json({ error: 'Missing access token — please sign out and sign in again' })
  }

  // Resolve the stored repo for this user
  const repo = await prisma.repo.findFirst({ where: { userId: user.id } })
  if (!repo) {
    return res.status(404).json({ error: 'No repository selected. Add a repo first.' })
  }

  try {
    // Build activity summary from GitHub
    const activity = await generateActivitySummary(repo.repoFullName, user.accessToken)

    // No recent commits / PRs found — not an error
    if (!activity) {
      return res.status(200).json({ noActivity: true, message: 'No recent activity found' })
    }

    // Generate all 3 style drafts in parallel (Promise.allSettled inside)
    const result: GenerationResult = await generateAllDrafts(activity)

    return res.status(200).json(result)
  } catch (err: unknown) {
    const isGitHub404 =
      err instanceof Error && err.message.toLowerCase().includes('404')

    if (isGitHub404) {
      return res.status(404).json({
        error: `Repository "${repo.repoFullName}" was not found or you don't have access. Check that it's a public repo or that your GitHub token has the right scope.`,
      })
    }

    const message = err instanceof Error ? err.message : 'Failed to generate drafts'
    return res.status(502).json({ error: message })
  }
}
