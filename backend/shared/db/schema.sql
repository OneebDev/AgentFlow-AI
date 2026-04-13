-- AgentFlow AI — PostgreSQL Schema
-- Run once via docker-entrypoint-initdb.d or manually.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Search Jobs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(255) NOT NULL,
  query         TEXT NOT NULL,
  status        VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Research Plans ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  intent          VARCHAR(100),
  output_format   VARCHAR(50),
  search_queries  JSONB NOT NULL DEFAULT '[]',
  sources         JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Crawl Results ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crawl_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL,   -- 'youtube' | 'google' | 'scraper'
  raw_data    JSONB NOT NULL DEFAULT '{}',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Final Results ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS final_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  best_result  JSONB,
  ranked_list  JSONB NOT NULL DEFAULT '[]',
  summary      TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_search_jobs_user    ON search_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_search_jobs_status  ON search_jobs(status);
CREATE INDEX IF NOT EXISTS idx_research_plans_job  ON research_plans(job_id);
CREATE INDEX IF NOT EXISTS idx_crawl_results_job   ON crawl_results(job_id);
CREATE INDEX IF NOT EXISTS idx_final_results_job   ON final_results(job_id);

-- ─── Auto-update updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_jobs_updated ON search_jobs;
CREATE TRIGGER trg_search_jobs_updated
  BEFORE UPDATE ON search_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
