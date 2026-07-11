import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ActivitySummary } from '@/types/activity';
import type { GenerationResult, DraftSuccess, DraftError } from '@/types/generation';
import { findBannedPhrases, BANNED_PHRASES, checkStructure as checkStructureResult } from './prompts';

export { findBannedPhrases, BANNED_PHRASES };


export type DraftStyle = 'raw' | 'polished' | 'short';

export type Provider = 'groq' | 'claude';

const CLAUDE_MODEL = 'claude-opus-4-8';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const MAX_TOKENS = 500;

const SYSTEM_PROMPT = `You are a writing assistant that helps technical founders share their work on LinkedIn.

Your output must:
- Sound exactly like a text message to a smart technical friend, not a press release. Use contractions (it's, didn't) and casual, conversational tone.
- Reference specific technical details from the PR data provided (e.g. exact function names, specific file names, or exact commit messages).
- Open with friction, struggle, a bug, or a surprising observation — NOT with the outcome or victory.
- Be plain text paragraphs only. No markdown formatting (no bold **, no headers), no hashtags (#), no emojis, and no bullet points or lists of any kind.
- NEVER use em dashes (—). Use regular dashes (-) or commas instead.
- Vary sentence lengths aggressively to kill uniform rhythm. Mix very short, punchy sentence fragments (under 8 words) with longer, messy ones. Real human writing is uneven.
- Leave in at least one rough edge: an unfinished thought, a self-doubt aside ("not sure this is right yet"), a tangent, or a typo-ish casual phrasing. Do NOT polish it into a press release.
- Never use any of the following banned words or phrases:
${BANNED_PHRASES.map((w) => `  - ${w}`).join('\n')}

The output should feel like it was written in 3 minutes by someone who just finished shipping, not by an AI.`;

const STYLE_INSTRUCTIONS: Record<DraftStyle, string> = {
  raw: 'Messy, honest voice. Open with failure or struggle. Do not polish the rough edges. Keep the imperfections in.',
  polished: 'Same honest content but cleaner sentence structure. Still human, not corporate. Keep one rough edge so it does not read like marketing.',
  short: 'Under 150 words. One insight. Punchy opening line. No filler.',
};

const STOP_WORDS = new Set([
  'feat', 'fix', 'refactor', 'chore', 'test', 'tests', 'docs', 'style',
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'by',
  'of', 'at', 'from', 'into', 'is', 'it', 'this', 'that', 'these', 'those',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'our', 'we', 'i', 'you', 'they', 'he', 'she', 'my', 'me', 'us',
]);

function getProvider(): Provider {
  const raw = (process.env.VOCA_PROVIDER || 'groq').toLowerCase();
  return raw === 'claude' ? 'claude' : 'groq';
}

function createClient(provider: Provider): Anthropic | OpenAI {
  if (provider === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required to generate content drafts with the Claude provider');
    }
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required to generate content drafts with the Groq provider');
  }
  return new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: GROQ_BASE_URL });
}

function buildUserPrompt(activity: ActivitySummary, styleInstruction: string): string {
  const commits =
    activity.notable_commits.length > 0
      ? activity.notable_commits.map((c) => `- ${c}`).join('\n')
      : 'No notable commits';

  return `Here is what I shipped:
PR Title: ${activity.pr_title}
PR Description: ${activity.pr_description}
What changed: ${activity.what_changed}
Why it changed: ${activity.why_it_changed}
Notable Commits:
${commits}

Style Instruction: ${styleInstruction}

Write a LinkedIn post about this. Remember:
1. Open with what was hard, surprising, or broken (friction first). Name the wall before the victory.
2. Sound like a smart developer texting a coworker on their phone.
3. Be specific (reference actual commits, function names, or the PR title).
4. No hashtags, no emojis, no bullet points, no markdown formatting (no bold/headers), no em-dashes (—).
5. Vary sentence length hard. Throw in at least one short fragment and one longer messy sentence.
6. Leave in one rough edge or honest aside. Do not sound like a press release.`;
}

function buildRetryPrompt(
  activity: ActivitySummary,
  styleInstruction: string,
  bannedPhrases: string[],
  structuralFailures: string[],
  errors: string[],
): string {
  let feedbackParts: string[] = [];
  if (bannedPhrases.length > 0) {
    feedbackParts.push(`[banned phrases: ${bannedPhrases.join(', ')}]`);
  }
  if (structuralFailures.length > 0) {
    feedbackParts.push(`[structural: ${structuralFailures.join('; ')}]`);
  }

  // Formatting / specificity errors
  const otherErrors = errors.filter((err) =>
    !err.startsWith('Contains banned phrases') &&
    !err.startsWith('Structural issue:')
  );
  if (otherErrors.length > 0) {
    feedbackParts.push(`[formatting: ${otherErrors.join(', ')}]`);
  }

  const feedbackStr = feedbackParts.join(' ');

  return `${buildUserPrompt(activity, styleInstruction)}\n\nThe previous draft was rejected for: ${feedbackStr}\n\nPlease write a new draft from scratch that strictly resolves all the above issues. Do not include any of the rejected content or patterns. Pay special attention to opening with friction, varying rhythm, and keeping a human voice.`;
}

async function createDraft(client: Anthropic | OpenAI, provider: Provider, userPrompt: string): Promise<string> {
  if (provider === 'claude') {
    const response = await (client as Anthropic).messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text.trim() : '';
  }

  const response = await (client as OpenAI).chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? '';
}

