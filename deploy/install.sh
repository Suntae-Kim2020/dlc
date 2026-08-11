#!/usr/bin/env bash
# DLC(디지털도서관) 운영 배포 설치. root 권한이 필요하다.
#
#   sudo ./deploy/install.sh
#
# 하는 일
#   1. 런타임 설치 — Node 20, PostgreSQL 16, Elasticsearch+nori, Fuseki, BaseX
#   2. 리버스 프록시 설정 배치 (dl.ailibrary.kr -> 정적 파일 + 127.0.0.1:4000)
#   3. systemd 서비스 등록 (재부팅 시 자동 시작, 실패 시 재시작)
#   4. fail2ban 규칙 배치
#
# 하지 않는 일 — 따로 챙겨야 한다
#   - DNS A 레코드: dl.ailibrary.kr -> 이 머신의 공인 IP
#     (지금은 헤츠너 204.168.215.242 를 가리키고 있다)
#   - 데이터 이전:  ./deploy/migrate-from-hetzner.sh
#   - 방화벽 개방:  TCP 443, 권장 80
#
# 여러 번 실행해도 안전하다. 이미 있는 것은 건너뛴다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/deploy"
DOMAIN="dl.ailibrary.kr"
APP_USER="${SUDO_USER:-user}"

RUNTIME="$ROOT/.runtime"
OPT="/opt/dl"

NODE_VER="20.20.2"     # 헤츠너와 같은 계열
ES_VER="8.19.15"       # 헤츠너와 동일 버전
FUSEKI_VER="4.10.0"
BASEX_VER="11.9"
BASEX_ZIP="BaseX119.zip"

if [ "$EUID" -ne 0 ]; then
	echo "root 로 실행하세요:  sudo $0" >&2
	exit 1
fi

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok() { printf '  %-14s %s\n' "$1" "$2"; }

# 유닛 파일은 __ROOT__ 를 플레이스홀더로 둔다. 프로젝트 폴더를 옮기거나 이름을
# 바꿔도 다시 설치하기만 하면 경로가 맞는다.
render_unit() {
	sed "s|__ROOT__|$ROOT|g" "$DEPLOY/$1" >"/etc/systemd/system/$1"
	chmod 644 "/etc/systemd/system/$1"
}

# 받아서 풀기. 이미 목적지가 있으면 건너뛴다.
fetch_into() { # fetch_into <url> <목적지> <풀고 나서 생기는 최상위 디렉토리명>
	local url="$1" dest="$2" top="$3" tmp
	if [ -d "$dest" ]; then
		ok "$(basename "$dest")" "이미 설치됨"
		return
	fi
	tmp="$(mktemp -d)"
	echo "  $(basename "$dest") 내려받는 중..."
	case "$url" in
	*.zip) curl -fsSL -o "$tmp/a.zip" "$url" && unzip -q "$tmp/a.zip" -d "$tmp" ;;
	*.tar.xz) curl -fsSL -o "$tmp/a.txz" "$url" && tar -xf "$tmp/a.txz" -C "$tmp" ;;
	*) curl -fsSL -o "$tmp/a.tgz" "$url" && tar -xzf "$tmp/a.tgz" -C "$tmp" ;;
	esac
	mkdir -p "$(dirname "$dest")"
	mv "$tmp/$top" "$dest"
	rm -rf "$tmp"
	ok "$(basename "$dest")" "설치 완료"
}

# ---------------------------------------------------------------- 사전 확인
say "사전 확인"

ok "프로젝트" "$ROOT"
ok "실행 계정" "$APP_USER"

if [ ! -f "$ROOT/backend/.env" ]; then
	echo "❌ backend/.env 가 없습니다. .env.example 을 복사해 채우세요." >&2
	exit 1
fi
ok ".env" "있음"

# 이 머신이 바깥으로 나가는 인터페이스의 주소. 공인 IP 가 NIC 에 직접 붙어 있는
# 구성이라 이 값이 곧 서비스 주소가 된다. 유동 IP 라 바뀔 수 있어 매번 찾는다.
DEFAULT_IF="$(ip route show default | awk '{print $5; exit}')"
BIND_ADDR="$(ip -4 -o addr show "$DEFAULT_IF" | awk '{print $4}' | cut -d/ -f1 | head -1)"
if [ -z "$BIND_ADDR" ]; then
	echo "❌ $DEFAULT_IF 에서 IPv4 주소를 찾지 못했습니다." >&2
	exit 1
