-- =============================================================================
-- Route Tracker Database Setup Script
-- =============================================================================
-- This script creates the PostgreSQL user and databases needed for Route Tracker.
-- It is idempotent - safe to run multiple times.
--
-- Prerequisites:
-- - PostgreSQL installed and running
-- - Connect as a superuser (postgres)
--
-- Usage:
--   psql -U postgres -f create-database.sql
--
-- Note: Replace CHANGE_ME_IN_PRODUCTION with actual password before running
-- =============================================================================

-- Create the route_tracker user if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'route_tracker') THEN
        CREATE ROLE route_tracker WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
        RAISE NOTICE 'User route_tracker created successfully';
    ELSE
        -- Update password if user already exists
        ALTER ROLE route_tracker WITH PASSWORD 'CHANGE_ME_IN_PRODUCTION';
        RAISE NOTICE 'User route_tracker already exists, password updated';
    END IF;
END
$$;

-- Create production database if it doesn't exist
SELECT 'CREATE DATABASE route_tracker OWNER route_tracker'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'route_tracker')\gexec

-- Create development database if it doesn't exist  
SELECT 'CREATE DATABASE route_tracker_dev OWNER route_tracker'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'route_tracker_dev')\gexec

-- Grant all privileges on databases to route_tracker user
GRANT ALL PRIVILEGES ON DATABASE route_tracker TO route_tracker;
GRANT ALL PRIVILEGES ON DATABASE route_tracker_dev TO route_tracker;

-- Grant schema permissions (needed for EF Core migrations)
-- These need to be run after connecting to each database
\c route_tracker
GRANT ALL ON SCHEMA public TO route_tracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO route_tracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO route_tracker;

\c route_tracker_dev
GRANT ALL ON SCHEMA public TO route_tracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO route_tracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO route_tracker;

-- Return to default database
\c postgres

-- Display success message
SELECT '✅ Database setup completed successfully!' AS status;
SELECT 'User: route_tracker' AS info
UNION ALL
SELECT 'Databases: route_tracker, route_tracker_dev';

