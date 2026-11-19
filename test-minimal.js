const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
});
server.listen(3001, () => {
  console.log('Test server listening on 3001');
});
setInterval(() => {}, 1000);