fi
ok "이 머신" "$BIND_ADDR ($DEFAULT_IF)"

resolved="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$resolved" ]; then
	echo "  ⚠️  $DOMAIN 이 아직 DNS 에 없습니다."
	read -rp "  그래도 계속할까요? [y/N] " go
	[ "$go" = "y" ] || exit 1
elif [ "$resolved" != "$BIND_ADDR" ]; then
	# 레코드가 있는지만 보고 넘어가면, 아직 헤츠너를 가리키는 채로 배포했다가
	# 인증서 발급만 반복해서 실패한다. 한도에 걸리기 전에 여기서 잡는다.
	echo "  ⚠️  DNS 가 다른 주소를 가리킵니다."
	echo "     $DOMAIN -> $resolved   (이 머신은 $BIND_ADDR)"
	echo "     이대로 진행하면 Caddy 가 인증서를 받지 못합니다."
	echo "     설치를 먼저 끝내고 DNS 를 바꾸는 순서라면 계속해도 됩니다."
	read -rp "  계속할까요? [y/N] " go
	[ "$go" = "y" ] || exit 1
else
	ok "DNS" "$DOMAIN -> $resolved (일치)"
fi

# 개발용으로 띄워 둔 인스턴스가 포트를 잡고 있으면 서비스가 못 뜬다.
for p in 4000 9200 3030 8984 5432; do
	if ss -tln 2>/dev/null | grep -qE "[:.]$p\s"; then
		holder="$(ss -tlnp 2>/dev/null | grep -E "[:.]$p\s" | grep -oE 'users:\(\("[^"]+"' | head -1 | sed 's/.*"//')"
		echo "  ⚠️  포트 $p 를 이미 누가 쓰고 있습니다 (${holder:-?})."
		echo "     개발용으로 띄워 둔 것이면 먼저 정리하세요."
	fi
done

# ---------------------------------------------------------------- 런타임
say "런타임 설치"

export DEBIAN_FRONTEND=noninteractive

command -v unzip >/dev/null || apt-get install -y unzip
command -v rsync >/dev/null || apt-get install -y rsync
command -v java >/dev/null || apt-get install -y openjdk-21-jre-headless
ok "java" "$(java -version 2>&1 | head -1)"

# Node 는 프로젝트 안에 둔다. 이 머신은 여러 프로젝트가 함께 쓰고 있어서
# 시스템 전역 Node 버전을 하나로 고정하면 서로 발목을 잡는다. (TEED 와 같은 방식)
mkdir -p "$RUNTIME"
fetch_into "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-linux-x64.tar.xz" \
	"$RUNTIME/node" "node-v$NODE_VER-linux-x64"
chown -R "$APP_USER:$APP_USER" "$RUNTIME"
ok "node" "$("$RUNTIME/node/bin/node" -v)"

if ! command -v psql >/dev/null; then
	apt-get install -y postgresql postgresql-contrib
fi
systemctl enable --now postgresql
ok "postgresql" "$(sudo -u postgres psql -Atc 'show server_version' 2>/dev/null || echo '?')"

command -v caddy >/dev/null || {
	apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
		gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
		tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
	apt-get update && apt-get install -y caddy
}
ok "caddy" "$(caddy version | head -1)"

command -v fail2ban-server >/dev/null || apt-get install -y fail2ban
ok "fail2ban" "준비됨"

# ---------------------------------------------------------------- 사이드카
say "검색·RDF·XML 저장소"

mkdir -p "$OPT"

fetch_into "https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-$ES_VER-linux-x86_64.tar.gz" \
	"$OPT/elasticsearch" "elasticsearch-$ES_VER"
if ! "$OPT/elasticsearch/bin/elasticsearch-plugin" list 2>/dev/null | grep -q analysis-nori; then
	ES_JAVA_HOME="$OPT/elasticsearch/jdk" "$OPT/elasticsearch/bin/elasticsearch-plugin" install --batch analysis-nori
fi
ok "nori" "설치됨"
# 설정은 덧붙이지 않고 매번 새로 쓴다. 재실행할 때마다 같은 줄이 쌓이면
# ES 가 중복 키로 뜨지 못한다.
cat >"$OPT/elasticsearch/config/elasticsearch.yml" <<EOF
cluster.name: dl-cluster
discovery.type: single-node
# 이 머신은 공인 IP 를 직접 물고 있다. 0.0.0.0 으로 두면 인증 없는 ES 가
# 그대로 바깥에 열린다. 백엔드만 쓰므로 루프백이면 충분하다.
network.host: 127.0.0.1
http.port: 9200
# 인증을 끄는 대신 루프백에만 묶는 구성. 헤츠너와 동일하다.
xpack.security.enabled: false
EOF

fetch_into "https://archive.apache.org/dist/jena/binaries/apache-jena-fuseki-$FUSEKI_VER.tar.gz" \
	"$OPT/fuseki" "apache-jena-fuseki-$FUSEKI_VER"
mkdir -p "$OPT/fuseki/base" "$OPT/fuseki/databases/digital-library"

fetch_into "https://files.basex.org/releases/$BASEX_VER/$BASEX_ZIP" "$OPT/basex" "basex"
# BaseX 도 기본값은 0.0.0.0 이다. Jetty 커넥터에 host 를 박아 루프백으로 묶는다.
JETTY="$OPT/basex/webapp/WEB-INF/jetty.xml"
if [ -f "$JETTY" ] && ! grep -q '"host"' "$JETTY"; then
	sed -i 's|<Set name="port">|<Set name="host">127.0.0.1</Set>\n      <Set name="port">|' "$JETTY"
fi
# 백엔드 .env 가 admin/admin 을 기대한다. BaseX 는 최초 기동 때 계정을 만든다.
sudo -u "$APP_USER" "$OPT/basex/bin/basex" -c "ALTER PASSWORD admin admin" >/dev/null 2>&1 || true

chown -R "$APP_USER:$APP_USER" "$OPT"
ok "저장소" "$OPT 준비 완료"

# ---------------------------------------------------------------- 데이터베이스
say "데이터베이스"

DB_NAME="$(grep -E '^DB_NAME=' "$ROOT/backend/.env" | cut -d= -f2-)"
DB_USER="$(grep -E '^DB_USER=' "$ROOT/backend/.env" | cut -d= -f2-)"
DB_PASS="$(grep -E '^DB_PASSWORD=' "$ROOT/backend/.env" | cut -d= -f2-)"

sudo -u postgres psql -Atc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 ||
	sudo -u postgres psql -q -c "CREATE USER \"$DB_USER\" WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -Atc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 ||
	sudo -u postgres psql -q -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
sudo -u postgres psql -d "$DB_NAME" -q -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
ok "$DB_NAME" "준비됨 (소유자 $DB_USER)"
echo "     스키마·데이터 적재는 ./deploy/migrate-from-hetzner.sh 가 담당합니다."

# ---------------------------------------------------------------- 애플리케이션
say "의존성 · 프론트엔드 빌드"

export PATH="$RUNTIME/node/bin:$PATH"
sudo -u "$APP_USER" env PATH="$PATH" bash -c "cd '$ROOT/backend'  && npm ci --omit=dev --no-audit --no-fund" >/dev/null
sudo -u "$APP_USER" env PATH="$PATH" bash -c "cd '$ROOT/frontend' && npm ci --no-audit --no-fund" >/dev/null
sudo -u "$APP_USER" env PATH="$PATH" bash -c "cd '$ROOT/tools'    && npm ci --no-audit --no-fund" >/dev/null 2>&1 || true
ok "의존성" "설치 완료"

sudo -u "$APP_USER" env PATH="$PATH" bash -c "cd '$ROOT/frontend' && npm run build" >/dev/null
ok "프론트엔드" "빌드 완료 ($(du -sh "$ROOT/frontend/dist" | cut -f1))"

# 빌드 결과물을 /var/www/dl 로 옮긴다. 이유는 Caddyfile 주석 참고.
# --delete 로 지난 빌드의 해시 파일이 쌓이지 않게 한다.
install -d -m 755 /var/www/dl
rsync -a --delete "$ROOT/frontend/dist/" /var/www/dl/
chown -R root:root /var/www/dl
chmod -R a+rX /var/www/dl
ok "정적 파일" "/var/www/dl 로 복사"

# ---------------------------------------------------------------- 설정 배치
say "리버스 프록시 설정"

install -d -o caddy -g caddy /var/log/caddy
[ -f /etc/caddy/Caddyfile ] && cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)"

