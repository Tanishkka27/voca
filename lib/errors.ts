import type { NextApiResponse } from 'next'
import { Prisma } from '@prisma/client'

/**
 * Standard error response shape returned by every API route on failure.
 */
export type ApiErrorBody = {
  error: string
  code: string
}

export type ClassifiedError = {
  status: number
  code: string
  message: string
}

/**
 * Thrown by service-layer code that already knows the right HTTP status
 * and error code (e.g. an invalid/expired provider API key). Callers can
 * pull `.code` / `.status` off a caught error via `instanceof AppError`.
 */
export class AppError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status = 500) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}

/**
 * Logs a structured error and writes the standard { error, code } JSON body.
 * Every API route failure path should go through this so logging and the
 * response shape stay consistent.
 */
export function sendError(
  res: NextApiResponse,
  scope: string,
  status: number,
  code: string,
  message: string,
  context: Record<string, unknown> = {},
) {
  console.error(`[${scope}]`, { code, status, message, ...context })
  return res.status(status).json({ error: message, code })
}

/**
 * Structured logging for failures that don't directly end an HTTP response
 * (service-layer code, background retries, etc).
 */
export function logError(scope: string, message: string, context: Record<string, unknown> = {}): void {
  console.error(`[${scope}]`, { message, ...context })
}

const GITHUB_ERROR_PATTERN = /GitHub (?:API|PRs|commits) error: (\d+)/

/**
 * Parses the "GitHub API error: <status> - <body>" style messages thrown by
 * services/github.service.ts into a status/code/message the API layer can
 * return to the client instead of collapsing everything into a generic 502.
 */
export function classifyGitHubError(err: unknown): ClassifiedError | null {
  if (!(err instanceof Error)) return null
  const match = err.message.match(GITHUB_ERROR_PATTERN)
  if (!match) return null

  const status = Number(match[1])
  switch (status) {
    case 404:
      return {
        status: 404,
        code: 'GITHUB_404',
        message:
          "Repository not found or you don't have access to it. Check that it's public, or that your GitHub token has the right scope.",
      }
    case 403:
      return {
        status: 403,
        code: 'GITHUB_403',
        message: 'GitHub denied access — your token is missing the required scope for this repository.',
      }
    case 401:
      return {
        status: 401,
        code: 'GITHUB_401',
        message: 'Your GitHub token has expired or been revoked. Please sign out and sign in again.',
      }
    case 429:
      return {
        status: 429,
        code: 'GITHUB_RATE_LIMIT',
        message: 'GitHub API rate limit exceeded. Please try again shortly.',
      }
    default:
      return {
        status: 502,
        code: 'GITHUB_ERROR',
        message: `GitHub API returned an unexpected error (${status}).`,
      }
  }
}

const PRISMA_CONNECTION_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])

/**
 * Classifies Prisma errors (connection dropped, record not found, etc.) so
 * DB failures never surface as a raw stack trace with no JSON body.
 */
export function classifyPrismaError(err: unknown): ClassifiedError | null {
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      code: 'PRISMA_CONNECTION',
      message: 'Could not connect to the database. Please try again shortly.',
    }
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (PRISMA_CONNECTION_CODES.has(err.code)) {
      return {
        status: 503,
        code: 'PRISMA_CONNECTION',
        message: 'The database connection was lost mid-request. Please try again.',
      }
    }
    if (err.code === 'P2025') {
      return {
        status: 404,
        code: 'PRISMA_NOT_FOUND',
        message: 'The requested record was not found.',
      }
    }
  }

  return null
}

/**
 * Classifies Claude/Groq SDK errors into invalid-key, expired-key, and
 * rate-limit cases instead of collapsing all provider failures into one
 * generic error. Both SDKs throw an APIError with a `.status` matching the
 * upstream HTTP status.
 */
export function classifyProviderError(
  err: unknown,
  providerLabel: 'CLAUDE' | 'GROQ',
): { code: string; message: string } | null {
  const status = (err as { status?: number } | null | undefined)?.status
  const providerName = providerLabel === 'CLAUDE' ? 'Anthropic' : 'Groq'

  if (status === 401 || status === 403) {
    const rawMessage = err instanceof Error ? err.message : ''
    const expired = /expir/i.test(rawMessage)
    return expired
      ? {
          code: `${providerLabel}_EXPIRED_KEY`,
          message: `Your ${providerName} API key has expired. Update it in your environment and try again.`,
        }
      : {
          code: `${providerLabel}_INVALID_KEY`,
          message: `Your ${providerName} API key is invalid or missing. Check your API key configuration.`,
        }
  }

  if (status === 429) {
    return {
      code: `${providerLabel}_RATE_LIMIT`,
      message: `${providerName} API rate limit reached. Please wait a moment and try again.`,
    }
  }

  return null
}
