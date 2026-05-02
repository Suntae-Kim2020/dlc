const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');

// 백엔드(backend/src/)에서 본 수확기 위치
const HARVESTER_PATH = path.resolve(
  __dirname,
  '../../tools/oai-harvester.js',
);
const SCHEDULE = '0 3 * * *'; // 매일 03:00
const TIMEZONE = 'Asia/Seoul';

// 수확기 실행 — 자식 프로세스로 분리해 백엔드 이벤트 루프와 격리.
// (수확기는 process.exit를 호출할 수 있으므로 require로 끌어오지 않는다.)
function runHarvester() {
  const startedAt = new Date().toISOString();
  console.log(`[scheduler] OAI 수확 시작: ${startedAt}`);

  let child;
  try {
    child = spawn(process.execPath, [HARVESTER_PATH], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error(`[scheduler] 자식 프로세스 spawn 실패: ${err.message}`);
    return;
  }

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[harvester] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[harvester:err] ${chunk}`);
  });

  child.on('error', (err) => {
    console.error(`[scheduler] 자식 프로세스 오류: ${err.message}`);
  });

  child.on('exit', (code, signal) => {
    const finishedAt = new Date().toISOString();
    if (code === 0) {
      console.log(`[scheduler] OAI 수확 완료: ${finishedAt} (exit 0)`);
    } else {
      console.error(
        `[scheduler] OAI 수확 실패: ${finishedAt} ` +
          `(exit ${code}${signal ? `, signal ${signal}` : ''})`,
      );
    }
  });
}

function startScheduler() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[scheduler] 잘못된 cron 표현식: ${SCHEDULE}`);
    return;
  }
  cron.schedule(SCHEDULE, runHarvester, { timezone: TIMEZONE });
  console.log(
    `[scheduler] 시작 — 스케줄 '${SCHEDULE}' (${TIMEZONE}), ` +
      `대상 ${HARVESTER_PATH}`,
  );
}

module.exports = { startScheduler, runHarvester };
