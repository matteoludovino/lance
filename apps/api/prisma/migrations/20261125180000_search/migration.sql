-- Portuguese full-text search that ignores accents: "programacao" finds "programação".
--
-- `unaccent()` the function is only STABLE (its rules file could change), so it can't feed a generated
-- column; the unaccent *dictionary* inside a text search configuration can, because to_tsvector(regconfig,
-- text) is IMMUTABLE. pt_unaccent = the Portuguese configuration with accents stripped before stemming.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION pt_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;

-- array_to_string() is STABLE too (array output in general depends on settings), though not for text[];
-- this wrapper says so, for the generated columns below. Skill slugs ("trafego-pago") split into words.
CREATE FUNCTION lance_words(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  RETURN array_to_string($1, ' ');

-- Weighted: what the thing is called (A), its skills (B), the long text (C).
ALTER TABLE "projects" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('pt_unaccent', "title"), 'A') ||
  setweight(to_tsvector('pt_unaccent', lance_words("skills")), 'B') ||
  setweight(to_tsvector('pt_unaccent', "description"), 'C')
) STORED;

ALTER TABLE "freelancer_profiles" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('pt_unaccent', "headline"), 'A') ||
  setweight(to_tsvector('pt_unaccent', lance_words("skills")), 'B') ||
  setweight(to_tsvector('pt_unaccent', "bio"), 'C')
) STORED;

CREATE INDEX "projects_search_idx" ON "projects" USING GIN ("search");
CREATE INDEX "freelancer_profiles_search_idx" ON "freelancer_profiles" USING GIN ("search");

-- Filters that run without a text query: skills (array containment) on both sides.
CREATE INDEX "projects_skills_idx" ON "projects" USING GIN ("skills");
CREATE INDEX "freelancer_profiles_skills_idx" ON "freelancer_profiles" USING GIN ("skills");
