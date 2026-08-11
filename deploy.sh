#!/usr/bin/env bash
# 배포: GitHub main 을 그대로 반영한다. 이 서버에서 소스를 수정하지 않는다.
#   사용법: /opt/dlc/deploy.sh
set -euo pipefail

cd /opt/dlc

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
( cd backend  && npm ci --omit=dev --no-audit --no-fund )
( cd frontend && npm ci --no-audit --no-fund )

echo "== 4/5 프론트엔드 빌드 =="
cp -a frontend/dist "/root/dist-backup-$(date +%Y%m%d-%H%M%S)"
( cd frontend && npm run build )
# 백업은 최근 5개만 유지
ls -1dt /root/dist-backup-* | tail -n +6 | xargs -r rm -rf

echo "== 5/5 백엔드 재시작 =="
pm2 restart dl-backend --update-env >/dev/null
sleep 3
pm2 list | grep dl-backend

echo
echo "== 헬스체크 =="
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://dl.ailibrary.kr/api/v1/bibs?limit=1")
echo "   API  ${code}"
[ "$code" = "200" ] || { echo "[경고] API 비정상 — pm2 logs dl-backend 확인"; exit 1; }
echo "배포 완료: $(git rev-parse --short HEAD)"
