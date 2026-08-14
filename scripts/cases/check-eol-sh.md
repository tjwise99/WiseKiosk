# `check-eol.sh`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

`git grep -lIP '\r$' -- .`, inverted. `git grep` answers 1 both for *searched, found nothing* and for
*there was nothing to search*, and anything else when the search itself failed — so the three are
separated and the population is established before a clean result means anything.

| Direction | Input |
|---|---|
| Must fail | a tracked file containing CRLF, in `.txt` and in `.md` |
| Must fail | the search failing rather than finding nothing — run outside a repository, where git exits 128 |
| Must fail | a repository with no tracked file, where git exits 1 over an empty pathspec |
| Must pass | an all-LF tree |
| Must pass | a binary file containing CR — excluded by `-I` |
| Must pass | a genuinely untracked CRLF file |
| Must pass | CR appearing mid-line, where the line still ends in LF |

**What it does not catch: a file whose `.gitattributes` sets the `binary` attribute.** That attribute
both exempts the file from CRLF→LF normalisation when it is added *and* makes `-I` skip it during the
grep, so genuinely CRLF-terminated text commits and survives a fresh clone unseen. A plain `-text`
does not do this; only the full `binary` macro. `.gitattributes` declares `binary` on the image, font
and PDF globs — the attribute used as intended — so the reachable case is a *text* glob given it. The
owner ruled on 2026-08-02 not to gate that, so what holds is that **the LF invariant holds for files
git treats as text, and `.gitattributes` decides which those are.**

The check is not made redundant by git's own normalisation: a CRLF blob forced into history via
`hash-object`/`update-index`, bypassing the add-time filter, is still caught after a fresh checkout.
