import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'
import { fetchUserRepos } from '@/services/github.service'
import { classifyGitHubError, classifyPrismaError, sendError } from '@/lib/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user) {
    return sendError(res, 'repos', 401, 'UNAUTHORIZED', 'Unauthorized')
  }

  const sessionUser = session.user as { id?: string; email?: string | null; githubId?: string }

  // get access token from DB (do not rely on client session)
  let user
  try {
    if (sessionUser.id) {
      user = await prisma.user.findUnique({ where: { id: sessionUser.id } })
    } else if (sessionUser.email) {
      user = await prisma.user.findUnique({ where: { email: sessionUser.email } })
    } else if (sessionUser.githubId) {
      user = await prisma.user.findUnique({ where: { githubId: sessionUser.githubId } })
    }
  } catch (err) {
    const classified = classifyPrismaError(err)
    return sendError(
      res,
      'repos',
      classified?.status ?? 500,
      classified?.code ?? 'INTERNAL_ERROR',
      classified?.message ?? 'Failed to look up user',
      { message: err instanceof Error ? err.message : String(err) },
    )
  }

  if (!user || !user.accessToken) {
    return sendError(res, 'repos', 403, 'GITHUB_TOKEN_MISSING', 'Missing access token')
  }

  try {
    const repos = await fetchUserRepos(user.accessToken)
    return res.status(200).json({ repos })
  } catch (err) {
    const githubError = classifyGitHubError(err)
    if (githubError) {
      return sendError(res, 'repos', githubError.status, githubError.code, githubError.message)
    }
    const message = err instanceof Error ? err.message : 'GitHub fetch failed'
    return sendError(res, 'repos', 502, 'GITHUB_ERROR', message)
  }
}
