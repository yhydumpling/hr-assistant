CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE CHECK (length(title) BETWEEN 1 AND 100),
  required_skills JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_skills) = 'array'),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Each candidate row is one application to one job, not a global person identity.
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  fields_json JSONB NOT NULL CHECK (jsonb_typeof(fields_json) = 'object'),
  stage TEXT NOT NULL CHECK (stage IN ('简历筛选','待一面','待复试','Offer','待入职','已入职','已淘汰')),
  next_action TEXT NOT NULL,
  next_action_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  source_name TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  file_blob BYTEA CHECK (file_blob IS NULL OR octet_length(file_blob) <= 4194304),
  file_mime TEXT,
  file_name TEXT,
  confirmation_token TEXT UNIQUE,
  submission_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  round TEXT NOT NULL CHECK (round IN ('一面','复试','终面')),
  date DATE NOT NULL,
  time TIME(0) NOT NULL,
  interviewer TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (candidate_id,date,time)
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  candidate_version INTEGER NOT NULL CHECK (candidate_version > 0),
  intent_json JSONB NOT NULL,
  preview_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS interviews_date_idx ON interviews(date,time);
CREATE INDEX IF NOT EXISTS candidates_job_idx ON candidates(job_id);
CREATE INDEX IF NOT EXISTS activities_candidate_idx ON activities(candidate_id,created_at DESC);
CREATE INDEX IF NOT EXISTS pending_actions_candidate_idx ON pending_actions(candidate_id,status);
