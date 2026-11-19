console.log('test');
const http = require('http');
const s = http.createServer((req, res) => { res.end('ok') });
s.listen(3000, () => console.log('listening'));
setTimeout(() => { console.log('timeout'); process.exit(0) }, 5000);
