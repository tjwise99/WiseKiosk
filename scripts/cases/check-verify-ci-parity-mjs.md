# `check-verify-ci-parity.mjs`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

| Direction | Case | Input |
|---|---|---|
| Must fail | Recipe runs in no workflow step | a `just verify` check whose script no step invokes |
| Must fail | Token names no command its recipe runs | a recipe's command changed, `CHECK_TOKENS` and the workflow left untouched |
| Must fail | Command covered by no token | the `git diff --exit-code` line of `check-arch` with its token removed |
| Must fail | A dependency on the recipe's header line | `check-links: link-lint`, where `link-lint` runs a script no token covers |
| Must fail | Truncated token hiding a dropped argument | CI's staleness command shortened to drop `docs/ARCHITECTURE.md` |
| Must fail | Shebang recipe on the gate path | a `verify` check whose body opens `#!`, which cannot be mapped to CI commands |
| Must fail | A command that does not resolve to text | a body line interpolating a variable, naming no fixed command |
| Must fail | `verify` depends on nothing | the dependency list emptied, so the loops judge an empty set |
| Must fail | A module the dump does not fold in | `mod deploy`, whose recipes sit outside `recipes` |
| Must fail | A dump with no `modules` map | `just` stubbed to drop the key, whose absence would read as "no module declared" |
| Must fail | A dump with no `shebang` field | the same stub per recipe, whose absence would read as "not a script" |
| Must fail | Recipe widened past its token | a third path added to `check-arch`'s diff, the workflow unchanged |
| Must fail | Recipe line prefixed `-` | `-node scripts/check-links.mjs`, discarding the failing status CI's identical command keeps; `@-` and `-@` likewise |
| Must fail | A continuation with no line after it | a recipe body ending on a trailing `\` |
| Must fail | Recipe with no `CHECK_TOKENS` entry | a new name added to the `verify` recipe |
| Must fail | Stale `CHECK_TOKENS` entry | a mapped check removed from the `verify` recipe |
| Must fail | CI step matching nothing | a named step running neither a mapped check nor an allowlisted one |
| Must fail | Token surviving only in a step's `name:` | the command renamed, the old path left in the step title |
| Must fail | Token commented out inside a `run: \|` block | the command replaced by a whole-line comment |
| Must fail | Token surviving only in a trailing comment | the step deleted, its path left after a `#` on another step's line |
| Must fail | The same, on a line holding a quoted value | the path left after a `#` on a `key: "value"` line |
| Must fail | The same, after an unbalanced apostrophe | the path left after a `#` on a line whose value carries `it's` |
| Must fail | A comment covering an unmapped step | a step matching nothing, its body naming a mapped path only in a comment |
| Must pass | The tree as it stands | — |
| Must pass | Commands reordered within a recipe | `check-reqs`'s first two commands swapped |
| Must pass | A command split across a `\` continuation | `check-links` written as `node \` then the script path |
| Must pass | A comment line inside a recipe body | `check-links` with a `#` line above its command |
| Must pass | A recipe line prefixed `@` | and `@ node …` with the whitespace `just` allows — both suppress the echo rather than naming a different command |
| Must pass | `#!` below the first body line | a shell comment, which `just` runs — only the first line opens a script |
| Must pass | A recipe reached through `just <recipe>` | `check-arch`, whose commands come from `arch-export` |
| Must pass | CI spelling a command with an extra argument | `sh scripts/check-branch.sh "$HEAD_REF"`, where the recipe passes none |
| Must pass | A toolchain step | a step named `Install …`, which prepares a check rather than being one |
| Must pass | An unnamed step | `- uses:` infrastructure with no `name:` |
| Must pass | A quoted `#` in a command | `run: … && echo "pin # it"` beside a real token |
| Must pass | An unquoted `#` with no leading space | `run: … --tag=#x`, which YAML does not read as a comment |

The trailing-comment rows need their control to mean anything: a step deleted outright **is** caught,
which is what made the comment cases holes rather than a misreading of the design.
