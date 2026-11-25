# 6. Portuguese full-text search in PostgreSQL

**Status:** accepted

## Context

People type without accents ("programacao") and in any form of a word ("lojas"). Search needs filters,
counts beside each filter and a ranking that rewards both relevance and a trustworthy reputation,
without adding a search engine to a free deployment.

## Decision

- A `pt_unaccent` text search configuration: the Portuguese one with the `unaccent` dictionary before
  stemming. (`unaccent()` the function is not IMMUTABLE; the dictionary inside a configuration can feed
  a generated column, because `to_tsvector(regconfig, text)` is.)
- Generated, weighted `tsvector` columns (title A, skills B, long text C) with GIN indexes; queries read
  as a web search (`websearch_to_tsquery`: phrases, `-word`, `or`).
- Facets in one query over the same matching rows: categories counted as if none were picked, skills
  within the results.
- Freelancers rank by relevance × a Bayesian rating (five imaginary reviews at the marketplace's mean),
  computed with the same SQL, reveal rule and sandbox rule as the profile pages.
- Keyset paging for stored orders (date, price); offset paging capped at ten pages for computed scores.

## Consequences

- Prisma sees the generated columns as `Unsupported("tsvector")` with the expression as `dbgenerated`,
  copied from introspection so the drift check in CI stays clean.
- Tests prove the accent handling with accented and unaccented queries, the facets, every paging order
  and the ranking against the shared `bayesian()` function.
