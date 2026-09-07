#!/usr/bin/env bash
# 헤츠너 클라우드에 운영 서버를 만든다.
#
#   ./deploy/provision-hetzner.sh --plan     무엇을 만들지 보여주기만 한다 (과금 없음)
#   ./deploy/provision-hetzner.sh            실제로 만든다
#
# 만드는 것 — SSH 키 등록, 방화벽(22/80/443), 서버 1대.
# 하지 않는 것 — 서버 안의 구축은 deploy/install.sh 가, DNS 는 사람이 한다.
#
# 토큰은 저장소에 남기지 않는다. backend/.env 의 HCLOUD_TOKEN 을 읽거나
# 환경변수로 넘긴다.
#
# 같은 이름의 자원이 이미 있으면 만들지 않고 그대로 쓴다. 여러 번 실행해도
# 서버가 여러 대 생기지 않는다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NAME="${DL_SERVER_NAME:-dl-ailibrary}"
# cpx31 을 기본으로 두는 이유 — 유럽과 싱가포르 양쪽에서 모두 제공되는
# 4vCPU/8GB 사양이다. cx 계열은 더 싸지만 유럽에만 있어서, 위치를 바꾸면
# "그런 타입 없음"으로 막힌다.
TYPE="${DL_SERVER_TYPE:-cpx31}"
IMAGE="${DL_SERVER_IMAGE:-ubuntu-24.04}"
LOCATION="${DL_SERVER_LOCATION:-}"     # 비우면 목록을 보여주고 멈춘다
SSH_KEY_NAME="${DL_SSH_KEY_NAME:-$NAME}"
SSH_PUB="${DL_SSH_PUB:-$HOME/.ssh/id_ed25519.pub}"
FIREWALL_NAME="${DL_FIREWALL_NAME:-$NAME}"

API="https://api.hetzner.cloud/v1"
PLAN_ONLY=0
[ "${1:-}" = "--plan" ] && PLAN_ONLY=1

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()  { printf '  %-14s %s\n' "$1" "$2"; }
die() { printf '\n[중단] %s\n' "$*" >&2; exit 1; }

command -v jq >/dev/null || die "jq 가 필요합니다.  brew install jq"

# ---------------------------------------------------------------- 토큰
if [ -z "${HCLOUD_TOKEN:-}" ] && [ -f "$ROOT/backend/.env" ]; then
	# .env 를 통째로 source 하지 않는다. 다른 변수까지 셸에 끌고 들어오면
	# 여기서 쓰는 이름과 부딪힐 수 있다. 필요한 한 줄만 꺼낸다.
	HCLOUD_TOKEN="$(grep -m1 '^HCLOUD_TOKEN=' "$ROOT/backend/.env" 2>/dev/null | cut -d= -f2- || true)"
fi
[ -n "${HCLOUD_TOKEN:-}" ] || die "HCLOUD_TOKEN 이 없습니다. backend/.env 에 넣거나 환경변수로 넘기세요."

api() { # api <METHOD> <PATH> [JSON]
	local method="$1" path="$2" body="${3:-}"
	local args=(-sS -X "$method" -H "Authorization: Bearer $HCLOUD_TOKEN" -w '\n%{http_code}')
	[ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
	local out code
	out="$(curl "${args[@]}" "$API$path")" || die "API 호출 실패: $method $path"
	code="$(printf '%s' "$out" | tail -1)"
	out="$(printf '%s' "$out" | sed '$d')"
	# 4xx/5xx 는 헤츠너가 사유를 본문에 담아 준다. 그대로 보여줘야 원인을 안다.
	case "$code" in
		2*) printf '%s' "$out" ;;
		401|403) die "토큰이 거부됐습니다($code). 권한이 Read & Write 인지 확인하세요." ;;
		*) die "API $code — $(printf '%s' "$out" | jq -r '.error.message // .' 2>/dev/null)" ;;
	esac
}

say "계정 확인"
# 서버 목록 조회는 과금이 없고, 토큰이 살아 있는지 가장 싸게 확인하는 방법이다.
existing="$(api GET "/servers?name=$NAME")"
ok "토큰" "유효"

# ---------------------------------------------------------------- 이미 있으면 재사용
if [ "$(printf '%s' "$existing" | jq '.servers | length')" -gt 0 ]; then
	ip="$(printf '%s' "$existing" | jq -r '.servers[0].public_net.ipv4.ip')"
	status="$(printf '%s' "$existing" | jq -r '.servers[0].status')"
	say "이미 있는 서버를 씁니다"
	ok "$NAME" "$ip ($status)"
	echo
	echo "다음 단계는 이 파일 끝의 안내를 보세요."
	exit 0
fi

# ---------------------------------------------------------------- 위치 선택
if [ -z "$LOCATION" ]; then
	say "위치를 골라야 합니다"
	printf '%s\n' "$(api GET /locations)" | jq -r '
		.locations[] | "  \(.name)\t\(.city), \(.country)\t\(.network_zone)"' | column -t -s$'\t'
	echo
	echo "  DL_SERVER_LOCATION=<name> 으로 다시 실행하세요."
	echo "  (이용자가 한국이면 물리적으로 가까운 곳이 응답이 빠릅니다)"
	exit 1
fi

