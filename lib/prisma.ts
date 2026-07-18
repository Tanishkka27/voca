import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

const prisma = global.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') global.prisma = prisma

// Prisma connects lazily on first query, so a bad DATABASE_URL or an
// unreachable Supabase instance would otherwise stay silent until whichever
// request happens to run first. Eagerly connecting at import time surfaces
// that failure in the server logs immediately instead.
prisma.$connect().catch((err: unknown) => {
  console.error('[lib/prisma]', {
    message: 'Failed to connect to the database at startup',
    error: err instanceof Error ? err.message : String(err),
  })
})

export default prisma
