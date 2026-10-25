#!/bin/bash
# Dumps the database, compresses it and uploads it to the private R2 bucket as backups/YYYY-MM-DD.sql.gz.
# Restore: gunzip -c FILE | psql "$DATABASE_URL"
set -euo pipefail

# pg_dump needs Neon's direct connection (not the "-pooler" address) and the system's certificate list.
url="${DATABASE_URL/-pooler./.}"
# Newer pg_dump refuses sslmode=require together with sslrootcert=system, so check the certificate fully.
url="${url/sslmode=require/sslmode=verify-full}"
[[ "$url" == *sslrootcert=* ]] || url="${url}$([[ "$url" == *\?* ]] && echo '&' || echo '?')sslrootcert=system"

file="backups/$(date -u +%Y-%m-%d).sql.gz"
pg_dump --no-owner --no-privileges "$url" | gzip -9 > /tmp/backup.sql.gz
size=$(stat -c %s /tmp/backup.sql.gz)
(( size > 1000 )) || { echo "Backup looks empty ($size bytes), not uploading"; exit 1; }

curl --fail --silent --show-error --aws-sigv4 "aws:amz:auto:s3" \
  --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" \
  -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" -H "content-type: application/gzip" \
  -T /tmp/backup.sql.gz "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com/$R2_BUCKET/$file"
echo "Uploaded $file ($size bytes)"
