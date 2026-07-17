import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateActivitySummary } from '@/services/activity.service'
import type { Session } from 'next-auth'
import { classifyGitHubError, classifyPrismaError, sendError } from '@/lib/errors'

type ActivitySession = Session & {
  user?: Session['user'] & {
    id?: string
    githubId?: string
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions)) as ActivitySession | null
  if (!session?.user) {
    return sendError(res, 'activity', 401, 'UNAUTHORIZED', 'Unauthorized')
  }

  // resolve current user similar to other routes
  let user
  try {
    if (session.user.id) user = await prisma.user.findUnique({ where: { id: session.user.id } })
    else if (session.user.email) user = await prisma.user.findUnique({ where: { email: session.user.email } })
    else if (session.user.githubId) user = await prisma.user.findUnique({ where: { githubId: session.user.githubId } })
  } catch (err) {
    const classified = classifyPrismaError(err)
    return sendError(
      res,
      'activity',
      classified?.status ?? 500,
      classified?.code ?? 'INTERNAL_ERROR',
      classified?.message ?? 'Failed to look up user',
      { message: err instanceof Error ? err.message : String(err) },
    )
  }

  if (!user || !user.accessToken) {
    return sendError(res, 'activity', 403, 'GITHUB_TOKEN_MISSING', 'Missing access token')
  }

  let repo
  try {
    repo = await prisma.repo.findFirst({ where: { userId: user.id } })
  } catch (err) {
    const classified = classifyPrismaError(err)
    return sendError(
      res,
      'activity',
      classified?.status ?? 500,
      classified?.code ?? 'INTERNAL_ERROR',
      classified?.message ?? 'Failed to look up selected repo',
      { userId: user.id, message: err instanceof Error ? err.message : String(err) },
    )
  }

  if (!repo) {
    return sendError(res, 'activity', 404, 'REPO_NOT_SELECTED', 'No repository selected')
  }

  try {
    const summary = await generateActivitySummary(repo.repoFullName, user.accessToken)

    if (!summary) {
      return res.status(200).json({ summary: null })
    }

    return res.status(200).json({ summary })
  } catch (err: unknown) {
    const githubError = classifyGitHubError(err)
    if (githubError) {
      return sendError(res, 'activity', githubError.status, githubError.code, githubError.message, {
        repoFullName: repo.repoFullName,
      })
    }
    const message = err instanceof Error ? err.message : 'Failed to generate activity summary'
    return sendError(res, 'activity', 502, 'ACTIVITY_GENERATION_FAILED', message, { repoFullName: repo.repoFullName })
  }
}
