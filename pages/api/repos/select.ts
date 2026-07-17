import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'
import { saveSelectedRepo } from '@/services/github.service'
import { classifyPrismaError, sendError } from '@/lib/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'repos/select', 405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user) {
    return sendError(res, 'repos/select', 401, 'UNAUTHORIZED', 'Unauthorized')
  }

  const { repoName, repoFullName } = req.body as { repoName?: string; repoFullName?: string }
  if (!repoName || !repoFullName) {
    return sendError(res, 'repos/select', 400, 'VALIDATION_ERROR', 'Missing payload — repoName and repoFullName are required')
  }

  const sessionUser = session.user as { id?: string; email?: string | null }

  try {
    // resolve user id similar to GET handler
    let userId = sessionUser.id
    if (!userId && sessionUser.email) {
      const u = await prisma.user.findUnique({ where: { email: sessionUser.email } })
      userId = u?.id
    }
    if (!userId) {
      return sendError(res, 'repos/select', 403, 'PRISMA_NOT_FOUND', 'Unable to resolve user')
    }

    const record = await saveSelectedRepo(userId, repoName, repoFullName)
    // Provide redirect hint for client to navigate to the dynamic commits page (owner/repo/commits)
    const redirectPath = `/${repoFullName}/commits`
    res.setHeader('Location', redirectPath)
    return res.status(201).json({ repo: record, redirect: redirectPath })
  } catch (err) {
    const classified = classifyPrismaError(err)
    return sendError(
      res,
      'repos/select',
      classified?.status ?? 500,
      classified?.code ?? 'INTERNAL_ERROR',
      classified?.message ?? (err instanceof Error ? err.message : 'Failed to save selected repo'),
      { message: err instanceof Error ? err.message : String(err) },
    )
  }
}
