#!/usr/bin/env bash
# 헤츠너(204.168.215.242)의 운영 데이터를 이 머신으로 옮긴다.
#
#   ./deploy/migrate-from-hetzner.sh            이전 실행
#   ./deploy/migrate-from-hetzner.sh --dry-run  건수만 비교하고 끝
#
# PostgreSQL 만 덤프해서 옮기고, Elasticsearch·Fuseki·BaseX 는 옮기지 않고
# 여기서 다시 만든다. 셋 다 PG 에서 파생된 표현 저장소라 재생성이 곧 정답이고,
# 실제로 헤츠너 ES 에는 PG 에 없는 문서가 남아 있다(수확 후 PG 쪽만 정리된 흔적).
# 덤프를 그대로 복사하면 그 불일치까지 따라온다.
#
# 여러 번 실행해도 안전하다. 대상 DB 를 매번 새로 만든다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_HOST="204.168.215.242"
SRC_USER="root"
SSH_KEY="${SSH_KEY:-$ROOT/../ssh-key-2026-05-02.key}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

export PATH="$ROOT/.runtime/node/bin:$PATH"

DB_NAME="$(grep -E '^DB_NAME=' "$ROOT/backend/.env" | cut -d= -f2-)"
DB_USER="$(grep -E '^DB_USER=' "$ROOT/backend/.env" | cut -d= -f2-)"
DB_PASS="$(grep -E '^DB_PASSWORD=' "$ROOT/backend/.env" | cut -d= -f2-)"
export PGPASSWORD="$DB_PASS"

ssh_src() { ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "$SRC_USER@$SRC_HOST" "$@"; }

# 헤츠너 쪽 psql 은 /root 에서 sudo -u postgres 로 도느라 디렉토리 경고를 낸다.
# /tmp 로 옮겨서 실행하면 조용하다.
src_psql() { ssh_src "cd /tmp && sudo -u postgres psql -d digital_library -Atc \"$1\""; }

COUNT_SQL="select table_name||'='||(xpath('/row/c/text()', query_to_xml('select count(*) c from '||table_name, false, true, '')))[1]::text::int from information_schema.tables where table_schema='public' order by table_name"

# ---------------------------------------------------------------- 원본 확인
say "원본 확인 ($SRC_HOST)"
if ! ssh_src true 2>/dev/null; then
	echo "❌ SSH 접속 실패. 키를 확인하세요: $SSH_KEY" >&2
	echo "   (키 권한이 600 이어야 합니다)" >&2
	exit 1
fi
SRC_COUNTS="$(src_psql "$COUNT_SQL")"
echo "$SRC_COUNTS" | sed 's/^/  /'

if [ "$DRY_RUN" = 1 ]; then
	say "대상 확인 (이 머신)"
	psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -Atc "$COUNT_SQL" 2>/dev/null | sed 's/^/  /' ||
		echo "  (아직 데이터 없음)"
	exit 0
fi

# ---------------------------------------------------------------- 덤프
say "덤프 받기"
DUMP="$(mktemp /tmp/dl-hetzner-XXXXXX.sql)"
trap 'rm -f "$DUMP"' EXIT
ssh_src 'cd /tmp && sudo -u postgres pg_dump --no-owner --no-privileges -d digital_library' >"$DUMP"
echo "  $(du -h "$DUMP" | cut -f1)  $DUMP"

# 스키마까지 통째로 든 덤프인지 확인한다. 빈 파일을 그대로 복원하면
# 멀쩡하던 DB 만 날린다.
if ! grep -q "^CREATE TABLE" "$DUMP"; then
	echo "❌ 덤프에 테이블 정의가 없습니다. 중단합니다." >&2
	exit 1
fi

# ---------------------------------------------------------------- 복원
say "복원"
# 원본 그대로를 다시 만든다. 이어 붙이면 PK 충돌이 나고, 지운 행이 되살아난다.
sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
sudo -u postgres psql -q -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
sudo -u postgres psql -d "$DB_NAME" -q -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -q -v ON_ERROR_STOP=1 -f "$DUMP"

# 헤츠너는 PostgreSQL 14, 이쪽은 16 이다. 평문 덤프라 그대로 들어가지만
# 정말 다 들어갔는지는 건수로 확인한다.
psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -q -c "ANALYZE;"
DST_COUNTS="$(psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -Atc "$COUNT_SQL")"

if [ "$SRC_COUNTS" = "$DST_COUNTS" ]; then
	echo "  건수 일치 — $(echo "$SRC_COUNTS" | wc -l) 개 테이블"
else
	echo "❌ 건수가 다릅니다." >&2
	diff <(echo "$SRC_COUNTS") <(echo "$DST_COUNTS") | sed 's/^/     /' >&2
	exit 1
fi

# 인덱스는 덤프에 함께 들어오지만, 저장소를 새로 만든 뒤 add_indexes.sql 이
# 빠진 채로 남는 일이 잦다. 한 번 더 돌려 둔다(멱등).
psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -q -f "$ROOT/database/add_indexes.sql" >/dev/null 2>&1 || true

# ---------------------------------------------------------------- 파생 저장소
say "검색·RDF·XML 재생성 (PG 기준)"

cd "$ROOT"
node tools/create-es-index.js
node tools/pg-to-es.js

# Fuseki 는 이어 붙이는 방식이라 기존 트리플을 먼저 비운다. 안 그러면
# 갱신된 서지의 옛 트리플이 남아 SPARQL 결과가 둘로 보인다.
curl -sf -X POST "http://127.0.0.1:3030/digital-library/update" \
	-H "Content-Type: application/sparql-update" \
	--data "CLEAR DEFAULT" >/dev/null
node tools/pg-to-fuseki.js
node tools/pg-to-bibframe.js
node tools/add-sameAs.js

node tools/pg-to-basex.js

# ---------------------------------------------------------------- 결과
say "결과"
printf '  %-14s %s\n' "PostgreSQL" "$(psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -Atc 'select count(*) from bib_records') 건 (bib_records)"
printf '  %-14s %s\n' "Elasticsearch" "$(curl -s 'http://127.0.0.1:9200/bib-records/_count' | grep -oE '"count":[0-9]+' | cut -d: -f2) 건"
printf '  %-14s %s\n' "Fuseki" "$(curl -s -G 'http://127.0.0.1:3030/digital-library/query' --data-urlencode 'query=SELECT (COUNT(*) AS ?c) WHERE {?s ?p ?o}' -H 'Accept: text/csv' | tail -1) triples"

cat <<'MSG'

이전이 끝났습니다.

  확인:  curl -s http://127.0.0.1:4000/api/v1/bibs?limit=1
  이후:  dl.ailibrary.kr A 레코드를 이 머신으로 바꾸면 전환됩니다.
MSG
