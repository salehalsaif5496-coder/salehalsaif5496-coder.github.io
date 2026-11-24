#!/bin/sh
# Recreate a throwaway DB and run shim + schema + RLS tests against local PostgreSQL (as root: uses `su postgres`).
T=$(mktemp -d) && cp -r "$(cd "$(dirname "$0")/.." && pwd)/." "$T" && chmod -R a+rX "$T" && su postgres -c "dropdb --if-exists jojo_rls_test && createdb jojo_rls_test && PGOPTIONS='-c client_min_messages=warning' psql -X -q -v ON_ERROR_STOP=1 -d jojo_rls_test -f '$T/test/supabase-shim.sql' -f '$T/schema.sql' -f '$T/rls.test.sql'"
