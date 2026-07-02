import Anthropic from '@anthropic-ai/sdk';
import type { ActivitySummary } from '@/types/activity';

export type DraftStyle = 'raw' | 'polished' | 'short';

const CLAUDE_MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 500;

export const BANNED_PHRASES = [
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
] as const;

const SYSTEM_PROMPT = `You are a writing assistant that helps technical founders share their work on LinkedIn.
Your output must:
- Sound exactly like a text message to a smart technical friend, not a press release
- Reference specific technical details from the PR data provided
- Open with friction, struggle, or a surprising observation - NOT with the outcome
- Be 100-300 words, plain paragraphs only
- Never use hashtags, bullet points, or emojis
Your output must NEVER contain: ${BANNED_PHRASES.join(', ')}
The output should feel like it was written in 3 minutes by someone who just finished shipping, not by an AI.`;

const STYLE_INSTRUCTIONS: Record<DraftStyle, string> = {
  raw: 'Messy, honest voice. Open with failure or struggle. Do not polish the rough edges.',
  polished: 'Same honest content but cleaner sentence structure. Still human, not corporate.',
  short: 'Under 150 words. One insight. Punchy opening line. No filler.',
};

function createClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required to generate content drafts');
  }

  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

function buildUserPrompt(activity: ActivitySummary, styleInstruction: string): string {
  const commits =
    activity.notable_commits.length > 0
      ? activity.notable_commits.join(', ')
      : 'No notable commits provided';

  return `Here is what I shipped this week:
PR: ${activity.pr_title}
What changed: ${activity.what_changed}
Why: ${activity.why_it_changed}
Commits: ${commits}
Style: ${styleInstruction}
Write a LinkedIn post about this. Open with what was hard or surprising. Be specific. Sound like me, not ChatGPT.`;
}

function buildRetryPrompt(
  activity: ActivitySummary,
  styleInstruction: string,
  rejectedPhrases: string[],
): string {
  return `${buildUserPrompt(activity, styleInstruction)}

The previous draft was rejected because it contained these banned phrases: ${rejectedPhrases.join(', ')}.
Write a new draft from scratch. Do not include any rejected phrase or close variant.`;
}

function extractText(response: Anthropic.Messages.Message): string {
  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text.trim() : '';
}

export function findBannedPhrases(draft: string): string[] {
  const normalizedDraft = draft.toLowerCase();

  return BANNED_PHRASES.filter((phrase) => normalizedDraft.includes(phrase.toLowerCase()));
}

async function createDraft(client: Anthropic, userPrompt: string): Promise<string> {
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return extractText(response);
}

async function generateDraftWithRetry(
  activity: ActivitySummary,
  style: DraftStyle,
  rejectedPhrases: string[],
): Promise<string> {
  const client = createClient();
  const retryPrompt = buildRetryPrompt(activity, STYLE_INSTRUCTIONS[style], rejectedPhrases);

  return createDraft(client, retryPrompt);
}

export async function generateDraft(activity: ActivitySummary, style: DraftStyle): Promise<string> {
  const client = createClient();
  const draft = await createDraft(client, buildUserPrompt(activity, STYLE_INSTRUCTIONS[style]));
  const foundBannedPhrases = findBannedPhrases(draft);

  if (foundBannedPhrases.length > 0) {
    return generateDraftWithRetry(activity, style, foundBannedPhrases);
  }

  return draft;
}
