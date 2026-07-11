import { generateDraft, validateDraft, findBannedPhrases, BANNED_PHRASES } from './content.service';

if (typeof generateDraft !== 'function') throw new Error('generateDraft is undefined at module load');
if (typeof validateDraft !== 'function') throw new Error('validateDraft is undefined at module load');
if (typeof findBannedPhrases !== 'function') throw new Error('findBannedPhrases is undefined at module load');
if (!Array.isArray(BANNED_PHRASES) || (BANNED_PHRASES as readonly string[]).length === 0) throw new Error('BANNED_PHRASES is empty or undefined at module load');
console.log('SMOKE_TEST_PASSED: all content.service exports load correctly');
