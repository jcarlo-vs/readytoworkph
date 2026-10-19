# Nightly database backup job (Cloud Run Job, started by Cloud Scheduler). Uses Postgres 18's own
# pg_dump, matching the Neon database version.
FROM postgres:18-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backup.sh /backup.sh
USER postgres
ENTRYPOINT ["/bin/bash", "/backup.sh"]
