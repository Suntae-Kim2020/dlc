#!/usr/bin/env bash
# GCP 에 운영 서버를 만든다.
#
#   ./deploy/provision-gcp.sh --plan     무엇을 만들지 보여주기만 한다 (과금 없음)
#   ./deploy/provision-gcp.sh            실제로 만든다
#
# 만드는 것 — 방화벽 규칙(80/443), 고정 외부 IP, VM 1대.
# 하지 않는 것 — 서버 안의 구축은 deploy/install.sh 가, DNS 는 사람이 한다.
#
# 같은 이름의 자원이 있으면 만들지 않고 그대로 쓴다. 여러 번 실행해도 VM 이
# 여러 대 생기지 않는다.
set -euo pipefail

NAME="${DL_GCP_NAME:-dl-ailibrary}"
PROJECT="${DL_GCP_PROJECT:-ailibrary-kisti}"
ZONE="${DL_GCP_ZONE:-asia-northeast3-a}"        # 서울
TYPE="${DL_GCP_TYPE:-e2-medium}"                # 2 vCPU(공유) / 4GB
IMAGE_FAMILY="${DL_GCP_IMAGE_FAMILY:-ubuntu-2404-lts-amd64}"
IMAGE_PROJECT="ubuntu-os-cloud"
# 표준(HDD) 을 쓰는 이유 — 접속이 거의 없는 데모라 IOPS 가 필요 없고,
# balanced(SSD) 는 GB 당 2.5배다. 나중에 바꿀 수 있다.
DISK_TYPE="${DL_GCP_DISK_TYPE:-pd-standard}"
DISK_GB="${DL_GCP_DISK_GB:-30}"
FW_NAME="${DL_GCP_FW:-dl-allow-web}"
IP_NAME="${DL_GCP_IP:-dl-ailibrary-ip}"
# 네트워크 등급. STANDARD 는 PREMIUM 보다 이그레스가 싸다. 한국 안에서만
# 쓰는 서비스라 구글 백본을 길게 타고 갈 이유가 없다.
NET_TIER="${DL_GCP_NET_TIER:-STANDARD}"

PLAN_ONLY=0
[ "${1:-}" = "--plan" ] && PLAN_ONLY=1

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()  { printf '  %-14s %s\n' "$1" "$2"; }
die() { printf '\n[중단] %s\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null || die "gcloud 가 필요합니다."
G() { gcloud --project="$PROJECT" "$@" 2>/dev/null; }

say "계정 확인"
acct="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)"
[ -n "$acct" ] || die "gcloud 인증이 없습니다.  gcloud auth login"
ok "계정" "$acct"
billing="$(gcloud billing projects describe "$PROJECT" --format='value(billingAccountName,billingEnabled)' 2>/dev/null || true)"
[ -n "$billing" ] || die "프로젝트 $PROJECT 의 결제 상태를 읽지 못했습니다."
ok "프로젝트" "$PROJECT"
ok "결제" "$billing"

say "만들 것"
ok "이름" "$NAME"
ok "머신" "$TYPE"
ok "위치" "$ZONE"
ok "이미지" "$IMAGE_FAMILY"
ok "디스크" "$DISK_GB GB ($DISK_TYPE)"
ok "네트워크" "$NET_TIER 등급, 고정 IP $IP_NAME"
ok "방화벽" "$FW_NAME — 80/443 인바운드 (SSH 는 GCP 기본 규칙)"

if [ "$PLAN_ONLY" = "1" ]; then
	echo
	echo "  --plan 이므로 여기서 멈춥니다. 실제로 만들려면 인자 없이 실행하세요."
	exit 0
fi

# ---------------------------------------------------------------- 고정 IP
# VM 보다 먼저 잡는다. VM 생성 시점에 붙여야 나중에 갈아 끼우는 일이 없다.
say "고정 외부 IP"
REGION="${ZONE%-*}"
if G compute addresses describe "$IP_NAME" --region="$REGION" >/dev/null; then
	ok "재사용" "$IP_NAME"
else
	G compute addresses create "$IP_NAME" --region="$REGION" \
		--network-tier="$NET_TIER" >/dev/null
	ok "생성" "$IP_NAME"
fi
IP="$(G compute addresses describe "$IP_NAME" --region="$REGION" --format='value(address)')"
ok "주소" "$IP"

# ---------------------------------------------------------------- 방화벽
say "방화벽"
if G compute firewall-rules describe "$FW_NAME" >/dev/null; then
	ok "재사용" "$FW_NAME"
else
	# 80 을 여는 것은 Caddy 의 인증서 발급이 HTTP-01 을 쓰기 때문이다.
	# 443 만 열면 첫 발급이 실패한다.
	G compute firewall-rules create "$FW_NAME" \
		--allow=tcp:80,tcp:443 \
		--target-tags=dl-web \
		--description="DLC web (80 은 ACME HTTP-01 용)" >/dev/null
	ok "생성" "$FW_NAME"
fi

# ---------------------------------------------------------------- VM
say "VM 생성"
if G compute instances describe "$NAME" --zone="$ZONE" >/dev/null; then
	ok "이미 있음" "$NAME"
else
	G compute instances create "$NAME" \
		--zone="$ZONE" \
		--machine-type="$TYPE" \
		--image-family="$IMAGE_FAMILY" \
		--image-project="$IMAGE_PROJECT" \
		--boot-disk-size="${DISK_GB}GB" \
		--boot-disk-type="$DISK_TYPE" \
		--address="$IP" \
		--network-tier="$NET_TIER" \
		--tags=dl-web \
		--labels=app=dlc >/dev/null
	ok "생성" "$NAME"
fi
status="$(G compute instances describe "$NAME" --zone="$ZONE" --format='value(status)')"
ok "상태" "$status"

cat <<EOF

다음 단계

  1) DNS   dl.ailibrary.kr A 레코드를 $IP 로 변경
           (Caddy 가 인증서를 받으려면 이게 먼저입니다)

  2) 접속   gcloud compute ssh $NAME --zone=$ZONE --project=$PROJECT

  3) 구축   sudo apt-get update && sudo apt-get install -y git
           git clone https://github.com/Suntae-Kim2020/dlc.git ~/DLC
           cd ~/DLC/digital-library
           sudo DL_APP_USER=\$(id -un) ./deploy/install.sh

EOF
