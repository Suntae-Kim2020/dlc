#!/usr/bin/env bash
# DLC 복원.
#
#   ./deploy/restore.sh                  복원 가능한 스냅숏 목록
#   ./deploy/restore.sh 2026-08-11_0430  그 시점으로 되돌리기
#
# PostgreSQL 을 되돌린 뒤 Elasticsearch·Fuseki·BaseX 를 그 상태 기준으로
# 다시 만든다. 셋을 따로 백업하지 않는 이유는 backup.sh 주석에 적어 두었다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${DL_BACKUP_DEST:-/media/user/df9db4f3-386b-4bd4-b1bf-fcebb530b180/dl-backup}"

export PATH="$ROOT/.runtime/node/bin:$PATH"

DB_NAME="$(grep -E '^DB_NAME=' "$ROOT/backend/.env" | cut -d= -f2-)"
DB_USER="$(grep -E '^DB_USER=' "$ROOT/backend/.env" | cut -d= -f2-)"
DB_PASS="$(grep -E '^DB_PASSWORD=' "$ROOT/backend/.env" | cut -d= -f2-)"
export PGPASSWORD="$DB_PASS"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- 목록
if [ $# -eq 0 ]; then
	say "복원 가능한 스냅숏"
	for dir in daily weekly; do
		[ -d "$DEST/$dir" ] || continue
		printf '\n  [%s]\n' "$dir"
		# ls 대신 find — 스냅숏이 하나도 없으면 ls 가 실패하고, set -e 아래에서
		# 그 실패가 목록 출력을 통째로 끊는다(backup.sh 에 같은 주석이 있다).
		found=0
		while read -r f; do
			[ -n "$f" ] || continue
			printf '    %-22s %s\n' "$(basename "$f" .sql.gz)" "$(du -h "$f" | cut -f1)"
			found=1
		done < <(find "$DEST/$dir" -maxdepth 1 -name '*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)
		[ "$found" = 1 ] || printf '    (없음)\n'
	done
	cat <<MSG

  복원:  $0 <스냅숏이름>
MSG
	exit 0
fi

STAMP="$1"
SNAP=""
for dir in daily weekly; do
	[ -f "$DEST/$dir/$STAMP.sql.gz" ] && SNAP="$DEST/$dir/$STAMP.sql.gz" && break
done
[ -n "$SNAP" ] || {
	echo "❌ 그런 스냅숏이 없습니다: $STAMP" >&2
	exit 1
}

# ---------------------------------------------------------------- 확인
say "복원 대상"
echo "  $SNAP  ($(du -h "$SNAP" | cut -f1))"
echo
echo "  현재 데이터베이스는 지워지고 이 스냅숏으로 대체됩니다."
read -rp "  계속할까요? [y/N] " go
[ "$go" = "y" ] || exit 1

gzip -t "$SNAP" || {
	echo "❌ 스냅숏이 손상됐습니다." >&2
	exit 1
}

# ---------------------------------------------------------------- 복원
say "PostgreSQL 복원"
# 백엔드가 물고 있으면 DROP DATABASE 가 막힌다.
sudo systemctl stop dl-backend
sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
sudo -u postgres psql -q -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
sudo -u postgres psql -d "$DB_NAME" -q -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
zcat "$SNAP" | psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -q -v ON_ERROR_STOP=1
echo "  bib_records $(psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -Atc 'select count(*) from bib_records') 건"

say "검색·RDF·XML 재생성"
cd "$ROOT"
node tools/create-es-index.js
node tools/pg-to-es.js
curl -sf -X POST "http://127.0.0.1:3030/digital-library/update" \
	-H "Content-Type: application/sparql-update" --data "CLEAR DEFAULT" >/dev/null
node tools/pg-to-fuseki.js
node tools/pg-to-bibframe.js
node tools/add-sameAs.js
node tools/pg-to-basex.js

say "서비스 재기동"
sudo systemctl start dl-backend
sleep 3
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 'http://127.0.0.1:4000/api/v1/bibs?limit=1')"
echo "  API $code"
[ "$code" = "200" ] || {
	echo "❌ API 가 정상이 아닙니다 — journalctl -u dl-backend" >&2
	exit 1
}

echo
echo "복원 완료: $STAMP"
