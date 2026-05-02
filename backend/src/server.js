require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const app = require('./app');

const PORT = process.env.API_PORT || 4000;

app.listen(PORT, () => {
  console.log(`LAS API 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
