-- Add free-text commis_name field to jobs
-- commis_agent_id is kept for backward compat (legacy data read-only)
ALTER TABLE jobs ADD COLUMN commis_name TEXT;

-- Clear the commis_agents table; names will now be typed directly on jobs
DELETE FROM commis_agents;
