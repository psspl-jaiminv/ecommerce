-- Runs once, when the postgres data volume is first initialised.
-- Creates the development (`app`) and test (`app_test`) databases if they do not exist yet.
SELECT 'CREATE DATABASE app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'app')\gexec

SELECT 'CREATE DATABASE app_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'app_test')\gexec
