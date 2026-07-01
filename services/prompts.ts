import type { ActivitySummary } from '../types/activity'

export type PostStyle = 'raw' | 'polished' | 'short'

export const BANNED_PHRASES: string[] = [
  'leverage',
  'leveraging',
  'synergy',
  'synergistic',
  'game-changer',
  'game-changing',
  'excited to announce',
  'thrilled to share',
  'delighted to',
  "in today's fast-paced world",
  'as a founder',
  'as an entrepreneur',
  "in today's world",
  'unlock',
  'unleash',
  'revolutionize',
  'disrupt',
  'innovative solution',
  'cutting-edge',
  'seamlessly',
  'circle back',
  'take it to the next level',
  'move the needle',
  'at the end of the day',
]

export const SYSTEM_PROMPT = `You are a writing assistant that helps technical founders share their work on LinkedIn.

Your output must:
- Sound exactly like a text message to a smart technical friend, not a press release
- Reference specific technical details from the PR data provided (the PR title or a named commit)
- Open with friction, struggle, or a surprising observation — NOT with the outcome or victory
- Be 100-300 words, plain paragraphs only
- Never use hashtags, bullet points, or emojis

Your output must NEVER contain any of these words or phrases, in any form: ${BANNED_PHRASES.join(', ')}.

The output should feel like it was written in 3 minutes by someone who just finished shipping, not by an AI. Return only the post text — no preamble, no markdown, no quotation marks.`

const STYLE_INSTRUCTIONS: Record<PostStyle, string> = {
  raw: 'Messy, honest voice. Open with failure or struggle. Do not polish the rough edges. Short, choppy sentences are fine.',
  polished: 'Same honest content but cleaner sentence structure. Still human, not corporate. Complete sentences, clear arc from problem to what you shipped.',
  short: 'Under 150 words. One insight. Punchy opening line. No filler. Every sentence earns its place.',
}

export function buildUserPrompt(activity: ActivitySummary, style: PostStyle): string {
  return `Here is what I shipped this week:

PR: ${activity.pr_title}
What changed: ${activity.what_changed}
Why: ${activity.why_it_changed}
Commits (${activity.commit_count} total): ${activity.notable_commits.join(', ')}

${STYLE_INSTRUCTIONS[style]}

Write a LinkedIn post about this. Open with what was hard or surprising. Be specific — name the PR title or a commit. Sound like me, not ChatGPT.`
}

export function findBannedPhrases(draft: string): string[] {
  const lower = draft.toLowerCase()
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()))
}

export function buildRetryPrompt(
  previousDraft: string,
  bannedFound: string[],
  activity: ActivitySummary,
  style: PostStyle
): string {
  return `Your previous draft contained these banned words/phrases: ${bannedFound.join(', ')}.

Previous draft:
"""
${previousDraft}
"""

Rewrite it completely without those words or any close synonyms of them. Keep the friction-first opening and the specific technical detail. Do not just delete the banned words — rewrite the sentences naturally.

${buildUserPrompt(activity, style)}`
}