#!/usr/bin/env bash
# CD-07: database-only backup and isolated restore drill. Run on production host.
set -Eeuo pipefail
umask 077

if [[ $EUID -ne 0 ]]; then
  echo 'Run with sudo bash CHECK_COMIC_DIARY_DB_RESTORE.sh' >&2
  exit 1
fi
for tool in docker sha256sum mktemp; do
  command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }
done

compose_file=/opt/comic-diary/compose.yml
[[ -f $compose_file ]] || { echo "Compose file not found: $compose_file" >&2; exit 1; }
cd /opt/comic-diary
source_db=$(docker compose -f "$compose_file" ps -q db)
[[ $source_db =~ ^[a-f0-9]{12,64}$ ]] || { echo 'Expected exactly one running database service.' >&2; exit 1; }
[[ $(docker inspect --format '{{.State.Running}}' "$source_db") == true ]] || { echo 'Source database is not running.' >&2; exit 1; }
image=$(docker inspect --format '{{.Image}}' "$source_db")
[[ $image =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Could not resolve local immutable database image.' >&2; exit 1; }

mkdir -p /opt/comic-diary/backups
backup_dir=$(mktemp -d /opt/comic-diary/backups/cd07-db-restore-XXXXXXXX)
chmod 700 "$backup_dir"
exec > >(tee -a "$backup_dir/check.log") 2>&1
printf 'BACKUP=%s\n' "$backup_dir"
printf 'DATABASE_IMAGE=%s\n' "$image"
restore_id=''
cleanup() {
  code=$?
  trap - EXIT
  if [[ -n $restore_id ]]; then
    if ! docker rm -f -v "$restore_id" >/dev/null; then
      echo "CLEANUP=FAIL; temporary container: $restore_id"
      code=1
    fi
  fi
  if [[ $code -eq 0 ]]; then
    echo 'RESULT=PASS; database dump restored successfully in isolated PostgreSQL'
  else
    echo 'RESULT=FAIL; backup and log retained; production database was not restored or changed'
  fi
  echo "BACKUP=$backup_dir"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Run pg_dump inside the source container: no password or URL leaves it.
# Write a partial file first; only completed dumps get the final filename.
echo '===== BACKUP ====='
docker exec "$source_db" sh -eu -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$backup_dir/database.dump.partial"
[[ -s $backup_dir/database.dump.partial ]] || { echo 'Empty database dump.'; exit 1; }
mv "$backup_dir/database.dump.partial" "$backup_dir/database.dump"
(cd "$backup_dir" && sha256sum database.dump > SHA256SUMS && sha256sum -c SHA256SUMS)

# Use the exact local image of the running DB, without a network or published port.
# Its data volume is disposable and is removed together with this container.
echo '===== ISOLATED POSTGRESQL ====='
restore_id=$(docker create --network none --label comic-diary.cd07.restore-probe=true \
  -e POSTGRES_USER=restore_probe -e POSTGRES_DB=restore_probe \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$image")
[[ $restore_id =~ ^[a-f0-9]{64}$ ]] || { echo 'Failed to create isolated container.'; exit 1; }
docker start "$restore_id" >/dev/null
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$restore_id" pg_isready -h 127.0.0.1 -U restore_probe -d restore_probe >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ $ready == true ]] || { echo 'Isolated PostgreSQL did not become ready.'; exit 1; }

echo '===== RESTORE ====='
docker cp "$backup_dir/database.dump" "$restore_id:/tmp/database.dump"
docker exec "$restore_id" pg_restore --list /tmp/database.dump > "$backup_dir/archive-list.txt"
docker exec "$restore_id" pg_restore -U restore_probe -d restore_probe \
  --no-owner --no-acl --exit-on-error --single-transaction /tmp/database.dump

echo '===== RESTORED TABLE COUNTS ====='
docker exec -i "$restore_id" psql -X -U restore_probe -d restore_probe \
  -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT 'users' AS table_name, count(*) AS rows FROM users
UNION ALL SELECT 'comics', count(*) FROM comics
UNION ALL SELECT 'chapters', count(*) FROM chapters
UNION ALL SELECT 'user_comics', count(*) FROM user_comics
UNION ALL SELECT 'user_chapter_reads', count(*) FROM user_chapter_reads
ORDER BY table_name;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated) THEN
    RAISE EXCEPTION 'Unvalidated constraints in restored public schema';
  END IF;
END $$;
SQL

echo 'DATABASE_RESTORE=PASS'
echo 'MEDIA_RESTORE=NOT_TESTED; cover files are not part of the database dump'
echo 'APP_ON_RESTORED_DATABASE=NOT_TESTED'
echo 'OFF_HOST_BACKUP=NOT_TESTED; copy backups to separate storage'