# 이 머신에는 teed·humanoidrobot·kisti·kistep 이 이미 살고 있다. 통째로
# 덮어쓰면 그것들이 죽는다. dl 블록만 갈아 끼운다.
CADDY_TMP="$(mktemp)"
if [ -f /etc/caddy/Caddyfile ]; then
	# 우리가 지난번에 넣은 구간을 센티널로 들어낸다. 중괄호 깊이만으로 지우면
	# 블록 앞의 주석 헤더가 남아서, 재실행할 때마다 같은 주석이 쌓인다.
	awk '
		/^# >>> DLC BEGIN/ { skip=1; next }
		/^# <<< DLC END/   { skip=0; next }
		!skip              { print }
	' /etc/caddy/Caddyfile >"$CADDY_TMP"

	# 센티널 없이 손으로 넣은 dl 블록이 있다면 그것도 걷어낸다(중괄호 깊이).
	if grep -qE "^$DOMAIN \{" "$CADDY_TMP"; then
		awk -v d="$DOMAIN" '
			$0 ~ "^"d" \\{" { skip=1; depth=1; next }
			skip { depth += gsub(/\{/,"{") - gsub(/\}/,"}"); if (depth<=0) skip=0; next }
			{ print }
		' "$CADDY_TMP" >"$CADDY_TMP.2" && mv "$CADDY_TMP.2" "$CADDY_TMP"
	fi
