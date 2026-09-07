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
#   - 스키마 적재:  database/schema.sql 등 (아래 "데이터베이스" 절 참고)
#   - 방화벽 개방:  TCP 443, 권장 80
#
# 여러 번 실행해도 안전하다. 이미 있는 것은 건너뛴다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/deploy"
DOMAIN="dl.ailibrary.kr"
# 서비스를 돌릴 계정. sudo 로 부르면 부른 사람이 되고, root 로 직접 부르는
# 서버(헤츠너처럼 일반 계정이 없는 곳)에서는 DL_APP_USER 로 지정해야 한다.
# 기본값을 두지 않는 이유 — 없는 계정 이름이 기본으로 박히면 chown 부터
# 실패하는데, 그때는 이미 패키지 설치가 절반쯤 끝나 있다.
APP_USER="${DL_APP_USER:-${SUDO_USER:-}}"

# 백업 목적지. 마운트된 별도 디스크를 전제한다(backup.sh 주석 참고).
BACKUP_DEST="${DL_BACKUP_DEST:-/media/user/df9db4f3-386b-4bd4-b1bf-fcebb530b180/dl-backup}"
BACKUP_MOUNT="$(dirname "$BACKUP_DEST")"

RUNTIME="$ROOT/.runtime"
OPT="/opt/dl"

NODE_VER="20.20.2"     # 백엔드가 검증된 계열
ES_VER="8.19.15"       # nori 플러그인이 함께 제공되는 8.19 계열
ES_HEAP="${DL_ES_HEAP:-512m}"   # 자료가 늘면 키운다
FUSEKI_VER="4.10.0"
BASEX_VER="11.9"
BASEX_ZIP="BaseX119.zip"

if [ "$EUID" -ne 0 ]; then
	echo "root 로 실행하세요:  sudo $0" >&2
	exit 1
fi

# 계정이 실제로 있는지 여기서 막는다. Elasticsearch 는 root 로는 아예 뜨지
# 않으므로 root 도 거른다 — 나중에 알면 원인 찾기가 훨씬 어렵다.
if [ -z "$APP_USER" ] || [ "$APP_USER" = "root" ] || ! id "$APP_USER" >/dev/null 2>&1; then
	cat >&2 <<EOF

[중단] 서비스를 돌릴 일반 계정을 정하지 못했습니다. (지금 값: "${APP_USER:-없음}")

  sudo 로 부르셨다면 부른 계정이 자동으로 쓰입니다.
  root 로 로그인하는 서버라면 계정을 만들고 지정하세요:

    adduser --disabled-password --gecos "" dl
    DL_APP_USER=dl $0

  root 로는 돌리지 않습니다. Elasticsearch 가 root 실행을 거부합니다.

EOF
	exit 1
fi

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok() { printf '  %-14s %s\n' "$1" "$2"; }

