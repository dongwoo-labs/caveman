#!/usr/bin/env node
// caveman — UserPromptSubmit hook to track which caveman mode is active
// Inspects user input for /caveman commands and writes mode to session state
//
// candidate-p2 (DONGWOO-2104 minimal fork): off/lite only.
//   - No /caveman-stats (and no execFileSync dependency for it).
//   - No independent modes (commit/review/compress) — the parser no longer
//     emits them, so the one-shot restore machinery (.prev) is unreachable
//     and removed along with it.
//   - No legacy machine-wide flag fallback anywhere.
//   - Per-turn reinforcement is gated on THIS session's stored mode only,
//     never on the repo-local/env default — a session that explicitly set
//     'lite' must get reinforcement even if the project's default is 'off'.

const fs = require('fs');
const path = require('path');
const os = require('os');
// caveman-config.js and caveman-parse.js are mandatory siblings, but an
// incomplete install leaves one absent. A bare top-level require turns that
// into an uncaught MODULE_NOT_FOUND on EVERY prompt, which the harness
// surfaces only as an opaque loader stack trace (#848). Resolve defensively.
//
// Deliberately inlined rather than extracted into a shared helper: a shared
// loader would itself be one more sibling that can go missing, which is the
// exact failure this guards against.
function requireSibling(name, isUsable) {
  let mod;
  try {
    mod = require('./' + name);
  } catch (primary) {
    // The opencode install layout renames siblings to `.cjs` (its plugin dir
    // is "type": "module"), same fallback caveman-parse.js already does. Gate
    // the retry on the error naming THIS module: a MODULE_NOT_FOUND thrown by
    // a require *inside* a sibling that loaded fine must not be re-reported as
    // "./<name>.cjs is missing", blaming a file never meant to exist.
    const message = String((primary && primary.message) || primary);
    if (primary && primary.code === 'MODULE_NOT_FOUND' && message.includes("'./" + name + "'")) {
      try { return require('./' + name + '.cjs'); } catch (e) { /* report primary */ }
    }
    const absent = !fs.existsSync(path.join(__dirname, name + '.js'))
                && !fs.existsSync(path.join(__dirname, name + '.cjs'));
    // Distinguish "the sibling is absent" from "the sibling loaded but its own
    // require failed" — naming the wrong cause is worse than no message. Only
    // the first line of error.message: Node appends a multi-line "Require
    // stack:" block, the very noise this guard exists to remove.
    process.stderr.write('caveman: ' + (absent
      ? name + '.js is missing from ' + __dirname + ' — the install is incomplete.'
      : name + ' could not load — ' + message.split('\n')[0]) + '\n'
      + 'Run `/plugin update caveman`, or rerun install.sh for standalone hooks. '
      + 'Continuing with reduced functionality.\n');
    return null;
  }
  // A module that LOADS but exports the wrong shape is the plugin-cache-drift
  // case #848 describes. Without this check the first use dereferences
  // undefined — the raw stack trace this guard exists to remove.
  if (!isUsable(mod)) {
    process.stderr.write('caveman: ' + name + ' loaded but is missing expected exports — the install is inconsistent.\n'
      + 'Run `/plugin update caveman`, or rerun install.sh for standalone hooks. '
      + 'Continuing with reduced functionality.\n');
    return null;
  }
  return mod;
}

// Degraded stubs make this hook a clean no-op when a sibling is unusable: no
// mode change is parsed, resolveActiveMode reports nothing active, so nothing
// is emitted and the process still exits 0 with stdin drained (never a broken
// pipe, #397).
const cavemanConfig = requireSibling('caveman-config', (m) =>
  m && typeof m.getDefaultMode === 'function' && typeof m.safeWriteFlag === 'function'
    && typeof m.readFlag === 'function' && typeof m.recordModeChange === 'function'
    && Array.isArray(m.VALID_MODES));
const { getDefaultMode, recordModeChange, VALID_MODES } = cavemanConfig || {
  getDefaultMode: () => 'off',
  recordModeChange: () => {},
  VALID_MODES: ['off', 'lite'],
};

// Per-session helpers, resolved individually rather than folded into the shape
// check above: a caveman-config.js from before per-session state satisfies that
// check, and failing the whole module over the newer exports would turn "mode
// tracked" into "hook is a no-op" more abruptly than needed. candidate-p2's
// stand-ins below are fail-closed (no legacy flag of any kind).
const cfg = cavemanConfig || {};
const validateSessionId = cfg.validateSessionId || (() => null);
const resolveActiveMode = cfg.resolveActiveMode || (() => null);
const writeSessionMode = cfg.writeSessionMode || (() => false);
// Ruleset injection helpers, shared with caveman-activate.js so a mid-session
// switch delivers the SAME ruleset SessionStart does (#975).
const canonicalModeLabel = cfg.canonicalModeLabel || ((m) => m);
const rulesetBanner = cfg.rulesetBanner || ((m) => 'CAVEMAN MODE ACTIVE — level: ' + canonicalModeLabel(m));
const loadFilteredRuleset = cfg.loadFilteredRuleset || (() => null);
const { parseModeChange } = requireSibling('caveman-parse', (m) =>
  m && typeof m.parseModeChange === 'function') || {
  parseModeChange: () => null,
};

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