fi
sed -e "s|__BIND_ADDR__|$BIND_ADDR|g" -e "s|__ROOT__|$ROOT|g" "$DEPLOY/Caddyfile" >>"$CADDY_TMP"
install -m 644 "$CADDY_TMP" /etc/caddy/Caddyfile
rm -f "$CADDY_TMP"

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
ok "Caddyfile" "검증 통과"

# validate 는 root 로 도는데, 그 과정에서 로그 파일을 실제로 열어 본다. 그래서
# dl.log 가 root:root 0600 으로 생겨 버린다. 그대로 두면 caddy 사용자로 뜨는
# 서비스가 그 파일을 못 열고 "permission denied" 로 죽는다.
chown -R caddy:caddy /var/log/caddy

say "systemd 서비스 등록"
for u in dl-elasticsearch.service dl-fuseki.service dl-basex.service dl-backend.service; do
	render_unit "$u"
done
systemctl daemon-reload
systemctl enable dl-elasticsearch dl-fuseki dl-basex dl-backend >/dev/null
ok "유닛" "4종 등록 (부팅 시 자동 시작)"

say "백업 타이머"
render_unit dl-backup.service
render_unit dl-backup.timer
systemctl daemon-reload
systemctl enable --now dl-backup.timer >/dev/null
ok "백업" "매일 04:30 (PostgreSQL 덤프)"

say "fail2ban 규칙"
install -m 644 "$DEPLOY/filter-dl.conf" /etc/fail2ban/filter.d/dl.conf
install -m 644 "$DEPLOY/jail-dl.conf" /etc/fail2ban/jail.d/dl.conf
ok "jail" "dl 배치 완료"

# ---------------------------------------------------------------- 기동
say "서비스 기동"

systemctl restart dl-elasticsearch dl-fuseki dl-basex
echo -n "  저장소 기동 대기"
for _ in $(seq 60); do
	if curl -sf --max-time 2 http://127.0.0.1:9200 >/dev/null 2>&1 &&
		curl -sf --max-time 2 "http://127.0.0.1:3030/\$/ping" >/dev/null 2>&1 &&
		curl -sf --max-time 2 -u admin:admin http://127.0.0.1:8984/rest >/dev/null 2>&1; then
		echo " — 완료"
		break
	fi
	echo -n "."
	sleep 2
done

systemctl restart dl-backend
sleep 5
systemctl reload caddy || systemctl restart caddy
systemctl restart fail2ban

# ---------------------------------------------------------------- 결과
say "상태"
for s in postgresql dl-elasticsearch dl-fuseki dl-basex dl-backend caddy fail2ban dl-backup.timer; do
	printf '  %-18s %s\n' "$s" "$(systemctl is-active "$s")"
done

cat <<MSG

설치가 끝났습니다. 아직 데이터가 없습니다.

  1) 데이터 이전:  ./deploy/migrate-from-hetzner.sh
  2) DNS 전환:     $DOMAIN A 레코드를 $BIND_ADDR 로
                   (지금은 ${resolved:-없음})
  3) 확인:         curl -I https://$DOMAIN

  로그:  journalctl -u dl-backend -f
         tail -f /var/log/caddy/dl.log
  차단:  fail2ban-client status dl
  재배포: ./deploy.sh
MSG
