"use client"

import { signIn, useSession } from "next-auth/react"
import React from "react"

export default function GithubLoginButton() {
  const { status } = useSession()
  return (
    <button
      onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
      className="inline-flex items-center px-4 py-2 bg-black text-white rounded-md hover:opacity-90"
      disabled={status === "loading"}
    >
      Continue with GitHub
    </button>
  )
}
