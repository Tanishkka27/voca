import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { type NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import prisma from "@/lib/prisma"
import { logError } from "@/lib/errors"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma as any),
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist access token and basic github info into the JWT (server-side)
      if (account?.access_token) token.accessToken = account.access_token
      if (account?.providerAccountId) token.githubId = account.providerAccountId
      if (profile && (profile as any).login) token.username = (profile as any).login
      return token
    },
    async session({ session, token }) {
      // Do NOT expose accessToken to the client-side session
      // Keep session payload unchanged for client usage
      return session
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      // On sign in, store/update GitHub identifiers and access token in DB
      try {
        if (account?.access_token) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              accessToken: account.access_token,
              githubId: account.providerAccountId ?? undefined,
              username: (profile as any)?.login ?? undefined,
            },
          })
        }
      } catch (err) {
        // Non-fatal: user might not exist yet or the adapter already created
        // it. Still logged so a real DB failure here isn't invisible.
        logError('auth', 'Failed to persist GitHub access token on sign-in', {
          userId: user.id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export async function getServerAuthSession() {
  // Helper for server-side components to access the session (without exposing token to client)
  const { getServerSession } = await import("next-auth")
  return await getServerSession(authOptions)
}
