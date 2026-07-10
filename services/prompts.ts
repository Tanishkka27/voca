export interface StructuralCheckResult {
  passed: boolean;
  failures: string[];
}

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

export function findBannedPhrases(draft: string): string[] {
  const normalizedDraft = draft.toLowerCase();
  return BANNED_PHRASES.filter((phrase) => normalizedDraft.includes(phrase.toLowerCase()));
}

// Resolution / completion / announcement language. If any of these appear in
// the opening sentence before a struggle signal, the draft leads with the win.
const OUTCOME_PATTERNS: readonly string[] = [
  'shipped',
  'launch',
  'launched',
  'finally',
  'proud',
  'excited',
  'thrilled',
  'delight',
  'announce',
  'announced',
  'released',
  'live now',
  'live in production',
  'success',
  'successfully',
  'completed',
  'finished',
  'done',
  'milestone',
  'happy to',
  'glad to',
  'just merged',
  'we shipped',
  'our team',
  'today we',
  'pleased to',
];

// Problem / struggle / surprising-observation language. Presence of this before
// any outcome language means the draft opens on the wall, not the victory.
const STRUGGLE_PATTERNS: readonly string[] = [
  'stuck',
  'broke',
  'broken',
  'bug',
  'bugs',
  'fail',
  'failed',
  'failing',
  'hard',
  'struggle',
  'struggled',
  'wasted',
  'annoying',
  'frustrat',
  'confus',
  'wrong',
  'pain',
  'mess',
  'messy',
  'nightmare',
  'debug',
  'debugging',
  'issue',
  'problem',
  'couldn',
  "couldn't",
  'wouldn',
  "wouldn't",
  'didn',
  "didn't",
  'wasn',
  "wasn't",
  'took hours',
  'took me',
  'surpris',
  'turns out',
  'why',
  'weird',
  'ugly',
  'hell',
  'trash',
  'blocked',
  'leak',
  'crash',
  'crashing',
  'timeout',
  'timed out',
  'no idea',
  'spent',
  'endless',
  'infinite',
  'loop',
];

// First-person "I" or candid/friction words. A draft with none of these AND no
// contractions AND no fragments is suspiciously clean = over-polished.
const FRICTION_MARKERS: readonly string[] = [
  'stuck',
  'broke',
  'broken',
  'wasted',
  'annoying',
  'frustrat',
  'turns out',
  'honestly',
  'tbh',
  'ugh',
  'weird',
  'not sure',
  'guess',
  'maybe',
  'kinda',
  'sort of',
  'eh',
  'hmm',
  'crap',
  'damn',
  'messy',
  'pain',
  'nightmare',
  'confus',
  'trash',
  'hell',
  'idk',
  'lol',
  'wtf',
];

const CONTRACTION_RE =
  /\b(?:it's|don't|didn't|doesn't|won't|can't|i'm|we're|you're|they're|that's|wasn't|isn't|i've|we've|they've|i'll|you'll|we'll|he's|she's|let's|ain't|aren't|haven't|hasn't|hadn't|wouldn't|couldn't|shouldn't)\b/i;

const RHYTHM_CV_THRESHOLD = 0.3;
const MIN_SENTENCES_FOR_RHYTHM = 3;
const FRAGMENT_MAX_WORDS = 4;

function splitSentences(draft: string): string[] {
  return draft
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countWords(sentence: string): number {
  return sentence.trim().split(/\s+/).filter(Boolean).length;
}

function earliestIndex(text: string, patterns: readonly string[]): number {
  let earliest = Infinity;
  for (const pattern of patterns) {
    const idx = text.indexOf(pattern);
    if (idx !== -1 && idx < earliest) {
      earliest = idx;
    }
  }
  return earliest;
}

function opensWithOutcome(firstSentence: string): boolean {
  const text = firstSentence.toLowerCase();
  const outcome = earliestIndex(text, OUTCOME_PATTERNS);
  if (outcome === Infinity) {
    return false;
  }
  const struggle = earliestIndex(text, STRUGGLE_PATTERNS);
  // Outcome language appears before any struggle language (or no struggle at all).
  return outcome < struggle;
}

function coefficientOfVariation(counts: number[]): number {
  const n = counts.length;
  if (n === 0) {
    return 0;
  }
  const mean = counts.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) {
    return 0;
  }
  const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  return sd / mean;
}

function hasHumanTexture(draft: string): boolean {
  if (CONTRACTION_RE.test(draft)) {
    return true;
  }
  const sentences = splitSentences(draft);
  if (sentences.some((s) => countWords(s) <= FRAGMENT_MAX_WORDS)) {
    return true;
  }
  const lowered = draft.toLowerCase();
  if (/\bi\b/i.test(lowered)) {
    return true;
  }
  return FRICTION_MARKERS.some((marker) => lowered.includes(marker));
}

export function checkStructure(draft: string): StructuralCheckResult {
  const failures: string[] = [];
  const sentences = splitSentences(draft);

  if (sentences.length === 0) {
    return { passed: true, failures: [] };
  }

  if (opensWithOutcome(sentences[0])) {
    failures.push('Rewrite so the post opens with a problem or friction, not the result.');
  }

  if (sentences.length >= MIN_SENTENCES_FOR_RHYTHM) {
    const counts = sentences.map(countWords);
    const cv = coefficientOfVariation(counts);
    if (cv < RHYTHM_CV_THRESHOLD) {
      failures.push(
        'Vary sentence lengths more — the rhythm is too uniform and reads like a press release.',
      );
    }
  }

  if (!hasHumanTexture(draft)) {
    failures.push(
      'Add a rough edge (a contraction, a short sentence fragment, or a candid aside) so it does not read over-polished.',
    );
  }

  return { passed: failures.length === 0, failures };
}
