-- =====================================================================
--  AUTO GROWTH SYSTEMS — Supabase SQL (leads + system_settings)
--  Paste into: Supabase Dashboard -> SQL Editor -> New query -> Run.
--  Safe to run repeatedly (idempotent).
--
--  NOTE: the Next.js app also self-provisions these tables on first request
--  (src/db/bootstrap-sql.ts), so running this script is OPTIONAL — it is the
--  canonical reference + the demo seed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) One-time migration: the OLD pipeline workflow table was also named
--    "leads". Rename it so the public "leads" table can be the strict
--    18-column lead sheet. (No-op on a fresh database.)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'leads' AND column_name = 'business_name')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = 'pipeline_leads') THEN
    ALTER TABLE leads RENAME TO pipeline_leads;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) leads  — EXACTLY these 18 columns
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                 SERIAL PRIMARY KEY,
  lead_code          VARCHAR(40) NOT NULL UNIQUE,        -- unique human-readable ID
  city_keyword       TEXT,
  gmap_link          TEXT,                                -- Google Maps URL
  title              TEXT NOT NULL,                       -- business name
  rating             DECIMAL(3,1) DEFAULT 0,
  reviews            INTEGER DEFAULT 0,
  niche_or_category  TEXT,
  opens_at           TEXT,
  mobile_no          TEXT,
  website_status     TEXT,
  website            TEXT,                                -- website URL
  status_service     TEXT,
  call_status        TEXT,
  lead_status        TEXT,
  lead_close_amount  NUMERIC(12,2),
  assigned_agent_id  TEXT,                                -- users.id (UUID as text). An existing UUID-typed column (with FK to users) is also supported.
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_leads_agent_idx ON leads (assigned_agent_id);

-- ---------------------------------------------------------------------
-- 2) system_settings — key/value switches controlled from the Admin panel
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  id          SERIAL PRIMARY KEY,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_key_uq ON system_settings (key);

INSERT INTO system_settings (key, value) VALUES
  ('click_quota_enabled',     'true'),   -- false = agents have UNLIMITED clicks/views
  ('secure_link_enabled',     'true'),   -- <SecureLink>: no URL preview on hover
  ('security_guard_enabled',  'true'),   -- right-click / devtools / user-select guard
  ('live_activity_enabled',   'true'),   -- header click counter + timer + quota status
  ('show_history_to_agent',   'true'),
  ('popup_enabled',           'false'),  -- non-skippable maintenance/holiday/greeting popup
  ('popup_type',              'maintenance'),
  ('popup_title',             'Scheduled maintenance'),
  ('popup_message',           'We are performing scheduled maintenance. Please check back shortly.')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3) Seed: 15 realistic demo leads (5 niches x 3).