// candidate-p2: only the lite reinforcement remains.
const REINFORCEMENT_RULES = {
  lite: 'Cut redundant wording and rote greetings only. Keep uncertainty, negation/exceptions, verification status, and needed progress updates. Keep complete sentences and the user\'s language.',
};

function reinforcementForMode(mode) {
  const rules = REINFORCEMENT_RULES[mode] || REINFORCEMENT_RULES.lite;
  return 'CAVEMAN MODE ACTIVE (' + mode + '). Enforce this reply: ' + rules +
    ' Technical terms, code, commands, paths, and errors stay exact.';
}

let input = '';
let handled = false;

// Act on the first COMPLETE JSON payload rather than waiting for EOF. The host
// writes one object and closes, but under the Windows pipe implementation that
// close can lag arbitrarily (#729/#833) — and this hook is registered with a 5s
// budget, so a lagging EOF spends the whole budget and the host kills us before
// the flag is ever written. Parsing per chunk costs one JSON.parse of a payload
// we are about to parse anyway.
//
// candidate-p2: a payload that fails to parse as JSON changes no state and
// emits nothing (DONGWOO-2104 error-fixture contract) — the existing catch at
// the bottom of this function already achieves that since nothing has mutated
// state by the time JSON.parse throws.
function handle(raw) {
  if (handled) return;
  handled = true;
  try {
    const data = JSON.parse(raw);

    // Scopes every read and write below to this session. null when absent or
    // malformed — candidate-p2 treats that as "no session", never a
    // machine-wide fallback.
    const sessionId = validateSessionId(data.session_id);

    // Collapse whitespace so phrase triggers still match multiline prompts —
    // every regex below sees a single-line prompt (#598).
    let prompt = (data.prompt || '').trim().toLowerCase().replace(/\s+/g, ' ');

    // Unattended scheduled-task runs must never receive caveman styling —
    // the per-turn reinforcement would hijack the task prompt, and a
    // lightweight scheduled task would answer with a caveman greeting
    // instead of doing its job. Claude Code wraps these in a
    // <scheduled-task ...> marker; bail out completely when present: no flag
    // mutation, no reinforcement. Interactive sessions are unaffected.
    if (/<scheduled-task\b/.test(prompt)) return;

    // Claude Code delivers slash commands to this hook as an envelope, not
    // the literal command (#537):
    //   <command-message>caveman</command-message>
    //   <command-name>/caveman</command-name>
    //   <command-args>lite</command-args>
    // (one-line or newline-separated — the collapse above normalizes both
    // into single spaces; <command-args> may be empty or absent). Every
    // switch below matches against the literal command string, so this
    // envelope was a silent no-op for every slash command, including
    // '/caveman off'. Reconstruct '<name> <args>' for /caveman* envelopes so
    // the rest of this hook sees exactly what the user selected. A foreign
    // command's envelope is left untouched, and natural-language detection
    // is skipped for it so another command's own args can't misfire our
    // activation/deactivation triggers.
    let skipNaturalLanguage = false;
    const envName = /<command-name>\s*([^<\s]+)\s*<\/command-name>/.exec(prompt);
    if (envName) {
      if (envName[1].startsWith('/caveman')) {
        const envArgs = /<command-args>\s*([^<]*?)\s*<\/command-args>/.exec(prompt);
        const args = envArgs ? envArgs[1].trim() : '';
        prompt = args ? envName[1] + ' ' + args : envName[1];
      } else {
        skipNaturalLanguage = true;
      }
    }

    // Shared mode-change parser (#602), reduced in candidate-p2 to off/lite.
    const change = parseModeChange(prompt, { getDefaultMode, skipNaturalLanguage });

    // A /caveman argument that resolves to no mode used to leave the level
    // untouched and say nothing, so a typo or punctuation glued to the level
    // ("/caveman full;") looked like it worked. Build a notice instead.
    let notice = null;
    if (change && change.action === 'unresolved') {
      // candidate-p2 supports exactly one non-off level. The rejected
      // argument is never echoed: it is untrusted input headed for model
      // context.
      const levels = VALID_MODES.filter(m => m !== 'off');
      notice = 'Tell the user their /caveman level was not recognized and the level is '
        + 'unchanged. Valid levels: ' + levels.join(', ') + '. Use /caveman off to deactivate.';
    }

    // The level the model is actually holding rules for, read BEFORE any write:
    // a switch can only be detected against this, never against the value we
    // are about to store. Read only on a `set`, so an ordinary turn — every
    // turn, on the hot path — still makes the single state read it always did.
    const modeBeforeChange = change && change.action === 'set'
      ? resolveActiveMode(claudeDir, sessionId)
      : null;

    // Set to the new level only when this prompt genuinely CHANGES it, so the
    // ruleset re-injection below is paid for by an actual switch and nothing
    // else (#975). A null previous mode (caveman was off) counts as a change:
    // the model holds no ruleset at all in that case, which is the strongest
    // reason to send one.
    let switchedToLevel = null;
    if (change && change.action === 'set') {
      const mode = change.mode;
      if (mode !== modeBeforeChange) {
        switchedToLevel = mode;
      }
      recordModeChange(claudeDir, mode, sessionId); // #601: timestamped transition log
      writeSessionMode(claudeDir, sessionId, mode);
    } else if (change && change.action === 'clear') {
      // Durable off: writeSessionMode stores the literal 'off' for this
      // session, so the next SessionStart cannot mistake deactivation for
      // "never set" and re-arm caveman on the next compaction.
      recordModeChange(claudeDir, null, sessionId); // #601
      writeSessionMode(claudeDir, sessionId, null);
    }

    // Per-turn reinforcement: emit a short reminder when caveman is active.
    // The SessionStart hook injects the full ruleset once, but models lose it
    // when other plugins inject competing style instructions every turn.
    // This keeps caveman visible in the model's attention on every user message.
    //
    // resolveActiveMode enforces symlink-safe read + size cap + VALID_MODES
    // whitelist, and treats both a missing file and a durable 'off' as "no
    // mode". If the state is missing, corrupted, oversized, or a symlink
    // pointing at something like ~/.ssh/id_rsa, it returns null and we emit
    // nothing — never inject untrusted bytes into model context.
    const activeMode = resolveActiveMode(claudeDir, sessionId);

    // candidate-p2: reinforcement is gated ONLY on this session's own stored
    // mode, never on getDefaultMode(). Gating on the configured default here
    // would mean a session that explicitly ran `/caveman lite` gets no
    // reinforcement whenever the candidate's built-in default is 'off' —
    // exactly the bug Astra's review caught in the first draft of this
    // candidate. A repo opting out via .caveman.json only ever changes what
    // getDefaultMode() resolves to for a NEW/reset session — it cannot
    // silence a session that already explicitly turned itself on.
    const reinforce = activeMode ? reinforcementForMode(activeMode) : null;

    // A level switch has to carry the new level's RULES, not just relabel the
    // banner (#975). SessionStart injected exactly one level's ruleset and it
    // is still the previous level's in the model's context, so a reminder
    // that merely names the new level leaves the model working from the old
    // one's rules, silently and self-confirmingly.
    //
    // `reinforce` is the gate as well as the reminder.
    // A SKILL.md that cannot be read degrades to the reminder alone — the
    // standalone hook install with no skills dir, the case activate.js covers
    // with its hardcoded fallback.
    let ruleset = null;
    if (switchedToLevel && reinforce) {
      const body = loadFilteredRuleset(switchedToLevel, __dirname);
      if (body) ruleset = rulesetBanner(switchedToLevel) + '\n\n' + body;
    }

    // One write, so an unresolved-level notice, a switch's ruleset and the
    // per-turn reinforcement can all land on the same turn. Only one
    // hookSpecificOutput per hook run is read, so emitting them separately
    // would drop whichever came second. The reminder goes last: it is the
    // directive for THIS reply, and recency is the point of it.
    const context = [notice, ruleset, reinforce].filter(Boolean).join('\n\n');
    if (context) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: context
        }
      }));
    }
  } catch (e) {
    // Silent fail — no state change, no output
  }
}