export function getTechnicalKeywords(activity: ActivitySummary): string[] {
  const text = [activity.pr_title, ...activity.notable_commits].join(' ');
  const words = text.toLowerCase().match(/[a-z0-9_-]{3,}/g) || [];
  const uniqueWords = Array.from(new Set(words));
  return uniqueWords.filter((word) => !STOP_WORDS.has(word));
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateDraft(
  draft: string,
  activity: ActivitySummary,
  style: DraftStyle,
): string[] {
  const errors: string[] = [];

  // 1. Banned Phrases Check
  const foundBanned = findBannedPhrases(draft);
  if (foundBanned.length > 0) {
    errors.push(`Contains banned phrases: ${foundBanned.join(', ')}`);
  }

  // 2. Formatting: em dash
  if (draft.includes('—')) {
    errors.push('Contains em-dashes (—). Replace with regular dashes (-) or commas.');
  }

  // 3. Formatting: hashtags
  if (/#\w+/g.test(draft)) {
    errors.push('Contains hashtags (#). Remove all hashtags.');
  }

  // 4. Formatting: bullet points / numbered lists
  if (/^\s*([-*•]|\d+\.)\s/m.test(draft)) {
    errors.push('Contains bullet points or numbered lists. Write in plain paragraphs only.');
  }

  // 5. Formatting: markdown bold/headers
  if (/\*\*|__|^#+\s/m.test(draft)) {
    errors.push('Contains markdown formatting (bold/headers). Output plain text only.');
  }

  // 6. Formatting: emojis
  if (/\p{Emoji_Presentation}/u.test(draft)) {
    errors.push('Contains emojis. Remove all emojis.');
  }

  // 7. Word Count Check
  const count = wordCount(draft);
  if (style === 'short') {
    if (count >= 150) {
      errors.push(`Short style draft must be under 150 words (current: ${count}).`);
    }
  } else if (count < 100 || count > 300) {
    errors.push(`Draft must be between 100 and 300 words (current: ${count}).`);
  }

  // 8. Structural Quality Gate (independent check alongside banned-phrase check)
  const structuralResult = checkStructureResult(draft);
  structuralResult.failures.forEach(f => errors.push(`Structural issue: ${f}`));

  // 9. Specificity Check (fuzzy keyword match)
  const keywords = getTechnicalKeywords(activity);
  if (keywords.length > 0) {
    const normalizedDraft = draft.toLowerCase();
    const matchCount = keywords.filter((word) => normalizedDraft.includes(word)).length;
    if (matchCount < 1) {
      errors.push(
        `Draft is not specific enough. It must reference key technical details like: ${keywords.join(', ')}.`,
      );
    }
  }

  return errors;
}

export async function generateDraft(activity: ActivitySummary, style: DraftStyle): Promise<string> {
  const provider = getProvider();
  const client = createClient(provider);
  const styleInstruction = STYLE_INSTRUCTIONS[style];

  // First attempt
  let draft = await createDraft(client, provider, buildUserPrompt(activity, styleInstruction));

  // Validate
  const errors = validateDraft(draft, activity, style);

  if (errors.length > 0) {
    (global as Record<string, unknown>).vocaRetried = true;
    const bannedPhrases = findBannedPhrases(draft);
    const structuralResult = checkStructureResult(draft);
    const structuralFailures = structuralResult.failures;
    // Retry exactly once with detailed, named feedback
    const retryPrompt = buildRetryPrompt(activity, styleInstruction, bannedPhrases, structuralFailures, errors);
    draft = await createDraft(client, provider, retryPrompt);

    // If the retried draft still fails, DO NOT ship it silently. Throw so the
    // caller (Promise.allSettled in #15) records a rejection instead of
    // posting a drifting, generic-AI draft to LinkedIn.
    const retryErrors = validateDraft(draft, activity, style);
    if (retryErrors.length > 0) {
      throw new Error(
        `Draft generation failed validation after retry (provider=${provider}, style=${style}).\nRemaining issues:\n- ${retryErrors.join('\n- ')}`,
      );
    }
  }

  return draft;
}

// ---------------------------------------------------------------------------
// VOC-126 — Multi-style parallel generation
// ---------------------------------------------------------------------------

const DRAFT_TIMEOUT_MS = 20_000; // 20 seconds per individual draft

/**
 * Races a draft generation promise against a timeout.
 * Rejects with a timeout error if the generation exceeds DRAFT_TIMEOUT_MS.
 */
function withTimeout(promise: Promise<string>, style: DraftStyle): Promise<string> {
  return Promise.race([
    promise,
    new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Draft generation timed out after ${DRAFT_TIMEOUT_MS / 1000}s (style=${style})`)),
        DRAFT_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Generates all 3 style variations in parallel using Promise.allSettled.
 *
 * Key guarantees:
 * - All 3 styles are requested simultaneously (never sequentially).
 * - If 1 or 2 styles fail (or time out), the successful drafts are still returned.
 * - If all 3 fail, returns an empty drafts array with 3 errors — never throws.
 * - Total wall time is bounded by the slowest single call (target < 25 s).
 * - Each individual call is capped at DRAFT_TIMEOUT_MS (20 s).
 */
export async function generateAllDrafts(
  activity: ActivitySummary,
): Promise<GenerationResult> {
  const styles: DraftStyle[] = ['raw', 'polished', 'short'];
  const wallStart = Date.now();

  const results = await Promise.allSettled(
    styles.map(style => withTimeout(generateDraft(activity, style), style)),
  );

  const wallMs = Date.now() - wallStart;
  console.info(`[VOC-126] generateAllDrafts: all 3 styles settled in ${wallMs}ms`);

  const drafts: DraftSuccess[] = [];
  const errors: DraftError[] = [];

  results.forEach((result, i) => {
    const style = styles[i];
    if (result.status === 'fulfilled') {
      drafts.push({ style, content: result.value, success: true });
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason ?? 'Unknown error');
      errors.push({ style, error: message, success: false });
    }
  });

  return {
    drafts,
    errors,
    generatedAt: new Date().toISOString(),
    activitySummary: activity,
  };
}
