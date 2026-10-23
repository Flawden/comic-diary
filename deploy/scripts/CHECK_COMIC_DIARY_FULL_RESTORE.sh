#!/usr/bin/env bash
# CD-07: database/media backup and isolated application restore drill.
set -Eeuo pipefail
umask 077

if [[ $EUID -ne 0 ]]; then
  echo 'Run with sudo bash CHECK_COMIC_DIARY_FULL_RESTORE.sh' >&2
  exit 1
fi
for tool in docker sha256sum mktemp python3 tar; do
  command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
diary_probe="$script_dir/CHECK_COMIC_DIARY_RESTORED_DIARY.cjs"
[[ -f $diary_probe && ! -L $diary_probe ]] || { echo 'Copy CHECK_COMIC_DIARY_RESTORED_DIARY.cjs next to this script.'; exit 1; }
compose_file=/opt/comic-diary/compose.yml
[[ -f $compose_file ]] || { echo "Compose file not found: $compose_file" >&2; exit 1; }
cd /opt/comic-diary
source_db=$(docker compose -f "$compose_file" ps -q db)
[[ $source_db =~ ^[a-f0-9]{12,64}$ ]] || { echo 'Expected exactly one running database service.' >&2; exit 1; }
[[ $(docker inspect --format '{{.State.Running}}' "$source_db") == true ]] || { echo 'Source database is not running.' >&2; exit 1; }
source_app=$(docker compose -f "$compose_file" ps -q app)
[[ $source_app =~ ^[a-f0-9]{12,64}$ ]] || { echo 'Expected exactly one running app service.' >&2; exit 1; }
[[ $(docker inspect --format '{{.State.Running}}' "$source_app") == true ]] || exit 1
app_image=$(docker inspect --format '{{.Image}}' "$source_app")
[[ $app_image =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
media_root=$(docker exec "$source_app" node -e 'process.stdout.write(process.env.MEDIA_ROOT || "/app/.media")')
[[ $media_root == /app/data/media ]] || { echo 'Unexpected production MEDIA_ROOT; stopped before backup.' >&2; exit 1; }
image=$(docker inspect --format '{{.Image}}' "$source_db")
[[ $image =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Could not resolve local immutable database image.' >&2; exit 1; }

mkdir -p /opt/comic-diary/backups
backup_dir=$(mktemp -d /opt/comic-diary/backups/cd07-full-restore-XXXXXXXX)
chmod 700 "$backup_dir"
exec > >(tee -a "$backup_dir/check.log") 2>&1
printf 'BACKUP=%s\n' "$backup_dir"
printf 'DATABASE_IMAGE=%s\n' "$image"
restore_id=''
app_id=''
network_id=''
cleanup() {
  code=$?
  trap - EXIT
  if [[ -n $app_id ]]; then
    if ! docker rm -f -v "$app_id" >/dev/null; then echo "APP_CLEANUP=FAIL: $app_id"; code=1; fi
  fi
  if [[ -n $restore_id ]]; then
    if ! docker rm -f -v "$restore_id" >/dev/null; then
      echo "CLEANUP=FAIL; temporary container: $restore_id"
      code=1
    fi
  fi
  if [[ -n $network_id ]]; then
    if ! docker network rm "$network_id" >/dev/null; then echo "NETWORK_CLEANUP=FAIL: $network_id"; code=1; fi
  fi
  if [[ $code -eq 0 ]]; then
    echo 'RESULT=PASS; database, media archive and isolated application restore drill passed'
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

# Media copy follows the database snapshot. Every local cover referenced in that
# snapshot must exist in the archived/restored media or this drill fails.
echo '===== MEDIA BACKUP ====='
mkdir "$backup_dir/captured-media"
docker cp "$source_app:$media_root/." "$backup_dir/captured-media/"
python3 - "$backup_dir/captured-media" <<'PYMEDIA'
import pathlib,sys
root=pathlib.Path(sys.argv[1])
for p in root.rglob('*'):
    if p.is_symlink() or not (p.is_file() or p.is_dir()):
        raise SystemExit('Media contains unsupported links or special files')
PYMEDIA
tar -czf "$backup_dir/media.tar.gz" -C "$backup_dir/captured-media" .
(cd "$backup_dir" && sha256sum database.dump media.tar.gz > SHA256SUMS && sha256sum -c SHA256SUMS)
mkdir "$backup_dir/restored-media"
python3 - "$backup_dir" <<'PYMEDIA'
import hashlib,json,pathlib,sys,tarfile
root=pathlib.Path(sys.argv[1]); target=root/'restored-media'
with tarfile.open(root/'media.tar.gz','r:gz') as archive:
    for m in archive.getmembers():
        path=pathlib.PurePosixPath(m.name)
        if path.is_absolute() or '..' in path.parts or not (m.isdir() or m.isfile()):
            raise SystemExit('Unsafe archive member')
    archive.extractall(target)
def manifest(folder):
    return {str(p.relative_to(folder)):hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(folder.rglob('*')) if p.is_file()}
expected=manifest(root/'captured-media'); actual=manifest(target)
if expected!=actual: raise SystemExit('Restored media differs from captured files')
(root/'media-manifest.json').write_text(json.dumps(actual,indent=2))
target.chmod(0o755)
for p in target.rglob('*'): p.chmod(0o755 if p.is_dir() else 0o644)
print('MEDIA_ARCHIVE_ROUNDTRIP=PASS; files='+str(len(actual)))
PYMEDIA

echo '===== ISOLATED NETWORK ====='
network_name="cd07-$(basename "$backup_dir")"
network_id=$(docker network create --internal --label comic-diary.cd07.restore-probe=true "$network_name")
[[ $network_id =~ ^[a-f0-9]{64}$ ]] || exit 1
printf 'APP_IMAGE=%s\n' "$app_image"
# Use the exact local DB image on an isolated internal network, without published ports.
# Its data volume is disposable and is removed together with this container.
echo '===== ISOLATED POSTGRESQL ====='
restore_id=$(docker create --network "$network_id" --network-alias restore-db --label comic-diary.cd07.restore-probe=true \
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
echo '===== ISOLATED APPLICATION ====='
app_id=$(docker create --network "$network_id" --label comic-diary.cd07.restore-probe=true \
  --security-opt no-new-privileges:true --cap-drop ALL \
  --mount "type=bind,src=$backup_dir/restored-media,dst=/app/data/media,readonly" \
  -e DATABASE_URL=postgresql://restore_probe@restore-db:5432/restore_probe \
  -e MEDIA_ROOT=/app/data/media -e ADMIN_IMPORT_ENABLED=false \
  -e NEXT_TELEMETRY_DISABLED=1 -e CD07_ISOLATED_RESTORE=true "$app_image")
[[ $app_id =~ ^[a-f0-9]{64}$ ]] || exit 1
docker start "$app_id" >/dev/null
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$app_id" node -e 'fetch("http://127.0.0.1:3000/",{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ $ready == true ]] || { echo 'Restored application did not become ready.'; exit 1; }
echo '===== APPLICATION AND COVER CHECKS ====='
docker exec -i "$app_id" node <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { Client } = require('pg');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const base = 'http://127.0.0.1:3000';
async function get(path) {
  return fetch(base+path, {redirect:'manual',signal:AbortSignal.timeout(15000)});
}
(async()=>{
  const client=new Client({connectionString:process.env.DATABASE_URL});
  await client.connect();
  try {
    for(const path of ['/', '/login', '/register']) {
      const response=await get(path);assert.equal(response.status,200,path);
      await response.arrayBuffer();
    }
    const account=await get('/account');
    assert.ok([302,303,307,308].includes(account.status),'account requires login');
    assert.ok(account.headers.get('location')?.startsWith('/login'),'account login redirect');
    const exported=await get('/api/account/export');
    assert.equal(exported.status,401,'anonymous export');
    assert.ok(exported.headers.get('cache-control')?.includes('no-store'));
    console.log('ANONYMOUS_PAGES_AND_EXPORT_BOUNDARY=PASS');
    const {rows:comics}=await client.query("SELECT slug FROM comics WHERE visibility='SHARED' AND publication_status='PUBLISHED' ORDER BY id");
    for(const comic of comics) {
      const response=await get('/comics/'+encodeURIComponent(comic.slug));
      assert.equal(response.status,200,'restored public comic page');await response.arrayBuffer();
    }
    console.log('RESTORED_PUBLIC_COMIC_PAGES=PASS; count='+comics.length);
    const {rows:covers}=await client.query("SELECT DISTINCT cover_url FROM comics WHERE cover_url LIKE '/media/covers/%'");
    for(const {cover_url:url} of covers) {
      const filename=url.slice('/media/covers/'.length);
      assert.match(filename,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/);
      const bytes=await fs.readFile(process.env.MEDIA_ROOT+'/covers/'+filename);
      const response=await get(url);assert.equal(response.status,200,'local cover response');
      const received=Buffer.from(await response.arrayBuffer());
      assert.equal(hash(received),hash(bytes),'local cover bytes');
      const type={jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[filename.split('.').pop()];
      assert.ok(response.headers.get('content-type')?.startsWith(type),'local cover content-type');
    }
    console.log('REFERENCED_LOCAL_COVERS=PASS; count='+covers.length);
    if(!covers.length) console.log('LOCAL_COVER_HTTP=NOT_EXERCISED; no local cover references in snapshot');
  } finally { await client.end(); }
})().catch(error=>{console.error('APPLICATION_CHECK=FAIL; '+error.message);process.exitCode=1;});
JS

echo 'MEDIA_RESTORE=PASS'
echo 'APP_ON_RESTORED_DATABASE=PASS; public HTTP checks and anonymous export boundary'
echo '===== AUTHENTICATED RESTORED DIARY ====='
docker exec -i "$app_id" node < "$diary_probe"
echo 'AUTHENTICATED_DIARY_HTTP=PASS; authenticated rendering and exported diary values verified on restored DB'
echo 'EXTERNAL_COVER_URLS=NOT_TESTED'
echo 'OFF_HOST_BACKUP=NOT_TESTED; copy backups to separate storage'
