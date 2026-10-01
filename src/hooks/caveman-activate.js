#!/usr/bin/env node
// caveman — Claude Code SessionStart activation hook
//
// candidate-p2 (DONGWOO-2104 minimal fork of dongwoo-labs/caveman@v2.7.0-labs.1):
//   - Only 'off' and 'lite' are supported modes (see caveman-config.js VALID_MODES).
//   - No legacy machine-wide fallback: a session with no valid session_id gets
//     no state read, no state write, no style output — fail-closed 'off'.
//   - No cavecrew model-override invocation, no statusline nudge, no stats.
//   - Built-in default mode is 'off' (upstream default is 'full').
//
// Runs on every session start:
//   1. Resolves THIS session's mode and persists it
//   2. Emits caveman ruleset as hidden SessionStart context (lite only)
//
// Mode state is per session, not per machine — see the "Per-session mode state"
// block in caveman-config.js. A session_id that is absent or fails validation
// never reads or writes any state (fail-closed 'off'), it does NOT degrade to
// a machine-wide flag.

const fs = require('fs');
const path = require('path');
const os = require('os');
// caveman-config.js is a mandatory sibling, but an incomplete install (plugin
// cache drift, a copy list that missed a file) leaves it absent. A bare
// top-level require turns that into an uncaught MODULE_NOT_FOUND on EVERY
// session start, which Claude Code surfaces only as an opaque loader stack
// trace (#848). Resolve it defensively and degrade instead.
//
// Deliberately inlined here rather than extracted into a shared helper: a
// shared loader would itself be one more sibling that can go missing, which
// is the exact failure this guards against.
function reportDegraded(name, detail) {
  process.stderr.write('caveman: ' + detail + '\n'
    + 'Run `/plugin update caveman`, or rerun install.sh for standalone hooks. '
    + 'Continuing with reduced functionality.\n');
}

function requireSibling(name, isUsable) {
  let mod;
  try {
    mod = require('./' + name);
  } catch (primary) {
    // The opencode install layout renames the sibling to `.cjs` (its plugin
    // dir is "type": "module"), same fallback caveman-parse.js already does.
    // Gate the retry on the error naming THIS module: a MODULE_NOT_FOUND
    // thrown by a require *inside* a sibling that loaded fine must not be
    // re-reported as "./<name>.cjs is missing", which blames a file that was
    // never meant to exist.
    const message = String((primary && primary.message) || primary);
    if (primary && primary.code === 'MODULE_NOT_FOUND' && message.includes("'./" + name + "'")) {
      try { return require('./' + name + '.cjs'); } catch (e) { /* report primary */ }
    }
    const absent = !fs.existsSync(path.join(__dirname, name + '.js'))
                && !fs.existsSync(path.join(__dirname, name + '.cjs'));
    // Distinguish "the sibling is absent" from "the sibling loaded but its
    // own require failed" — naming the wrong cause is worse than no message.
    // Only the first line of error.message: Node appends a multi-line
    // "Require stack:" block, which is the noise this guard exists to remove.
    reportDegraded(name, absent
      ? name + '.js is missing from ' + __dirname + ' — the install is incomplete.'
      : name + ' could not load — ' + message.split('\n')[0]);
    return null;
  }
  // A module that LOADS but exports the wrong shape is the plugin-cache-drift
  // case #848 actually describes: a stale sibling from another version. Without
  // this check the destructure below succeeds and the first use dereferences
  // undefined, producing exactly the raw top-level stack trace and exit 1 this
  // guard exists to remove. Validate the shape, not just the throw.
  if (!isUsable(mod)) {
    reportDegraded(name, name + ' loaded but is missing expected exports — the install is inconsistent.');
    return null;
  }
  return mod;
}

// Hand-copy of caveman-config.js VALID_MODES, used only when that module is
// unavailable. candidate-p2 reduces this to off/lite, matching the real module.
const FALLBACK_VALID_MODES = ['off', 'lite'];