// StringDecoder semantics: a multi-byte character split across two chunks is
// held until it is complete, instead of each half being coerced to a lone
// replacement char by `'' + buffer`. Matters more now that the payload is
// parsed per chunk rather than once at EOF.
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  // A partial payload throws here and we simply wait for more bytes.
  try { JSON.parse(input); } catch (e) { return; }
  handle(input);
  // pause() stops the flow but the 'data' listener has REFERENCED the stdin
  // handle, so the event loop stays alive until the host closes the write end.
  // On Windows that close lags arbitrarily (#729/#833), so the hook sat idle
  // with its work already done until the 5s budget expired and the host killed
  // it — the shape of #819 (timeouts on turns that measure ~56ms of real work).
  // unref() drops the handle from the loop without closing the fd, so we exit
  // as soon as stdout has flushed.
  process.stdin.pause();
  try { process.stdin.unref(); } catch (e) {}
});
// Abnormal stdin close (broken pipe, parent crash) emits 'error'; without a
// listener Node throws it as an uncaught exception and the hook exits
// non-zero — a spurious hook failure (#538). Hooks must always exit 0.
process.stdin.on('error', () => process.exit(0));
// Same failure, output side (#397): the harness can close its end of our
// stdout/stderr after this hook has already written a payload, and an
// unlistened 'error' there throws just as loudly.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', () => process.exit(0));
}
process.stdin.on('end', () => handle(input));