# 유닛 파일은 __ROOT__ 를 플레이스홀더로 둔다. 프로젝트 폴더를 옮기거나 이름을
# 바꿔도 다시 설치하기만 하면 경로가 맞는다.
render_unit() {
	sed -e "s|__ROOT__|$ROOT|g" \
	    -e "s|__APP_USER__|$APP_USER|g" \
	    -e "s|__BACKUP_DEST__|$BACKUP_DEST|g" \
	    -e "s|__BACKUP_MOUNT__|$BACKUP_MOUNT|g" \
	    "$DEPLOY/$1" >"/etc/systemd/system/$1"
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

# 프론트엔드 빌드 설정도 여기서 막는다. 이 파일이 없으면 빌드가 실패하지 않고
# API 주소가 기본값(http://localhost:4000)으로 박힌 채 완성된다. 설치는 끝까지
# 성공하고 정적 파일도 배포되지만, 브라우저가 자기 PC 로 API 를 부르게 되어
# 화면에서 네트워크 오류만 난다. 실제로 이렇게 한 번 나갔다.
if [ ! -f "$ROOT/frontend/.env.production" ]; then
	cat >&2 <<EOF

[중단] frontend/.env.production 이 없습니다.

  없이 빌드하면 API 주소가 http://localhost:4000 으로 박혀서, 화면은 뜨는데
  모든 요청이 실패합니다. gitignore 대상이라 clone 에는 들어오지 않습니다.

  운영 서버라면 이렇게 만드세요:

    cat > "$ROOT/frontend/.env.production" <<'ENV'
    VITE_API_BASE_URL=https://$DOMAIN
    VITE_READ_ONLY=true
    ENV

EOF
	exit 1
fi
ok "빌드 설정" "frontend/.env.production 있음"

# 이 머신이 바깥으로 나가는 인터페이스의 주소. 공인 IP 가 NIC 에 직접 붙어 있는
# 구성이라 이 값이 곧 서비스 주소가 된다. 유동 IP 라 바뀔 수 있어 매번 찾는다.
DEFAULT_IF="$(ip route show default | awk '{print $5; exit}')"
BIND_ADDR="$(ip -4 -o addr show "$DEFAULT_IF" | awk '{print $4}' | cut -d/ -f1 | head -1)"
if [ -z "$BIND_ADDR" ]; then
	echo "❌ $DEFAULT_IF 에서 IPv4 주소를 찾지 못했습니다." >&2
	exit 1
fi
ok "이 머신" "$BIND_ADDR ($DEFAULT_IF)"

# 공인 주소. NAT 뒤(GCP 등)에서는 NIC 에 사설 주소만 붙고 공인 주소는 밖에
# 있으므로, NIC 주소로 DNS 를 비교하면 항상 어긋난다고 나온다. 메타데이터
# 서비스가 있으면 그쪽을 믿고, 없으면 NIC 주소가 곧 공인 주소인 구성으로 본다.
# (바인딩은 그대로 BIND_ADDR 로 한다 — NAT 뒤에서는 사설 주소로 받아야 한다.)
PUBLIC_ADDR="$(curl -fsS -m 2 -H 'Metadata-Flavor: Google' \
	http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)"
if [ -n "$PUBLIC_ADDR" ] && [ "$PUBLIC_ADDR" != "$BIND_ADDR" ]; then
	ok "공인 주소" "$PUBLIC_ADDR (NAT)"
else
	PUBLIC_ADDR="$BIND_ADDR"
fi

# 확인 질문에 미리 답해 둔다. 원격에서 비대화식으로 돌릴 때 필요하다.
confirm() { # confirm <질문>
	if [ "${DL_ASSUME_YES:-}" = "1" ]; then
		echo "  $1 [DL_ASSUME_YES=1 로 계속]"
		return 0
	fi
	local go
	read -rp "  $1 [y/N] " go
	[ "$go" = "y" ]
}

resolved="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$resolved" ]; then
	echo "  ⚠️  $DOMAIN 이 아직 DNS 에 없습니다."
	confirm "그래도 계속할까요?" || exit 1
elif [ "$resolved" != "$PUBLIC_ADDR" ]; then
	# 레코드가 있는지만 보고 넘어가면, 회선 IP 가 바뀐 걸 모른 채 배포했다가
	# 인증서 발급만 반복해서 실패한다. 한도에 걸리기 전에 여기서 잡는다.
	echo "  ⚠️  DNS 가 다른 주소를 가리킵니다."
	echo "     $DOMAIN -> $resolved   (이 머신은 $PUBLIC_ADDR)"
	echo "     이대로 진행하면 Caddy 가 인증서를 받지 못합니다."
	echo "     설치를 먼저 끝내고 DNS 를 바꾸는 순서라면 계속해도 됩니다."
	confirm "계속할까요?" || exit 1
else
	ok "DNS" "$DOMAIN -> $resolved (일치)"
fi

