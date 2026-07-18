import { checkStructure } from './prompts';

// NOTE: checkStructure is the canonical structural quality gate. It is imported
// by content.service.ts (via ./prompts) and wired into validateDraft() alongside
// the banned-phrase lexical check. A change to the logic here affects live
// generation validation.

interface Example {
  name: string;
  draft: string;
  expectPass: boolean;
}

const EXAMPLES: Example[] = [
  {
    name: 'Press-release (should FAIL)',
    expectPass: false,
    draft:
      'We are excited to announce the launch of our new developer platform. ' +
      'Our team has delivered a scalable solution that empowers engineering teams everywhere. ' +
      'The product represents a major milestone for the company. ' +
      'Customers will benefit from faster performance and greater reliability.',
  },
  {
    name: 'Human / messy (should PASS)',
    expectPass: true,
    draft:
      'spent all night wondering why our commit logs looked like a trash fire. ' +
      'the old 24h window was grouping completely unrelated coding sessions. ' +
      'it was impossible to see what actually shipped. ' +
      'ended up throwing that out and rewriting it to detect sessions dynamically. ' +
      'now we group commits based on a 3-hour proximity gap and stop collecting once we hit 8 commits. ' +
      'tested the new detectLatestSession helper on some of our messiest repos and the logs finally look like real human work. ' +
      'also added a time boundary helper for pr correlation. ' +
      'edge cases are resolved. not sure this is right yet, but it works.',
  },
  {
    name: 'Borderline (opens with friction but uniform rhythm — should FAIL on rhythm)',
    expectPass: false,
    draft:
      'We got stuck on a nasty bug in the auth flow. ' +
      'The login page kept crashing for users on Safari. ' +
      'I added a retry loop and the error went away. ' +
      'The fix is now live in production.',
  },
];

function run(): void {
  let allOk = true;

  for (const example of EXAMPLES) {
    const result = checkStructure(example.draft);
    const passed = result.passed;
    const ok = passed === example.expectPass;
    if (!ok) {
      allOk = false;
    }

    console.log(`\n=== ${example.name} ===`);
    console.log(`expected pass: ${example.expectPass} | actual pass: ${passed} | ${ok ? 'OK' : 'MISMATCH'}`);
    if (result.failures.length > 0) {
      console.log('failures:');
      for (const failure of result.failures) {
        console.log(`  - ${failure}`);
      }
    }
  }

  if (!allOk) {
    console.error('\nSome examples did not match expected outcome.');
    process.exit(1);
  }
  console.log('\nAll structural-check examples matched expected outcome.');
}

run();
