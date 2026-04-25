-- ============================================================
-- Job Outreach Bot - Supabase Schema
-- Run this entire file inside Supabase -> SQL Editor -> New Query
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table 1: jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id          TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  company_domain  TEXT,
  job_url         TEXT,
  job_description TEXT,
  source          TEXT,
  posted_at       TIMESTAMP,
  scraped_at      TIMESTAMP DEFAULT NOW(),
  status          TEXT DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scraped_at ON jobs(scraped_at);

-- ============================================================
-- Table 2: leads
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id            TEXT REFERENCES jobs(job_id),
  manager_name      TEXT,
  manager_title     TEXT,
  manager_email     TEXT,
  linkedin_url      TEXT,
  email_verified    BOOLEAN DEFAULT FALSE,
  apollo_confidence TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_job_id ON leads(job_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(manager_email);

-- ============================================================
-- Table 3: outreach
-- ============================================================
CREATE TABLE IF NOT EXISTS outreach (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id         UUID REFERENCES leads(id),
  job_id          TEXT REFERENCES jobs(job_id),
  subject_line    TEXT,
  email_body      TEXT,
  sent_at         TIMESTAMP,
  status          TEXT DEFAULT 'pending',
  reply_received  BOOLEAN DEFAULT FALSE,
  reply_at        TIMESTAMP,
  follow_up_count INT DEFAULT 0,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_outreach_lead_id ON outreach(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach(status);
CREATE INDEX IF NOT EXISTS idx_outreach_sent_at ON outreach(sent_at);

-- ============================================================
-- Optional: helper view for the dashboard
-- ============================================================
CREATE OR REPLACE VIEW outreach_dashboard AS
SELECT
  o.id              AS outreach_id,
  o.subject_line,
  o.status,
  o.sent_at,
  o.reply_received,
  o.follow_up_count,
  l.manager_name,
  l.manager_email,
  l.manager_title,
  j.title           AS job_title,
  j.company_name,
  j.job_url
FROM outreach o
LEFT JOIN leads l ON o.lead_id = l.id
LEFT JOIN jobs j  ON o.job_id  = j.job_id
ORDER BY o.sent_at DESC NULLS LAST;