# 개발용으로 띄워 둔 인스턴스가 포트를 잡고 있으면 서비스가 못 뜬다.
#
# 경고만 하고 넘어가면 안 된다. 실제로 그렇게 해 봤더니, 설치는 "성공"으로
# 끝나고 서비스 넷은 조용히 재시작만 반복하는데 Caddy 는 그 포트를 물고 있는
# 개발용 프로세스로 요청을 넘겨서, 공개 주소가 임시 디렉터리의 프로세스로
# 서비스되는 상태가 됐다. 겉으로는 200 이 떠서 알아채기까지 시간이 걸린다.
# 그리고 apt 가 PostgreSQL 을 올릴 때 5432 가 잡혀 있으면 클러스터가 5433 에
# 생기는데, .env 는 5432 를 보므로 백엔드만 연결에 실패한다.
BUSY=""
for p in 4000 9200 3030 8984 5432; do
	ss -tln 2>/dev/null | grep -qE "[:.]$p\s" || continue

	# 5432 는 정상 설치된 서버에서 시스템 PostgreSQL 이 늘 잡고 있다. 그것까지
	# 막으면 멀쩡한 서버에서 재설치를 못 한다. 우리 클러스터가 아닐 때만 따진다.
	if [ "$p" = 5432 ] && pg_lsclusters -h 2>/dev/null | awk '$3==5432 && $4=="online"' | grep -q .; then
		ok "포트 5432" "시스템 PostgreSQL (정상)"
		continue
	fi

	holder="$(ss -tlnp 2>/dev/null | grep -E "[:.]$p\s" | grep -oE 'users:\(\("[^"]+"' | head -1 | sed 's/.*"//')"
	echo "  ❌ 포트 $p 사용 중 (${holder:-?})"
	BUSY="$BUSY $p"
done
if [ -n "$BUSY" ]; then
	cat >&2 <<EOF

포트가 비어 있어야 설치할 수 있습니다:$BUSY

  이미 dl-* 서비스가 돌고 있는 상태에서 다시 설치하는 것이라면:
      sudo systemctl stop dl-backend dl-elasticsearch dl-fuseki dl-basex
      sudo $0

  개발용으로 띄워 둔 것이라면 무엇이 잡고 있는지 확인하세요:
      ss -tlnp | grep -E "$(echo "$BUSY" | tr ' ' '|' | sed 's/^|//')"
EOF
	exit 1
fi

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

# 설치 시점에 5432 가 잡혀 있었다면 클러스터가 5433 에 만들어진다. backend/.env
# 는 5432 를 보므로 그대로 두면 백엔드만 ECONNREFUSED 로 죽는다. 위 포트 검사가
# 그 상황을 막지만, 예전에 그렇게 만들어진 클러스터가 남아 있을 수 있다.
PG_PORT="$(pg_conftool "$(pg_lsclusters -h | awk 'NR==1{print $1}')" main show port 2>/dev/null | awk '{print $3}')"
if [ -n "$PG_PORT" ] && [ "$PG_PORT" != "5432" ]; then
	echo "  클러스터가 $PG_PORT 에 있습니다 — 5432 로 옮깁니다."
	pg_conftool "$(pg_lsclusters -h | awk 'NR==1{print $1}')" main set port 5432
	systemctl restart postgresql
fi
ok "postgresql" "$(sudo -u postgres psql -Atc 'show server_version' 2>/dev/null || echo '?') (포트 $(pg_conftool "$(pg_lsclusters -h | awk 'NR==1{print $1}')" main show port | awk '{print $3}'))"

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
# 인증을 끄는 대신 루프백에만 묶는 구성. 백엔드 외에는 접근할 일이 없다.
xpack.security.enabled: false
EOF

# 힙을 고정한다. 지정하지 않으면 ES 가 머신 메모리의 절반을 잡는데, 이 스택은
# ES 말고도 Fuseki·BaseX·PostgreSQL 이 같이 올라가므로 작은 머신에서는 그대로
# 두면 서로 밀어낸다. 실측(서지 30건 규모)으로 512m 면 충분하다.
mkdir -p "$OPT/elasticsearch/config/jvm.options.d"
cat >"$OPT/elasticsearch/config/jvm.options.d/heap.options" <<EOF
-Xms$ES_HEAP
-Xmx$ES_HEAP
EOF
ok "ES 힙" "$ES_HEAP (DL_ES_HEAP 로 변경)"

fetch_into "https://archive.apache.org/dist/jena/binaries/apache-jena-fuseki-$FUSEKI_VER.tar.gz" \
	"$OPT/fuseki" "apache-jena-fuseki-$FUSEKI_VER"
mkdir -p "$OPT/fuseki/base" "$OPT/fuseki/databases/digital-library"

fetch_into "https://files.basex.org/releases/$BASEX_VER/$BASEX_ZIP" "$OPT/basex" "basex"
# BaseX 도 기본값은 0.0.0.0 이다. Jetty 커넥터에 host 를 박아 루프백으로 묶는다.
JETTY="$OPT/basex/webapp/WEB-INF/jetty.xml"
if [ -f "$JETTY" ] && ! grep -q '"host"' "$JETTY"; then
	sed -i 's|<Set name="port">|<Set name="host">127.0.0.1</Set>\n      <Set name="port">|' "$JETTY"
fi

# 소유권을 먼저 넘긴다. 아래 ALTER PASSWORD 가 users.xml 을 쓰는데, root 소유인
# 채로 두면 그 쓰기가 실패한다. 처음엔 그 실패를 || true 로 삼키게 해 뒀다가,
# 설치는 멀쩡히 끝나고 pg-to-basex.js 만 401 로 죽는 상황을 만들었다.
chown -R "$APP_USER:$APP_USER" "$OPT"

# 백엔드 .env 가 admin/admin 을 기대한다. BaseX 는 users.xml 이 없으면 접속을
# 전부 401 로 막는다. 반드시 서버가 떠 있지 않을 때 실행해야 한다 — 떠 있으면
# 종료할 때 자기 메모리 상태로 users.xml 을 덮어써서 이 설정이 사라진다.
systemctl stop dl-basex 2>/dev/null || true
if ! sudo -u "$APP_USER" "$OPT/basex/bin/basex" -c "ALTER PASSWORD admin admin" >/dev/null 2>&1; then
	echo "❌ BaseX 관리자 비밀번호 설정에 실패했습니다." >&2
	echo "   $OPT/basex 쓰기 권한을 확인하세요." >&2
	exit 1
fi
[ -f "$OPT/basex/data/users.xml" ] || {
	echo "❌ BaseX users.xml 이 만들어지지 않았습니다." >&2
	exit 1
}
chown "$APP_USER:$APP_USER" "$OPT/basex/data/users.xml"
ok "저장소" "$OPT 준비 완료 (BaseX 계정 설정됨)"

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
# 빈 DB 를 그냥 두면 백엔드는 뜨는데 모든 조회가 500 이 된다. 이미 데이터가
# 있으면 건드리지 않는다 — 재실행이 운영 데이터를 지우면 안 된다.
#
# 적재는 postgres 슈퍼유저가 아니라 앱 계정으로 한다. 슈퍼유저로 만들면
# 테이블 소유자가 postgres 가 되고, 백엔드는 dluser 로 붙으므로 모든 쓰기가
# permission denied 로 막힌다.
app_psql() { PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" "$@"; }

# 접속부터 확인한다. 아래 판정은 "빈 문자열이면 테이블 없음"인데, 접속 자체가
# 실패해도 결과가 빈 문자열이다. 그대로 두면 접속 불가를 빈 DB 로 착각해서
# 적재를 시도하고, 한 파일도 못 넣은 채 "적재 완료 (0건)" 이라고 보고한다.
if ! app_psql -Atc "SELECT 1" >/dev/null 2>&1; then
	echo "❌ $DB_NAME 에 $DB_USER 로 접속할 수 없습니다." >&2
	echo "   backend/.env 의 DB_* 값과 pg_hba.conf 를 확인하세요." >&2
	exit 1
fi

if [ -z "$(app_psql -Atc "SELECT to_regclass('public.bib_records')")" ]; then
	echo "     비어 있는 DB 입니다 — 스키마와 샘플 데이터를 넣습니다."
	for f in schema.sql sample_data.sql lsp_schema.sql lsp_sample_data.sql \
		migrations/001_eresources.sql migrations/002_oai_harvests.sql \
		migrations/003_more_sample_data.sql add_indexes.sql; do
		app_psql -q -v ON_ERROR_STOP=1 -f "$ROOT/database/$f" >/dev/null
	done
	ok "스키마" "적재 완료 ($(app_psql -Atc 'select count(*) from bib_records') 건)"
else
	ok "스키마" "이미 있음 ($(app_psql -Atc 'select count(*) from bib_records') 건) — 건너뜀"
fi

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
# 443 을 독차지하는 전용 서버가 기본이다. 공유 머신이면 DL_CADDY_BIND 에
# 묶을 주소를 준다(보통 이 머신의 NIC 주소).
if [ -n "${DL_CADDY_BIND:-}" ]; then
	BIND_DIRECTIVE="bind $DL_CADDY_BIND"
else
	BIND_DIRECTIVE="# bind — 이 머신은 443 을 독차지하므로 묶지 않는다"
fi
sed -e "s|__BIND_DIRECTIVE__|$BIND_DIRECTIVE|g" -e "s|__ROOT__|$ROOT|g" "$DEPLOY/Caddyfile" >>"$CADDY_TMP"
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

설치가 끝났습니다.

  1) DNS:   $DOMAIN A 레코드가 $PUBLIC_ADDR 를 가리켜야 합니다
            (지금은 ${resolved:-없음})
  2) 확인:  curl -I https://$DOMAIN

  검색·RDF·XML 저장소는 아직 비어 있습니다. PostgreSQL 기준으로 채웁니다:
      node tools/create-es-index.js && node tools/pg-to-es.js
      node tools/pg-to-fuseki.js && node tools/pg-to-bibframe.js && node tools/add-sameAs.js
      node tools/pg-to-basex.js

  로그:  journalctl -u dl-backend -f
         tail -f /var/log/caddy/dl.log
  차단:  fail2ban-client status dl
  백업:  ./deploy/backup.sh --verify   ·   ./deploy/restore.sh
  재배포: ./deploy.sh
MSG
