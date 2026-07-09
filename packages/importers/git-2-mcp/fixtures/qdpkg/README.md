# qdai-git-fixture

Small Python package used to prove the git-2-mcp sandbox contract.

## Public helpers

- `add(left, right)` returns the sum of two integers.
- `slugify(value)` normalizes a title into a lowercase hyphen-separated slug.
- `summarize(items)` returns the item count and total character count.

Use `summarize` when an agent needs aggregate information about a list of text
values. Use `slugify` when generating stable identifiers from human titles.
