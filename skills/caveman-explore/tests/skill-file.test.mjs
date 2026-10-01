import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillFile = join(dirname(fileURLToPath(import.meta.url)), "..", "SKILL.md");
const md = readFileSync(skillFile, "utf8");

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "skill file must open with a --- frontmatter block ---");
  return match[1];
}

test("frontmatter preserves the explicit compatibility name without a separate agent preset", () => {
  const fm = frontmatter(md);
  assert.match(fm, /^name:\s*caveman-explore\s*$/m, "name must be caveman-explore");
  assert.match(fm, /^disable-model-invocation:\s*true\s*$/m, "entry must not auto-activate");
  assert.doesNotMatch(fm, /^(model|tools):/m, "compatibility must not define another scout preset");
  assert.match(fm, /^description:\s*.+/m, "description required for explicit discovery");
});

test("description limits invocation to direct search or one built-in Explore", () => {
  const fm = frontmatter(md);
  assert.match(fm, /Explicit T1 compatibility/, "must declare compatibility status");
  assert.match(fm, /direct read-only search or one built-in Explore call/, "must name the canonical localization paths");
});

test("body forbids duplicate scouts and preserves observed citations", () => {
  assert.match(md, /Do not add a FastContext scout, parallel scouts/, "must forbid duplicate scouts");
  assert.match(md, /Return only observed locations/, "must retain evidence-only return");
  assert.match(md, /path:START-END/i, "must show compact path:line shape");
  assert.match(md, /Cite ranges actually read/, "must not fabricate citations");
  assert.match(md, /no relevant locations found/i, "must give honest empty fallback");
  assert.match(md, /never edit|never.*solve|read-only/i, "must forbid editing and solving");
});

test("artifact carries no placeholder markers", () => {
  const banned = ["TO" + "DO", "FIX" + "ME", "place" + "holder", "X" + "X" + "X"];
  for (const marker of banned) {
    assert.doesNotMatch(md, new RegExp("\\b" + marker + "\\b", "i"), `artifact must not contain ${marker}`);
  }
});
