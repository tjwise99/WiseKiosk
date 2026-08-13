# `check-links.mjs`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

| Direction | Case | Input |
|---|---|---|
| Must fail | Link to a missing file | an inline link whose destination names no file |
| Must fail | Link escaping the repository | a destination climbing above the root with `../` |
| Must fail | Link leaving through a symlink | a tracked symlink to a file outside the repository, linked normally |
| Must fail | Host not on the allowlist | an inline link to a host absent from `upstream-hosts.txt` |
| Must fail | Bare URL, host not allowed | the same host written as running text |
| Must fail | Allowlist entry naming no service | a line in `upstream-hosts.txt` with no `—` description |
| Must fail | Unterminated code fence | a fence that never closes, which would blank the rest of the file |
| Must fail | HTML anchor to a missing file | a raw HTML anchor whose `href` names no file |
| Must fail | Reference definition to a missing file | a link-reference definition whose destination names no file |
| Must pass | Valid relative link | an inline link resolving to a tracked file |
| Must pass | Link with an anchor | the same destination carrying a heading fragment |
| Must pass | Pure in-page anchor | a destination that is a fragment and nothing else |
| Must pass | Another scheme | a `mailto:` destination |
| Must pass | Allowlisted host, as a link and as bare text | the same host both ways |
| Must pass | Image link | the image form of a resolving destination |
| Must pass | URL containing parentheses | an allowlisted URL whose path carries a bracketed segment |
| Must pass | Link title | a resolving destination followed by a quoted title, with and without a fragment |
| Must pass | Angle-bracketed destination | the same destination wrapped in angle brackets |
| Must pass | Valid HTML anchor and reference definition | the same three syntaxes, resolving |
| Must pass | In-repo symlink | a symlink whose target is inside the repository |
| Must pass | Prose that resembles a definition | a sentence opening with a bracketed label and a colon |

The symlink pair is the one that matters. `resolve()` and `existsSync()` both follow a symlink without
reporting that they did, so a path whose *text* stays inside said nothing about where it landed — the
check's own invariant defeated with no signal either way. The three-syntax rows are the same lesson
from the other side: matching only Markdown's inline form leaves two other ways of writing a relative
path entirely unread.

**This section cannot show its own cases.** Backticks do not exempt a link from the scan, so writing
one out as an example makes it a real link that must resolve; the cases are described rather than
quoted. The first draft quoted them and `just verify` failed on this file.

**Known rejections.**

| Input | What happens |
|---|---|
| a root-relative destination, leading with `/` | reported as escaping the repository, though the target exists |
| a fence opened with a longer marker than the one that closes it | the mismatch is not tracked, so the region is misread |
| a 4-space indented code block | not a fence, so its contents are scanned as live references |
| an inline code span containing link syntax | the same |
| a blockquoted fence | the same |

The root-relative row is accepted rather than fixed: a document that must resolve standalone cannot
use a path rooted at a server, so the rejection is right even though the message names the wrong
reason.

**What it does not catch.** A link inside a fenced block, broken or off-allowlist, passes — a fenced
block is a sample, not a reference, and allowlisting a host to satisfy a code sample would put it in
the register on the strength of an example. The file list comes from `git ls-files`, so an unstaged
document is invisible locally.