// Minimal stand-in for caveman-config.getDefaultMode. It must mirror the real
// resolution order rather than read only the env var: a degrade that ignores a
// checked-in `.caveman.json` or a user config saying `defaultMode: "off"` does
// not degrade toward the user's intent, it INVERTS it — a team that opted out
// would get caveman force-injected the moment one file goes missing. Reads
// only; refuses symlinked config files, symmetric with safeWriteFlag.
function fallbackReadMode(file) {
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    const mode = JSON.parse(fs.readFileSync(file, 'utf8')).defaultMode;
    if (typeof mode === 'string' && FALLBACK_VALID_MODES.includes(mode.toLowerCase())) {
      return mode.toLowerCase();
    }
  } catch (e) { /* absent, unreadable, or malformed → next source */ }
  return null;
}

function fallbackUserConfigPath() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'caveman', 'config.json');
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'caveman', 'config.json');
  }
  return path.join(os.homedir(), '.config', 'caveman', 'config.json');
}

function fallbackGetDefaultMode(startDir) {
  // 1. Environment variable. No .trim() — the real resolver does not trim, and
  //    a degraded path that accepts " ultra" where the intact one rejects it is
  //    drift in a whitelist.
  const envMode = process.env.CAVEMAN_DEFAULT_MODE;
  if (envMode && FALLBACK_VALID_MODES.includes(envMode.toLowerCase())) return envMode.toLowerCase();
  // 2. Repo-local config, walking up. Bounded at 64 like findRepoConfigPath.
  try {
    let dir = path.resolve(startDir || process.cwd());
    for (let i = 0; i < 64; i++) {
      for (const rel of ['.caveman/config.json', '.caveman.json']) {
        const mode = fallbackReadMode(path.join(dir, rel));
        if (mode) return mode;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) { /* fall through to user config */ }
  // 3. User config, then 4. the built-in default — candidate-p2's fallback
  //    default is 'off', not upstream 'full'.
  return fallbackReadMode(fallbackUserConfigPath()) || 'off';
}

// Degraded stubs keep the rest of this hook working when the config module is
// unusable: the session still gets its ruleset (read from SKILL.md, which does
// not depend on the config module) and only flag persistence is lost — no flag
// write, no mode log, readFlag() reports nothing active.
const cavemanConfig = requireSibling('caveman-config', (m) =>
  m && typeof m.getDefaultMode === 'function' && typeof m.safeWriteFlag === 'function'
    && typeof m.recordModeChange === 'function' && typeof m.readFlag === 'function'
    && Array.isArray(m.VALID_MODES));

const { getDefaultMode, recordModeChange, VALID_MODES } = cavemanConfig || {
  getDefaultMode: fallbackGetDefaultMode,
  recordModeChange: () => {},
  VALID_MODES: FALLBACK_VALID_MODES,
};

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

// The per-session helpers are resolved INDIVIDUALLY rather than folded into the
// requireSibling shape check above. A caveman-config.js from before per-session
// state loads fine and exports everything that check demands, so failing the
// whole module over the newer exports would trade "no mode at all" for
// something worse. candidate-p2's stand-ins below are all fail-closed (no
// legacy flag of any kind) rather than degrading to a machine-wide file.
const cfg = cavemanConfig || {};
const validateSessionId = cfg.validateSessionId || (() => null);
const gcSessionStore = cfg.gcSessionStore || (() => 0);
// Literal read of THIS session's state, 'off' included. candidate-p2: no
// legacy-flag degrade — an unusable config module means no state at all.
const readSessionModeRaw = cfg.readSessionModeRaw || (() => null);
// candidate-p2: writeSessionMode returns a boolean (true = actually written).
const writeSessionMode = cfg.writeSessionMode || (() => false);

// SessionStart re-fires mid-conversation (resume, /clear, context compaction),
// not just at true session start. Re-firing must not clobber a mode the user
// switched to mid-session (#691): branch on the hook payload's `source` field —
// only a real `startup` resets to the configured default, an explicit `clear`
// always resets to 'off' (DONGWOO-2104 contract — NOT getDefaultMode), and
// resume/compact/fork preserve this session's stored mode.
//
// With per-session storage the branch also has to preserve a durable `off`.
// The continuation branch below therefore reads the LITERAL stored value, not
// the collapsed one. Payload arrival is EVENT-DRIVEN, and activation runs on
// the first COMPLETE JSON object rather than at EOF. The host writes one
// object and closes, but under the Windows pipe implementation that close can
// lag arbitrarily (#729/#833). A synchronous `readFileSync(0)` blocks inside
// the read syscall until EOF — no deadline can interrupt it — so a lagging
// close spent this hook's entire 5s budget and the host killed it before the
// flag was written or the ruleset emitted. caveman-mode-tracker.js was fixed
// this way; its sibling was not, and SessionStart is the one that actually has
// work to do.
//
// A watchdog covers the case where the payload never completes at all: activate
// well inside the budget instead of forfeiting the session. It must NOT assume
// `startup` — that is the one source that resets the mode, so a slow payload on
// a `compact`/`resume` event would silently drop a user's mid-session mode
// back to the default (#691 through the timeout door). An unknown source
// preserves a valid existing flag. The deadline sits well below the host's 5s
// budget but far enough above a cold Windows/AV start to be reached rarely.
const PAYLOAD_WATCHDOG_MS = 2000;

// Sources that re-derive the configured default instead of reading what this
// session already stored.
//
// `startup` is a genuinely new session. `clear` is here too — /clear is an
// explicit user reset of the conversation — but see RESET_TO_OFF_SOURCES
// below: clear does NOT re-derive the configured default, it hard-resets to
// 'off'. Everything else (compact, resume, fork, an unrecognized source, and
// the watchdog's 'unknown') reads instead of re-deriving.
const RESET_SOURCES = new Set(['startup', 'clear']);
// Of the RESET_SOURCES, `clear` forces 'off' rather than re-deriving the
// configured default (DONGWOO-2104 session-state contract: "/clear: 해당
// session을 off로 reset한다"). `startup` is the only source that still
// consults getDefaultMode().
const RESET_TO_OFF_SOURCES = new Set(['clear']);

// candidate-p2: payload bytes that fail to parse as JSON are an error input,
// not "no payload". Per the DONGWOO-2104 error-fixture contract (invalid JSON
// stdin → exit 0, bounded stderr, no style output, no state change), this
// aborts BEFORE run() — no default resolution, no GC, no state write. A
// genuinely empty payload (manual TTY invocation) is not an error and still
// proceeds as a real startup.
function activate(payload, timedOut) {
  if (payload) {
    let data;
    try {
      data = JSON.parse(payload);
    } catch (e) {
      process.stderr.write('caveman: invalid SessionStart payload JSON — no state change.\n');
      process.exit(0);
      return;
    }
    const source = (data && typeof data.source === 'string') ? data.source : (timedOut ? 'unknown' : 'startup');
    const sessionCwd = (data && typeof data.cwd === 'string') ? data.cwd : undefined;
    const sessionId = data ? validateSessionId(data.session_id) : null;
    run(source, sessionCwd, sessionId);
    return;
  }
  // No payload at all (manual/TTY invocation, or a watchdog timeout with zero
  // bytes received) — treat as a genuine startup with no session scoping.
  run(timedOut ? 'unknown' : 'startup', undefined, null);
}

if (process.stdin.isTTY) {
  // Manual run — no payload is coming.
  activate('');
} else {
  let input = '';
  let done = false;
  const finish = (timedOut) => {
    if (done) return;
    done = true;
    clearTimeout(watchdog);
    // Attaching a 'data' listener puts the stdin handle into flowing mode and
    // REFERENCES it, so pause() alone leaves the event loop alive and the
    // process never exits while the host holds the write end open — which is
    // exactly the lagging-close case this rewrite exists to survive. unref()
    // drops the handle from the loop's ref count without closing the fd, so we
    // exit as soon as stdout has flushed.
    try { process.stdin.pause(); } catch (e) {}
    try { process.stdin.unref(); } catch (e) {}
    activate(input, timedOut === true);
  };
  const watchdog = setTimeout(() => finish(true), PAYLOAD_WATCHDOG_MS);
  // StringDecoder semantics: a multi-byte character split across two chunks is
  // held until complete, rather than each half becoming a replacement char.
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
    // A partial payload throws here and we simply wait for more bytes.
    try { JSON.parse(input); } catch (e) { return; }
    finish();
  });
  // Abnormal close (broken pipe, parent crash) emits 'error'; without a
  // listener Node throws it as an uncaught exception and the hook exits
  // non-zero — a spurious hook failure (#538). Hooks must always exit 0.
  process.stdin.on('error', () => finish());
  process.stdin.on('end', () => finish());
}

