#!/usr/bin/env bash
# 운영 서버(dl.ailibrary.kr)에 GitHub main 을 반영한다.
#
#   ./deploy.sh
#
# 서버에서 소스를 수정하지 않는다. 자세한 이유는 README 의 배포 절을 참고.
#
# 최초 구축은 이 스크립트가 아니라 ./deploy/install.sh 가 한다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

export PATH="$ROOT/.runtime/node/bin:$PATH"

echo "== 1/5 현재 상태 확인 =="
if [ -n "$(git status --porcelain)" ]; then
	echo "[중단] 서버에 커밋되지 않은 변경이 있습니다. 유실 방지를 위해 멈춥니다:"
	git status --short
	echo "확인 후 되돌리려면: git checkout -- . && git clean -fd"
	exit 1
fi

echo "== 2/5 GitHub 에서 가져오기 =="
git fetch origin
BEFORE=$(git rev-parse --short HEAD)
# ff-only — 서버가 앞서 있으면 병합하지 않고 실패시켜 분기를 조기에 드러낸다
git merge --ff-only origin/main
AFTER=$(git rev-parse --short HEAD)
echo "   ${BEFORE} -> ${AFTER}"

if [ "$BEFORE" = "$AFTER" ]; then
	echo "   변경 없음. 재빌드만 진행합니다."
fi

echo "== 3/5 의존성 =="
# --silent 금지 — lockfile 불일치 같은 npm ci 실패 사유가 가려진다.
(cd backend && npm ci --omit=dev --no-audit --no-fund)
(cd frontend && npm ci --no-audit --no-fund)

echo "== 4/5 프론트엔드 빌드 =="
BACKUP_DIR="$ROOT/.runtime/dist-backup-$(date +%Y%m%d-%H%M%S)"
cp -a frontend/dist "$BACKUP_DIR"
(cd frontend && npm run build)
# 백업은 최근 5개만 유지
ls -1dt "$ROOT"/.runtime/dist-backup-* | tail -n +6 | xargs -r rm -rf

# Caddy 가 읽는 곳은 /var/www/dl 이다(이유는 deploy/Caddyfile 주석 참고).
# 여기까지 옮기지 않으면 빌드는 됐는데 화면은 그대로인 상태가 된다.
sudo rsync -a --delete frontend/dist/ /var/www/dl/
sudo chmod -R a+rX /var/www/dl

echo "== 5/5 백엔드 재시작 =="
sudo systemctl restart dl-backend
sleep 3
systemctl is-active dl-backend

echo
echo "== 헬스체크 =="
# 로컬을 먼저 본다. 여기서 실패하면 앱 문제, 여기는 되는데 공개 주소가 안 되면
# Caddy 나 DNS 문제라 원인이 갈린다.
local_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "http://127.0.0.1:4000/api/v1/bibs?limit=1")
echo "   API(로컬)  ${local_code}"
[ "$local_code" = "200" ] || {
	echo "[경고] API 비정상 — journalctl -u dl-backend -n 50"
	exit 1
}

pub_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://dl.ailibrary.kr/api/v1/bibs?limit=1" || echo "000")
echo "   API(공개)  ${pub_code}"
[ "$pub_code" = "200" ] || echo "   (공개 주소가 아직 이 서버를 가리키지 않으면 정상입니다)"

echo "배포 완료: $(git rev-parse --short HEAD)"
