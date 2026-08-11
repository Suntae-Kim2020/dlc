#!/usr/bin/env bash
# DLC 백업.
#
#   ./deploy/backup.sh            평소 (systemd 타이머가 이걸 부른다)
#   ./deploy/backup.sh --verify   덤프를 실제로 열어 내용까지 확인
#
# PostgreSQL 만 받는다. Elasticsearch·Fuseki·BaseX 는 전부 PG 에서 파생된
# 표현 저장소이고 tools/ 의 적재 스크립트로 언제든 다시 만들 수 있다. 셋을
# 같이 받으면 용량만 몇 배로 늘고, 복원할 때 PG 와 어긋난 상태가 섞여 든다.
#
# 복원은 ./deploy/restore.sh 를 쓴다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 시험용으로 바꿔 끼울 수 있게 해 둔다. 평소에는 기본값을 쓴다.
DEST="${DL_BACKUP_DEST:-/media/user/df9db4f3-386b-4bd4-b1bf-fcebb530b180/dl-backup}"

KEEP_DAILY=14
KEEP_WEEKLY=8

STAMP="$(date +%Y-%m-%d_%H%M)"
VERIFY=0
[ "${1:-}" = "--verify" ] && VERIFY=1

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() {
	printf '[백업 실패] %s\n' "$*" >&2
	exit 1
}

DB_NAME="$(grep -E '^DB_NAME=' "$ROOT/backend/.env" | cut -d= -f2-)"
DB_USER="$(grep -E '^DB_USER=' "$ROOT/backend/.env" | cut -d= -f2-)"
DB_PASS="$(grep -E '^DB_PASSWORD=' "$ROOT/backend/.env" | cut -d= -f2-)"
export PGPASSWORD="$DB_PASS"

# ---------------------------------------------------------------- 사전 확인
# 디스크가 빠졌는데 그대로 진행하면 루트 파일시스템에 디렉터리를 만들어 놓고
# "백업 성공"이라고 보고하게 된다. 가장 흔하고 가장 위험한 실패다.
MOUNT="$(dirname "$DEST")"
mountpoint -q "$MOUNT" || die "백업 디스크가 마운트되어 있지 않습니다: $MOUNT"
[ -w "$MOUNT" ] || die "백업 디스크에 쓸 수 없습니다: $MOUNT"

mkdir -p "$DEST/daily"
# 이용자 개인정보(이름·이메일·전화)가 든 덤프다. 다른 사용자가 못 보게 한다.
chmod 700 "$DEST" 2>/dev/null || true

# 두 번 겹쳐 도는 것을 막는다.
exec 9>"$DEST/.lock"
flock -n 9 || die "이전 백업이 아직 돌고 있습니다"

SNAP="$DEST/daily/$STAMP.sql.gz"
[ -e "$SNAP" ] && die "같은 이름의 덤프가 이미 있습니다: $SNAP"

# ---------------------------------------------------------------- 덤프
log "백업 시작 → $SNAP"
# 먼저 임시 이름으로 받고 끝난 뒤에 옮긴다. 중간에 죽으면 반쪽짜리 파일이
# 정상 스냅숏 이름을 달고 남아, 복원할 때가 되어서야 알게 된다.
TMP="$SNAP.part"
trap 'rm -f "$TMP"' EXIT
pg_dump -h 127.0.0.1 -U "$DB_USER" --no-owner --no-privileges "$DB_NAME" | gzip >"$TMP"
mv "$TMP" "$SNAP"
trap - EXIT
chmod 600 "$SNAP"
log "덤프 완료 ($(du -h "$SNAP" | cut -f1))"

# ---------------------------------------------------------------- 검증
if [ "$VERIFY" = 1 ]; then
	# gzip 이 열리는지, 테이블 정의와 데이터가 실제로 들어 있는지 본다.
	gzip -t "$SNAP" || die "gzip 무결성 검사 실패: $SNAP"
	tables="$(zgrep -c '^CREATE TABLE' "$SNAP" || true)"
	copies="$(zgrep -c '^COPY public\.' "$SNAP" || true)"
	[ "${tables:-0}" -ge 10 ] || die "테이블 정의가 $tables 개뿐입니다 — 덤프가 온전치 않습니다"
	[ "${copies:-0}" -ge 5 ] || die "데이터 블록이 $copies 개뿐입니다 — 덤프가 온전치 않습니다"
	log "검증 통과 (테이블 $tables · 데이터 블록 $copies)"
fi

# ---------------------------------------------------------------- 보관 정리
# 일요일 것은 주간 보관으로 옮겨 둔다. 매일 것만 두면 2주 전으로 못 돌아간다.
mkdir -p "$DEST/weekly"
if [ "$(date +%u)" = 7 ]; then
	cp -a "$SNAP" "$DEST/weekly/" 2>/dev/null || true
fi

# 보관 기간을 두는 이유는 용량 때문만이 아니다. 탈퇴한 이용자의 개인정보가
# 백업에 영원히 남아 있으면 "삭제했다"는 말이 사실이 아니게 된다.
#
# ls 로 세지 않는다. glob 이 하나도 안 맞으면 ls 가 실패하는데, set -e 와
# pipefail 아래에서는 그 실패가 스크립트를 통째로 끝낸다. 덤프는 이미 끝난
# 뒤라 데이터는 멀쩡한데 정리도 요약도 못 하고 유닛만 failed 로 남는다.
# 매일 밤 그러면 진짜 실패와 구분이 안 된다.
count_snaps() { find "$1" -maxdepth 1 -name '*.sql.gz' 2>/dev/null | wc -l; }

prune() { # prune <디렉터리> <남길 개수>
	local dir="$1" keep="$2" old
	find "$dir" -maxdepth 1 -name '*.sql.gz' -printf '%T@ %p\n' 2>/dev/null |
		sort -rn | tail -n +$((keep + 1)) | cut -d' ' -f2- |
		while read -r old; do
			log "만료 삭제 $(basename "$dir")/$(basename "$old")"
			rm -f "$old"
		done
}
prune "$DEST/daily" "$KEEP_DAILY"
prune "$DEST/weekly" "$KEEP_WEEKLY"

log "백업 완료 — 일간 $(count_snaps "$DEST/daily") · 주간 $(count_snaps "$DEST/weekly")"