function run(source, sessionCwd, sessionId) {
let mode;
if (RESET_SOURCES.has(source)) {
  if (RESET_TO_OFF_SOURCES.has(source)) {
    mode = 'off';
  } else {
    mode = getDefaultMode(sessionCwd);
  }
  // Sweep stale per-session files only when a session genuinely begins, not on
  // every compaction — those are frequent in a long session and this walks a
  // directory inside a 5s hook budget.
  gcSessionStore(claudeDir);
} else {
  // Continuation: read, never re-derive. The LITERAL value, so a stored 'off'
  // is distinguishable from "nothing stored yet". candidate-p2: no legacy
  // mirror to fall back to — a session with no file here has no mode.
  const stored = readSessionModeRaw(claudeDir, sessionId);
  if (stored && VALID_MODES.includes(stored)) {
    mode = stored;
  } else {
    // resume/fork can carry a session id we have never seen (a fork gets a new
    // one). With nothing stored anywhere, fall back to the configured default.
    mode = getDefaultMode(sessionCwd);
  }
}

// "off" mode — skip activation entirely, no stdout bytes at all (DONGWOO-2104:
// "off: stdout 0 bytes / additionalContext 없음"). The state is still written
// (best-effort) so the choice survives this session's later compactions.
if (mode === 'off') {
  recordModeChange(claudeDir, null, sessionId); // #601: timestamped transition log
  writeSessionMode(claudeDir, sessionId, null);
  process.exit(0);
}

// 1. Persist this session's mode (symlink-safe). candidate-p2 has no legacy
//    mirror to write. writeSessionMode returns false when nothing was
//    actually written (no valid session_id, or the write failed) — in that
//    case we must not report the mode as active (no ruleset emitted), so a
//    write failure never looks like a successful activation.
recordModeChange(claudeDir, mode, sessionId); // #601
const persisted = writeSessionMode(claudeDir, sessionId, mode);
if (!persisted) {
  process.exit(0);
}

// 2. Emit the lite ruleset (the only non-off mode in this candidate), filtered
//    from SKILL.md — the single source of truth for caveman behavior.
//    Reads SKILL.md at runtime so edits to the source of truth propagate
//    automatically — no hardcoded duplication to go stale.
const canonicalModeLabel = cfg.canonicalModeLabel || ((m) => m);
const rulesetBanner = cfg.rulesetBanner || ((m) => 'CAVEMAN MODE ACTIVE — level: ' + canonicalModeLabel(m));
const loadFilteredRuleset = cfg.loadFilteredRuleset || (() => null);

const modeLabel = canonicalModeLabel(mode);
const skillContent = loadFilteredRuleset(mode, __dirname);

let output;

if (skillContent) {
  output = rulesetBanner(mode) + '\n\n' + skillContent;
} else {
  // Fallback when SKILL.md is not found (standalone hook install without
  // skills dir). candidate-p2: off/lite only — no full/ultra/wenyan mention.
  output =
    'CAVEMAN MODE ACTIVE — level: ' + modeLabel + '\n\n' +
    'Respond tight. All technical substance stays. Only fluff goes.\n\n' +
    '## Persistence\n\n' +
    'Default style for this whole session, every response, until user says "stop caveman" or "normal mode".\n\n' +
    'Current level: **' + modeLabel + '**. Switch: `/caveman lite|off`.\n\n' +
    '## Rules\n\n' +
    'No filler, hedging, or pleasantries. Keep articles and full sentences OK, but stay tight. ' +
    'Technical terms, code, commands, paths, and errors stay exact.\n\n' +
    "Follow explicit reply-language instructions from the user or project. Otherwise preserve the user's dominant language. Technical terms, code, API names, commands, error strings stay verbatim.\n\n" +
    '## Boundaries\n\n' +
    'Code/commits/PRs: write normal. "stop caveman" or "normal mode": revert. Level persists until changed or session end.';
}

process.stdout.write(output);
} // end run()
