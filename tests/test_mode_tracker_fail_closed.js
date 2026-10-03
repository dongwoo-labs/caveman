#!/usr/bin/env node
// Fail-closed contract of the UserPromptSubmit hook (DONGWOO-2168):
//   - missing/invalid session_id: no state file, no mode log, no output
//   - session state write fails: no switch reported, no reinforcement
//   - write fails while turning an active 'lite' session off: not reported as
//     off, and the stored 'lite' is kept
// A positive control proves the harness can observe a successful switch.
//
// Write failure is forced by making .caveman-sessions read-only (0500), so
// safeWriteFlag's temp-file create fails. Everything runs in a throwaway
// CLAUDE_CONFIG_DIR / HOME; the real ~/.claude is never touched.
//
// Run: node tests/test_mode_tracker_fail_closed.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.resolve(__dirname, '..', 'src', 'hooks', 'caveman-mode-tracker.js');
const SID = 'sess-fail-closed-1';

let passed = 0;
let failed = 0;

function test(name, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caveman-fc-'));
  const claudeDir = path.join(tmp, '.claude');
  const sessions = path.join(claudeDir, '.caveman-sessions');
  fs.mkdirSync(sessions, { recursive: true });
  try {
    fn({ tmp, claudeDir, sessions });
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  } finally {
    try { fs.chmodSync(sessions, 0o700); } catch (e) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function run({ tmp, claudeDir }, payload) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd: tmp,
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: {
      PATH: process.env.PATH,
      HOME: tmp,
      XDG_CONFIG_HOME: path.join(tmp, '.config'),
      CLAUDE_CONFIG_DIR: claudeDir,
    },
  });
}

const modeLog = (claudeDir) => path.join(claudeDir, '.caveman-mode-log.jsonl');

console.log('caveman-mode-tracker fail-closed (DONGWOO-2168)\n');

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  console.log('  - skipped: running as root, a 0500 directory does not block writes');
  process.exit(0);
}

test('control: valid id + /caveman lite writes state and reinforces', (ctx) => {
  const res = run(ctx, { session_id: SID, prompt: '/caveman lite' });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(fs.readFileSync(path.join(ctx.sessions, SID + '.mode'), 'utf8'), 'lite');
  assert.match(res.stdout, /CAVEMAN MODE ACTIVE \(lite\)/);
  assert.ok(!fs.existsSync(modeLog(ctx.claudeDir)), 'mode log must not be written');
});

for (const [label, payload] of [
  ['missing id', { prompt: '/caveman lite' }],
  ['invalid id', { session_id: '../escape', prompt: '/caveman lite' }],
]) {
  test(`${label} + /caveman lite: no state file, no mode log, no output`, (ctx) => {
    const res = run(ctx, payload);
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.stdout, '');
    assert.deepStrictEqual(fs.readdirSync(ctx.sessions), []);
    assert.ok(!fs.existsSync(modeLog(ctx.claudeDir)), 'mode log must not be written');
    assert.ok(!fs.existsSync(path.join(ctx.claudeDir, '.caveman-active')));
  });
}

test('write failure + /caveman lite: no switch reported, no reinforcement', (ctx) => {
  fs.chmodSync(ctx.sessions, 0o500);
  const res = run(ctx, { session_id: SID, prompt: '/caveman lite' });
  fs.chmodSync(ctx.sessions, 0o700);
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout, '');
  assert.ok(!fs.existsSync(path.join(ctx.sessions, SID + '.mode')));
  assert.ok(!fs.existsSync(modeLog(ctx.claudeDir)), 'mode log must not be written');
});

test('existing lite + write failure on /caveman off: not reported off, lite kept', (ctx) => {
  const modeFile = path.join(ctx.sessions, SID + '.mode');
  fs.writeFileSync(modeFile, 'lite', { mode: 0o600 });
  fs.chmodSync(ctx.sessions, 0o500);
  const res = run(ctx, { session_id: SID, prompt: '/caveman off' });
  fs.chmodSync(ctx.sessions, 0o700);
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout, '');
  assert.strictEqual(fs.readFileSync(modeFile, 'utf8'), 'lite');
  assert.ok(!fs.existsSync(modeLog(ctx.claudeDir)), 'mode log must not be written');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
