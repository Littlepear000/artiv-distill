#!/bin/sh
# Runs once, when the postgres data volume is first initialised.
# Creates the two runtime roles with passwords taken from the environment
# (set in .env, passed through docker-compose.prod.yml). Mirrors db/init/01_roles.sql.
# No "set -eu" here: the postgres entrypoint may source this file into its own shell.
: "${PDF_APP_PASSWORD:?PDF_APP_PASSWORD is required}"
: "${PDF_APP_AUTH_PASSWORD:?PDF_APP_AUTH_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE pdf_app LOGIN PASSWORD '${PDF_APP_PASSWORD}';
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO pdf_app;
GRANT USAGE ON SCHEMA public TO pdf_app;

CREATE ROLE pdf_app_auth LOGIN PASSWORD '${PDF_APP_AUTH_PASSWORD}' BYPASSRLS;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO pdf_app_auth;
GRANT USAGE ON SCHEMA public TO pdf_app_auth;
EOSQL
