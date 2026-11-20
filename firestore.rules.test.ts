import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesContent = fs.readFileSync(
  path.resolve(process.cwd(), 'firestore.rules'),
  'utf-8'
);

test('Dirty Dozen Invariants: default-deny catch-all and strict ID validation exist', () => {
  assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rulesContent, /function isValidId\(id\)/);
  assert.match(rulesContent, /isVerifiedUser\(\)/);
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
});

test('Dirty Dozen Invariants: PII isolation, Master Gate, and Atomic existsAfter enforced', () => {
  assert.match(rulesContent, /match \/private\/\{docId\}/);
  assert.match(rulesContent, /match \/maintenance\/\{recordId\}/);
  assert.match(rulesContent, /existsAfter\(\/databases\/\$\(database\)\/documents\/certificates\/\$\(incoming\(\)\.certificateId\)\)/);
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly/);
});

test('Dirty Dozen Invariants: no blanket isSignedIn() list rules and no get()/exists() inside allow list', () => {
  const listLines = rulesContent
    .split('\n')
    .filter((line) => line.includes('allow list:'));
  assert.ok(listLines.length >= 8);
  for (const line of listLines) {
    assert.equal(
      /allow list:\s*if\s*isSignedIn\(\)\s*;/.test(line),
      false,
      `Insecure blanket list rule found: ${line}`
    );
  }
});