--    Leads marked as assigned go to the demo agent (agent1@crm.app) when the
--    app's users table exists; otherwise they are left unassigned (NULL).
--    Re-running is safe (ON CONFLICT on lead_code).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  agent_id UUID := NULL;   -- assignable to both TEXT and UUID columns
BEGIN
  IF to_regclass('users') IS NOT NULL THEN
    EXECUTE 'SELECT id FROM users WHERE email = ''agent1@crm.app'' LIMIT 1' INTO agent_id;
  END IF;

  INSERT INTO leads (
    lead_code, city_keyword, gmap_link, title, rating, reviews, niche_or_category,
    opens_at, mobile_no, website_status, website, status_service, call_status,
    lead_status, lead_close_amount, assigned_agent_id
  ) VALUES
    ('LD-0001', 'Mumbai', 'https://maps.google.com/?cid=1100000000000001', 'Skyline Realty Partners', 4.3, 128, 'Real Estate', '09:30 AM', '+91 98200 11001', 'Has Website', 'https://skylinerealty.example.in', 'SEO', 'Answered', 'In Progress', NULL, agent_id),
    ('LD-0002', 'Pune', 'https://maps.google.com/?cid=1100000000000002', 'Greenfield Homes & Estates', 4.1, 86, 'Real Estate', '10:00 AM', '+91 98200 11002', 'No Website', NULL, 'Website Design', 'Not Called', 'New', NULL, agent_id),
    ('LD-0003', 'Bengaluru', 'https://maps.google.com/?cid=1100000000000003', 'Urban Nest Properties', 4.6, 212, 'Real Estate', '09:00 AM', '+91 98200 11003', 'Has Website', 'https://urbannest.example.in', 'Google Ads', 'Answered', 'Closed Won', 45000, agent_id),
    ('LD-0004', 'Delhi', 'https://maps.google.com/?cid=1100000000000004', 'CityCare Multispeciality Clinic', 4.4, 342, 'Healthcare', '08:00 AM', '+91 98200 11004', 'Has Website', 'https://citycareclinic.example.in', 'Reputation Mgmt', 'Callback Requested', 'Callback', NULL, agent_id),
    ('LD-0005', 'Jaipur', 'https://maps.google.com/?cid=1100000000000005', 'SmileWorks Dental Studio', 4.8, 418, 'Healthcare', '10:00 AM', '+91 98200 11005', 'Broken Website', 'https://smileworks.example.in', 'Website Design', 'No Answer', 'In Progress', NULL, agent_id),
    ('LD-0006', 'Hyderabad', 'https://maps.google.com/?cid=1100000000000006', 'Vitality Physio & Wellness', 3.9, 57, 'Healthcare', '07:30 AM', '+91 98200 11006', 'No Website', NULL, 'SEO', 'Not Called', 'New', NULL, NULL),
    ('LD-0007', 'Ahmedabad', 'https://maps.google.com/?cid=1100000000000007', 'PixelCraft Digital Agency', 4.5, 96, 'Digital Marketing', '10:30 AM', '+91 98200 11007', 'Has Website', 'https://pixelcraft.example.in', 'Social Media', 'Answered', 'Closed Won', 28000, agent_id),
    ('LD-0008', 'Chennai', 'https://maps.google.com/?cid=1100000000000008', 'Brandwave Media Labs', 4.0, 64, 'Digital Marketing', '09:30 AM', '+91 98200 11008', 'Has Website', 'https://brandwave.example.in', 'Google Ads', 'No Answer', 'In Progress', NULL, agent_id),
    ('LD-0009', 'Kolkata', 'https://maps.google.com/?cid=1100000000000009', 'ClickNest Growth Studio', 3.7, 31, 'Digital Marketing', '11:00 AM', '+91 98200 11009', 'No Website', NULL, 'Website Design', 'Not Called', 'New', NULL, NULL),
    ('LD-0010', 'Mumbai', 'https://maps.google.com/?cid=1100000000000010', 'QuickFix Plumbing & Repairs', 4.2, 174, 'Local Services', '08:00 AM', '+91 98200 11010', 'No Website', NULL, 'Website Design', 'Answered', 'Not Interested', NULL, agent_id),
    ('LD-0011', 'Surat', 'https://maps.google.com/?cid=1100000000000011', 'SparkClean Home Services', 4.6, 239, 'Local Services', '07:00 AM', '+91 98200 11011', 'Has Website', 'https://sparkclean.example.in', 'SEO', 'Callback Requested', 'Callback', NULL, agent_id),
    ('LD-0012', 'Lucknow', 'https://maps.google.com/?cid=1100000000000012', 'AutoCare Car Detailing Hub', 4.4, 152, 'Local Services', '09:00 AM', '+91 98200 11012', 'Broken Website', 'https://autocarehub.example.in', 'Google Ads', 'Not Called', 'New', NULL, NULL),
    ('LD-0013', 'Delhi', 'https://maps.google.com/?cid=1100000000000013', 'Spice Route Kitchen', 4.5, 1204, 'Restaurants', '11:30 AM', '+91 98200 11013', 'Has Website', 'https://spiceroute.example.in', 'Social Media', 'Answered', 'In Progress', NULL, agent_id),
    ('LD-0014', 'Goa', 'https://maps.google.com/?cid=1100000000000014', 'Beachside Brew Cafe', 4.7, 865, 'Restaurants', '08:30 AM', '+91 98200 11014', 'No Website', NULL, 'Website Design', 'Not Called', 'New', NULL, NULL),
    ('LD-0015', 'Chandigarh', 'https://maps.google.com/?cid=1100000000000015', 'Tandoori Tales Dhaba', 4.1, 402, 'Restaurants', '12:00 PM', '+91 98200 11015', 'Has Website', 'https://tandooritales.example.in', 'Reputation Mgmt', 'No Answer', 'In Progress', NULL, NULL)
  ON CONFLICT (lead_code) DO NOTHING;
END $$;

-- Quick check
-- SELECT lead_code, title, niche_or_category, lead_status, assigned_agent_id FROM leads ORDER BY id;