# ---------------------------------------------------------------- 사양 확인
say "만들 것"
types="$(api GET "/server_types?name=$TYPE")"
[ "$(printf '%s' "$types" | jq '.server_types | length')" -gt 0 ] || die "서버 타입 '$TYPE' 을 찾을 수 없습니다."
printf '%s' "$types" | jq -r '.server_types[0] |
	"  사양            \(.name) — vCPU \(.cores), RAM \(.memory)GB, 디스크 \(.disk)GB"'
# 통화는 계정마다 다르다(USD/EUR). 하드코딩하면 금액을 잘못 읽게 되므로
# 계정의 실제 통화를 받아서 붙인다.
currency="$(api GET /pricing | jq -r '.pricing.currency // "?"')"
price="$(printf '%s' "$types" | jq -r --arg loc "$LOCATION" '
	.server_types[0].prices[] | select(.location==$loc)
	| (.price_monthly.gross | tonumber * 100 | round / 100 | tostring) // "?"')"
ok "위치" "$LOCATION"
ok "이미지" "$IMAGE"
ok "월 요금" "${price:-?} ${currency} (부가세 포함, 트래픽 초과분 별도)"
ok "방화벽" "$FIREWALL_NAME — 22/80/443 인바운드만"

if [ "$PLAN_ONLY" = "1" ]; then
	echo
	echo "  --plan 이므로 여기서 멈춥니다. 실제로 만들려면 인자 없이 실행하세요."
	exit 0
fi

# ---------------------------------------------------------------- SSH 키
say "SSH 키"
[ -f "$SSH_PUB" ] || die "공개키가 없습니다: $SSH_PUB"
keys="$(api GET "/ssh_keys?name=$SSH_KEY_NAME")"
if [ "$(printf '%s' "$keys" | jq '.ssh_keys | length')" -gt 0 ]; then
	key_id="$(printf '%s' "$keys" | jq -r '.ssh_keys[0].id')"
	ok "재사용" "$SSH_KEY_NAME (id $key_id)"
else
	key_id="$(api POST /ssh_keys "$(jq -n \
		--arg n "$SSH_KEY_NAME" --arg k "$(cat "$SSH_PUB")" \
		'{name:$n, public_key:$k}')" | jq -r '.ssh_key.id')"
	ok "등록" "$SSH_KEY_NAME (id $key_id)"
fi

# ---------------------------------------------------------------- 방화벽
say "방화벽"
fws="$(api GET "/firewalls?name=$FIREWALL_NAME")"
if [ "$(printf '%s' "$fws" | jq '.firewalls | length')" -gt 0 ]; then
	fw_id="$(printf '%s' "$fws" | jq -r '.firewalls[0].id')"
	ok "재사용" "$FIREWALL_NAME (id $fw_id)"
else
	# 80 을 여는 이유 — Caddy 가 인증서를 받을 때 HTTP-01 검증을 쓴다.
	# 443 만 열면 첫 발급이 실패한다.
	fw_id="$(api POST /firewalls "$(jq -n --arg n "$FIREWALL_NAME" '{
		name:$n,
		rules:[
			{direction:"in", protocol:"tcp", port:"22",  source_ips:["0.0.0.0/0","::/0"], description:"ssh"},
			{direction:"in", protocol:"tcp", port:"80",  source_ips:["0.0.0.0/0","::/0"], description:"http (ACME HTTP-01)"},
			{direction:"in", protocol:"tcp", port:"443", source_ips:["0.0.0.0/0","::/0"], description:"https"},
			{direction:"in", protocol:"icmp", source_ips:["0.0.0.0/0","::/0"], description:"ping"}
		]}')" | jq -r '.firewall.id')"
	ok "생성" "$FIREWALL_NAME (id $fw_id)"
fi

# ---------------------------------------------------------------- 서버
say "서버 생성"
created="$(api POST /servers "$(jq -n \
	--arg n "$NAME" --arg t "$TYPE" --arg i "$IMAGE" --arg l "$LOCATION" \
	--argjson k "$key_id" --argjson f "$fw_id" '{
		name:$n, server_type:$t, image:$i, location:$l,
		ssh_keys:[$k], firewalls:[{firewall:$f}],
		public_net:{enable_ipv4:true, enable_ipv6:true}
	}')")"
server_id="$(printf '%s' "$created" | jq -r '.server.id')"
ip="$(printf '%s' "$created" | jq -r '.server.public_net.ipv4.ip')"
ok "$NAME" "id $server_id, IP $ip"

# 부팅을 기다린다. 바로 ssh 를 걸면 아직 sshd 가 안 떠 있어 실패한다.
say "부팅 대기"
for _ in $(seq 1 60); do
	st="$(api GET "/servers/$server_id" | jq -r '.server.status')"
	[ "$st" = "running" ] && break
	sleep 5
done
ok "상태" "$st"

cat <<EOF

다음 단계

  1) DNS   dl.ailibrary.kr A 레코드를 $ip 로 변경
           (Caddy 가 인증서를 받으려면 이게 먼저입니다)

  2) 구축   ssh root@$ip
           git clone https://github.com/Suntae-Kim2020/dlc.git DLC
           cd DLC/digital-library && sudo ./deploy/install.sh

  3) 데이터 이전 뒤 배포 — 자세한 절차는 README 의 배포 절을 보세요.

EOF
